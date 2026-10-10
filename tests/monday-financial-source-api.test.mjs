import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createHmac,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import {
 reconcileMondaySettlement
} from '../server/lib/monday-settlement-reconciliation.mjs';

import {
 verifyMondayPlansFromDatabase
} from '../server/lib/monday-plan-verification.mjs';


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

  // STEP217_REAL_API_PLAN_INTEGRATION
  // Valid mode: install a genuine plan before Monday draft creation.
  // The parent payment request is required by SQLite foreign keys.
  if(mode==='valid'){
   const now=new Date().toISOString();

   db.prepare(`
    INSERT INTO payment_requests
     (id,driver_id,callsign,driver_name,
      amount,status,created_at)
    VALUES(?,?,?,?,?,?,?)
   `).run(
    'step217-source-request',
    10001,'10001','Test Driver',
    12,'pending_release',now
   );

   db.prepare(`
    INSERT INTO driver_payment_plans
     (id,driver_id,callsign,driver_name,
      source_payment_request_id,
      original_amount,plan_amount,paid_amount,
      remaining_amount,instalment_amount,
      start_date,status,created_by,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
   `).run(
    'step217-plan',
    10001,'10001','Test Driver',
    'step217-source-request',
    12,12,0,12,3,
    '2026-10-01','active',
    'isolated-test',now
   );

   db.prepare(`
    INSERT INTO driver_payment_plan_instalments
     (id,plan_id,driver_id,callsign,
      instalment_number,amount,paid_amount,
      due_at,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)
   `).run(
    'step217-instalment',
    'step217-plan',
    10001,'10001',
    1,3,0,
    '2026-10-01','due',now
   );
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

    // STEP204_SQLITE_RECONCILIATION
    const saved=db.prepare(`
     SELECT settings_json,items_json
     FROM settlement_runs WHERE id=?
    `).get(result.id);

    assert.ok(saved);

    const financialRecords={
     runId:result.id,
     settings:JSON.parse(saved.settings_json),
     items:JSON.parse(saved.items_json),
     payouts:db.prepare(
      'SELECT * FROM payouts WHERE run_id=?'
     ).all(result.id),
     paymentRequests:db.prepare(
      'SELECT * FROM payment_requests WHERE run_id=?'
     ).all(result.id)
    };

    // Verify actual Monday API allocation against real SQLite plans.
    const item=financialRecords.items.find(
     x=>Number(x.driverId)===10001
    );

    assert.ok(item,'Driver 10001 missing from Monday draft.');
    assert.equal(item.previousBalance,10);
    assert.equal(item.weeklyFee,2.5);
    assert.equal(item.adjustedBalance,7.5);
    assert.equal(item.planAllocation,3);
    assert.equal(item.payoutAvailable,4.5);
    assert.equal(item.action,'payout');
    assert.equal(item.amount,4.5);
    assert.equal(item.planId,'step217-plan');
    assert.equal(item.planInstalmentId,'step217-instalment');

    const payout=financialRecords.payouts.find(
     x=>Number(x.driver_id)===10001
    );

    assert.ok(payout);
    assert.equal(payout.amount,4.5);
    assert.equal(payout.run_id,result.id);
    assert.equal(item.payoutId,payout.id);

    const allocation=db.prepare(`
     SELECT *
     FROM payment_plan_settlement_allocations
     WHERE run_id=? AND driver_id=?
    `).get(result.id,10001);

    assert.ok(allocation);
    assert.equal(allocation.allocated_amount,3);
    assert.equal(allocation.scheduled_amount,3);
    assert.equal(allocation.plan_id,'step217-plan');
    assert.equal(
     allocation.instalment_id,
     'step217-instalment'
    );
    assert.equal(allocation.payout_id,payout.id);
    assert.equal(allocation.status,'pending');
    assert.equal(counts.allocations,1);

    const verifyPlans=()=>{
     return verifyMondayPlansFromDatabase({
      db,
      runId:result.id,
      items:financialRecords.items
     });
    };

    let planResult=verifyPlans();

    assert.equal(
     planResult.valid,
     true,
     JSON.stringify(planResult.issues).slice(0,1500)
    );

    assert.equal(planResult.driverCount,1001);
    assert.equal(planResult.allocationCount,1);

    // Database corruption must fail closed.
    db.prepare(`
     UPDATE payment_plan_settlement_allocations
     SET allocated_amount=?
     WHERE id=?
    `).run(4,allocation.id);

    assert.equal(verifyPlans().valid,false);

    db.prepare(`
     UPDATE payment_plan_settlement_allocations
     SET allocated_amount=?
     WHERE id=?
    `).run(3,allocation.id);

    db.prepare(`
     UPDATE driver_payment_plans
     SET status='paused'
     WHERE id='step217-plan'
    `).run();

    assert.equal(verifyPlans().valid,false);

    db.prepare(`
     UPDATE driver_payment_plans
     SET status='active'
     WHERE id='step217-plan'
    `).run();

    db.prepare(`
     UPDATE driver_payment_plan_instalments
     SET amount=4
     WHERE id='step217-instalment'
    `).run();

    assert.equal(verifyPlans().valid,false);

    db.prepare(`
     UPDATE driver_payment_plan_instalments
     SET amount=3
     WHERE id='step217-instalment'
    `).run();

    db.prepare(`
     DELETE FROM payment_plan_settlement_allocations
     WHERE id=?
    `).run(allocation.id);

    assert.equal(verifyPlans().valid,false);

    // Restore the original allocation and verify recovery.
    db.prepare(`
     INSERT INTO payment_plan_settlement_allocations
      (id,run_id,payout_id,driver_id,callsign,
       plan_id,instalment_id,payment_request_id,
       scheduled_amount,allocated_amount,status,
       autocab_event_key,created_at)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
     allocation.id,
     allocation.run_id,
     allocation.payout_id,
     allocation.driver_id,
     allocation.callsign,
     allocation.plan_id,
     allocation.instalment_id,
     allocation.payment_request_id,
     allocation.scheduled_amount,
     allocation.allocated_amount,
     allocation.status,
     allocation.autocab_event_key,
     allocation.created_at
    );

    planResult=verifyPlans();

    assert.equal(
     planResult.valid,
     true,
     JSON.stringify(planResult.issues).slice(0,1500)
    );

    console.log(
     'PASS — STEP217: Real Monday API plan deduction '+
     '£3; payout £4.50; four database corruption checks.'
    );

    const reconciliation=reconcileMondaySettlement(
     financialRecords
    );

    assert.equal(
     reconciliation.valid,
     true,
     JSON.stringify(reconciliation.issues).slice(0,1200)
    );

    assert.equal(reconciliation.driverCount,1001);
    assert.equal(reconciliation.payoutCount,counts.payouts);
    // STEP218_SETTLEMENT_SCOPED_REQUEST_COUNT
    // Exclude the pre-existing payment-plan source request.
    assert.equal(
     reconciliation.paymentRequestCount,
     financialRecords.paymentRequests.length
    );

    assert.equal(
     financialRecords.paymentRequests.length,
     db.prepare(
      'SELECT COUNT(*) AS n FROM payment_requests WHERE run_id=?'
     ).get(result.id).n
    );

    const altered=structuredClone(financialRecords);
    assert.ok(altered.payouts.length>0);
    altered.payouts[0].amount+=10;
    assert.equal(reconcileMondaySettlement(altered).valid,false);

    const missing=structuredClone(financialRecords);
    missing.payouts.pop();
    assert.equal(reconcileMondaySettlement(missing).valid,false);

    const wrongDriver=structuredClone(financialRecords);
    wrongDriver.payouts[0].driver_id=99999999;
    assert.equal(reconcileMondaySettlement(wrongDriver).valid,false);

    const unexpected=structuredClone(financialRecords);
    unexpected.payouts.push({
     ...unexpected.payouts[0],
     id:'unexpected-test-payout'
    });
    assert.equal(reconcileMondaySettlement(unexpected).valid,false);

    console.log(
     'PASS — STEP204: Real SQLite reconciliation and four corruption checks.'
    );

    // STEP233_GENERAL_ROUTE_BYPASS_TESTS
    // General administrative routes must not bypass Monday verification.
    const bypassHeaders={
     Authorization:`Bearer ${token(secret)}`,
     'Content-Type':'application/json'
    };

    const bypassPayout=db.prepare(`
     SELECT id,status
     FROM payouts
     WHERE run_id=? AND type='weekly'
     ORDER BY driver_id LIMIT 1
    `).get(result.id);

    assert.ok(bypassPayout);
    assert.equal(bypassPayout.status,'pending_approval');

    const generalApproval=await fetch(
     base+'/api/admin/payouts/'+
     encodeURIComponent(bypassPayout.id),
     {
      method:'PATCH',
      headers:bypassHeaders,
      body:JSON.stringify({status:'approved'})
     }
    );

    assert.equal(
     generalApproval.status,
     409,
     JSON.stringify(await generalApproval.json())
    );

    assert.equal(
     db.prepare('SELECT status FROM payouts WHERE id=?')
      .get(bypassPayout.id).status,
     'pending_approval'
    );

    const generalBatch=await fetch(
     base+'/api/admin/payout-runs',
     {
      method:'POST',
      headers:bypassHeaders,
      body:JSON.stringify({runType:'weekly'})
     }
    );

    assert.equal(
     generalBatch.status,
     409,
     JSON.stringify(await generalBatch.json())
    );

    assert.equal(
     db.prepare(`
      SELECT COUNT(*) AS n
      FROM payout_runs
      WHERE run_type='weekly'
     `).get().n,
     0
    );

    console.log(
     'PASS — STEP233: General weekly approval and batching bypasses blocked.'
    );

    // STEP228_APPROVAL_GATE_INTEGRATION
    // Exercise approval before verification, using the real API.
    const testPayout=db.prepare(`
     SELECT id FROM payouts
     WHERE run_id=? AND type='weekly'
     ORDER BY driver_id
     LIMIT 1
    `).get(result.id);

    assert.ok(testPayout);

    const approvalUrl=
     base+'/api/admin/monday-runs/'+
     encodeURIComponent(result.id)+
     '/payouts/'+encodeURIComponent(testPayout.id);

    const authHeaders={
     Authorization:`Bearer ${token(secret)}`,
     'Content-Type':'application/json'
    };

    const approve=async()=>{
     const r=await fetch(approvalUrl,{
      method:'PATCH',
      headers:authHeaders,
      body:JSON.stringify({status:'approved'})
     });
     return {status:r.status,body:await r.json()};
    };

    const unverified=await approve();

    assert.equal(unverified.status,409);
    assert.equal(
     db.prepare('SELECT status FROM payouts WHERE id=?')
      .get(testPayout.id).status,
     'pending_approval'
    );

    console.log(
     'PASS — STEP228: Unverified individual payout approval blocked.'
    );

    // STEP227_REAL_VERIFICATION_ENDPOINT
    // This executes only against the isolated local test server.
    const verifyResponse=await fetch(
     base+'/api/admin/monday-runs/'+
     encodeURIComponent(result.id)+'/verify-financials',
     {
      method:'POST',
      headers:{
       Authorization:`Bearer ${token(secret)}`,
       'Content-Type':'application/json'
      },
      body:'{}'
     }
    );

    const verifyResult=await verifyResponse.json();

    assert.equal(
     verifyResponse.status,
     200,
     JSON.stringify(verifyResult).slice(0,1800)
    );

    assert.equal(verifyResult.status,'passed');
    assert.equal(verifyResult.runId,result.id);
    assert.equal(verifyResult.driverCount,1001);

    const latestVerification=db.prepare(`
     SELECT *
     FROM monday_settlement_verifications
     WHERE run_id=?
     ORDER BY rowid DESC
     LIMIT 1
    `).get(result.id);

    assert.equal(latestVerification.status,'passed');
    assert.equal(latestVerification.difference_count,0);
    assert.ok(latestVerification.expires_at);

    console.log(
     'PASS — STEP227: Authenticated real Monday financial verification.'
    );

    // The same approval must now pass with verified financials.
    const approved=await approve();

    assert.equal(
     approved.status,
     200,
     JSON.stringify(approved.body).slice(0,1200)
    );

    assert.equal(
     db.prepare('SELECT status FROM payouts WHERE id=?')
      .get(testPayout.id).status,
     'approved'
    );

    // Tampering with a different payout must block further approval.
    const secondPayout=db.prepare(`
     SELECT id FROM payouts
     WHERE run_id=? AND id!=?
       AND status='pending_approval'
     ORDER BY driver_id LIMIT 1
    `).get(result.id,testPayout.id);

    assert.ok(secondPayout);

    const originalAmount=db.prepare(
     'SELECT amount FROM payouts WHERE id=?'
    ).get(secondPayout.id).amount;

    db.prepare(
     'UPDATE payouts SET amount=? WHERE id=?'
    ).run(originalAmount+1,secondPayout.id);

    const changed=await fetch(
     base+'/api/admin/monday-runs/'+
     encodeURIComponent(result.id)+
     '/payouts/'+encodeURIComponent(secondPayout.id),
     {
      method:'PATCH',
      headers:authHeaders,
      body:JSON.stringify({status:'approved'})
     }
    );

    assert.equal(changed.status,409);

    db.prepare(
     'UPDATE payouts SET amount=? WHERE id=?'
    ).run(originalAmount,secondPayout.id);

    console.log(
     'PASS — STEP228: Verified approval succeeds; '+
     'financial tampering blocks further approval.'
    );

    // STEP229_FINAL_FINANCIAL_GATES
    const mondayBase=
     base+'/api/admin/monday-runs/'+
     encodeURIComponent(result.id);

    const post=async(path)=>{
     const response=await fetch(mondayBase+path,{
      method:'POST',
      headers:authHeaders,
      body:'{}'
     });
     return {
      status:response.status,
      body:await response.json()
     };
    };

    const verificationRows=()=>db.prepare(`
     SELECT rowid,* FROM monday_settlement_verifications
     WHERE run_id=? ORDER BY rowid DESC
    `).all(result.id);

    // A bulk approval must not bypass an expired verification.
    const currentPass=verificationRows()[0];

    assert.equal(currentPass.status,'passed');

    db.prepare(`
     UPDATE monday_settlement_verifications
     SET expires_at='2000-01-01T00:00:00Z'
     WHERE id=?
    `).run(currentPass.id);

    const expiredApproval=await fetch(
     base+'/api/admin/monday-runs/'+
     encodeURIComponent(result.id)+'/payouts/'+
     encodeURIComponent(secondPayout.id),
     {
      method:'PATCH',
      headers:authHeaders,
      body:JSON.stringify({status:'approved'})
     }
    );

    assert.equal(expiredApproval.status,409);

    const expiredBulk=await post('/approve-all');

    assert.equal(expiredBulk.status,409);

    // Restore expiry so the next test isolates financial fingerprints.
    db.prepare(`
     UPDATE monday_settlement_verifications
     SET expires_at=?
     WHERE id=?
    `).run(currentPass.expires_at,currentPass.id);

    // Changing financial settings must prevent approval.
    const setting=db.prepare(`
     SELECT value FROM settings WHERE key='config'
    `).get();

    // The fingerprint function compares saved rules to current settings.
    // Test a plan mutation instead; this does not assume settings format.
    const originalPlanRemaining=db.prepare(`
     SELECT remaining_amount FROM driver_payment_plans
     WHERE id='step217-plan'
    `).get().remaining_amount;

    db.prepare(`
     UPDATE driver_payment_plans
     SET remaining_amount=?
     WHERE id='step217-plan'
    `).run(originalPlanRemaining+1);

    const changedPlanBulk=await post('/approve-all');
    assert.equal(changedPlanBulk.status,409);

    db.prepare(`
     UPDATE driver_payment_plans
     SET remaining_amount=?
     WHERE id='step217-plan'
    `).run(originalPlanRemaining);

    // A fresh failed verification must supersede the old pass.
    db.prepare(`
     UPDATE payouts SET amount=amount+1
     WHERE id=?
    `).run(secondPayout.id);

    const failedVerification=await post('/verify-financials');

    assert.equal(failedVerification.status,409);

    const latest=verificationRows()[0];
    assert.equal(latest.status,'failed');

    const earlier=verificationRows().find(
     x=>x.id===currentPass.id
    );

    assert.equal(earlier.status,'invalidated');

    // Even after restoring the corrupted payout, a newer failed
    // attempt must not allow reuse of the old verification.
    db.prepare(`
     UPDATE payouts SET amount=?
     WHERE id=?
    `).run(originalAmount,secondPayout.id);

    const staleApproval=await fetch(
     base+'/api/admin/monday-runs/'+
     encodeURIComponent(result.id)+'/payouts/'+
     encodeURIComponent(secondPayout.id),
     {
      method:'PATCH',
      headers:authHeaders,
      body:JSON.stringify({status:'approved'})
     }
    );

    assert.equal(staleApproval.status,409);

    const staleBulk=await post('/approve-all');
    assert.equal(staleBulk.status,409);

    // Batching must reject any settlement not approved.
    const prematureBatch=await post('/create-payout-run');
    assert.equal(prematureBatch.status,409);

    // Simulate approved run status solely inside this isolated
    // temporary database to exercise the batching verification gate.
    db.prepare(`
     UPDATE settlement_runs SET status='approved'
     WHERE id=?
    `).run(result.id);

    const unverifiedBatch=await post('/create-payout-run');
    assert.equal(unverifiedBatch.status,409);

    // Restore the draft. No payout batch is created.
    db.prepare(`
     UPDATE settlement_runs SET status='draft'
     WHERE id=?
    `).run(result.id);

    // STEP229A_BATCH_MEMBERSHIP_ASSERTION
    // Verify no payout from this Monday run joined a batch.
    assert.equal(
     db.prepare(`
      SELECT COUNT(*) AS n
      FROM payouts
      WHERE run_id=?
        AND payout_run_id IS NOT NULL
     `).get(result.id).n,
     0
    );

    console.log(
     'PASS — STEP229: Expiry, bulk approval, plan tampering, '+
     'failed re-verification and payout-batch blocking.'
    );

    // STEP234_VERIFIED_BULK_APPROVAL
    // Reverify after the deliberately failed verification attempt.
    const freshVerification=await post('/verify-financials');

    assert.equal(
     freshVerification.status,
     200,
     JSON.stringify(freshVerification.body).slice(0,1500)
    );

    assert.equal(freshVerification.body.status,'passed');

    const bulkApproval=await post('/approve-all');

    assert.equal(
     bulkApproval.status,
     200,
     JSON.stringify(bulkApproval.body).slice(0,1500)
    );

    assert.equal(bulkApproval.body.ok,true);

    const approvedRun=db.prepare(`
     SELECT status,items_json
     FROM settlement_runs WHERE id=?
    `).get(result.id);

    assert.equal(approvedRun.status,'approved');

    const savedItems=JSON.parse(approvedRun.items_json);
    const approvedPayouts=db.prepare(`
     SELECT *
     FROM payouts
     WHERE run_id=? AND type='weekly'
       AND status='approved'
    `).all(result.id);

    const pendingCount=db.prepare(`
     SELECT COUNT(*) AS n
     FROM payouts
     WHERE run_id=? AND type='weekly'
       AND status='pending_approval'
    `).get(result.id).n;

    assert.equal(pendingCount,0);
    assert.equal(approvedPayouts.length,1001);
    assert.equal(
     savedItems.filter(x=>x.approvalStatus==='approved').length,
     1001
    );

    // The payment-plan deduction must remain pending.
    const allocationAfterApproval=db.prepare(`
     SELECT status FROM payment_plan_settlement_allocations
     WHERE run_id=? AND driver_id=10001
    `).get(result.id);

    assert.equal(allocationAfterApproval.status,'pending');

    // Verification alone must never bypass the deduction lock.
    const blockedBatch=await post('/create-payout-run');

    assert.equal(blockedBatch.status,409);
    assert.match(
     JSON.stringify(blockedBatch.body),
     /payment.plan deduction|pending payment.plan/i
    );

    assert.equal(
     db.prepare(`
      SELECT COUNT(*) AS n
      FROM payouts
      WHERE run_id=? AND payout_run_id IS NOT NULL
     `).get(result.id).n,
     0
    );

    console.log(
     'PASS — STEP234: Fresh verification permits atomic bulk approval; '+
     'pending payment-plan deduction still prevents payout batching.'
    );




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
