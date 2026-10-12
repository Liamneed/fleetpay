import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateModulrPreSubmission
} from '../server/lib/modulr-pre-submission.mjs';

function fixture() {
  const driverId = 123;
  return {
    intent:{
      provider:'modulr',
      environment:'sandbox',
      status:'prepared',
      provider_transfer_id:null,
      confirmed_at:null,
      payout_run_id:'run-1',
      payout_id:'payout-1',
      amount_minor:2500,
      currency:'GBP',
      recipient_id:'beneficiary-1',
      recipient_account_last4:'1234',
      recipient_sort_code_last2:'56',
      recipient_snapshot_at:'2026-10-12T12:00:00Z'
    },
    run:{
      id:'run-1',
      provider:'modulr',
      run_type:'weekly',
      status:'funded',
      funding_status:'cleared',
      funds_cleared_at:'2026-10-12T10:00:00Z',
      provider_ref:null,
      released_at:null,
      paid_at:null
    },
    payout:{
      id:'payout-1',
      payout_run_id:'run-1',
      driver_id:driverId,
      type:'weekly',
      status:'batched',
      net_amount:25,
      paid_at:null
    },
    driver:{
      driver_id:driverId,
      payout_excluded:0
    },
    bank:{
      updated_at:'2026-10-12T09:00:00Z',
      sort_code_enc:'synthetic-sort-token',
      account_number_enc:'synthetic-account-token',
      sort_code_last2:'56',
      account_number_last4:'1234'
    },
    match:{
      matched:true,
      beneficiaryId:'beneficiary-1',
      status:'ACTIVE',
      approvalStatus:'APPROVED',
      approvalRequired:false,
      bankUpdatedAt:'2026-10-12T09:00:00Z',
      bankSortCodeEnc:'synthetic-sort-token',
      bankAccountNumberEnc:'synthetic-account-token'
    },
    evidenceCount:0
  };
}

test('Valid synthetic transfer passes offline checks', () => {
  const result = validateModulrPreSubmission(fixture());
  assert.equal(result.eligible,true);
  assert.equal(result.amountMinor,2500);
  assert.equal(result.paymentExecutionEnabled,false);
});

test('Excluded driver is blocked', () => {
  const data=fixture();
  data.driver.payout_excluded=1;
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Changed amount is blocked', () => {
  const data=fixture();
  data.payout.net_amount=26;
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Cancelled batch is blocked', () => {
  const data=fixture();
  data.run.status='cancelled';
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Changed bank details are blocked', () => {
  const data=fixture();
  data.bank.updated_at='2026-10-12T13:00:00Z';
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Changed bank tokens are blocked', () => {
  const data=fixture();
  data.bank.account_number_enc='different-token';
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Wrong beneficiary is blocked', () => {
  const data=fixture();
  data.match.beneficiaryId='wrong-beneficiary';
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Unapproved beneficiary is blocked', () => {
  const data=fixture();
  data.match.approvalStatus='PENDING';
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Existing payment evidence is blocked', () => {
  const data=fixture();
  data.evidenceCount=1;
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});

test('Already submitted transfer is blocked', () => {
  const data=fixture();
  data.intent.status='submitted';
  assert.equal(validateModulrPreSubmission(data).eligible,false);
});
