// Pure, offline Modulr return-validation policy.
// Input must come from a separately authenticated provider source.
// Never uses amounts, dates or references alone to match a return.
// No network, database, payment or accounting operations.

export function validateModulrReturnMatch({
  notification,
  originalPaymentId,
  originalSchemeId
}) {
  const unresolved = reason => ({
    matched: false,
    reason,
    requiresManualReview: true,
    accountingAuthorised: false,
    paymentSubmitted: false
  });

  if (!notification || typeof notification !== 'object') {
    return unresolved('invalid_notification');
  }

  if (notification.EventName !== 'PAYIN' ||
      notification.Type !== 'PO_REV') {
    return unresolved('not_outbound_reversal');
  }

  if (typeof notification.PaymentId !== 'string' ||
      !notification.PaymentId.trim()) {
    return unresolved('missing_return_payment_id');
  }

  if (typeof originalPaymentId !== 'string' ||
      !originalPaymentId.trim() ||
      notification.PaymentId === originalPaymentId) {
    return unresolved('invalid_payment_identity');
  }

  if (typeof originalSchemeId !== 'string' ||
      !originalSchemeId.trim() ||
      typeof notification.OriginalSchemeId !== 'string' ||
      !notification.OriginalSchemeId.trim()) {
    return unresolved('missing_scheme_reference');
  }

  if (notification.OriginalSchemeId !== originalSchemeId) {
    return unresolved('scheme_reference_mismatch');
  }

  return {
    matched: true,
    originalPaymentId,
    returnPaymentId: notification.PaymentId,
    requiresManualReview: true,
    accountingAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  };
}
