import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { createModulrPaymentHistoryTable } from '../server/lib/modulr-payment-history.mjs';
import { validateModulrSandboxApproval } from '../server/lib/modulr-sandbox-approval.mjs';
import { claimValidatedModulrTransfer } from '../server/lib/modulr-validated-claim.mjs';
import { validateClaimedModulrSubmission } from '../server/lib/modulr-submission-gate.mjs';
import { executeModulrSandboxTransport } from '../server/lib/modulr-sandbox-payment-transport.mjs';
import {
  recordModulrTransferSubmission,
  transitionModulrTransfer
} from '../server/lib/modulr-transfer-store.mjs';

const source = fs.readFileSync('server/index.js', 'utf8');
const start = source.indexOf('// One-off £1 Modulr SANDBOX execution.');
const end = source.indexOf(
  '// Administrator-only, read-only Modulr sandbox payment preflight.',
  start
);
assert.ok(start >= 0 && end > start, 'Execution route must exist');

const authStart = source.indexOf('function signToken(');
const authEnd = source.indexOf('function companySlug(', authStart);
assert.ok(authStart >= 0 && authEnd > authStart);

const build = new Function(
  'app','db','crypto','Buffer','TOKEN_SECRET',
  'fetch','MODULR_API_KEY','MODULR_CUSTOMER_ID',
  'MODULR_ACCOUNT_ID','MODULR_BASE_URL',
  'assertModulrPreparationTestEnvironment',
  'findModulrSandboxBankMatch',
  'validateModulrSandboxApproval',
  'claimValidatedModulrTransfer',
  'validateClaimedModulrSubmission',
  'executeModulrSandboxTransport',
  'recordModulrTransferSubmission',
  'transitionModulrTransfer',
  'isPlatformAdmin',
  [
    source.slice(authStart,authEnd),
    source.slice(start,end),
    'return {signToken};'
  ].join('\n')
);

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE staff_users (
      id TEXT PRIMARY KEY, role TEXT, active INTEGER, mfa_enabled INTEGER
    );
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY, payout_id TEXT, payout_run_id TEXT,
      provider TEXT, environment TEXT, status TEXT,
      provider_transfer_id TEXT, confirmed_at TEXT,
      amount_minor INTEGER, currency TEXT, recipient_id TEXT,
      recipient_snapshot_at TEXT, recipient_account_last4 TEXT,
      recipient_sort_code_last2 TEXT, updated_at TEXT,
      attempt_started_at TEXT, idempotency_key TEXT,
      provider_status TEXT, submitted_at TEXT
    );
    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY, provider TEXT, status TEXT,
      funding_status TEXT, funds_cleared_at TEXT,
      provider_ref TEXT, released_at TEXT, paid_at TEXT,
      item_count INTEGER, total_amount REAL, run_type TEXT
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, payout_run_id TEXT, driver_id INTEGER,
      type TEXT, status TEXT, paid_at TEXT, net_amount REAL, amount REAL
    );
    CREATE TABLE driver_cache (
      driver_id INTEGER PRIMARY KEY, payout_excluded INTEGER
    );
    CREATE TABLE driver_bank_accounts (
      driver_id INTEGER PRIMARY KEY, updated_at TEXT,
      sort_code_enc TEXT, account_number_enc TEXT,
      sort_code_last2 TEXT, account_number_last4 TEXT
    );
    CREATE TABLE payout_confirmations (payout_id TEXT);

    INSERT INTO staff_users VALUES
      ('admin','administrator',1,1),
      ('finance','finance',1,1);

    INSERT INTO payout_transfer_intents (
      id,payout_id,payout_run_id,provider,environment,status,
      amount_minor,currency,recipient_id,recipient_snapshot_at,
      recipient_account_last4,recipient_sort_code_last2,idempotency_key
    ) VALUES (
      'intent','pay','run','modulr','sandbox','prepared',
      100,'GBP','beneficiary','2026-10-12T18:50:00Z',
      '1234','56','nonce_integration_299'
    );

    INSERT INTO payout_runs VALUES (
      'run','modulr','funded','cleared','2026-10-12T18:00:00Z',
      NULL,NULL,NULL,1,1,'early'
    );

    INSERT INTO payouts VALUES
      ('pay','run',1,'early','batched',NULL,1,1);

    INSERT INTO driver_cache VALUES (1,0);

    INSERT INTO driver_bank_accounts VALUES (
      1,'2026-10-12T16:00:00Z',
      'test_sort','test_account','56','1234'
    );
  `);
  createModulrPaymentHistoryTable(db);
  return db;
}

const envNames = [
  'MODULR_ENV','MODULR_ENABLED',
  'MODULR_SANDBOX_POST_ENABLED',
  'MODULR_ONE_POUND_EXECUTION_ENABLED',
  'MODULR_SANDBOX_EXECUTION_INTENT_ID',
  'PAYOUT_ACCOUNTING_FINALISATION_ENABLED',
  'AUTOCAB_ADJUSTMENTS_ENABLED',
  'LIVE_TEST_AUTOCAB_WRITES_ENABLED'
];

async function scenario(fn, {
  postResult='success',
  enabled=true,
  restricted=false,
  availableBalance='10.00'
}={}) {
  const previous=Object.fromEntries(
    envNames.map(k=>[k,process.env[k]])
  );
  const db=database();
  const app=express();
  app.use(express.json());
  let server;
  let posts=0;
  let lookups=0;

  try {
    Object.assign(process.env,{
      MODULR_ENV:'sandbox',
      MODULR_ENABLED:'false',
      MODULR_SANDBOX_POST_ENABLED:enabled?'true':'false',
      MODULR_ONE_POUND_EXECUTION_ENABLED:enabled?'true':'false',
      MODULR_SANDBOX_EXECUTION_INTENT_ID:'intent',
      PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',
      AUTOCAB_ADJUSTMENTS_ENABLED:'false',
      LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'
    });

    // All external Modulr traffic is replaced by this mock.
    const mockFetch=async (url,options) => {
      lookups++;
      if(options?.method==='GET' &&
         String(url).includes('/accounts/')) {
        return {
          status:200,
          json:async()=>({
            id:'A_TEST_299',
            customerId:'C_TEST_1',
            currency:'GBP',
            status:'ACTIVE',
            availableBalance
          })
        };
      }
      if(options?.method==='POST' &&
         String(url).endsWith('/payments')) {
        posts++;
        if(postResult==='timeout') {
          throw new Error('Synthetic timeout');
        }
        return {
          status:201,
          json:async()=>({
            id:'P_TEST_1',
            status:'VALIDATED'
          })
        };
      }
      throw new Error('Unexpected external request');
    };

    const beneficiaryMatch=async()=>({
      matched:true,
      beneficiaryId:'beneficiary',
      status:'ACTIVE',
      approvalStatus:'APPROVED',
      approvalRequired:false,
      bankUpdatedAt:'2026-10-12T16:00:00Z',
      bankSortCodeEnc:'test_sort',
      bankAccountNumberEnc:'test_account'
    });

    const {signToken}=build(
      app,db,crypto,Buffer,'synthetic-local-test-secret',
      mockFetch,'synthetic-api-key','C_TEST_1',
      'A_TEST_299','https://api-sandbox.example.invalid/',
      ()=>{if(restricted)throw new Error('Isolated DB required')},
      beneficiaryMatch,validateModulrSandboxApproval,
      claimValidatedModulrTransfer,validateClaimedModulrSubmission,
      executeModulrSandboxTransport,recordModulrTransferSubmission,
      transitionModulrTransfer,()=>true
    );

    server=await new Promise((resolve,reject)=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
      s.once('error',reject);
    });

    const url=`http://127.0.0.1:${server.address().port}`+
      '/api/admin/modulr/transfers/intent/execute-sandbox-one-pound';

    const token=(staffRole='administrator')=>signToken({
      role:'admin',mfa:true,staffRole,
      staffId:staffRole==='administrator'?'admin':'finance'
    },1);

    const request=async ({
      auth=token(),amount=100,
      phrase='SUBMIT_ONE_GBP_SANDBOX_PAYMENT'
    }={})=>{
      const response=await fetch(url,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          ...(auth?{Authorization:`Bearer ${auth}`}:{})
        },
        body:JSON.stringify({
          approvedAmountMinor:amount,
          authoriseSandboxPayment:phrase
        })
      });
      return {httpStatus:response.status,body:await response.json()};
    };

    await fn({
      request,token,db,
      posts:()=>posts,lookups:()=>lookups
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    db.close();
    for(const key of envNames) {
      if(previous[key]===undefined)delete process.env[key];
      else process.env[key]=previous[key];
    }
  }
}

