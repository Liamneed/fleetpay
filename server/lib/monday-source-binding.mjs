// STEP192_MONDAY_SOURCE_BINDING
// Verify that saved settlement balances match original source evidence.
// This does not independently verify Autocab or authorise payments.

import {createHash} from 'node:crypto';

export function verifyMondaySourceBinding({
 runId,
 source,
 items
}={}){
 const issues=[];

 if(
  typeof runId!=='string' ||
  !runId.trim() ||
  source?.runId!==runId
 ){
  issues.push('Settlement identity mismatch.');
 }

 if(
  source?.status!=='pending' ||
  source?.financialVerificationReady!==true ||
  source?.settlementVerified!==false ||
  source?.source!=='autocab_driver_accounts'
 ){
  issues.push('Original source evidence is invalid.');
 }

 if(!Array.isArray(items)||items.length===0){
  issues.push('Settlement items are missing.');
 }

 const balances=[];
 const seen=new Set();

 if(Array.isArray(items)){
  for(const item of items){
   const driverId=Number(item?.driverId);
   const raw=item?.previousBalance;
   const previousBalance=Number(raw);

   if(
    !Number.isSafeInteger(driverId) ||
    driverId<=0 ||
    seen.has(driverId)
   ){
    issues.push('Invalid or duplicate settlement driver.');
    continue;
   }

   seen.add(driverId);

   if(
    raw===null ||
    raw===undefined ||
    raw==='' ||
    !Number.isFinite(previousBalance)
   ){
    issues.push(
     `Invalid saved balance for driver ${driverId}.`
    );
    continue;
   }

   balances.push({driverId,previousBalance});
  }
 }

 balances.sort((a,b)=>a.driverId-b.driverId);

 const calculatedHash=createHash('sha256')
  .update(JSON.stringify({runId,balances}))
  .digest('hex');

 if(
  typeof source?.sourceHash!=='string' ||
  !/^[a-f0-9]{64}$/.test(source.sourceHash) ||
  source.sourceHash!==calculatedHash
 ){
  issues.push('Saved balances differ from original source evidence.');
 }

 if(
  !Number.isSafeInteger(source?.driverCount) ||
  source.driverCount!==items?.length ||
  source.driverCount!==balances.length
 ){
  issues.push('Settlement driver count differs from source evidence.');
 }

 return {
  valid:issues.length===0,
  issues,
  calculatedHash
 };
}
