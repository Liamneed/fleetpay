// Pure Modulr payment scheme-reference validation.
// No network, database access, payment execution or accounting.

export function validateModulrSchemeReference({
  intent,
  providerPayment
} = {}) {
  const reject = reason => ({
    valid: false,
    reason,
    schemeId: null,
    accountingAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown', 'confirmed'].includes(intent.status)) {
    return reject('invalid_transfer');
  }

  if (!providerPayment ||
      providerPayment.id !== intent.provider_transfer_id ||
      providerPayment.type !== 'PAYOUT' ||
      providerPayment.status !== 'PROCESSED') {
    return reject('provider_payment_mismatch');
  }

  const schemeId = providerPayment.schemeInfo?.id;

  if (typeof schemeId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(schemeId)) {
    return reject('missing_or_invalid_scheme_reference');
  }

  return {
    valid: true,
    schemeId,
    providerPaymentId: providerPayment.id,
    accountingAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  };
}
