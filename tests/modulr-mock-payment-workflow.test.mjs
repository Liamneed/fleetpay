import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createModulrPaymentHistoryTable } from '../server/lib/modulr-payment-history.mjs';
import { runMockModulrPaymentWorkflow } from
  '../server/lib/modulr-mock-payment-workflow.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY,
      payout_id TEXT, payout_run_id TEXT,
      provider TEXT, environment TEXT, status TEXT,
      provider_transfer_id TEXT, confirmed_at TEXT,
      amount_minor INTEGER, currency TEXT, recipient_id TEXT,
      recipient_snapshot_at TEXT, recipient_account_last4 TEXT,
      recipient_sort_code_last2 TEXT, updated_at TEXT,
      attempt_started_at TEXT, idempotency_key TEXT,
      provider_status TEXT, submitted_at TEXT
    );
    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY, provider TEXT, status TEXT,
      funding_status TEXT, funds_cleared_at TEXT,
      provider_ref TEXT, released_at TEXT, paid_at TEXT,
      item_count INTEGER, total_amount REAL, run_type TEXT
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, payout_run_id TEXT, driver_id INTEGER,
      type TEXT, status TEXT, paid_at TEXT, net_amount REAL, amount REAL
    );
    CREATE TABLE driver_cache (
      driver_id INTEGER PRIMARY KEY, payout_excluded INTEGER
    );
    CREATE TABLE driver_bank_accounts (
      driver_id INTEGER PRIMARY KEY, updated_at TEXT,
      sort_code_enc TEXT, account_number_enc TEXT,
      sort_code_last2 TEXT, account_number_last4 TEXT
    );
    CREATE TABLE payout_confirmations (payout_id TEXT);
  `);

  db.prepare(`INSERT INTO payout_transfer_intents (
    id,payout_id,payout_run_id,provider,environment,status,
    amount_minor,currency,recipient_id,recipient_snapshot_at,
    recipient_account_last4,recipient_sort_code_last2,idempotency_key
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    'intent','pay','run','modulr','sandbox','prepared',
    2500,'GBP','beneficiary','2026-10-12T18:50:00Z',
    '1234','56','nonce_integration_299'
  );

  db.prepare(`INSERT INTO payout_runs VALUES
    ('run','modulr','funded','cleared','2026-10-12T18:00:00Z',
     NULL,NULL,NULL,1,25,'early')`).run();

  db.prepare(`INSERT INTO payouts VALUES
    ('pay','run',1,'early','batched',NULL,25,25)`).run();

  db.prepare('INSERT INTO driver_cache VALUES (1,0)').run();

  db.prepare(`INSERT INTO driver_bank_accounts VALUES
    (1,'2026-10-12T16:00:00Z',
     'test_sort','test_account','56','1234')`).run();

  const beneficiaryMatch = {
    matched:true,
    beneficiaryId:'beneficiary',
    status:'ACTIVE',
    approvalStatus:'APPROVED',
    approvalRequired:false,
    bankUpdatedAt:'2026-10-12T16:00:00Z',
    bankSortCodeEnc:'test_sort',
    bankAccountNumberEnc:'test_account'
  };

  createModulrPaymentHistoryTable(db);
  return { db, beneficiaryMatch };
}

async function withFixture(fn) {
  const { db, beneficiaryMatch } = fixture();
  const names = [
    'MODULR_MOCK_WORKFLOW',
    'MODULR_SANDBOX_POST_ENABLED',
    'MODULR_ENV',
    'MODULR_ENABLED',
    'PAYOUT_ACCOUNTING_FINALISATION_ENABLED'
  ];

  const previous = Object.fromEntries(
    names.map(name => [name, process.env[name]])
  );

  try {
    process.env.MODULR_MOCK_WORKFLOW = 'true';
    process.env.MODULR_SANDBOX_POST_ENABLED = 'true';
    process.env.MODULR_ENV = 'sandbox';
    process.env.MODULR_ENABLED = 'false';
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';

    return await fn(db, beneficiaryMatch);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    db.close();
  }
}

const getTransfer = db => db.prepare(
  'SELECT * FROM payout_transfer_intents WHERE id=?'
).get('intent');

const paidAt = db => db.prepare(
  'SELECT paid_at FROM payouts WHERE id=?'
).get('pay').paid_at;

test('Mock 201 records submitted but never paid', () =>
  withFixture(async (db, beneficiaryMatch) => {
    let calls = 0;
    const result = await runMockModulrPaymentWorkflow({
      db, intentId:'intent', beneficiaryMatch,
      fetchImpl:async () => {
        calls++;
        return {
          status:201,
          json:async () => ({
            id:'P_TEST_1',
            status:'VALIDATED'
          })
        };
      }
    });

    assert.equal(calls,1);
    assert.equal(result.status,'submitted');
    assert.equal(getTransfer(db).status,'submitted');
    assert.equal(getTransfer(db).provider_transfer_id,'P_TEST_1');
    assert.ok(getTransfer(db).attempt_started_at);
    assert.equal(paidAt(db),null);

    await assert.rejects(
      runMockModulrPaymentWorkflow({
        db, intentId:'intent', beneficiaryMatch,
        fetchImpl:async () => { calls++; }
      })
    );
    assert.equal(calls,1);
    assert.equal(paidAt(db),null);
  })
);

test('Mock timeout remains unknown and cannot retry', () =>
  withFixture(async (db, beneficiaryMatch) => {
    let calls = 0;
    const result = await runMockModulrPaymentWorkflow({
      db, intentId:'intent', beneficiaryMatch,
      fetchImpl:async () => {
        calls++;
        throw new Error('Simulated timeout');
      }
    });

    assert.equal(calls,1);
    assert.equal(result.status,'unknown');
    assert.equal(getTransfer(db).status,'unknown');
    assert.ok(getTransfer(db).attempt_started_at);
    assert.equal(paidAt(db),null);

    await assert.rejects(
      runMockModulrPaymentWorkflow({
        db, intentId:'intent', beneficiaryMatch,
        fetchImpl:async () => { calls++; }
      })
    );
    assert.equal(calls,1);
  })
);

test('Mock workflow cannot run without its test-only switch', async () => {
  const { db, beneficiaryMatch } = fixture();
  const previous = process.env.MODULR_MOCK_WORKFLOW;
  try {
    delete process.env.MODULR_MOCK_WORKFLOW;

    let calls = 0;
    await assert.rejects(
      runMockModulrPaymentWorkflow({
        db, intentId:'intent', beneficiaryMatch,
        fetchImpl:async () => { calls++; }
      }),
      /Synthetic mock workflow only/
    );

    assert.equal(calls,0);
    assert.equal(getTransfer(db).status,'prepared');
  } finally {
    if (previous === undefined) delete process.env.MODULR_MOCK_WORKFLOW;
    else process.env.MODULR_MOCK_WORKFLOW = previous;
    db.close();
  }
});
