// Modulr outgoing SENT bookkeeping using the EXISTING FaivoPay driver_ledger.
// Disabled unless explicitly authorised; never sends a payment or calls Autocab.
import {randomUUID} from 'node:crypto';
import {assertModulrSandboxAccountingDatabase} from './modulr-sandbox-accounting-database.mjs';
import {reviewModulrApplicationAccounting} from './modulr-application-reconciliation.mjs';
const minor=v=>{const n=Number(v),p=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(p)||p<=0||Math.abs(n*100-p)>1e-6)throw Error('Invalid financial amount');return p;};
function gate(){
 if(process.env.MODULR_APPLICATION_ACCOUNTING_ENABLED!=='true'||
    process.env.MODULR_ENV!=='sandbox'||
    process.env.MODULR_ENABLED!=='false'||
    process.env.MODULR_SANDBOX_POST_ENABLED!=='false'||
    process.env.MODULR_ONE_POUND_EXECUTION_ENABLED!=='false'||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED!=='false'||
    process.env.AUTOCAB_ADJUSTMENTS_ENABLED!=='false'||
    process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED!=='false'){
  throw Error('Modulr application accounting disabled or unsafe environment');
 }
}
export function postModulrApplicationSentRun(db,runId){
 gate();
 if(db.isTransaction)throw Error('Existing transaction prohibited');
 assertModulrSandboxAccountingDatabase(db);
 db.exec('BEGIN IMMEDIATE');
 try{
  const review=reviewModulrApplicationAccounting(db,runId);
  if(!review.actionableForManualDesignReview||review.blockers.length)throw Error(`Modulr run blocked: ${review.blockers.join(', ')}`);
  const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(runId);
  if(!run||run.status==='cancelled'||run.paid_at||run.reconciled_at)throw Error('Run not eligible');
  const payouts=db.prepare('SELECT * FROM payouts WHERE payout_run_id=? ORDER BY id').all(runId);
  if(!payouts.length||payouts.length!==run.item_count)throw Error('Run count changed');
  let sum=0;const now=new Date().toISOString();
  for(const p of payouts){
   const amount=minor(p.net_amount??p.amount);sum+=amount;
   if(!Number.isSafeInteger(p.driver_id)||p.status!=='batched'||p.paid_at||
      (p.type==='early'&&Number(p.fee||0)!==0))
    throw Error('Payout requires fee or status review');
   const t=db.prepare("SELECT * FROM payout_transfer_intents WHERE payout_id=? AND payout_run_id=? AND provider='modulr'").all(p.id,runId);
   if(t.length!==1||t[0].environment!=='sandbox'||t[0].status!=='confirmed'||t[0].provider_status!=='PROCESSED'||t[0].amount_minor!==amount)throw Error('Transfer is not authenticated SENT');
   if(db.prepare('SELECT 1 FROM driver_ledger WHERE reference_id=? LIMIT 1').get(p.id))throw Error('Prior driver posting');
   const changed=db.prepare("UPDATE payouts SET status='sent',updated_at=? WHERE id=? AND status='batched' AND paid_at IS NULL").run(now,p.id);
   if(changed.changes!==1)throw Error('Payout changed while posting');
   db.prepare(`INSERT INTO driver_ledger(id,driver_id,entry_type,direction,amount,fee_amount,description,reference_id,status,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`).run(`modulr_${randomUUID()}`,p.driver_id,p.type==='early'?'early_payout':'weekly_payout','credit',amount/100,0,
      p.type==='early'?'Modulr payout sent (beneficiary credit unverified)':'Modulr weekly payout sent (beneficiary credit unverified)',p.id,'sent',now);
  }
  if(sum!==minor(run.total_amount))throw Error('Run amount changed');
  const changed=db.prepare("UPDATE payout_runs SET status='processing' WHERE id=? AND paid_at IS NULL AND status<>'cancelled'").run(runId);
  if(changed.changes!==1)throw Error('Run changed during posting');
  db.exec('COMMIT');
  return {runId,payoutCount:payouts.length,amountMinor:sum,accountingStatus:'sent_not_beneficiary_credited',payoutStatus:'sent',runStatus:'processing',autocabAdjusted:false};
 }catch(e){try{db.exec('ROLLBACK')}catch{}throw e;}
}
