import test from 'node:test';
import assert from 'node:assert/strict';
import {assessModulrPayoutOperationalState} from '../server/lib/modulr-operational-payout-state.mjs';
const transfer={currency:'GBP',amountMatches:true,providerTransferId:'p1',status:'confirmed',providerStatus:'PROCESSED'};
const make=(status,extra={})=>({payoutId:'driver1',payoutStatus:status,paidAt:null,hasUncertainEvidence:false,modulrTransfer:transfer,...extra});
test('PROCESSED and sent do not mean beneficiary paid',()=>{
 const result=assessModulrPayoutOperationalState([make('sent')]);
 assert.equal(result.beneficiaryReceiptVerified,0);
 assert.equal(result.safeForAutomaticFinalisation,false);
 assert.deepEqual(result.items[0].blockers,['beneficiary_receipt_unverified']);
});
test('returned payouts require review; do not trigger re-payment',()=>{
 const result=assessModulrPayoutOperationalState([make('returned')]);
 assert.ok(result.items[0].blockers.includes('returned_payment_requires_manual_reconciliation'));
 assert.equal(result.accountingMutationPerformed,false);
});
test('apparent paid evidence is not independently trusted by reporting',()=>{
 const result=assessModulrPayoutOperationalState([make('paid',{paidAt:'2026-10-17',hasMatchingVerifiedPaidEvidence:true})]);
 assert.equal(result.items[0].beneficiaryReceiptVerified,false);
 assert.ok(result.items[0].blockers.includes('paid_state_requires_independent_audit'));
});
test('missing, mismatched and unresolved evidence is surfaced',()=>{
 const result=assessModulrPayoutOperationalState([make('sent',{modulrTransfer:null}),make('sent',{hasUncertainEvidence:true,modulrTransfer:{...transfer,amountMatches:false}})]);
 assert.equal(result.requiresManualReview,2);
 assert.ok(result.items[0].blockers.includes('missing_transfer_instruction'));
 assert.ok(result.items[1].blockers.includes('transfer_amount_or_currency_mismatch'));
 assert.ok(result.items[1].blockers.includes('unresolved_provider_evidence'));
});
test('read-only assessment leaves inputs unchanged',()=>{
 const item=Object.freeze(make('sent',{modulrTransfer:Object.freeze({...transfer})}));
 const before=JSON.stringify(item);
 assessModulrPayoutOperationalState([item]);
 assert.equal(JSON.stringify(item),before);
});
