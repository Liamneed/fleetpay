import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import {
  verifyModulrWebhook
} from '../server/lib/modulr-webhook-auth.mjs';

import {
  validateModulrReturnMatch
} from '../server/lib/modulr-return-validation.mjs';

import {
  createModulrPaymentHistoryTable,
  recordModulrPaymentEvent
} from '../server/lib/modulr-payment-history.mjs';

const CONFIG = {
  webhookId: 'WEBHOOK_TEST_001',
  secret: 'synthetic-webhook-secret',
  algorithm: 'hmac-sha256'
};

const DATE = 'Thu, 15 Oct 2026 10:00:00 GMT';
const NOW = Date.parse(DATE);

const TRANSFER = 'TRANSFER_TEST_001';
const ORIGINAL_PAYMENT = 'P_ORIGINAL_001';
const ORIGINAL_SCHEME = 'SCHEME_ORIGINAL_001';

function createDb() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_transfer_id TEXT NOT NULL
    );

    INSERT INTO payout_transfer_intents
    VALUES (
      '${TRANSFER}',
      'modulr',
      '${ORIGINAL_PAYMENT}'
    );

    CREATE TABLE modulr_webhook_nonces (
      webhook_id TEXT NOT NULL,
      nonce TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY(webhook_id, nonce)
    );

    CREATE TABLE modulr_return_register (
      return_payment_id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL,
      original_scheme_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'manual_review',
      created_at TEXT NOT NULL,
      FOREIGN KEY(transfer_id)
        REFERENCES payout_transfer_intents(id)
    );
  `);

  createModulrPaymentHistoryTable(db);
  return db;
}

function makeRequest({
  nonce = 'NONCE_TEST_001',
  returnPaymentId = 'P_RETURN_001',
  schemeId = ORIGINAL_SCHEME
} = {}) {
  const message = `date: ${DATE}\nx-mod-nonce: ${nonce}`;

  const signature = encodeURIComponent(
    crypto.createHmac('sha256', CONFIG.secret)
      .update(message)
      .digest('base64')
  );

  return {
    auth: {
      authorization:
        `Signature keyId="${CONFIG.webhookId}",` +
        `algorithm="${CONFIG.algorithm}",` +
        `headers="date x-mod-nonce",` +
        `signature="${signature}"`,
      date: DATE,
      nonce,
      ...CONFIG,
      now: NOW
    },
    notification: {
      EventName: 'PAYIN',
      Type: 'PO_REV',
      PaymentId: returnPaymentId,
      OriginalSchemeId: schemeId
    }
  };
}

// Offline simulation only. No real provider evidence is accepted.
// Do not wire to Express, production DB or accounting.
function simulateProcessing(db, request, {
  failAfterRegister = false
} = {}) {
  const authentication = verifyModulrWebhook(request.auth);

  if (!authentication.verified) {
    return { accepted: false, reason: 'authentication_failed' };
  }

  // Signed headers do NOT authenticate the payment body.
  // This is a simulation of internal atomicity, not financial proof.
  const match = validateModulrReturnMatch({
    notification: request.notification,
    originalPaymentId: ORIGINAL_PAYMENT,
    originalSchemeId: ORIGINAL_SCHEME
  });

  if (!match.matched) {
    return { accepted: false, reason: match.reason };
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    db.prepare(`
      INSERT INTO modulr_webhook_nonces (
        webhook_id, nonce, received_at
      ) VALUES (?, ?, ?)
    `).run(
      authentication.webhookId,
      authentication.nonce,
      new Date(authentication.timestamp).toISOString()
    );

    db.prepare(`
      INSERT INTO modulr_return_register (
        return_payment_id,
        transfer_id,
        original_scheme_id,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      match.returnPaymentId,
      TRANSFER,
      ORIGINAL_SCHEME,
      new Date().toISOString()
    );

    if (failAfterRegister) {
      throw new Error('Injected audit failure');
    }

    recordModulrPaymentEvent(db, {
      transferId: TRANSFER,
      eventType: 'returned',
      providerReference: ORIGINAL_PAYMENT,
      providerStatus: 'PO_REV',
      source: 'modulr_return_test'
    });

    db.exec('COMMIT');

    return {
      accepted: true,
      simulationOnly: true,
      accountingAuthorised: false
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}

    if (String(error.message).includes('UNIQUE constraint failed')) {
      return { accepted: false, reason: 'duplicate_or_replay' };
    }

    throw error;
  }
}

