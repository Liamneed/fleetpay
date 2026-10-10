// STEP189_MONDAY_VERIFICATION_DECISION
// Pure eligibility decision. Does not approve or execute payments.

export function decideMondayVerification({
 runId,
 source,
 comparison,
 fingerprints,
 now=new Date().toISOString(),
 maxAgeMinutes=15
}={}){
 const issues=[];

 // STEP190_SETTLEMENT_IDENTITY_CHECK
 if(
  typeof runId!=='string' ||
  !runId.trim() ||
  source?.runId!==runId ||
  comparison?.runId!==runId
 ){
  issues.push(
   'Source and comparison must belong to the same settlement.'
  );
 }

 const current=Date.parse(now);
 const retrieved=Date.parse(source?.retrievedAt||'');
 const compared=Date.parse(comparison?.comparedAt||'');

 if(!Number.isFinite(current)){
  issues.push('Invalid verification time.');
 }

 if(
  !Number.isInteger(maxAgeMinutes) ||
  maxAgeMinutes<1 ||
  maxAgeMinutes>60
 ){
  issues.push('Invalid verification expiry policy.');
 }

 if(
  source?.financialVerificationReady!==true ||
  source?.status!=='pending' ||
  source?.settlementVerified!==false
 ){
  issues.push('Trusted pending financial-source evidence is required.');
 }

 // STEP193_ORIGINAL_SOURCE_VS_FRESH_COMPARISON
 // Historical source integrity is checked separately against the
 // saved settlement. Only the fresh comparison has a short expiry.
 if(
  !Number.isFinite(retrieved) ||
  !Number.isFinite(current) ||
  retrieved>current
 ){
  issues.push('Original source retrieval time is invalid.');
 }

 if(
  comparison?.balancesUnchanged!==true ||
  comparison?.differenceCount!==0 ||
  !Array.isArray(comparison?.differences) ||
  comparison.differences.length!==0
 ){
  issues.push('Autocab balance comparison has unresolved differences.');
 }

 if(
  !Number.isFinite(compared) ||
  !Number.isFinite(current) ||
  compared>current ||
  compared<retrieved ||
  current-compared>maxAgeMinutes*60000
 ){
  issues.push('Fresh balance comparison is unavailable.');
 }

 if(
  comparison?.snapshotDriverCount!==source?.driverCount ||
  comparison?.refreshedDriverCount!==source?.driverCount
 ){
  issues.push('Driver counts differ between source and comparison.');
 }

 if(
  !fingerprints ||
  typeof fingerprints.financialHash!=='string' ||
  !/^[a-f0-9]{64}$/.test(fingerprints.financialHash) ||
  typeof fingerprints.rulesHash!=='string' ||
  !/^[a-f0-9]{64}$/.test(fingerprints.rulesHash) ||
  typeof fingerprints.paymentPlansHash!=='string' ||
  !/^[a-f0-9]{64}$/.test(fingerprints.paymentPlansHash)
 ){
  issues.push('Complete financial fingerprints are required.');
 }

 if(fingerprints?.financialRulesChanged!==false){
  issues.push('Financial rules have changed since settlement creation.');
 }

 if(fingerprints?.missingPaymentPlanReferences!==0){
  issues.push('Payment-plan references are incomplete.');
 }

 if(!/^[a-f0-9]{64}$/.test(source?.sourceHash||'')){
  issues.push('Valid source-balance fingerprint is required.');
 }

 const eligible=issues.length===0;

 return {
  eligible,
  status:eligible?'passed':'failed',
  issues,
  expiresAt:eligible
   ?new Date(current+maxAgeMinutes*60000).toISOString()
   :null
 };
}
