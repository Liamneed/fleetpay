import test from 'node:test';
import assert from 'node:assert/strict';
import { assessModulrFundingRelease as assess }
  from '../server/lib/modulr-funding-release-decision.mjs';

const fixture = () => ({
  run: {
    id:'run1',
    provider:'modulr',
    status:'funding_pending',
    funding_status:'balance_verified',
    total_amount:125.50
  },
  verification: {
    run_id:'run1',
    required_minor:12550,
    verified_at:'2026-10-16T09:00:00Z',
    account_id:'A_TEST',
    customer_id:'C_TEST'
  },
  account: {
    id:'A_TEST',
    customerId:'C_TEST',
    currency:'GBP',
    status:'ACTIVE',
    availableBalance:'200.00'
  }
});

test('Eligible review never authorises payment',()=>{
  const result=assess(fixture());
  assert.equal(result.eligible,true);
  assert.equal(result.paymentAuthorised,false);
  assert.equal(result.fundsCleared,false);
});

test('Insufficient funds block release review',()=>{
  const x=fixture();
  x.account.availableBalance='100.00';
  assert.equal(assess(x).eligible,false);
});

test('Competing commitment blocks release review',()=>{
  const x=fixture();
  x.otherCommitments=[{id:'another-run'}];
  assert.equal(assess(x).eligible,false);
});

test('Incorrect funding reference blocks review',()=>{
  const x=fixture();
  x.verification.run_id='wrong';
  assert.equal(assess(x).eligible,false);
});

test('Incorrect account blocks review',()=>{
  const x=fixture();
  x.account.id='wrong';
  assert.equal(assess(x).eligible,false);
});

test('Already cleared run blocks review',()=>{
  const x=fixture();
  x.run.funding_status='cleared';
  assert.equal(assess(x).eligible,false);
});
