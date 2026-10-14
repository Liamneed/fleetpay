import test from 'node:test';
import assert from 'node:assert/strict';
import { validateModulrSandboxApproval } from
  '../server/lib/modulr-sandbox-approval.mjs';

const previous = {
  MODULR_ENV: process.env.MODULR_ENV,
  MODULR_ENABLED: process.env.MODULR_ENABLED,
  PAYOUT_ACCOUNTING_FINALISATION_ENABLED:
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED
};

function fixture() {
  return {
    actor: {
      role:'admin',mfa:true,
      staffRole:'administrator',staffId:'staff_test'
    },
    intent: {
      id:'intent_test',
      provider:'modulr',
      environment:'sandbox',
      status:'prepared',
      amount_minor:100,
      currency:'GBP'
    },
    approvedTransferId:'intent_test',
    approvedAmountMinor:100,
    sourceAccountId:'A_TEST_1',
    verifiedSourceAccount: {
      id:'A_TEST_1',
      currency:'GBP',
      environment:'sandbox',
      verified:true
    }
  };
}

function check(args) {
  process.env.MODULR_ENV='sandbox';
  process.env.MODULR_ENABLED='false';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';
  return validateModulrSandboxApproval(args);
}

test('Exact sandbox approval remains non-executable', () => {
  const result=check(fixture());
  assert.equal(result.eligible,true);
  assert.equal(result.amountMinor,100);
  assert.equal(result.paymentExecutionEnabled,false);
  assert.equal(result.requiresAtomicClaim,true);
});

test('Rejects wrong amount, transfer and administrator', () => {
  for (const change of [
    {approvedAmountMinor:101},
    {approvedTransferId:'different'},
    {actor:{...fixture().actor,mfa:false}},
    {actor:{...fixture().actor,staffRole:'finance'}}
  ]) {
    assert.equal(check({...fixture(),...change}).eligible,false);
  }
});

test('Rejects claimed transfer and unverified source account', () => {
  assert.equal(check({
    ...fixture(),
    intent:{...fixture().intent,status:'submitting'}
  }).eligible,false);

  assert.equal(check({
    ...fixture(),
    verifiedSourceAccount:{
      ...fixture().verifiedSourceAccount,verified:false
    }
  }).eligible,false);
});

test('Production and accounting-enabled environments are blocked', () => {
  const args=fixture();

  process.env.MODULR_ENV='production';
  assert.equal(validateModulrSandboxApproval(args).eligible,false);

  process.env.MODULR_ENV='sandbox';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='true';
  assert.equal(validateModulrSandboxApproval(args).eligible,false);
});

test('Restore original environment', () => {
  for (const [name,value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name]=value;
  }
});
