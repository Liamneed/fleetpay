// Pure sandbox payout decision preview.
// No provider requests, database access, payment execution,
// retries, accounting or Autocab operations.
//
// PROCESSED is provider processing, not independent settlement proof.

import { verifyModulrOutgoingDebit }
  from './modulr-debit-verification.mjs';

export function decideModulrPayout({
  intent,
  providerPayment,
  sourceAccountId,
  returnEvidence = null,
  debitEvidence = null
} = {}) {
  const result = (decision, reason, debitVerified = false) => ({
    decision,
    reason,
    outgoingDebitVerified: debitVerified,
    settlementVerified: false,
    accountingAuthorised: false,
    retryAuthorised: false,
    paymentSubmitted: false,
    requiresManualReview: true,
    previewOnly: true
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown', 'confirmed'].includes(intent.status)) {
    return result('unknown', 'invalid_transfer');
  }

  if (!providerPayment ||
      providerPayment.id !== intent.provider_transfer_id) {
    return result('unknown', 'missing_or_mismatched_provider_evidence');
  }

  if (providerPayment.type !== 'PAYOUT') {
    return result('unknown', 'incorrect_payment_type');
  }

  const details = providerPayment.details;

  if (typeof sourceAccountId !== 'string' ||
      !sourceAccountId ||
      details?.sourceAccountId !== sourceAccountId) {
    return result('unknown', 'source_account_mismatch');
  }

  const topReference = providerPayment.externalReference;
  const detailReference = details?.externalReference;

  if ((topReference !== undefined &&
       topReference !== intent.id) ||
      (detailReference !== undefined &&
       detailReference !== intent.id) ||
      (topReference === undefined &&
       detailReference === undefined)) {
    return result('unknown', 'external_reference_mismatch');
  }

  if (!details ||
      details.destination?.type !== 'BENEFICIARY' ||
      details.destination.id !== intent.recipient_id ||
      details.currency !== 'GBP' ||
      intent.currency !== 'GBP') {
    return result('unknown', 'payment_details_mismatch');
  }

  const amount = details.amount;
  const amountMinor = typeof amount === 'number' &&
    Number.isFinite(amount)
      ? Math.round(amount * 100)
      : NaN;

  if (!Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0 ||
      Math.abs(amount * 100 - amountMinor) > 0.000001 ||
      amountMinor !== intent.amount_minor) {
    return result('unknown', 'payment_amount_mismatch');
  }

  if (returnEvidence !== null) {
    if (returnEvidence.candidate === true ||
        returnEvidence.matched === true) {
      return result('return_candidate', 'return_requires_manual_review');
    }

    return result('unknown', 'unresolved_return_evidence');
  }

  if (providerPayment.status === 'PROCESSED') {
    if (debitEvidence !== null) {
      if (!debitEvidence || debitEvidence.found !== true ||
          debitEvidence.matched !== true) {
        return result('unknown', 'invalid_debit_evidence');
      }

      const debit = verifyModulrOutgoingDebit({
        intent,
        transaction: debitEvidence.transaction,
        sourceAccountId
      });

      if (!debit.matched) {
        return result('unknown', 'debit_' + debit.reason);
      }

      return result(
        'settlement_unverified',
        'outgoing_debit_verified_settlement_unverified',
        true
      );
    }

    return result(
      'settlement_unverified',
      'provider_processed_without_independent_settlement'
    );
  }

  if (providerPayment.status === 'SUBMITTED' ||
      providerPayment.status === 'PROCESSING' ||
      providerPayment.status === 'PENDING') {
    return result('submitted', 'provider_not_final');
  }

  return result('unknown', 'unrecognised_provider_outcome');
}
