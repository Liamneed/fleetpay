// Pure association check for a possible Modulr bank return.
// Inputs must come from trusted, independent retrieval.
// This does not confirm the return or authorise accounting.

export function matchModulrReturnToOriginal({
  intent,
  lookup,
  originalPayment,
  sourceAccountId
}) {
  const reject = reason => ({
    matched: false,
    reason,
    requiresManualReview: true,
    accountingAuthorised: false,
    retryAuthorised: false
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown', 'confirmed'].includes(intent.status)) {
    return reject('invalid_transfer');
  }

  if (!lookup ||
      lookup.found !== true ||
      lookup.requiresIndependentPaymentRetrieval !== true ||
      !originalPayment ||
      typeof originalPayment !== 'object') {
    return reject('missing_independent_evidence');
  }

  if (typeof intent.provider_transfer_id !== 'string' ||
      !intent.provider_transfer_id ||
      lookup.providerPaymentId !== intent.provider_transfer_id ||
      originalPayment.id !== intent.provider_transfer_id) {
    return reject('original_payment_id_mismatch');
  }

  if (originalPayment.type !== 'PAYOUT') {
    return reject('original_payment_type_mismatch');
  }

  const topReference = originalPayment.externalReference;
  const detailReference =
    originalPayment.details?.externalReference;

  if ((topReference !== undefined &&
       topReference !== intent.id) ||
      (detailReference !== undefined &&
       detailReference !== intent.id) ||
      (topReference === undefined &&
       detailReference === undefined) ||
      lookup.externalReference !== intent.id) {
    return reject('external_reference_mismatch');
  }

  const details = originalPayment.details;

  if (typeof sourceAccountId !== 'string' ||
      !sourceAccountId ||
      details?.sourceAccountId !== sourceAccountId) {
    return reject('source_account_mismatch');
  }

  if (details?.destination?.type !== 'BENEFICIARY' ||
      details.destination.id !== intent.recipient_id) {
    return reject('recipient_mismatch');
  }

  const amount = details.amount;
  const minor = typeof amount === 'number' &&
                Number.isFinite(amount)
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

  if (originalPayment.status !== 'PROCESSED' ||
      lookup.providerStatus !== originalPayment.status) {
    return reject('provider_status_mismatch');
  }

  return {
    matched: true,
    transferId: intent.id,
    originalPaymentId: originalPayment.id,
    amountMinor: minor,
    requiresManualReview: true,
    returnConfirmed: false,
    accountingAuthorised: false,
    retryAuthorised: false
  };
}
