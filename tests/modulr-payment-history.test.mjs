import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createModulrPaymentHistoryTable,
  recordModulrPaymentEvent,
  getModulrPaymentHistory
} from '../server/lib/modulr-payment-history.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_transfer_id TEXT
    );
  `);

  db.prepare(`
    INSERT INTO payout_transfer_intents
    VALUES (?, ?, ?)
  `).run('test-transfer', 'modulr', 'P2100QHY2S');

  createModulrPaymentHistoryTable(db);

  return db;
}

test('records and retrieves payment history', () => {
  const db = fixture();

  try {
    recordModulrPaymentEvent(db, {
      transferId: 'test-transfer',
      eventType: 'submitted',
      providerReference: 'P2100QHY2S',
      source: 'modulr_api'
    });

    recordModulrPaymentEvent(db, {
      transferId: 'test-transfer',
      eventType: 'confirmed',
      providerReference: 'P2100QHY2S',
      providerStatus: 'PROCESSED',
      source: 'modulr_api'
    });

    const history = getModulrPaymentHistory(db, 'test-transfer');

    assert.equal(history.length, 2);
    assert.equal(history[0].eventType, 'submitted');
    assert.equal(history[1].eventType, 'confirmed');
    assert.equal(history[1].providerReference, 'P2100QHY2S');
    assert.equal(history[1].providerStatus, 'PROCESSED');
  } finally {
    db.close();
  }
});

test('rejects an incorrect provider reference', () => {
  const db = fixture();

  try {
    assert.throws(() => {
      recordModulrPaymentEvent(db, {
        transferId: 'test-transfer',
        eventType: 'confirmed',
        providerReference: 'WRONG'
      });
    }, /Provider reference mismatch/);

    assert.equal(getModulrPaymentHistory(db, 'test-transfer').length, 0);
  } finally {
    db.close();
  }
});

test('rejects invalid events and unknown transfers', () => {
  const db = fixture();

  try {
    assert.throws(() => {
      recordModulrPaymentEvent(db, {
        transferId: 'test-transfer',
        eventType: 'paid_without_verification'
      });
    }, /Invalid Modulr payment event/);

    assert.throws(() => {
      recordModulrPaymentEvent(db, {
        transferId: 'missing-transfer',
        eventType: 'prepared'
      });
    }, /Modulr transfer not found/);
  } finally {
    db.close();
  }
});
