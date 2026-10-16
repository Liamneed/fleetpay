import { assessModulrFundingRelease }
  from './modulr-funding-release-decision.mjs';

export function ensureModulrFundingAuthorisationTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS modulr_funding_authorisations (
      run_id TEXT PRIMARY KEY,
      administrator_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      required_minor INTEGER NOT NULL,
      available_minor INTEGER NOT NULL,
      authorised_at TEXT NOT NULL
    )
  `);
}

export function authoriseModulrFunding(db, {
  runId, account, administratorId
} = {}) {
  if (typeof runId !== 'string' || !runId.trim() ||
      typeof administratorId !== 'string' ||
      !administratorId.trim()) {
    throw new Error('Valid run and administrator required.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const run = db.prepare(
      'SELECT * FROM payout_runs WHERE id=?'
    ).get(runId);

    const verification = db.prepare(
      'SELECT * FROM modulr_funding_verifications WHERE run_id=?'
    ).get(runId);

    const competing = db.prepare(`
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
    `).all(runId);

    const decision = assessModulrFundingRelease({
      run, verification, account,
      otherCommitments: competing
    });

    if (!decision.eligible) {
      throw new Error(
        'Funding authorisation rejected: ' + decision.reason
      );
    }

    // A balance snapshot is not a provider reservation.
    // Never authorise based on stale verification.
    const verifiedAt = Date.parse(verification.verified_at);
    const age = Date.now() - verifiedAt;

    if (!Number.isFinite(verifiedAt) ||
        age < 0 || age > 60000) {
      throw new Error('Funding verification has expired.');
    }

    const now = new Date().toISOString();


    const updated = db.prepare(`
      UPDATE payout_runs
      SET funding_status='release_approved'
      WHERE id=?
        AND provider='modulr'
        AND status='funding_pending'
        AND funding_status='balance_verified'
    `).run(runId);

    if (updated.changes !== 1) {
      throw new Error('Funding state changed.');
    }

    db.prepare(`
      INSERT INTO modulr_funding_authorisations
      (run_id, administrator_id, account_id,
       required_minor, available_minor, authorised_at)
      VALUES (?,?,?,?,?,?)
    `).run(
      runId,
      administratorId,
      account.id,
      decision.requiredMinor,
      decision.availableMinor,
      now
    );

    db.exec('COMMIT');

    return {
      authorised: true,
      runId,
      fundingStatus: 'release_approved',
      paymentAuthorised: false,
      fundsCleared: false,
      providerFundsReserved: false,
      accountingFinalised: false
    };

  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
