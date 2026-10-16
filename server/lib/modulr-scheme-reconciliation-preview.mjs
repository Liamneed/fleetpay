import {
  validateModulrReconciliation
} from './modulr-transfer-reconciliation.mjs';

import {
  validateModulrSchemeReference
} from './modulr-scheme-reference.mjs';

// Pure offline comparison of independently retrieved payment evidence.
// No API requests, database writes, accounting or payment execution.

export function previewModulrSchemeReconciliation({
  intent,
  providerPayment,
  sourceAccountId
} = {}) {
  const blocked = (reason, schemeId = null) => ({
    ok: false,
    reason,
    schemeId,
    paymentSubmitted: false,
    accountingAuthorised: false,
    settlementVerified: false,
    retryAuthorised: false,
    previewOnly: true
  });

  const eligibleIntent = intent && {
    ...intent,
    status: intent.status === 'confirmed'
      ? 'submitted'
      : intent.status
  };

  const reconciliation = validateModulrReconciliation(
    eligibleIntent,
    providerPayment,
    sourceAccountId
  );

  if (!reconciliation.verified ||
      reconciliation.status !== 'confirmed') {
    return blocked(
      reconciliation.reason || 'payment_reconciliation_failed'
    );
  }

  const reference = validateModulrSchemeReference({
    intent,
    providerPayment
  });

  if (!reference.valid) {
    return blocked(reference.reason);
  }

  return {
    ok: true,
    providerPaymentId: reconciliation.providerTransferId,
    schemeId: reference.schemeId,
    amountMinor: reconciliation.amountMinor,
    currency: reconciliation.currency,
    paymentSubmitted: false,
    accountingAuthorised: false,
    settlementVerified: false,
    retryAuthorised: false,
    requiresBankReturnMonitoring: true,
    previewOnly: true
  };
}
