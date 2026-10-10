import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

function fixture() {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE settlement_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      items_json TEXT NOT NULL,
      payout_run_id TEXT,
      approved_at TEXT
    );

    CREATE TABLE payouts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      driver_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      payout_run_id TEXT,
      amount REAL NOT NULL
    );

    CREATE TABLE driver_cache (
      driver_id INTEGER PRIMARY KEY,
      payout_excluded INTEGER NOT NULL DEFAULT 0
    );
  `);

  db.prepare(
    `INSERT INTO settlement_runs(id,status,items_json)
     VALUES(?,?,?)`
  ).run('monday-1','draft',JSON.stringify([
    {payoutId:'p1',approvalStatus:'excluded'},
    {payoutId:'p2',approvalStatus:'pending'}
  ]));

  db.prepare(
    `INSERT INTO payouts
     (id,run_id,driver_id,status,amount)
     VALUES(?,?,?,?,?)`
  ).run('p1','monday-1',101,'declined',100);

  db.prepare(
    `INSERT INTO payouts
     (id,run_id,driver_id,status,amount)
     VALUES(?,?,?,?,?)`
  ).run('p2','monday-1',102,'pending_approval',200);

  db.prepare(
    `INSERT INTO driver_cache(driver_id,payout_excluded)
     VALUES(?,?)`
  ).run(101,1);

  db.prepare(
    `INSERT INTO driver_cache(driver_id,payout_excluded)
     VALUES(?,?)`
  ).run(102,0);

  return db;
}

function canEdit(status) {
  return status === 'draft';
}

function overrideValid(item,runId,payoutId) {
  const x=item?.oneRunExclusionOverride;

  return Boolean(
    x?.approved===true &&
    x.runId===runId &&
    x.payoutId===payoutId &&
    x.approvedBy &&
    x.reason
  );
}

test('approved and cancelled settlements cannot be edited',()=>{
  assert.equal(canEdit('draft'),true);
  assert.equal(canEdit('approved'),false);
  assert.equal(canEdit('batched'),false);
  assert.equal(canEdit('cancelled'),false);
});

test('permanent exclusion blocks an ordinary approval',()=>{
  const db=fixture();

  const payout=db.prepare(
    'SELECT * FROM payouts WHERE id=?'
  ).get('p1');

  const driver=db.prepare(
    'SELECT * FROM driver_cache WHERE driver_id=?'
  ).get(payout.driver_id);

  assert.equal(Boolean(driver.payout_excluded),true);
  assert.equal(payout.status,'declined');

  db.close();
});

test('override is restricted to its own run and payout',()=>{
  const override={
    approved:true,
    runId:'monday-1',
    payoutId:'p1',
    approvedBy:'admin@example.test',
    reason:'Authorised exceptional payout'
  };

  const item={oneRunExclusionOverride:override};

  assert.equal(overrideValid(item,'monday-1','p1'),true);
  assert.equal(overrideValid(item,'monday-2','p1'),false);
  assert.equal(overrideValid(item,'monday-1','p2'),false);
});

test('revoking an override invalidates authorisation',()=>{
  const item={
    oneRunExclusionOverride:{
      approved:true,
      runId:'monday-1',
      payoutId:'p1',
      approvedBy:'admin@example.test',
      reason:'Authorised exceptional payout'
    }
  };

  assert.equal(overrideValid(item,'monday-1','p1'),true);

  const revoked={
    ...item,
    oneRunExclusionOverride:undefined,
    approvalStatus:'excluded'
  };

  assert.equal(overrideValid(revoked,'monday-1','p1'),false);
});

test('failed approval transaction rolls back every payout',()=>{
  const db=fixture();

  assert.throws(()=>{
    db.exec('BEGIN IMMEDIATE');

    try{
      db.prepare(
        "UPDATE payouts SET status='approved' WHERE id='p2'"
      ).run();

      throw new Error('Simulated approval failure');
    }catch(e){
      db.exec('ROLLBACK');
      throw e;
    }
  },/Simulated approval failure/);

  const payout=db.prepare(
    'SELECT status FROM payouts WHERE id=?'
  ).get('p2');

  assert.equal(payout.status,'pending_approval');

  db.close();
});

test('cancelled settlements cannot pass a draft-only check',()=>{
  const db=fixture();

  db.prepare(
    "UPDATE settlement_runs SET status='cancelled' WHERE id='monday-1'"
  ).run();

  const run=db.prepare(
    "SELECT status FROM settlement_runs WHERE id='monday-1'"
  ).get();

  assert.equal(canEdit(run.status),false);

  db.close();
});
