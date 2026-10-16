import {
  validateModulrFundingBalance
} from './modulr-funding-validation.mjs';

/*
 * Records a verified balance snapshot against one payout run.
 *
 * This is an INTERNAL funding earmark, not a Modulr reservation.
 * It cannot mark a run funded or authorise payment execution.
 *
 * BEGIN IMMEDIATE ensures competing requests using the same
 * SQLite database cannot both acquire the funding earmark.
 */
export function earmarkVerifiedModulrFunding(db, {
  runId,
  account,
  accountId,
  customerId
}) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const run = db.prepare(`
      SELECT *
      FROM payout_runs
      WHERE id=?
    `).get(runId);

    if (
      !run ||
      run.provider !== 'modulr' ||
      run.status !== 'funding_pending' ||
      run.funding_status !== 'awaiting_clearance'
    ) {
      throw new Error('Payout run is not awaiting funding.');
    }

    const amount = Number(run.total_amount);
    const requiredMinor = Math.round(amount * 100);

    if (
      !Number.isFinite(amount) ||
      !Number.isSafeInteger(requiredMinor) ||
      requiredMinor <= 0 ||
      Math.abs(amount * 100 - requiredMinor) > 0.000001
    ) {
      throw new Error('Invalid payout run amount.');
    }

    const validation = validateModulrFundingBalance({
      account,
      accountId,
      customerId,
      requiredMinor
    });

    if (!validation.verified) {
      throw new Error(
        'Modulr funding verification failed: ' +
        validation.reason
      );
    }

    /*
     * Conservative exclusivity rule:
     * only one Modulr run can hold a verified funding earmark.
     *
     * Other funded or processing runs also prevent new earmarks.
     * This deliberately blocks uncertain existing commitments.
     */
    const competing = db.prepare(`
      SELECT id
      FROM payout_runs
      WHERE provider='modulr'
        AND id<>?
        AND (
          funding_status IN ('balance_verified','release_approved','cleared')
          OR status IN (
            'funded',
            'submitted',
            'submitted_sandbox',
            'processing'
          )
        )
      LIMIT 1
    `).get(runId);

    if (competing) {
      throw new Error(
        'Another Modulr payout run has an outstanding funding commitment.'
      );
    }

    const now = new Date().toISOString();

    const updated = db.prepare(`
      UPDATE payout_runs
      SET funding_status='balance_verified'
      WHERE id=?
        AND provider='modulr'
        AND status='funding_pending'
        AND funding_status='awaiting_clearance'
    `).run(runId);

    if (updated.changes !== 1) {
      throw new Error('Funding status changed during verification.');
    }

    db.prepare(`
      INSERT INTO modulr_funding_verifications (
        run_id,
        account_id,
        customer_id,
        required_minor,
        available_minor,
        verified_at
      )
      VALUES (?,?,?,?,?,?)
    `).run(
      runId,
      accountId,
      customerId,
      requiredMinor,
      validation.availableMinor,
      now
    );

    db.exec('COMMIT');

    return {
      verified: true,
      runId,
      fundingStatus: 'balance_verified',
      availableMinor: validation.availableMinor,
      requiredMinor,
      verifiedAt: now,
      providerFundsReserved: false,
      paymentSubmitted: false,
      accountingFinalised: false,
      autocabReconciled: false
    };

  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {}

    throw error;
  }
}

export function ensureModulrFundingVerificationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS modulr_funding_verifications (
      run_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      required_minor INTEGER NOT NULL,
      available_minor INTEGER NOT NULL,
      verified_at TEXT NOT NULL
    )
  `);
}

// Refresh evidence for an existing internal earmark.
// Caller must supply a fresh, independently authenticated provider GET.
// Never releases the existing commitment or authorises payment.
export function refreshVerifiedModulrFunding(db,{
  runId,account,accountId,customerId
}={}) {
  db.exec('BEGIN IMMEDIATE');

  try {
    const run=db.prepare(`
      SELECT * FROM payout_runs WHERE id=?
    `).get(runId);

    if (!run ||
        run.provider!=='modulr' ||
        run.status!=='funding_pending' ||
        run.funding_status!=='balance_verified') {
      throw new Error('Run is not eligible for verification refresh.');
    }

    const existing=db.prepare(`
      SELECT * FROM modulr_funding_verifications
      WHERE run_id=?
    `).get(runId);

    if (!existing ||
        existing.account_id!==accountId ||
        existing.customer_id!==customerId) {
      throw new Error('Existing funding evidence does not match.');
    }

    const amount=Number(run.total_amount);
    const requiredMinor=Math.round(amount*100);

    if (!Number.isFinite(amount) ||
        !Number.isSafeInteger(requiredMinor) ||
        requiredMinor<=0 ||
        Math.abs(amount*100-requiredMinor)>0.000001 ||
        existing.required_minor!==requiredMinor) {
      throw new Error('Funding amount changed or is invalid.');
    }

    const competing=db.prepare(`
      SELECT id FROM payout_runs
      WHERE provider='modulr' AND id<>?
        AND (
          funding_status IN (
            'balance_verified','release_approved','cleared'
          )
          OR status IN (
            'funded','submitted','submitted_sandbox','processing'
          )
        )
      LIMIT 1
    `).get(runId);

    if (competing) {
      throw new Error('Another Modulr funding commitment exists.');
    }

    const validation=validateModulrFundingBalance({
      account,accountId,customerId,requiredMinor
    });

    if (!validation.verified) {
      throw new Error(
        'Funding refresh rejected: '+validation.reason
      );
    }

    const now=new Date().toISOString();

    const updated=db.prepare(`
      UPDATE modulr_funding_verifications
      SET available_minor=?,verified_at=?
      WHERE run_id=?
        AND account_id=?
        AND customer_id=?
        AND required_minor=?
    `).run(
      validation.availableMinor,now,runId,
      accountId,customerId,requiredMinor
    );

    if (updated.changes!==1) {
      throw new Error('Funding evidence changed.');
    }

    db.exec('COMMIT');

    return {
      verified:true,
      refreshed:true,
      runId,
      fundingStatus:'balance_verified',
      requiredMinor,
      availableMinor:validation.availableMinor,
      verifiedAt:now,
      providerFundsReserved:false,
      paymentSubmitted:false,
      fundsCleared:false,
      accountingFinalised:false,
      autocabReconciled:false
    };
  } catch(error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
