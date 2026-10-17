import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { verifyModulrBankProof } from '../server/lib/modulr-bank-proof-review.mjs';
import { finaliseModulrManualAccounting } from '../server/lib/modulr-manual-accounting-finalise.mjs';

// Entirely in-memory, synthetic transfer. No network, external payment, or persistent DB.
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT,status TEXT,funding_status TEXT,funds_cleared_at TEXT);
 CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,status TEXT,paid_at TEXT,driver_id INTEGER,type TEXT,fee REAL,callsign TEXT,net_amount REAL,amount REAL,updated_at TEXT);
 CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider TEXT,status TEXT,provider_status TEXT,provider_transfer_id TEXT,amount_minor INTEGER,currency TEXT,environment TEXT);
 CREATE TABLE payout_confirmations(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider TEXT,provider_transaction_id TEXT,verification_status TEXT,outcome TEXT,currency TEXT,amount REAL,created_by TEXT,evidence_source TEXT,evidence_reference TEXT,verified_by TEXT,verified_at TEXT,updated_at TEXT,evidence_json TEXT);
 CREATE TABLE driver_ledger(id TEXT PRIMARY KEY,reference_id TEXT,entry_type TEXT);
 INSERT INTO payout_runs VALUES('synthetic-run','modulr','funded','cleared','2026-10-17');
 INSERT INTO payouts VALUES('synthetic-payout','synthetic-run','batched',NULL,999,'early',0.20,'SYNTHETIC999',1,1.20,NULL);
 INSERT INTO payout_transfer_intents VALUES('synthetic-transfer','synthetic-payout','synthetic-run','modulr','confirmed','PROCESSED','P-SYNTHETIC-NOT-REAL',100,'GBP','sandbox');
 INSERT INTO payout_confirmations VALUES('synthetic-evidence','synthetic-payout','synthetic-run','modulr','P-SYNTHETIC-NOT-REAL','unverified','paid','GBP',1,'importer@example.test','bank_document','SIMULATED-DOC',NULL,NULL,NULL,NULL);`);
 return db;
}
function config(accounting){Object.assign(process.env,{
 MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',
 AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
 PAYOUT_ACCOUNTING_FINALISATION_ENABLED:accounting?'true':'false',MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED:accounting?'true':'false'
 });}
const ids={runId:'synthetic-run',evidenceId:'synthetic-evidence'};
function deps(db){let i=0;return {...ids,actor:'finance@example.test',ledger:(_id,type,_direction,_amount,_fee,_desc,ref)=>db.prepare('INSERT INTO driver_ledger VALUES(?,?,?)').run(`ledger-${++i}`,ref,type),recordFee:()=>{},audit:()=>{}}}
test('synthetic evidence: reviewer verifies, accountant posts atomically, replay blocked',()=>{
 const db=fixture();try{
  config(false);
  assert.throws(()=>verifyModulrBankProof(db,{...ids,reviewer:'importer@example.test',bankReference:'SIMULATED-BANK',attestation:true}),/importer/);
  assert.equal(db.prepare('SELECT verification_status FROM payout_confirmations').get().verification_status,'unverified');
  const reviewed=verifyModulrBankProof(db,{...ids,reviewer:'reviewer@example.test',bankReference:'SIMULATED-BANK',attestation:true});
  assert.equal(reviewed.accountingFinalised,false);
  assert.equal(db.prepare('SELECT status FROM payouts').get().status,'batched');
  assert.throws(()=>finaliseModulrManualAccounting(db,deps(db)),/gate closed/);
  config(true);
  const args=deps(db);
  const paid=finaliseModulrManualAccounting(db,args);
  assert.equal(paid.accountingFinalised,true);
  assert.equal(paid.autocabPosted,false);
  assert.equal(db.prepare('SELECT status FROM payouts').get().status,'paid');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,2);
  assert.throws(()=>finaliseModulrManualAccounting(db,args));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,2);
 }finally{config(false);db.close()}
});
test('unverified simulated evidence never posts accounting',()=>{
 const db=fixture();try{config(true);assert.throws(()=>finaliseModulrManualAccounting(db,deps(db)),/verification/);assert.equal(db.prepare('SELECT status FROM payouts').get().status,'batched');assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,0)}finally{config(false);db.close()}
});
