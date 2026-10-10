// Read-only assessment of Autocab adjustment evidence.
// A balance movement never proves that a specific adjustment was posted.

function toCents(value){
 if(
  value===null ||
  value===undefined ||
  value==='' ||
  typeof value==='boolean'
 )return null;

 const n=Number(value);
 if(!Number.isFinite(n))return null;

 const cents=Math.round(n*100);
 if(
  !Number.isSafeInteger(cents) ||
  Math.abs(n*100-cents)>0.000001
 )return null;

 return cents;
}

export function assessAdjustmentReconciliation({
 adjustment,
 before,
 after
}={}){
 const result={
  classification:'insufficient_evidence',
  balanceMatched:false,
  transactionVerified:false,
  requiresManualReview:true,
  safeToRetry:false,
  reason:'Insufficient account evidence.'
 };

 if(!adjustment || !before || !after)return result;

 const driverId=Number(adjustment.driver_id);
 const amount=toCents(adjustment.amount);
 const initial=toCents(before.currentBalance);
 const observed=toCents(after.currentBalance);

 if(
  !Number.isSafeInteger(driverId) ||
  driverId<=0 ||
  amount===null ||
  amount<=0 ||
  initial===null ||
  observed===null ||
  typeof adjustment.event_key!=='string' ||
  !adjustment.event_key.trim() ||
  ![0,1,false,true].includes(adjustment.is_credit) ||
  Number(before.driverId)!==driverId ||
  Number(after.driverId)!==driverId
 ){
  return result;
 }

 const beforeTime=Date.parse(before.fetchedAt);
 const afterTime=Date.parse(after.fetchedAt);

 if(
  !Number.isFinite(beforeTime) ||
  !Number.isFinite(afterTime) ||
  afterTime<=beforeTime
 ){
  return {
   ...result,
   reason:'Account snapshot times are missing or out of order.'
  };
 }

 // STEP132_RECONCILIATION_TIME_SAFETY
 // The final snapshot must be after the recorded adjustment attempt.
 const attemptedAt=Date.parse(adjustment.created_at);

 if(
  !Number.isFinite(attemptedAt) ||
  beforeTime>attemptedAt ||
  afterTime<=attemptedAt
 ){
  return {
   ...result,
   reason:'Snapshots do not bracket the adjustment attempt.'
  };
 }

 const expected=initial+
  (Boolean(adjustment.is_credit)?amount:-amount);

 if(!Number.isSafeInteger(expected))return result;

 if(observed===expected){
  return {
   ...result,
   classification:'balance_match_only',
   balanceMatched:true,
   reason:'Expected balance observed, but no transaction-specific proof exists.'
  };
 }

 return {
  ...result,
  classification:'balance_mismatch',
  reason:'Observed account balance differs from the expected movement.'
 };
}
