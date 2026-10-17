// Administrator-reviewed Modulr sandbox payout accounting. Never calls a provider or Autocab.
export function finaliseModulrManualAccounting(db, {runId,evidenceId,actor,ledger,recordFee,audit,now=new Date().toISOString()}) {
 const required={MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED:'true',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'true'};
 if(Object.entries(required).some(([k,v])=>process.env[k]!==v)) throw Error('Sandbox manual accounting feature gate closed');
 if(!String(actor||'').trim() || !String(runId||'').trim() || !String(evidenceId||'').trim()) throw Error('Authenticated administrator, run and evidence required');
 db.exec('BEGIN IMMEDIATE');
 try {
  const matches=db.prepare(`SELECT e.*,p.status AS payout_status,p.paid_at,p.driver_id,p.type,p.fee,p.callsign,p.net_amount,p.amount AS payout_amount,
   r.provider AS run_provider,r.status AS run_status,r.funding_status,r.funds_cleared_at,
   t.status AS transfer_status,t.provider_status,t.provider_transfer_id,t.amount_minor,t.currency AS transfer_currency,t.environment AS transfer_environment
   FROM payout_confirmations e JOIN payouts p ON p.id=e.payout_id AND p.payout_run_id=e.payout_run_id
   JOIN payout_runs r ON r.id=e.payout_run_id
   JOIN payout_transfer_intents t ON t.payout_id=p.id AND t.payout_run_id=r.id AND t.provider='modulr'
   WHERE e.id=? AND e.payout_run_id=?`).all(evidenceId,runId);
  if(matches.length!==1)throw Error('Expected exactly one matching payout, evidence and transfer');
  const e=matches[0];
  if(e.run_provider!=='modulr'||e.provider!=='modulr'||e.run_status!=='funded'||e.funding_status!=='cleared'||!e.funds_cleared_at)throw Error('Run is not eligible or funding not cleared');
  if(e.payout_status!=='batched'||e.paid_at)throw Error('Payout is already paid or not batched');
  if(e.verification_status!=='verified'||e.outcome!=='paid'||!e.verified_at||!e.verified_by||!e.created_by||e.created_by.toLowerCase()===e.verified_by.toLowerCase())throw Error('Independent two-person receipt verification missing');
  if(e.currency!=='GBP'||e.transfer_currency!=='GBP'||e.transfer_environment!=='sandbox'||e.transfer_status!=='confirmed'||e.provider_status!=='PROCESSED'||!e.provider_transfer_id||e.provider_transaction_id!==e.provider_transfer_id)throw Error('Modulr transfer evidence mismatch');
  const amountPence=Math.round(Number(e.net_amount??e.payout_amount)*100);
  if(!Number.isSafeInteger(amountPence)||amountPence<=0||e.amount_minor!==amountPence||Math.round(Number(e.amount)*100)!==amountPence)throw Error('Payout amount mismatch');
  let proof;
  try{proof=JSON.parse(e.evidence_json||'null')}catch{throw Error('Bank verification JSON invalid')}
  if(proof?.reviewMethod!=='independent_bank_confirmation'||proof?.attestedBeneficiaryReceipt!==true||!String(proof?.bankConfirmationReference||'').trim())throw Error('Verified independent bank receipt proof missing');
  if(db.prepare(`SELECT COUNT(*) AS n FROM payout_confirmations WHERE payout_id=? AND outcome='paid' AND verification_status='verified'`).get(e.payout_id).n!==1)throw Error('Conflicting paid evidence');
  if(db.prepare(`SELECT COUNT(*) AS n FROM driver_ledger WHERE reference_id=? AND entry_type IN ('early_payout','weekly_payout','early_payout_fee')`).get(e.payout_id).n!==0)throw Error('Ledger payout posting already exists');
  const stamp=now;
  const updated=db.prepare(`UPDATE payouts SET status='paid',paid_at=?,updated_at=? WHERE id=? AND status='batched' AND paid_at IS NULL`).run(stamp,stamp,e.payout_id);
  if(updated.changes!==1)throw Error('Concurrent payout change');
  const fee=Number(e.fee||0);
  if(!Number.isFinite(fee)||fee<0)throw Error('Invalid fee');
  const entry=e.type==='early'?'early_payout':e.type==='weekly'?'weekly_payout':null;
  if(!entry)throw Error('Unsupported payout type');
  ledger(e.driver_id,entry,'credit',amountPence/100,fee,e.type==='early'?'Early payout paid':'Weekly payout paid',e.payout_id,'paid');
  if(e.type==='early'&&fee>0){
   ledger(e.driver_id,'early_payout_fee','debit',fee,fee,'Early payout fee',e.payout_id,'charged');
   recordFee({feeType:'early_payout',sourceType:'payout',sourceId:e.payout_id,driverId:e.driver_id,callsign:e.callsign,description:'Early payout fee',amount:fee,createdAt:stamp});
  }
  audit('modulr_manual_bank_accounting_finalised','payout',e.payout_id,{runId,evidenceId,providerTransferId:e.provider_transfer_id,amount:amountPence/100,bankVerifiedBy:e.verified_by,autocabPosted:false});
  db.exec('COMMIT');
  return {ok:true,payoutId:e.payout_id,evidenceId,paidAt:stamp,accountingFinalised:true,autocabPosted:false};
 } catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
}
