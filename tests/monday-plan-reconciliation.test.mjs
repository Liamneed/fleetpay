import test from 'node:test';
import assert from 'node:assert/strict';

import {
 reconcileMondayPlanAllocations as reconcile
} from '../server/lib/monday-plan-reconciliation.mjs';

const fixture=()=>({
 runId:'monday-1',
 items:[{
  driverId:101,
  previousBalance:100,
  adjustedBalance:95,
  planAllocation:30,
  payoutId:'payout-101',
  planId:'plan-101',
  planInstalmentId:'inst-101',
  planInstalmentScheduledAmount:40,
  planInstalmentPaidAmount:10,
  planInstalmentRemaining:30,
  planRemainingAmount:60
 }],
 allocations:[{
  id:'allocation-101',
  run_id:'monday-1',
  payout_id:'payout-101',
  driver_id:101,
  plan_id:'plan-101',
  instalment_id:'inst-101',
  payment_request_id:null,
  scheduled_amount:40,
  allocated_amount:30,
  status:'pending'
 }],
 plans:[{
  id:'plan-101',
  driver_id:101,
  status:'active',
  remaining_amount:60
 }],
 instalments:[{
  id:'inst-101',
  plan_id:'plan-101',
  driver_id:101,
  amount:40,
  paid_amount:10,
  status:'due',
  payment_request_id:null
 }]
});

test('valid payment-plan deduction reconciles',()=>{
 assert.equal(reconcile(fixture()).valid,true);
});

test('defaulted plan remains eligible under existing rules',()=>{
 const x=fixture();
 x.plans[0].status='defaulted';
 assert.equal(reconcile(x).valid,true);
});

test('overdue instalment is eligible',()=>{
 const x=fixture();
 x.instalments[0].status='overdue';
 assert.equal(reconcile(x).valid,true);
});

test('overstated deduction fails',()=>{
 const x=fixture();
 x.items[0].planAllocation=40;
 assert.equal(reconcile(x).valid,false);
});

test('understated deduction fails',()=>{
 const x=fixture();
 x.items[0].planAllocation=20;
 assert.equal(reconcile(x).valid,false);
});

test('missing allocation fails',()=>{
 const x=fixture();
 x.allocations=[];
 assert.equal(reconcile(x).valid,false);
});

test('duplicate allocation fails',()=>{
 const x=fixture();
 x.allocations.push({...x.allocations[0],id:'another'});
 assert.equal(reconcile(x).valid,false);
});

test('wrong driver fails',()=>{
 const x=fixture();
 x.plans[0].driver_id=999;
 assert.equal(reconcile(x).valid,false);
});

test('wrong settlement fails',()=>{
 const x=fixture();
 x.allocations[0].run_id='another-monday';
 assert.equal(reconcile(x).valid,false);
});

test('inactive plan fails',()=>{
 const x=fixture();
 x.plans[0].status='paused';
 assert.equal(reconcile(x).valid,false);
});

test('scheduled instalment fails',()=>{
 const x=fixture();
 x.instalments[0].status='scheduled';
 assert.equal(reconcile(x).valid,false);
});

test('missing plan reference fails',()=>{
 const x=fixture();
 x.plans=[];
 assert.equal(reconcile(x).valid,false);
});

test('incorrect linked payout fails',()=>{
 const x=fixture();
 x.allocations[0].payout_id='different-payout';
 assert.equal(reconcile(x).valid,false);
});

test('incorrect instalment amount fails',()=>{
 const x=fixture();
 x.instalments[0].amount=50;
 assert.equal(reconcile(x).valid,false);
});

test('unexpected allocation without deduction fails',()=>{
 const x=fixture();
 x.items[0].planAllocation=0;
 assert.equal(reconcile(x).valid,false);
});

test('no plan and no deduction is valid',()=>{
 const x=fixture();
 x.items[0].planAllocation=0;
 x.allocations=[];
 x.plans=[];
 x.instalments=[];
 assert.equal(reconcile(x).valid,true);
});


// STEP208_THREE_DEDUCTION_LIMITS

test('available balance limits payment-plan deduction',()=>{
 const x=fixture();

 x.items[0].adjustedBalance=20;
 x.items[0].planAllocation=20;
 x.allocations[0].allocated_amount=20;

 assert.equal(reconcile(x).valid,true);
});

test('unpaid instalment limits payment-plan deduction',()=>{
 const x=fixture();

 x.instalments[0].paid_amount=35;

 x.items[0].planInstalmentPaidAmount=35;
 x.items[0].planInstalmentRemaining=5;
 x.items[0].planAllocation=5;

 x.allocations[0].allocated_amount=5;

 assert.equal(reconcile(x).valid,true);
});

test('remaining plan balance limits deduction',()=>{
 const x=fixture();

 x.plans[0].remaining_amount=15;

 x.items[0].planRemainingAmount=15;
 x.items[0].planAllocation=15;

 x.allocations[0].allocated_amount=15;

 assert.equal(reconcile(x).valid,true);
});

test('deduction above remaining plan balance fails',()=>{
 const x=fixture();

 x.plans[0].remaining_amount=15;
 x.items[0].planRemainingAmount=15;

 assert.equal(reconcile(x).valid,false);
});

test('already-paid amount exceeding instalment fails',()=>{
 const x=fixture();

 x.instalments[0].paid_amount=50;

 assert.equal(reconcile(x).valid,false);
});
