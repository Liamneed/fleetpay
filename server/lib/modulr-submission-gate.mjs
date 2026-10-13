// Offline pre-HTTP gate for an already claimed sandbox transfer.
// No network, database writes or payment execution.

import { prepareModulrSandboxRequest } from './modulr-sandbox-adapter.mjs';

export function validateClaimedModulrSubmission({
  intent,
  claim,
  sourceAccountId
}) {
  const reject = reason => ({
    eligible: false,
    reason,
    paymentSubmitted: false
  });

  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false') {
    return reject('unsafe_environment');
  }

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      intent.status !== 'submitting' ||
      intent.provider_transfer_id ||
      intent.confirmed_at) {
    return reject('transfer_not_claimed_or_ineligible');
  }

  if (!claim ||
      claim.ok !== true ||
      claim.status !== 'submitting' ||
      claim.paymentSubmitted !== false ||
      claim.paymentExecutionEnabled !== false ||
      !Number.isSafeInteger(claim.amountMinor) ||
      claim.amountMinor !== intent.amount_minor) {
    return reject('claim_evidence_mismatch');
  }

  let prepared;

  try {
    prepared = prepareModulrSandboxRequest(
      { ...intent, status: 'prepared' },
      sourceAccountId
    );
  } catch {
    return reject('invalid_payment_request');
  }

  if (prepared.method !== 'POST' ||
      prepared.path !== '/payments' ||
      prepared.body.sourceAccountId !== sourceAccountId ||
      prepared.body.destination?.id !== intent.recipient_id ||
      prepared.body.destination?.type !== 'BENEFICIARY' ||
      prepared.body.currency !== 'GBP' ||
      Math.round(prepared.body.amount * 100) !== claim.amountMinor ||
      prepared.headers['x-mod-nonce'] !== intent.idempotency_key ||
      prepared.body.externalReference !== intent.id ||
      prepared.executionEnabled !== false) {
    return reject('payment_request_mismatch');
  }

  return {
    eligible: true,
    request: prepared,
    paymentSubmitted: false,
    executionEnabled: false,
    requiresExplicitAuthorisation: true
  };
}
