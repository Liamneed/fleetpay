import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  listModulrTransfersForReview
} from '../server/lib/modulr-transfer-review.mjs';

function withFixture(callback) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE payout_transfer_intents (
        id TEXT PRIMARY KEY,
        payout_id TEXT,
        payout_run_id TEXT,
        provider TEXT,
        environment TEXT,
        status TEXT,
        amount_minor INTEGER,
        currency TEXT,
        provider_transfer_id TEXT,
        updated_at TEXT,
        submitted_at TEXT
      )
    `);

    const insert = db.prepare(`
      INSERT INTO payout_transfer_intents
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);

    insert.run('t1','p1','r1','modulr','sandbox',
      'submitting',2500,'GBP',null,'2026-10-13T11:00:00Z',null);
    insert.run('t2','p2','r1','modulr','sandbox',
      'unknown',3000,'GBP',null,'2026-10-13T11:30:00Z',null);
    insert.run('t3','p3','r1','modulr','sandbox',
      'submitted',1500,'GBP','P3','2026-10-13T11:00:00Z',null);
    insert.run('t4','p4','r2','wise','sandbox',
      'unknown',1200,'GBP',null,'2026-10-13T11:00:00Z',null);
    insert.run('t5','p5','r2','modulr','production',
      'unknown',5000,'GBP',null,'2026-10-13T11:00:00Z',null);

    return callback(db);
  } finally {
    db.close();
  }
}

const now = new Date('2026-10-13T12:00:00Z');

test('Lists only incomplete sandbox Modulr transfers', () =>
  withFixture(db => {
    const rows = listModulrTransfersForReview(db, { now });
    assert.deepEqual(rows.map(x => x.transferId), ['t1','t2']);
    assert.equal(rows[0].ageMinutes, 60);
    assert.equal(rows[1].ageMinutes, 30);
  })
);

test('Incomplete transfers can never be automatically retried', () =>
  withFixture(db => {
    for (const row of listModulrTransfersForReview(db, { now })) {
      assert.equal(row.action, 'manual_investigation');
      assert.equal(row.automaticRetryAllowed, false);
      assert.equal(row.accountingFinalised, false);
    }
  })
);

test('Review does not change transfer data', () =>
  withFixture(db => {
    const before = db.prepare(
      'SELECT * FROM payout_transfer_intents ORDER BY id'
    ).all();

    listModulrTransfersForReview(db, { now });

    const after = db.prepare(
      'SELECT * FROM payout_transfer_intents ORDER BY id'
    ).all();

    assert.deepEqual(after, before);
  })
);

test('Review does not expose bank or beneficiary details', () =>
  withFixture(db => {
    const result = listModulrTransfersForReview(db, { now });
    for (const row of result) {
      assert.equal('recipient_id' in row, false);
      assert.equal('account_number' in row, false);
      assert.equal('sort_code' in row, false);
    }
  })
);
