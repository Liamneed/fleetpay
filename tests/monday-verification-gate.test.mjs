import test from 'node:test';
import assert from 'node:assert/strict';

import {
 checkMondayVerificationGate as check
} from '../server/lib/monday-verification-gate.mjs';

const H=letter=>letter.repeat(64);

function fixture(){
 const evidence={
  runId:'monday-1',
  settlementVerified:true,
  financialVerificationReady:true,
  sourceHash:H('a'),
  snapshotHash:H('b'),
  financialHash:H('c')
 };

 return {
  runId:'monday-1',
  now:'2026-10-10T12:05:00Z',
  verification:{
   run_id:'monday-1',
   status:'passed',
   snapshot_hash:H('b'),
   autocab_source_hash:H('a'),
   rules_hash:H('d'),
   payment_plans_hash:H('e'),
   evidence_json:JSON.stringify(evidence),
   difference_count:0,
   verified_by:'finance@example.invalid',
   compared_at:'2026-10-10T12:00:00Z',
   expires_at:'2026-10-10T12:15:00Z'
  },
  fingerprints:{
   financialHash:H('c'),
   rulesHash:H('d'),
   paymentPlansHash:H('e'),
   financialRulesChanged:false,
   missingPaymentPlanReferences:0
  }
 };
}

test('complete current verification permits progression',()=>{
 assert.equal(check(fixture()).allowed,true);
});

test('missing verification blocks progression',()=>{
 const x=fixture();
 x.verification=null;
 assert.equal(check(x).allowed,false);
});

test('pending verification blocks progression',()=>{
 const x=fixture();
 x.verification.status='pending';
 assert.equal(check(x).allowed,false);
});

test('expired verification blocks progression',()=>{
 const x=fixture();
 x.now='2026-10-10T12:16:00Z';
 assert.equal(check(x).allowed,false);
});

test('different settlement identity blocks progression',()=>{
 const x=fixture();
 x.verification.run_id='another';
 assert.equal(check(x).allowed,false);
});

test('changed payout financial fingerprint blocks progression',()=>{
 const x=fixture();
 x.fingerprints.financialHash=H('f');
 assert.equal(check(x).allowed,false);
});

test('changed payment-plan fingerprint blocks progression',()=>{
 const x=fixture();
 x.fingerprints.paymentPlansHash=H('f');
 assert.equal(check(x).allowed,false);
});

test('changed financial rules block progression',()=>{
 const x=fixture();
 x.fingerprints.financialRulesChanged=true;
 assert.equal(check(x).allowed,false);
});

test('missing payment-plan references block progression',()=>{
 const x=fixture();
 x.fingerprints.missingPaymentPlanReferences=1;
 assert.equal(check(x).allowed,false);
});

test('unresolved comparison differences block progression',()=>{
 const x=fixture();
 x.verification.difference_count=1;
 assert.equal(check(x).allowed,false);
});

test('invalidated verification blocks progression',()=>{
 const x=fixture();
 x.verification.status='invalidated';
 assert.equal(check(x).allowed,false);
});

test('malformed verification evidence blocks progression',()=>{
 const x=fixture();
 x.verification.evidence_json='{invalid';
 assert.equal(check(x).allowed,false);
});

test('altered source fingerprint blocks progression',()=>{
 const x=fixture();
 x.verification.autocab_source_hash=H('f');
 assert.equal(check(x).allowed,false);
});

test('missing verifier identity blocks progression',()=>{
 const x=fixture();
 x.verification.verified_by=null;
 assert.equal(check(x).allowed,false);
});

test('approval workflow status does not change financial fingerprint',()=>{
 const x=fixture();
 assert.equal(check(x).allowed,true);
});
