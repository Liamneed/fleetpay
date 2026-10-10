import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

function createHarness({fail=false}={}){
 const db=new DatabaseSync(':memory:');

 db.exec(`
  CREATE TABLE adjustments(
   event_key TEXT PRIMARY KEY,
   status TEXT NOT NULL
  )
 `);

 let requests=0;

 async function send(eventKey){
  const existing=db.prepare(
   'SELECT status FROM adjustments WHERE event_key=?'
  ).get(eventKey);

  if(existing?.status==='completed'){
   return {duplicate:true};
  }

  if(existing){
   throw new Error(
    'Existing adjustment requires reconciliation'
   );
  }

  db.prepare(
   'INSERT INTO adjustments VALUES(?,?)'
  ).run(eventKey,'pending');

  try{
   requests++;

   if(fail){
    throw new Error('Simulated Autocab timeout');
   }

   db.prepare(
    'UPDATE adjustments SET status=? WHERE event_key=?'
   ).run('completed',eventKey);

   return {ok:true};

  }catch(error){
   db.prepare(
    'UPDATE adjustments SET status=? WHERE event_key=?'
   ).run('uncertain',eventKey);

   throw error;
  }
 }

 return {
  db,
  send,
  requests:()=>requests
 };
}

test('completed adjustment is not sent twice',async()=>{
 const h=createHarness();

 try{
  assert.deepEqual(await h.send('payment-1'),{ok:true});

  assert.deepEqual(
   await h.send('payment-1'),
   {duplicate:true}
  );

  assert.equal(h.requests(),1);
 }finally{
  h.db.close();
 }
});

test('timeout becomes uncertain',async()=>{
 const h=createHarness({fail:true});

 try{
  await assert.rejects(
   h.send('payment-2'),
   /Simulated Autocab timeout/
  );

  assert.equal(
   h.db.prepare(
    'SELECT status FROM adjustments WHERE event_key=?'
   ).get('payment-2').status,
   'uncertain'
  );

  assert.equal(h.requests(),1);

  await assert.rejects(
   h.send('payment-2'),
   /requires reconciliation/
  );

  assert.equal(h.requests(),1);
 }finally{
  h.db.close();
 }
});

test('existing pending adjustment cannot be resent',async()=>{
 const h=createHarness();

 try{
  h.db.prepare(
   'INSERT INTO adjustments VALUES(?,?)'
  ).run('payment-3','pending');

  await assert.rejects(
   h.send('payment-3'),
   /requires reconciliation/
  );

  assert.equal(h.requests(),0);
 }finally{
  h.db.close();
 }
});
