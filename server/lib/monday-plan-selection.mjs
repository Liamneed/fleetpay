// STEP209_MONDAY_PLAN_SELECTION
// Verify that a saved deduction uses the plan/instalment
// selected by the existing Monday settlement policy.
// No database or payment side effects.

export function verifyMondayPlanSelection({
 driverId,
 selectedPlanId,
 selectedInstalmentId,
 plans,
 instalments
}={}){
 const issues=[];

 if(
  !Number.isSafeInteger(driverId) ||
  driverId<=0 ||
  !Array.isArray(plans) ||
  !Array.isArray(instalments)
 ){
  return {
   valid:false,
   issues:['Invalid payment-plan selection inputs.']
  };
 }

 const planIds=new Set();
 const instalmentIds=new Set();

 // STEP211_ALL_INSTALMENT_SEQUENCE_INTEGRITY
 // Sequence numbers must be unique within each payment plan,
 // irrespective of instalment payment status.
 const instalmentSequences=new Set();

 for(const plan of plans){
  if(!plan?.id || planIds.has(plan.id)){
   issues.push('Invalid or duplicated payment plan.');
  }
  planIds.add(plan?.id);

  if(
   !Number.isSafeInteger(Number(plan?.driver_id)) ||
   Number(plan.driver_id)!==driverId ||
   !Number.isFinite(Date.parse(plan?.created_at||''))
  ){
   issues.push('Invalid plan identity or creation date.');
  }
 }

 for(const instalment of instalments){
  if(!instalment?.id || instalmentIds.has(instalment.id)){
   issues.push('Invalid or duplicated instalment.');
  }
  instalmentIds.add(instalment?.id);

  if(!planIds.has(instalment?.plan_id)){
   issues.push('Instalment references an unknown payment plan.');
  }

  const sequence=Number(instalment?.instalment_number);

  if(
   instalment?.plan_id &&
   Number.isSafeInteger(sequence) &&
   sequence>0
  ){
   const key=JSON.stringify([
    instalment.plan_id,
    sequence
   ]);

   if(instalmentSequences.has(key)){
    issues.push(
     'Duplicate instalment sequence within payment plan.'
    );
   }

   instalmentSequences.add(key);
  }

  if(
   !Number.isSafeInteger(Number(instalment?.driver_id)) ||
   Number(instalment.driver_id)!==driverId ||
   !Number.isSafeInteger(Number(instalment?.instalment_number)) ||
   Number(instalment.instalment_number)<=0
  ){
   issues.push('Invalid instalment identity or sequence.');
  }
 }

 if(issues.length){
  return {valid:false,issues};
 }

 const eligiblePlans=plans
  .filter(p=>['active','defaulted'].includes(p.status))
  .sort((a,b)=>
   Date.parse(b.created_at)-Date.parse(a.created_at)
  );

 // Ambiguous ordering must fail closed.
 if(
  eligiblePlans.length>1 &&
  Date.parse(eligiblePlans[0].created_at)===
  Date.parse(eligiblePlans[1].created_at)
 ){
  issues.push('Latest eligible plan is ambiguous.');
 }

 const expectedPlan=eligiblePlans[0]||null;

 const eligibleInstalments=expectedPlan
  ?instalments
    .filter(x=>
     x.plan_id===expectedPlan.id &&
     ['due','overdue'].includes(x.status)
    )
    .sort((a,b)=>
     Number(a.instalment_number)-
     Number(b.instalment_number)
    )
  :[];

 if(
  eligibleInstalments.length>1 &&
  Number(eligibleInstalments[0].instalment_number)===
  Number(eligibleInstalments[1].instalment_number)
 ){
  issues.push('First eligible instalment is ambiguous.');
 }

 const expectedInstalment=eligibleInstalments[0]||null;

 if((selectedPlanId||null)!==(expectedPlan?.id||null)){
  issues.push('Selected payment plan is not the latest eligible plan.');
 }

 if(
  (selectedInstalmentId||null)!==
  (expectedInstalment?.id||null)
 ){
  issues.push('Selected instalment is not the first eligible instalment.');
 }

 return {
  valid:issues.length===0,
  issues,
  expectedPlanId:expectedPlan?.id||null,
  expectedInstalmentId:expectedInstalment?.id||null
 };
}
