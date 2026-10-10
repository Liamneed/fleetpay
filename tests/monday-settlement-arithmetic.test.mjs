import test from 'node:test';
import assert from 'node:assert/strict';

import {
 calculateMondayDriverSettlement as calculate
} from '../server/lib/monday-settlement-arithmetic.mjs';

const defaults={
 weeklyAppFee:5,
 minimumPayoutThreshold:20,
 negativeThreshold:30,
 chargeWeeklyFeeWhenInactive:true,
 workedThisWeek:true
};

const run=(previousBalance,extra={})=>
 calculate({...defaults,previousBalance,...extra});

test('positive balance above threshold pays less weekly fee',()=>{
 const result=run(100);
 assert.equal(result.action,'payout');
 assert.equal(result.amount,95);
 assert.equal(result.weeklyFee,5);
});

test('positive balance below threshold requires no action',()=>{
 const result=run(19.99);
 assert.equal(result.action,'no_action');
 assert.equal(result.amount,0);
 assert.equal(result.weeklyFee,0);
});

test('positive balance exactly at threshold',()=>{
 const result=run(20);
 assert.equal(result.action,'payout');
 assert.equal(result.amount,15);
});

test('payment-plan deduction reduces available payout',()=>{
 const result=run(100,{planAllocation:30});
 assert.equal(result.action,'payout');
 assert.equal(result.amount,65);
 assert.equal(result.payoutAvailable,65);
});

test('payment plan can consume full available payout',()=>{
 const result=run(100,{planAllocation:95});
 assert.equal(result.action,'plan_allocation');
 assert.equal(result.amount,0);
});

test('negative balance above collection threshold',()=>{
 const result=run(-40);
 assert.equal(result.action,'payment_request');
 assert.equal(result.amount,45);
});

test('negative balance below collection threshold',()=>{
 const result=run(-29.99);
 assert.equal(result.action,'no_action');
 assert.equal(result.amount,0);
 assert.equal(result.weeklyFee,0);
});

test('zero balance creates no payment',()=>{
 const result=run(0);
 assert.equal(result.action,'no_action');
 assert.equal(result.amount,0);
});

test('inactive driver weekly fee can be waived',()=>{
 const result=run(100,{
  workedThisWeek:false,
  chargeWeeklyFeeWhenInactive:false
 });
 assert.equal(result.weeklyFee,0);
 assert.equal(result.amount,100);
 assert.equal(result.weeklyFeeWaivedInactive,true);
});

test('plan allocation exceeding balance fails',()=>{
 assert.throws(
  ()=>run(100,{planAllocation:96})
 );
});

test('negative balances cannot have plan allocations',()=>{
 assert.throws(
  ()=>run(-40,{planAllocation:5})
 );
});

test('invalid monetary inputs fail closed',()=>{
 assert.throws(()=>run(Number.NaN));
 assert.throws(()=>run(100,{weeklyAppFee:-5}));
 assert.throws(()=>run(100,{planAllocation:1.001}));
});

// STEP197_SETTLEMENT_EDGE_CASES

test('weekly fee exactly consumes positive balance',()=>{
 const result=run(5,{
  minimumPayoutThreshold:0
 });

 assert.equal(result.weeklyFee,5);
 assert.equal(result.adjustedBalance,0);
 assert.equal(result.payoutAvailable,0);

 // Current Monday creation logic uses this action even without a plan.
 assert.equal(result.action,'plan_allocation');
 assert.equal(result.amount,0);
});

test('weekly fee exceeds eligible positive balance',()=>{
 const result=run(3,{
  minimumPayoutThreshold:0
 });

 assert.equal(result.weeklyFee,5);
 assert.equal(result.adjustedBalance,-2);
 assert.equal(result.payoutAvailable,0);
 assert.equal(result.action,'plan_allocation');
 assert.equal(result.amount,0);
});

test('positive balance immediately below threshold',()=>{
 const result=run(19.99);

 assert.equal(result.action,'no_action');
 assert.equal(result.weeklyFee,0);
});

test('negative balance exactly at threshold',()=>{
 const result=run(-30);

 assert.equal(result.action,'payment_request');
 assert.equal(result.amount,35);
});

test('negative balance immediately below threshold',()=>{
 const result=run(-29.99);

 assert.equal(result.action,'no_action');
 assert.equal(result.amount,0);
});

test('zero weekly fee leaves payout unchanged',()=>{
 const result=run(100,{weeklyAppFee:0});

 assert.equal(result.weeklyFee,0);
 assert.equal(result.amount,100);
});
