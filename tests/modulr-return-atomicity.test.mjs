import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  validateModulrReturnMatch
} from '../server/lib/modulr-return-validation.mjs';

import {
  createModulrPaymentHistoryTable,
  recordModulrPaymentEvent
} from '../server/lib/modulr-payment-history.mjs';

const TRANSFER_ID = 'TRANSFER_TEST_001';
const ORIGINAL_PAYMENT_ID = 'P_ORIGINAL_001';
const ORIGINAL_SCHEME_ID = 'SCHEME_ORIGINAL_001';

function createDatabase() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_transfer_id TEXT
    );

    INSERT INTO payout_transfer_intents (
      id, provider, provider_transfer_id
    ) VALUES (
      '${TRANSFER_ID}',
      'modulr',
      '${ORIGINAL_PAYMENT_ID}'
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

function returnNotification(returnPaymentId = 'P_RETURN_001') {
  return {
    EventName: 'PAYIN',
    Type: 'PO_REV',
    PaymentId: returnPaymentId,
    OriginalSchemeId: ORIGINAL_SCHEME_ID
  };
}

// Test-only transaction. No provider or accounting integration.
function simulateReturnRegistration(db, notification, {
  failAfterRegister = false
} = {}) {
  const match = validateModulrReturnMatch({
    notification,
    originalPaymentId: ORIGINAL_PAYMENT_ID,
    originalSchemeId: ORIGINAL_SCHEME_ID
  });

  if (!match.matched || match.accountingAuthorised !== false) {
    throw new Error('Return validation rejected.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    db.prepare(`
      INSERT INTO modulr_return_register (
        return_payment_id,
        transfer_id,
        original_scheme_id,
        created_at
      ) VALUES (?, ?, ?, ?)
    `).run(
      match.returnPaymentId,
      TRANSFER_ID,
      ORIGINAL_SCHEME_ID,
      new Date().toISOString()
    );

    if (failAfterRegister) {
      throw new Error('Injected audit failure');
    }

    recordModulrPaymentEvent(db, {
      transferId: TRANSFER_ID,
      eventType: 'returned',
      providerReference: ORIGINAL_PAYMENT_ID,
      providerStatus: 'PO_REV',
      source: 'modulr_return_test'
    });

    db.exec('COMMIT');

    return {
      registered: true,
      accountingAuthorised: false
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function count(db, table) {
  return db.prepare(`
    SELECT COUNT(*) AS total FROM ${table}
  `).get().total;
}

test('matched return creates register and audit atomically', () => {
  const db = createDatabase();

  try {
    const result = simulateReturnRegistration(
      db,
      returnNotification()
    );

    assert.equal(result.registered, true);
    assert.equal(result.accountingAuthorised, false);

    assert.equal(count(db, 'modulr_return_register'), 1);
    assert.equal(count(db, 'modulr_payment_events'), 1);

    const event = db.prepare(`
      SELECT event_type, source
      FROM modulr_payment_events
    `).get();

    assert.equal(event.event_type, 'returned');
    assert.equal(event.source, 'modulr_return_test');
  } finally {
    db.close();
  }
});

test('duplicate return rolls back without duplicate audit', () => {
  const db = createDatabase();

  try {
    simulateReturnRegistration(db, returnNotification());

    assert.throws(
      () => simulateReturnRegistration(db, returnNotification()),
      /UNIQUE constraint failed/
    );

    assert.equal(count(db, 'modulr_return_register'), 1);
    assert.equal(count(db, 'modulr_payment_events'), 1);
  } finally {
    db.close();
  }
});

test('failed audit stage rolls back register insert', () => {
  const db = createDatabase();

  try {
    assert.throws(
      () => simulateReturnRegistration(
        db,
        returnNotification(),
        { failAfterRegister: true }
      ),
      /Injected audit failure/
    );

    assert.equal(count(db, 'modulr_return_register'), 0);
    assert.equal(count(db, 'modulr_payment_events'), 0);
  } finally {
    db.close();
  }
});

test('mismatched scheme creates no records', () => {
  const db = createDatabase();

  try {
    const notification = {
      ...returnNotification(),
      OriginalSchemeId: 'SCHEME_WRONG'
    };

    assert.throws(
      () => simulateReturnRegistration(db, notification),
      /Return validation rejected/
    );

    assert.equal(count(db, 'modulr_return_register'), 0);
    assert.equal(count(db, 'modulr_payment_events'), 0);
  } finally {
    db.close();
  }
});

test('two distinct returns retain separate audit records', () => {
  const db = createDatabase();

  try {
    simulateReturnRegistration(
      db,
      returnNotification('P_RETURN_001')
    );

    simulateReturnRegistration(
      db,
      returnNotification('P_RETURN_002')
    );

    assert.equal(count(db, 'modulr_return_register'), 2);
    assert.equal(count(db, 'modulr_payment_events'), 2);

    assert.equal(
      db.prepare('PRAGMA integrity_check').get().integrity_check,
      'ok'
    );
  } finally {
    db.close();
  }
});
