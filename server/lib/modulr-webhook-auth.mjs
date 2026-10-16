import crypto from 'node:crypto';

const ALGORITHMS = Object.freeze({
  'hmac-sha1': 'sha1',
  'hmac-sha256': 'sha256',
  'hmac-sha384': 'sha384',
  'hmac-sha512': 'sha512'
});

// Authentication only. Does not interpret webhook JSON.
export function verifyModulrWebhook({
  authorization,
  date,
  nonce,
  webhookId,
  secret,
  algorithm,
  now = Date.now(),
  toleranceMs = 300000
}) {
  const reject = reason => ({
    verified: false,
    reason,
    accountingAuthorised: false
  });

  const digest = ALGORITHMS[algorithm];

  if (!digest) return reject('unsupported_algorithm');

  if (typeof webhookId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(webhookId) ||
      typeof secret !== 'string' || !secret) {
    return reject('invalid_configuration');
  }

  if (typeof date !== 'string' ||
      typeof nonce !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/.test(nonce)) {
    return reject('invalid_headers');
  }

  const timestamp = Date.parse(date);

  if (!Number.isFinite(timestamp) ||
      !Number.isFinite(now) ||
      !Number.isSafeInteger(toleranceMs) ||
      toleranceMs < 0 ||
      Math.abs(now - timestamp) > toleranceMs) {
    return reject('timestamp_outside_window');
  }

  if (typeof authorization !== 'string') {
    return reject('missing_authorization');
  }

  const match = authorization.match(
    /^Signature keyId="([^"]+)",algorithm="([^"]+)",headers="date x-mod-nonce",signature="([^"]+)"$/
  );

  if (!match) return reject('invalid_authorization_format');

  const [, receivedId, receivedAlgorithm, receivedSignature] = match;

  if (receivedId !== webhookId ||
      receivedAlgorithm !== algorithm) {
    return reject('signature_configuration_mismatch');
  }

  const signingString =
    `date: ${date}\nx-mod-nonce: ${nonce}`;

  const expected = encodeURIComponent(
    crypto.createHmac(digest, Buffer.from(secret, 'utf8'))
      .update(signingString, 'utf8')
      .digest('base64')
  );

  const supplied = Buffer.from(receivedSignature, 'utf8');
  const calculated = Buffer.from(expected, 'utf8');

  if (supplied.length !== calculated.length ||
      !crypto.timingSafeEqual(supplied, calculated)) {
    return reject('invalid_signature');
  }

  return {
    verified: true,
    reason: 'signature_valid',
    webhookId,
    nonce,
    timestamp,
    accountingAuthorised: false,
    requiresReplayProtection: true,
    requiresProviderReconciliation: true
  };
}