function count(db, table) {
  const allowed = [
    'modulr_webhook_nonces',
    'modulr_return_register',
    'modulr_payment_events'
  ];
  if (!allowed.includes(table)) throw new Error('Invalid table');

  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

test('valid synthetic return registers all three records', () => {
  const db = createDb();
  try {
    const result = simulateProcessing(db, makeRequest());

    assert.equal(result.accepted, true);
    assert.equal(result.accountingAuthorised, false);
    assert.equal(count(db, 'modulr_webhook_nonces'), 1);
    assert.equal(count(db, 'modulr_return_register'), 1);
    assert.equal(count(db, 'modulr_payment_events'), 1);
  } finally { db.close(); }
});

test('replayed nonce cannot generate another return', () => {
  const db = createDb();
  try {
    const request = makeRequest();

    assert.equal(simulateProcessing(db, request).accepted, true);
    assert.equal(simulateProcessing(db, request).accepted, false);

    assert.equal(count(db, 'modulr_webhook_nonces'), 1);
    assert.equal(count(db, 'modulr_return_register'), 1);
    assert.equal(count(db, 'modulr_payment_events'), 1);
  } finally { db.close(); }
});

test('new nonce cannot duplicate the same return payment', () => {
  const db = createDb();
  try {
    assert.equal(simulateProcessing(db, makeRequest()).accepted, true);

    const repeated = simulateProcessing(
      db,
      makeRequest({ nonce: 'NONCE_TEST_002' })
    );

    assert.equal(repeated.accepted, false);
    assert.equal(count(db, 'modulr_webhook_nonces'), 1);
    assert.equal(count(db, 'modulr_return_register'), 1);
    assert.equal(count(db, 'modulr_payment_events'), 1);
  } finally { db.close(); }
});

test('invalid signature creates no records', () => {
  const db = createDb();
  try {
    const request = makeRequest();
    request.auth.secret = 'incorrect-secret';

    assert.equal(simulateProcessing(db, request).accepted, false);
    assert.equal(count(db, 'modulr_webhook_nonces'), 0);
    assert.equal(count(db, 'modulr_return_register'), 0);
    assert.equal(count(db, 'modulr_payment_events'), 0);
  } finally { db.close(); }
});

test('mismatched scheme creates no records', () => {
  const db = createDb();
  try {
    const request = makeRequest({
      schemeId: 'SCHEME_WRONG'
    });

    assert.equal(simulateProcessing(db, request).accepted, false);
    assert.equal(count(db, 'modulr_webhook_nonces'), 0);
    assert.equal(count(db, 'modulr_return_register'), 0);
    assert.equal(count(db, 'modulr_payment_events'), 0);
  } finally { db.close(); }
});

test('audit failure rolls back nonce and return', () => {
  const db = createDb();
  try {
    assert.throws(
      () => simulateProcessing(
        db,
        makeRequest(),
        { failAfterRegister: true }
      ),
      /Injected audit failure/
    );

    assert.equal(count(db, 'modulr_webhook_nonces'), 0);
    assert.equal(count(db, 'modulr_return_register'), 0);
    assert.equal(count(db, 'modulr_payment_events'), 0);
  } finally { db.close(); }
});

test('distinct synthetic returns have separate records', () => {
  const db = createDb();
  try {
    assert.equal(simulateProcessing(db, makeRequest()).accepted, true);

    assert.equal(
      simulateProcessing(db, makeRequest({
        nonce: 'NONCE_TEST_002',
        returnPaymentId: 'P_RETURN_002'
      })).accepted,
      true
    );

    assert.equal(count(db, 'modulr_webhook_nonces'), 2);
    assert.equal(count(db, 'modulr_return_register'), 2);
    assert.equal(count(db, 'modulr_payment_events'), 2);
  } finally { db.close(); }
});
