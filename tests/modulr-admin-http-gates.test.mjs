import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const HOST='127.0.0.1';
const urlPaths=[
 '/api/admin/payout-runs/nonexistent/evidence/nonexistent/verify-bank',
 '/api/admin/payout-runs/nonexistent/evidence/nonexistent/finalise-modulr-accounting'
];
function signed(secret,body){
 const b=Buffer.from(JSON.stringify({...body,exp:Date.now()+60000})).toString('base64url');
 return `${b}.${createHmac('sha256',secret).update(b).digest('base64url')}`;
}
async function portAvailable(){const s=net.createServer(); await new Promise((resolve,reject)=>s.once('error',reject).listen(0,HOST,resolve));const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
async function runChecks(t){
 const dir=await mkdtemp(path.join(tmpdir(),'faivopay-http-guard-'));
 const secret=randomBytes(32).toString('hex');
 const port=await portAvailable();
 const overrides={
  PORT:String(port),SERVER_BIND_HOST:HOST,DB_PATH:path.join(dir,'isolated.sqlite'),PORTAL_TOKEN_SECRET:secret,
  BACKGROUND_JOBS_DISABLED:'true',WEEKLY_INVOICE_SCHEDULER_ENABLED:'false',
  AUTOCAB_API_KEY:'',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
  MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',
  MODULR_APPLICATION_ACCOUNTING_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',
  MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED:'false',
  RESEND_API_KEY:'',SENDGRID_API_KEY:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',STRIPE_SECRET_KEY:'',
  ADMIN_EMAIL:'synthetic-admin@example.invalid',ADMIN_PASSWORD:randomBytes(24).toString('hex'),
 };
 const proc=spawn(process.execPath,['--env-file=.env','server/index.js'],{
  cwd:process.cwd(),env:{...process.env,...overrides},stdio:['ignore','pipe','pipe']
 });
 let logs='';proc.stdout.on('data',c=>logs+=String(c).slice(0,3000));proc.stderr.on('data',c=>logs+=String(c).slice(0,3000));
 t.after(async()=>{
  if(proc.exitCode===null){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,1500))]);}
  await rm(dir,{recursive:true,force:true});
 });
 const base=`http://${HOST}:${port}`;
 let ready=false;
 for(let i=0;i<70;i++){
  if(proc.exitCode!==null)throw new Error('Isolated server exited before ready: '+logs.slice(-800));
  try{const r=await fetch(base+'/api/health');if(r.ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,'Isolated HTTP server did not start: '+logs.slice(-800));
 const body={bankConfirmationReference:'SYNTHETIC-ONLY',attestBeneficiaryReceipt:true,confirmFinalisation:true};
 const request=async(p,token)=>{
  const response=await fetch(base+p,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
  return response.status;
 };
 const tokens={
  noMfa:signed(secret,{role:'admin',mfa:false,staffRole:'administrator',email:'test@example.invalid'}),
  office:signed(secret,{role:'admin',mfa:true,staffRole:'office',email:'office@example.invalid'}),
  finance:signed(secret,{role:'admin',mfa:true,staffRole:'finance',email:'finance@example.invalid'}),
  administrator:signed(secret,{role:'admin',mfa:true,staffRole:'administrator',email:'admin@example.invalid'})
 };
 for(const p of urlPaths){
  await t.test(p.split('/').at(-1),async()=>{
   assert.equal(await request(p),401,'missing authentication');
   assert.equal(await request(p,tokens.noMfa),401,'MFA required');
   assert.equal(await request(p,tokens.office),403,'office access denied');
   assert.equal(await request(p,tokens.finance),403,'finance access denied');
   const response=await request(p,tokens.administrator);
   assert.ok(response===400||response===409,`Administrator should reach validation gate, received ${response}`);
  });
 }
}
test('Modulr admin HTTP authentication, MFA, authorisation and disabled gates — isolated database',runChecks);
