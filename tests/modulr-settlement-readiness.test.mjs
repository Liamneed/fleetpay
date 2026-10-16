import test from 'node:test';
import assert from 'node:assert/strict';
import {planModulrSettlement} from '../server/lib/modulr-settlement-readiness.mjs';
const fixture=()=>({
 run:{id:'run',provider:'modulr',funding_status:'release_approved',status:'funded',item_count:1,total_amount:25},
 payouts:[{id:'pay',payout_run_id:'run',net_amount:25}],
 transfers:[{id:'intent',payout_id:'pay',payout_run_id:'run',provider:'modulr',environment:'sandbox',currency:'GBP',amount_minor:2500,status:'confirmed',provider_status:'PROCESSED',confirmed_at:'2026-10-16T10:00:00Z',provider_transfer_id:'provider1'}],
 returns:[], events:[{transfer_id:'intent',event_type:'confirmed',provider_reference:'provider1',source:'modulr_api'}]
});
const evidence=[{transferId:'intent',providerReference:'provider1',currency:'GBP',amountMinor:2500,sourceAccountId:'source1',providerTransactionId:'debit1',verified:true}];
for(const [name,modify,reason] of [
 ['processed status never finalises',x=>x,'settlement_evidence_not_supplied'],
 ['claimed verification Boolean cannot finalise',x=>(x.settlementEvidence=evidence,x),'independent_provider_attestation_not_implemented'],
 ['mismatched debit reference blocks',x=>(x.settlementEvidence=[{...evidence[0],providerReference:'wrong'}],x),'settlement_evidence_identity_mismatch'],
 ['duplicate evidence blocks',x=>(x.settlementEvidence=[...evidence,...evidence],x),'duplicate_or_malformed_settlement_evidence'],
 ['return blocks',x=>(x.returns=[{transfer_id:'intent'}],x),'bank_return_requires_review'],
 ['unknown history blocks',x=>(x.events.push({transfer_id:'intent',event_type:'unknown'}),x),'uncertain_transfer_history'],
 ['orphan evidence blocks',x=>(x.settlementEvidence=[...evidence,{...evidence[0],transferId:'other'}],x),'orphan_settlement_evidence'],
 ['wrong payout amount blocks',x=>(x.payouts[0].net_amount=24,x),'amount_mismatch'],
 ]) test(name,()=>{
  const input=modify(fixture());const before=JSON.stringify(input);
  const result=planModulrSettlement(input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(result.readyForAccounting,false);
  assert.equal(result.readyForCommitmentRelease,false);
  assert.equal(result.payoutSubmissionAuthorised,false);
  assert.equal(result.retryAuthorised,false);
  assert.ok(result.blockers.includes(reason),result.blockers.join(','));
 });
test('missing run fails closed',()=>{const result=planModulrSettlement();assert.equal(result.readyForAccounting,false);assert.equal(result.items.length,0)});
