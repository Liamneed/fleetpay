// Sandbox GET-only Modulr debit lookup.
// Requires injected fetchImpl. No default network access.
// Does not write to SQLite, submit payments, reconcile accounting
// or authorise retries.

import { verifyModulrOutgoingDebit }
  from './modulr-debit-verification.mjs';

export async function lookupModulrOutgoingDebit({
  intent,
  sourceAccountId,
  apiKey,
  fetchImpl
} = {}) {
  const reject = reason => ({
    found: false,
    reason,
    accountingAuthorised: false,
    retryAuthorised: false,
    previewOnly: true
  });

  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false' ||
      process.env.AUTOCAB_ADJUSTMENTS_ENABLED !== 'false') {
    return reject('unsafe_environment');
  }

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(
        intent.provider_transfer_id || ''
      ) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(sourceAccountId || '') ||
      typeof apiKey !== 'string' ||
      !apiKey ||
      typeof fetchImpl !== 'function') {
    return reject('invalid_lookup_input');
  }

  const base =
    'https://api-sandbox.modulrfinance.com/' +
    'api-sandbox-token/accounts/' +
    encodeURIComponent(sourceAccountId) +
    '/transactions';

  const url = new URL(base);
  url.searchParams.set('sourceId', intent.provider_transfer_id);
  url.searchParams.set('credit', 'false');
  url.searchParams.set('page', '0');
  url.searchParams.set('size', '100');

  let response;

  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    return reject('provider_request_failed');
  }

  if (response?.status !== 200) {
    return reject('provider_http_error');
  }

  let body;

  try {
    body = await response.json();
  } catch {
    return reject('invalid_provider_response');
  }

  if (!body ||
      !Array.isArray(body.content) ||
      body.page !== 0 ||
      body.totalPages !== 1 ||
      (body.last !== undefined && body.last !== true) ||
      body.totalSize !== body.content.length) {
    return reject('incomplete_or_ambiguous_pagination');
  }

  if (body.content.length !== 1) {
    return reject(
      body.content.length === 0
        ? 'no_matching_debit'
        : 'multiple_matching_debits'
    );
  }

  const verification = verifyModulrOutgoingDebit({
    intent,
    transaction: body.content[0],
    sourceAccountId
  });

  if (!verification.matched) {
    return reject(verification.reason);
  }

  return {
    found: true,
    paymentId: intent.provider_transfer_id,
    transaction: body.content[0],
    matched: true,
    settlementVerified: false,
    accountingAuthorised: false,
    retryAuthorised: false,
    previewOnly: true
  };
}
