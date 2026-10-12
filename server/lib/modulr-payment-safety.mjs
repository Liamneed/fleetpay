// Offline policy for Modulr payment attempts. Never submits or retries a payment.
const MAX_NONCE_AGE_MS = 48 * 60 * 60 * 1000;

export function assessModulrRetry({
  intent, originalSubmittedAt, now = new Date(), sameRequest = false,
  providerOutcomeKnown = false
}) {
  const blocked = reason => ({ permitted: false, reason, paymentSubmitted: false });
  if (!intent || intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitting', 'unknown'].includes(intent.status) ||
      !intent.idempotency_key) return blocked('transfer_ineligible');
  if (intent.provider_transfer_id || providerOutcomeKnown) {
    return blocked('reconcile_existing_payment');
  }
  if (!sameRequest) return blocked('original_request_must_be_identical');
  const start = Date.parse(originalSubmittedAt);
  const check = new Date(now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(check) || check < start) {
    return blocked('invalid_attempt_time');
  }
  if (check - start >= MAX_NONCE_AGE_MS) {
    return blocked('nonce_window_expired_reconcile_manually');
  }
  // Advisory only: host must independently verify provider state, original
  // bytes and nonce before an authorised sandbox retry is ever implemented.
  return {
    permitted: false,
    reason: 'sandbox_retry_not_implemented',
    theoreticalSafeWindow: true,
    retryNonce: intent.idempotency_key,
    retryHeader: 'x-mod-retry: true',
    paymentSubmitted: false
  };
}

export function classifyModulrPaymentStatus(status) {
  if (status === 'PROCESSED') {
    return { outcome: 'processed', finalAccountingAuthorised: false,
      requiresBankReturnMonitoring: true };
  }
  if (typeof status !== 'string' || !status.trim()) {
    return { outcome: 'unknown', finalAccountingAuthorised: false };
  }
  return { outcome: 'reconcile', providerStatus: status,
    finalAccountingAuthorised: false };
}
