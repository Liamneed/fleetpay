import { readModulrSandboxPayment } from './modulr-sandbox-adapter.mjs';
import { inspectModulrPayoutLedger } from './modulr-persistent-accounting-check.mjs';

// Provider-authenticated, read-only cross-check against the ACTUAL FaivoPay
// payout and ledger. It never finalises accounting or establishes receipt.
export async function reviewStoredModulrTransfer({ db, intentId, apiKey, sourceAccountId, fetchImpl }) {
  if (process.env.MODULR_ENV !== 'sandbox' || process.env.MODULR_ENABLED === 'true' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true') {
    throw new Error('Sandbox read-only review only.');
  }
  if (typeof intentId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(intentId))
    throw new Error('Invalid transfer reference.');
  const intent = db.prepare("SELECT * FROM payout_transfer_intents WHERE id=? AND provider='modulr' AND environment='sandbox'").get(intentId);
  if (!intent || !intent.provider_transfer_id) throw new Error('Stored Modulr transfer reference unavailable.');
  const payout = db.prepare('SELECT * FROM payouts WHERE id=? AND payout_run_id=?').get(intent.payout_id, intent.payout_run_id);
  const run = db.prepare('SELECT * FROM payout_runs WHERE id=?').get(intent.payout_run_id);
  if (!payout || !run || run.provider !== 'modulr') throw new Error('Stored payout and run do not match transfer.');
  const payment = await readModulrSandboxPayment({paymentId:intent.provider_transfer_id,apiKey,fetchImpl});
  const problems = [];
  const amount = Number(payout.net_amount ?? payout.amount);
  const cents = Math.round(amount * 100);
  const validAmount = Number.isFinite(amount) && Number.isSafeInteger(cents) && cents > 0 && Math.abs(amount*100-cents) < 0.000001;
  if (!validAmount || intent.amount_minor !== cents || intent.currency !== 'GBP') problems.push('stored_payout_amount_mismatch');
  const pAmount = payment.details?.amount;
  if (!Number.isFinite(pAmount) || !Number.isSafeInteger(Math.round(pAmount*100)) ||
      Math.abs(pAmount*100-Math.round(pAmount*100))>0.000001 || Math.round(pAmount*100)!==intent.amount_minor ||
      payment.details?.currency !== 'GBP') problems.push('provider_amount_or_currency_mismatch');
  if (typeof sourceAccountId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(sourceAccountId) ||
      payment.details?.sourceAccountId !== sourceAccountId) problems.push('source_account_mismatch');
  if (payment.details?.destination?.type !== 'BENEFICIARY' ||
      payment.details?.destination?.id !== intent.recipient_id) problems.push('beneficiary_mismatch');
  if (!['submitted','unknown','confirmed','returned'].includes(intent.status)) problems.push('unexpected_transfer_state');
  if (intent.status === 'returned' && payment.status === 'PROCESSED') problems.push('stored_return_requires_manual_review');
  if (payout.status === 'paid' || payout.paid_at) problems.push('paid_state_requires_independent_receipt_audit');
  const ledger = inspectModulrPayoutLedger(db,payout);
  if (ledger.blockers.length) problems.push(...ledger.blockers);
  if (payment.status !== 'PROCESSED') problems.push('provider_not_processed');
  return {
    payoutId:payout.id, transferId:intent.id, runId:run.id,
    providerTransferId:intent.provider_transfer_id, recipientId:intent.recipient_id,
    amountMinor:intent.amount_minor, currency:intent.currency,
    originalTransferStatus:intent.status,
    providerStatus:payment.status, localTransferStatus:intent.status,
    payoutStatus:payout.status, providerEvidenceMatches:problems.length===0,
    beneficiaryReceiptVerified:false, accountingFinalised:false,
    safeForAutomaticFinalisation:false, paymentSubmitted:false,
    blockers:problems, ledgerEvidence:ledger
  };
}
