// Offline, fail-closed Modulr return evidence comparison.
//
// The providerPayment argument must eventually come from an
// independently authenticated Modulr API GET, not webhook JSON.
//
// This module performs no provider requests, database writes,
// payment submissions or accounting operations.

export function verifyModulrReturnEvidence({
  notification,
  providerPayment,
  originalSchemeId,
  expectedAmountMinor,
  expectedCurrency = 'GBP'
}) {
  const unresolved = reason => ({
    verified: false,
    reason,
    requiresManualReview: true,
    accountingAuthorised: false,
    paymentSubmitted: false
  });

  if (!notification ||
      typeof notification !== 'object' ||
      !providerPayment ||
      typeof providerPayment !== 'object') {
    return unresolved('missing_evidence');
  }

  if (notification.EventName !== 'PAYIN' ||
      notification.Type !== 'PO_REV') {
    return unresolved('not_return_notification');
  }

  if (typeof notification.PaymentId !== 'string' ||
      !notification.PaymentId.trim() ||
      providerPayment.id !== notification.PaymentId) {
    return unresolved('payment_identity_mismatch');
  }

  if (providerPayment.type !== 'PAYIN') {
    return unresolved('provider_payment_type_mismatch');
  }

  // Provider's return classification must be independently present.
  if (providerPayment.returnType !== 'PO_REV') {
    return unresolved('provider_return_type_unverified');
  }

  if (typeof originalSchemeId !== 'string' ||
      !originalSchemeId.trim() ||
      notification.OriginalSchemeId !== originalSchemeId ||
      providerPayment.originalSchemeId !== originalSchemeId) {
    return unresolved('original_scheme_mismatch');
  }

  if (!Number.isSafeInteger(expectedAmountMinor) ||
      expectedAmountMinor <= 0 ||
      !Number.isSafeInteger(providerPayment.amountMinor) ||
      providerPayment.amountMinor !== expectedAmountMinor) {
    return unresolved('return_amount_mismatch');
  }

  if (typeof expectedCurrency !== 'string' ||
      !/^[A-Z]{3}$/.test(expectedCurrency) ||
      providerPayment.currency !== expectedCurrency) {
    return unresolved('currency_mismatch');
  }

  if (providerPayment.status !== 'PROCESSED') {
    return unresolved('provider_status_unverified');
  }

  return {
    verified: true,
    returnPaymentId: providerPayment.id,
    originalSchemeId,
    amountMinor: providerPayment.amountMinor,
    currency: expectedCurrency,
    requiresManualReview: true,
    accountingAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  };
}


// Inspect documented return fields. This is NOT bank-return verification.
// The payment must be obtained by an independently authenticated GET.
export function inspectModulrReturnCandidate({
  notification,
  providerPayment,
  originalSchemeId,
  expectedAmountMinor
}) {
  const reject = reason => ({
    candidate: false,
    reason,
    returnConfirmed: false,
    requiresManualReview: true,
    accountingAuthorised: false,
    paymentSubmitted: false,
    retryAuthorised: false
  });

  if (!notification ||
      notification.EventName !== 'PAYIN' ||
      notification.Type !== 'PO_REV') {
    return reject('not_return_notification');
  }

  if (!providerPayment ||
      typeof providerPayment !== 'object' ||
      providerPayment.id !== notification.PaymentId ||
      !['PAYIN', 'RETURN'].includes(providerPayment.type)) {
    return reject('payment_identity_or_type_mismatch');
  }

  const details = providerPayment.returnDetails;

  if (!details ||
      typeof originalSchemeId !== 'string' ||
      !originalSchemeId.trim() ||
      notification.OriginalSchemeId !== originalSchemeId ||
      details.originalSchemeId !== originalSchemeId) {
    return reject('original_scheme_mismatch');
  }

  if (typeof details.returnReasonCode !== 'string' ||
      !details.returnReasonCode.trim()) {
    return reject('missing_return_reason');
  }

  const amount = providerPayment.details?.amount;
  const minor = typeof amount === 'number' &&
                Number.isFinite(amount)
    ? Math.round(amount * 100)
    : NaN;

  if (!Number.isSafeInteger(expectedAmountMinor) ||
      expectedAmountMinor <= 0 ||
      !Number.isSafeInteger(minor) ||
      minor <= 0 ||
      Math.abs(amount * 100 - minor) > 0.000001 ||
      minor !== expectedAmountMinor) {
    return reject('return_amount_mismatch');
  }

  if (providerPayment.details?.currency !== 'GBP') {
    return reject('currency_mismatch');
  }

  if (providerPayment.status !== 'PROCESSED') {
    return reject('provider_status_unverified');
  }

  return {
    candidate: true,
    returnPaymentId: providerPayment.id,
    originalSchemeId,
    returnReasonCode: details.returnReasonCode,
    amountMinor: minor,
    currency: 'GBP',
    returnConfirmed: false,
    requiresManualReview: true,
    accountingAuthorised: false,
    paymentSubmitted: false,
    retryAuthorised: false
  };
}
