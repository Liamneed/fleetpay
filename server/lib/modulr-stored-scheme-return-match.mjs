// Pure, offline association check for Modulr bank returns.
// Reference matching alone is NOT proof of a genuine return.
// No API requests, database writes or financial operations.

export function matchModulrStoredSchemeReturn({
  intent,
  returnRecord
} = {}) {
  const reject = reason => ({
    matched: false,
    reason,
    requiresManualReview: true,
    returnConfirmed: false,
    accountingAuthorised: false,
    retryAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown', 'confirmed'].includes(intent.status)) {
    return reject('invalid_transfer');
  }

  if (typeof intent.provider_transfer_id !== 'string' ||
      !intent.provider_transfer_id ||
      typeof intent.provider_scheme_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intent.provider_scheme_id)) {
    return reject('missing_original_references');
  }

  if (!returnRecord ||
      typeof returnRecord.original_payment_id !== 'string' ||
      typeof returnRecord.original_scheme_id !== 'string') {
    return reject('invalid_return_record');
  }

  if (returnRecord.original_payment_id !== intent.provider_transfer_id) {
    return reject('original_payment_id_mismatch');
  }

  if (returnRecord.original_scheme_id !== intent.provider_scheme_id) {
    return reject('original_scheme_id_mismatch');
  }

  return {
    matched: true,
    transferId: intent.id,
    originalPaymentId: intent.provider_transfer_id,
    originalSchemeId: intent.provider_scheme_id,
    requiresManualReview: true,
    returnConfirmed: false,
    accountingAuthorised: false,
    retryAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  };
}
