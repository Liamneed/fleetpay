import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { persistAuthenticatedModulrProcessed } from '../server/lib/modulr-durable-processed-status.mjs';

function fixture(){
 process.env.MODULR_ENV='sandbox';process.env.MODULR_ENABLED='false';process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE payout_transfer_intents(id TEXT PRIMARY KEY,provider TEXT,environment TEXT,payout_id TEXT,payout_run_id TEXT,recipient_id TEXT,amount_minor INT,currency TEXT,provider_transfer_id TEXT,status TEXT,provider_status TEXT,updated_at TEXT,confirmed_at TEXT);
 CREATE TABLE payouts(id TEXT PRIMARY KEY,payout_run_id TEXT,driver_id INT,net_amount REAL,status TEXT,type TEXT,paid_at TEXT,updated_at TEXT);
 CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT);
 CREATE TABLE driver_ledger(reference_id TEXT,driver_id INT,entry_type TEXT,direction TEXT,amount REAL,status TEXT);
 INSERT INTO payout_transfer_intents VALUES('intent1','modulr','sandbox','pay1','run1','b1',1234,'GBP','modulr1','submitted','SUBMITTED',null,null);
 INSERT INTO payouts VALUES('pay1','run1',10,12.34,'batched','weekly',null,null);
 INSERT INTO payout_runs VALUES('run1','modulr');`);
 const opts={db,intentId:'intent1',apiKey:'fake',sourceAccountId:'source1',fetchImpl:async()=>({status:200,json:async()=>({id:'modulr1',status:'PROCESSED',details:{sourceAccountId:'source1',destination:{type:'BENEFICIARY',id:'b1'},amount:12.34,currency:'GBP'}})})};
 return {db,opts};
}
test('authenticated processed evidence persists exactly once, without paying driver',async()=>{
 const {db,opts}=fixture();
 const first=await persistAuthenticatedModulrProcessed(opts);assert.equal(first.ok,true);assert.equal(first.changed,true);
 const second=await persistAuthenticatedModulrProcessed(opts);assert.equal(second.ok,true);assert.equal(second.changed,false);
 assert.equal(db.prepare("SELECT status FROM payout_transfer_intents").get().status,'confirmed');
 assert.equal(db.prepare('SELECT status FROM payouts').get().status,'batched');
 assert.ok(db.prepare('SELECT confirmed_at FROM payout_transfer_intents').get().confirmed_at);
 assert.equal(db.prepare('SELECT count(*) AS n FROM driver_ledger').get().n,0);db.close();
});
test('mismatched provider evidence cannot mutate transfer',async()=>{
 const {db,opts}=fixture();opts.fetchImpl=async()=>({status:200,json:async()=>({id:'modulr1',status:'PROCESSED',details:{sourceAccountId:'source1',destination:{type:'BENEFICIARY',id:'other'},amount:12.34,currency:'GBP'}})});
 const result=await persistAuthenticatedModulrProcessed(opts);assert.equal(result.ok,false);
 assert.equal(db.prepare('SELECT status FROM payout_transfer_intents').get().status,'submitted');db.close();
});

test('provider GET race changing beneficiary is rejected without status mutation',async()=>{
 const {db,opts}=fixture(); const first=opts.fetchImpl;
 opts.fetchImpl=async()=>{const response=await first();db.prepare("UPDATE payout_transfer_intents SET recipient_id='b2' WHERE id='intent1'").run();return response;};
 await assert.rejects(()=>persistAuthenticatedModulrProcessed(opts),/reconciliation stopped/);
 assert.equal(db.prepare('SELECT status FROM payout_transfer_intents').get().status,'submitted');db.close();
});
test('provider GET race replacing provider payment ID is rejected',async()=>{
 const {db,opts}=fixture();const first=opts.fetchImpl;
 opts.fetchImpl=async()=>{const response=await first();db.prepare("UPDATE payout_transfer_intents SET provider_transfer_id='different' WHERE id='intent1'").run();return response;};
 await assert.rejects(()=>persistAuthenticatedModulrProcessed(opts),/reconciliation stopped/);
 assert.equal(db.prepare('SELECT status FROM payout_transfer_intents').get().status,'submitted');db.close();
});
