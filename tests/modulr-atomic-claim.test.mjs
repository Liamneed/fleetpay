import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { claimValidatedModulrTransfer } from '../server/lib/modulr-validated-claim.mjs';
import { transitionModulrTransfer } from '../server/lib/modulr-transfer-store.mjs';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY, payout_id TEXT, payout_run_id TEXT, provider TEXT,
      environment TEXT, status TEXT, provider_transfer_id TEXT, confirmed_at TEXT,
      amount_minor INTEGER, currency TEXT, recipient_id TEXT,
      recipient_snapshot_at TEXT, recipient_account_last4 TEXT,
      recipient_sort_code_last2 TEXT, updated_at TEXT
    );
    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY, provider TEXT, status TEXT, funding_status TEXT,
      funds_cleared_at TEXT, provider_ref TEXT, released_at TEXT, paid_at TEXT,
      item_count INTEGER, total_amount REAL, run_type TEXT
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, payout_run_id TEXT, driver_id INTEGER, type TEXT,
      status TEXT, paid_at TEXT, net_amount REAL, amount REAL
    );
    CREATE TABLE driver_cache (driver_id INTEGER PRIMARY KEY, payout_excluded INTEGER);
    CREATE TABLE driver_bank_accounts (
      driver_id INTEGER PRIMARY KEY, updated_at TEXT, sort_code_enc TEXT,
      account_number_enc TEXT, sort_code_last2 TEXT, account_number_last4 TEXT
    );
    CREATE TABLE payout_confirmations (payout_id TEXT);
  `);
  db.prepare(`INSERT INTO payout_transfer_intents VALUES
    ('intent','pay','run','modulr','sandbox','prepared',NULL,NULL,
     2500,'GBP','beneficiary','2026-10-12T18:50:00Z','1234','56',NULL)`).run();
  db.prepare(`INSERT INTO payout_runs VALUES
    ('run','modulr','funded','cleared','2026-10-12T18:00:00Z',NULL,NULL,NULL,1,25,'early')`).run();
  db.prepare(`INSERT INTO payouts VALUES
    ('pay','run',1,'early','batched',NULL,25,25)`).run();
  db.prepare('INSERT INTO driver_cache VALUES (1,0)').run();
  db.prepare(`INSERT INTO driver_bank_accounts VALUES
    (1,'2026-10-12T16:00:00Z','test_sort','test_account','56','1234')`).run();
  const match = {
    matched:true,beneficiaryId:'beneficiary',status:'ACTIVE',
    approvalStatus:'APPROVED',approvalRequired:false,
    bankUpdatedAt:'2026-10-12T16:00:00Z',
    bankSortCodeEnc:'test_sort',bankAccountNumberEnc:'test_account'
  };
  return {db,match};
}
function withFixture(callback) {
  const {db,match}=fixture();
  try { return callback(db,match); } finally { db.close(); }
}
function status(db) {
  return db.prepare('SELECT status FROM payout_transfer_intents WHERE id=?').get('intent').status;
}

test('Claim is atomic, one-time and does not pay', () => withFixture((db,match)=> {
  const result=claimValidatedModulrTransfer(db,'intent',match);
  assert.equal(result.status,'submitting');
  assert.equal(result.paymentSubmitted,false);
  assert.equal(result.paymentExecutionEnabled,false);
  assert.equal(status(db),'submitting');
  assert.throws(()=>claimValidatedModulrTransfer(db,'intent',match));
  assert.equal(db.prepare('SELECT paid_at FROM payouts').get().paid_at,null);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM payout_confirmations').get().n,0);
}));

const mutations = [
  ['excluded driver', "UPDATE driver_cache SET payout_excluded=1"],
  ['cancelled batch', "UPDATE payout_runs SET status='cancelled'"],
  ['unfunded batch', "UPDATE payout_runs SET funding_status='pending'"],
  ['changed payout amount', "UPDATE payouts SET net_amount=26"],
  ['already paid payout', "UPDATE payouts SET paid_at='2026-10-12T19:00:00Z'"],
  ['changed bank encrypted value', "UPDATE driver_bank_accounts SET account_number_enc='different'"],
  ['changed bank timestamp', "UPDATE driver_bank_accounts SET updated_at='2026-10-12T19:00:00Z'"],
  ['changed batch total', "UPDATE payout_runs SET total_amount=26"],
  ['inconsistent batch count', "UPDATE payout_runs SET item_count=2"],
  ['sibling payout no longer batched', "INSERT INTO payouts VALUES ('sibling','run',2,'early','cancelled',NULL,0,0); UPDATE payout_runs SET item_count=2"],
  ['existing payment evidence', "INSERT INTO payout_confirmations VALUES ('pay')"],
];
for (const [description,sql] of mutations) {
  test(`Rejects ${description} and rolls back`,()=>withFixture((db,match)=> {
    db.exec(sql);
    assert.throws(()=>claimValidatedModulrTransfer(db,'intent',match));
    assert.equal(status(db),'prepared');
  }));
}
test('Generic writer cannot bypass validated claim',()=>withFixture((db)=> {
  assert.throws(()=>transitionModulrTransfer(db,'intent','prepared','submitting'));
  assert.equal(status(db),'prepared');
}));
test('Generic writer cannot resurrect unknown to submitted',()=>withFixture((db)=> {
  db.exec("UPDATE payout_transfer_intents SET status='unknown'");
  assert.throws(()=>transitionModulrTransfer(db,'intent','unknown','submitted'));
  assert.equal(status(db),'unknown');
}));
test('Generic writer still supports prepared cancellation',()=>withFixture((db)=> {
  transitionModulrTransfer(db,'intent','prepared','cancelled');
  assert.equal(status(db),'cancelled');
}));
