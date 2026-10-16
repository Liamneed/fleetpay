// Sandbox-only scheme-reference lookup.
// No payment POSTs, database writes or accounting operations.

export async function searchModulrOriginalByScheme({
  originalSchemeId,
  fromCreatedDate,
  apiKey,
  fetchImpl,
  pageSize = 50,
  maxPages = 20
}) {
  const unresolved = reason => ({
    found: false,
    reason,
    paymentSubmitted: false,
    accountingAuthorised: false
  });

  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false') {
    return unresolved('unsafe_environment');
  }

  if (typeof originalSchemeId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(originalSchemeId) ||
      typeof apiKey !== 'string' ||
      !apiKey.trim() ||
      typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 || pageSize > 100 ||
      !Number.isSafeInteger(maxPages) ||
      maxPages < 1 || maxPages > 50) {
    return unresolved('invalid_configuration');
  }

  const from = Date.parse(fromCreatedDate);

  if (!Number.isFinite(from)) {
    return unresolved('invalid_date');
  }

  const matches = [];
  let totalSize = null;
  let complete = false;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      schemeId: `PAYPORT:${originalSchemeId}`,
      fromCreatedDate:
        new Date(from).toISOString()
          .replace(/\.\d{3}Z$/, '+0000'),
      type: 'PAYOUT',
      page: String(page),
      size: String(pageSize)
    });

    const url =
      'https://api-sandbox.modulrfinance.com/api-sandbox-token/payments?' +
      params.toString();

    let response, payload;

    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Authorization: apiKey,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (response?.status !== 200) {
        return unresolved('provider_search_failed');
      }

      payload = await response.json();
    } catch {
      return unresolved('provider_search_uncertain');
    }

    if (!payload ||
        !Array.isArray(payload.content) ||
        payload.content.length > pageSize ||
        !payload.content.every(p => p && typeof p === 'object') ||
        payload.page !== page ||
        !Number.isSafeInteger(payload.totalPages) ||
        payload.totalPages < 1 ||
        payload.totalPages > maxPages ||
        !Number.isSafeInteger(payload.totalSize) ||
        payload.totalSize < 0) {
      return unresolved('invalid_pagination');
    }

    if (totalSize === null) totalSize = payload.totalSize;

    if (payload.totalSize !== totalSize ||
        matches.length + payload.content.length > totalSize ||
        page >= payload.totalPages ||
        (payload.last === true &&
         page + 1 !== payload.totalPages) ||
        (payload.last === false &&
         page + 1 >= payload.totalPages)) {
      return unresolved('pagination_mismatch');
    }

    matches.push(...payload.content);

    if (page + 1 === payload.totalPages) {
      if (payload.last === false) {
        return unresolved('pagination_mismatch');
      }
      complete = true;
      break;
    }
  }

  if (!complete || matches.length !== totalSize) {
    return unresolved('pagination_incomplete');
  }

  if (matches.length === 0) {
    return unresolved('no_scheme_match');
  }

  if (matches.length !== 1) {
    return unresolved('ambiguous_scheme_match');
  }

  const payment = matches[0];

  if (typeof payment.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(payment.id) ||
      typeof payment.status !== 'string' ||
      !payment.status.trim()) {
    return unresolved('invalid_provider_payment');
  }

  return {
    found: true,
    providerPaymentId: payment.id,
    externalReference:
      payment.externalReference ??
      payment.details?.externalReference ??
      null,
    providerStatus: payment.status,
    requiresIndependentPaymentRetrieval: true,
    requiresManualReconciliation: true,
    paymentSubmitted: false,
    accountingAuthorised: false
  };
}
