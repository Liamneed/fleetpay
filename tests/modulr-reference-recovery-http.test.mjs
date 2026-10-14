import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';

const source = fs.readFileSync('server/index.js', 'utf8');

const begin = source.indexOf(
  '// Administrator-only, GET-only Modulr sandbox reference recovery.'
);
const end = source.indexOf(
  "app.post('/api/admin/integrations/wise/test'", begin
);

assert.ok(begin >= 0 && end > begin);

const authStart = source.indexOf('function signToken(');
const authEnd = source.indexOf('function companySlug(', authStart);
assert.ok(authStart >= 0 && authEnd > authStart);

const build = new Function(
  'app', 'db', 'crypto', 'Buffer', 'TOKEN_SECRET',
  'MODULR_ENV', 'MODULR_API_KEY', 'MODULR_ACCOUNT_ID',
  'assertModulrPreparationTestEnvironment',
  'searchModulrReferenceRecovery', 'isPlatformAdmin',
  [
    source.slice(authStart, authEnd),
    source.slice(begin, end),
    'return { signToken };'
  ].join('\n')
);

async function scenario(callback, options = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE staff_users (
      id TEXT PRIMARY KEY, role TEXT,
      active INTEGER, mfa_enabled INTEGER
    );
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY, provider TEXT,
      environment TEXT, status TEXT,
      provider_transfer_id TEXT,
      amount_minor INTEGER, currency TEXT,
      recipient_id TEXT, attempt_started_at TEXT
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, paid_at TEXT, status TEXT
    );
    INSERT INTO staff_users VALUES
      ('admin','administrator',1,1),
      ('finance','finance',1,1),
      ('inactive','administrator',0,1),
      ('no_mfa','administrator',1,0);
    INSERT INTO payout_transfer_intents VALUES
      ('intent','modulr','sandbox','unknown',
       NULL,2500,'GBP','B_TEST','2026-10-14T08:00:00Z');
    INSERT INTO payouts VALUES ('pay',NULL,'batched');
  `);

  const app = express();
  app.use(express.json());

  const previous = {
    MODULR_ENABLED: process.env.MODULR_ENABLED,
    PAYOUT_ACCOUNTING_FINALISATION_ENABLED:
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED
  };

  process.env.MODULR_ENABLED = 'false';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';

  let lookups = 0;
  let server;

  const search = async ({ intent, sourceAccountId, apiKey }) => {
    lookups++;
    assert.equal(intent.id, 'intent');
    assert.equal(sourceAccountId, 'A_TEST');
    assert.equal(apiKey, 'synthetic-api-key');

    return options.searchResult || {
      verified: true,
      status: 'payment_found',
      providerPaymentId: 'P_TEST',
      providerStatus: 'PROCESSED',
      amountMinor: 2500,
      requiresIndependentPaymentRetrieval: true,
      requiresManualReconciliation: true,
      automaticRetryAllowed: false,
      accountingFinalised: false,
      paymentSubmitted: false
    };
  };

  const { signToken } = build(
    app, db, crypto, Buffer, 'synthetic-local-test-secret',
    'sandbox', 'synthetic-api-key', 'A_TEST',
    () => {
      if (options.restricted) {
        throw new Error('Isolated database required.');
      }
    },
    search,
    () => options.platformAdmin !== false
  );

  const token = (staffRole = 'administrator',
                 mfa = true, staffId = 'admin') =>
    signToken({ role: 'admin', staffRole, mfa, staffId }, 1);

  const snapshot = () => ({
    intent: db.prepare(
      'SELECT * FROM payout_transfer_intents'
    ).all(),
    payouts: db.prepare('SELECT * FROM payouts').all()
  });

  try {
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    });

    const request = async (auth, id = 'intent') => {
      const url =
        `http://127.0.0.1:${server.address().port}` +
        `/api/admin/modulr/transfers/${id}/reference-recovery`;

      const response = await fetch(url, {
        method: 'GET',
        headers: auth ? { Authorization: `Bearer ${auth}` } : {}
      });

      return {
        status: response.status,
        body: await response.json()
      };
    };

    await callback({
      db, request, token, snapshot, lookups: () => lookups
    });
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close(e => e ? reject(e) : resolve())
      );
    }
    db.close();

    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('Unauthorised requests never invoke provider search',
  () => scenario(async ({ request, token, lookups }) => {
    assert.equal((await request()).status, 401);
    assert.equal((await request('invalid')).status, 401);
    assert.equal(
      (await request(token('administrator', false))).status, 401
    );
    assert.equal(
      (await request(token('finance', true, 'finance'))).status, 403
    );
    assert.equal(lookups(), 0);
  })
);

