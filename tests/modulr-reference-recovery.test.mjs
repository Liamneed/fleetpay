import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectModulrReferenceMatches } from
  '../server/lib/modulr-reference-recovery.mjs';

const intent = {
  id: 'intent_101',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'unknown',
  provider_transfer_id: null,
  recipient_id: 'B_TEST',
  amount_minor: 2500,
  currency: 'GBP'
};

const payment = {
  id: 'P_TEST',
  externalReference: 'intent_101',
  status: 'PROCESSED',
  details: {
    sourceAccountId: 'A_TEST',
    destination: { type: 'BENEFICIARY', id: 'B_TEST' },
    amount: 25,
    currency: 'GBP'
  }
};

function inspect(payments, overrides = {}) {
  return inspectModulrReferenceMatches({
    intent,
    payments,
    searchComplete: true,
    sourceAccountId: 'A_TEST',
    ...overrides
  });
}

test('Unique exact match identifies payment without finalising', () => {
  const result = inspect([payment]);
  assert.equal(result.verified, true);
  assert.equal(result.providerPaymentId, 'P_TEST');
  assert.equal(result.status, 'payment_found');
  assert.equal(result.accountingFinalised, false);
  assert.equal(result.automaticRetryAllowed, false);
  assert.equal(result.requiresIndependentPaymentRetrieval, true);
});

test('No match does not authorise retry', () => {
  const result = inspect([]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'no_reference_match');
  assert.equal(result.automaticRetryAllowed, false);
});

test('Duplicate matching references fail closed', () => {
  const result = inspect([
    payment, { ...payment, id: 'P_SECOND' }
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'ambiguous_reference_matches');
});

test('Incomplete provider search fails closed', () => {
  const result = inspect([payment], { searchComplete: false });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'search_incomplete');
});

test('Wrong beneficiary, source or amount fails closed', () => {
  for (const changed of [
    { ...payment, details: {
      ...payment.details, sourceAccountId: 'A_WRONG'
    }},
    { ...payment, details: {
      ...payment.details,
      destination: { type: 'BENEFICIARY', id: 'B_WRONG' }
    }},
    { ...payment, details: {
      ...payment.details, amount: 26
    }}
  ]) {
    const result = inspect([changed]);
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'provider_payment_mismatch');
  }
});

test('Prepared or already identified transfers are not recoverable here',
  () => {
    for (const changed of [
      { ...intent, status: 'prepared' },
      { ...intent, provider_transfer_id: 'P_KNOWN' }
    ]) {
      const result = inspect([payment], { intent: changed });
      assert.equal(result.verified, false);
      assert.equal(result.reason, 'invalid_recovery_intent');
    }
  }
);
