// Sandbox-only, read-only monitoring.
// Never authorises payment, accounting or Autocab activity.

import {
  readModulrSandboxPayment
} from './modulr-sandbox-adapter.mjs';

export async function monitorModulrSandboxReturns({
  apiKey,
  fromCreatedDate,
  fetchImpl
}) {
  const base = {
    returnConfirmed: false,
    accountingAuthorised: false,
    paymentSubmitted: false,
    retryAuthorised: false,
    requiresManualReview: true
  };

  const fail = reason => ({
    ...base,
    ok: false,
    reason,
    candidates: []
  });

  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false') {
    return fail('unsafe_environment');
  }

  if (typeof apiKey !== 'string' ||
      !apiKey.trim() ||
      typeof fetchImpl !== 'function') {
    return fail('invalid_configuration');
  }

  const from = Date.parse(fromCreatedDate);

  if (!Number.isFinite(from)) {
    return fail('invalid_date');
  }


  try {
    const candidates = [];
    let checked = 0;

    for (const type of ['RETURN', 'PAYIN']) {
      const url = new URL(
        'https://api-sandbox.modulrfinance.com/api-sandbox-token/payments'
      );

      url.searchParams.set(
        'fromCreatedDate',
        new Date(from).toISOString().replace(/\.\d{3}Z$/, "+0000")
      );
      url.searchParams.set('type', type);
      url.searchParams.set('page', '0');
      url.searchParams.set('size', '50');

      const response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (response.status !== 200) {
        return fail('provider_search_failed');
      }

      const data = await response.json();

      if (!data ||
          !Array.isArray(data.content) ||
          data.page !== 0 ||
          !Number.isSafeInteger(data.totalSize) ||
          !Number.isSafeInteger(data.totalPages) ||
          data.totalPages !== 1 ||
          data.content.length !== data.totalSize ||
          data.content.length > 50) {
        return fail('incomplete_provider_results');
      }

      checked += data.content.length;

      for (const item of data.content) {
        if (typeof item.id !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(item.id)) {
          return fail('invalid_provider_record');
        }

        const payment = await readModulrSandboxPayment({
          paymentId: item.id,
          apiKey,
          fetchImpl
        });

        if (payment.type !== type) {
          return fail('provider_type_mismatch');
        }

        const details = payment.returnDetails;

        // A normal PAYIN is not a bank return.
        if (!details || typeof details.originalSchemeId !== 'string' ||
            !details.originalSchemeId.trim()) {
          if (type === 'PAYIN') continue;

          candidates.push({
            paymentId: payment.id,
            providerType: payment.type,
            providerStatus: payment.status,
            originalSchemeId: null,
            returnReasonCode: null,
            requiresManualReview: true,
            returnConfirmed: false,
            accountingAuthorised: false
          });
          continue;
        }

        if (candidates.some(c => c.paymentId === payment.id)) {
          return fail('duplicate_provider_payment');
        }

        candidates.push({
          paymentId: payment.id,
          providerType: payment.type,
          providerStatus: payment.status,
          originalSchemeId: details.originalSchemeId,
          returnReasonCode:
            typeof details.returnReasonCode === 'string'
              ? details.returnReasonCode
              : null,
          requiresManualReview: true,
          returnConfirmed: false,
          accountingAuthorised: false
        });
      }
    }

    return {
      ...base,
      ok: true,
      checked,
      candidates
    };
  } catch {
    return fail('provider_retrieval_uncertain');
  }
}
