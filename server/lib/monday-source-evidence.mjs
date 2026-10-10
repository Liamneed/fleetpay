// STEP176_MONDAY_SOURCE_EVIDENCE
// Pure evidence preparation. No database or network operations.
// Source validation does not constitute payout authorisation.

import {createHash} from 'node:crypto';

function hash(value){
 return createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');
}

export function prepareMondaySourceEvidence({
 runId,
 verification,
 drivers,
 retrievedAt
}={}){
 if(
  typeof runId!=='string' ||
  !runId.trim()
 ){
  throw new Error('Missing Monday settlement ID.');
 }

 if(
  !verification ||
  verification.valid!==true ||
  verification.complete!==true ||
  verification.financialVerificationReady!==true
 ){
  throw new Error(
   'Autocab financial source is not verified.'
  );
 }

 if(
  !Array.isArray(drivers) ||
  drivers.length===0
 ){
  throw new Error('No settlement drivers supplied.');
 }

 const time=Date.parse(retrievedAt||'');

 if(!Number.isFinite(time)){
  throw new Error('Invalid financial source retrieval time.');
 }

 const balances=[];
 const seen=new Set();

 for(const driver of drivers){
  const driverId=Number(driver?.driverId);
  const rawBalance=driver?.previousBalance;
  const balance=Number(rawBalance);

  if(
   !Number.isSafeInteger(driverId) ||
   driverId<=0 ||
   seen.has(driverId)
  ){
   throw new Error('Invalid or duplicate settlement driver.');
  }

  if(
   rawBalance===null ||
   rawBalance===undefined ||
   rawBalance==='' ||
   !Number.isFinite(balance)
  ){
   throw new Error(
    `Invalid Previous Balance for driver ${driverId}.`
   );
  }

  seen.add(driverId);

  balances.push({
   driverId,
   previousBalance:balance
  });
 }

 balances.sort((a,b)=>a.driverId-b.driverId);

 const sourceHash=hash({
  runId,
  balances
 });

 return Object.freeze({
  runId,
  status:'pending',
  source:'autocab_driver_accounts',
  retrievedAt:new Date(time).toISOString(),
  sourceHash,
  driverCount:drivers.length,
  accountCount:Number(verification.accountCount),
  pageCount:Number(verification.pageCount||0),
  totalSummariesCount:Number(
   verification.totalSummariesCount
  ),
  financialVerificationReady:true,
  settlementVerified:false
 });
}
