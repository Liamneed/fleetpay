// STEP214_MONDAY_PLAN_VERIFICATION
// Coordinates read-only database evidence and pure validators.
// Does not execute deductions, approve payouts or modify SQLite.

import {
 loadMondayPlanDatabaseEvidence
} from './monday-plan-db-evidence.mjs';

import {
 verifyMondayPlanSelection
} from './monday-plan-selection.mjs';

import {
 reconcileMondayPlanAllocations
} from './monday-plan-reconciliation.mjs';

const cents=value=>{
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

export function verifyMondayPlansFromDatabase({
 db,
 runId,
 items
}={}){
 const evidence=loadMondayPlanDatabaseEvidence({
  db,runId,items
 });

 const issues=[];

 const plans=evidence.drivers.flatMap(d=>d.plans);
 const instalments=evidence.drivers.flatMap(d=>d.instalments);

 const amounts=reconcileMondayPlanAllocations({
  runId,
  items,
  allocations:evidence.allocations,
  plans,
  instalments
 });

 issues.push(...amounts.issues);

 for(const driver of evidence.drivers){
  const item=items.find(
   x=>Number(x.driverId)===driver.driverId
  );

  const adjusted=cents(item.adjustedBalance);
  const allocation=cents(item.planAllocation);

  if(adjusted===null && Number(item.adjustedBalance)>0){
   issues.push(
    `Driver ${driver.driverId}: invalid available balance.`
   );
   continue;
  }

  if(allocation===null){
   issues.push(
    `Driver ${driver.driverId}: invalid plan allocation.`
   );
   continue;
  }

  const positiveEligible=
   Number(item.previousBalance)>0 &&
   Number(item.adjustedBalance)>0;

  const available=positiveEligible
   ?Math.max(0,adjusted||0)
   :0;

  // Select the plan using the current Monday rules.
  const eligiblePlans=driver.plans
   .filter(x=>['active','defaulted'].includes(x.status))
   .sort((a,b)=>
    Date.parse(b.created_at)-Date.parse(a.created_at)
   );

  const selectedPlan=eligiblePlans[0]||null;

  const eligibleInstalments=selectedPlan
   ?driver.instalments
     .filter(x=>
      x.plan_id===selectedPlan.id &&
      ['due','overdue'].includes(x.status)
     )
     .sort((a,b)=>
      Number(a.instalment_number)-
      Number(b.instalment_number)
     )
   :[];

  const selectedInstalment=eligibleInstalments[0]||null;

  const scheduled=cents(selectedInstalment?.amount);
  const paid=cents(selectedInstalment?.paid_amount);
  const remaining=cents(selectedPlan?.remaining_amount);

  const expected=
   available>0 &&
   selectedPlan &&
   selectedInstalment &&
   scheduled!==null &&
   paid!==null &&
   remaining!==null &&
   paid<=scheduled
    ?Math.min(available,scheduled-paid,remaining)
    :0;

  // Selection must match whenever a deduction is expected.
  const selection=verifyMondayPlanSelection({
   driverId:driver.driverId,
   selectedPlanId:expected>0?item.planId:null,
   selectedInstalmentId:
    expected>0?item.planInstalmentId:null,
   plans:driver.plans,
   instalments:driver.instalments
  });

  // If there is no collectible amount, a plan may exist but
  // no deduction should be selected.
  const selectionIssues=selection.issues.filter(issue=>
   expected>0 ||
   (
    !issue.startsWith('Selected payment plan') &&
    !issue.startsWith('Selected instalment')
   )
  );

  issues.push(...selectionIssues.map(issue=>
   `Driver ${driver.driverId}: ${issue}`
  ));

  if(allocation!==expected){
   issues.push(
    `Driver ${driver.driverId}: deduction does not match eligible amount.`
   );
  }

  if(expected===0 && allocation>0){
   issues.push(
    `Driver ${driver.driverId}: ineligible payment-plan deduction.`
   );
  }
 }

 return {
  valid:issues.length===0,
  issues,
  driverCount:evidence.drivers.length,
  allocationCount:evidence.allocations.length
 };
}