const transfer=db=>db.prepare(
  'SELECT * FROM payout_transfer_intents WHERE id=?'
).get('intent');

test('Disabled route never contacts Modulr or claims a transfer',()=>scenario(
  async({request,db,posts,lookups})=>{
    const result=await request();
    assert.equal(result.httpStatus,403);
    assert.equal(posts(),0);
    assert.equal(lookups(),0);
    assert.equal(transfer(db).status,'prepared');
  },{enabled:false}
));

test('Unauthorised, wrong amount and wrong phrase cannot pay',()=>scenario(
  async({request,token,db,posts,lookups})=>{
    assert.equal((await request({auth:''})).httpStatus,401);
    assert.equal(
      (await request({auth:token('finance')})).httpStatus,403
    );
    assert.equal((await request({amount:200})).httpStatus,400);
    assert.equal((await request({phrase:'WRONG'})).httpStatus,400);
    assert.equal(posts(),0);
    assert.equal(lookups(),0);
    assert.equal(transfer(db).status,'prepared');
  }
));

test('Wrong database blocks execution before provider access',()=>scenario(
  async({request,db,posts,lookups})=>{
    assert.equal((await request()).httpStatus,403);
    assert.equal(posts(),0);
    assert.equal(lookups(),0);
    assert.equal(transfer(db).status,'prepared');
  },{restricted:true}
));

