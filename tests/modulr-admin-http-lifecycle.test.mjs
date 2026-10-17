import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {spawn} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import net from 'node:net';

const host='127.0.0.1';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function signed(secret,body){const b=Buffer.from(JSON.stringify({...body,exp:Date.now()+120000})).toString('base64url');return `${b}.${createHmac('sha256',secret).update(b).digest('base64url')}`;}
async function openPort(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,host,ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p;}

async function lifecycle(t){
 const dir=await mkdtemp(path.join(tmpdir(),'faivopay-http-lifecycle-'));
 const dbPath=path.join(dir,'synthetic-only.sqlite');
 const secret=randomBytes(32).toString('hex');
 let proc;
 t.after(async()=>{if(proc?.exitCode===null){proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),delay(1500)]);}await rm(dir,{recursive:true,force:true});});
 const baseEnv={...process.env,PORTAL_TOKEN_SECRET:secret,SERVER_BIND_HOST:host,DB_PATH:dbPath,DATA_DIR:dir,
   BACKGROUND_JOBS_DISABLED:'true',WEEKLY_INVOICE_SCHEDULER_ENABLED:'false',AUTOCAB_API_KEY:'',
   AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
   MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',
   MODULR_APPLICATION_ACCOUNTING_ENABLED:'false',RESEND_API_KEY:'',SENDGRID_API_KEY:'',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',
   STRIPE_SECRET_KEY:'',ADMIN_EMAIL:'fake-admin@example.invalid',ADMIN_PASSWORD:randomBytes(24).toString('hex')};
 let base,log='';
 async function start(finalise){
   const port=await openPort();base=`http://${host}:${port}`;log='';
   const env={...baseEnv,PORT:String(port),PAYOUT_ACCOUNTING_FINALISATION_ENABLED:finalise?'true':'false',MODULR_MANUAL_ACCOUNTING_FINALISATION_ENABLED:finalise?'true':'false'};
   proc=spawn(process.execPath,['--env-file=.env','server/index.js'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
   proc.stdout.on('data',x=>log+=String(x).slice(0,2500));proc.stderr.on('data',x=>log+=String(x).slice(0,2500));
   for(let k=0;k<80;k++){if(proc.exitCode!==null)throw Error('Server exited: '+log.slice(-800));try{if((await fetch(base+'/api/health')).ok)return;}catch{}await delay(100);}
   throw Error('Server startup failed: '+log.slice(-800));
 }
 async function stop(){if(proc?.exitCode===null){const current=proc;current.kill('SIGTERM');await Promise.race([new Promise(r=>current.once('exit',r)),delay(1500)]);}proc=null;}
 const run='HTTP-SYNTHETIC-RUN', payout='HTTP-SYNTHETIC-PAYOUT', evidence='HTTP-SYNTHETIC-EVIDENCE';
 const transfer='HTTP-SYNTHETIC-NOT-A-REAL-MODULR-PAYMENT';
 const token=(email,role='administrator')=>signed(secret,{role:'admin',mfa:true,staffRole:role,email});
 const importer=token('importer@example.invalid'),reviewer=token('reviewer@example.invalid'),accountant=token('accountant@example.invalid');
 async function post(segment,bearer,body){const r=await fetch(base+segment,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+bearer},body:JSON.stringify(body)});let v;try{v=await r.json()}catch{v={}}return {status:r.status,body:v};}
 const verify=`/api/admin/payout-runs/${run}/evidence/${evidence}/verify-bank`;
 const finalise=`/api/admin/payout-runs/${run}/evidence/${evidence}/finalise-modulr-accounting`;
 await start(false);
 // Seed only this newly created throwaway file; no actual Modulr transfer is generated.
 const db=new DatabaseSync(dbPath);
 try{
   const stamp=new Date().toISOString();
   db.prepare(`INSERT INTO payout_runs(id,run_type,status,created_at,created_by,total_amount,item_count,provider,funding_status,funds_cleared_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(run,'early','funded',stamp,'synthetic-http-test',1,1,'modulr','cleared',stamp);
   db.prepare(`INSERT INTO payouts(id,driver_id,callsign,gross_amount,fee,net_amount,amount,type,status,created_at,updated_at,payout_run_id)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(payout,999999,'HTTP-FAKE',1.2,0.2,1,1,'early','batched',stamp,stamp,run);
   db.prepare(`INSERT INTO payout_transfer_intents(id,payout_id,payout_run_id,provider,environment,idempotency_key,recipient_id,recipient_snapshot_at,amount_minor,currency,status,provider_transfer_id,provider_status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('HTTP-SYNTHETIC-INTENT',payout,run,'modulr','sandbox','HTTP-SYNTHETIC-IDEMPOTENCY','HTTP-FAKE-BENEFICIARY',stamp,100,'GBP','confirmed',transfer,'PROCESSED',stamp,stamp);
   db.prepare(`INSERT INTO payout_confirmations(id,payout_id,payout_run_id,provider,provider_transaction_id,outcome,amount,currency,evidence_source,evidence_reference,verification_status,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(evidence,payout,run,'modulr',transfer,'paid',1,'GBP','test_bank_document','SYNTHETIC-FAKE','unverified','importer@example.invalid',stamp);
   const proof={bankConfirmationReference:'SYNTHETIC-NOT-REAL',attestBeneficiaryReceipt:true};
   let r=await post(verify,importer,proof);
   assert.equal(r.status,409,'importer must not verify own record');
   assert.equal(db.prepare('SELECT verification_status FROM payout_confirmations WHERE id=?').get(evidence).verification_status,'unverified');
   r=await post(verify,reviewer,proof);
   assert.equal(r.status,200,'separate reviewer should verify: '+JSON.stringify(r.body));
   assert.equal(db.prepare('SELECT verification_status FROM payout_confirmations WHERE id=?').get(evidence).verification_status,'verified');
   assert.equal(db.prepare('SELECT status FROM payouts WHERE id=?').get(payout).status,'batched');
   r=await post(finalise,accountant,{confirmFinalisation:true});
   assert.equal(r.status,409,'finalisation must be disabled during bank verification');
   assert.equal(db.prepare('SELECT status FROM payouts WHERE id=?').get(payout).status,'batched');
 }finally{db.close();}
 await stop();
 await start(true);
 const db2=new DatabaseSync(dbPath);
 try{
   const r=await post(finalise,accountant,{confirmFinalisation:true});
   assert.equal(r.status,200,'accounting authorised only after verified evidence: '+JSON.stringify(r.body));
   assert.equal(db2.prepare('SELECT status FROM payouts WHERE id=?').get(payout).status,'paid');
   const count=()=>db2.prepare("SELECT COUNT(*) n FROM driver_ledger WHERE reference_id=? AND entry_type IN ('early_payout','early_payout_fee')").get(payout).n;
   assert.equal(count(),2,'payout and its fee posted once');
   const repeat=await post(finalise,accountant,{confirmFinalisation:true});
   assert.equal(repeat.status,409,'replay must be rejected');
   assert.equal(count(),2,'replay must not duplicate ledger');
 }finally{db2.close();await stop();}
}
test('Two administrator HTTP phases: synthetic receipt verification, atomic accounting and replay blocking',lifecycle);
