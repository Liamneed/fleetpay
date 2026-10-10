// STEP207_MONDAY_PLAN_RECONCILIATION
// Pure payment-plan allocation verification.
// No database writes, Autocab adjustments or payout authorisation.

const money=value=>{
 if(
  typeof value!=='number' ||
  !Number.isFinite(value) ||
  value<0 ||
  Math.abs(value*100-Math.round(value*100))>0.000001
 ){
  return null;
 }
 return Math.round(value*100);
};

export function reconcileMondayPlanAllocations({
 runId,
 items,
 allocations,
 plans,
 instalments
}={}){
 const issues=[];

 if(
  typeof runId!=='string' ||
  !runId.trim() ||
  !Array.isArray(items) ||
  !Array.isArray(allocations) ||
  !Array.isArray(plans) ||
  !Array.isArray(instalments)
 ){
  return {
   valid:false,
   issues:['Incomplete payment-plan reconciliation inputs.']
  };
 }

 const planById=new Map();
 const instalmentById=new Map();
 const allocationByDriver=new Map();
 const seenAllocationIds=new Set();
 const seenInstalments=new Set();
 const seenDrivers=new Set();

 for(const plan of plans){
  if(!plan?.id || planById.has(plan.id)){
   issues.push('Invalid or duplicated payment plan.');
  }else{
   planById.set(plan.id,plan);
  }
 }

 for(const instalment of instalments){
  if(!instalment?.id || instalmentById.has(instalment.id)){
   issues.push('Invalid or duplicated instalment.');
  }else{
   instalmentById.set(instalment.id,instalment);
  }
 }

 for(const allocation of allocations){
  const driverId=Number(allocation?.driver_id);

  if(
   !allocation?.id ||
   seenAllocationIds.has(allocation.id)
  ){
   issues.push('Duplicate or invalid allocation ID.');
  }

  seenAllocationIds.add(allocation?.id);

  if(allocation?.run_id!==runId){
   issues.push('Allocation belongs to another settlement.');
  }

  if(
   !Number.isSafeInteger(driverId) ||
   driverId<=0 ||
   allocationByDriver.has(driverId)
  ){
   issues.push('Duplicate or invalid allocation driver.');
  }else{
   allocationByDriver.set(driverId,allocation);
  }

  if(
   !allocation?.instalment_id ||
   seenInstalments.has(allocation.instalment_id)
  ){
   issues.push('Duplicate or invalid allocated instalment.');
  }

  seenInstalments.add(allocation?.instalment_id);
 }

 for(const item of items){
  const driverId=Number(item?.driverId);

  if(
   !Number.isSafeInteger(driverId) ||
   driverId<=0 ||
   seenDrivers.has(driverId)
  ){
   issues.push('Duplicate or invalid settlement driver.');
   continue;
  }

  seenDrivers.add(driverId);

  const amount=money(item.planAllocation);
  const allocation=allocationByDriver.get(driverId);

  if(amount===null){
   issues.push(`Driver ${driverId}: invalid plan deduction.`);
   continue;
  }

  if(amount===0){
   if(allocation){
    issues.push(`Driver ${driverId}: unexpected allocation.`);
   }
   continue;
  }

  if(!allocation){
   issues.push(`Driver ${driverId}: allocation missing.`);
   continue;
  }

  const plan=planById.get(allocation.plan_id);
  const instalment=instalmentById.get(allocation.instalment_id);

  if(!plan || !instalment){
   issues.push(`Driver ${driverId}: plan or instalment missing.`);
   continue;
  }

  if(
   Number(plan.driver_id)!==driverId ||
   Number(instalment.driver_id)!==driverId ||
   Number(allocation.driver_id)!==driverId ||
   instalment.plan_id!==plan.id
  ){
   issues.push(`Driver ${driverId}: plan ownership mismatch.`);
  }

  if(!['active','defaulted'].includes(plan.status)){
   issues.push(`Driver ${driverId}: plan status ineligible.`);
  }

  if(!['due','overdue'].includes(instalment.status)){
   issues.push(`Driver ${driverId}: instalment status ineligible.`);
  }

  if(
   item.planId!==plan.id ||
   item.planInstalmentId!==instalment.id ||
   allocation.plan_id!==plan.id ||
   allocation.instalment_id!==instalment.id
  ){
   issues.push(`Driver ${driverId}: plan references differ.`);
  }

  if(
   allocation.payout_id!==(item.payoutId||null)
  ){
   issues.push(`Driver ${driverId}: linked payout differs.`);
  }

  if(
   (allocation.payment_request_id||null)!==
   (instalment.payment_request_id||null)
  ){
   issues.push(`Driver ${driverId}: instalment request differs.`);
  }

  const scheduled=money(instalment.amount);
  const paid=money(instalment.paid_amount);
  const remaining=money(plan.remaining_amount);
  const available=money(item.adjustedBalance);

  if(
   scheduled===null ||
   paid===null ||
   remaining===null ||
   available===null ||
   paid>scheduled
  ){
   issues.push(`Driver ${driverId}: invalid plan financial inputs.`);
   continue;
  }

  const expected=Math.min(
   available,
   scheduled-paid,
   remaining
  );

  if(
   expected<=0 ||
   amount!==expected ||
   money(allocation.allocated_amount)!==expected ||
   money(allocation.scheduled_amount)!==scheduled ||
   money(item.planInstalmentScheduledAmount)!==scheduled ||
   money(item.planInstalmentPaidAmount)!==paid ||
   money(item.planInstalmentRemaining)!==scheduled-paid ||
   money(item.planRemainingAmount)!==remaining
  ){
   issues.push(`Driver ${driverId}: plan deduction differs.`);
  }

  if(allocation.status!=='pending'){
   issues.push(`Driver ${driverId}: allocation is not pending.`);
  }
 }

 for(const driverId of allocationByDriver.keys()){
  if(!seenDrivers.has(driverId)){
   issues.push('Allocation references an absent settlement driver.');
  }
 }

 return {
  valid:issues.length===0,
  issues,
  allocationCount:allocations.length
 };
}
