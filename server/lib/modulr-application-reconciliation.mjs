// Read-only reconciliation against FaivoPay's real payout, ledger, confirmation,
// fee and Autocab queues. This module never authorises payment or accounting.
import {readModulrRunCloseout} from './modulr-run-closeout-read.mjs';
import {assessModulrAutocabSettlement} from './modulr-autocab-settlement-evidence.mjs';
const cents = value => {
  if (value === null || value === undefined || value === '') return null;
  const v = Number(value), n = Math.round(v * 100);
  return Number.isFinite(v) && Number.isSafeInteger(n) && n >= 0 && Math.abs(v * 100 - n) < 1e-6 ? n : null;
};
export function reviewModulrApplicationAccounting(db, runId) {
  const blockers = new Set();
  const deny = reason => blockers.add(reason);
  const result = () => ({runId,blockers:[...blockers],accountingAuthorised:false,
    autocabWritesAuthorised:false,livePaymentsAuthorised:false,manualReviewRequired:true,
    policy:'provider_processed_plus_authenticated_debit_is_sent_not_beneficiary_credited'});
  if(typeof runId !== 'string' || !/^[\w-]{1,128}$/.test(runId)) throw Error('Invalid run ID');
  const required=['payout_runs','payouts','payout_transfer_intents','driver_ledger',
    'payout_confirmations','autocab_adjustments','modulr_return_register',
    'modulr_payment_events','modulr_debit_evidence'];
  for(const table of required){
    if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
      deny(`missing_table:${table}`);
  }
  if(blockers.size) return result();
  const run = db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId);
  if(!run || run.provider !== 'modulr') throw Error('Not a Modulr payout run');
  if(run.paid_at || run.reconciled_at || run.status === 'paid' || run.status === 'cancelled') deny('run_previously_finalised_or_cancelled');
  if(!run.released_at || !run.funds_cleared_at || !run.provider_ref || run.funding_status !== 'cleared') deny('funding_or_release_not_verified');
  const payouts=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(runId);
  const transfers=db.prepare("SELECT * FROM payout_transfer_intents WHERE payout_run_id=? AND provider='modulr'").all(runId);
  if(!payouts.length || payouts.length!==run.item_count || transfers.length!==payouts.length ||
      cents(run.total_amount)!==payouts.reduce((s,p)=>s+(cents(p.net_amount??p.amount)??-999999999),0)) deny('payout_run_total_mismatch');
  for(const p of payouts){
    if(p.status!=='batched' || p.paid_at) deny('payout_already_finalised_or_ineligible');
    const net=cents(p.net_amount??p.amount),fee=cents(p.type==='early'?p.fee:p.weekly_fee),
      carried=cents(p.carried_charges);
    if(net===null || net===0 || fee===null || carried===null) deny('invalid_payout_fee_or_amount');
    if(fee>0 || carried>0) {
      const adjustmentEvidence=assessModulrAutocabSettlement(db,p);
      for(const blocker of adjustmentEvidence.blockers) deny(`autocab:${blocker}`);
      deny('fee_or_carried_charges_need_atomic_autocab_reconciliation');
    }
    if(p.type!=='weekly' && p.type!=='early') deny('unsupported_payout_type');
    const matched=transfers.filter(t=>t.payout_id===p.id);
    if(matched.length!==1 || matched[0].amount_minor!==net) deny('transfer_payout_binding_invalid');
    if(db.prepare('SELECT 1 FROM payout_confirmations WHERE payout_id=? LIMIT 1').get(p.id)) deny('existing_payout_confirmation');
    if(db.prepare('SELECT 1 FROM driver_ledger WHERE reference_id=? LIMIT 1').get(p.id)) deny('existing_driver_ledger_posting');
    if(db.prepare('SELECT 1 FROM autocab_adjustments WHERE event_key LIKE ? LIMIT 1').get(`payout:${p.id}:%`)) deny('existing_autocab_adjustment');
  }
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='modulr_sent_postings'").get()){
    for(const p of payouts){
      if(db.prepare('SELECT 1 FROM modulr_sent_postings WHERE payout_id=?').get(p.id)) deny('existing_modulr_sent_posting');
    }
  }
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='driver_payment_plan_allocations'").get()) {
    for(const p of payouts){
      if(db.prepare('SELECT 1 FROM driver_payment_plan_allocations WHERE payout_id=? LIMIT 1').get(p.id)) deny('payment_plan_allocation_requires_review');
    }
  }
  const evidence=readModulrRunCloseout(db,runId);
  if(evidence.evidenceReview?.blockers?.some(b=>b!=='independent_beneficiary_settlement_not_established')) deny('modulr_provider_or_debit_evidence_invalid');
  if(!evidence.evidenceReview || evidence.evidenceReview.items?.length!==payouts.length) deny('modulr_provider_or_debit_evidence_incomplete');
  return {...result(),payoutCount:payouts.length,amountMinor:cents(run.total_amount),
    providerEvidenceBlockers:evidence.evidenceReview?.blockers??[],
    actionableForManualDesignReview:blockers.size===0};
}
