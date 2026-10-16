import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import {createModulrSentAccountingSchema,postModulrSentRun,reverseModulrReturnedPayment} from '../server/lib/modulr-sent-accounting.mjs';
const env={MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SENT_ACCOUNTING_ENABLED:'true',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'};
for(const [k,v] of Object.entries(env)) process.env[k]=v;
function fixture(count=2){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT,status TEXT,funding_status TEXT,total_amount REAL,item_count INTEGER,paid_at TEXT,reconciled_at TEXT);
 CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,driver_id INTEGER,net_amount REAL,amount REAL,fee REAL,type TEXT,status TEXT,paid_at TEXT,updated_at TEXT);
 CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider TEXT,environment TEXT,status TEXT,provider_status TEXT,confirmed_at TEXT,provider_transfer_id TEXT,amount_minor INTEGER,currency TEXT);
 CREATE TABLE modulr_payment_events(transfer_id TEXT,event_type TEXT,provider_reference TEXT,source TEXT);
 CREATE TABLE modulr_debit_evidence(transfer_id TEXT,provider_payment_id TEXT,amount_minor INTEGER,currency TEXT,evidence_status TEXT,provider_transaction_id TEXT,source_account_id TEXT);
 CREATE TABLE modulr_return_register(id TEXT PRIMARY KEY,transfer_id TEXT,original_payment_id TEXT);
 CREATE TABLE payout_confirmations(payout_id TEXT);
 CREATE TABLE driver_ledger(id TEXT PRIMARY KEY,driver_id INTEGER,entry_type TEXT,direction TEXT,amount REAL,fee_amount REAL,description TEXT,reference_id TEXT,status TEXT,created_at TEXT);
 CREATE UNIQUE INDEX uniq_payout ON driver_ledger(reference_id,entry_type) WHERE entry_type IN ('weekly_payout','early_payout');`);
 createModulrSentAccountingSchema(db);
 db.prepare('INSERT INTO payout_runs VALUES(?,?,?,?,?,?,?,?)').run('run1','modulr','processing','cleared',count*10,count,null,null);
 for(let i=1;i<=count;i++){
  db.prepare('INSERT INTO payouts VALUES(?,?,?,?,?,?,?,?,?,?)').run('p'+i,'run1',i,10,10,0,'weekly','batched',null,null);
  db.prepare('INSERT INTO payout_transfer_intents VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('t'+i,'p'+i,'run1','modulr','sandbox','confirmed','PROCESSED','2026-10-16','provider'+i,1000,'GBP');
  db.prepare('INSERT INTO modulr_payment_events VALUES(?,?,?,?)').run('t'+i,'confirmed','provider'+i,'modulr_api');
  db.prepare('INSERT INTO modulr_debit_evidence VALUES(?,?,?,?,?,?,?)').run('t'+i,'provider'+i,1000,'GBP','debit_observed','transaction'+i,'account1');
 }
 return db;
}
test('multi-driver run posts and closes atomically',()=>{const db=fixture();const r=postModulrSentRun(db,'run1');assert.equal(r.posted,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,2);assert.equal(db.prepare('SELECT status FROM payout_runs').get().status,'paid');});
test('replay does not double post',()=>{const db=fixture();postModulrSentRun(db,'run1');assert.throws(()=>postModulrSentRun(db,'run1'));assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,2);});
test('missing debit rolls back whole batch',()=>{const db=fixture();db.exec("DELETE FROM modulr_debit_evidence WHERE transfer_id='t2'");assert.throws(()=>postModulrSentRun(db,'run1'));assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,0);assert.equal(db.prepare('SELECT status FROM payouts LIMIT 1').get().status,'batched');});
test('provider unknown history blocks batch',()=>{const db=fixture();db.exec("INSERT INTO modulr_payment_events VALUES('t2','unknown',NULL,'modulr_api')");assert.throws(()=>postModulrSentRun(db,'run1'));});
test('fee scenario fails closed',()=>{const db=fixture();db.exec("UPDATE payouts SET fee=1 WHERE id='p1'");assert.throws(()=>postModulrSentRun(db,'run1'));});
test('registered return posts one independent reversal',()=>{const db=fixture();postModulrSentRun(db,'run1');db.exec("INSERT INTO modulr_return_register VALUES('return1','t1','provider1')");const r=reverseModulrReturnedPayment(db,'t1','return1');assert.equal(r.reversedMinor,1000);assert.equal(db.prepare("SELECT count(*) n FROM driver_ledger WHERE entry_type='modulr_return_reversal'").get().n,1);assert.throws(()=>reverseModulrReturnedPayment(db,'t1','return1'));});
test('incorrect return identity cannot reverse',()=>{const db=fixture();postModulrSentRun(db,'run1');db.exec("INSERT INTO modulr_return_register VALUES('return1','t1','other')");assert.throws(()=>reverseModulrReturnedPayment(db,'t1','return1'));assert.equal(db.prepare("SELECT count(*) n FROM driver_ledger WHERE entry_type='modulr_return_reversal'").get().n,0);});
test('disabled gate refuses accounting',()=>{const db=fixture();process.env.MODULR_SENT_ACCOUNTING_ENABLED='false';assert.throws(()=>postModulrSentRun(db,'run1'));process.env.MODULR_SENT_ACCOUNTING_ENABLED='true';});
test('file-backed database always rejected',()=>{const db=new DatabaseSync('/tmp/modulr-sent-accounting-safety-test.sqlite');try{assert.throws(()=>postModulrSentRun(db,'run1'));}finally{db.close();}});

test('explicit temporary persistent fixture survives restart and cannot repost',()=>{
 const target=path.join(os.tmpdir(),`faivopay-modulr-sandbox-fixture-${process.pid}-${Date.now()}.sqlite`);
 const memory=fixture(2);
 let db;
 try {
  db=new DatabaseSync(target);
  // Fixture tables are copied only from the synthetic in-memory schema.
  for(const row of memory.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) db.exec(row.sql);
  for(const row of memory.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name").all()) db.exec(row.sql);
  for(const row of memory.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   const cols=memory.prepare(`PRAGMA table_info(${row.name})`).all().map(c=>c.name);
   const stmt=db.prepare(`INSERT INTO ${row.name} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`);
   for(const item of memory.prepare(`SELECT * FROM ${row.name}`).all()) stmt.run(...cols.map(c=>item[c]));
  }
  process.env.MODULR_SENT_ACCOUNTING_FILE_FIXTURE_ENABLED='true';
  process.env.MODULR_SENT_ACCOUNTING_FIXTURE_DB=target;
  assert.equal(postModulrSentRun(db,'run1').posted,2);
  db.close();db=null;
  db=new DatabaseSync(target);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM modulr_sent_postings').get().n,2);
  assert.throws(()=>postModulrSentRun(db,'run1'));
  db.exec("INSERT INTO modulr_return_register VALUES('return1','t1','provider1')");
  assert.equal(reverseModulrReturnedPayment(db,'t1','return1').reversedMinor,1000);
  db.close();db=null;
  db=new DatabaseSync(target);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM driver_ledger WHERE entry_type='modulr_return_reversal'").get().n,1);
  assert.throws(()=>reverseModulrReturnedPayment(db,'t1','return1'));
 } finally {
  if(db)db.close();memory.close();
  delete process.env.MODULR_SENT_ACCOUNTING_FILE_FIXTURE_ENABLED;
  delete process.env.MODULR_SENT_ACCOUNTING_FIXTURE_DB;
  for(const suffix of ['','-wal','-shm'])try{fs.unlinkSync(target+suffix)}catch{}
 }
});
test('persistent fixture cannot be enabled without exact temporary file match',()=>{
 const db=new DatabaseSync(path.join(os.tmpdir(),`faivopay-modulr-sandbox-fixture-${process.pid}-guard.sqlite`));
 try{
  process.env.MODULR_SENT_ACCOUNTING_FILE_FIXTURE_ENABLED='true';
  process.env.MODULR_SENT_ACCOUNTING_FIXTURE_DB='/tmp/not-the-same.sqlite';
  assert.throws(()=>postModulrSentRun(db,'run1'),/fixture/);
 }finally{db.close();delete process.env.MODULR_SENT_ACCOUNTING_FILE_FIXTURE_ENABLED;delete process.env.MODULR_SENT_ACCOUNTING_FIXTURE_DB;try{fs.unlinkSync(path.join(os.tmpdir(),`faivopay-modulr-sandbox-fixture-${process.pid}-guard.sqlite`))}catch{}}
});
