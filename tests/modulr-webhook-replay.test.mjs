import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import {
  verifyModulrWebhook
} from '../server/lib/modulr-webhook-auth.mjs';

const webhookId = 'WEBHOOK_TEST_001';
const secret = 'synthetic-secret';
const algorithm = 'hmac-sha256';
const date = 'Thu, 15 Oct 2026 10:00:00 GMT';
const now = Date.parse(date);

function database() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE modulr_webhook_nonces (
      webhook_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (webhook_id, nonce)
    );
  `);

  return db;
}

function signed(nonce, overrides = {}) {
  const signature = encodeURIComponent(
    crypto.createHmac('sha256', secret)
      .update(`date: ${date}\nx-mod-nonce: ${nonce}`)
      .digest('base64')
  );

  return {
    authorization:
      `Signature keyId="${webhookId}",` +
      `algorithm="${algorithm}",` +
      `headers="date x-mod-nonce",` +
      `signature="${signature}"`,
    webhookId,
    secret,
    algorithm,
    date,
    nonce,
    now,
    ...overrides
  };
}

function registerAuthenticatedNonce(db, request) {
  const verification = verifyModulrWebhook(request);

  if (!verification.verified) {
    return {
      accepted: false,
      reason: verification.reason
    };
  }

  try {
    db.prepare(`
      INSERT INTO modulr_webhook_nonces (
        webhook_id, nonce, received_at
      ) VALUES (?, ?, ?)
    `).run(
      verification.webhookId,
      verification.nonce,
      new Date(verification.timestamp).toISOString()
    );

    return {
      accepted: true,
      accountingAuthorised: false
    };
  } catch (error) {
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return {
        accepted: false,
        reason: 'replayed_nonce'
      };
    }

    throw error;
  }
}

test('first valid signed request is accepted', () => {
  const db = database();

  try {
    const result = registerAuthenticatedNonce(
      db,
      signed('NONCE_TEST_001')
    );

    assert.equal(result.accepted, true);
    assert.equal(result.accountingAuthorised, false);
  } finally {
    db.close();
  }
});

test('identical signed request is rejected on replay', () => {
  const db = database();

  try {
    const request = signed('NONCE_TEST_001');

    assert.equal(
      registerAuthenticatedNonce(db, request).accepted,
      true
    );

    const replay = registerAuthenticatedNonce(db, request);

    assert.equal(replay.accepted, false);
    assert.equal(replay.reason, 'replayed_nonce');
  } finally {
    db.close();
  }
});

test('different valid nonce can be accepted', () => {
  const db = database();

  try {
    assert.equal(
      registerAuthenticatedNonce(
        db,
        signed('NONCE_TEST_001')
      ).accepted,
      true
    );

    assert.equal(
      registerAuthenticatedNonce(
        db,
        signed('NONCE_TEST_002')
      ).accepted,
      true
    );
  } finally {
    db.close();
  }
});

test('invalid signature does not consume nonce', () => {
  const db = database();

  try {
    const valid = signed('NONCE_TEST_001');

    const invalid = {
      ...valid,
      secret: 'wrong-secret'
    };

    assert.equal(
      registerAuthenticatedNonce(db, invalid).accepted,
      false
    );

    assert.equal(
      registerAuthenticatedNonce(db, valid).accepted,
      true
    );
  } finally {
    db.close();
  }
});

test('same nonce under a different authenticated webhook is distinct', () => {
  const db = database();

  try {
    const first = signed('NONCE_TEST_001');

    assert.equal(
      registerAuthenticatedNonce(db, first).accepted,
      true
    );

    const secondId = 'WEBHOOK_TEST_002';

    const signature = encodeURIComponent(
      crypto.createHmac('sha256', secret)
        .update(
          `date: ${date}\nx-mod-nonce: NONCE_TEST_001`
        )
        .digest('base64')
    );

    const second = {
      ...first,
      webhookId: secondId,
      authorization:
        `Signature keyId="${secondId}",` +
        `algorithm="${algorithm}",` +
        `headers="date x-mod-nonce",` +
        `signature="${signature}"`
    };

    assert.equal(
      registerAuthenticatedNonce(db, second).accepted,
      true
    );
  } finally {
    db.close();
  }
});

test('expired notification does not consume nonce', () => {
  const db = database();

  try {
    const expired = signed('NONCE_TEST_001', {
      now: now + 3600000
    });

    assert.equal(
      registerAuthenticatedNonce(db, expired).accepted,
      false
    );

    assert.equal(
      registerAuthenticatedNonce(
        db,
        signed('NONCE_TEST_001')
      ).accepted,
      true
    );
  } finally {
    db.close();
  }
});
