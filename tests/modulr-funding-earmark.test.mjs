import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  ensureModulrFundingVerificationTable,
  earmarkVerifiedModulrFunding
} from '../server/lib/modulr-funding-earmark.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY,
      provider TEXT,
      status TEXT,
      funding_status TEXT,
      total_amount REAL
    );

    INSERT INTO payout_runs VALUES
      ('run1','modulr','funding_pending','awaiting_clearance',125.50),
      ('run2','modulr','funding_pending','awaiting_clearance',100.00);
  `);

  ensureModulrFundingVerificationTable(db);

  return db;
}

const account = {
  id: 'ACCOUNT_TEST',
  customerId: 'CUSTOMER_TEST',
  currency: 'GBP',
  status: 'ACTIVE',
  availableBalance: '500.00'
};

function verify(db, runId = 'run1', overrides = {}) {
  return earmarkVerifiedModulrFunding(db, {
    runId,
    account,
    accountId: 'ACCOUNT_TEST',
    customerId: 'CUSTOMER_TEST',
    ...overrides
  });
}

test('records verified balance without funding or payment', () => {
  const db = fixture();

  try {
    const result = verify(db);

    assert.equal(result.verified, true);
    assert.equal(result.fundingStatus, 'balance_verified');
    assert.equal(result.providerFundsReserved, false);
    assert.equal(result.paymentSubmitted, false);
    assert.equal(result.accountingFinalised, false);

    const run = db.prepare(
      "SELECT status,funding_status FROM payout_runs WHERE id='run1'"
    ).get();

    assert.equal(run.status, 'funding_pending');
    assert.equal(run.funding_status, 'balance_verified');

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_verifications'
      ).get().n,
      1
    );
  } finally {
    db.close();
  }
});

test('repeated verification cannot create another earmark', () => {
  const db = fixture();

  try {
    verify(db);

    assert.throws(
      () => verify(db),
      /not awaiting funding/
    );

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_verifications'
      ).get().n,
      1
    );
  } finally {
    db.close();
  }
});

test('second payout run cannot claim same available balance', () => {
  const db = fixture();

  try {
    verify(db);

    assert.throws(
      () => verify(db, 'run2'),
      /outstanding funding commitment/
    );

    const run = db.prepare(
      "SELECT funding_status FROM payout_runs WHERE id='run2'"
    ).get();

    assert.equal(run.funding_status, 'awaiting_clearance');
  } finally {
    db.close();
  }
});

test('insufficient provider balance is rejected', () => {
  const db = fixture();

  try {
    assert.throws(
      () => verify(db, 'run1', {
        account: {
          ...account,
          availableBalance: '125.49'
        }
      }),
      /insufficient_available_balance/
    );

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_verifications'
      ).get().n,
      0
    );
  } finally {
    db.close();
  }
});

test('wrong source account is rejected', () => {
  const db = fixture();

  try {
    assert.throws(
      () => verify(db, 'run1', {
        accountId: 'WRONG'
      }),
      /account_mismatch/
    );
  } finally {
    db.close();
  }
});

test('already funded runs block new earmarks', () => {
  const db = fixture();

  try {
    db.prepare(`
      UPDATE payout_runs
      SET status='funded',
          funding_status='cleared'
      WHERE id='run1'
    `).run();

    assert.throws(
      () => verify(db, 'run2'),
      /outstanding funding commitment/
    );
  } finally {
    db.close();
  }
});
