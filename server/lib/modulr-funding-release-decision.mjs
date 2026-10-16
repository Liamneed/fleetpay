// Read-only funding release assessment.
// No provider calls, database writes or payment authority.

export function assessModulrFundingRelease({
  run, verification, account, otherCommitments = []
} = {}) {
  const reject = reason => ({
    eligible: false,
    reason,
    paymentAuthorised: false,
    fundsCleared: false,
    providerFundsReserved: false
  });

  if (!run ||
      run.provider !== 'modulr' ||
      run.status !== 'funding_pending' ||
      run.funding_status !== 'balance_verified' ||
      run.funds_cleared_at ||
      run.provider_ref ||
      run.released_at ||
      run.paid_at) {
    return reject('invalid_run_state');
  }

  const amount = Number(run.total_amount);
  const requiredMinor = Math.round(amount * 100);

  if (!Number.isFinite(amount) ||
      !Number.isSafeInteger(requiredMinor) ||
      requiredMinor <= 0 ||
      Math.abs(amount * 100 - requiredMinor) > 0.000001) {
    return reject('invalid_run_amount');
  }

  if (!verification ||
      verification.run_id !== run.id ||
      verification.required_minor !== requiredMinor ||
      !verification.verified_at ||
      !verification.account_id ||
      !verification.customer_id) {
    return reject('verification_mismatch');
  }

  if (!account ||
      account.id !== verification.account_id ||
      account.customerId !== verification.customer_id ||
      account.currency !== 'GBP' ||
      account.status !== 'ACTIVE') {
    return reject('account_mismatch');
  }

  if (!Array.isArray(otherCommitments) ||
      otherCommitments.some(c =>
        !c || c.id !== run.id
      )) {
    return reject('competing_commitment');
  }

  const balance = account.availableBalance;

  if (typeof balance !== 'string' ||
      !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(balance)) {
    return reject('invalid_balance');
  }

  const [pounds, pence = ''] = balance.split('.');
  const availableMinor =
    Number(pounds) * 100 + Number(pence.padEnd(2, '0'));

  if (!Number.isSafeInteger(availableMinor) ||
      availableMinor < requiredMinor) {
    return reject('insufficient_balance');
  }

  return {
    eligible: true,
    reason: null,
    requiredMinor,
    availableMinor,
    requiresAdministratorApproval: true,
    requiresAtomicCommitment: true,
    paymentAuthorised: false,
    fundsCleared: false,
    providerFundsReserved: false
  };
}
