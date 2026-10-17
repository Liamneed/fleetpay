import { reviewStoredModulrTransfer } from './modulr-live-record-provider-review.mjs';
import { inspectModulrPayoutLedger } from './modulr-persistent-accounting-check.mjs';

// Authenticate via provider GET before entering SQLite's write transaction.
// This records PROCESSED as a sent transfer, NEVER beneficiary receipt or paid.
export async function persistAuthenticatedModulrProcessed({db,intentId,apiKey,sourceAccountId,fetchImpl}) {
  const review=await reviewStoredModulrTransfer({db,intentId,apiKey,sourceAccountId,fetchImpl});
  if(review.providerStatus!=='PROCESSED'||!review.providerEvidenceMatches)
    return {ok:false,changed:false,blockers:review.blockers,accountingFinalised:false};
  db.exec('BEGIN IMMEDIATE');
  try {
    const intent=db.prepare("SELECT * FROM payout_transfer_intents WHERE id=? AND provider='modulr' AND environment='sandbox'").get(intentId);
    if(!intent||!['submitted','unknown','confirmed'].includes(intent.status))
      throw Error('Transfer evidence changed; reconciliation stopped.');
    const payout=db.prepare('SELECT * FROM payouts WHERE id=? AND payout_run_id=?').get(intent.payout_id,intent.payout_run_id);
    const run=db.prepare('SELECT * FROM payout_runs WHERE id=?').get(intent.payout_run_id);
    if(!payout||!run||run.provider!=='modulr'||payout.id!==review.payoutId||run.id!==review.runId||
       payout.status==='paid'||payout.paid_at||['returned','cancelled','failed'].includes(payout.status))
      throw Error('Payout changed; reconciliation stopped.');
    const amount=Number(payout.net_amount??payout.amount);
    const minor=Math.round(amount*100);
    if(!Number.isSafeInteger(minor)||minor<=0||Math.abs(amount*100-minor)>0.000001||minor!==intent.amount_minor||intent.currency!=='GBP')
      throw Error('Transfer amount changed; reconciliation stopped.');
    const ledger=inspectModulrPayoutLedger(db,payout);
    if(ledger.blockers.length)throw Error('Payout ledger changed; reconciliation stopped.');
    const now=new Date().toISOString();
    let changed=false;
    if(intent.status!=='confirmed'||intent.provider_status!=='PROCESSED'){
      const n=db.prepare("UPDATE payout_transfer_intents SET status='confirmed',provider_status='PROCESSED',updated_at=? WHERE id=? AND status=? AND provider_transfer_id=? AND provider='modulr' AND environment='sandbox'").run(now,intentId,intent.status,intent.provider_transfer_id);
      if(n.changes!==1)throw Error('Transfer changed during reconciliation.');
      changed=true;
    }
    // Payout and driver ledger are deliberately unchanged. A bank debit
    // cannot by itself authorise accounting or beneficiary-paid status.
    db.exec('COMMIT');
    return {ok:true,changed,transferStatus:'confirmed',payoutStatus:payout.status,
      beneficiaryReceiptVerified:false,accountingFinalised:false,autocabPosted:false};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err;}
}
