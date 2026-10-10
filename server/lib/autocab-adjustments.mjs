// Autocab adjustment service.
// Dependencies are injected so tests cannot access production systems.

export function createAutocabAdjustmentService({
 db,
 transport,
 makeId,
 baseUrl,
 adjustmentsEnabled=false,
 liveTestWritesEnabled=false,
 logger=console
}){
 if(!db || typeof db.prepare!=='function'){
  throw new Error('Adjustment service requires a database.');
 }

 if(typeof transport!=='function'){
  throw new Error('Adjustment service requires a transport function.');
 }

 if(typeof makeId!=='function'){
  throw new Error('Adjustment service requires an ID generator.');
 }

 const BASE_URL=baseUrl;
 const AUTOCAB_ADJUSTMENTS_ENABLED=adjustmentsEnabled;
 const LIVE_TEST_AUTOCAB_WRITES_ENABLED=liveTestWritesEnabled;
 const id=makeId;
 const putJson=transport;

// STEP123V_ADJUSTMENT_IDENTITY
// A unique event key must not represent different financial details.
function assertAdjustmentIdentity(existing,args){
 const cents=value=>{
  if(value===null || value===undefined || value===''){
   return null;
  }

  const n=Number(value);

  if(!Number.isFinite(n) || n<=0){
   return null;
  }

  const rounded=Math.round(n*100);

  if(
   !Number.isSafeInteger(rounded) ||
   Math.abs(n*100-rounded)>0.000001
  ){
   return null;
  }

  return rounded;
 };

 const sameDriver=
  Number(existing.driver_id)===Number(args.driverId);

 const originalAmount=cents(existing.amount);
 const requestedAmount=cents(args.amount);

 const sameAmount=
  originalAmount!==null &&
  originalAmount===requestedAmount;

 const sameDirection=
  Boolean(existing.is_credit)===Boolean(args.isCredit);

 if(!sameDriver || !sameAmount || !sameDirection){
  throw new Error(
   'Autocab event-key conflict: driver, amount or direction '+
   'differs from the original adjustment. No adjustment was sent.'
  );
 }
}

async function postAutocabAdjustment({driverId,callsign,amount,isCredit,description,adjustmentReason,eventKey,liveTestWrite=false}){
 // STEP123O_VALIDATE_ADJUSTMENT_INPUT
 const numericDriverId=Number(driverId);
 const numericAmount=Number(amount);
 const numericCents=Math.round(numericAmount*100);

 if(
  !Number.isSafeInteger(numericDriverId) ||
  numericDriverId<=0
 ){
  throw new Error('Invalid Autocab adjustment driver ID.');
 }

 if(
  amount===null ||
  amount===undefined ||
  amount==='' ||
  !Number.isFinite(numericAmount) ||
  numericAmount<=0 ||
  !Number.isSafeInteger(numericCents) ||
  Math.abs(numericAmount*100-numericCents)>0.000001
 ){
  throw new Error(
   'Autocab adjustment amount must be a positive GBP amount in whole pence.'
  );
 }

 if(typeof isCredit!=='boolean'){
  throw new Error(
   'Autocab adjustment direction must be explicitly true or false.'
  );
 }

 if(
  typeof eventKey!=='string' ||
  !eventKey.trim() ||
  eventKey.length>250
 ){
  throw new Error(
   'A valid unique Autocab adjustment event key is required.'
  );
 }

 if(
  typeof description!=='string' ||
  !description.trim()
 ){
  throw new Error(
   'Autocab adjustment description is required.'
  );
 }

 const liveTestIdentityApproved=
  Boolean(liveTestWrite) &&
  LIVE_TEST_AUTOCAB_WRITES_ENABLED &&
  Number(driverId)===1112 &&
  String(callsign)==='9997' &&
  Number(amount)===1;

 const approvedLiveTestCredit=
  liveTestIdentityApproved &&
  Boolean(isCredit)===true &&
  String(description)==='FaivoPay Live Test Credit' &&
  String(adjustmentReason)==='FaivoPay Live Test' &&
  String(eventKey)==='live-test:1112:first-credit-1gbp';

 const approvedLiveTestReversal=
  liveTestIdentityApproved &&
  Boolean(isCredit)===false &&
  String(description)==='FaivoPay Live Test Reversal' &&
  String(adjustmentReason)==='FaivoPay Live Test' &&
  String(eventKey)==='live-test:1112:first-credit-reversal-1gbp';

 const approvedLiveTestWrite=
  approvedLiveTestCredit||
  approvedLiveTestReversal;

 if(liveTestWrite && !approvedLiveTestWrite){
  throw new Error(
   'Controlled Live Test Autocab write gate rejected this adjustment.'
  );
 }

 if(
  !AUTOCAB_ADJUSTMENTS_ENABLED &&
  !approvedLiveTestWrite
 ){
  throw new Error(
   'Autocab adjustments are disabled. '+
   'Set AUTOCAB_ADJUSTMENTS_ENABLED=true to enable production writes.'
  );
 }

  const existing=db.prepare(
  'SELECT * FROM autocab_adjustments WHERE event_key=?'
 ).get(eventKey);

 if(existing){
  assertAdjustmentIdentity(existing,{driverId,amount,isCredit});
 }

 if(existing?.status==='completed'){
  return {duplicate:true,existing};
 }

 if(existing){
  throw new Error(
   `Autocab adjustment ${eventKey} is ${existing.status}. `+
   'It cannot be resent automatically. Reconcile the original request first.'
  );
 }

 const adjustmentId=id('adj');
 const now=new Date().toISOString();

 db.prepare(
  `INSERT INTO autocab_adjustments(
    id,event_key,driver_id,callsign,amount,is_credit,
    description,adjustment_reason,status,created_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?)`
 ).run(
  adjustmentId,eventKey,driverId,callsign,Number(amount),
  isCredit?1:0,description,adjustmentReason||'',
  'pending',now
 );

 // STEP123I_CONFIRMED_REMOTE_ADJUSTMENT
 // Remote confirmation must be recorded independently of cache updates.
 let response;

 try{
  response=await putJson(
   `${BASE_URL}/driver/v1/accounts/driveraccounts/${driverId}/adjustment`,
   {
    amount:Number(amount),
    description,
    isCredit:Boolean(isCredit),
    adjustmentReason:adjustmentReason||'FaivoPay'
   }
  );
 }catch(e){
  // A timeout does not prove the remote write failed.
  db.prepare(
   'UPDATE autocab_adjustments SET status=?,error=? WHERE id=?'
  ).run(
   'uncertain',
   String(e.message||e),
   adjustmentId
  );
  throw e;
 }

 const completedAt=new Date().toISOString();

 // Record confirmed remote success first.
 // If this write fails, the existing pending record blocks retries.
 db.prepare(
  `UPDATE autocab_adjustments
   SET status='completed',
       response_json=?,
       completed_at=?,
       error=NULL
   WHERE id=?`
 ).run(
  JSON.stringify(response||{}),
  completedAt,
  adjustmentId
 );

 let cacheUpdated=false;

 try{
  const result=db.prepare(
   `UPDATE driver_cache
    SET current_balance=COALESCE(current_balance,0)+?,
        synced_at=?
    WHERE driver_id=?`
  ).run(
   isCredit?Number(amount):-Number(amount),
   completedAt,
   driverId
  );

  cacheUpdated=Number(result.changes||0)===1;

 }catch(e){
  logger.error(
   'Confirmed Autocab adjustment requires cache reconciliation:',
   adjustmentId,
   String(e.message||e)
  );
 }

 return {
  ok:true,
  id:adjustmentId,
  response,
  completedAt,
  cacheUpdated
 };
}

async function postAutocabAdjustmentSafelyOnce(args){
 const eventKey=String(args?.eventKey||'').trim();

 if(!eventKey){
  throw new Error(
   'A unique Autocab event key is required for a safe one-time adjustment'
  );
 }

 const existing=db.prepare(`
  SELECT *
  FROM autocab_adjustments
  WHERE event_key=?
 `).get(eventKey);

 if(existing){
  assertAdjustmentIdentity(existing,args);
 }

 if(existing?.status==='completed'){
  return {
   duplicate:true,
   existing
  };
 }

 if(existing){
  throw new Error(
   `Autocab adjustment ${eventKey} is ${existing.status}. `+
   'FaivoPay will not resend it automatically because the previous Autocab outcome may be uncertain. Review the adjustment before retrying.'
  );
 }

 return postAutocabAdjustment(args);
}


 return {
  postAutocabAdjustment,
  postAutocabAdjustmentSafelyOnce
 };
}
