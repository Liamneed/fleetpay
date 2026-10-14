import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { validateModulrSandboxApproval } from
  '../server/lib/modulr-sandbox-approval.mjs';

const source = fs.readFileSync('server/index.js', 'utf8');

function extract(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

const begin = source.indexOf(
  '// Administrator-only, read-only Modulr sandbox payment preflight.'
);
const end = source.indexOf(
  '// Modulr sandbox connection test — read-only.', begin
);

assert.ok(begin >= 0 && end > begin);

const build = new Function(
  'app','db','crypto','Buffer','TOKEN_SECRET',
  'fetch','MODULR_API_KEY','MODULR_CUSTOMER_ID',
  'MODULR_ACCOUNT_ID','MODULR_BASE_URL',
  'assertModulrPreparationTestEnvironment',
  'findModulrSandboxBankMatch',
  'validateModulrSandboxApproval','isPlatformAdmin',
  [
    extract('signToken','companySlug').split(
      'function companySlug('
    )[0],
    source.slice(begin,end),
    'return { signToken };'
  ].join('\n')
);

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE staff_users (
      id TEXT PRIMARY KEY, role TEXT,
      active INTEGER, mfa_enabled INTEGER
    );
    CREATE TABLE payout_transfer_intents (
      id TEXT PRIMARY KEY,
      payout_id TEXT, provider TEXT,
      environment TEXT, status TEXT,
      amount_minor INTEGER, currency TEXT,
      recipient_id TEXT, provider_transfer_id TEXT,
      confirmed_at TEXT, attempt_started_at TEXT
    );
    CREATE TABLE payouts (
      id TEXT PRIMARY KEY, driver_id INTEGER,
      paid_at TEXT
    );
    INSERT INTO staff_users VALUES
      ('admin','administrator',1,1),
      ('finance','finance',1,1);
    INSERT INTO payout_transfer_intents VALUES
      ('intent','pay','modulr','sandbox','prepared',
       2500,'GBP','beneficiary',NULL,NULL,NULL);
    INSERT INTO payouts VALUES ('pay',1,NULL);
  `);
  return db;
}

async function scenario(callback, {
  restricted=false,
  providerStatus=200,
  accountCurrency='GBP',
  accountStatus='ACTIVE',
  matchStatus='APPROVED',
  platformAdmin=true
} = {}) {
  const db = fixture();
  const app = express();
  app.use(express.json());

  const previous = {
    MODULR_ENV:process.env.MODULR_ENV,
    MODULR_ENABLED:process.env.MODULR_ENABLED,
    PAYOUT_ACCOUNTING_FINALISATION_ENABLED:
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED
  };

  process.env.MODULR_ENV='sandbox';
  process.env.MODULR_ENABLED='false';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';

  let requests=0;
  let server;

  const mockFetch=async () => {
    requests++;
    return {
      status:providerStatus,
      json:async () => ({
        id:'A_TEST_1',
        customerId:'C_TEST_1',
        currency:accountCurrency,
        status:accountStatus
      })
    };
  };

  const match=async () => {
    requests++;
    return {
      matched:true,
      beneficiaryId:'beneficiary',
      status:'ACTIVE',
      approvalStatus:matchStatus,
      approvalRequired:false
    };
  };

  const { signToken }=build(
    app,db,crypto,Buffer,'synthetic-local-test-secret',
    mockFetch,'synthetic-api-key',
    'C_TEST_1','A_TEST_1',
    'https://api-sandbox.example.invalid/',
    () => {
      if(restricted) throw new Error('Isolated fixture required.');
    },
    match,validateModulrSandboxApproval,
    () => platformAdmin
  );

  try {
    server=await new Promise((resolve,reject)=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
      s.once('error',reject);
    });

    const url=`http://127.0.0.1:${server.address().port}`+
      '/api/admin/modulr/transfers/intent/execution-preflight';

    const token=(staffRole='administrator',mfa=true,staffId='admin') =>
      signToken({
        role:'admin',mfa,staffRole,staffId
      },1);

    const request=async (auth,amount=2500) => {
      const response=await fetch(url,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          ...(auth?{Authorization:`Bearer ${auth}`}:{})
        },
        body:JSON.stringify({approvedAmountMinor:amount})
      });
      return {status:response.status,body:await response.json()};
    };

    const state=()=>({
      intent:db.prepare(
        'SELECT * FROM payout_transfer_intents WHERE id=?'
      ).get('intent'),
      payout:db.prepare(
        'SELECT * FROM payouts WHERE id=?'
      ).get('pay')
    });

    await callback({db,token,request,state,requests:()=>requests});
  } finally {
    if(server) await new Promise((resolve,reject)=>
      server.close(e=>e?reject(e):resolve()));
    db.close();

    for(const [name,value] of Object.entries(previous)){
      if(value===undefined) delete process.env[name];
      else process.env[name]=value;
    }
  }
}

test('Unauthenticated and non-admin requests rejected before provider lookup',
  () => scenario(async ({request,token,requests,state})=>{
    assert.equal((await request()).status,401);
    assert.equal((await request('invalid')).status,401);
    assert.equal((await request(token('administrator',false))).status,401);
    assert.equal((await request(token('finance',true,'finance'))).status,403);
    assert.equal(requests(),0);
    assert.equal(state().intent.status,'prepared');
  })
);

test('Non-platform administrator and non-isolated DB rejected',
  async ()=>{
    await scenario(async ({request,token,requests})=>{
      assert.equal((await request(token())).status,403);
      assert.equal(requests(),0);
    },{platformAdmin:false});

    await scenario(async ({request,token,requests})=>{
      assert.equal((await request(token())).status,409);
      assert.equal(requests(),0);
    },{restricted:true});
  }
);

test('Incorrect amount rejected without accessing Modulr',
  () => scenario(async ({request,token,requests,state})=>{
    assert.equal((await request(token(),2501)).status,409);
    assert.equal((await request(token(),25.5)).status,400);
    assert.equal(requests(),0);
    assert.equal(state().intent.status,'prepared');
  })
);

test('Provider account and beneficiary failures are rejected',
  async ()=>{
    await scenario(async ({request,token,state})=>{
      assert.equal((await request(token())).status,502);
      assert.equal(state().intent.status,'prepared');
    },{providerStatus:500});

    await scenario(async ({request,token})=>{
      assert.equal((await request(token())).status,409);
    },{accountCurrency:'EUR'});

    await scenario(async ({request,token})=>{
      assert.equal((await request(token())).status,409);
    },{matchStatus:'PENDING'});
  }
);

test('Successful preflight is repeatable and never claims or pays',
  () => scenario(async ({request,token,state,requests})=>{
    const before=state();
    const first=await request(token());
    const second=await request(token());

    assert.equal(first.status,200);
    assert.equal(second.status,200);
    assert.equal(first.body.amountMinor,2500);
    assert.equal(first.body.paymentExecutionEnabled,false);
    assert.equal(first.body.paymentSubmitted,false);
    assert.equal(first.body.accountingFinalised,false);
    assert.equal(first.body.beneficiaryVerified,true);
    assert.equal(requests(),4);
    assert.deepEqual(state(),before);
  })
);

test('Inactive source account is rejected without financial changes',
  () => scenario(async ({request,token,state,requests}) => {
    const before=state();
    const response=await request(token());

    assert.equal(response.status,409);
    assert.equal(requests(),1);
    assert.deepEqual(state(),before);
  },{accountStatus:'SUSPENDED'})
);
