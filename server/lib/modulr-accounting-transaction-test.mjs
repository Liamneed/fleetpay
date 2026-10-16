import crypto from 'node:crypto';
import { previewModulrAccounting }
  from './modulr-accounting-preview.mjs';

// Test-only accounting transaction.
// In-memory SQLite databases ONLY.
// No provider requests, Autocab calls, or production integration.

export function testModulrAccountingTransaction(db, transferId) {
  if (
    process.env.MODULR_ENV !== 'sandbox' ||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true'
  ) {
    throw new Error('Accounting test safety gate is closed.');
  }

  const databases = db.prepare('PRAGMA database_list').all();

  if (
    databases.length !== 1 ||
    databases[0].name !== 'main' ||
    databases[0].file !== ''
  ) {
    throw new Error(
      'Accounting transaction tests require an isolated in-memory database.'
    );
  }

  if (db.isTransaction) {
    throw new Error('An existing transaction is not permitted.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const preview = previewModulrAccounting(db, transferId);

    if (!preview.eligible) {
      throw new Error(
        'Accounting validation failed: ' + preview.issues.join(',')
      );
    }

    const payout = db.prepare(`
      SELECT *
      FROM payouts
      WHERE id=?
    `).get(preview.payoutId);

    const run = db.prepare(`
      SELECT *
      FROM payout_runs
      WHERE id=?
    `).get(preview.payoutRunId);

    if (!payout || !run) {
      throw new Error('Payout or run missing.');
    }

    // This first test covers the confirmed £1 early payout only.
    // Other payout types and fees require separate accounting tests.
    if (
      payout.type !== 'early' ||
      Number(payout.fee) !== 0 ||
      preview.amountMinor !== 100 ||
      run.item_count !== 1
    ) {
      throw new Error('Unsupported accounting test scenario.');
    }

    const now = new Date().toISOString();

    const confirmationId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO payout_confirmations (
        id, payout_id, payout_run_id,
        provider, provider_transaction_id,
        outcome, amount, currency,
        evidence_source, evidence_reference,
        verification_status, verified_by,
        verified_at, created_by, created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      confirmationId,
      payout.id,
      run.id,
      'modulr',
      preview.providerReference,
      'paid',
      1,
      'GBP',
      'modulr_api',
      preview.providerReference,
      'verified',
      'system:modulr',
      now,
      'system:modulr',
      now
    );

    const changed = db.prepare(`
      UPDATE payouts
      SET status='paid',
          paid_at=?,
          updated_at=?
      WHERE id=?
        AND status='batched'
        AND paid_at IS NULL
    `).run(now, now, payout.id);

    if (changed.changes !== 1) {
      throw new Error('Payout status changed during finalisation.');
    }

    db.prepare(`
      INSERT INTO driver_ledger (
        id, driver_id, entry_type, direction,
        amount, fee_amount, description,
        reference_id, status, created_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      crypto.randomUUID(),
      payout.driver_id,
      'early_payout',
      'credit',
      1,
      0,
      'Modulr sandbox accounting transaction test',
      payout.id,
      'paid',
      now
    );

    db.prepare(`
      INSERT INTO modulr_payment_events (
        id, transfer_id, event_type,
        provider_reference, provider_status,
        reason, source, created_at
      )
      VALUES (?,?,?,?,?,?,?,?)
    `).run(
      crypto.randomUUID(),
      transferId,
      'accounting_finalised',
      preview.providerReference,
      'PROCESSED',
      null,
      'modulr_accounting_test',
      now
    );

    const runChanged = db.prepare(`
      UPDATE payout_runs
      SET status='paid',
          paid_at=?,
          reconciled_at=?
      WHERE id=?
        AND status='funded'
        AND paid_at IS NULL
        AND item_count=1
        AND NOT EXISTS (
          SELECT 1 FROM payouts
          WHERE payout_run_id=?
            AND (status!='paid' OR paid_at IS NULL)
        )
    `).run(now, now, run.id, run.id);

    if (runChanged.changes !== 1) {
      throw new Error('Payout run cannot be completed.');
    }

    db.exec('COMMIT');

    return {
      ok: true,
      testOnly: true,
      payoutId: payout.id,
      confirmationId,
      accountingFinalised: true,
      runCompleted: true,
      autocabReconciled: false
    };

  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}

    throw error;
  }
}
