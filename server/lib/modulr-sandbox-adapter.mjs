
// Modulr sandbox adapter boundary.
// No payment execution is implemented or authorised here.

import {
  buildModulrPaymentPreview
} from './modulr-payment-preview.mjs';

export function prepareModulrSandboxRequest(intent, sourceAccountId) {
  const preview = buildModulrPaymentPreview(intent, sourceAccountId);

  if (preview.previewOnly !== true ||
      preview.submissionEnabled !== false) {
    throw new Error('Unsafe payment preview.');
  }

  return {
    method: preview.method,
    path: preview.path,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-mod-nonce': preview.nonce
    },
    body: structuredClone(preview.request),
    paymentSubmitted: false,
    executionEnabled: false
  };
}

export async function submitModulrSandboxPayment() {
  throw new Error(
    'Modulr sandbox payment execution is disabled. Explicit authorisation and verified execution controls are required.'
  );
}


// Read-only, independently authenticated sandbox retrieval.
// Does not change transfer state or authorise accounting.
export async function readModulrSandboxPayment({
  paymentId,
  apiKey,
  fetchImpl = fetch
}) {
  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED === 'true' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true') {
    throw new Error('Sandbox read-only environment required.');
  }

  if (typeof paymentId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(paymentId)) {
    throw new Error('Valid provider payment ID required.');
  }

  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Modulr sandbox credentials required.');
  }

  const url =
    'https://api-sandbox.modulrfinance.com/api-sandbox-token/payments/' +
    encodeURIComponent(paymentId);

  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Authorization: apiKey,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(10000)
  });

  if (response.status !== 200) {
    throw new Error('Provider payment retrieval unsuccessful.');
  }

  const payment = await response.json();

  if (!payment || payment.id !== paymentId ||
      typeof payment.status !== 'string' ||
      !payment.status.trim()) {
    throw new Error('Provider payment response invalid.');
  }

  return payment;
}
