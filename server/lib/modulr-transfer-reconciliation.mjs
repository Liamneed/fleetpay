// Pure validation of a payment independently retrieved from Modulr.
// No network, SQLite, accounting, or Autocab operations.
// The caller must authenticate and retrieve the record from Modulr.

export function validateModulrReconciliation(intent, payment) {
  const reject = reason => ({
    verified: false,
    status: 'unknown',
    reason
  });

  if (!intent || intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown'].includes(intent.status)) {
    return reject('transfer_not_eligible');
  }

  if (!intent.provider_transfer_id ||
      !payment ||
      payment.id !== intent.provider_transfer_id) {
    return reject('transfer_reference_mismatch');
  }

  const details = payment.details;

  if (!details || details.destination?.type !== 'BENEFICIARY' ||
      details.destination.id !== intent.recipient_id) {
    return reject('recipient_mismatch');
  }

  const amount = details.amount;
  const minor = Number.isFinite(amount)
    ? Math.round(amount * 100)
    : NaN;

  if (!Number.isSafeInteger(minor) ||
      minor <= 0 ||
      Math.abs(amount * 100 - minor) > 0.000001 ||
      minor !== intent.amount_minor) {
    return reject('amount_mismatch');
  }

  if (details.currency !== 'GBP' ||
      intent.currency !== 'GBP') {
    return reject('currency_mismatch');
  }

  // Only the independently retrieved provider's final successful
  // status qualifies. Never interpret creation as settlement.
  if (payment.status !== 'PROCESSED') {
    return reject('final_success_not_confirmed');
  }

  return {
    verified: true,
    status: 'confirmed',
    providerTransferId: payment.id,
    amountMinor: minor,
    currency: 'GBP',
    accountingFinalised: false,
    requiresBankReturnMonitoring: true
  };
}
