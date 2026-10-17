import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {postModulrApplicationSentRun} from '../server/lib/modulr-application-posting.mjs';

const flags = {
  MODULR_APPLICATION_ACCOUNTING_ENABLED:'true',MODULR_ENV:'sandbox',MODULR_ENABLED:'false',
  MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',
  PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',
  LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'
};
function withFlags(fn){const old=Object.fromEntries(Object.keys(flags).map(k=>[k,process.env[k]]));
  Object.assign(process.env,flags);
  try{return fn();}finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}
}
function fixture({fee=0,omitDebit=false,second=false}={}){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT,status TEXT,item_count INTEGER,total_amount REAL,
   provider_ref TEXT,paid_at TEXT,reconciled_at TEXT,released_at TEXT,funds_cleared_at TEXT,funding_status TEXT);
 CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,driver_id INTEGER,type TEXT,status TEXT,paid_at TEXT,
   net_amount REAL,amount REAL,weekly_fee REAL DEFAULT 0,fee REAL DEFAULT 0,carried_charges REAL DEFAULT 0,updated_at TEXT);
 CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT UNIQUE,payout_run_id TEXT,provider TEXT,
   environment TEXT,currency TEXT,amount_minor INTEGER,status TEXT,provider_status TEXT,provider_transfer_id TEXT,confirmed_at TEXT);
 CREATE TABLE driver_ledger(id TEXT PRIMARY KEY,driver_id INTEGER,entry_type TEXT,direction TEXT,amount REAL,
   fee_amount REAL,description TEXT,reference_id TEXT,status TEXT,created_at TEXT);
 CREATE UNIQUE INDEX idx_driver_ledger_unique_payout_event ON driver_ledger(reference_id,entry_type)
   WHERE reference_id IS NOT NULL AND entry_type IN ('weekly_payout','early_payout','early_payout_fee');
 CREATE TABLE payout_confirmations(payout_id TEXT);
 CREATE TABLE autocab_adjustments(event_key TEXT);
 CREATE TABLE modulr_return_register(transfer_id TEXT);
 CREATE TABLE modulr_payment_events(transfer_id TEXT,event_type TEXT,provider_reference TEXT,source TEXT);
 CREATE TABLE modulr_debit_evidence(transfer_id TEXT,provider_payment_id TEXT,provider_transaction_id TEXT,
   source_account_id TEXT,amount_minor INTEGER,currency TEXT,evidence_status TEXT,observed_at TEXT);
 `);
 const count=second?2:1;
 db.prepare(`INSERT INTO payout_runs(id,provider,status,item_count,total_amount,provider_ref,released_at,funds_cleared_at,funding_status)
  VALUES('run937','modulr','released',?,?, 'funding_1','2026-10-16','2026-10-16','cleared')`).run(count,count*9);
 for(let i=1;i<=count;i++){
  db.prepare(`INSERT INTO payouts(id,payout_run_id,driver_id,type,status,net_amount,amount,weekly_fee,fee,carried_charges)
   VALUES(?,'run937',?,'weekly','batched',9,9,?,0,0)`).run('p'+i,i,fee);
  db.prepare(`INSERT INTO payout_transfer_intents(id,payout_id,payout_run_id,provider,environment,currency,amount_minor,status,provider_status,provider_transfer_id,confirmed_at)
   VALUES(?,?,'run937','modulr','sandbox','GBP',900,'confirmed','PROCESSED',?,'2026-10-16')`).run('t'+i,'p'+i,'mod_'+i);
  db.prepare(`INSERT INTO modulr_payment_events VALUES(?,'confirmed',?,'modulr_api')`).run('t'+i,'mod_'+i);
  if(!omitDebit || i===1)db.prepare(`INSERT INTO modulr_debit_evidence VALUES(?,?,?,'source_account',900,'GBP','debit_observed','2026-10-16')`).run('t'+i,'mod_'+i,'debit_'+i);
 }
 return db;
}

test('actual FaivoPay payout, run and driver ledger schema posts SENT exactly once',()=>withFlags(()=>{
 const db=fixture({second:true});try{
  const output=postModulrApplicationSentRun(db,'run937');
  assert.equal(output.payoutCount,2);assert.equal(output.amountMinor,1800);
  assert.equal(output.accountingStatus,'sent_not_beneficiary_credited');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE status='paid'").get().n,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM driver_ledger WHERE direction='credit' AND status='sent'").get().n,2);
  assert.equal(db.prepare("SELECT status FROM payout_runs WHERE id='run937'").get().status,'paid');
  assert.throws(()=>postModulrApplicationSentRun(db,'run937'),/blocked|eligible|finalised/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM driver_ledger').get().n,2);
 }finally{db.close();}
}));

test('missing independent debit rolls back every FaivoPay payout and ledger entry',()=>withFlags(()=>{
 const db=fixture({second:true,omitDebit:true});try{
  assert.throws(()=>postModulrApplicationSentRun(db,'run937'),/blocked/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM driver_ledger').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE status='batched'").get().n,2);
  assert.equal(db.prepare("SELECT status FROM payout_runs WHERE id='run937'").get().status,'released');
 }finally{db.close();}
}));

test('weekly fee run cannot silently post without fee accounting',()=>withFlags(()=>{
 const db=fixture({fee:1});try{
  assert.throws(()=>postModulrApplicationSentRun(db,'run937'),/fee|blocked/i);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM driver_ledger').get().n,0);
  assert.equal(db.prepare("SELECT status FROM payouts WHERE id='p1'").get().status,'batched');
 }finally{db.close();}
}));

test('SQLite write failure halfway through a run reverses all prior writes',()=>withFlags(()=>{
 const db=fixture({second:true});try{
  db.exec(`CREATE TRIGGER deny_second_ledger BEFORE INSERT ON driver_ledger
    WHEN NEW.reference_id='p2' BEGIN SELECT RAISE(ABORT,'simulated ledger failure'); END;`);
  assert.throws(()=>postModulrApplicationSentRun(db,'run937'),/simulated ledger failure/);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM driver_ledger').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE status='batched' AND paid_at IS NULL").get().n,2);
  assert.equal(db.prepare("SELECT status FROM payout_runs WHERE id='run937'").get().status,'released');
 }finally{db.close();}
}));

test('carried deductions cannot silently post in application ledger',()=>withFlags(()=>{
 const db=fixture();try{
  db.exec("UPDATE payouts SET carried_charges=2 WHERE id='p1'");
  assert.throws(()=>postModulrApplicationSentRun(db,'run937'),/fee|blocked/i);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,0);
  assert.equal(db.prepare("SELECT status FROM payouts WHERE id='p1'").get().status,'batched');
 }finally{db.close();}
}));
