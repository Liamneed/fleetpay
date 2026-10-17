// Read-only, conservative interpretation of stored Modulr evidence for operations.
// Provider PROCESSED / debit evidence does not mean the beneficiary was credited.
// Never grants payment finalisation authority and never mutates the database.
export function assessModulrPayoutOperationalState(items){
 if(!Array.isArray(items))throw new TypeError('Payout items must be an array');
 const assessed=items.map(item=>{
  const transfer=item.modulrTransfer;
  const reasons=[];
  if(!transfer)reasons.push('missing_transfer_instruction');
  else{
   if(transfer.currency!=='GBP'||transfer.amountMatches!==true)
    reasons.push('transfer_amount_or_currency_mismatch');
   if(!transfer.providerTransferId)reasons.push('missing_provider_transfer_reference');
  }
  if(item.payoutStatus==='paid'){
   // The existing provider paid evidence needs separate trusted verification;
   // even an imported 'verified' flag is not enough to infer beneficiary credit.
   reasons.push('paid_state_requires_independent_audit');
  }else if(item.payoutStatus==='returned'){
   reasons.push('returned_payment_requires_manual_reconciliation');
  }else if(item.payoutStatus==='sent'){
   reasons.push('beneficiary_receipt_unverified');
  }else if(!['batched','approved','queued'].includes(item.payoutStatus)){
   reasons.push('unexpected_payout_status');
  }
  if(item.ledgerEvidence?.blockers?.length)reasons.push(...item.ledgerEvidence.blockers);
  if(item.hasUncertainEvidence)reasons.push('unresolved_provider_evidence');
  if(item.paidAt && item.payoutStatus!=='paid')reasons.push('paid_timestamp_state_mismatch');
  return {
   payoutId:item.payoutId,
   payoutStatus:item.payoutStatus,
   transferStatus:transfer?.status??null,
   providerStatus:transfer?.providerStatus??null,
   requiresManualReview:reasons.length>0,
   blockers:reasons,
   beneficiaryReceiptVerified:false,
   safeForAutomaticFinalisation:false
  };
 });
 return {
  payoutCount:assessed.length,
  requiresManualReview:assessed.filter(x=>x.requiresManualReview).length,
  beneficiaryReceiptVerified:0,
  safeForAutomaticFinalisation:false,
  accountingMutationPerformed:false,
  items:assessed
 };
}
