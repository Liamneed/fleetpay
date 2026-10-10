// STEP213_MONDAY_PLAN_DB_EVIDENCE
// Read-only SQLite evidence collection for Monday plan reconciliation.
// This module does not approve or execute any payments.

export function loadMondayPlanDatabaseEvidence({
 db,
 runId,
 items
}={}){
 if(
  !db ||
  typeof db.prepare!=='function' ||
  typeof runId!=='string' ||
  !runId.trim() ||
  !Array.isArray(items) ||
  items.length===0
 ){
  throw new Error('Invalid Monday plan evidence inputs.');
 }

 const seen=new Set();
 const driverIds=[];

 for(const item of items){
  const driverId=Number(item?.driverId);

  if(
   !Number.isSafeInteger(driverId) ||
   driverId<=0 ||
   seen.has(driverId)
  ){
   throw new Error(
    'Invalid or duplicate settlement driver.'
   );
  }

  seen.add(driverId);
  driverIds.push(driverId);
 }

 const allocations=db.prepare(`
  SELECT *
  FROM payment_plan_settlement_allocations
  WHERE run_id=?
  ORDER BY id
 `).all(runId);

 const plansForDriver=db.prepare(`
  SELECT *
  FROM driver_payment_plans
  WHERE driver_id=?
  ORDER BY created_at DESC,id
 `);

 const instalmentsForPlan=db.prepare(`
  SELECT *
  FROM driver_payment_plan_instalments
  WHERE plan_id=?
  ORDER BY instalment_number,id
 `);

 const drivers=[];

 for(const driverId of driverIds){
  const plans=plansForDriver.all(driverId);
  const instalments=[];

  for(const plan of plans){
   instalments.push(
    ...instalmentsForPlan.all(plan.id)
   );
  }

  drivers.push({
   driverId,
   plans,
   instalments
  });
 }

 // Preserve all allocations, even if their driver isn't present
 // in the settlement. Reconciliation must detect those orphans.
 return {
  runId,
  items,
  allocations,
  drivers
 };
}
