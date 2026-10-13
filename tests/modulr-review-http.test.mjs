
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { listModulrTransfersForReview } from '../server/lib/modulr-transfer-review.mjs';

const source = fs.readFileSync('server/index.js', 'utf8');

function extractFunction(name) {
  const line = source.split('\n').find(x =>
    x.startsWith(`function ${name}(`)
  );
  assert.ok(line, `${name} missing from server`);
  return line;
}

const routeStart = source.indexOf(
  '// Read-only Modulr sandbox transfer investigation.'
);
const routeEnd = source.indexOf(
  '// Modulr payout-run preview only.', routeStart
);

assert.ok(routeStart >= 0 && routeEnd > routeStart);

const routeSource = source.slice(routeStart, routeEnd);

const buildApp = new Function(
  'app', 'db', 'crypto', 'Buffer', 'TOKEN_SECRET',
  'listModulrTransfersForReview', 'MODULR_ENV', 'MODULR_ENABLED',
  'console',
  [
    extractFunction('signToken'),
    extractFunction('verifyToken'),
    extractFunction('bearer'),
    extractFunction('adminAuth'),
    extractFunction('requireStaffRole'),
    routeSource,
    'return { signToken };'
  ].join('\n')
);

test('Actual Modulr endpoint enforces authentication and finance roles', async () => {
  const db = new DatabaseSync(':memory:');
  let server;

  try {
    db.exec(`
      CREATE TABLE payout_transfer_intents (
        id TEXT PRIMARY KEY, payout_id TEXT,
        payout_run_id TEXT, provider TEXT,
        environment TEXT, status TEXT,
        amount_minor INTEGER, currency TEXT,
        provider_transfer_id TEXT,
        updated_at TEXT, submitted_at TEXT,
        recipient_id TEXT
      )
    `);

    db.prepare(`
      INSERT INTO payout_transfer_intents
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      'TEST_TRANSFER', 'TEST_PAYOUT', 'TEST_RUN',
      'modulr', 'sandbox', 'unknown', 2500, 'GBP',
      null, '2026-10-13T12:00:00Z', null,
      'PRIVATE_BENEFICIARY'
    );

    const app = express();
    const { signToken } = buildApp(
      app, db, crypto, Buffer,
      'isolated-test-secret-not-a-real-credential',
      listModulrTransfersForReview,
      'sandbox', false, console
    );

    server = await new Promise((resolve, reject) => {
      const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
      listener.once('error', reject);
    });

    const url = `http://127.0.0.1:${server.address().port}/api/admin/modulr/transfers/review`;

    const request = async token => {
      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      return { status: response.status, body: await response.json() };
    };

    const token = (staffRole, mfa = true) => signToken({
      role: 'admin', staffRole, mfa,
      staffId: 'SYNTHETIC_STAFF'
    }, 1);

    const before = db.prepare(
      'SELECT * FROM payout_transfer_intents'
    ).all();

    assert.equal((await request()).status, 401);
    assert.equal((await request('invalid')).status, 401);
    assert.equal((await request(token('finance', false))).status, 401);

    for (const role of ['office', 'readonly']) {
      assert.equal((await request(token(role))).status, 403);
    }

    for (const role of ['finance', 'administrator']) {
      const result = await request(token(role));
      assert.equal(result.status, 200);
      assert.equal(result.body.ok, true);
      assert.equal(result.body.reviewOnly, true);
      assert.equal(result.body.paymentExecutionEnabled, false);
      assert.equal(result.body.automaticRetryEnabled, false);
      assert.equal(result.body.count, 1);
      assert.equal(result.body.transfers[0].status, 'unknown');
      assert.equal(result.body.transfers[0].automaticRetryAllowed, false);
      assert.equal(
        JSON.stringify(result.body).includes('PRIVATE_BENEFICIARY'),
        false
      );
    }

    assert.deepEqual(
      db.prepare('SELECT * FROM payout_transfer_intents').all(),
      before
    );
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close(error => error ? reject(error) : resolve())
      );
    }
    db.close();
  }
});
