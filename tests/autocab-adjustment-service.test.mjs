import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createAutocabAdjustmentService } from '../server/lib/autocab-adjustments.mjs';

function setup(transportOverride) {
 const db=new DatabaseSync(':memory:');

 db.exec(`
  CREATE TABLE autocab_adjustments (
   id TEXT PRIMARY KEY,
   event_key TEXT NOT NULL UNIQUE,
   driver_id INTEGER,
   callsign TEXT,
   amount REAL,
   is_credit INTEGER,
   description TEXT,
   adjustment_reason TEXT,
   status TEXT,
   created_at TEXT,
   completed_at TEXT,
   response_json TEXT,
   error TEXT
  );

  CREATE TABLE driver_cache (
   driver_id INTEGER PRIMARY KEY,
   current_balance REAL,
   synced_at TEXT
  );
 `);

 let requestCount=0;
 let nextId=0;

 const transport=async(url,payload)=>{
  requestCount++;

  if(transportOverride) {
   return transportOverride(url,payload);
  }

  return {ok:true,simulated:true};
 };

 const service=createAutocabAdjustmentService({
  db,
  transport,
  makeId:()=>`test-${++nextId}`,
  baseUrl:'https://example.invalid',
  adjustmentsEnabled:true,
  liveTestWritesEnabled:false,
  logger:{error:()=>{}}
 });

 const args=(eventKey,overrides={})=>({
  driverId:93010,
  callsign:'T310',
  amount:12.50,
  isCredit:false,
  description:'Isolated adjustment',
  adjustmentReason:'Automated Test',
  eventKey,
  ...overrides
 });

 const row=eventKey=>db.prepare(
  'SELECT * FROM autocab_adjustments WHERE event_key=?'
 ).get(eventKey);

 return {
  db,
  service,
  args,
  row,
  count:()=>requestCount,
  close:()=>db.close()
 };
}

test('invalid financial inputs create no records or requests',async()=>{
 const t=setup();

 try{
  const invalid=[
   {amount:0},
   {amount:-1},
   {amount:12.345},
   {amount:'invalid'},
   {driverId:0},
   {driverId:'invalid'},
   {isCredit:'false'},
   {eventKey:''},
   {description:''}
  ];

  for(let i=0;i<invalid.length;i++){
   await assert.rejects(
    t.service.postAutocabAdjustment(
     t.args(`invalid-${i}`,invalid[i])
    )
   );
  }

  assert.equal(t.count(),0);
  assert.equal(
   t.db.prepare(
    'SELECT COUNT(*) AS n FROM autocab_adjustments'
   ).get().n,
   0
  );
 }finally{t.close()}
});

test('completed adjustment is not sent twice',async()=>{
 const t=setup();

 try{
  const first=await t.service.postAutocabAdjustmentSafelyOnce(
   t.args('success')
  );

  assert.equal(first.ok,true);
  assert.equal(first.cacheUpdated,false);

  const second=await t.service.postAutocabAdjustmentSafelyOnce(
   t.args('success')
  );

  assert.equal(second.duplicate,true);
  assert.equal(t.count(),1);
  assert.equal(t.row('success').status,'completed');
 }finally{t.close()}
});

test('event key cannot be reused for different financial details',async()=>{
 const t=setup();

 try{
  await t.service.postAutocabAdjustmentSafelyOnce(
   t.args('identity')
  );

  for(const changes of [
   {driverId:93011},
   {amount:99.99},
   {isCredit:true}
  ]){
   await assert.rejects(
    t.service.postAutocabAdjustmentSafelyOnce(
     t.args('identity',changes)
    ),
    /event-key conflict/i
   );
  }

  assert.equal(t.count(),1);
 }finally{t.close()}
});

test('transport timeout is uncertain and cannot be retried',async()=>{
 const t=setup(async()=>{
  throw new Error('Simulated timeout');
 });

 try{
  await assert.rejects(
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('timeout')
   ),
   /Simulated timeout/
  );

  assert.equal(t.row('timeout').status,'uncertain');

  await assert.rejects(
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('timeout')
   ),
   /reconcile|review/i
  );

  assert.equal(t.count(),1);
 }finally{t.close()}
});

test('pre-existing pending adjustment blocks another submission',async()=>{
 const t=setup();

 try{
  t.db.prepare(`
   INSERT INTO autocab_adjustments
   (id,event_key,driver_id,callsign,amount,is_credit,
    description,status,created_at)
   VALUES(?,?,?,?,?,?,?,?,?)
  `).run(
   'pending-1','pending',93010,'T310',
   12.50,0,'Pending test','pending',
   new Date().toISOString()
  );

  await assert.rejects(
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('pending')
   ),
   /reconcile|review/i
  );

  assert.equal(t.count(),0);
 }finally{t.close()}
});

test('concurrent requests make only one adjustment',async()=>{
 const t=setup();

 try{
  const results=await Promise.all([
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('concurrent')
   ),
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('concurrent')
   ).catch(error=>({error}))
  ]);

  assert.equal(t.count(),1);
  assert.equal(t.row('concurrent').status,'completed');

  assert.equal(
   t.db.prepare(`
    SELECT COUNT(*) AS n
    FROM autocab_adjustments
    WHERE event_key='concurrent'
   `).get().n,
   1
  );

  assert.equal(results[0].ok,true);

  assert.ok(
   results[1].duplicate===true ||
   results[1].error instanceof Error
  );
 }finally{t.close()}
});

test('cache update failure does not undo confirmed remote success',async()=>{
 const t=setup();

 try{
  t.db.prepare(`
   INSERT INTO driver_cache(driver_id,current_balance)
   VALUES(93010,100)
  `).run();

  t.db.exec(`
   CREATE TRIGGER reject_cache_update
   BEFORE UPDATE ON driver_cache
   BEGIN
    SELECT RAISE(FAIL,'Simulated cache failure');
   END;
  `);

  const result=await t.service.postAutocabAdjustmentSafelyOnce(
   t.args('cache-failure')
  );

  assert.equal(result.ok,true);
  assert.equal(result.cacheUpdated,false);
  assert.equal(t.row('cache-failure').status,'completed');
  assert.equal(t.count(),1);

  const duplicate=await t.service.postAutocabAdjustmentSafelyOnce(
   t.args('cache-failure')
  );

  assert.equal(duplicate.duplicate,true);
  assert.equal(t.count(),1);
 }finally{t.close()}
});

test('failure to persist remote confirmation blocks resubmission',async()=>{
 const t=setup();

 try{
  t.db.exec(`
   CREATE TRIGGER reject_confirmation
   BEFORE UPDATE OF status ON autocab_adjustments
   WHEN NEW.status='completed'
   BEGIN
    SELECT RAISE(FAIL,'Simulated confirmation DB failure');
   END;
  `);

  await assert.rejects(
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('confirmation-failure')
   ),
   /Simulated confirmation DB failure/
  );

  assert.equal(t.row('confirmation-failure').status,'pending');

  await assert.rejects(
   t.service.postAutocabAdjustmentSafelyOnce(
    t.args('confirmation-failure')
   ),
   /reconcile|review/i
  );

  assert.equal(t.count(),1);
 }finally{t.close()}
});
