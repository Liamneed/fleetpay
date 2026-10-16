import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';

import {
  reconcileAuthenticatedModulrTransfer
} from '../server/lib/modulr-authenticated-reconciliation.mjs';

import {
  createModulrPaymentHistoryTable,
  getModulrPaymentHistory
} from '../server/lib/modulr-payment-history.mjs';

const source = fs.readFileSync('server/index.js', 'utf8');

function extractLine(name) {
  const line = source.split('\n').find(
    x => x.startsWith(`function ${name}(`)
  );
  assert.ok(line, `Missing ${name}`);
  return line;
}

function extractSection(begin, end) {
  const a = source.indexOf(begin);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing section ${begin}`);
  return source.slice(a, b);
}

const route = extractSection(
  '// Administrator-only reconciliation of an EXISTING sandbox payment.',
  '// Authenticated, read-only Modulr transfer timeline.'
);

const platformFunctions = extractSection(
  'function isPlatformAdmin(staffId){',
  'function ensurePlatformAdminGrant('
);

const platformMiddleware = extractSection(
  'function requirePlatformAdmin(req,res,next){',
  'function companySlug('
);

const build = new Function(
  'app', 'db', 'crypto', 'Buffer', 'TOKEN_SECRET',
  'reconcileAuthenticatedModulrTransfer',
  'MODULR_ENV', 'MODULR_ENABLED',
  'MODULR_API_KEY', 'MODULR_ACCOUNT_ID',
  'console',
  'assertModulrPreparationTestEnvironment',
  [
    extractLine('signToken'),
    extractLine('verifyToken'),
    extractLine('bearer'),
    extractLine('adminAuth'),
    platformFunctions,
    platformMiddleware,
    route,
    'return {signToken};'
  ].join('\n')
);

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE staff_users (
      id TEXT PRIMARY KEY,
      active INTEGER NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE platform_admins (
      staff_id TEXT PRIMARY KEY
    );

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

    INSERT INTO staff_users VALUES
      ('platform_admin',1,'administrator'),
      ('ordinary_admin',1,'administrator'),
      ('inactive_admin',0,'administrator'),
      ('finance_user',1,'finance');

    INSERT INTO platform_admins VALUES
      ('platform_admin'),
      ('inactive_admin');

    INSERT INTO payout_transfer_intents VALUES (
      'intent','modulr','sandbox','submitted',
      'P_TEST_001','SUBMITTED',
      'BENEFICIARY_001',100,'GBP',NULL,NULL
    );
  `);

  createModulrPaymentHistoryTable(db);
  return db;
}

function providerPayment() {
  return {
    id: 'P_TEST_001',
    status: 'PROCESSED',
    details: {
      sourceAccountId: 'SOURCE_001',
      destination: {
        type: 'BENEFICIARY',
        id: 'BENEFICIARY_001'
      },
      amount: 1,
      currency: 'GBP'
    }
  };
}

async function scenario(callback, {
  providerStatus = 'PROCESSED',
  environment = 'sandbox',
  restrictedDatabase = false
} = {}) {
  const db = fixture();
  const app = express();
  app.use(express.json());

  let server;
  let providerRequests = 0;
  let providerPosts = 0;

  const mockFetch = async (url, options) => {
    providerRequests++;

    if (options?.method !== 'GET') {
      providerPosts++;
      throw new Error('Unsafe provider request');
    }

    assert.ok(String(url).endsWith('/P_TEST_001'));

    const payment = providerPayment();
    payment.status = providerStatus;

    return {
      status: 200,
      json: async () => payment
    };
  };

  const reconciler = args =>
    reconcileAuthenticatedModulrTransfer({
      ...args,
      fetchImpl: mockFetch
    });

  const {signToken} = build(
    app, db, crypto, Buffer,
    'synthetic-test-secret-not-for-production',
    reconciler,
    environment,
    false,
    'synthetic-modulr-api-key',
    'SOURCE_001',
    {error: () => {}},
    () => {
      if (restrictedDatabase) {
        throw new Error('Isolated sandbox database required.');
      }
      return true;
    }
  );

  try {
    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    });

    const url = `http://127.0.0.1:${server.address().port}` +
      '/api/admin/modulr/transfers/intent/reconcile';

    const token = (staffId, mfa = true) =>
      signToken({
        role: 'admin',
        staffRole: 'administrator',
        staffId,
        mfa
      }, 1);

    const request = async (auth, body) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(auth ? {Authorization: `Bearer ${auth}`} : {})
        },
        body: JSON.stringify(body || {})
      });

      return {
        status: response.status,
        body: await response.json()
      };
    };

    const state = () => db.prepare(`
      SELECT status,confirmed_at
      FROM payout_transfer_intents
      WHERE id='intent'
    `).get();

    await callback({
      request, token, state,
      db,
      providerRequests: () => providerRequests,
      providerPosts: () => providerPosts,
      history: () => getModulrPaymentHistory(db, 'intent')
    });

    assert.equal(providerPosts, 0);
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close(e => e ? reject(e) : resolve())
      );
    }
    db.close();
  }
}

