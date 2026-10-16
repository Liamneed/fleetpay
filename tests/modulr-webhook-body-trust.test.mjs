import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  verifyModulrWebhook
} from '../server/lib/modulr-webhook-auth.mjs';

import {
  validateModulrReturnMatch
} from '../server/lib/modulr-return-validation.mjs';

const webhookId = 'WEBHOOK_TEST_001';
const secret = 'synthetic-secret';
const date = 'Thu, 15 Oct 2026 10:00:00 GMT';
const nonce = 'NONCE_TEST_001';

function signedHeaders() {
  const signature = encodeURIComponent(
    crypto.createHmac('sha256', secret)
      .update(`date: ${date}\nx-mod-nonce: ${nonce}`)
      .digest('base64')
  );

  return {
    authorization:
      `Signature keyId="${webhookId}",` +
      'algorithm="hmac-sha256",' +
      'headers="date x-mod-nonce",' +
      `signature="${signature}"`,
    date,
    nonce,
    webhookId,
    secret,
    algorithm: 'hmac-sha256',
    now: Date.parse(date)
  };
}

const original = {
  EventName: 'PAYIN',
  Type: 'PO_REV',
  PaymentId: 'P_RETURN_001',
  OriginalSchemeId: 'SCHEME_ORIGINAL'
};

function evaluate(notification) {
  const authentication = verifyModulrWebhook(signedHeaders());

  const matching = validateModulrReturnMatch({
    notification,
    originalPaymentId: 'P_ORIGINAL_001',
    originalSchemeId: 'SCHEME_ORIGINAL'
  });

  return {
    authentication,
    matching,
    // This is the required policy, not a claim of
    // existing production enforcement.
    financiallyTrusted: false,
    requiresIndependentProviderVerification: true
  };
}

test('valid header signature does not establish body integrity', () => {
  const first = evaluate(original);

  const altered = evaluate({
    ...original,
    PaymentId: 'P_RETURN_ALTERED'
  });

  assert.equal(first.authentication.verified, true);
  assert.equal(altered.authentication.verified, true);

  assert.equal(first.matching.matched, true);
  assert.equal(altered.matching.matched, true);

  assert.notEqual(
    first.matching.returnPaymentId,
    altered.matching.returnPaymentId
  );

  assert.equal(first.financiallyTrusted, false);
  assert.equal(altered.financiallyTrusted, false);
});

test('matching scheme references are not financial proof', () => {
  const result = evaluate(original);

  assert.equal(result.matching.matched, true);
  assert.equal(result.financiallyTrusted, false);
  assert.equal(
    result.requiresIndependentProviderVerification,
    true
  );
});

test('altered scheme reference remains untrusted', () => {
  const result = evaluate({
    ...original,
    OriginalSchemeId: 'SCHEME_OTHER'
  });

  assert.equal(result.authentication.verified, true);
  assert.equal(result.matching.matched, false);
  assert.equal(result.financiallyTrusted, false);
});

test('a valid header signature cannot authorise accounting', () => {
  const result = evaluate(original);

  assert.equal(
    result.authentication.accountingAuthorised,
    false
  );

  assert.equal(
    result.matching.accountingAuthorised,
    false
  );

  assert.equal(result.financiallyTrusted, false);
});
