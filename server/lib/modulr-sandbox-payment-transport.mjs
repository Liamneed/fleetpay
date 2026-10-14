// Sandbox payment transport. NOT connected to an HTTP route.
// The existing submitModulrSandboxPayment hard block is unchanged.
// Never retries, reconciles or finalises accounting.

import { classifyModulrSubmission } from './modulr-transfer-outcome.mjs';

export async function executeModulrSandboxTransport({
  validatedSubmission,
  apiKey,
  fetchImpl
}) {
  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false' ||
      process.env.MODULR_SANDBOX_POST_ENABLED !== 'true') {
    throw new Error('Sandbox POST transport is disabled.');
  }

  const request = validatedSubmission?.request;

  if (validatedSubmission?.eligible !== true ||
      validatedSubmission?.requiresExplicitAuthorisation !== true ||
      validatedSubmission?.executionEnabled !== false ||
      request?.method !== 'POST' ||
      request?.path !== '/payments' ||
      request?.executionEnabled !== false ||
      request?.paymentSubmitted !== false ||
      request?.body?.currency !== 'GBP' ||
      request?.body?.destination?.type !== 'BENEFICIARY' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(
        String(request?.body?.destination?.id || '')
      ) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(
        String(request?.body?.sourceAccountId || '')
      ) ||
      !/^[A-Za-z0-9_-]{1,50}$/.test(
        String(request?.body?.externalReference || '')
      ) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(
        String(request?.headers?.['x-mod-nonce'] || '')
      ) ||
      !Number.isSafeInteger(Math.round(request?.body?.amount * 100)) ||
      !(request?.body?.amount > 0) ||
      typeof apiKey !== 'string' ||
      !apiKey.trim() ||
      typeof fetchImpl !== 'function') {
    throw new Error('Validated sandbox request and injected transport required.');
  }

  // The caller must separately enforce atomic claiming, fresh beneficiary
  // verification, isolated database selection and explicit authorisation.
  // No default fetch is supplied.
  const url =
    'https://api-sandbox.modulrfinance.com/api-sandbox-token/payments';

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-mod-nonce': request.headers['x-mod-nonce']
      },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(10000)
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // Malformed or empty provider replies have uncertain outcomes.
    }

    return {
      ...classifyModulrSubmission({
        httpStatus: response.status,
        body
      }),
      providerRequestAttempted: true,
      accountingFinalised: false
    };
  } catch {
    return {
      ...classifyModulrSubmission({ networkError: true }),
      providerRequestAttempted: true,
      accountingFinalised: false
    };
  }
}
