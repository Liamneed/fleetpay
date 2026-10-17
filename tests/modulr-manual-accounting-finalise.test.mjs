import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {finaliseModulrManualAccounting as finalise} from '../server/lib/modulr-manual-accounting-finalise.mjs';
const env={MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED:'true',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'true'};
Object.assign(process.env,env);
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(`CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT,status TEXT,funding_status TEXT,funds_cleared_at TEXT);
 CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,status TEXT,paid_at TEXT,driver_id INTEGER,type TEXT,fee REAL,callsign TEXT,net_amount REAL,amount REAL,updated_at TEXT);
 CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider TEXT,status TEXT,provider_status TEXT,provider_transfer_id TEXT,amount_minor INTEGER,currency TEXT,environment TEXT);
 CREATE TABLE payout_confirmations(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider TEXT,provider_transaction_id TEXT,verification_status TEXT,outcome TEXT,currency TEXT,amount REAL,created_by TEXT,evidence_source TEXT,evidence_reference TEXT,verified_by TEXT,verified_at TEXT,evidence_json TEXT);
 CREATE TABLE driver_ledger(id TEXT PRIMARY KEY,reference_id TEXT,entry_type TEXT);
 INSERT INTO payout_runs VALUES('r','modulr','funded','cleared','2026-10-17');
 INSERT INTO payouts VALUES('p','r','batched',NULL,999,'early',0.20,'TEST999',1,1.20,NULL);
 INSERT INTO payout_transfer_intents VALUES('t','p','r','modulr','confirmed','PROCESSED','PTEST',100,'GBP','sandbox');
 INSERT INTO payout_confirmations VALUES('e','p','r','modulr','PTEST','verified','paid','GBP',1,'importer','bank_document','DOC','reviewer','2026-10-17','{"reviewMethod":"independent_bank_confirmation","bankConfirmationReference":"BANK-1","attestedBeneficiaryReceipt":true}');`);
 let n=0;const deps={runId:'r',evidenceId:'e',actor:'admin',ledger:(_d,entry,_dir,_am,_fee,_desc,ref)=>db.prepare('INSERT INTO driver_ledger VALUES(?,?,?)').run('l'+(++n),ref,entry),recordFee:()=>{},audit:()=>{}};
 return {db,deps};
}
function verify(fn){const {db,deps}=fixture();try{fn(db,deps)}finally{db.close()}}
test('verified receipt finalises once, posting payout and fee atomically',()=>verify((db,args)=>{const r=finalise(db,args);assert.equal(r.accountingFinalised,true);assert.equal(r.autocabPosted,false);assert.equal(db.prepare('SELECT status FROM payouts').get().status,'paid');assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,2);assert.throws(()=>finalise(db,args));assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,2)}));
test('no proof blocks paid and ledger',()=>verify((db,args)=>{db.exec("UPDATE payout_confirmations SET evidence_json='{}'");assert.throws(()=>finalise(db,args),/proof/);assert.equal(db.prepare('SELECT status FROM payouts').get().status,'batched')}));
test('processed alone blocks paid',()=>verify((db,args)=>{db.exec("UPDATE payout_confirmations SET verification_status='unverified'");assert.throws(()=>finalise(db,args),/verification/)}));
test('transfer mismatch blocks',()=>verify((db,args)=>{db.exec('UPDATE payout_transfer_intents SET amount_minor=200');assert.throws(()=>finalise(db,args),/amount mismatch/i)}));
test('transaction rolls back ledger and status on fee failure',()=>verify((db,args)=>{assert.throws(()=>finalise(db,{...args,recordFee:()=>{throw Error('Fee failure')}}),/Fee failure/);assert.equal(db.prepare('SELECT status FROM payouts').get().status,'batched');assert.equal(db.prepare('SELECT COUNT(*) n FROM driver_ledger').get().n,0)}));
test('feature gate prevents finalisation',()=>verify((db,args)=>{process.env.MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED='false';try{assert.throws(()=>finalise(db,args),/gate closed/)}finally{process.env.MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED='true'}}));
