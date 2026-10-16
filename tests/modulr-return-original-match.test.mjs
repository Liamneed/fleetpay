import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchModulrReturnToOriginal
} from '../server/lib/modulr-return-original-match.mjs';

const intent = {
  id: 'TRANSFER_TEST_001',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'confirmed',
  provider_transfer_id: 'P_ORIGINAL_001',
  recipient_id: 'B_TEST',
  amount_minor: 100,
  currency: 'GBP'
};

const lookup = {
  found: true,
  providerPaymentId: 'P_ORIGINAL_001',
  externalReference: 'TRANSFER_TEST_001',
  providerStatus: 'PROCESSED',
  requiresIndependentPaymentRetrieval: true
};

const payment = {
  id: 'P_ORIGINAL_001',
  type: 'PAYOUT',
  externalReference: 'TRANSFER_TEST_001',
  status: 'PROCESSED',
  details: {
    sourceAccountId: 'A_TEST',
    destination: {
      type: 'BENEFICIARY',
      id: 'B_TEST'
    },
    amount: 1,
    currency: 'GBP'
  }
};

function evaluate(changes = {}) {
  return matchModulrReturnToOriginal({
    intent,
    lookup,
    originalPayment: payment,
    sourceAccountId: 'A_TEST',
    ...changes
  });
}

test('matching confirmed payout associates for review', () => {
  const result = evaluate();

  assert.equal(result.matched, true);
  assert.equal(result.returnConfirmed, false);
  assert.equal(result.accountingAuthorised, false);
});

test('wrong original payment ID is rejected', () => {
  assert.equal(evaluate({
    originalPayment: { ...payment, id: 'P_OTHER' }
  }).matched, false);
});

test('wrong external reference is rejected', () => {
  assert.equal(evaluate({
    originalPayment: {
      ...payment,
      externalReference: 'TRANSFER_OTHER'
    }
  }).matched, false);
});

test('wrong beneficiary is rejected', () => {
  assert.equal(evaluate({
    originalPayment: {
      ...payment,
      details: {
        ...payment.details,
        destination: {
          type: 'BENEFICIARY',
          id: 'B_OTHER'
        }
      }
    }
  }).matched, false);
});

test('wrong source account is rejected', () => {
  assert.equal(evaluate({
    sourceAccountId: 'A_OTHER'
  }).matched, false);
});

test('wrong amount is rejected', () => {
  assert.equal(evaluate({
    originalPayment: {
      ...payment,
      details: { ...payment.details, amount: 1.01 }
    }
  }).matched, false);
});

test('wrong currency is rejected', () => {
  assert.equal(evaluate({
    originalPayment: {
      ...payment,
      details: { ...payment.details, currency: 'EUR' }
    }
  }).matched, false);
});

test('unprocessed original payment is rejected', () => {
  assert.equal(evaluate({
    originalPayment: { ...payment, status: 'PENDING' }
  }).matched, false);
});

test('unverified lookup is rejected', () => {
  assert.equal(evaluate({
    lookup: {
      ...lookup,
      found: false
    }
  }).matched, false);
});

test('matching evidence never authorises another payment', () => {
  const result = evaluate();

  assert.equal(result.retryAuthorised, false);
  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.requiresManualReview, true);
});

test('PAYIN cannot be associated as original payout', () => {
  const result = evaluate({
    originalPayment: {
      ...payment,
      type: 'PAYIN'
    }
  });

  assert.equal(result.matched, false);
  assert.equal(result.reason, 'original_payment_type_mismatch');
});

test('missing original payment type fails closed', () => {
  const result = evaluate({
    originalPayment: {
      ...payment,
      type: undefined
    }
  });

  assert.equal(result.matched, false);
});

test('contradictory external references fail closed', () => {
  const result = evaluate({
    originalPayment: {
      ...payment,
      details: {
        ...payment.details,
        externalReference: 'TRANSFER_OTHER'
      }
    }
  });

  assert.equal(result.matched, false);
  assert.equal(result.reason, 'external_reference_mismatch');
});

test('matching references at both locations are valid', () => {
  const result = evaluate({
    originalPayment: {
      ...payment,
      details: {
        ...payment.details,
        externalReference: intent.id
      }
    }
  });

  assert.equal(result.matched, true);
});

test('both external references missing fail closed', () => {
  const result = evaluate({
    originalPayment: {
      ...payment,
      externalReference: undefined,
      details: {
        ...payment.details,
        externalReference: undefined
      }
    }
  });

  assert.equal(result.matched, false);
});
