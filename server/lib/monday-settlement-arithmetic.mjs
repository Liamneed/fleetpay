// STEP196_MONDAY_SETTLEMENT_ARITHMETIC
// Independent recalculation of Monday driver settlement amounts.
// Does not establish payment-plan eligibility or authorise payouts.

const round=value=>Number(value.toFixed(2));

function validMoney(value,name,{negative=false}={}){
 if(
  typeof value!=='number' ||
  !Number.isFinite(value) ||
  (!negative&&value<0) ||
  Math.abs(value*100-Math.round(value*100))>0.000001
 ){
  throw new Error(`Invalid ${name}.`);
 }
 return value;
}

export function calculateMondayDriverSettlement({
 previousBalance,
 weeklyAppFee,
 minimumPayoutThreshold,
 negativeThreshold,
 chargeWeeklyFeeWhenInactive=true,
 workedThisWeek=false,
 planAllocation=0
}={}){
 const base=validMoney(
  previousBalance,'previous balance',{negative:true}
 );

 const configuredFee=validMoney(
  weeklyAppFee,'weekly app fee'
 );

 const minimum=validMoney(
  minimumPayoutThreshold,'minimum payout threshold'
 );

 const negativeMinimum=validMoney(
  negativeThreshold,'negative threshold'
 );

 const allocation=validMoney(
  planAllocation,'payment-plan allocation'
 );

 if(
  typeof chargeWeeklyFeeWhenInactive!=='boolean' ||
  typeof workedThisWeek!=='boolean'
 ){
  throw new Error('Invalid driver activity or fee setting.');
 }

 const worked=workedThisWeek;
 const chargeInactive=chargeWeeklyFeeWhenInactive;

 const potentialFee=
  chargeInactive||worked?configuredFee:0;

 const positiveEligible=
  base>0.00001 &&
  base+0.00001>=minimum;

 const negativeEligible=
  base< -0.00001 &&
  Math.abs(base)+0.00001>=negativeMinimum;

 const weeklyFee=
  positiveEligible||negativeEligible?potentialFee:0;

 const adjustedBalance=round(base-weeklyFee);

 if(allocation>0&&!positiveEligible){
  throw new Error('Plan allocation without eligible positive balance.');
 }

 if(allocation>Math.max(0,adjustedBalance)+0.00001){
  throw new Error('Plan allocation exceeds available balance.');
 }

 const payoutAvailable=round(
  Math.max(0,adjustedBalance-allocation)
 );

 let action='no_action';
 let amount=0;

 if(base>0.00001){
  if(!positiveEligible){
   action='no_action';
   amount=0;
  }else if(payoutAvailable<=0.00001){
   action='plan_allocation';
  }else{
   action='payout';
   amount=payoutAvailable;
  }
 }else if(base< -0.00001){
  if(negativeEligible){
   action='payment_request';
   amount=round(Math.abs(base)+weeklyFee);
  }else{
   action='no_action';
   amount=0;
  }
 }

 return {
  action,
  amount,
  weeklyFee,
  adjustedBalance,
  planAllocation:allocation,
  payoutAvailable,
  weeklyFeeWaivedInactive:
   !chargeInactive&&!worked&&configuredFee>0
 };
}
