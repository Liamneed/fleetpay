import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateModulrReturnMatch
} from '../server/lib/modulr-return-validation.mjs';

const originalPaymentId = 'P_ORIGINAL_001';
const originalSchemeId = 'SCHEME_ORIGINAL_001';

const notification = {
  EventName: 'PAYIN',
  Type: 'PO_REV',
  PaymentId: 'P_RETURN_001',
  OriginalSchemeId: originalSchemeId
};

function validate(changes = {}, overrides = {}) {
  return validateModulrReturnMatch({
    notification: { ...notification, ...changes },
    originalPaymentId,
    originalSchemeId,
    ...overrides
  });
}

test('matching scheme identifier flags return for review', () => {
  const result = validate();

  assert.equal(result.matched, true);
  assert.equal(result.originalPaymentId, originalPaymentId);
  assert.equal(result.returnPaymentId, 'P_RETURN_001');
  assert.equal(result.requiresManualReview, true);
  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.previewOnly, true);
});

test('different scheme identifier fails closed', () => {
  const result = validate({
    OriginalSchemeId: 'SCHEME_OTHER'
  });

  assert.equal(result.matched, false);
  assert.equal(result.reason, 'scheme_reference_mismatch');
  assert.equal(result.accountingAuthorised, false);
});

test('missing scheme identifier fails closed', () => {
  for (const value of [undefined, null, '']) {
    const result = validate({ OriginalSchemeId: value });

    assert.equal(result.matched, false);
    assert.equal(result.reason, 'missing_scheme_reference');
  }
});

test('missing original scheme identifier fails closed', () => {
  const result = validate({}, {
    originalSchemeId: undefined
  });

  assert.equal(result.matched, false);
  assert.equal(result.accountingAuthorised, false);
});

test('ordinary inbound payments are not treated as returns', () => {
  const result = validate({ Type: 'FP' });

  assert.equal(result.matched, false);
  assert.equal(result.reason, 'not_outbound_reversal');
});

test('outgoing payment notifications are not returns', () => {
  const result = validate({ EventName: 'PAYOUT' });

  assert.equal(result.matched, false);
});

test('return must have a different payment identity', () => {
  const result = validate({
    PaymentId: originalPaymentId
  });

  assert.equal(result.matched, false);
  assert.equal(result.reason, 'invalid_payment_identity');
});

test('invalid notification fails closed', () => {
  const result = validateModulrReturnMatch({
    notification: null,
    originalPaymentId,
    originalSchemeId
  });

  assert.equal(result.matched, false);
  assert.equal(result.accountingAuthorised, false);
});
