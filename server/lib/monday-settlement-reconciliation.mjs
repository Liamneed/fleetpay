// STEP198_MONDAY_SETTLEMENT_RECONCILIATION
// Pure arithmetic and financial-record consistency checks.
// No database, network or payment side effects.

import {
 calculateMondayDriverSettlement
} from './monday-settlement-arithmetic.mjs';

const cents=value=>{
 if(
  typeof value!=='number' ||
  !Number.isFinite(value) ||
  Math.abs(value*100-Math.round(value*100))>0.000001
 ){
  return null;
 }
 return Math.round(value*100);
};

export function reconcileMondaySettlement({
 runId,
 items,
 settings,
 payouts,
 paymentRequests
}={}){
 const issues=[];

 // STEP205_SETTLEMENT_OWNERSHIP
 if(typeof runId!=='string'||!runId.trim()){
  issues.push('Missing settlement identity.');
 }

 if(
  !Array.isArray(items) ||
  !items.length ||
  !settings ||
  !Array.isArray(payouts) ||
  !Array.isArray(paymentRequests)
 ){
  return {
   valid:false,
   issues:['Incomplete settlement reconciliation inputs.']
  };
 }

 const payoutById=new Map();
 const requestById=new Map();
 const usedPayouts=new Set();
 const usedRequests=new Set();
 const driverIds=new Set();

 for(const p of payouts){
  if(p?.run_id!==runId){
   issues.push('Payout belongs to another settlement.');
  }
  if(!p?.id || payoutById.has(p.id)){
   issues.push('Duplicate or invalid payout record.');
  }else{
   payoutById.set(p.id,p);
  }
 }

 for(const r of paymentRequests){
  if(r?.run_id!==runId){
   issues.push('Payment request belongs to another settlement.');
  }
  if(!r?.id || requestById.has(r.id)){
   issues.push('Duplicate or invalid payment-request record.');
  }else{
   requestById.set(r.id,r);
  }
 }

 for(const item of items){
  const driverId=Number(item?.driverId);

  if(
   !Number.isSafeInteger(driverId) ||
   driverId<=0 ||
   driverIds.has(driverId)
  ){
   issues.push('Duplicate or invalid settlement driver.');
   continue;
  }

  driverIds.add(driverId);

  let expected;

  try{
   expected=calculateMondayDriverSettlement({
    previousBalance:item.previousBalance,
    weeklyAppFee:Number(settings.weeklyAppFee??0),
    minimumPayoutThreshold:
     Number(settings.minimumPayoutThreshold??0),
    negativeThreshold:Number(settings.negativeThreshold??0),
    chargeWeeklyFeeWhenInactive:
     settings.chargeWeeklyFeeWhenInactive!==false,
    workedThisWeek:item.workedThisWeek,
    planAllocation:item.planAllocation
   });
  }catch(e){
   issues.push(`Driver ${driverId}: ${e.message}`);
   continue;
  }

  const moneyFields=[
   'amount',
   'weeklyFee',
   'adjustedBalance',
   'planAllocation',
   'payoutAvailable'
  ];

  if(item.action!==expected.action){
   issues.push(`Driver ${driverId}: settlement action differs.`);
  }

  for(const field of moneyFields){
   if(
    cents(item[field])===null ||
    cents(item[field])!==cents(expected[field])
   ){
    issues.push(`Driver ${driverId}: ${field} differs.`);
   }
  }

  if(
   item.weeklyFeeWaivedInactive!==
   expected.weeklyFeeWaivedInactive
  ){
   issues.push(`Driver ${driverId}: inactive fee waiver differs.`);
  }

  if(expected.action==='payout'){
   const p=payoutById.get(item.payoutId);

   if(!p || usedPayouts.has(item.payoutId)){
    issues.push(`Driver ${driverId}: payout missing or duplicated.`);
   }else{
    usedPayouts.add(item.payoutId);

    if(
     Number(p.driver_id)!==driverId ||
     cents(p.amount)!==cents(expected.amount) ||
     cents(p.gross_balance)!==cents(item.previousBalance) ||
     cents(p.weekly_fee)!==cents(expected.weeklyFee) ||
     cents(p.net_amount)!==cents(expected.payoutAvailable) ||
     cents(p.gross_amount)!==cents(expected.adjustedBalance) ||
     p.type!=='weekly'
    ){
     issues.push(`Driver ${driverId}: payout record differs.`);
    }
   }

   if(item.requestId){
    issues.push(`Driver ${driverId}: unexpected payment request.`);
   }
  }else if(expected.action==='payment_request'){
   const r=requestById.get(item.requestId);

   if(!r || usedRequests.has(item.requestId)){
    issues.push(`Driver ${driverId}: request missing or duplicated.`);
   }else{
    usedRequests.add(item.requestId);

    if(
     Number(r.driver_id)!==driverId ||
     cents(r.amount)!==cents(expected.amount) ||
     cents(r.balance)!==cents(item.previousBalance) ||
     cents(r.weekly_fee)!==cents(expected.weeklyFee)
    ){
     issues.push(`Driver ${driverId}: payment request differs.`);
    }
   }

   if(item.payoutId){
    issues.push(`Driver ${driverId}: unexpected payout.`);
   }
  }else if(item.payoutId || item.requestId){
   issues.push(`Driver ${driverId}: unexpected financial record.`);
  }
 }

 if(usedPayouts.size!==payoutById.size){
  issues.push('Unexpected or unreferenced payout records.');
 }

 if(usedRequests.size!==requestById.size){
  issues.push('Unexpected or unreferenced payment-request records.');
 }

 return {
  valid:issues.length===0,
  issues,
  driverCount:driverIds.size,
  payoutCount:usedPayouts.size,
  paymentRequestCount:usedRequests.size
 };
}
