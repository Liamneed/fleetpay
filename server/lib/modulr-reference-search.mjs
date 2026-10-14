// Read-only Modulr sandbox reference search.
// No POST, database writes, retry authorisation or accounting.
import { inspectModulrReferenceMatches } from './modulr-reference-recovery.mjs';

export async function searchModulrReferenceRecovery({
  intent, sourceAccountId, apiKey, fetchImpl,
  pageSize = 50, maxPages = 20
}) {
  const unresolved = reason => ({
    verified: false, status: 'unknown', reason,
    paymentSubmitted: false, automaticRetryAllowed: false,
    accountingFinalised: false
  });

  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false') {
    return unresolved('unsafe_environment');
  }

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitting', 'unknown'].includes(intent.status) ||
      intent.provider_transfer_id ||
      !/^[A-Za-z0-9_-]{1,50}$/.test(String(intent.id || '')) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(String(sourceAccountId || '')) ||
      typeof apiKey !== 'string' || !apiKey.trim() ||
      typeof fetchImpl !== 'function' ||
      !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    return unresolved('invalid_search_configuration');
  }

  // Search from before the first attempted submission.
  // A missing/invalid attempt timestamp must be reviewed manually.
  const started = Date.parse(intent.attempt_started_at);
  if (!Number.isFinite(started)) {
    return unresolved('missing_attempt_timestamp');
  }

  const fromCreatedDate = new Date(Math.max(
    0, started - 24 * 60 * 60 * 1000
  )).toISOString().replace(/\.\d{3}Z$/, '+0000');

  const payments = [];
  let completed = false;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      externalReference: intent.id,
      sourceAccountId,
      fromCreatedDate,
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

    if (!payload || !Array.isArray(payload.content) ||
        payload.content.length > pageSize ||
        !payload.content.every(p => p && typeof p === 'object')) {
      return unresolved('invalid_provider_page');
    }

    // Reject inconsistent page metadata rather than trusting it.
    if (payload.number !== undefined &&
        payload.number !== page) {
      return unresolved('pagination_mismatch');
    }

    // Reject contradictory or malformed pagination evidence.
    if (payload.last !== undefined &&
        typeof payload.last !== 'boolean') {
      return unresolved('pagination_mismatch');
    }

    if (payload.totalPages !== undefined) {
      if (!Number.isSafeInteger(payload.totalPages) ||
          payload.totalPages < 1 ||
          payload.totalPages > maxPages ||
          page >= payload.totalPages ||
          (payload.last === true &&
           page + 1 !== payload.totalPages) ||
          (payload.last === false &&
           page + 1 >= payload.totalPages)) {
        return unresolved('pagination_mismatch');
      }
    }

    payments.push(...payload.content);

    if (payload.last === true) {
      completed = true;
      break;
    }

    if (payload.last === false) {
      continue;
    }

    if (Number.isSafeInteger(payload.totalPages)) {
      if (payload.totalPages <= page ||
          payload.totalPages > maxPages) {
        return unresolved('pagination_mismatch');
      }
      if (page + 1 === payload.totalPages) {
        completed = true;
        break;
      }
      continue;
    }

    // Never infer completion from page length alone.
    // Provider must explicitly prove pagination has finished.
    return unresolved('pagination_metadata_missing');
  }

  if (!completed) return unresolved('pagination_incomplete');

  return {
    ...inspectModulrReferenceMatches({
      intent, payments, sourceAccountId,
      searchComplete: true
    }),
    pagesComplete: true
  };
}
