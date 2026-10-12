// Offline pre-submission validation.
// The caller must obtain a fresh Modulr beneficiary match,
// then re-read all database rows inside a transaction.
// This function does not execute payments or update records.

export function validateModulrPreSubmission({
  intent, run, payout, driver, bank, match, evidenceCount
}) {
  function reject(reason) {
    return {eligible:false, reason, paymentExecutionEnabled:false};
  }

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      intent.status !== 'prepared' ||
      intent.provider_transfer_id ||
      intent.confirmed_at) {
    return reject('transfer_not_prepared');
  }

  if (!run ||
      run.id !== intent.payout_run_id ||
      run.provider !== 'modulr' ||
      run.status !== 'funded' ||
      run.funding_status !== 'cleared' ||
      !run.funds_cleared_at ||
      run.provider_ref ||
      run.released_at ||
      run.paid_at) {
    return reject('batch_not_eligible');
  }

  if (!payout ||
      payout.id !== intent.payout_id ||
      payout.payout_run_id !== run.id ||
      payout.type !== run.run_type ||
      payout.status !== 'batched' ||
      payout.paid_at) {
    return reject('payout_not_eligible');
  }

  const amount = Number(payout.net_amount ?? payout.amount);
  const amountMinor = Math.round(amount * 100);

  if (!Number.isFinite(amount) ||
      !Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0 ||
      Math.abs(amount * 100 - amountMinor) > 0.000001 ||
      amountMinor !== intent.amount_minor ||
      intent.currency !== 'GBP') {
    return reject('payout_amount_changed');
  }

  if (!driver ||
      driver.driver_id !== payout.driver_id ||
      driver.payout_excluded !== 0) {
    return reject('driver_not_eligible');
  }

  if (!Number.isSafeInteger(evidenceCount) ||
      evidenceCount !== 0) {
    return reject('existing_payment_evidence');
  }

  if (!bank ||
      !bank.updated_at ||
      !intent.recipient_snapshot_at ||
      !Number.isFinite(Date.parse(bank.updated_at)) ||
      !Number.isFinite(Date.parse(intent.recipient_snapshot_at)) ||
      Date.parse(bank.updated_at) >
        Date.parse(intent.recipient_snapshot_at) ||
      bank.account_number_last4 !== intent.recipient_account_last4 ||
      bank.sort_code_last2 !== intent.recipient_sort_code_last2) {
    return reject('bank_details_changed');
  }

  if (!match ||
      match.matched !== true ||
      match.beneficiaryId !== intent.recipient_id ||
      match.status !== 'ACTIVE' ||
      match.approvalStatus !== 'APPROVED' ||
      match.approvalRequired !== false ||
      match.bankUpdatedAt !== bank.updated_at ||
      match.bankSortCodeEnc !== bank.sort_code_enc ||
      match.bankAccountNumberEnc !== bank.account_number_enc) {
    return reject('beneficiary_not_verified');
  }

  return {
    eligible:true,
    reason:null,
    amountMinor,
    recipientId:intent.recipient_id,
    paymentExecutionEnabled:false
  };
}
