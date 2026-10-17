import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyModulrPayoutStage as classify} from '../server/lib/modulr-reconciliation-stage.mjs';
const tx={status:'confirmed',provider_status:'PROCESSED',provider_transfer_id:'P2100QHY2S'};
test('provider processed is not beneficiary receipt or paid accounting',()=>{
 const r=classify({transfer:tx,payoutStatus:'batched'});
 assert.equal(r.stage,'provider_processed_pending_receipt');
 assert.equal(r.receiptVerified,false);assert.equal(r.accountingPaid,false);
});
test('unverified imported paid claim cannot imply receipt',()=>{
 const r=classify({transfer:tx,confirmations:[{outcome:'paid',verificationStatus:'unverified'}],payoutStatus:'batched'});
 assert.equal(r.stage,'provider_processed_pending_receipt');
});
test('verified receipt is separate from accounting paid',()=>{
 const confirmations=[{outcome:'paid',verificationStatus:'verified',verifiedAt:'2026-10-17T12:00:00Z'}];
 assert.equal(classify({transfer:tx,confirmations,payoutStatus:'batched'}).stage,'receipt_verified_pending_accounting');
 assert.equal(classify({transfer:tx,confirmations,payoutStatus:'paid'}).stage,'paid');
});
test('failed/returned takes precedence',()=>{
 assert.equal(classify({transfer:{...tx,provider_status:'RETURNED'},payoutStatus:'batched'}).stage,'failed_or_returned');
});
test('accounting paid without verified receipt requires review',()=>{
 assert.equal(classify({transfer:tx,payoutStatus:'paid'}).requiresReview,true);
});
