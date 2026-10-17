import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {unlinkSync} from 'node:fs';
import {persistAuthenticatedModulrProcessed} from '../server/lib/modulr-durable-processed-status.mjs';
import {postModulrApplicationSentRun} from '../server/lib/modulr-application-posting.mjs';
import {createModulrApplicationReturnReviewSchema,reverseModulrApplicationReturn} from '../server/lib/modulr-application-return-reversal.mjs';

const flags={MODULR_APPLICATION_ACCOUNTING_ENABLED:'true',MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',MODULR_APPLICATION_ACCOUNTING_FILE_FIXTURE_ENABLED:'true'};
const seedSql=`
CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT,status TEXT,item_count INTEGER,total_amount REAL,provider_ref TEXT,paid_at TEXT,reconciled_at TEXT,released_at TEXT,funds_cleared_at TEXT,funding_status TEXT);
CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,driver_id INTEGER,type TEXT,status TEXT,paid_at TEXT,net_amount REAL,amount REAL,weekly_fee REAL DEFAULT 0,fee REAL DEFAULT 0,carried_charges REAL DEFAULT 0,updated_at TEXT);
CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT UNIQUE,payout_run_id TEXT,provider TEXT,environment TEXT,recipient_id TEXT,currency TEXT,amount_minor INTEGER,status TEXT,provider_status TEXT,provider_transfer_id TEXT,confirmed_at TEXT,updated_at TEXT);
CREATE TABLE driver_ledger(id TEXT PRIMARY KEY,driver_id INTEGER,entry_type TEXT,direction TEXT,amount REAL,fee_amount REAL,description TEXT,reference_id TEXT,status TEXT,created_at TEXT);
CREATE UNIQUE INDEX idx_ledger_payout ON driver_ledger(reference_id,entry_type) WHERE reference_id IS NOT NULL AND entry_type IN ('weekly_payout','early_payout','early_payout_fee');
CREATE TABLE payout_confirmations(payout_id TEXT);
CREATE TABLE autocab_adjustments(event_key TEXT UNIQUE,driver_id INTEGER,amount REAL,is_credit INTEGER,status TEXT,completed_at TEXT);
CREATE TABLE modulr_return_register(return_payment_id TEXT PRIMARY KEY,transfer_id TEXT,original_payment_id TEXT,return_amount_minor INTEGER,currency TEXT,provider_status TEXT,status TEXT);
CREATE TABLE modulr_payment_events(transfer_id TEXT,event_type TEXT,provider_reference TEXT,source TEXT);
CREATE TABLE modulr_debit_evidence(transfer_id TEXT,provider_payment_id TEXT,provider_transaction_id TEXT,source_account_id TEXT,amount_minor INTEGER,currency TEXT,evidence_status TEXT,observed_at TEXT);
INSERT INTO payout_runs VALUES('run_e2e','modulr','released',1,9,'funding_verified',NULL,NULL,'2026-10-16','2026-10-16','cleared');
INSERT INTO payouts VALUES('pay_e2e','run_e2e',7,'weekly','batched',NULL,9,9,0,0,0,NULL);
INSERT INTO payout_transfer_intents VALUES('intent_e2e','pay_e2e','run_e2e','modulr','sandbox','beneficiary_7','GBP',900,'submitted','SUBMITTED','provider_e2e',NULL,NULL);
`;
const provider=async()=>({status:200,json:async()=>({id:'provider_e2e',status:'PROCESSED',details:{sourceAccountId:'source_account',destination:{type:'BENEFICIARY',id:'beneficiary_7'},amount:9,currency:'GBP'}})});
function snapshot(db){return {payout:db.prepare('SELECT status,paid_at FROM payouts WHERE id=?').get('pay_e2e'),run:db.prepare('SELECT status,paid_at,reconciled_at FROM payout_runs WHERE id=?').get('run_e2e'), ledger:db.prepare('SELECT entry_type,direction,status,amount FROM driver_ledger ORDER BY entry_type').all()};}

test('file-backed full simulated Modulr lifecycle: authenticate, debit, SENT, restart, replay, reviewed return, restart', async()=>{
 const filename=join(tmpdir(),`faivopay-modulr-application-fixture-${randomUUID()}.sqlite`);
 const old=Object.fromEntries(Object.keys(flags).concat('MODULR_APPLICATION_ACCOUNTING_FIXTURE_DB').map(k=>[k,process.env[k]]));
 Object.assign(process.env,flags,{MODULR_APPLICATION_ACCOUNTING_FIXTURE_DB:filename});
 let db;
 try{
  db=new DatabaseSync(filename);db.exec(seedSql);createModulrApplicationReturnReviewSchema(db);
  const args=()=>({db,intentId:'intent_e2e',apiKey:'test-only',sourceAccountId:'source_account',fetchImpl:provider});
  const first=await persistAuthenticatedModulrProcessed(args());assert.equal(first.ok,true);assert.equal(first.changed,true);
  const replay=await persistAuthenticatedModulrProcessed(args());assert.equal(replay.changed,false);
  assert.equal(snapshot(db).payout.status,'batched');
  // A separate, independently obtained debit is required before SENT accounting.
  assert.throws(()=>postModulrApplicationSentRun(db,'run_e2e'),/blocked/i);
  db.prepare('INSERT INTO modulr_payment_events VALUES(?,?,?,?)').run('intent_e2e','confirmed','provider_e2e','modulr_api');
  db.prepare('INSERT INTO modulr_debit_evidence VALUES(?,?,?,?,?,?,?,?)').run('intent_e2e','provider_e2e','debit_e2e','source_account',900,'GBP','debit_observed','2026-10-16');
  const posted=postModulrApplicationSentRun(db,'run_e2e');assert.equal(posted.payoutStatus,'sent');
  assert.equal(snapshot(db).ledger.length,1);assert.equal(snapshot(db).payout.paid_at,null);
  db.close();db=undefined;
  db=new DatabaseSync(filename);
  assert.equal(snapshot(db).payout.status,'sent');
  assert.throws(()=>postModulrApplicationSentRun(db,'run_e2e'));
  assert.equal(snapshot(db).ledger.length,1);
  db.prepare('INSERT INTO modulr_return_register VALUES(?,?,?,?,?,?,?)').run('return_e2e','intent_e2e','provider_e2e',900,'GBP','RETURNED','manual_review');
  db.prepare('INSERT INTO modulr_application_return_reviews VALUES(?,?,?,?,?,?,?)').run('return_e2e','intent_e2e','operator','2026-10-17','independent_return_e2e',900,'bank_statement');
  const reversal=reverseModulrApplicationReturn(db,'return_e2e');assert.equal(reversal.automaticRetry,false);
  assert.equal(snapshot(db).payout.status,'returned');assert.equal(snapshot(db).payout.paid_at,null);
  db.close();db=undefined;db=new DatabaseSync(filename);
  assert.throws(()=>reverseModulrApplicationReturn(db,'return_e2e'),/already reversed/i);
  const end=snapshot(db);
  assert.equal(end.ledger.length,2);
  assert.equal(end.ledger.filter(r=>r.entry_type==='weekly_payout').length,1);
  assert.equal(end.ledger.filter(r=>r.entry_type==='modulr_return_reversal').length,1);
  assert.equal(end.run.paid_at,null);assert.equal(end.run.reconciled_at,null);
 }finally{
  try{db?.close()}catch{}
  for(const [key,value] of Object.entries(old)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  try{unlinkSync(filename)}catch{}
 }
});
