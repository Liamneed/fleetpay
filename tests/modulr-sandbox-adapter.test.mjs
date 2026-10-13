
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareModulrSandboxRequest,
  submitModulrSandboxPayment
} from '../server/lib/modulr-sandbox-adapter.mjs';

const intent = {
  id: 'synthetic_adapter_291',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'prepared',
  recipient_id: 'B_TEST_001',
  amount_minor: 2500,
  currency: 'GBP',
  idempotency_key: 'nonce_adapter_291'
};

test('Prepares sandbox request without executing', () => {
  const result = prepareModulrSandboxRequest(intent, 'A_TEST_001');

  assert.equal(result.method, 'POST');
  assert.equal(result.path, '/payments');
  assert.equal(result.body.amount, 25);
  assert.equal(result.body.destination.type, 'BENEFICIARY');
  assert.equal(result.headers['x-mod-nonce'], intent.idempotency_key);
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.executionEnabled, false);
});

test('Rejects production transfer preparation', () => {
  assert.throws(() => prepareModulrSandboxRequest(
    { ...intent, environment: 'production' }, 'A_TEST_001'
  ));
});

test('Rejects in-flight transfer preparation', () => {
  assert.throws(() => prepareModulrSandboxRequest(
    { ...intent, status: 'submitting' }, 'A_TEST_001'
  ));
});

test('Payment submission remains blocked', async () => {
  await assert.rejects(
    submitModulrSandboxPayment(),
    /execution is disabled/
  );
});

test('Payment submission stays blocked with arguments', async () => {
  await assert.rejects(
    submitModulrSandboxPayment({
      intent,
      enabled: true,
      authorised: true
    }),
    /execution is disabled/
  );
});
