import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

async function freePort(){
 return new Promise((resolve,reject)=>{
  const server=createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   const port=server.address().port;
   server.close(()=>resolve(port));
  });
 });
}

function token(secret){
 const body=Buffer.from(JSON.stringify({
  role:'admin',
  mfa:true,
  staffRole:'administrator',
  staffId:'monday-test-admin',
  email:'monday-test@example.invalid',
  exp:Date.now()+60000
 })).toString('base64url');

 const signature=createHmac('sha256',secret)
  .update(body)
  .digest('base64url');

 return `${body}.${signature}`;
}

async function scenario(mode){
 const dir=mkdtempSync(
  join(tmpdir(),'faivopay-monday-source-')
 );

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
  DOTENV_CONFIG_PATH:join(dir,'nonexistent.env'),
  PORTAL_TOKEN_SECRET:secret,
  BACKGROUND_JOBS_DISABLED:'true',
  WEEKLY_INVOICE_SCHEDULER_ENABLED:'false',
  AUTOCAB_ADJUSTMENTS_ENABLED:'false',
  LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false',
  // STEP185_ROLLBACK_USES_VALID_AUTOCAB_DATA
  // Rollback must fail at SQLite insertion, not Autocab retrieval.
  FAIVOPAY_AUTOCAB_MOCK_MODE:
   mode==='rollback'?'valid':mode,
  AUTOCAB_API_KEY:'isolated-test-key',
  AUTOCAB_COMPANY_IDS:'1',
  STRIPE_SECRET_KEY:'',
  STRIPE_WEBHOOK_SECRET:'',
  WISE_API_TOKEN:'',
  TWILIO_ACCOUNT_SID:'',
  TWILIO_AUTH_TOKEN:'',
  ADMIN_EMAIL:'monday-test@example.invalid',
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
    throw new Error('Server exited: '+stderr);
   }

   try{
    const response=await fetch(base+'/api/health');

    if(response.ok){
     ready=true;
     break;
    }
   }catch{}

   await new Promise(resolve=>setTimeout(resolve,100));
  }

  assert.ok(ready,'Test server failed to start: '+stderr);

  db=new DatabaseSync(dbPath);

  // STEP184_EVIDENCE_AND_ROLLBACK_TESTS
  // Force verification insertion failure after payout rows have
  // been written, to exercise the settlement transaction rollback.
  if(mode==='rollback'){
   db.exec(`
    CREATE TRIGGER test_reject_monday_verification
    BEFORE INSERT ON monday_settlement_verifications
    BEGIN
     SELECT RAISE(ABORT,'TEST verification insert failure');
    END;
   `);
  }

  const response=await fetch(base+'/api/admin/monday-runs',{
   method:'POST',
   headers:{
    Authorization:`Bearer ${token(secret)}`,
    'Content-Type':'application/json'
   },
   body:'{}'
  });

  const result=await response.json();

  const counts={
   settlements:db.prepare(
    'SELECT COUNT(*) AS n FROM settlement_runs'
   ).get().n,
   payouts:db.prepare(
    'SELECT COUNT(*) AS n FROM payouts'
   ).get().n,
   paymentRequests:db.prepare(
    'SELECT COUNT(*) AS n FROM payment_requests'
   ).get().n,
   verifications:db.prepare(
    'SELECT COUNT(*) AS n FROM monday_settlement_verifications'
   ).get().n,
   allocations:db.prepare(
    'SELECT COUNT(*) AS n FROM payment_plan_settlement_allocations'
   ).get().n
  };

  if(mode==='valid'){
   assert.equal(
    response.status,200,
    JSON.stringify(result).slice(0,500)
   );

   assert.equal(counts.settlements,1);
   assert.ok(counts.payouts>0);
   assert.equal(counts.verifications,1);

   const evidenceRow=db.prepare(`
    SELECT run_id,status,autocab_source_hash,evidence_json
    FROM monday_settlement_verifications
   `).get();

   const evidence=JSON.parse(evidenceRow.evidence_json);

   assert.equal(evidenceRow.run_id,result.id);
   assert.equal(evidenceRow.status,'pending');
   assert.equal(evidence.runId,result.id);
   assert.equal(evidence.financialVerificationReady,true);
   assert.equal(evidence.settlementVerified,false);
   assert.equal(evidence.driverCount,1001);
   assert.equal(evidence.accountCount,1001);
   assert.equal(evidenceRow.autocab_source_hash,evidence.sourceHash);
   assert.match(evidence.sourceHash,/^[a-f0-9]{64}$/);

   const run=db.prepare(
    'SELECT status,items_json FROM settlement_runs LIMIT 1'
   ).get();

   assert.equal(run.status,'draft');
   assert.equal(JSON.parse(run.items_json).length,1001);
  }else{
   assert.notEqual(
    response.status,200,
    'Invalid financial source unexpectedly created a settlement.'
   );

   assert.deepEqual(counts,{
    settlements:0,
    payouts:0,
    paymentRequests:0,
    verifications:0,
    allocations:0
   });

   if(mode==='missing_balance'){
    assert.equal(response.status,409);
    assert.equal(result.financialVerificationReady,false);
    assert.ok(
     result.issues?.some(issue=>
      issue.includes('Invalid Previous Balance')
     )
    );
   }
  }

  console.log(
   `PASS — ${mode}: HTTP ${response.status}; `+
   `settlements=${counts.settlements}; `+
   `payouts=${counts.payouts}; `+
   `payment requests=${counts.paymentRequests}`
  );

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

for(const mode of [
 'valid',
 'missing_balance',
 'duplicate',
 'missing',
 'rollback'
]){
 test(`Monday financial source: ${mode}`,async()=>{
  await scenario(mode);
 });
}
