import test from 'node:test';
import assert from 'node:assert/strict';
import {
 assessAdjustmentReconciliation
} from '../server/lib/autocab-adjustment-reconciliation.mjs';

const adjustment={
 event_key:'test:adjustment:001',
 driver_id:93010,
 amount:12.50,
 is_credit:0,
 status:'uncertain',
 created_at:'2026-10-10T09:00:30Z'
};

const before={
 driverId:93010,
 currentBalance:100,
 fetchedAt:'2026-10-10T09:00:00Z'
};

const after={
 driverId:93010,
 currentBalance:87.50,
 fetchedAt:'2026-10-10T09:01:00Z'
};

test('matching balance never proves a transaction',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,before,after
 });
 assert.equal(result.classification,'balance_match_only');
 assert.equal(result.balanceMatched,true);
 assert.equal(result.transactionVerified,false);
 assert.equal(result.requiresManualReview,true);
 assert.equal(result.safeToRetry,false);
});

test('mismatched balance remains unresolved',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,before,
  after:{...after,currentBalance:90}
 });
 assert.equal(result.classification,'balance_mismatch');
 assert.equal(result.transactionVerified,false);
 assert.equal(result.safeToRetry,false);
});

test('missing evidence fails closed',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,before
 });
 assert.equal(result.classification,'insufficient_evidence');
 assert.equal(result.safeToRetry,false);
});

test('different driver cannot be reconciled',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,before,
  after:{...after,driverId:93011}
 });
 assert.equal(result.classification,'insufficient_evidence');
 assert.equal(result.transactionVerified,false);
});

test('reversed snapshot times fail closed',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,before,
  after:{...after,fetchedAt:'2026-10-10T08:00:00Z'}
 });
 assert.equal(result.classification,'insufficient_evidence');
});

test('credit direction is assessed correctly',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment:{...adjustment,is_credit:1},
  before,
  after:{...after,currentBalance:112.50}
 });
 assert.equal(result.classification,'balance_match_only');
 assert.equal(result.transactionVerified,false);
});

test('invalid balance and direction fail closed',()=>{
 for(const changes of [
  {amount:-1},
  {amount:12.345},
  {is_credit:'false'}
 ]){
  const result=assessAdjustmentReconciliation({
   adjustment:{...adjustment,...changes},
   before,after
  });

  assert.equal(result.classification,'insufficient_evidence');
  assert.equal(result.safeToRetry,false);
 }
});


// STEP133_RECONCILIATION_TIMELINE_TESTS

test('missing adjustment timestamp fails closed',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment:{...adjustment,created_at:undefined},
  before,after
 });

 assert.equal(result.classification,'insufficient_evidence');
 assert.equal(result.transactionVerified,false);
 assert.equal(result.safeToRetry,false);
});

test('snapshot before adjustment cannot be used as final evidence',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,
  before,
  after:{
   ...after,
   fetchedAt:'2026-10-10T09:00:20Z'
  }
 });

 assert.equal(result.classification,'insufficient_evidence');
 assert.equal(result.safeToRetry,false);
});

test('snapshot recorded after adjustment cannot be baseline',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment,
  before:{
   ...before,
   fetchedAt:'2026-10-10T09:00:40Z'
  },
  after
 });

 assert.equal(result.classification,'insufficient_evidence');
 assert.equal(result.safeToRetry,false);
});

test('malformed adjustment timestamp fails closed',()=>{
 const result=assessAdjustmentReconciliation({
  adjustment:{
   ...adjustment,
   created_at:'invalid-timestamp'
  },
  before,after
 });

 assert.equal(result.classification,'insufficient_evidence');
 assert.equal(result.safeToRetry,false);
});
