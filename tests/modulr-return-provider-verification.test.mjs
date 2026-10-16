import test from 'node:test';
import assert from 'node:assert/strict';

import {
  verifyModulrReturnEvidence
} from '../server/lib/modulr-return-provider-verification.mjs';

const originalSchemeId = 'SCHEME_ORIGINAL_001';

const notification = {
  EventName: 'PAYIN',
  Type: 'PO_REV',
  PaymentId: 'P_RETURN_001',
  OriginalSchemeId: originalSchemeId
};

const providerPayment = {
  id: 'P_RETURN_001',
  type: 'PAYIN',
  returnType: 'PO_REV',
  originalSchemeId,
  amountMinor: 100,
  currency: 'GBP',
  status: 'PROCESSED'
};

function verify(paymentChanges = {}, overrides = {}) {
  return verifyModulrReturnEvidence({
    notification,
    providerPayment: {
      ...providerPayment,
      ...paymentChanges
    },
    originalSchemeId,
    expectedAmountMinor: 100,
    expectedCurrency: 'GBP',
    ...overrides
  });
}

test('complete matching synthetic evidence passes for review', () => {
  const result = verify();

  assert.equal(result.verified, true);
  assert.equal(result.requiresManualReview, true);
  assert.equal(result.accountingAuthorised, false);
});

test('incorrect provider payment ID fails', () => {
  const result = verify({ id: 'P_WRONG' });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'payment_identity_mismatch');
});

test('provider must independently identify reversal', () => {
  const result = verify({ returnType: undefined });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'provider_return_type_unverified');
});

test('incorrect original scheme ID fails', () => {
  const result = verify({
    originalSchemeId: 'SCHEME_OTHER'
  });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'original_scheme_mismatch');
});

test('incorrect return amount fails', () => {
  const result = verify({ amountMinor: 101 });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'return_amount_mismatch');
});

test('incorrect currency fails', () => {
  const result = verify({ currency: 'EUR' });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'currency_mismatch');
});

test('unprocessed provider payment fails', () => {
  const result = verify({ status: 'PENDING' });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'provider_status_unverified');
});

test('missing provider evidence fails', () => {
  const result = verify({}, {
    providerPayment: null
  });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'missing_evidence');
});

test('outgoing payment cannot verify an inbound return', () => {
  const result = verify({ type: 'PAYOUT' });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'provider_payment_type_mismatch');
});

test('no verified evidence can authorise accounting', () => {
  const result = verify();

  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.previewOnly, true);
});
