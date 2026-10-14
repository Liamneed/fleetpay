
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { claimValidatedModulrTransfer } from '../server/lib/modulr-validated-claim.mjs';
import { validateClaimedModulrSubmission } from '../server/lib/modulr-submission-gate.mjs';

test('Atomic claim survives restart and cannot be claimed again', () => {
  const sourcePath = path.resolve('data/faivopay-modulr-preview-fixture.sqlite');
  assert.ok(fs.existsSync(sourcePath), 'Synthetic fixture missing');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modulr-restart-'));
  const target = path.join(dir, 'snapshot.sqlite');
  let source;
  let db;

  try {
    source = new DatabaseSync(sourcePath, { readOnly: true });
    source.exec(`VACUUM INTO '${target.replaceAll("'", "''")}'`);
    source.close();
    source = null;

    db = new DatabaseSync(target);

    const intent = db.prepare(`
      SELECT * FROM payout_transfer_intents
      WHERE provider='modulr'
        AND environment='sandbox'
        AND status='prepared'
    `).get();

    assert.ok(intent);
    assert.equal(intent.amount_minor, 2500);

    const payout = db.prepare(
      'SELECT * FROM payouts WHERE id=?'
    ).get(intent.payout_id);

    const bank = db.prepare(
      'SELECT * FROM driver_bank_accounts WHERE driver_id=?'
    ).get(payout.driver_id);

    // Correct legacy masked references in this temporary copy only.
    db.prepare(`
      UPDATE payout_transfer_intents
      SET recipient_sort_code_last2=?,
          recipient_account_last4=?
      WHERE id=?
    `).run(bank.sort_code_last2, bank.account_number_last4, intent.id);

    const match = {
      matched: true,
      beneficiaryId: intent.recipient_id,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      approvalRequired: false,
      bankUpdatedAt: bank.updated_at,
      bankSortCodeEnc: bank.sort_code_enc,
      bankAccountNumberEnc: bank.account_number_enc
    };

    db.exec('ALTER TABLE payout_transfer_intents ADD COLUMN attempt_started_at TEXT');
    const claim = claimValidatedModulrTransfer(db, intent.id, match);
    assert.equal(claim.status, 'submitting');

    db.close();
    db = null;

    // Simulate process restart: fresh connection to persisted SQLite.
    db = new DatabaseSync(target);

    const recovered = db.prepare(
      'SELECT * FROM payout_transfer_intents WHERE id=?'
    ).get(intent.id);

    assert.equal(recovered.status, 'submitting');
    assert.equal(recovered.provider_transfer_id, null);

    // Existing claim cannot be repeated, even after restart.
    assert.throws(() => claimValidatedModulrTransfer(
      db, intent.id, match
    ));

    const stillSaved = db.prepare(
      'SELECT status FROM payout_transfer_intents WHERE id=?'
    ).get(intent.id);
    assert.equal(stillSaved.status, 'submitting');

    // Gate can prepare a request, but cannot execute it.
    const gate = validateClaimedModulrSubmission({
      intent: recovered,
      claim,
      sourceAccountId: 'A_RESTART_TEST'
    });

    assert.equal(gate.eligible, true);
    assert.equal(gate.executionEnabled, false);
    assert.equal(gate.paymentSubmitted, false);

    // Reconstructing a preview is not permission to send HTTP.
    assert.equal(db.prepare(
      'SELECT paid_at FROM payouts WHERE id=?'
    ).get(intent.payout_id).paid_at, null);

    assert.equal(db.prepare(
      'SELECT COUNT(*) AS n FROM payout_confirmations WHERE payout_id=?'
    ).get(intent.payout_id).n, 0);
  } finally {
    db?.close();
    source?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
