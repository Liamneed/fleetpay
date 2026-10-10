import test from 'node:test';
import assert from 'node:assert/strict';

import {
 reconcileMondaySettlement as reconcile
} from '../server/lib/monday-settlement-reconciliation.mjs';

const settings={
 weeklyAppFee:5,
 minimumPayoutThreshold:20,
 negativeThreshold:30,
 chargeWeeklyFeeWhenInactive:true
};

const item={
 driverId:101,
 previousBalance:100,
 workedThisWeek:true,
 planAllocation:0,
 action:'payout',
 amount:95,
 weeklyFee:5,
 adjustedBalance:95,
 payoutAvailable:95,
 weeklyFeeWaivedInactive:false,
 payoutId:'payout-101',
 requestId:null
};

const payout={
 run_id:'test-settlement',
 id:'payout-101',
 driver_id:101,
 gross_balance:100,
 weekly_fee:5,
 gross_amount:95,
 net_amount:95,
 amount:95,
 type:'weekly'
};

const inputs=()=>({
 runId:'test-settlement',
 settings,
 items:[{...item}],
 payouts:[{...payout}],
 paymentRequests:[]
});

test('valid payout reconciles',()=>{
 assert.equal(reconcile(inputs()).valid,true);
});

test('altered payout amount fails',()=>{
 const x=inputs();
 x.payouts[0].amount=110;
 assert.equal(reconcile(x).valid,false);
});

test('altered settlement amount fails',()=>{
 const x=inputs();
 x.items[0].amount=110;
 assert.equal(reconcile(x).valid,false);
});

test('incorrect weekly fee fails',()=>{
 const x=inputs();
 x.items[0].weeklyFee=4;
 assert.equal(reconcile(x).valid,false);
});

test('missing payout fails',()=>{
 const x=inputs();
 x.payouts=[];
 assert.equal(reconcile(x).valid,false);
});

test('duplicate payout fails',()=>{
 const x=inputs();
 x.payouts.push({...payout});
 assert.equal(reconcile(x).valid,false);
});

test('unexpected payout fails',()=>{
 const x=inputs();
 x.payouts.push({...payout,id:'unexpected'});
 assert.equal(reconcile(x).valid,false);
});

test('duplicate driver fails',()=>{
 const x=inputs();
 x.items.push({...item});
 assert.equal(reconcile(x).valid,false);
});

test('missing inputs fail',()=>{
 assert.equal(reconcile({}).valid,false);
});

test('valid negative payment request reconciles',()=>{
 const x={
  runId:'test-settlement',
  settings,
  items:[{
   driverId:202,
   previousBalance:-40,
   workedThisWeek:true,
   planAllocation:0,
   action:'payment_request',
   amount:45,
   weeklyFee:5,
   adjustedBalance:-45,
   payoutAvailable:0,
   weeklyFeeWaivedInactive:false,
   payoutId:null,
   requestId:'request-202'
  }],
  payouts:[],
  paymentRequests:[{
   run_id:'test-settlement',
   id:'request-202',
   driver_id:202,
   balance:-40,
   weekly_fee:5,
   amount:45
  }]
 };

 assert.equal(reconcile(x).valid,true);
});

test('altered negative payment request fails',()=>{
 const x={
  runId:'test-settlement',
  settings,
  items:[{
   driverId:202,
   previousBalance:-40,
   workedThisWeek:true,
   planAllocation:0,
   action:'payment_request',
   amount:45,
   weeklyFee:5,
   adjustedBalance:-45,
   payoutAvailable:0,
   weeklyFeeWaivedInactive:false,
   payoutId:null,
   requestId:'request-202'
  }],
  payouts:[],
  paymentRequests:[{
   run_id:'test-settlement',
   id:'request-202',
   driver_id:202,
   balance:-40,
   weekly_fee:5,
   amount:40
  }]
 };

 assert.equal(reconcile(x).valid,false);
});


test('payout from another settlement fails',()=>{
 const x=inputs();
 x.payouts[0].run_id='another-settlement';
 assert.equal(reconcile(x).valid,false);
});

test('missing payout settlement identity fails',()=>{
 const x=inputs();
 delete x.payouts[0].run_id;
 assert.equal(reconcile(x).valid,false);
});

test('payment request from another settlement fails',()=>{
 const x={
  runId:'test-settlement',
  settings,
  items:[{
   driverId:202,
   previousBalance:-40,
   workedThisWeek:true,
   planAllocation:0,
   action:'payment_request',
   amount:45,
   weeklyFee:5,
   adjustedBalance:-45,
   payoutAvailable:0,
   weeklyFeeWaivedInactive:false,
   payoutId:null,
   requestId:'request-202'
  }],
  payouts:[],
  paymentRequests:[{
   id:'request-202',
   run_id:'another-settlement',
   driver_id:202,
   balance:-40,
   weekly_fee:5,
   amount:45
  }]
 };
 assert.equal(reconcile(x).valid,false);
});

test('missing settlement identity fails',()=>{
 const x=inputs();
 delete x.runId;
 assert.equal(reconcile(x).valid,false);
});
