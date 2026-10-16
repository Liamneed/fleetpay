import {assessModulrRunCloseout} from './modulr-run-closeout-assessment.mjs';
import {planModulrSettlement} from './modulr-settlement-readiness.mjs';
import {reviewModulrRunEvidence} from './modulr-run-evidence-review.mjs';
import {readModulrDebitObservations} from './modulr-debit-evidence-store.mjs';
// Uses ONLY existing tables and never mutates a database. Missing data fails closed.
export function readModulrRunCloseout(db,runId){
  if(typeof runId!=='string'||!runId||runId.length>128) throw new Error('Invalid run ID');
  const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId);
  if(!run) throw new Error('Payout run not found');
  if(run.provider!=='modulr') throw new Error('Not a Modulr run');
  const payouts=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(runId);
  const transfers=db.prepare("SELECT * FROM payout_transfer_intents WHERE payout_run_id=? AND provider='modulr'").all(runId);
  // Missing critical audit tables means the assessment must fail closed.
  for(const table of ['modulr_return_register','modulr_payment_events']){
    const exists=db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',table);
    if(!exists)return {runId,payoutCount:payouts.length,transferCount:transfers.length,returnCount:null,
      assessment:{structurallyConsistent:false,reasons:['audit_table_missing'],requiresManualReview:true,
        fundingReleaseAuthorised:false,accountingFinalised:false,retryAuthorised:false,paymentSubmitted:false}};
  }
  const transferIds=transfers.map(t=>t.id);
  const returns=[],events=[];
  for(const id of transferIds){
    returns.push(...db.prepare('SELECT * FROM modulr_return_register WHERE transfer_id=?').all(id));
    events.push(...db.prepare('SELECT * FROM modulr_payment_events WHERE transfer_id=?').all(id));
  }
  const debitTable=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='modulr_debit_evidence'").get();
  const debits=debitTable ? readModulrDebitObservations(db,transferIds) : [];
  return {runId, evidenceReview:reviewModulrRunEvidence({run,payouts,transfers,returns,events,debits}), payoutCount:payouts.length,transferCount:transfers.length, returnCount:returns.length, assessment:assessModulrRunCloseout({run,payouts,transfers,returns,events}),settlementPlan:planModulrSettlement({run,payouts,transfers,returns,events})};
}
