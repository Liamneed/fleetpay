import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes,createHmac} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

async function freePort(){
 return new Promise((resolve,reject)=>{
  const s=createServer();
  s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{
   const port=s.address().port;
   s.close(()=>resolve(port));
  });
 });
}

function token(secret){
 const body=Buffer.from(JSON.stringify({
  role:'admin',
  mfa:true,
  staffRole:'administrator',
  staffId:'test-admin',
  email:'test-admin@example.invalid',
  exp:Date.now()+60000
 })).toString('base64url');

 const sig=createHmac('sha256',secret)
  .update(body)
  .digest('base64url');

 return `${body}.${sig}`;
}

async function scenario(mode){
 const dir=mkdtempSync(join(tmpdir(),'faivopay-page-sync-'));
 const dbPath=join(dir,'test.sqlite');
 const port=await freePort();
 const secret=randomBytes(32).toString('hex');

 const env={
  PATH:process.env.PATH,
  HOME:dir,
  NODE_ENV:'test',
  PORT:String(port),
  DATA_DIR:dir,
  DB_PATH:dbPath,
  PORTAL_TOKEN_SECRET:secret,
  DOTENV_CONFIG_PATH:join(dir,'nonexistent.env'),
  BACKGROUND_JOBS_DISABLED:'true',
  WEEKLY_INVOICE_SCHEDULER_ENABLED:'false',
  AUTOCAB_ADJUSTMENTS_ENABLED:'false',
  LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
  FAIVOPAY_AUTOCAB_MOCK_MODE:mode,
  AUTOCAB_API_KEY:'isolated-test-key',
  AUTOCAB_COMPANY_IDS:'1',
  STRIPE_SECRET_KEY:'',
  STRIPE_WEBHOOK_SECRET:'',
  WISE_API_TOKEN:'',
  TWILIO_ACCOUNT_SID:'',
  TWILIO_AUTH_TOKEN:'',
  ADMIN_EMAIL:'test-admin@example.invalid',
  ADMIN_PASSWORD:randomBytes(24).toString('hex')
 };

 const child=spawn(process.execPath,[
  '--require',
  join(process.cwd(),'tests/block-external-network.cjs'),
  '--require',
  join(process.cwd(),'tests/autocab-sync-mock.cjs'),
  join(process.cwd(),'server/index.js')
 ],{
  cwd:dir,
  env,
  stdio:['ignore','pipe','pipe']
 });

 let stderr='';
 child.stderr.on('data',chunk=>{
  stderr+=chunk.toString();
 });

 let db;

 try{
  const base=`http://127.0.0.1:${port}`;
  let ready=false;

  for(let i=0;i<100;i++){
   if(child.exitCode!==null){
    throw new Error(stderr);
   }

   try{
    const r=await fetch(base+'/api/health');
    if(r.ok){
     ready=true;
     break;
    }
   }catch{}

   await new Promise(resolve=>setTimeout(resolve,100));
  }

  assert.ok(ready,'Server failed to start: '+stderr);

  db=new DatabaseSync(dbPath);

  const baseline=77.77;

  db.prepare(`
   INSERT INTO driver_cache(
    driver_id,callsign,previous_balance,
    current_balance,synced_at
   ) VALUES(?,?,?,?,?)
  `).run(
   10001,'10001',baseline,baseline,
   '2026-10-09T09:00:00Z'
  );

  const response=await fetch(base+'/api/admin/sync',{
   method:'POST',
   headers:{
    Authorization:`Bearer ${token(secret)}`,
    'Content-Type':'application/json'
   },
   body:'{}'
  });

  const result=await response.json();

  const cached=db.prepare(`
   SELECT
    previous_balance AS previousBalance,
    current_balance AS currentBalance
   FROM driver_cache
   WHERE driver_id=10001
  `).get();

  const count=db.prepare(
   'SELECT COUNT(*) AS count FROM driver_cache'
  ).get().count;

  if(mode==='valid'){
   assert.equal(response.status,200,JSON.stringify(result));
   assert.equal(count,1001);
   assert.equal(cached.previousBalance,10);
   assert.equal(cached.currentBalance,10);
  }else{
   assert.notEqual(
    response.status,
    200,
    'Invalid pagination unexpectedly succeeded.'
   );

   assert.equal(count,1);
   assert.equal(cached.previousBalance,baseline);
   assert.equal(cached.currentBalance,baseline);
  }

  return {
   mode,
   httpStatus:response.status,
   cachedDrivers:count,
   cacheProtected:mode==='valid'
    ?cached.previousBalance===10
    :cached.previousBalance===baseline
  };

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

  rmSync(dir,{recursive:true,force:true});
 }
}

for(const mode of ['valid','duplicate','missing']){
 test(`Real Autocab sync pagination: ${mode}`,async()=>{
  const result=await scenario(mode);

  assert.equal(result.cacheProtected,true);

  console.log(
   `PASS — ${result.mode}: `+
   `HTTP ${result.httpStatus}, `+
   `cached drivers ${result.cachedDrivers}.`
  );
 });
}
