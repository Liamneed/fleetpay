// Review-only reconciliation of persisted Modulr debit observations, returns,
// transfer history, and run contents. Never settles or posts accounting.
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const pennies = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = Math.round(n * 100);
  return Number.isSafeInteger(p) && Math.abs(n * 100 - p) < 0.000001 ? p : null;
};
export function reviewModulrRunEvidence({run, payouts, transfers, returns, events, debits} = {}) {
  const blockers = new Set();
  const items = [];
  const deny = reason => blockers.add(reason);
  const answer = () => ({runId:run?.id ?? null, items, blockers:[...blockers], manualReviewRequired:true,
    bankSettlementVerified:false, accountingAuthorised:false, fundingReleaseAuthorised:false,
    retryAuthorised:false, autocabWritesAuthorised:false});
  if (!run || run.provider !== 'modulr' || ![payouts,transfers,returns,events,debits].every(Array.isArray)) {
    deny('invalid_or_missing_run_evidence'); return answer();
  }
  if (!payouts.length || payouts.length !== Number(run.item_count) ||
      transfers.length !== payouts.length || pennies(run.total_amount) !==
      payouts.reduce((s,p)=>s+(pennies(p.net_amount ?? p.amount) ?? 0),0)) deny('run_totals_or_counts_invalid');
  const usedPayouts = new Set(), usedRefs = new Set(), usedTransactions = new Set();
  for (const t of transfers) {
    const issues = [];
    const problem = reason => {issues.push(reason);deny(reason);};
    const p = payouts.find(p => p.id === t.payout_id);
    const observations = debits.filter(d=>d.transferId === t.id);
    const matches = observations.filter(d => d.providerPaymentId === t.provider_transfer_id &&
      d.amountMinor === t.amount_minor && d.currency === 'GBP' &&
      d.evidenceStatus === 'debit_observed' && id(d.providerTransactionId) && id(d.sourceAccountId));
    if (!id(t.id) || t.payout_run_id !== run.id || t.provider !== 'modulr' ||
        t.environment !== 'sandbox' || t.currency !== 'GBP') problem('transfer_identity_invalid');
    if (!p || p.payout_run_id !== run.id || pennies(p.net_amount ?? p.amount) !== t.amount_minor)
      problem('payout_identity_or_amount_invalid');
    if (usedPayouts.has(t.payout_id)) problem('duplicate_payout_binding');
    usedPayouts.add(t.payout_id);
    if (!id(t.provider_transfer_id) || usedRefs.has(t.provider_transfer_id)) problem('duplicate_or_missing_provider_reference');
    usedRefs.add(t.provider_transfer_id);
    if (t.status !== 'confirmed' || t.provider_status !== 'PROCESSED' || !t.confirmed_at)
      problem('payment_not_provider_confirmed');
    const confirms = events.filter(e=>e.transfer_id === t.id && e.event_type === 'confirmed' &&
      e.provider_reference === t.provider_transfer_id && e.source === 'modulr_api');
    if (confirms.length !== 1) problem('provider_history_missing_or_duplicate');
    if (observations.length !== 1 || matches.length !== 1) problem('debit_evidence_missing_or_conflicting');
    if (matches.length === 1) {
      const unique = `${matches[0].sourceAccountId}:${matches[0].providerTransactionId}`;
      if (usedTransactions.has(unique)) problem('duplicate_provider_debit_transaction');
      usedTransactions.add(unique);
    }
    if (returns.some(r=>r.transfer_id===t.id) || events.some(e=>e.transfer_id===t.id && e.event_type==='returned'))
      problem('bank_return_requires_review');
    if (events.some(e=>e.transfer_id===t.id && ['unknown','failed'].includes(e.event_type)))
      problem('uncertain_payment_history');
    // Even a matching outgoing debit cannot prove final beneficiary credit.
    problem('independent_beneficiary_settlement_not_established');
    items.push({transferId:t.id,payoutId:t.payout_id,providerReference:t.provider_transfer_id,
      debitObserved:matches.length===1,returnObserved:issues.includes('bank_return_requires_review'),
      issues:[...new Set(issues)],accountingAuthorised:false});
  }
  if (payouts.some(p=>!usedPayouts.has(p.id))) deny('payout_without_transfer');
  if (debits.some(d=>!transfers.some(t=>t.id===d.transferId))) deny('orphan_debit_evidence');
  if (returns.some(r=>!transfers.some(t=>t.id===r.transfer_id))) deny('orphan_bank_return');
  if (events.some(e=>!transfers.some(t=>t.id===e.transfer_id))) deny('orphan_payment_history');
  return answer();
}
