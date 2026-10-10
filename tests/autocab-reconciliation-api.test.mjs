import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {
 mkdtempSync,
 rmSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:net';

test('Autocab reconciliation API security and financial isolation',async()=>{
 const tempDir=mkdtempSync(join(tmpdir(),'faivopay-reconciliation-'));
 const dbPath=join(tempDir,'test.sqlite');
 const secret=randomBytes(32).toString('hex');

 const port=await new Promise((resolve,reject)=>{
  const server=createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   const value=server.address().port;
   server.close(()=>resolve(value));
  });
 });

 const base=`http://127.0.0.1:${port}`;

 const env={
  PATH:process.env.PATH,
  HOME:tempDir,
  NODE_ENV:'test',
  PORT:String(port),
  DATA_DIR:tempDir,
  DB_PATH:dbPath,
  DOTENV_CONFIG_PATH:join(tempDir,'nonexistent.env'),
  PORTAL_TOKEN_SECRET:secret,
  BACKGROUND_JOBS_DISABLED:'true',
  WEEKLY_INVOICE_SCHEDULER_ENABLED:'false',
  AUTOCAB_ADJUSTMENTS_ENABLED:'false',
  LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
  AUTOCAB_API_KEY:'',
  STRIPE_SECRET_KEY:'',
  WISE_API_TOKEN:'',
  TWILIO_ACCOUNT_SID:'',
  TWILIO_AUTH_TOKEN:'',
  ADMIN_EMAIL:'reconciliation-test@example.invalid',
  ADMIN_PASSWORD:randomBytes(24).toString('hex')
 };

 const child=spawn(process.execPath,[
  '--require',
  join(process.cwd(),'tests/block-external-network.cjs'),
  join(process.cwd(),'server/index.js')
 ],{
  cwd:tempDir,
  env,
  stdio:['ignore','pipe','pipe']
 });

 let stderr='';
 child.stderr.on('data',chunk=>{
  stderr+=chunk.toString();
 });

 let db;

 try{
  let ready=false;

  for(let i=0;i<100;i++){
   if(child.exitCode!==null){
    throw new Error('Server exited: '+stderr);
   }

   try{
    const response=await fetch(base+'/api/health');
    if(response.ok){
     ready=true;
     break;
    }
   }catch{}

   await new Promise(r=>setTimeout(r,100));
  }

  assert.ok(ready,'Test server failed to start: '+stderr);

  db=new DatabaseSync(dbPath);

  const now=new Date().toISOString();

  const insert=db.prepare(`
   INSERT INTO autocab_adjustments(
    id,event_key,driver_id,callsign,amount,is_credit,
    description,adjustment_reason,status,created_at
   ) VALUES(?,?,?,?,?,?,?,?,?,?)
  `);

  insert.run(
   'recon-uncertain',
   'test:recon:uncertain',
   93010,'T310',50,0,
   'Isolated uncertain debit','Test',
   'uncertain',now
  );

  insert.run(
   'recon-completed',
   'test:recon:completed',
   93011,'T311',25,1,
   'Isolated completed credit','Test',
   'completed',now
  );

  // These tokens use only this test process's randomly generated secret.
  // They exercise the real Express authentication and role middleware.
  function token(role){
   const payload={
    role:'admin',
    mfa:true,
    staffId:'test-'+role,
    staffRole:role,
    email:role+'@example.invalid',
    exp:Date.now()+60000
   };

   const body=Buffer.from(
    JSON.stringify(payload)
   ).toString('base64url');

   const signature=createHmac('sha256',secret)
    .update(body)
    .digest('base64url');

   return body+'.'+signature;
  }

  async function request(path,{
   role,
   method='GET',
   body
  }={}){
   const headers={};

   if(role){
    headers.Authorization='Bearer '+token(role);
   }

   if(body!==undefined){
    headers['Content-Type']='application/json';
   }

   const response=await fetch(base+path,{
    method,
    headers,
    ...(body===undefined?{}:{
     body:JSON.stringify(body)
    })
   });

   return {
    status:response.status,
    body:await response.json()
   };
  }

  const list='/api/admin/autocab/reconciliation';
  const reviews=list+'/recon-uncertain/reviews';

  assert.equal((await request(list)).status,401);
  assert.equal((await request(reviews,{
   method:'POST',
   body:{investigationStatus:'reviewed',note:'No authentication'}
  })).status,401);

  for(const role of ['finance','office','readonly']){
   assert.equal((await request(list,{role})).status,403);

   assert.equal((await request(reviews,{
    role,
    method:'POST',
    body:{
     investigationStatus:'reviewed',
     note:'Unauthorised investigation attempt'
    }
   })).status,403);
  }

  console.log('PASS — Authentication and staff role restrictions.');

  const initial=await request(list,{role:'administrator'});

  assert.equal(initial.status,200);
  assert.equal(initial.body.adjustments.length,1);
  assert.equal(initial.body.adjustments[0].id,'recon-uncertain');
  assert.equal(initial.body.adjustments[0].investigationStatus,'open');
  assert.equal(initial.body.adjustments[0].transactionVerified,false);
  assert.equal(initial.body.adjustments[0].safeToRetry,false);

  const invalid=await request(reviews,{
   role:'administrator',
   method:'POST',
   body:{investigationStatus:'completed',note:'Invalid status attempt'}
  });

  assert.equal(invalid.status,400);

  const shortNote=await request(reviews,{
   role:'administrator',
   method:'POST',
   body:{investigationStatus:'reviewed',note:'short'}
  });

  assert.equal(shortNote.status,400);

  const missing=await request(list+'/nonexistent/reviews',{
   role:'administrator',
   method:'POST',
   body:{
    investigationStatus:'investigating',
    note:'Checking a nonexistent adjustment'
   }
  });

  assert.equal(missing.status,404);

  const completed=await request(list+'/recon-completed/reviews',{
   role:'administrator',
   method:'POST',
   body:{
    investigationStatus:'reviewed',
    note:'Attempt to investigate completed adjustment'
   }
  });

  assert.equal(completed.status,409);

  console.log('PASS — Input and financial-status validation.');

  for(const status of ['investigating','reviewed']){
   const response=await request(reviews,{
    role:'administrator',
    method:'POST',
    body:{
     investigationStatus:status,
     note:'Manual investigation recorded without transaction verification.'
    }
   });

   assert.equal(response.status,201,JSON.stringify(response.body));
   assert.equal(response.body.financialStatus,'uncertain');
   assert.equal(response.body.transactionVerified,false);
   assert.equal(response.body.safeToRetry,false);
  }

  const recorded=db.prepare(`
   SELECT investigation_status,note
   FROM autocab_adjustment_reviews
   WHERE adjustment_id=?
   ORDER BY rowid
  `).all('recon-uncertain');

  assert.deepEqual(
   recorded.map(x=>x.investigation_status),
   ['investigating','reviewed']
  );

  const latest=await request(list,{role:'administrator'});

  assert.equal(latest.status,200);
  assert.equal(latest.body.adjustments[0].investigationStatus,'reviewed');
  assert.equal(latest.body.adjustments[0].financialStatus,'uncertain');
  assert.equal(latest.body.adjustments[0].transactionVerified,false);
  assert.equal(latest.body.adjustments[0].safeToRetry,false);

  // STEP146_REVIEW_HISTORY_ASSERTIONS
  const history=latest.body.adjustments[0].reviewHistory;

  assert.ok(Array.isArray(history));
  assert.equal(history.length,2);

  assert.deepEqual(
   history.map(x=>x.investigationStatus).sort(),
   ['investigating','reviewed']
  );

  for(const entry of history){
   assert.ok(entry.id);
   assert.match(entry.note,/Manual investigation recorded/);
   assert.equal(entry.reviewedBy,'administrator@example.invalid');
   assert.ok(Number.isFinite(Date.parse(entry.reviewedAt)));
  }

  assert.equal(
   new Set(history.map(x=>x.id)).size,
   2
  );

  console.log('PASS — Both investigation notes returned with administrator identity and timestamps.');

  const adjustments=db.prepare(`
   SELECT id,status,amount,is_credit,event_key
   FROM autocab_adjustments
   ORDER BY id
  `).all();

  assert.deepEqual(
   adjustments.map(x=>x.status),
   ['completed','uncertain']
  );

  assert.equal(adjustments[1].amount,50);
  assert.equal(adjustments[1].event_key,'test:recon:uncertain');

  const auditCount=db.prepare(`
   SELECT COUNT(*) AS count
   FROM audit_logs
   WHERE action='autocab_adjustment_investigation_recorded'
     AND entity_id='recon-uncertain'
  `).get().count;

  assert.equal(auditCount,2);

  console.log('PASS — Append-only investigation history.');
  console.log('PASS — Both successful reviews have audit entries.');
  console.log('PASS — Financial adjustments remain unchanged.');
  console.log('PASS — Reviewed does not mean transaction verified.');
  console.log('PASS — All testing used temporary SQLite and local Express.');

 }finally{
  if(db)db.close();

  child.kill('SIGTERM');

  await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),
   new Promise(resolve=>setTimeout(resolve,3000))
  ]);

  if(child.exitCode===null){
   child.kill('SIGKILL');
  }

  rmSync(tempDir,{recursive:true,force:true});
 }
});