test('unauthenticated request rejected before provider lookup', async () => {
  await scenario(async x => {
    const r = await x.request();
    assert.equal(r.status, 401);
    assert.equal(x.providerRequests(), 0);
    assert.equal(x.state().status, 'submitted');
  });
});

test('MFA is required before provider lookup', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('platform_admin', false));
    assert.equal(r.status, 401);
    assert.equal(x.providerRequests(), 0);
  });
});

test('finance staff cannot reconcile', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('finance_user'));
    assert.equal(r.status, 403);
    assert.equal(x.providerRequests(), 0);
  });
});

test('administrator without platform grant is rejected', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('ordinary_admin'));
    assert.equal(r.status, 403);
    assert.equal(x.providerRequests(), 0);
  });
});

test('inactive platform administrator is rejected', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('inactive_admin'));
    assert.equal(r.status, 403);
    assert.equal(x.providerRequests(), 0);
  });
});

test('valid administrator confirms existing payment once', async () => {
  await scenario(async x => {
    const first = await x.request(x.token('platform_admin'));

    assert.equal(first.status, 200);
    assert.equal(first.body.status, 'confirmed');
    assert.equal(first.body.accountingFinalised, false);
    assert.equal(first.body.autocabReconciled, false);

    assert.equal(x.state().status, 'confirmed');
    assert.ok(x.state().confirmed_at);
    assert.equal(x.history().length, 1);

    const second = await x.request(x.token('platform_admin'));

    assert.equal(second.status, 409);
    assert.equal(x.providerRequests(), 1);
    assert.equal(x.history().length, 1);
  });
});

test('non-final provider status cannot confirm payment', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('platform_admin'));

    assert.equal(r.status, 409);
    assert.equal(x.state().status, 'submitted');
    assert.equal(x.history().length, 0);
  }, {providerStatus: 'SUBMITTED'});
});

test('production environment blocks reconciliation', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('platform_admin'));

    assert.equal(r.status, 403);
    assert.equal(x.providerRequests(), 0);
    assert.equal(x.state().status, 'submitted');
  }, {environment: 'production'});
});

test('request body cannot override provider payment details', async () => {
  await scenario(async x => {
    const r = await x.request(x.token('platform_admin'), {
      status: 'PROCESSED',
      amount: 9999,
      beneficiaryId: 'ATTACKER',
      paymentId: 'OTHER_PAYMENT'
    });

    assert.equal(r.status, 200);
    assert.equal(x.providerRequests(), 1);
    assert.equal(x.state().status, 'confirmed');
    assert.equal(x.history().length, 1);
  });
});

test('database restriction blocks reconciliation before provider lookup', async () => {
  await scenario(async x => {
    const response = await x.request(x.token('platform_admin'));

    assert.equal(response.status, 403);
    assert.equal(x.providerRequests(), 0);
    assert.equal(x.state().status, 'submitted');
    assert.equal(x.history().length, 0);
  }, {restrictedDatabase: true});
});
