import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';

const source = fs.readFileSync('server/index.js', 'utf8');

function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing section: ${start}`);
  return source.slice(a, b);
}

function line(name) {
  const value = source.split('\n').find(
    x => x.startsWith(`function ${name}(`)
  );
  assert.ok(value, `Missing function: ${name}`);
  return value;
}

const route = section(
  '// Administrator-only sandbox return monitoring.',
  '// End administrator-only sandbox return monitoring.'
);

const platformFunctions = section(
  'function isPlatformAdmin(staffId){',
  'function ensurePlatformAdminGrant('
);

const platformMiddleware = section(
  'function requirePlatformAdmin(req,res,next){',
  'function companySlug('
);

const build = new Function(
  'app', 'db', 'crypto', 'Buffer', 'TOKEN_SECRET',
  'MODULR_ENV', 'MODULR_API_KEY',
  'monitorModulrSandboxReturns',
  'assertModulrPreparationTestEnvironment',
  'fetch',
  [
    line('signToken'),
    line('verifyToken'),
    line('bearer'),
    line('adminAuth'),
    platformFunctions,
    platformMiddleware,
    route,
    'return { signToken };'
  ].join('\n')
);

async function scenario(callback, {
  environment = 'sandbox',
  restrictedDatabase = false,
  providerFailure = false,
  credentials = 'synthetic-sandbox-key',
  unsafeFlags = false
} = {}) {
  const previous = {
    MODULR_ENABLED: process.env.MODULR_ENABLED,
    PAYOUT_ACCOUNTING_FINALISATION_ENABLED:
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED,
    AUTOCAB_ADJUSTMENTS_ENABLED:
      process.env.AUTOCAB_ADJUSTMENTS_ENABLED
  };

  process.env.MODULR_ENABLED = unsafeFlags ? 'true' : 'false';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';
  process.env.AUTOCAB_ADJUSTMENTS_ENABLED = 'false';

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

    INSERT INTO staff_users VALUES
      ('platform_admin',1,'administrator'),
      ('ordinary_admin',1,'administrator'),
      ('finance_user',1,'finance');

    INSERT INTO platform_admins VALUES
      ('platform_admin');
  `);

  const app = express();
  let server;
  let monitorCalls = 0;

  const monitor = async () => {
    monitorCalls++;

    if (providerFailure) {
      return {
        ok: false,
        reason: 'provider_search_failed',
        candidates: [],
        returnConfirmed: false,
        accountingAuthorised: false,
        paymentSubmitted: false,
        retryAuthorised: false
      };
    }

    return {
      ok: true,
      checked: 1,
      candidates: [],
      returnConfirmed: false,
      accountingAuthorised: false,
      paymentSubmitted: false,
      retryAuthorised: false,
      requiresManualReview: true
    };
  };

  try {
    const { signToken } = build(
      app,
      db,
      crypto,
      Buffer,
      'synthetic-test-secret-not-for-production',
      environment,
      credentials,
      monitor,
      () => {
        if (restrictedDatabase) {
          throw new Error('Isolated database required');
        }
      },
      async () => {
        throw new Error('Unexpected provider request');
      }
    );

    server = await new Promise((resolve, reject) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
      s.once('error', reject);
    });

    const url = `http://127.0.0.1:${server.address().port}` +
      '/api/admin/modulr/returns/monitor';

    const token = (staffId, mfa = true) =>
      signToken({
        role: 'admin',
        staffRole: 'administrator',
        staffId,
        mfa
      }, 1);

    const request = async auth => {
      const response = await fetch(url, {
        method: 'GET',
        headers: auth
          ? { Authorization: `Bearer ${auth}` }
          : {}
      });

      return {
        status: response.status,
        body: await response.json()
      };
    };

    await callback({ request, token, getMonitorCalls: () => monitorCalls });
  } finally {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }

    db.close();

    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('missing authentication is rejected', async () => {
  await scenario(async ({ request, getMonitorCalls }) => {
    assert.equal((await request()).status, 401);
    assert.equal(getMonitorCalls(), 0);
  });
});

test('invalid authentication is rejected', async () => {
  await scenario(async ({ request, getMonitorCalls }) => {
    assert.equal((await request('invalid')).status, 401);
    assert.equal(getMonitorCalls(), 0);
  });
});

test('missing MFA is rejected', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    assert.equal(
      (await request(token('platform_admin', false))).status,
      401
    );
    assert.equal(getMonitorCalls(), 0);
  });
});

test('ordinary administrator cannot monitor returns', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    assert.equal(
      (await request(token('ordinary_admin'))).status,
      403
    );
    assert.equal(getMonitorCalls(), 0);
  });
});

test('finance user cannot monitor returns', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    assert.equal(
      (await request(token('finance_user'))).status,
      403
    );
    assert.equal(getMonitorCalls(), 0);
  });
});

test('unsafe environment is rejected', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    assert.equal(
      (await request(token('platform_admin'))).status,
      403
    );
    assert.equal(getMonitorCalls(), 0);
  }, { unsafeFlags: true });
});

test('production environment is rejected', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    assert.equal(
      (await request(token('platform_admin'))).status,
      403
    );
    assert.equal(getMonitorCalls(), 0);
  }, { environment: 'production' });
});

test('non-isolated database is rejected', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    assert.equal(
      (await request(token('platform_admin'))).status,
      403
    );
    assert.equal(getMonitorCalls(), 0);
  }, { restrictedDatabase: true });
});

test('successful monitor is review-only', async () => {
  await scenario(async ({ request, token, getMonitorCalls }) => {
    const result = await request(token('platform_admin'));

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.checked, 1);
    assert.equal(result.body.returnConfirmed, false);
    assert.equal(result.body.accountingAuthorised, false);
    assert.equal(result.body.paymentSubmitted, false);
    assert.equal(result.body.retryAuthorised, false);
    assert.equal(getMonitorCalls(), 1);
  });
});

test('provider failure does not authorise accounting', async () => {
  await scenario(async ({ request, token }) => {
    const result = await request(token('platform_admin'));

    assert.equal(result.status, 409);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.accountingAuthorised, false);
    assert.equal(result.body.paymentSubmitted, false);
  }, { providerFailure: true });
});
