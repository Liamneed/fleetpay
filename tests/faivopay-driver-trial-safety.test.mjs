import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createServer} from 'node:net';

test('driver trial feature switches and PAY IN isolation',async()=>{
 const root=process.cwd();
 const dir=mkdtempSync(join(tmpdir(),'faivopay-driver-trial-'));
 const secret=randomBytes(32).toString('hex');
 const port=await new Promise((resolve,reject)=>{
  const s=createServer();
  s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{
   const p=s.address().port;
   s.close(()=>resolve(p));
  });
 });

 const base=`http://127.0.0.1:${port}`;
 const env={
  PATH:process.env.PATH,
  HOME:dir,
  NODE_ENV:'test',
  PORT:String(port),
  DATA_DIR:dir,
  DB_PATH:join(dir,'test.sqlite'),
  DOTENV_CONFIG_PATH:join(dir,'nonexistent.env'),
  PORTAL_TOKEN_SECRET:secret,
  BACKGROUND_JOBS_DISABLED:'true',
  WEEKLY_INVOICE_SCHEDULER_ENABLED:'false',
  AUTOCAB_ADJUSTMENTS_ENABLED:'false',
  LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
  AUTOCAB_API_KEY:'',
  STRIPE_SECRET_KEY:'',
  STRIPE_WEBHOOK_SECRET:'',
  WISE_API_TOKEN:'',
  TWILIO_ACCOUNT_SID:'',
  TWILIO_AUTH_TOKEN:'',
  ADMIN_EMAIL:'trial@example.invalid',
  ADMIN_PASSWORD:randomBytes(24).toString('hex')
 };

 const child=spawn(process.execPath,[
  '--require',
  join(root,'tests/block-external-network.cjs'),
  join(root,'server/index.js')
 ],{cwd:dir,env,stdio:['ignore','pipe','pipe']});

 let stderr='';
 child.stderr.on('data',x=>stderr+=x.toString());
 let db;

 function token(claims){
  const payload=Buffer.from(JSON.stringify({
   ...claims,exp:Date.now()+60000
  })).toString('base64url');
  return payload+'.'+createHmac('sha256',secret)
   .update(payload).digest('base64url');
 }

 const admin=token({
  role:'admin',mfa:true,
  staffId:'trial-admin',
  staffRole:'administrator',
  email:'trial@example.invalid'
 });
 const driver=token({
  role:'driver',
  driverId:991901,
  callsign:'TEST991'
 });

 async function request(path,{method='GET',auth,body}={}){
  const response=await fetch(base+path,{
   method,
   headers:{
    ...(auth?{Authorization:'Bearer '+auth}:{}),
    ...(body!==undefined?{'Content-Type':'application/json'}:{})
   },
   ...(body===undefined?{}:{body:JSON.stringify(body)})
  });
  return {status:response.status,body:await response.json()};
 }

 try{
  let ready=false;
  for(let i=0;i<100;i++){
   if(child.exitCode!==null)
    throw new Error('Server exited: '+stderr);
   try{
    if((await fetch(base+'/api/health')).ok){
     ready=true;break;
    }
   }catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'Test server failed to start: '+stderr);
  db=new DatabaseSync(env.DB_PATH);

  const initial=await request('/api/settings',{auth:admin});
  assert.equal(initial.status,200);
  assert.equal(initial.body.customerPaymentsEnabled,false);
  assert.equal(initial.body.earlyPayoutsEnabled,false);
  assert.equal(initial.body.payInEnabled,false);

  for(const [path,method,auth,body] of [
   ['/api/driver/customer-payment/preview','GET',driver],
   ['/api/driver/customer-payment/live','POST',driver,{}],
   ['/api/driver/customer-payment','POST',driver,{}],
   ['/api/admin/customer-payments','POST',admin,{}],
   ['/api/public/customer-payments/test/checkout','POST',null,{}],
   ['/api/driver/early-payout','POST',driver,{amount:100}],
   ['/api/driver/payment-requests/test/checkout','POST',driver,{}]
  ]){
   const result=await request(path,{method,auth,body});
   assert.equal(result.status,403,
    `${path}: ${JSON.stringify(result.body)}`);
   assert.match(result.body.error,/coming soon/i);
  }

  for(const path of [
   '/api/settings',
   '/api/admin/operations-settings'
  ]){
   const result=await request(path,{
    method:'PUT',auth:admin,body:{}
   });
   assert.equal(result.status,200,
    `${path}: ${JSON.stringify(result.body)}`);
   const settings=await request('/api/settings',{auth:admin});
   assert.equal(settings.body.customerPaymentsEnabled,false);
   assert.equal(settings.body.earlyPayoutsEnabled,false);
   assert.equal(settings.body.payInEnabled,false);
  }

  assert.equal(
   db.prepare('SELECT COUNT(*) AS n FROM customer_payments')
    .get().n,0
  );
  assert.equal(
   db.prepare("SELECT COUNT(*) AS n FROM payouts WHERE type='early'")
    .get().n,0
  );

  console.log('PASS — Disabled endpoints, settings and financial isolation');
 }finally{
  if(db)db.close();
  child.kill('SIGTERM');
  await Promise.race([
   new Promise(r=>child.once('exit',r)),
   new Promise(r=>setTimeout(r,3000))
  ]);
  if(child.exitCode===null)child.kill('SIGKILL');
  rmSync(dir,{recursive:true,force:true});
 }
});
