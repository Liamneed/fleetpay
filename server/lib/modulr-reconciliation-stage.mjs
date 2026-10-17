/** Read-only status classification. Provider PROCESSED is not bank receipt. */
export function classifyModulrPayoutStage({transfer, confirmations = [], payoutStatus}) {
 const providerStatus=String(transfer?.provider_status||'').toUpperCase();
 const localStatus=String(transfer?.status||'').toLowerCase();
 const failed=['FAILED','REJECTED','CANCELLED','RETURNED','REVERSED','ERROR'].some(word=>providerStatus.includes(word));
 const verifiedReceipt=confirmations.some(c=>c.outcome==='paid'&&c.verificationStatus==='verified'&&Boolean(c.verifiedAt));
 const conflictingEvidence=confirmations.some(c=>c.outcome==='failed'||c.outcome==='uncertain'||c.verificationStatus==='rejected');
 const accountingPaid=payoutStatus==='paid';
 let stage='not_submitted';
 if (failed) stage='failed_or_returned';
 else if (verifiedReceipt && !conflictingEvidence) stage=accountingPaid?'paid':'receipt_verified_pending_accounting';
 else if (providerStatus==='PROCESSED') stage='provider_processed_pending_receipt';
 else if (transfer?.provider_transfer_id||['submitted','confirmed','processing'].includes(localStatus)) stage='submitted_or_processing';
 return {stage,requiresReview:failed||conflictingEvidence||(accountingPaid&&!verifiedReceipt),
   providerProcessed:providerStatus==='PROCESSED',receiptVerified:verifiedReceipt&&!conflictingEvidence,
   accountingPaid,accountingFinalised:false};
}
