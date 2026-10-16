// Offline-only evidence assessment. Not an authorisation to pay, retry or release funds.
export function assessModulrRunCloseout({run, payouts, transfers, returns, events}={}) {
  const reasons=[];
  const fail=(reason)=>{reasons.push(reason)};
  if(!run || run.provider!=='modulr' || !['release_approved','cleared'].includes(run.funding_status)) fail('invalid_funding_state');
  if(!Array.isArray(payouts)||!Array.isArray(transfers)||!Array.isArray(returns)||!Array.isArray(events)) fail('incomplete_evidence');
  if(reasons.length) return conclusion(reasons);
  if(!payouts.length || !Number.isSafeInteger(Number(run.item_count)) || payouts.length!==Number(run.item_count)) fail('payout_count_mismatch');
  if(transfers.length!==payouts.length) fail('transfer_count_mismatch');
  const ids=new Set(), refs=new Set();
  for(const t of transfers){
    if(!t.payout_id || ids.has(t.payout_id)) fail('duplicate_payout_binding');
    ids.add(t.payout_id);
    if(!t.provider_transfer_id || refs.has(t.provider_transfer_id)) fail('duplicate_provider_reference');
    refs.add(t.provider_transfer_id);
    if(t.payout_run_id!==run.id || t.provider!=='modulr' || t.environment!=='sandbox' || t.currency!=='GBP') fail('transfer_identity_mismatch');
    if(t.status!=='confirmed'||t.provider_status!=='PROCESSED'||!t.confirmed_at) fail('unconfirmed_transfer');
    if(!events.some(e=>e.transfer_id===t.id && e.event_type==='confirmed' && e.provider_reference===t.provider_transfer_id && e.source==='modulr_api')) fail('missing_provider_confirmation_history');
  }
  for(const p of payouts){
    if(p.payout_run_id!==run.id) fail('payout_run_mismatch');
    const matching=transfers.filter(t=>t.payout_id===p.id);
    if(matching.length!==1){fail('missing_or_duplicate_transfer');continue;}
    const amount=Number(p.net_amount??p.amount), pennies=Math.round(amount*100);
    if(!Number.isFinite(amount)||!Number.isSafeInteger(pennies)||pennies<=0||Math.abs(amount*100-pennies)>0.000001||matching[0].amount_minor!==pennies) fail('amount_mismatch');
  }
  if(returns.length || events.some(e=>e.event_type==='returned')) fail('return_requires_review');
  if(events.some(e=>['unknown','failed'].includes(e.event_type))) fail('ambiguous_transfer_history');
  return conclusion(reasons);
}
function conclusion(reasons){return {structurallyConsistent:reasons.length===0, reasons:[...new Set(reasons)], requiresManualReview:true, fundingReleaseAuthorised:false, accountingFinalised:false, retryAuthorised:false, paymentSubmitted:false};}
