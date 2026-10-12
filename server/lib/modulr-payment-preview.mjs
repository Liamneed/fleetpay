// Offline Modulr payment-request preview only.
// No HTTP calls, database access or payment execution.

export function buildModulrPaymentPreview(intent, sourceAccountId) {
  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      intent.status !== 'prepared') {
    throw new Error('Eligible sandbox transfer required.');
  }

  if (typeof sourceAccountId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(sourceAccountId)) {
    throw new Error('Valid source account ID required.');
  }

  if (typeof intent.recipient_id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intent.recipient_id)) {
    throw new Error('Valid beneficiary ID required.');
  }

  if (!Number.isSafeInteger(intent.amount_minor) ||
      intent.amount_minor <= 0 ||
      intent.amount_minor > 214748364700) {
    throw new Error('Valid payment amount required.');
  }

  if (intent.currency !== 'GBP') {
    throw new Error('GBP payment required.');
  }

  if (typeof intent.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,50}$/.test(intent.id)) {
    throw new Error('Valid external reference required.');
  }

  if (typeof intent.idempotency_key !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intent.idempotency_key)) {
    throw new Error('Valid payment nonce required.');
  }

  const request = {
    sourceAccountId,
    destinationId: intent.recipient_id,
    currency: 'GBP',
    amount: intent.amount_minor / 100,
    reference: 'FAIVOPAY',
    externalReference: intent.id
  };

  return {
    method: 'POST',
    path: '/payments',
    nonce: intent.idempotency_key,
    request,
    previewOnly: true,
    submissionEnabled: false
  };
}
