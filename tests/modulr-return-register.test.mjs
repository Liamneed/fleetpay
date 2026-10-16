import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

function database() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE modulr_return_register (
      return_payment_id TEXT PRIMARY KEY,
      original_payment_id TEXT NOT NULL,
      original_scheme_id TEXT NOT NULL,
      event_id TEXT,
      status TEXT NOT NULL DEFAULT 'manual_review',
      created_at TEXT NOT NULL
    );
  `);

  return db;
}

function record(db, {
  returnPaymentId = 'P_RETURN_001',
  originalPaymentId = 'P_ORIGINAL_001',
  originalSchemeId = 'SCHEME_001',
  eventId = 'EVENT_001'
} = {}) {
  return db.prepare(`
    INSERT INTO modulr_return_register (
      return_payment_id,
      original_payment_id,
      original_scheme_id,
      event_id,
      created_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(
    returnPaymentId,
    originalPaymentId,
    originalSchemeId,
    eventId,
    new Date().toISOString()
  );
}

test('first return is recorded for manual review', () => {
  const db = database();

  try {
    record(db);

    const row = db.prepare(`
      SELECT *
      FROM modulr_return_register
    `).get();

    assert.equal(row.return_payment_id, 'P_RETURN_001');
    assert.equal(row.status, 'manual_review');
  } finally {
    db.close();
  }
});

test('duplicate return payment ID is rejected', () => {
  const db = database();

  try {
    record(db);

    assert.throws(() => record(db), /UNIQUE constraint failed/);

    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM modulr_return_register').get().n,
      1
    );
  } finally {
    db.close();
  }
});

test('changed event ID cannot bypass duplicate protection', () => {
  const db = database();

  try {
    record(db);

    assert.throws(
      () => record(db, { eventId: 'EVENT_002' }),
      /UNIQUE constraint failed/
    );

    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM modulr_return_register').get().n,
      1
    );
  } finally {
    db.close();
  }
});

test('conflicting original scheme cannot overwrite existing return', () => {
  const db = database();

  try {
    record(db);

    assert.throws(
      () => record(db, {
        originalSchemeId: 'SCHEME_CONFLICT'
      }),
      /UNIQUE constraint failed/
    );

    const row = db.prepare(`
      SELECT original_scheme_id
      FROM modulr_return_register
      WHERE return_payment_id='P_RETURN_001'
    `).get();

    assert.equal(row.original_scheme_id, 'SCHEME_001');
  } finally {
    db.close();
  }
});

test('distinct return payment IDs are retained separately', () => {
  const db = database();

  try {
    record(db);

    record(db, {
      returnPaymentId: 'P_RETURN_002',
      eventId: 'EVENT_002'
    });

    const rows = db.prepare(`
      SELECT status
      FROM modulr_return_register
    `).all();

    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.status === 'manual_review'));
  } finally {
    db.close();
  }
});

test('transaction failure rolls back return registration', () => {
  const db = database();

  try {
    assert.throws(() => {
      db.exec('BEGIN IMMEDIATE');

      try {
        record(db);

        throw new Error('Simulated failure');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }, /Simulated failure/);

    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM modulr_return_register').get().n,
      0
    );
  } finally {
    db.close();
  }
});
