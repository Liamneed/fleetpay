// Offline validation of a candidate Modulr outgoing debit.
// No HTTP, database writes, payment submissions or accounting.
// Field mapping must be checked against actual Modulr API responses.

export function verifyModulrOutgoingDebit({
  intent,
  transaction,
  sourceAccountId
} = {}) {
  const reject = reason => ({
    matched: false,
    reason,
    accountingAuthorised: false,
    retryAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  });

  if (!intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      !['submitted', 'unknown', 'confirmed'].includes(intent.status)) {
    return reject('invalid_transfer');
  }

  if (!transaction || typeof transaction !== 'object') {
    return reject('missing_transaction');
  }

  if (!intent.provider_transfer_id ||
      transaction.sourceId !== intent.provider_transfer_id) {
    return reject('payment_reference_mismatch');
  }

  if (typeof sourceAccountId !== 'string' ||
      !sourceAccountId ||
      transaction.account?.id !== sourceAccountId) {
    return reject('source_account_mismatch');
  }

  if (transaction.credit !== false) {
    return reject('not_outgoing_debit');
  }

  if (transaction.currency !== 'GBP' ||
      intent.currency !== 'GBP') {
    return reject('currency_mismatch');
  }

  const amount = transaction.amount;
  const amountMinor =
    typeof amount === 'number' && Number.isFinite(amount)
      ? Math.round(Math.abs(amount) * 100)
      : NaN;

  if (!Number.isSafeInteger(amountMinor) ||
      amountMinor <= 0 ||
      Math.abs(Math.abs(amount) * 100 - amountMinor) > 0.000001 ||
      amountMinor !== intent.amount_minor) {
    return reject('amount_mismatch');
  }

  return {
    matched: true,
    paymentId: intent.provider_transfer_id,
    amountMinor,
    currency: 'GBP',
    transactionMatched: true,
    settlementVerified: false,
    accountingAuthorised: false,
    retryAuthorised: false,
    paymentSubmitted: false,
    previewOnly: true
  };
}
