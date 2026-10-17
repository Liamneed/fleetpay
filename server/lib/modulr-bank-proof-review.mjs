// Sandbox-only independent manual receipt review. Does not mark a payout paid.
export function verifyModulrBankProof(db,{runId,evidenceId,reviewer,bankReference,attestation,now=new Date().toISOString()}){
 if(process.env.MODULR_ENV!=='sandbox'||process.env.MODULR_ENABLED!=='false'||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED!=='false'||
    process.env.AUTOCAB_ADJUSTMENTS_ENABLED!=='false'||
    process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED!=='false')
  throw new Error('Sandbox read-only-accounting configuration required');
 if(attestation!==true)throw new Error('Explicit independent beneficiary receipt attestation required');
 if(!String(bankReference||'').trim()||String(bankReference).length>300)throw new Error('Bank confirmation reference required');
 if(!String(reviewer||'').trim())throw new Error('Authenticated reviewer required');
 db.exec('BEGIN IMMEDIATE');
 try{
  const row=db.prepare(`SELECT e.*,p.status payout_status,p.paid_at,p.net_amount,p.amount payout_amount,p.payout_run_id,r.provider run_provider,r.status run_status,
      t.id transfer_intent_id,t.provider_transfer_id,t.status transfer_status,t.provider_status,t.amount_minor transfer_pence,t.currency transfer_currency,t.environment transfer_environment
      FROM payout_confirmations e JOIN payouts p ON p.id=e.payout_id
      JOIN payout_runs r ON r.id=p.payout_run_id
      JOIN payout_transfer_intents t ON t.payout_id=p.id AND t.payout_run_id=r.id
      WHERE e.id=? AND e.payout_run_id=?`).get(evidenceId,runId);
  if(!row)throw new Error('Evidence, payout, run and transfer must all exist');
  if(row.run_provider!=='modulr'||row.provider!=='modulr'||row.transfer_environment!=='sandbox'||
     row.run_status==='cancelled'||row.payout_status!=='batched'||row.paid_at)
   throw new Error('Payout or run not eligible for independent review');
  if(row.verification_status!=='unverified'||row.outcome!=='paid'||row.currency!=='GBP'||
     row.transfer_currency!=='GBP'||row.transfer_status!=='confirmed'||
     row.provider_status!=='PROCESSED'||!row.provider_transfer_id||
     row.provider_transfer_id!==row.provider_transaction_id)
   throw new Error('Evidence or provider transfer not eligible for verification');
  const pence=Math.round(Number(row.net_amount??row.payout_amount)*100);
  if(!Number.isSafeInteger(pence)||pence<=0||row.transfer_pence!==pence||
     Math.round(Number(row.amount)*100)!==pence)
   throw new Error('Amount mismatch');
  if(String(row.created_by).trim().toLowerCase()===String(reviewer).trim().toLowerCase())
   throw new Error('Evidence importer cannot verify their own record');
  if(!row.evidence_source||!row.evidence_reference)throw new Error('Evidence source and reference required');
  const changed=db.prepare(`UPDATE payout_confirmations SET verification_status='verified',verified_by=?,verified_at=?,updated_at=?,evidence_json=?
    WHERE id=? AND verification_status='unverified'`).run(reviewer,now,now,JSON.stringify({reviewMethod:'independent_bank_confirmation',bankConfirmationReference:String(bankReference).trim(),attestedBeneficiaryReceipt:true}),evidenceId);
  if(changed.changes!==1)throw new Error('Evidence changed during verification');
  db.exec('COMMIT');
  return {ok:true,evidenceId,payoutId:row.payout_id,verificationStatus:'verified',payoutStatus:'batched',accountingFinalised:false,autocabPosted:false};
 }catch(e){try{db.exec('ROLLBACK')}catch{}throw e}
}
