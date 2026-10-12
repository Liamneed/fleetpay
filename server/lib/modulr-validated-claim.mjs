import {
  validateModulrPreSubmission
} from './modulr-pre-submission.mjs';

// Local SQLite claim only. No HTTP, payment or accounting operations.
// match must come from a fresh, independently verified beneficiary lookup.
// Never treat an arbitrary caller-supplied match as payment authorisation.
export function claimValidatedModulrTransfer(db, intentId, match) {
  if (typeof intentId !== 'string' || !intentId || !match) {
    throw new Error('Transfer and beneficiary match required.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const intent = db.prepare(`
      SELECT *
      FROM payout_transfer_intents
      WHERE id=?
        AND provider='modulr'
        AND environment='sandbox'
    `).get(intentId);

    if (!intent) {
      throw new Error('Sandbox transfer not found.');
    }

    const run = db.prepare(`
      SELECT * FROM payout_runs WHERE id=?
    `).get(intent.payout_run_id);

    const payout = db.prepare(`
      SELECT * FROM payouts WHERE id=?
    `).get(intent.payout_id);

    const driver = payout ? db.prepare(`
      SELECT driver_id,payout_excluded
      FROM driver_cache WHERE driver_id=?
    `).get(payout.driver_id) : null;

    const bank = payout ? db.prepare(`
      SELECT updated_at,sort_code_enc,account_number_enc,
             sort_code_last2,account_number_last4
      FROM driver_bank_accounts WHERE driver_id=?
    `).get(payout.driver_id) : null;

    const evidenceCount = db.prepare(`
      SELECT COUNT(*) AS n
      FROM payout_confirmations WHERE payout_id=?
    `).get(intent.payout_id).n;

    const validation = validateModulrPreSubmission({
      intent,run,payout,driver,bank,match,evidenceCount
    });

    if (!validation.eligible) {
      throw new Error(
        'Transfer not eligible: ' + validation.reason
      );
    }

    // Additional batch consistency check.
    const totals = db.prepare(`
      SELECT COUNT(*) AS n,
             SUM(COALESCE(net_amount,amount)) AS total
      FROM payouts WHERE payout_run_id=?
    `).get(run.id);

    const batchAmount = Number(totals.total);
    const fundedAmount = Number(run.total_amount);
    const batchMinor = Math.round(batchAmount * 100);
    const fundedMinor = Math.round(fundedAmount * 100);

    if (totals.n !== Number(run.item_count) ||
        !Number.isFinite(batchAmount) ||
        !Number.isFinite(fundedAmount) ||
        Math.abs(batchAmount * 100 - batchMinor) > 0.000001 ||
        Math.abs(fundedAmount * 100 - fundedMinor) > 0.000001 ||
        !Number.isSafeInteger(batchMinor) ||
        !Number.isSafeInteger(fundedMinor) ||
        batchMinor !== fundedMinor) {
      throw new Error('Batch total or item count changed.');
    }

    // Every sibling payout must remain batched and outstanding.
    const ineligibleItems = db.prepare(`
      SELECT COUNT(*) AS n FROM payouts
      WHERE payout_run_id=?
        AND (status!='batched' OR paid_at IS NOT NULL
             OR type!=?)
    `).get(run.id,run.run_type).n;
    if (ineligibleItems !== 0) {
      throw new Error('A sibling payout is no longer eligible.');
    }

    const now = new Date().toISOString();

    const result = db.prepare(`
      UPDATE payout_transfer_intents
      SET status='submitting',updated_at=?
      WHERE id=?
        AND status='prepared'
        AND provider='modulr'
        AND environment='sandbox'
        AND provider_transfer_id IS NULL
        AND confirmed_at IS NULL
    `).run(now,intentId);

    if (result.changes !== 1) {
      throw new Error('Transfer already claimed or changed.');
    }

    db.exec('COMMIT');

    return {
      ok:true,
      status:'submitting',
      amountMinor:validation.amountMinor,
      paymentSubmitted:false,
      paymentExecutionEnabled:false
    };

  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
