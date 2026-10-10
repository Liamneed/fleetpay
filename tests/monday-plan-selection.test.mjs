import test from 'node:test';
import assert from 'node:assert/strict';

import {
 verifyMondayPlanSelection as verify
} from '../server/lib/monday-plan-selection.mjs';

const fixture=()=>({
 driverId:101,
 selectedPlanId:'new-plan',
 selectedInstalmentId:'first-due',
 plans:[
  {
   id:'old-plan',
   driver_id:101,
   status:'active',
   created_at:'2026-09-01T10:00:00Z'
  },
  {
   id:'new-plan',
   driver_id:101,
   status:'defaulted',
   created_at:'2026-10-01T10:00:00Z'
  }
 ],
 instalments:[
  {
   id:'first-due',
   plan_id:'new-plan',
   driver_id:101,
   instalment_number:2,
   status:'due'
  },
  {
   id:'later-due',
   plan_id:'new-plan',
   driver_id:101,
   instalment_number:3,
   status:'overdue'
  },
  {
   id:'already-paid',
   plan_id:'new-plan',
   driver_id:101,
   instalment_number:1,
   status:'paid'
  },
  {
   id:'old-due',
   plan_id:'old-plan',
   driver_id:101,
   instalment_number:1,
   status:'due'
  }
 ]
});

test('latest eligible plan and first due instalment pass',()=>{
 assert.equal(verify(fixture()).valid,true);
});

test('older eligible plan cannot be selected',()=>{
 const x=fixture();
 x.selectedPlanId='old-plan';
 x.selectedInstalmentId='old-due';
 assert.equal(verify(x).valid,false);
});

test('later due instalment cannot be selected',()=>{
 const x=fixture();
 x.selectedInstalmentId='later-due';
 assert.equal(verify(x).valid,false);
});

test('paid instalment cannot be selected',()=>{
 const x=fixture();
 x.selectedInstalmentId='already-paid';
 assert.equal(verify(x).valid,false);
});

test('paused newer plan does not supersede active plan',()=>{
 const x=fixture();
 x.plans[1].status='paused';
 x.selectedPlanId='old-plan';
 x.selectedInstalmentId='old-due';
 assert.equal(verify(x).valid,true);
});

test('ambiguous latest plan creation date fails',()=>{
 const x=fixture();
 x.plans[0].created_at=x.plans[1].created_at;
 assert.equal(verify(x).valid,false);
});

test('ambiguous first eligible instalment fails',()=>{
 const x=fixture();
 x.instalments[1].instalment_number=2;
 assert.equal(verify(x).valid,false);
});

test('cross-driver plan fails',()=>{
 const x=fixture();
 x.plans[1].driver_id=999;
 assert.equal(verify(x).valid,false);
});

test('no eligible plan permits no selection',()=>{
 const x=fixture();
 x.plans.forEach(p=>p.status='completed');
 x.selectedPlanId=null;
 x.selectedInstalmentId=null;
 assert.equal(verify(x).valid,true);
});

test('invalid selection inputs fail',()=>{
 assert.equal(verify({}).valid,false);
});

// STEP210_PLAN_SELECTION_INTEGRITY

test('selected instalment linked to unknown plan fails',()=>{
 const x=fixture();
 x.instalments[0].plan_id='nonexistent-plan';

 assert.equal(verify(x).valid,false);
});

test('duplicate instalment sequence within selected plan fails',()=>{
 const x=fixture();
 x.instalments.push({
  id:'duplicate-sequence',
  plan_id:'new-plan',
  driver_id:101,
  instalment_number:2,
  status:'scheduled'
 });

 assert.equal(verify(x).valid,false);
});

test('unknown selected plan fails',()=>{
 const x=fixture();
 x.selectedPlanId='nonexistent-plan';

 assert.equal(verify(x).valid,false);
});

test('unknown selected instalment fails',()=>{
 const x=fixture();
 x.selectedInstalmentId='nonexistent-instalment';

 assert.equal(verify(x).valid,false);
});
