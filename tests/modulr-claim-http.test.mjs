
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { claimValidatedModulrTransfer } from '../server/lib/modulr-validated-claim.mjs';

const source = fs.readFileSync('server/index.js', 'utf8');

function extractFunction(name) {
  const line = source.split('\n').find(x =>
    x.startsWith(`function ${name}(`)
  );
  assert.ok(line, `Missing function: ${name}`);
  return line;
}

const begin = source.indexOf(
  '// Isolated fixture only: fresh provider verification and atomic claim.'
);
const end = source.indexOf(
  '// Read-only Modulr sandbox transfer investigation.', begin
);
assert.ok(begin >= 0 && end > begin);

const buildApp = new Function(
  'app', 'db', 'crypto', 'Buffer', 'TOKEN_SECRET',
  'claimValidatedModulrTransfer',
  'assertModulrPreparationTestEnvironment',
  'findModulrSandboxBankMatch',
  [
    extractFunction('signToken'),
    extractFunction('verifyToken'),
    extractFunction('bearer'),
    extractFunction('adminAuth'),
    extractFunction('requireStaffRole'),
    source.slice(begin, end),
    'return { signToken };'
  ].join('\n')
);

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY, payout_id TEXT,
      payout_run_id TEXT, provider TEXT,
      environment TEXT, status TEXT,
      provider_transfer_id TEXT, confirmed_at TEXT,
      amount_minor INTEGER, currency TEXT,
      recipient_id TEXT, recipient_snapshot_at TEXT,
      recipient_account_last4 TEXT,
      recipient_sort_code_last2 TEXT, updated_at TEXT
    );
    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY, provider TEXT,
      status TEXT, funding_status TEXT,
      funds_cleared_at TEXT, provider_ref TEXT,
      released_at TEXT, paid_at TEXT,
      item_count INTEGER, total_amount REAL,
      run_type TEXT
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, payout_run_id TEXT,
      driver_id INTEGER, type TEXT,
      status TEXT, paid_at TEXT,
      net_amount REAL, amount REAL
    );
    CREATE TABLE driver_cache (
      driver_id INTEGER PRIMARY KEY,
      payout_excluded INTEGER
    );
    CREATE TABLE driver_bank_accounts (
      driver_id INTEGER PRIMARY KEY,
      updated_at TEXT, sort_code_enc TEXT,
      account_number_enc TEXT,
      sort_code_last2 TEXT,
      account_number_last4 TEXT
    );
    CREATE TABLE payout_confirmations (payout_id TEXT);
  `);

  db.exec(`
    INSERT INTO payout_transfer_intents VALUES
      ('intent','pay','run','modulr','sandbox',
       'prepared',NULL,NULL,2500,'GBP','beneficiary',
       '2026-10-12T18:50:00Z','1234','56',NULL);
    INSERT INTO payout_runs VALUES
      ('run','modulr','funded','cleared',
       '2026-10-12T18:00:00Z',NULL,NULL,NULL,1,25,'early');
    INSERT INTO payouts VALUES
      ('pay','run',1,'early','batched',NULL,25,25);
    INSERT INTO driver_cache VALUES (1,0);
    INSERT INTO driver_bank_accounts VALUES
      (1,'2026-10-12T16:00:00Z',
       'test_sort','test_account','56','1234');
  `);

  return db;
}

const goodMatch = {
  matched: true,
  beneficiaryId: 'beneficiary',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  approvalRequired: false,
  bankUpdatedAt: '2026-10-12T16:00:00Z',
  bankSortCodeEnc: 'test_sort',
  bankAccountNumberEnc: 'test_account'
};

async function runScenario(callback, {
  match = goodMatch,
  restricted = false
} = {}) {
  const db = fixture();
  const app = express();
  let lookups = 0;
  let server;

  const { signToken } = buildApp(
    app, db, crypto, Buffer,
    'synthetic-local-test-token-secret',
    claimValidatedModulrTransfer,
    () => {
      if (restricted) {
        throw new Error(
          'Modulr preparation is restricted to the isolated test database.'
        );
      }
    },
    async () => {
      lookups++;
      return structuredClone(match);
    }
  );

  try {
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    });

    const url =
      `http://127.0.0.1:${server.address().port}` +
      '/api/admin/modulr/transfers/intent/claim-test';

    const token = (staffRole, mfa = true) =>
      signToken({
        role: 'admin',
        mfa,
        staffRole,
        staffId: 'TEST_ONLY'
      }, 1);

    const request = async (auth) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: auth ? { Authorization: `Bearer ${auth}` } : {}
      });
      return {
        status: response.status,
        body: await response.json()
      };
    };

    const state = () =>
      db.prepare(
        'SELECT status FROM payout_transfer_intents WHERE id=?'
      ).get('intent').status;

    await callback({
      db, request, token, state,
      lookups: () => lookups
    });
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close(e => e ? reject(e) : resolve())
      );
    }
    db.close();
  }
}

test('Claim endpoint rejects unauthorised requests', async () => {
  await runScenario(async ({ request, token, state, lookups }) => {
    assert.equal((await request()).status, 401);
    assert.equal((await request('invalid')).status, 401);
    assert.equal((await request(token('finance', false))).status, 401);
    assert.equal((await request(token('office'))).status, 403);
    assert.equal((await request(token('readonly'))).status, 403);
    assert.equal(state(), 'prepared');
    assert.equal(lookups(), 0);
  });
});

test('Claim endpoint enforces isolated database boundary', async () => {
  await runScenario(async ({ request, token, state, lookups }) => {
    assert.equal((await request(token('finance'))).status, 403);
    assert.equal(state(), 'prepared');
    assert.equal(lookups(), 0);
  }, { restricted: true });
});

test('Claim rejects unapproved beneficiary', async () => {
  await runScenario(async ({ request, token, state }) => {
    assert.equal((await request(token('finance'))).status, 409);
    assert.equal(state(), 'prepared');
  }, { match: { ...goodMatch, approvalStatus: 'PENDING' } });
});

test('Claim rejects changed bank details', async () => {
  await runScenario(async ({ request, token, state }) => {
    assert.equal((await request(token('finance'))).status, 409);
    assert.equal(state(), 'prepared');
  }, {
    match: { ...goodMatch, bankAccountNumberEnc: 'different' }
  });
});

test('Valid claim succeeds once without paying', async () => {
  await runScenario(async ({ db, request, token, state, lookups }) => {
    const first = await request(token('finance'));
    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'submitting');
    assert.equal(first.body.paymentSubmitted, false);
    assert.equal(first.body.paymentExecutionEnabled, false);
    assert.equal(first.body.accountingFinalised, false);
    assert.equal(state(), 'submitting');

    const second = await request(token('finance'));
    assert.equal(second.status, 409);
    assert.equal(lookups(), 1);

    assert.equal(
      db.prepare('SELECT paid_at FROM payouts').get().paid_at,
      null
    );
    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM payout_confirmations'
      ).get().n,
      0
    );
  });
});

test('Concurrent claims have only one winner', async () => {
  await runScenario(async ({ request, token, state }) => {
    const auth = token('administrator');
    const results = await Promise.all([
      request(auth),
      request(auth)
    ]);

    assert.deepEqual(
      results.map(x => x.status).sort(),
      [200, 409]
    );
    assert.equal(state(), 'submitting');
  });
});
