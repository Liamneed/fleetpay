import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createModulrApplicationReturnReviewSchema,reverseModulrApplicationReturn} from '../server/lib/modulr-application-return-reversal.mjs';
const flags={MODULR_APPLICATION_ACCOUNTING_ENABLED:'true',MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'};
function env(fn){const old=Object.fromEntries(Object.keys(flags).map(x=>[x,process.env[x]]));Object.assign(process.env,flags);try{return fn()}finally{for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;}}
function fixture(){const db=new DatabaseSync(':memory:');db.exec(`
CREATE TABLE modulr_return_register(return_payment_id TEXT PRIMARY KEY,transfer_id TEXT,original_payment_id TEXT,return_amount_minor INTEGER,currency TEXT,provider_status TEXT,status TEXT);
CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT,provider TEXT,environment TEXT,provider_transfer_id TEXT,amount_minor INTEGER);
CREATE TABLE payouts(id TEXT PRIMARY KEY,driver_id INTEGER,status TEXT,paid_at TEXT,net_amount REAL,amount REAL,type TEXT);
CREATE TABLE driver_ledger(id TEXT PRIMARY KEY,driver_id INTEGER,entry_type TEXT,direction TEXT,amount REAL,fee_amount REAL,description TEXT,reference_id TEXT,status TEXT,created_at TEXT);
INSERT INTO modulr_return_register VALUES('ret1','t1','provider1',900,'GBP','RETURNED','manual_review');
INSERT INTO payout_transfer_intents VALUES('t1','p1','modulr','sandbox','provider1',900);
INSERT INTO payouts VALUES('p1',7,'paid','2026-10-16',9,9,'weekly');
INSERT INTO driver_ledger VALUES('sent1',7,'weekly_payout','credit',9,0,'Sent','p1','sent','2026-10-16');`);createModulrApplicationReturnReviewSchema(db);return db;}
test('a return register alone is never sufficient to reverse money',()=>env(()=>{const db=fixture();try{assert.throws(()=>reverseModulrApplicationReturn(db,'ret1'),/evidence/);assert.equal(db.prepare("SELECT count(*) n FROM driver_ledger").get().n,1);}finally{db.close()}}));
test('reviewed matching return produces one debit and cannot replay',()=>env(()=>{const db=fixture();try{db.prepare('INSERT INTO modulr_application_return_reviews VALUES(?,?,?,?,?,?,?)').run('ret1','t1','controller','2026-10-17','bank-ref-1',900,'bank_statement');const r=reverseModulrApplicationReturn(db,'ret1');assert.equal(r.amountMinor,900);assert.equal(r.automaticRetry,false);assert.equal(db.prepare("SELECT status FROM payouts WHERE id='p1'").get().status,'returned');assert.equal(db.prepare("SELECT count(*) n FROM driver_ledger WHERE direction='debit'").get().n,1);assert.throws(()=>reverseModulrApplicationReturn(db,'ret1'),/already reversed/);}finally{db.close()}}));
test('wrong return amount leaves driver ledger untouched',()=>env(()=>{const db=fixture();try{db.prepare('INSERT INTO modulr_application_return_reviews VALUES(?,?,?,?,?,?,?)').run('ret1','t1','controller','2026-10-17','bank-ref-1',800,'bank_statement');assert.throws(()=>reverseModulrApplicationReturn(db,'ret1'),/inconsistent/);assert.equal(db.prepare('SELECT count(*) n FROM driver_ledger').get().n,1);}finally{db.close()}}));
test('disabled accounting gate refuses return posting',()=>{const db=fixture();try{assert.throws(()=>reverseModulrApplicationReturn(db,'ret1'),/disabled/);}finally{db.close()}});

test('independently reviewed RETURNED reverses a SENT, not paid, payout without inventing beneficiary credit',()=>env(()=>{
 const db=fixture();try{
  db.exec("UPDATE payouts SET status='sent',paid_at=NULL WHERE id='p1'");
  db.prepare('INSERT INTO modulr_application_return_reviews VALUES(?,?,?,?,?,?,?)').run('ret1','t1','reviewer','2026-10-17','bank-ref-sent',900,'authenticated_provider_api');
  const result=reverseModulrApplicationReturn(db,'ret1');
  assert.equal(result.automaticRetry,false);
  assert.equal(db.prepare("SELECT status,paid_at FROM payouts WHERE id='p1'").get().status,'returned');
  assert.equal(db.prepare("SELECT paid_at FROM payouts WHERE id='p1'").get().paid_at,null);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM driver_ledger WHERE direction='debit'").get().n,1);
  assert.throws(()=>reverseModulrApplicationReturn(db,'ret1'),/already reversed/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM driver_ledger WHERE direction='debit'").get().n,1);
 }finally{db.close()}
}));
test('reversal ledger insert failure leaves SENT payout and review unchanged',()=>env(()=>{
 const db=fixture();try{
  db.exec("UPDATE payouts SET status='sent',paid_at=NULL WHERE id='p1'");
  db.prepare('INSERT INTO modulr_application_return_reviews VALUES(?,?,?,?,?,?,?)').run('ret1','t1','reviewer','2026-10-17','bank-ref-failure',900,'bank_statement');
  db.exec("CREATE TRIGGER abort_return BEFORE INSERT ON driver_ledger WHEN NEW.entry_type='modulr_return_reversal' BEGIN SELECT RAISE(ABORT,'rollback simulated'); END;");
  assert.throws(()=>reverseModulrApplicationReturn(db,'ret1'),/rollback simulated/);
  assert.equal(db.prepare("SELECT status FROM payouts WHERE id='p1'").get().status,'sent');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM modulr_application_return_reversals').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,1);
 }finally{db.close()}
}));
