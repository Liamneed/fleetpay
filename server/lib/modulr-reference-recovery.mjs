// Offline validation of payments discovered through Modulr reference search.
// No HTTP, database changes, retries or accounting finalisation.

export function inspectModulrReferenceMatches({
  intent, payments, searchComplete = false, sourceAccountId
}) {
  const unresolved = reason => ({
    verified: false,
    status: 'unknown',
    reason,
    automaticRetryAllowed: false,
    accountingFinalised: false,
    paymentSubmitted: false
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitting', 'unknown'].includes(intent.status) ||
      intent.provider_transfer_id ||
      !/^[A-Za-z0-9_-]{1,50}$/.test(String(intent.id || '')) ||
      intent.currency !== 'GBP' ||
      !Number.isSafeInteger(intent.amount_minor) ||
      intent.amount_minor <= 0 ||
      !intent.recipient_id ||
      !sourceAccountId) {
    return unresolved('invalid_recovery_intent');
  }

  if (searchComplete !== true || !Array.isArray(payments)) {
    return unresolved('search_incomplete');
  }

  // Never assume the provider applied the requested filters.
  const referenced = payments.filter(p =>
    p?.externalReference === intent.id ||
    p?.details?.externalReference === intent.id
  );

  if (referenced.length === 0) {
    return unresolved('no_reference_match');
  }

  if (referenced.length !== 1) {
    return unresolved('ambiguous_reference_matches');
  }

  const payment = referenced[0];
  const details = payment.details;
  const amount = details?.amount;
  const minor = typeof amount === 'number' && Number.isFinite(amount)
    ? Math.round(amount * 100)
    : NaN;

  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(payment.id || '')) ||
      details?.sourceAccountId !== sourceAccountId ||
      details?.destination?.type !== 'BENEFICIARY' ||
      details.destination.id !== intent.recipient_id ||
      details.currency !== 'GBP' ||
      !Number.isSafeInteger(minor) ||
      Math.abs(amount * 100 - minor) > 0.000001 ||
      minor !== intent.amount_minor ||
      typeof payment.status !== 'string' ||
      !payment.status.trim()) {
    return unresolved('provider_payment_mismatch');
  }

  return {
    verified: true,
    status: 'payment_found',
    providerPaymentId: payment.id,
    providerStatus: payment.status,
    amountMinor: minor,
    automaticRetryAllowed: false,
    accountingFinalised: false,
    paymentSubmitted: false,
    requiresIndependentPaymentRetrieval: true,
    requiresManualReconciliation: true
  };
}
