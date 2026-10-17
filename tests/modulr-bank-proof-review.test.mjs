import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {verifyModulrBankProof} from '../server/lib/modulr-bank-proof-review.mjs';
const good={MODULR_ENV:'sandbox',MODULR_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'};
Object.assign(process.env,good);
function dbFixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT,status TEXT);
 CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,status TEXT,paid_at TEXT,net_amount REAL,amount REAL);
 CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider_transfer_id TEXT,status TEXT,provider_status TEXT,amount_minor INTEGER,currency TEXT,environment TEXT);
 CREATE TABLE payout_confirmations(id TEXT PRIMARY KEY,payout_id TEXT,payout_run_id TEXT,provider TEXT,provider_transaction_id TEXT,verification_status TEXT,outcome TEXT,currency TEXT,amount REAL,created_by TEXT,evidence_source TEXT,evidence_reference TEXT,verified_by TEXT,verified_at TEXT,updated_at TEXT,evidence_json TEXT);
 INSERT INTO payout_runs VALUES('r','modulr','funded');
 INSERT INTO payouts VALUES('p','r','batched',NULL,1,1);
 INSERT INTO payout_transfer_intents VALUES('t','p','r','P2100QHY2S','confirmed','PROCESSED',100,'GBP','sandbox');
 INSERT INTO payout_confirmations VALUES('e','p','r','modulr','P2100QHY2S','unverified','paid','GBP',1,'importer@example.com','bank_document','DOC1',NULL,NULL,NULL,NULL);`);
 return db;
}
const params={runId:'r',evidenceId:'e',reviewer:'reviewer@example.com',bankReference:'BANK-123',attestation:true};
test('separate reviewer verifies receipt but cannot mark paid',()=>{const db=dbFixture();const r=verifyModulrBankProof(db,params);assert.equal(r.accountingFinalised,false);assert.equal(db.prepare('SELECT status FROM payouts').get().status,'batched');assert.equal(db.prepare('SELECT verification_status FROM payout_confirmations').get().verification_status,'verified');db.close()});
test('same reviewer as importer blocked',()=>{const db=dbFixture();assert.throws(()=>verifyModulrBankProof(db,{...params,reviewer:'importer@example.com'}),/importer/);db.close()});
test('attestation required',()=>{const db=dbFixture();assert.throws(()=>verifyModulrBankProof(db,{...params,attestation:false}),/attestation/);db.close()});
test('duplicate verification blocked',()=>{const db=dbFixture();verifyModulrBankProof(db,params);assert.throws(()=>verifyModulrBankProof(db,params),/eligible/);db.close()});
test('mismatch transfer blocked',()=>{const db=dbFixture();db.exec("UPDATE payout_transfer_intents SET amount_minor=200");assert.throws(()=>verifyModulrBankProof(db,params),/Amount mismatch/);db.close()});
test('production context blocked',()=>{const db=dbFixture();process.env.MODULR_ENV='production';assert.throws(()=>verifyModulrBankProof(db,params),/Sandbox/);process.env.MODULR_ENV='sandbox';db.close()});
