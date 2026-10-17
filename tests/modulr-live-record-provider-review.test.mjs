import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewStoredModulrTransfer } from '../server/lib/modulr-live-record-provider-review.mjs';
const original = { ...process.env };
function fixture({paymentStatus='PROCESSED',recipient='beneficiary-1',payoutStatus='batched',ledger=[]}={}) {
 process.env.MODULR_ENV='sandbox'; process.env.MODULR_ENABLED='false'; process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';
 const intent={id:'intent1',provider:'modulr',environment:'sandbox',payout_id:'pay1',payout_run_id:'run1',recipient_id:'beneficiary-1',amount_minor:1234,currency:'GBP',provider_transfer_id:'modulr1',status:'submitted'};
 const payout={id:'pay1',payout_run_id:'run1',driver_id:10,net_amount:12.34,status:payoutStatus,type:'weekly',paid_at:null};
 const db={prepare(sql){return {get(){if(sql.includes('FROM payout_transfer_intents'))return intent;if(sql.includes('FROM payout_runs'))return {id:'run1',provider:'modulr'};if(sql.includes('FROM payouts'))return payout;throw Error(sql)},all(){return ledger}}}};
 const fetchImpl=async()=>({status:200,json:async()=>({id:'modulr1',status:paymentStatus,details:{sourceAccountId:'source1',destination:{type:'BENEFICIARY',id:recipient},amount:12.34,currency:'GBP'}})});
 return {db,intentId:'intent1',apiKey:'test-key',sourceAccountId:'source1',fetchImpl};
}
test('authenticated provider response matches existing payout without writing or finalising',async()=>{
 const out=await reviewStoredModulrTransfer(fixture());
 assert.equal(out.providerEvidenceMatches,true);
 assert.equal(out.beneficiaryReceiptVerified,false);
 assert.equal(out.safeForAutomaticFinalisation,false);
 assert.equal(out.accountingFinalised,false);
});
test('mismatched beneficiary is blocked',async()=>{
 const out=await reviewStoredModulrTransfer(fixture({recipient:'wrong'}));
 assert.equal(out.providerEvidenceMatches,false);
 assert.ok(out.blockers.includes('beneficiary_mismatch'));
});
test('non-processed provider response is not treated as sent',async()=>{
 const out=await reviewStoredModulrTransfer(fixture({paymentStatus:'PENDING'}));
 assert.ok(out.blockers.includes('provider_not_processed'));
});
test('a paid payout is never automatically validated by processed status',async()=>{
 const out=await reviewStoredModulrTransfer(fixture({payoutStatus:'paid'}));
 assert.ok(out.blockers.includes('paid_state_requires_independent_receipt_audit'));
});
test('persistent sent ledger inconsistency blocks positive match',async()=>{
 const out=await reviewStoredModulrTransfer(fixture({payoutStatus:'sent',ledger:[]}));
 assert.ok(out.blockers.includes('missing_or_duplicate_sent_ledger'));
});
test('sandbox gate rejects enabled payment execution',async()=>{
 const f=fixture();process.env.MODULR_ENABLED='true';
 await assert.rejects(()=>reviewStoredModulrTransfer(f),/Sandbox read-only/);
 process.env.MODULR_ENABLED='false';
});
