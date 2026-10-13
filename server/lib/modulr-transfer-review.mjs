// Read-only investigation of incomplete Modulr transfers.
// No provider requests, retries or accounting writes.

export function listModulrTransfersForReview(db, {
  now = new Date()
} = {}) {
  const currentTime = new Date(now).getTime();
  if (!Number.isFinite(currentTime)) {
    throw new Error('Valid review time required.');
  }

  const rows = db.prepare(`
    SELECT id, payout_id, payout_run_id, status,
           amount_minor, currency, provider_transfer_id,
           updated_at, submitted_at
    FROM payout_transfer_intents
    WHERE provider='modulr'
      AND environment='sandbox'
      AND status IN ('submitting', 'unknown')
    ORDER BY updated_at ASC, id ASC
  `).all();

  return rows.map(row => {
    const timestamp = Date.parse(row.updated_at);
    const ageMinutes = Number.isFinite(timestamp)
      ? Math.max(0, Math.floor((currentTime - timestamp) / 60000))
      : null;

    return {
      transferId: row.id,
      payoutId: row.payout_id,
      payoutRunId: row.payout_run_id,
      status: row.status,
      amountMinor: row.amount_minor,
      currency: row.currency,
      providerPaymentIdPresent: Boolean(row.provider_transfer_id),
      updatedAt: row.updated_at,
      submittedAt: row.submitted_at,
      ageMinutes,
      action: 'manual_investigation',
      automaticRetryAllowed: false,
      accountingFinalised: false
    };
  });
}
