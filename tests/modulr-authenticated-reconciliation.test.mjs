import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createModulrPaymentHistoryTable,
  getModulrPaymentHistory
} from '../server/lib/modulr-payment-history.mjs';

import {
  reconcileAuthenticatedModulrTransfer
} from '../server/lib/modulr-authenticated-reconciliation.mjs';

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
      'intent','modulr','sandbox','submitted',
      'TEST_REFERENCE_001','SUBMITTED',
      'beneficiary_001',2500,'GBP',NULL,NULL
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

const settings = {
  intentId: 'intent',
  apiKey: 'mock-api-key',
  sourceAccountId: 'source_001'
};

async function scenario(change, expectedVerified) {
  const db = fixture();
  let requests = 0;

  const fetchImpl = async (url, options) => {
    requests++;

    assert.equal(options.method, 'GET');
    assert.ok(url.endsWith('/TEST_REFERENCE_001'));

    const result = payment();
    if (change) change(result);

    return {
      status: 200,
      json: async () => result
    };
  };

  try {
    const result = await reconcileAuthenticatedModulrTransfer({
      db,
      ...settings,
      fetchImpl
    });

    assert.equal(requests, 1);

    const row = db.prepare(`
      SELECT status,confirmed_at
      FROM payout_transfer_intents WHERE id='intent'
    `).get();

    const history = getModulrPaymentHistory(db, 'intent');

    if (expectedVerified) {
      assert.equal(result.providerVerified, true);
      assert.equal(result.accountingFinalised, false);
      assert.equal(result.autocabReconciled, false);
      assert.equal(row.status, 'confirmed');
      assert.ok(row.confirmed_at);
      assert.equal(history.length, 1);
    } else {
      assert.equal(result.ok, false);
      assert.equal(row.status, 'submitted');
      assert.equal(row.confirmed_at, null);
      assert.equal(history.length, 0);
    }
  } finally {
    db.close();
  }
}

test('authenticated GET confirms matching payment', async () => {
  await scenario(null, true);
});

test('non-final provider status cannot confirm', async () => {
  await scenario(p => { p.status = 'SUBMITTED'; }, false);
});

test('incorrect beneficiary cannot confirm', async () => {
  await scenario(p => {
    p.details.destination.id = 'incorrect';
  }, false);
});

test('incorrect amount cannot confirm', async () => {
  await scenario(p => {
    p.details.amount = 26;
  }, false);
});

test('incorrect source account cannot confirm', async () => {
  await scenario(p => {
    p.details.sourceAccountId = 'incorrect';
  }, false);
});

test('duplicate reconciliation cannot repeat provider lookup', async () => {
  const db = fixture();
  let requests = 0;

  const fetchImpl = async () => {
    requests++;
    return {
      status: 200,
      json: async () => payment()
    };
  };

  try {
    const args = { db, ...settings, fetchImpl };

    await reconcileAuthenticatedModulrTransfer(args);

    await assert.rejects(
      () => reconcileAuthenticatedModulrTransfer(args),
      /not eligible/
    );

    assert.equal(requests, 1);
    assert.equal(getModulrPaymentHistory(db, 'intent').length, 1);
  } finally {
    db.close();
  }
});

test('provider retrieval failure never confirms', async () => {
  const db = fixture();

  try {
    await assert.rejects(
      () => reconcileAuthenticatedModulrTransfer({
        db,
        ...settings,
        fetchImpl: async () => ({
          status: 503,
          json: async () => ({})
        })
      }),
      /retrieval unsuccessful/
    );

    const row = db.prepare(`
      SELECT status,confirmed_at
      FROM payout_transfer_intents WHERE id='intent'
    `).get();

    assert.equal(row.status, 'submitted');
    assert.equal(row.confirmed_at, null);
    assert.equal(getModulrPaymentHistory(db, 'intent').length, 0);
  } finally {
    db.close();
  }
});

test('production environment is rejected', async () => {
  const db = fixture();
  const previous = process.env.MODULR_ENV;

  try {
    process.env.MODULR_ENV = 'production';

    await assert.rejects(
      () => reconcileAuthenticatedModulrTransfer({
        db,
        ...settings,
        fetchImpl: async () => {
          throw new Error('Must not make provider request');
        }
      }),
      /Sandbox reconciliation only/
    );
  } finally {
    if (previous === undefined) delete process.env.MODULR_ENV;
    else process.env.MODULR_ENV = previous;
    db.close();
  }
});
