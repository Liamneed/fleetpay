import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {assessModulrRunCloseout} from '../server/lib/modulr-run-closeout-assessment.mjs';
import {readModulrRunCloseout} from '../server/lib/modulr-run-closeout-read.mjs';
function fixture(){return {run:{id:'r1',provider:'modulr',funding_status:'release_approved',status:'funding_pending',total_amount:25,item_count:1},payouts:[{id:'p1',payout_run_id:'r1',net_amount:25}],transfers:[{id:'t1',payout_id:'p1',payout_run_id:'r1',provider:'modulr',environment:'sandbox',status:'confirmed',provider_status:'PROCESSED',confirmed_at:'2026-10-16T12:00:00Z',provider_transfer_id:'ref1',amount_minor:2500,currency:'GBP'}],returns:[],events:[{transfer_id:'t1',event_type:'confirmed',provider_reference:'ref1',source:'modulr_api'}]};}
test('consistent data is informational and never releases',()=>{const r=assessModulrRunCloseout(fixture());assert.equal(r.structurallyConsistent,true);assert.equal(r.fundingReleaseAuthorised,false)});
for(const [name,alter,reason] of [
 ['missing transfer',v=>v.transfers=[], 'transfer_count_mismatch'],
 ['duplicate payout',v=>v.transfers.push({...v.transfers[0],id:'t2'}),'duplicate_payout_binding'],
 ['wrong amount',v=>v.transfers[0].amount_minor=2600,'amount_mismatch'],
 ['unconfirmed',v=>v.transfers[0].status='submitted','unconfirmed_transfer'],
 ['missing provider history',v=>v.events=[],'missing_provider_confirmation_history'],
 ['return present',v=>v.returns=[{transfer_id:'t1'}],'return_requires_review'],
 ['historical return',v=>v.events.push({transfer_id:'t1',event_type:'returned'}),'return_requires_review'],
 ['unknown outcome',v=>v.events.push({transfer_id:'t1',event_type:'unknown'}),'ambiguous_transfer_history'],
 ['unapproved funding',v=>v.run.funding_status='balance_verified','invalid_funding_state'],
 ['incomplete evidence',v=>delete v.events,'incomplete_evidence']
]) test(name,()=>{const v=fixture();alter(v);const r=assessModulrRunCloseout(v);assert.equal(r.structurallyConsistent,false);assert.ok(r.reasons.includes(reason));assert.equal(r.fundingReleaseAuthorised,false)});
test('read-only database assessment and return blocking',()=>{const db=new DatabaseSync(':memory:');try{
 db.exec(`CREATE TABLE payout_runs(id TEXT,provider TEXT,funding_status TEXT,item_count INTEGER,status TEXT,total_amount REAL);CREATE TABLE payouts(id TEXT,payout_run_id TEXT,net_amount REAL);CREATE TABLE payout_transfer_intents(id TEXT,payout_id TEXT,payout_run_id TEXT,provider TEXT,environment TEXT,status TEXT,provider_status TEXT,confirmed_at TEXT,provider_transfer_id TEXT,amount_minor INTEGER,currency TEXT);CREATE TABLE modulr_return_register(transfer_id TEXT);CREATE TABLE modulr_payment_events(transfer_id TEXT,event_type TEXT,provider_reference TEXT,source TEXT);INSERT INTO payout_runs VALUES('r1','modulr','release_approved',1,'funding_pending',25);INSERT INTO payouts VALUES('p1','r1',25);INSERT INTO payout_transfer_intents VALUES('t1','p1','r1','modulr','sandbox','confirmed','PROCESSED','2026-10-16','ref1',2500,'GBP');INSERT INTO modulr_payment_events VALUES('t1','confirmed','ref1','modulr_api');`);
 assert.equal(readModulrRunCloseout(db,'r1').assessment.structurallyConsistent,true);
 db.exec("INSERT INTO modulr_return_register VALUES('t1')");
 assert.equal(readModulrRunCloseout(db,'r1').assessment.structurallyConsistent,false);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payout_runs').get().n,1);
 }finally{db.close()}});

test('incorrect run total blocks assessment',()=>{const v=fixture();v.run.total_amount=30;assert.ok(assessModulrRunCloseout(v).reasons.includes('run_total_mismatch'))});
test('duplicate provider confirmation blocks assessment',()=>{const v=fixture();v.events.push({...v.events[0]});assert.ok(assessModulrRunCloseout(v).reasons.includes('confirmation_history_count_invalid'))});
test('missing audit tables fail closed',()=>{const db=new DatabaseSync(':memory:');try{db.exec(`CREATE TABLE payout_runs(id TEXT,provider TEXT);CREATE TABLE payouts(payout_run_id TEXT);CREATE TABLE payout_transfer_intents(payout_run_id TEXT,provider TEXT);INSERT INTO payout_runs VALUES('r1','modulr');`);const r=readModulrRunCloseout(db,'r1');assert.equal(r.assessment.structurallyConsistent,false);assert.ok(r.assessment.reasons.includes('audit_table_missing'));}finally{db.close()}});
