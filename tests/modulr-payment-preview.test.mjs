import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildModulrPaymentPreview
} from '../server/lib/modulr-payment-preview.mjs';

function validIntent() {
  return {
    id: 'synthetic-test-001',
    provider: 'modulr',
    environment: 'sandbox',
    status: 'prepared',
    recipient_id: 'B_TEST_001',
    amount_minor: 2500,
    currency: 'GBP',
    idempotency_key: 'synthetic-nonce-001'
  };
}

test('Builds a GBP25 offline payment preview', () => {
  const preview = buildModulrPaymentPreview(
    validIntent(), 'A_TEST_001'
  );

  assert.equal(preview.method, 'POST');
  assert.equal(preview.path, '/payments');
  assert.equal(preview.request.amount, 25);
  assert.equal(preview.request.currency, 'GBP');
  assert.equal(preview.request.sourceAccountId, 'A_TEST_001');
  assert.deepEqual(preview.request.destination, { type: 'BENEFICIARY', id: 'B_TEST_001' });
  assert.equal(Object.hasOwn(preview.request, 'destinationId'), false);
  assert.equal(preview.request.externalReference, 'synthetic-test-001');
  assert.equal(preview.nonce, 'synthetic-nonce-001');
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.submissionEnabled, false);
});

test('Preserves penny precision', () => {
  const preview = buildModulrPaymentPreview(
    { ...validIntent(), amount_minor: 2501 },
    'A_TEST_001'
  );

  assert.equal(preview.request.amount, 25.01);
});

test('Rejects ineligible payment states', () => {
  for (const status of [
    'submitting', 'submitted', 'unknown',
    'confirmed', 'failed', 'cancelled'
  ]) {
    assert.throws(() => buildModulrPaymentPreview(
      { ...validIntent(), status },
      'A_TEST_001'
    ));
  }
});

test('Rejects production payment previews', () => {
  assert.throws(() => buildModulrPaymentPreview(
    { ...validIntent(), environment: 'production' },
    'A_TEST_001'
  ));
});

test('Rejects invalid amounts', () => {
  for (const amount_minor of [0, -100, 2.5, NaN, Infinity]) {
    assert.throws(() => buildModulrPaymentPreview(
      { ...validIntent(), amount_minor },
      'A_TEST_001'
    ));
  }
});

test('Rejects invalid recipient or nonce', () => {
  assert.throws(() => buildModulrPaymentPreview(
    { ...validIntent(), recipient_id: '' },
    'A_TEST_001'
  ));

  assert.throws(() => buildModulrPaymentPreview(
    { ...validIntent(), idempotency_key: '' },
    'A_TEST_001'
  ));
});
