import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  verifyModulrWebhook
} from '../server/lib/modulr-webhook-auth.mjs';

const webhookId = 'WEBHOOK_TEST_001';
const secret = 'synthetic-webhook-secret';
const algorithm = 'hmac-sha256';
const date = 'Thu, 15 Oct 2026 10:00:00 GMT';
const nonce = 'NONCE_TEST_001';
const now = Date.parse(date);

function signed(overrides = {}) {
  const signingString =
    `date: ${date}\nx-mod-nonce: ${nonce}`;

  const signature = encodeURIComponent(
    crypto.createHmac('sha256', secret)
      .update(signingString)
      .digest('base64')
  );

  return {
    authorization:
      `Signature keyId="${webhookId}",` +
      `algorithm="${algorithm}",` +
      `headers="date x-mod-nonce",` +
      `signature="${signature}"`,
    date,
    nonce,
    webhookId,
    secret,
    algorithm,
    now,
    ...overrides
  };
}

test('valid synthetic signature verifies', () => {
  const result = verifyModulrWebhook(signed());

  assert.equal(result.verified, true);
  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.requiresReplayProtection, true);
});

test('incorrect secret fails', () => {
  const result = verifyModulrWebhook(
    signed({ secret: 'incorrect-secret' })
  );

  assert.equal(result.verified, false);
});

test('incorrect webhook ID fails', () => {
  const result = verifyModulrWebhook(
    signed({ webhookId: 'WRONG_WEBHOOK' })
  );

  assert.equal(result.verified, false);
});

test('expired timestamp fails', () => {
  const result = verifyModulrWebhook(
    signed({ now: now + 3600000 })
  );

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'timestamp_outside_window');
});

test('missing authorization fails', () => {
  const result = verifyModulrWebhook(
    signed({ authorization: undefined })
  );

  assert.equal(result.verified, false);
});

test('unsupported algorithm fails', () => {
  const result = verifyModulrWebhook(
    signed({ algorithm: 'md5' })
  );

  assert.equal(result.verified, false);
});

test('tampered nonce fails signature verification', () => {
  const result = verifyModulrWebhook(
    signed({ nonce: 'NONCE_TAMPERED_002' })
  );

  assert.equal(result.verified, false);
});

test('valid signature never authorises accounting', () => {
  const result = verifyModulrWebhook(signed());

  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.requiresProviderReconciliation, true);
});
