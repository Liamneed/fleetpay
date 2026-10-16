import {
  validateModulrReconciliation
} from './modulr-transfer-reconciliation.mjs';

import {
  recordModulrPaymentEvent
} from './modulr-payment-history.mjs';

// The caller must retrieve payment directly from authenticated Modulr.
// This writer has no network access and cannot independently authenticate
// caller-supplied payment data. Keep it behind a trusted server-only workflow.
export function recordVerifiedModulrReconciliation(
  db,
  intentId,
  payment,
  sourceAccountId
) {
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
      throw new Error('Modulr sandbox transfer not found.');
    }

    const result = validateModulrReconciliation(
      intent,
      payment,
      sourceAccountId
    );

    if (!result.verified || result.status !== 'confirmed') {
      throw new Error(
        'Provider reconciliation rejected: ' +
        (result.reason || 'unverified')
      );
    }

    const now = new Date().toISOString();

    const updated = db.prepare(`
      UPDATE payout_transfer_intents
      SET status='confirmed',
          provider_status='PROCESSED',
          confirmed_at=?,
          updated_at=?
      WHERE id=?
        AND provider='modulr'
        AND environment='sandbox'
        AND status=?
        AND provider_transfer_id=?
        AND amount_minor=?
        AND currency='GBP'
        AND confirmed_at IS NULL
    `).run(
      now,
      now,
      intent.id,
      intent.status,
      result.providerTransferId,
      result.amountMinor
    );

    if (updated.changes !== 1) {
      throw new Error('Transfer changed during reconciliation.');
    }

    recordModulrPaymentEvent(db, {
      transferId: intent.id,
      eventType: 'confirmed',
      providerReference: result.providerTransferId,
      providerStatus: 'PROCESSED',
      source: 'modulr_api'
    });

    db.exec('COMMIT');

    return {
      ok: true,
      status: 'confirmed',
      providerReference: result.providerTransferId,
      confirmedAt: now,
      accountingFinalised: false,
      autocabReconciled: false,
      requiresBankReturnMonitoring: true
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