test('Non-platform administrator is rejected',
  () => scenario(async ({ request, token, lookups }) => {
    assert.equal((await request(token())).status, 403);
    assert.equal(lookups(), 0);
  }, { platformAdmin: false })
);

test('Non-isolated database is rejected before lookup',
  () => scenario(async ({ request, token, lookups }) => {
    assert.equal((await request(token())).status, 409);
    assert.equal(lookups(), 0);
  }, { restricted: true })
);

test('Inactive or non-MFA staff accounts are rejected',
  () => scenario(async ({ request, token, lookups }) => {
    assert.equal(
      (await request(token('administrator', true, 'inactive'))).status,
      403
    );
    assert.equal(
      (await request(token('administrator', true, 'no_mfa'))).status,
      403
    );
    assert.equal(lookups(), 0);
  })
);

test('Invalid, missing or ineligible transfers cannot be searched',
  () => scenario(async ({ db, request, token, lookups }) => {
    const auth = token();
    assert.equal((await request(auth, 'bad!')).status, 400);
    assert.equal((await request(auth, 'missing')).status, 404);

    db.prepare(
      "UPDATE payout_transfer_intents SET status='prepared'"
    ).run();
    assert.equal((await request(auth)).status, 409);

    db.prepare(
      "UPDATE payout_transfer_intents SET status='unknown', provider_transfer_id='P_KNOWN'"
    ).run();
    assert.equal((await request(auth)).status, 409);

    assert.equal(lookups(), 0);
  })
);

test('Successful investigation does not change financial records',
  () => scenario(async ({ request, token, snapshot, lookups }) => {
    const before = snapshot();

    const first = await request(token());
    const second = await request(token());

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.providerPaymentId, 'P_TEST');
    assert.equal(first.body.paymentExecutionEnabled, false);
    assert.equal(first.body.automaticRetryAllowed, false);
    assert.equal(first.body.accountingFinalised, false);
    assert.equal(lookups(), 2);
    assert.deepEqual(snapshot(), before);
  })
);

test('Unresolved provider search never changes financial records',
  () => scenario(async ({ request, token, snapshot }) => {
    const before = snapshot();
    const response = await request(token());

    assert.equal(response.status, 200);
    assert.equal(response.body.verified, false);
    assert.equal(response.body.automaticRetryAllowed, false);
    assert.deepEqual(snapshot(), before);
  }, {
    searchResult: {
      verified: false,
      status: 'unknown',
      reason: 'provider_search_uncertain',
      automaticRetryAllowed: false
    }
  })
);

test('Unexpected successful-looking result fails closed',
  () => scenario(async ({ request, token, snapshot }) => {
    const before = snapshot();
    const response = await request(token());

    assert.equal(response.status, 200);
    assert.equal(response.body.verified, false);
    assert.equal(response.body.status, 'unknown');
    assert.equal(response.body.providerPaymentId, null);
    assert.equal(response.body.automaticRetryAllowed, false);
    assert.equal(response.body.accountingFinalised, false);
    assert.deepEqual(snapshot(), before);
  }, {
    searchResult: {
      verified: true,
      status: 'payment_found',
      providerPaymentId: 'P_TEST',
      providerStatus: 'PROCESSED',
      amountMinor: 9999,
      automaticRetryAllowed: false,
      accountingFinalised: false,
      paymentSubmitted: false,
      requiresIndependentPaymentRetrieval: true,
      requiresManualReconciliation: true
    }
  })
);
