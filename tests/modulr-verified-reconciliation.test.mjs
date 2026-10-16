import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createModulrPaymentHistoryTable,
  getModulrPaymentHistory
} from '../server/lib/modulr-payment-history.mjs';

import {
  recordVerifiedModulrReconciliation
} from '../server/lib/modulr-verified-reconciliation.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      environment TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_transfer_id TEXT,
      provider_status TEXT,
      recipient_id TEXT,
      amount_minor INTEGER,
      currency TEXT,
      confirmed_at TEXT,
      updated_at TEXT
    );

    INSERT INTO payout_transfer_intents VALUES (
      'intent',
      'modulr',
      'sandbox',
      'submitted',
      'TEST_REFERENCE_001',
      'SUBMITTED',
      'beneficiary_001',
      2500,
      'GBP',
      NULL,
      NULL
    );
  `);

  createModulrPaymentHistoryTable(db);
  return db;
}

function payment() {
  return {
    id: 'TEST_REFERENCE_001',
    status: 'PROCESSED',
    details: {
      sourceAccountId: 'source_001',
      destination: {
        type: 'BENEFICIARY',
        id: 'beneficiary_001'
      },
      amount: 25,
      currency: 'GBP'
    }
  };
}

function transfer(db) {
  return db.prepare(`
    SELECT status,provider_status,confirmed_at
    FROM payout_transfer_intents WHERE id='intent'
  `).get();
}

test('valid provider result confirms transfer and records history', () => {
  const db = fixture();

  try {
    const result = recordVerifiedModulrReconciliation(
      db, 'intent', payment(), 'source_001'
    );

    assert.equal(result.status, 'confirmed');
    assert.equal(result.accountingFinalised, false);
    assert.equal(result.autocabReconciled, false);
    assert.equal(result.requiresBankReturnMonitoring, true);

    assert.equal(transfer(db).status, 'confirmed');
    assert.equal(transfer(db).provider_status, 'PROCESSED');
    assert.ok(transfer(db).confirmed_at);

    const history = getModulrPaymentHistory(db, 'intent');
    assert.equal(history.length, 1);
    assert.equal(history[0].eventType, 'confirmed');
    assert.equal(history[0].providerReference, 'TEST_REFERENCE_001');
  } finally {
    db.close();
  }
});

for (const [name, change] of [
  ['wrong provider reference', p => { p.id = 'WRONG'; }],
  ['wrong beneficiary', p => { p.details.destination.id = 'WRONG'; }],
  ['wrong amount', p => { p.details.amount = 26; }],
  ['wrong currency', p => { p.details.currency = 'EUR'; }],
  ['non-final status', p => { p.status = 'SUBMITTED'; }],
  ['wrong source account', p => { p.details.sourceAccountId = 'WRONG'; }]
]) {
  test(`rejects ${name} without changing database`, () => {
    const db = fixture();

    try {
      const p = payment();
      change(p);

      assert.throws(() => {
        recordVerifiedModulrReconciliation(
          db, 'intent', p, 'source_001'
        );
      });

      assert.equal(transfer(db).status, 'submitted');
      assert.equal(transfer(db).confirmed_at, null);
      assert.equal(getModulrPaymentHistory(db, 'intent').length, 0);
    } finally {
      db.close();
    }
  });
}

test('duplicate reconciliation cannot confirm twice', () => {
  const db = fixture();

  try {
    recordVerifiedModulrReconciliation(
      db, 'intent', payment(), 'source_001'
    );

    assert.throws(() => {
      recordVerifiedModulrReconciliation(
        db, 'intent', payment(), 'source_001'
      );
    });

    assert.equal(getModulrPaymentHistory(db, 'intent').length, 1);
  } finally {
    db.close();
  }
});

test('missing history table rolls back confirmation', () => {
  const db = fixture();

  try {
    db.exec('DROP TABLE modulr_payment_events');

    assert.throws(() => {
      recordVerifiedModulrReconciliation(
        db, 'intent', payment(), 'source_001'
      );
    });

    assert.equal(transfer(db).status, 'submitted');
    assert.equal(transfer(db).confirmed_at, null);
  } finally {
    db.close();
  }
});
