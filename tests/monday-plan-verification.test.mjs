import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

import {
 verifyMondayPlansFromDatabase as verify
} from '../server/lib/monday-plan-verification.mjs';

function fixture(){
 const db=new DatabaseSync(':memory:');

 db.exec(`
  CREATE TABLE driver_payment_plans(
   id TEXT PRIMARY KEY,
   driver_id INTEGER,
   created_at TEXT,
   status TEXT,
   remaining_amount REAL
  );

  CREATE TABLE driver_payment_plan_instalments(
   id TEXT PRIMARY KEY,
   plan_id TEXT,
   driver_id INTEGER,
   instalment_number INTEGER,
   amount REAL,
   paid_amount REAL,
   status TEXT,
   payment_request_id TEXT
  );

  CREATE TABLE payment_plan_settlement_allocations(
   id TEXT PRIMARY KEY,
   run_id TEXT,
   payout_id TEXT,
   driver_id INTEGER,
   plan_id TEXT,
   instalment_id TEXT,
   payment_request_id TEXT,
   scheduled_amount REAL,
   allocated_amount REAL,
   status TEXT
  );

  INSERT INTO driver_payment_plans VALUES
   ('plan-101',101,'2026-10-01T10:00:00Z','active',60);

  INSERT INTO driver_payment_plan_instalments VALUES
   ('inst-101','plan-101',101,1,40,10,'due',NULL);

  INSERT INTO payment_plan_settlement_allocations VALUES
   ('alloc-101','monday-1','payout-101',101,
    'plan-101','inst-101',NULL,40,30,'pending');
 `);

 const item={
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
 };

 return {db,runId:'monday-1',items:[item]};
}

function run(change){
 const x=fixture();
 try{
  change?.(x);
  return verify(x);
 }finally{
  x.db.close();
 }
}

test('valid SQLite plan deduction passes',()=>{
 assert.equal(run().valid,true);
});

test('missing deduction fails when amount is collectible',()=>{
 assert.equal(run(x=>{
  x.items[0].planAllocation=0;
  x.db.exec(
   'DELETE FROM payment_plan_settlement_allocations'
  );
 }).valid,false);
});

test('wrong selected plan fails',()=>{
 assert.equal(run(x=>{
  x.items[0].planId='another-plan';
 }).valid,false);
});

test('overstated deduction fails',()=>{
 assert.equal(run(x=>{
  x.items[0].planAllocation=35;
 }).valid,false);
});

test('wrong driver allocation fails',()=>{
 assert.equal(run(x=>{
  x.db.exec(
   'UPDATE payment_plan_settlement_allocations SET driver_id=999'
  );
 }).valid,false);
});

test('fee-consuming balance permits no deduction',()=>{
 assert.equal(run(x=>{
  x.items[0].previousBalance=5;
  x.items[0].adjustedBalance=0;
  x.items[0].planAllocation=0;
  x.items[0].planId=null;
  x.items[0].planInstalmentId=null;
  x.db.exec(
   'DELETE FROM payment_plan_settlement_allocations'
  );
 }).valid,true);
});

test('no payment plans and no deduction passes',()=>{
 assert.equal(run(x=>{
  x.items[0].planAllocation=0;
  x.items[0].planId=null;
  x.items[0].planInstalmentId=null;
  x.db.exec(`
   DELETE FROM payment_plan_settlement_allocations;
   DELETE FROM driver_payment_plan_instalments;
   DELETE FROM driver_payment_plans;
  `);
 }).valid,true);
});
