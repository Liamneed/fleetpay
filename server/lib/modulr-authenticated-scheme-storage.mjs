import {
  readModulrSandboxPayment
} from './modulr-sandbox-adapter.mjs';

import {
  previewModulrSchemeReconciliation
} from './modulr-scheme-reconciliation-preview.mjs';

import {
  storeValidatedModulrSchemeReference
} from './modulr-scheme-reference-store.mjs';

// Trusted server-side operation only.
// Database writes: NEVER invoke against a real financial database
// without explicit authorisation.
// No HTTP route or automatic scheduler is connected.
// No payment submission, retry, accounting or Autocab execution.

export async function storeAuthenticatedModulrSchemeReference({
  db,
  intentId,
  apiKey,
  sourceAccountId,
  fetchImpl
}) {
  if (
    process.env.MODULR_ENV !== 'sandbox' ||
    process.env.MODULR_ENABLED === 'true' ||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true' ||
    process.env.AUTOCAB_ADJUSTMENTS_ENABLED === 'true'
  ) {
    throw new Error('Sandbox safety configuration required.');
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
    !['submitted', 'unknown', 'confirmed'].includes(intent.status) ||
    !intent.provider_transfer_id
  ) {
    throw new Error('Transfer not eligible.');
  }

  // Always obtain payment evidence independently.
  // Never accept a caller-supplied payment or preview object.
  const payment = await readModulrSandboxPayment({
    paymentId: intent.provider_transfer_id,
    apiKey,
    fetchImpl
  });

  const preview = previewModulrSchemeReconciliation({
    intent,
    providerPayment: payment,
    sourceAccountId
  });

  if (preview.ok !== true) {
    return {
      ok: false,
      reason: preview.reason,
      paymentSubmitted: false,
      accountingAuthorised: false,
      settlementVerified: false,
      retryAuthorised: false
    };
  }

  const stored = storeValidatedModulrSchemeReference({
    db,
    intentId,
    preview: {
      ...preview,
      recipientId: payment.details?.destination?.id
    }
  });

  return {
    ok: true,
    ...stored,
    paymentSubmitted: false,
    accountingAuthorised: false,
    settlementVerified: false,
    retryAuthorised: false,
    requiresBankReturnMonitoring: true
  };
}
