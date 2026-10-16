import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateModulrReturnMatch
} from '../server/lib/modulr-return-validation.mjs';

// Synthetic return notifications only.
// This tests matching behaviour, not database deduplication,
// webhook authentication or actual payment returns.

const originalPaymentId = 'P_ORIGINAL_001';
const originalSchemeId = 'SCHEME_ORIGINAL_001';

function notification({
  paymentId = 'P_RETURN_001',
  eventId = 'EVENT_001',
  schemeId = originalSchemeId
} = {}) {
  return {
    EventName: 'PAYIN',
    Type: 'PO_REV',
    PaymentId: paymentId,
    EventId: eventId,
    OriginalSchemeId: schemeId
  };
}

function validate(event) {
  return validateModulrReturnMatch({
    notification: event,
    originalPaymentId,
    originalSchemeId
  });
}

test('same return delivered twice has the same payment identity', () => {
  const first = validate(notification());
  const repeated = validate(notification());

  assert.equal(first.matched, true);
  assert.equal(repeated.matched, true);
  assert.equal(first.returnPaymentId, repeated.returnPaymentId);

  // The validator has no persistence or deduplication state.
  // Both matches must be treated as the same return by storage.
});

test('changed EventId does not change return payment identity', () => {
  const first = validate(notification({
    eventId: 'EVENT_001'
  }));

  const repeated = validate(notification({
    eventId: 'EVENT_002'
  }));

  assert.equal(first.matched, true);
  assert.equal(repeated.matched, true);
  assert.equal(first.returnPaymentId, repeated.returnPaymentId);
});

test('different return payments remain distinct', () => {
  const first = validate(notification({
    paymentId: 'P_RETURN_001'
  }));

  const second = validate(notification({
    paymentId: 'P_RETURN_002'
  }));

  assert.equal(first.matched, true);
  assert.equal(second.matched, true);
  assert.notEqual(first.returnPaymentId, second.returnPaymentId);

  // Both require investigation. Do not automatically assume
  // that either is a legitimate second reversal.
});

test('conflicting original scheme reference fails closed', () => {
  const first = validate(notification());

  const conflicting = validate(notification({
    schemeId: 'SCHEME_DIFFERENT'
  }));

  assert.equal(first.matched, true);
  assert.equal(conflicting.matched, false);
  assert.equal(
    conflicting.reason,
    'scheme_reference_mismatch'
  );
});

test('a return without the original scheme reference fails closed', () => {
  const result = validate(notification({
    schemeId: undefined
  }));

  // Explicitly remove the reference, rather than rely
  // on the default parameter value.
  const missing = notification();
  delete missing.OriginalSchemeId;

  assert.equal(result.matched, true);
  assert.equal(validate(missing).matched, false);
  assert.equal(
    validate(missing).reason,
    'missing_scheme_reference'
  );
});

test('all matches remain non-authorising', () => {
  for (const event of [
    notification(),
    notification({ paymentId: 'P_RETURN_002' }),
    notification({ schemeId: 'SCHEME_DIFFERENT' })
  ]) {
    const result = validate(event);

    assert.equal(result.accountingAuthorised, false);
    assert.equal(result.paymentSubmitted, false);
    assert.equal(result.requiresManualReview, true);
  }
});
