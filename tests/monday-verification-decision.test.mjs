import test from 'node:test';
import assert from 'node:assert/strict';

import {
 decideMondayVerification
} from '../server/lib/monday-verification-decision.mjs';

const hash='a'.repeat(64);
const now='2026-10-10T11:00:00Z';

const source={
 runId:'test-monday-1',
 status:'pending',
 financialVerificationReady:true,
 settlementVerified:false,
 retrievedAt:'2026-10-10T10:55:00Z',
 driverCount:2,
 sourceHash:hash
};

const comparison={
 runId:'test-monday-1',
 balancesUnchanged:true,
 differenceCount:0,
 differences:[],
 comparedAt:'2026-10-10T10:58:00Z',
 snapshotDriverCount:2,
 refreshedDriverCount:2
};

const fingerprints={
 financialHash:hash,
 rulesHash:hash,
 paymentPlansHash:hash,
 financialRulesChanged:false,
 missingPaymentPlanReferences:0
};

const decide=(overrides={})=>
 decideMondayVerification({
  runId:'test-monday-1',
  source,
  comparison,
  fingerprints,
  now,
  ...overrides
 });

test('complete matching evidence qualifies',()=>{
 const result=decide();
 assert.equal(result.eligible,true);
 assert.equal(result.status,'passed');
 assert.ok(result.expiresAt);
});

test('pending source without readiness fails',()=>{
 assert.equal(decide({
  source:{...source,financialVerificationReady:false}
 }).eligible,false);
});

test('older original source can be verified by a fresh comparison',()=>{
 const result=decide({
  source:{
   ...source,
   retrievedAt:'2026-10-10T08:00:00Z'
  }
 });

 assert.equal(result.eligible,true);
});

test('future-dated original source fails',()=>{
 assert.equal(decide({
  source:{
   ...source,
   retrievedAt:'2026-10-10T11:05:00Z'
  }
 }).eligible,false);
});

test('expired fresh comparison fails',()=>{
 assert.equal(decide({
  comparison:{
   ...comparison,
   comparedAt:'2026-10-10T10:30:00Z'
  }
 }).eligible,false);
});

test('changed balances fail',()=>{
 assert.equal(decide({
  comparison:{...comparison,balancesUnchanged:false,differenceCount:1}
 }).eligible,false);
});

test('missing comparison fails',()=>{
 assert.equal(decide({comparison:null}).eligible,false);
});

test('changed rules fail',()=>{
 assert.equal(decide({
  fingerprints:{...fingerprints,financialRulesChanged:true}
 }).eligible,false);
});

test('missing plan references fail',()=>{
 assert.equal(decide({
  fingerprints:{...fingerprints,missingPaymentPlanReferences:1}
 }).eligible,false);
});

test('driver count discrepancy fails',()=>{
 assert.equal(decide({
  comparison:{...comparison,refreshedDriverCount:3}
 }).eligible,false);
});

test('future-dated comparison fails',()=>{
 assert.equal(decide({
  comparison:{...comparison,comparedAt:'2026-10-10T11:05:00Z'}
 }).eligible,false);
});

test('missing financial fingerprint fails',()=>{
 assert.equal(decide({
  fingerprints:{...fingerprints,financialHash:null}
 }).eligible,false);
});


test('source from a different settlement fails',()=>{
 const result=decide({
  source:{...source,runId:'another-settlement'}
 });

 assert.equal(result.eligible,false);
});

test('comparison from a different settlement fails',()=>{
 const result=decide({
  comparison:{...comparison,runId:'another-settlement'}
 });

 assert.equal(result.eligible,false);
});

test('missing settlement identity fails',()=>{
 const result=decide({runId:null});

 assert.equal(result.eligible,false);
});

test('comparison before source retrieval fails',()=>{
 const result=decide({
  comparison:{
   ...comparison,
   comparedAt:'2026-10-10T10:50:00Z'
  }
 });

 assert.equal(result.eligible,false);
});
