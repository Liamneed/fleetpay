// Read-only, fail-closed run-level evidence reconciliation.
// Provider PROCESSED does not prove irrevocable settlement. No financial writes.
import { assessModulrRunCloseout } from './modulr-run-closeout-assessment.mjs';

const money = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) && Math.abs(value * 100 - minor) < 1e-7 ? minor : null;
};

export function planModulrSettlement({run, payouts, transfers, returns, events, settlementEvidence}={}) {
  const assessment = assessModulrRunCloseout({run,payouts,transfers,returns,events});
  const blockers = [...assessment.reasons];
  const add = reason => { if (!blockers.includes(reason)) blockers.push(reason); };
  if (!run || !Array.isArray(payouts) || !Array.isArray(transfers) ||
      !Array.isArray(returns) || !Array.isArray(events)) {
    return result(blockers.length ? blockers : ['incomplete_evidence'], []);
  }
  const items=[];
  const providerIds = new Set();
  const evidenceByTransfer = new Map();
  // Settlement evidence must be an explicit collection. Even perfect payment
  // history cannot substitute for an independently verified provider debit.
  if (!Array.isArray(settlementEvidence)) add('settlement_evidence_not_supplied');
  else for (const e of settlementEvidence) {
    if (!e || typeof e !== 'object' || typeof e.transferId !== 'string' ||
        evidenceByTransfer.has(e.transferId)) { add('duplicate_or_malformed_settlement_evidence'); continue; }
    evidenceByTransfer.set(e.transferId, e);
  }
  for (const t of transfers) {
    if (!t?.id || !t.payout_id) { add('malformed_transfer'); continue; }
    if (providerIds.has(t.provider_transfer_id)) add('duplicate_provider_reference');
    providerIds.add(t.provider_transfer_id);
    const p = payouts.find(x => x.id === t.payout_id);
    const e = evidenceByTransfer.get(t.id);
    const issues=[];
    if (!p) issues.push('payout_not_found');
    else if (money(p.net_amount ?? p.amount) !== t.amount_minor) issues.push('amount_mismatch');
    if (!e) issues.push('independent_settlement_evidence_missing');
    else {
      // No caller-supplied Boolean such as verified=true is treated as proof.
      // A dedicated authenticated provider evidence store is not yet wired.
      if (e.providerReference !== t.provider_transfer_id || e.transferId !== t.id ||
          e.currency !== 'GBP' || e.amountMinor !== t.amount_minor ||
          e.sourceAccountId == null || !e.providerTransactionId) {
        issues.push('settlement_evidence_identity_mismatch');
      }
      issues.push('independent_provider_attestation_not_implemented');
    }
    if (returns.some(r => r.transfer_id === t.id) ||
        events.some(v => v.transfer_id === t.id && v.event_type === 'returned')) {
      issues.push('bank_return_requires_review');
    }
    if (events.some(v => v.transfer_id === t.id && ['failed','unknown'].includes(v.event_type))) {
      issues.push('uncertain_transfer_history');
    }
    for (const issue of issues) add(issue);
    items.push({ transferId:t.id, payoutId:t.payout_id, providerReference:t.provider_transfer_id || null,
      status:issues.length ? 'manual_review' : 'evidence_review', issues });
  }
  if (Array.isArray(settlementEvidence)) for(const transferId of evidenceByTransfer.keys()) {
    if (!transfers.some(t=>t.id===transferId)) add('orphan_settlement_evidence');
  }
  return result(blockers,items);
}

function result(blockers, items) {
  return {
    readyForAccounting:false, readyForCommitmentRelease:false,
    readyForAutocab:false, payoutSubmissionAuthorised:false,
    retryAuthorised:false, manualReviewRequired:true,
    blockers:[...new Set(blockers)], items
  };
}
