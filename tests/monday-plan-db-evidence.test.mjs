import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

import {
 loadMondayPlanDatabaseEvidence as load
} from '../server/lib/monday-plan-db-evidence.mjs';

function fixture(){
 const db=new DatabaseSync(':memory:');

 db.exec(`
  CREATE TABLE driver_payment_plans(
   id TEXT PRIMARY KEY,
   driver_id INTEGER NOT NULL,
   created_at TEXT NOT NULL,
   status TEXT NOT NULL
  );

  CREATE TABLE driver_payment_plan_instalments(
   id TEXT PRIMARY KEY,
   plan_id TEXT NOT NULL,
   instalment_number INTEGER NOT NULL,
   status TEXT NOT NULL
  );

  CREATE TABLE payment_plan_settlement_allocations(
   id TEXT PRIMARY KEY,
   run_id TEXT NOT NULL,
   driver_id INTEGER NOT NULL,
   plan_id TEXT NOT NULL,
   instalment_id TEXT NOT NULL
  );

  INSERT INTO driver_payment_plans
  VALUES
   ('old',101,'2026-09-01T10:00:00Z','active'),
   ('new',101,'2026-10-01T10:00:00Z','defaulted'),
   ('paused',101,'2026-10-05T10:00:00Z','paused'),
   ('other-driver',202,'2026-10-06T10:00:00Z','active');

  INSERT INTO driver_payment_plan_instalments
  VALUES
   ('old-due','old',1,'due'),
   ('new-paid','new',1,'paid'),
   ('new-due','new',2,'due'),
   ('new-scheduled','new',3,'scheduled'),
   ('paused-due','paused',1,'overdue'),
   ('other-due','other-driver',1,'due');

  INSERT INTO payment_plan_settlement_allocations
  VALUES
   ('allocation-101','monday-1',101,'new','new-due'),
   ('orphan','monday-1',999,'old','old-due'),
   ('different-monday','monday-2',101,'old','old-due');
 `);

 return db;
}

test('loads all driver plans and all instalment statuses',()=>{
 const db=fixture();

 try{
  const evidence=load({
   db,
   runId:'monday-1',
   items:[{driverId:101}]
  });

  assert.equal(evidence.drivers.length,1);
  assert.equal(evidence.drivers[0].plans.length,3);
  assert.equal(evidence.drivers[0].instalments.length,5);

  assert.deepEqual(
   new Set(evidence.drivers[0].plans.map(x=>x.status)),
   new Set(['active','defaulted','paused'])
  );

  assert.deepEqual(
   new Set(evidence.drivers[0].instalments.map(x=>x.status)),
   new Set(['due','paid','scheduled','overdue'])
  );
 }finally{
  db.close();
 }
});

test('excludes plans belonging to another driver',()=>{
 const db=fixture();

 try{
  const evidence=load({
   db,
   runId:'monday-1',
   items:[{driverId:101}]
  });

  assert.equal(
   evidence.drivers[0].plans.some(
    x=>x.id==='other-driver'
   ),
   false
  );
 }finally{
  db.close();
 }
});

test('preserves orphan allocations for rejection',()=>{
 const db=fixture();

 try{
  const evidence=load({
   db,
   runId:'monday-1',
   items:[{driverId:101}]
  });

  assert.equal(evidence.allocations.length,2);
  assert.ok(
   evidence.allocations.some(x=>x.driver_id===999)
  );
 }finally{
  db.close();
 }
});

test('does not load allocations from another run',()=>{
 const db=fixture();

 try{
  const evidence=load({
   db,
   runId:'monday-1',
   items:[{driverId:101}]
  });

  assert.equal(
   evidence.allocations.some(
    x=>x.run_id==='monday-2'
   ),
   false
  );
 }finally{
  db.close();
 }
});

test('rejects duplicate settlement drivers',()=>{
 const db=fixture();

 try{
  assert.throws(()=>load({
   db,
   runId:'monday-1',
   items:[
    {driverId:101},
    {driverId:101}
   ]
  }));
 }finally{
  db.close();
 }
});

test('reads evidence without modifying database',()=>{
 const db=fixture();

 try{
  const before=db.prepare(`
   SELECT COUNT(*) AS n
   FROM payment_plan_settlement_allocations
  `).get().n;

  load({
   db,
   runId:'monday-1',
   items:[{driverId:101}]
  });

  const after=db.prepare(`
   SELECT COUNT(*) AS n
   FROM payment_plan_settlement_allocations
  `).get().n;

  assert.equal(after,before);
 }finally{
  db.close();
 }
});
