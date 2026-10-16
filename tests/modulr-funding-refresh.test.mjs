import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

import {
  earmarkVerifiedModulrFunding,
  refreshVerifiedModulrFunding,
  ensureModulrFundingVerificationTable
} from '../server/lib/modulr-funding-earmark.mjs';

const account={
  id:'ACCOUNT_TEST',
  customerId:'CUSTOMER_TEST',
  currency:'GBP',
  status:'ACTIVE',
  availableBalance:'500.00'
};

function fixture(){
  const db=new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE payout_runs(
      id TEXT PRIMARY KEY,
      provider TEXT,
      status TEXT,
      funding_status TEXT,
      total_amount REAL
    );
    INSERT INTO payout_runs VALUES
      ('run1','modulr','funding_pending',
       'awaiting_clearance',125.50),
      ('run2','modulr','funding_pending',
       'awaiting_clearance',100);
  `);

  ensureModulrFundingVerificationTable(db);

  earmarkVerifiedModulrFunding(db,{
    runId:'run1',
    account,
    accountId:'ACCOUNT_TEST',
    customerId:'CUSTOMER_TEST'
  });

  return db;
}

function refresh(db,overrides={}){
  return refreshVerifiedModulrFunding(db,{
    runId:'run1',
    account,
    accountId:'ACCOUNT_TEST',
    customerId:'CUSTOMER_TEST',
    ...overrides
  });
}

test('refresh updates evidence without changing funding state',()=>{
  const db=fixture();
  try {
    db.prepare(`
      UPDATE modulr_funding_verifications
      SET verified_at='2020-01-01T00:00:00Z'
      WHERE run_id='run1'
    `).run();

    const result=refresh(db);

    assert.equal(result.verified,true);
    assert.equal(result.paymentSubmitted,false);
    assert.equal(result.fundsCleared,false);

    const run=db.prepare(`
      SELECT status,funding_status
      FROM payout_runs WHERE id='run1'
    `).get();

    assert.equal(run.status,'funding_pending');
    assert.equal(run.funding_status,'balance_verified');

    const evidence=db.prepare(`
      SELECT * FROM modulr_funding_verifications
      WHERE run_id='run1'
    `).get();

    assert.ok(Date.parse(evidence.verified_at)>Date.now()-60000);
    assert.equal(evidence.required_minor,12550);

    assert.equal(
      db.prepare(`
        SELECT COUNT(*) AS n
        FROM modulr_funding_verifications
      `).get().n,1
    );

    assert.throws(
      ()=>earmarkVerifiedModulrFunding(db,{
        runId:'run2',account,
        accountId:'ACCOUNT_TEST',
        customerId:'CUSTOMER_TEST'
      }),
      /outstanding funding commitment/
    );
  } finally {db.close();}
});

test('insufficient refreshed balance preserves old evidence',()=>{
  const db=fixture();
  try {
    const before=db.prepare(`
      SELECT * FROM modulr_funding_verifications
      WHERE run_id='run1'
    `).get();

    assert.throws(
      ()=>refresh(db,{
        account:{...account,availableBalance:'125.49'}
      }),
      /insufficient_available_balance/
    );

    const after=db.prepare(`
      SELECT * FROM modulr_funding_verifications
      WHERE run_id='run1'
    `).get();

    assert.deepEqual(after,before);
  } finally {db.close();}
});

test('incorrect provider account cannot refresh',()=>{
  const db=fixture();
  try {
    assert.throws(
      ()=>refresh(db,{account:{...account,id:'WRONG'}}),
      /account_mismatch/
    );
  } finally {db.close();}
});

test('approved run cannot be refreshed',()=>{
  const db=fixture();
  try {
    db.prepare(`
      UPDATE payout_runs SET funding_status='release_approved'
      WHERE id='run1'
    `).run();

    assert.throws(
      ()=>refresh(db),
      /not eligible/
    );
  } finally {db.close();}
});

test('competing commitment prevents refresh',()=>{
  const db=fixture();
  try {
    db.prepare(`
      UPDATE payout_runs SET funding_status='balance_verified'
      WHERE id='run2'
    `).run();

    assert.throws(
      ()=>refresh(db),
      /Another Modulr funding commitment/
    );
  } finally {db.close();}
});
