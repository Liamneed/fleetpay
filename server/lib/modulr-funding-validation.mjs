// Pure validation of an independently retrieved Modulr account.
// No network, database writes, payment execution or Autocab activity.

export function validateModulrFundingBalance({
  account,
  accountId,
  customerId,
  requiredMinor
}) {
  const reject = reason => ({
    verified: false,
    reason,
    fundingAuthorised: false,
    paymentSubmitted: false
  });

  if (
    !Number.isSafeInteger(requiredMinor) ||
    requiredMinor <= 0
  ) {
    return reject('invalid_required_amount');
  }

  if (
    !accountId ||
    !customerId ||
    account?.id !== accountId ||
    account?.customerId !== customerId ||
    account?.currency !== 'GBP' ||
    account?.status !== 'ACTIVE'
  ) {
    return reject('account_mismatch');
  }

  const balance = account.availableBalance;

  if (
    typeof balance !== 'string' ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(balance)
  ) {
    return reject('invalid_available_balance');
  }

  const [pounds, pence = ''] = balance.split('.');

  const availableMinor =
    Number(pounds) * 100 +
    Number(pence.padEnd(2, '0'));

  if (!Number.isSafeInteger(availableMinor)) {
    return reject('balance_out_of_range');
  }

  if (availableMinor < requiredMinor) {
    return {
      ...reject('insufficient_available_balance'),
      availableMinor,
      requiredMinor
    };
  }

  return {
    verified: true,
    reason: null,
    availableMinor,
    requiredMinor,
    fundingAuthorised: false,
    paymentSubmitted: false
  };
}
