import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createModulrReturnRegisterSchema
} from '../server/lib/modulr-return-register-schema.mjs';

function createReturnSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payout_transfer_intents (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      environment TEXT NOT NULL,
      provider_transfer_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL
    );
  `);

  createModulrReturnRegisterSchema(db, { isolatedTestOnly: true });
}

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  createReturnSchema(db);

  db.prepare(`
    INSERT INTO payout_transfer_intents
    (id, provider, environment, provider_transfer_id, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    'TRANSFER_TEST_001',
    'modulr',
    'sandbox',
    'P_ORIGINAL_001',
    'confirmed'
  );

  return db;
}

function insertReturn(db, paymentId = 'P_RETURN_001') {
  return db.prepare(`
    INSERT INTO modulr_return_register (
      return_payment_id,
      transfer_id,
      original_payment_id,
      original_scheme_id,
      return_reason_code,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    paymentId,
    'TRANSFER_TEST_001',
    'P_ORIGINAL_001',
    'SCHEME_TEST_001',
    'TEST',
    '2026-10-15T10:00:00.000Z'
  );
}

test('return register defaults to manual review', () => {
  const db = database();

  try {
    insertReturn(db);

    const row = db.prepare(`
      SELECT status
      FROM modulr_return_register
    `).get();

    assert.equal(row.status, 'manual_review');
  } finally {
    db.close();
  }
});

test('duplicate return payment ID is rejected', () => {
  const db = database();

  try {
    insertReturn(db);

    assert.throws(
      () => insertReturn(db),
      /UNIQUE constraint failed/
    );
  } finally {
    db.close();
  }
});

test('return must reference an existing transfer', () => {
  const db = database();

  try {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO modulr_return_register (
          return_payment_id,
          transfer_id,
          original_payment_id,
          original_scheme_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        'P_RETURN_INVALID',
        'MISSING_TRANSFER',
        'P_ORIGINAL_001',
        'SCHEME_TEST_001',
        '2026-10-15T10:00:00.000Z'
      );
    }, /FOREIGN KEY constraint failed|Original payment association mismatch/);

    const count = db.prepare(`
      SELECT COUNT(*) AS count
      FROM modulr_return_register
    `).get().count;

    assert.equal(count, 0);
  } finally {
    db.close();
  }
});

test('registration leaves original transfer unchanged', () => {
  const db = database();

  try {
    const before = db.prepare(`
      SELECT * FROM payout_transfer_intents
    `).get();

    insertReturn(db);

    const after = db.prepare(`
      SELECT * FROM payout_transfer_intents
    `).get();

    assert.deepEqual(after, before);
  } finally {
    db.close();
  }
});

test('return cannot be marked as financially resolved', () => {
  const db = database();

  try {
    insertReturn(db);

    assert.throws(() => {
      db.exec(`
        UPDATE modulr_return_register
        SET status='resolved'
      `);
    }, /CHECK constraint failed/);
  } finally {
    db.close();
  }
});

test('schema creation is idempotent', () => {
  const db = database();

  try {
    createReturnSchema(db);
    createReturnSchema(db);

    insertReturn(db);

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM modulr_return_register
      `).get().count,
      1
    );
  } finally {
    db.close();
  }
});


test('explicit test permission is required', () => {
  const db = new DatabaseSync(':memory:');

  try {
    assert.throws(
      () => createModulrReturnRegisterSchema(db),
      /explicit test isolation/
    );
  } finally {
    db.close();
  }
});

test('file-backed SQLite database is rejected', () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'modulr-return-isolation-')
  );

  const filename = path.join(directory, 'test.sqlite');
  const db = new DatabaseSync(filename);

  try {
    assert.throws(
      () => createModulrReturnRegisterSchema(
        db,
        { isolatedTestOnly: true }
      ),
      /in-memory SQLite database/
    );

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE name='modulr_return_register'
      `).get().count,
      0
    );
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('application financial tables are rejected', () => {
  const db = new DatabaseSync(':memory:');

  try {
    db.exec(`
      CREATE TABLE payouts (
        id TEXT PRIMARY KEY
      );
    `);

    assert.throws(
      () => createModulrReturnRegisterSchema(
        db,
        { isolatedTestOnly: true }
      ),
      /application tables/
    );

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE name='modulr_return_register'
      `).get().count,
      0
    );
  } finally {
    db.close();
  }
});


