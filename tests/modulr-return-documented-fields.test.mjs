import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectModulrReturnCandidate
} from '../server/lib/modulr-return-provider-verification.mjs';

const notification = {
  EventName: 'PAYIN',
  Type: 'PO_REV',
  PaymentId: 'P_RETURN_TEST',
  OriginalSchemeId: 'SCHEME_TEST'
};

const payment = {
  id: 'P_RETURN_TEST',
  type: 'PAYIN',
  status: 'PROCESSED',
  returnDetails: {
    originalSchemeId: 'SCHEME_TEST',
    returnReasonCode: 'TEST'
  },
  details: {
    amount: 1,
    currency: 'GBP'
  }
};

function inspect(changes = {}, overrides = {}) {
  return inspectModulrReturnCandidate({
    notification,
    providerPayment: { ...payment, ...changes },
    originalSchemeId: 'SCHEME_TEST',
    expectedAmountMinor: 100,
    ...overrides
  });
}

test('documented fields produce review-only candidate', () => {
  const result = inspect();
  assert.equal(result.candidate, true);
  assert.equal(result.returnConfirmed, false);
  assert.equal(result.accountingAuthorised, false);
});

test('missing returnDetails fails closed', () => {
  assert.equal(
    inspect({ returnDetails: undefined }).candidate,
    false
  );
});

test('wrong original scheme fails closed', () => {
  assert.equal(
    inspect({
      returnDetails: {
        ...payment.returnDetails,
        originalSchemeId: 'WRONG'
      }
    }).candidate,
    false
  );
});

test('ordinary incoming payment is rejected', () => {
  assert.equal(
    inspect({}, {
      notification: {
        ...notification,
        Type: 'ORDINARY'
      }
    }).candidate,
    false
  );
});

test('wrong return amount is rejected', () => {
  assert.equal(
    inspect({
      details: { amount: 1.01, currency: 'GBP' }
    }).candidate,
    false
  );
});

test('missing return reason is rejected', () => {
  assert.equal(
    inspect({
      returnDetails: {
        originalSchemeId: 'SCHEME_TEST'
      }
    }).candidate,
    false
  );
});

test('no candidate can authorise financial actions', () => {
  const result = inspect();
  assert.equal(result.returnConfirmed, false);
  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.retryAuthorised, false);
});
