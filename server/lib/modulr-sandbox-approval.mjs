// Offline sandbox approval preflight.
// This is NOT payment execution authorisation on its own.
// Server must authenticate the staff session independently.

export function validateModulrSandboxApproval({
  actor, intent, approvedTransferId, approvedAmountMinor,
  sourceAccountId, verifiedSourceAccount
}) {
  const reject = reason => ({
    eligible: false,
    reason,
    paymentExecutionEnabled: false
  });

  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false') {
    return reject('unsafe_environment');
  }

  if (!actor ||
      actor.role !== 'admin' ||
      actor.mfa !== true ||
      actor.staffRole !== 'administrator' ||
      !actor.staffId) {
    return reject('administrator_mfa_required');
  }

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      intent.status !== 'prepared' ||
      intent.provider_transfer_id ||
      intent.confirmed_at ||
      intent.attempt_started_at ||
      !Number.isSafeInteger(intent.amount_minor) ||
      intent.amount_minor <= 0 ||
      intent.currency !== 'GBP') {
    return reject('transfer_not_prepared');
  }

  if (typeof approvedTransferId !== 'string' ||
      approvedTransferId !== intent.id ||
      !Number.isSafeInteger(approvedAmountMinor) ||
      approvedAmountMinor !== intent.amount_minor) {
    return reject('approval_does_not_match_transfer');
  }

  if (!sourceAccountId ||
      !verifiedSourceAccount ||
      verifiedSourceAccount.id !== sourceAccountId ||
      verifiedSourceAccount.currency !== 'GBP' ||
      verifiedSourceAccount.environment !== 'sandbox' ||
      verifiedSourceAccount.verified !== true) {
    return reject('source_account_not_verified');
  }

  return {
    eligible: true,
    transferId: intent.id,
    amountMinor: intent.amount_minor,
    sourceAccountId,
    paymentExecutionEnabled: false,
    requiresFreshBeneficiaryVerification: true,
    requiresAtomicClaim: true,
    requiresExplicitExecutionAuthorisation: true
  };
}
