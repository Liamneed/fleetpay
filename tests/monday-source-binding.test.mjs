import test from 'node:test';
import assert from 'node:assert/strict';

import {prepareMondaySourceEvidence}
 from '../server/lib/monday-source-evidence.mjs';

import {verifyMondaySourceBinding}
 from '../server/lib/monday-source-binding.mjs';

const runId='test-run-192';

const items=[
 {driverId:2,previousBalance:-15.25},
 {driverId:1,previousBalance:104.50},
 {driverId:3,previousBalance:0}
];

const source=prepareMondaySourceEvidence({
 runId,
 drivers:items,
 retrievedAt:'2026-10-10T12:00:00Z',
 verification:{
  valid:true,
  complete:true,
  financialVerificationReady:true,
  accountCount:3,
  pageCount:1,
  totalSummariesCount:3
 }
});

const verify=(overrides={})=>
 verifyMondaySourceBinding({
  runId,
  source,
  items,
  ...overrides
 });

test('original settlement balances match source',()=>{
 const result=verify();
 assert.equal(result.valid,true);
 assert.equal(result.calculatedHash,source.sourceHash);
});

test('settlement order does not affect fingerprint',()=>{
 assert.equal(
  verify({items:[...items].reverse()}).valid,
  true
 );
});

test('modified positive balance fails',()=>{
 assert.equal(verify({
  items:items.map(x=>
   x.driverId===1?{...x,previousBalance:105.50}:x
  )
 }).valid,false);
});

test('modified negative balance fails',()=>{
 assert.equal(verify({
  items:items.map(x=>
   x.driverId===2?{...x,previousBalance:-14.25}:x
  )
 }).valid,false);
});

test('missing driver fails',()=>{
 assert.equal(
  verify({items:items.slice(0,2)}).valid,
  false
 );
});

test('additional driver fails',()=>{
 assert.equal(verify({
  items:[...items,{driverId:4,previousBalance:10}]
 }).valid,false);
});

test('duplicate driver fails',()=>{
 assert.equal(verify({
  items:[...items,items[0]]
 }).valid,false);
});

test('different settlement fails',()=>{
 assert.equal(
  verify({runId:'another-run'}).valid,
  false
 );
});

test('altered source fingerprint fails',()=>{
 assert.equal(verify({
  source:{...source,sourceHash:'f'.repeat(64)}
 }).valid,false);
});

test('invalid source readiness fails',()=>{
 assert.equal(verify({
  source:{...source,financialVerificationReady:false}
 }).valid,false);
});

test('missing balance fails',()=>{
 assert.equal(verify({
  items:items.map(x=>
   x.driverId===1?{...x,previousBalance:null}:x
  )
 }).valid,false);
});

test('missing settlement items fail',()=>{
 assert.equal(verify({items:null}).valid,false);
});
