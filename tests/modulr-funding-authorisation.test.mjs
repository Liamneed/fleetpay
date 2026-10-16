import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  authoriseModulrFunding,
  ensureModulrFundingAuthorisationTable
} from '../server/lib/modulr-funding-authorisation.mjs';

const account = {
  id:'A_TEST',
  customerId:'C_TEST',
  currency:'GBP',
  status:'ACTIVE',
  availableBalance:'200.00'
};

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY,
      provider TEXT,
      status TEXT,
      funding_status TEXT,
      total_amount REAL,
      funds_cleared_at TEXT,
      provider_ref TEXT,
      released_at TEXT,
      paid_at TEXT
    );

    CREATE TABLE modulr_funding_verifications (
      run_id TEXT PRIMARY KEY,
      account_id TEXT,
      customer_id TEXT,
      required_minor INTEGER,
      available_minor INTEGER,
      verified_at TEXT
    );
  `);

  db.prepare(`
    INSERT INTO payout_runs
    (id,provider,status,funding_status,total_amount)
    VALUES ('run1','modulr','funding_pending',
            'balance_verified',125.50)
  `).run();

  db.prepare(`
    INSERT INTO modulr_funding_verifications
    VALUES (?,?,?,?,?,?)
  `).run(
    'run1','A_TEST','C_TEST',12550,20000,
    new Date().toISOString()
  );

  ensureModulrFundingAuthorisationTable(db);
  return db;
}

test('Authorisation records evidence without clearing funds',()=>{
  const db=fixture();
  try {
    const result=authoriseModulrFunding(db,{
      runId:'run1',account,administratorId:'admin'
    });

    assert.equal(result.authorised,true);
    assert.equal(result.paymentAuthorised,false);
    assert.equal(result.fundsCleared,false);

    const run=db.prepare(
      "SELECT * FROM payout_runs WHERE id='run1'"
    ).get();

    assert.equal(run.status,'funding_pending');
    assert.equal(run.funding_status,'release_approved');
    assert.equal(run.funds_cleared_at,null);

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_authorisations'
      ).get().n,1
    );
  } finally { db.close(); }
});

test('Duplicate approval is rejected without extra records',()=>{
  const db=fixture();
  try {
    const args={runId:'run1',account,administratorId:'admin'};
    authoriseModulrFunding(db,args);

    assert.throws(()=>authoriseModulrFunding(db,args));

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_authorisations'
      ).get().n,1
    );
  } finally { db.close(); }
});

test('Insufficient balance rolls back completely',()=>{
  const db=fixture();
  try {
    assert.throws(()=>authoriseModulrFunding(db,{
      runId:'run1',
      account:{...account,availableBalance:'100.00'},
      administratorId:'admin'
    }));

    assert.equal(
      db.prepare(
        "SELECT funding_status FROM payout_runs WHERE id='run1'"
      ).get().funding_status,'balance_verified'
    );

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_authorisations'
      ).get().n,0
    );
  } finally { db.close(); }
});

test('Competing payout run blocks approval',()=>{
  const db=fixture();
  try {
    db.prepare(`
      INSERT INTO payout_runs
      (id,provider,status,funding_status,total_amount)
      VALUES ('run2','modulr','funding_pending',
              'balance_verified',25)
    `).run();

    assert.throws(()=>authoriseModulrFunding(db,{
      runId:'run1',account,administratorId:'admin'
    }));

    assert.equal(
      db.prepare(
        'SELECT COUNT(*) AS n FROM modulr_funding_authorisations'
      ).get().n,0
    );
  } finally { db.close(); }
});

test('Expired verification is rejected',()=>{
  const db=fixture();
  try {
    db.prepare(`
      UPDATE modulr_funding_verifications
      SET verified_at='2020-01-01T00:00:00Z'
    `).run();

    assert.throws(()=>authoriseModulrFunding(db,{
      runId:'run1',account,administratorId:'admin'
    }));

    assert.equal(
      db.prepare(
        "SELECT funding_status FROM payout_runs WHERE id='run1'"
      ).get().funding_status,'balance_verified'
    );
  } finally { db.close(); }
});
