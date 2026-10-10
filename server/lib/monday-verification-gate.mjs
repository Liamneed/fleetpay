// STEP223_MONDAY_VERIFICATION_GATE
// Fail-closed verification gate for financial progression.
// No database writes or external payment operations.

const hash=value=>
 typeof value==='string' &&
 /^[a-f0-9]{64}$/.test(value);

export function checkMondayVerificationGate({
 runId,
 verification,
 fingerprints,
 now=new Date().toISOString()
}={}){
 const issues=[];

 if(typeof runId!=='string'||!runId.trim()){
  issues.push('Invalid settlement identity.');
 }

 if(
  !verification ||
  verification.run_id!==runId ||
  verification.status!=='passed'
 ){
  issues.push('Passed settlement verification is required.');
 }

 const current=Date.parse(now);
 const compared=Date.parse(verification?.compared_at||'');
 const expiry=Date.parse(verification?.expires_at||'');

 if(
  !Number.isFinite(current) ||
  !Number.isFinite(compared) ||
  !Number.isFinite(expiry) ||
  compared>current ||
  expiry<=current ||
  expiry<=compared
 ){
  issues.push('Settlement verification is expired or invalid.');
 }

 if(verification?.difference_count!==0){
  issues.push('Unresolved balance differences.');
 }

 let evidence=null;

 try{
  evidence=JSON.parse(
   verification?.evidence_json||'null'
  );
 }catch{
  issues.push('Stored verification evidence is malformed.');
 }

 if(
  !evidence ||
  evidence.runId!==runId ||
  evidence.settlementVerified!==true ||
  evidence.financialVerificationReady!==true
 ){
  issues.push('Stored verification evidence is incomplete.');
 }

 if(
  !hash(verification?.snapshot_hash) ||
  !hash(verification?.autocab_source_hash) ||
  !hash(verification?.rules_hash) ||
  !hash(verification?.payment_plans_hash) ||
  !hash(evidence?.financialHash)
 ){
  issues.push('Required verification fingerprints are missing.');
 }

 if(
  verification?.autocab_source_hash!==
  evidence?.sourceHash
 ){
  issues.push('Original Autocab source fingerprint differs.');
 }

 if(
  verification?.snapshot_hash!==
  evidence?.snapshotHash
 ){
  issues.push('Original settlement snapshot fingerprint differs.');
 }

 if(
  fingerprints?.financialHash!==evidence?.financialHash ||
  fingerprints?.rulesHash!==verification?.rules_hash ||
  fingerprints?.paymentPlansHash!==
   verification?.payment_plans_hash
 ){
  issues.push('Settlement financial fingerprints have changed.');
 }

 if(fingerprints?.financialRulesChanged!==false){
  issues.push('Financial settings have changed.');
 }

 if(fingerprints?.missingPaymentPlanReferences!==0){
  issues.push('Payment-plan references are incomplete.');
 }

 if(
  typeof verification?.verified_by!=='string' ||
  !verification.verified_by.trim()
 ){
  issues.push('Verification audit identity is missing.');
 }

 return {
  allowed:issues.length===0,
  issues
 };
}
