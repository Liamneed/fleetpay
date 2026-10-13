
// Read-only provider reconciliation.
// No payment submission, retries, database or accounting writes.

import {
  readModulrSandboxPayment
} from './modulr-sandbox-adapter.mjs';

import {
  validateModulrReconciliation
} from './modulr-transfer-reconciliation.mjs';

export async function inspectModulrSandboxTransfer({
  intent,
  apiKey,
  fetchImpl
}) {
  const unresolved = reason => ({
    verified: false,
    status: 'unknown',
    reason,
    paymentSubmitted: false,
    accountingFinalised: false
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown'].includes(intent.status) ||
      typeof intent.provider_transfer_id !== 'string' ||
      !intent.provider_transfer_id.trim()) {
    return unresolved('transfer_not_eligible');
  }

  try {
    const payment = await readModulrSandboxPayment({
      paymentId: intent.provider_transfer_id,
      apiKey,
      fetchImpl
    });

    const result = validateModulrReconciliation(intent, payment);

    return {
      ...result,
      paymentSubmitted: false,
      accountingFinalised: false
    };
  } catch {
    // Do not expose credentials or raw provider responses.
    // Retrieval uncertainty must never authorise a retry.
    return unresolved('provider_retrieval_uncertain');
  }
}
