import {assessModulrRunCloseout} from './modulr-run-closeout-assessment.mjs';
// Uses ONLY existing tables and never mutates a database. Missing data fails closed.
export function readModulrRunCloseout(db,runId){
  if(typeof runId!=='string'||!runId||runId.length>128) throw new Error('Invalid run ID');
  const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId);
  if(!run) throw new Error('Payout run not found');
  if(run.provider!=='modulr') throw new Error('Not a Modulr run');
  const payouts=db.prepare('SELECT * FROM payouts WHERE payout_run_id=?').all(runId);
  const transfers=db.prepare("SELECT * FROM payout_transfer_intents WHERE payout_run_id=? AND provider='modulr'").all(runId);
  const transferIds=transfers.map(t=>t.id);
  const returns=[],events=[];
  for(const id of transferIds){
    returns.push(...db.prepare('SELECT * FROM modulr_return_register WHERE transfer_id=?').all(id));
    events.push(...db.prepare('SELECT * FROM modulr_payment_events WHERE transfer_id=?').all(id));
  }
  return {runId, payoutCount:payouts.length,transferCount:transfers.length, returnCount:returns.length, assessment:assessModulrRunCloseout({run,payouts,transfers,returns,events})};
}
