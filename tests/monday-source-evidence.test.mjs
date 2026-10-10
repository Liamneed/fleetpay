import test from 'node:test';
import assert from 'node:assert/strict';

import {
 prepareMondaySourceEvidence
} from '../server/lib/monday-source-evidence.mjs';

const drivers=[
 {driverId:101,previousBalance:25.50},
 {driverId:102,previousBalance:0}
];

const verification={
 valid:true,
 complete:true,
 financialVerificationReady:true,
 accountCount:2,
 pageCount:1,
 totalSummariesCount:2
};

const prepare=(overrides={})=>
 prepareMondaySourceEvidence({
  runId:'test-monday-1',
  drivers,
  verification,
  retrievedAt:'2026-10-10T10:00:00Z',
  ...overrides
 });

test('creates pending evidence for verified source',()=>{
 const result=prepare();

 assert.equal(result.status,'pending');
 assert.equal(result.financialVerificationReady,true);
 assert.equal(result.settlementVerified,false);
 assert.equal(result.driverCount,2);
 assert.match(result.sourceHash,/^[a-f0-9]{64}$/);
});

test('source fingerprint is order independent',()=>{
 const a=prepare();
 const b=prepare({drivers:[...drivers].reverse()});

 assert.equal(a.sourceHash,b.sourceHash);
});

test('changed balance changes fingerprint',()=>{
 const original=prepare();

 const changed=prepare({
  drivers:[
   {driverId:101,previousBalance:26},
   drivers[1]
  ]
 });

 assert.notEqual(original.sourceHash,changed.sourceHash);
});

test('unverified source cannot produce evidence',()=>{
 assert.throws(
  ()=>prepare({
   verification:{
    ...verification,
    financialVerificationReady:false
   }
  }),
  /not verified/
 );
});

test('missing balance rejected',()=>{
 assert.throws(
  ()=>prepare({
   drivers:[{driverId:101}]
  }),
  /Invalid Previous Balance/
 );
});

test('duplicate driver rejected',()=>{
 assert.throws(
  ()=>prepare({
   drivers:[drivers[0],drivers[0]]
  }),
  /duplicate settlement driver/
 );
});

test('invalid retrieval timestamp rejected',()=>{
 assert.throws(
  ()=>prepare({retrievedAt:'invalid'}),
  /retrieval time/
 );
});
