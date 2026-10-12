// Pure validation of an independently retrieved payment record.
// No network, database, accounting or Autocab operations.
//
// The caller must first authenticate and retrieve the payment
// directly from Modulr. Never trust user-supplied records.

export function validateModulrReconciliation(intent, payment) {
  function reject(reason) {
    return {
      verified: false,
      status: 'unknown',
      reason
    };
  }

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

  if (payment.recipientId !== intent.recipient_id) {
    return reject('recipient_mismatch');
  }

  if (!Number.isSafeInteger(payment.amountMinor) ||
      payment.amountMinor <= 0 ||
      payment.amountMinor !== intent.amount_minor) {
    return reject('amount_mismatch');
  }

  if (payment.currency !== 'GBP' ||
      intent.currency !== 'GBP') {
    return reject('currency_mismatch');
  }

  // These statuses are provisional mock contract values.
  // Replace with documented Modulr statuses before integration.
  if (payment.status !== 'COMPLETED') {
    return reject('final_success_not_confirmed');
  }

  return {
    verified: true,
    status: 'confirmed',
    providerTransferId: payment.id,
    amountMinor: payment.amountMinor,
    currency: 'GBP'
  };
}