test('attached SQLite database is rejected', () => {
  const db = new DatabaseSync(':memory:');

  try {
    db.exec("ATTACH DATABASE ':memory:' AS secondary");

    assert.throws(
      () => createModulrReturnRegisterSchema(
        db,
        { isolatedTestOnly: true }
      ),
      /in-memory SQLite database/
    );

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE name='modulr_return_register'
      `).get().count,
      0
    );
  } finally {
    db.close();
  }
});

test('incompatible existing register schema is rejected', () => {
  const db = new DatabaseSync(':memory:');

  try {
    db.exec(`
      CREATE TABLE modulr_return_register (
        return_payment_id TEXT PRIMARY KEY,
        status TEXT
      );
    `);

    assert.throws(
      () => createModulrReturnRegisterSchema(
        db,
        { isolatedTestOnly: true }
      ),
      /incompatible/
    );

    const columns = db.prepare(
      'PRAGMA table_info(modulr_return_register)'
    ).all();

    assert.equal(columns.length, 2);
  } finally {
    db.close();
  }
});


test('existing register without constraints is rejected', () => {
  const db = new DatabaseSync(':memory:');

  try {
    db.exec(`
      CREATE TABLE payout_transfer_intents (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE modulr_return_register (
        return_payment_id TEXT,
        transfer_id TEXT,
        original_payment_id TEXT,
        original_scheme_id TEXT,
        return_reason_code TEXT,
        return_amount_minor INTEGER,
        currency TEXT,
        provider_status TEXT,
        evidence_source TEXT,
        status TEXT,
        created_at TEXT
      );
    `);

    assert.throws(
      () => createModulrReturnRegisterSchema(
        db,
        { isolatedTestOnly: true }
      ),
      /constraints are incompatible/
    );

    const row = db.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE name='modulr_return_register'
    `).get();

    assert.doesNotMatch(
      row.sql,
      /CHECK\s*\(\s*status\s*=\s*'manual_review'/i
    );
  } finally {
    db.close();
  }
});


test('return evidence fields are available', () => {
  const db = database();

  try {
    const columns = db.prepare(
      'PRAGMA table_info(modulr_return_register)'
    ).all();

    const names = columns.map(column => column.name);

    for (const field of [
      'return_amount_minor',
      'currency',
      'provider_status',
      'evidence_source'
    ]) {
      assert.ok(names.includes(field), field);
    }

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM modulr_return_register
      `).get().count,
      0
    );
  } finally {
    db.close();
  }
});


test('invalid return evidence values are rejected', () => {
  const db = database();

  try {
    insertReturn(db);

    const invalidValues = [
      ['return_amount_minor', 0],
      ['return_amount_minor', -100],
      ['currency', 'USD'],
      ['currency', 'INVALID']
    ];

    for (const [column, value] of invalidValues) {
      assert.throws(() => {
        db.prepare(`
          UPDATE modulr_return_register
          SET ${column} = ?
          WHERE return_payment_id = ?
        `).run(value, 'P_RETURN_001');
      }, /CHECK constraint failed/);
    }

    const unchanged = db.prepare(`
      SELECT return_amount_minor, currency, status
      FROM modulr_return_register
      WHERE return_payment_id = ?
    `).get('P_RETURN_001');

    assert.equal(unchanged.return_amount_minor, null);
    assert.equal(unchanged.currency, null);
    assert.equal(unchanged.status, 'manual_review');

    db.prepare(`
      UPDATE modulr_return_register
      SET return_amount_minor = ?,
          currency = ?
      WHERE return_payment_id = ?
    `).run(100, 'GBP', 'P_RETURN_001');

    const valid = db.prepare(`
      SELECT return_amount_minor, currency
      FROM modulr_return_register
      WHERE return_payment_id = ?
    `).get('P_RETURN_001');

    assert.equal(valid.return_amount_minor, 100);
    assert.equal(valid.currency, 'GBP');

  } finally {
    db.close();
  }
});


test('original payment association is inspected', () => {
  const db = database();

  try {
    const transfer = db.prepare(`
      SELECT provider, environment, provider_transfer_id
      FROM payout_transfer_intents
      WHERE id = ?
    `).get('TRANSFER_TEST_001');

    assert.equal(transfer.provider, 'modulr');
    assert.equal(transfer.environment, 'sandbox');
    assert.equal(transfer.provider_transfer_id, 'P_ORIGINAL_001');
  } finally {
    db.close();
  }
});

test('mismatched original payment association is rejected', () => {
  const db = database();

  try {
    assert.throws(() => {
      db.prepare(`
        INSERT INTO modulr_return_register (
          return_payment_id,
          transfer_id,
          original_payment_id,
          original_scheme_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        'P_RETURN_MISMATCH',
        'TRANSFER_TEST_001',
        'P_WRONG_ORIGINAL',
        'SCHEME_ORIGINAL_001',
        '2026-10-15T18:00:00Z'
      );
    }, /Original payment association mismatch/);

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM modulr_return_register
      `).get().count,
      0
    );

  } finally {
    db.close();
  }
});


test('original payment association cannot be updated', () => {
  const db = database();

  try {
    insertReturn(db);

    assert.throws(() => {
      db.prepare(`
        UPDATE modulr_return_register
        SET original_payment_id = ?
        WHERE return_payment_id = ?
      `).run('P_WRONG_ORIGINAL', 'P_RETURN_001');
    }, /Original payment association cannot be changed/);

    assert.throws(() => {
      db.prepare(`
        UPDATE modulr_return_register
        SET transfer_id = ?
        WHERE return_payment_id = ?
      `).run('OTHER_TRANSFER', 'P_RETURN_001');
    }, /Original payment association cannot be changed/);

    const row = db.prepare(`
      SELECT transfer_id, original_payment_id, status
      FROM modulr_return_register
      WHERE return_payment_id = ?
    `).get('P_RETURN_001');

    assert.equal(row.transfer_id, 'TRANSFER_TEST_001');
    assert.equal(row.original_payment_id, 'P_ORIGINAL_001');
    assert.equal(row.status, 'manual_review');

  } finally {
    db.close();
  }
});


test('return audit records cannot be deleted', () => {
  const db = database();

  try {
    insertReturn(db);

    assert.throws(() => {
      db.prepare(`
        DELETE FROM modulr_return_register
        WHERE return_payment_id = ?
      `).run('P_RETURN_001');
    }, /Return audit records cannot be deleted/);

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM modulr_return_register
      `).get().count,
      1
    );

  } finally {
    db.close();
  }
});
