import {
  readModulrSandboxPayment
} from './modulr-sandbox-adapter.mjs';

import {
  validateModulrReconciliation
} from './modulr-transfer-reconciliation.mjs';

import {
  recordVerifiedModulrReconciliation
} from './modulr-verified-reconciliation.mjs';

// Trusted server-side workflow only.
// Never accept a payment response from an HTTP request body.
// No payment creation, retry, accounting or Autocab operations.
export async function reconcileAuthenticatedModulrTransfer({
  db,
  intentId,
  apiKey,
  sourceAccountId,
  fetchImpl
}) {
  if (
    process.env.MODULR_ENV !== 'sandbox' ||
    process.env.MODULR_ENABLED === 'true' ||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true'
  ) {
    throw new Error('Sandbox reconciliation only.');
  }

  if (
    typeof intentId !== 'string' ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(intentId)
  ) {
    throw new Error('Valid transfer ID required.');
  }

  const intent = db.prepare(`
    SELECT *
    FROM payout_transfer_intents
    WHERE id=?
      AND provider='modulr'
      AND environment='sandbox'
  `).get(intentId);

  if (
    !intent ||
    !['submitted','unknown'].includes(intent.status) ||
    !intent.provider_transfer_id
  ) {
    throw new Error(
      'Transfer is not eligible for reconciliation.'
    );
  }

  // The ID comes exclusively from the saved database instruction.
  // This is a GET request. It cannot initiate a payment.
  const payment = await readModulrSandboxPayment({
    paymentId: intent.provider_transfer_id,
    apiKey,
    fetchImpl
  });

  const validation = validateModulrReconciliation(
    intent,
    payment,
    sourceAccountId
  );

  if (
    validation.verified !== true ||
    validation.status !== 'confirmed'
  ) {
    return {
      ok: false,
      status: 'unknown',
      reason: validation.reason || 'not_verified',
      paymentSubmitted: false,
      accountingFinalised: false,
      autocabReconciled: false
    };
  }

  // Revalidates against the latest database state inside
  // BEGIN IMMEDIATE, then records status and history atomically.
  const saved = recordVerifiedModulrReconciliation(
    db,
    intentId,
    payment,
    sourceAccountId
  );

  return {
    ...saved,
    paymentSubmitted: false,
    providerVerified: true
  };
}