test('201 submits once but does not mark the payout paid',()=>scenario(
  async({request,db,posts})=>{
    const result=await request();
    assert.equal(result.httpStatus,201);
    assert.equal(result.body.status,'submitted');
    assert.equal(result.body.accountingFinalised,false);
    assert.equal(posts(),1);
    assert.equal(transfer(db).status,'submitted');
    assert.equal(transfer(db).provider_transfer_id,'P_TEST_1');
    assert.equal(
      db.prepare('SELECT paid_at FROM payouts').get().paid_at,null
    );
    assert.equal((await request()).httpStatus,409);
    assert.equal(posts(),1);
  }
));

test('Timeout becomes unknown and cannot be retried',()=>scenario(
  async({request,db,posts})=>{
    const result=await request();
    assert.equal(result.httpStatus,202);
    assert.equal(result.body.status,'unknown');
    assert.equal(result.body.automaticRetryAllowed,false);
    assert.equal(transfer(db).status,'unknown');
    assert.equal(posts(),1);
    assert.equal((await request()).httpStatus,409);
    assert.equal(posts(),1);
  },{postResult:'timeout'}
));

test('Concurrent requests submit only once',()=>scenario(
  async({request,db,posts})=>{
    const responses=await Promise.all([request(),request()]);
    assert.deepEqual(
      responses.map(x=>x.httpStatus).sort(),[201,409]
    );
    assert.equal(posts(),1);
    assert.equal(transfer(db).status,'submitted');
  }
));

test('Insufficient or malformed balance blocks the payment',async()=>{
  for(const availableBalance of [
    '0.00','0.99','-1.00','invalid','','1.001'
  ]){
    await scenario(async({request,db,posts})=>{
      const result=await request();
      assert.equal(result.httpStatus,409);
      assert.equal(posts(),0);
      assert.equal(transfer(db).status,'prepared');
    },{availableBalance});
  }
});

test('Exactly £1 available permits one sandbox mock submission',()=>scenario(
  async({request,db,posts})=>{
    const result=await request();
    assert.equal(result.httpStatus,201);
    assert.equal(posts(),1);
    assert.equal(transfer(db).status,'submitted');
  },{availableBalance:'1.00'}
));
