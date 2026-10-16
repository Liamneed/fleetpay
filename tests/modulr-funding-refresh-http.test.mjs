import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';



import {
  ensureModulrFundingVerificationTable,
  refreshVerifiedModulrFunding
} from '../server/lib/modulr-funding-earmark.mjs';

const source=fs.readFileSync('server/index.js','utf8');

function line(name){
  const found=source.split('\n').find(
    x=>x.startsWith(`function ${name}(`)
  );
  assert.ok(found,`Missing function: ${name}`);
  return found;
}

function section(begin,end){
  const a=source.indexOf(begin);
  const b=source.indexOf(end,a);
  assert.ok(a>=0 && b>a,`Missing section: ${begin}`);
  return source.slice(a,b);
}

const route=section(
  '// Refresh only the existing internal funding verification, never payout funds.',
  '// Sandbox-only administrator funding approval.'
);

const build=new Function(
  'app','db','crypto','Buffer','TOKEN_SECRET',
  'MODULR_ENV','MODULR_ENABLED',
  'AUTOCAB_ADJUSTMENTS_ENABLED',
  'LIVE_TEST_AUTOCAB_WRITES_ENABLED',
  'MODULR_API_KEY','MODULR_ACCOUNT_ID',
  'MODULR_CUSTOMER_ID','MODULR_BASE_URL',
  'fetch','audit',
  'ensureModulrFundingVerificationTable',
  'refreshVerifiedModulrFunding',
  [
    line('signToken'),
    line('verifyToken'),
    line('bearer'),
    line('adminAuth'),
    line('requireStaffRole'),
    section(
      'function isPlatformAdmin(staffId){',
      'function ensurePlatformAdminGrant('
    ),
    section(
      'function requirePlatformAdmin(req,res,next){',
      'function companySlug('
    ),
    route,
    'return {signToken};'
  ].join('\n')
);

async function scenario(callback,opts={}){
  const db=new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE staff_users(
      id TEXT PRIMARY KEY,
      active INTEGER,
      role TEXT,
      mfa_enabled INTEGER
    );

    CREATE TABLE platform_admins(
      staff_id TEXT PRIMARY KEY
    );

    CREATE TABLE payout_runs(
      id TEXT PRIMARY KEY,
      provider TEXT,
      status TEXT,
      funding_status TEXT,
      total_amount REAL,
      funds_cleared_at TEXT,
      provider_ref TEXT,
      released_at TEXT,
      paid_at TEXT
    );

    INSERT INTO staff_users VALUES
      ('admin',1,'administrator',1),
      ('ordinary',1,'administrator',1),
      ('inactive',0,'administrator',1),
      ('no_mfa',1,'administrator',0),
      ('finance',1,'finance',1);

    INSERT INTO platform_admins VALUES
      ('admin'),('inactive'),('no_mfa');

    INSERT INTO payout_runs
      (id,provider,status,funding_status,total_amount)
    VALUES
      ('run1','modulr','funding_pending',
       'balance_verified',125.50),
      ('run2','modulr','funding_pending',
       'awaiting_clearance',100.00);
  `);

  ensureModulrFundingVerificationTable(db);


  db.prepare(`
    INSERT INTO modulr_funding_verifications
    (run_id,account_id,customer_id,required_minor,
     available_minor,verified_at)
    VALUES (?,?,?,?,?,?)
  `).run(
    'run1','ACCOUNT_TEST','CUSTOMER_TEST',
    12550,50000,
    opts.expired
      ? '2020-01-01T00:00:00Z'
      : new Date().toISOString()
  );

  const app=express();
  app.use(express.json());

  let server;
  let gets=0;
  let posts=0;
  let audits=0;

  const mockFetch=async(url,options)=>{
    if(options?.method!=='GET'){
      posts++;
      throw new Error('Provider write prohibited');
    }

    gets++;

    assert.equal(
      String(url),
      'https://synthetic.invalid/accounts/ACCOUNT_TEST'
    );

    if(opts.providerFailure){
      return {status:503};
    }

    return {
      status:200,
      json:async()=>({
        id:opts.wrongAccount?'WRONG':'ACCOUNT_TEST',
        customerId:'CUSTOMER_TEST',
        currency:'GBP',
        status:'ACTIVE',
        availableBalance:opts.balance??'500.00'
      })
    };
  };

  const {signToken}=build(
    app,db,crypto,Buffer,
    'synthetic-test-secret',
    opts.environment??'sandbox',
    false,false,false,
    'synthetic-api-key',
    'ACCOUNT_TEST',
    'CUSTOMER_TEST',
    'https://synthetic.invalid/',
    mockFetch,
    ()=>{audits++},
    ensureModulrFundingVerificationTable,
    refreshVerifiedModulrFunding
  );

  const previous=process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';

  try {
    server=await new Promise((resolve,reject)=>{
      const s=app.listen(0,'127.0.0.1',()=>resolve(s));
      s.once('error',reject);
    });

    const token=(staffId,mfa=true)=>signToken({
      role:'admin',
      staffRole:staffId==='finance'
        ? 'finance':'administrator',
      staffId,
      mfa,
      email:'test@example.invalid'
    },1);

    const request=async(auth,body={})=>{
      const response=await fetch(
        `http://127.0.0.1:${server.address().port}`+
        '/api/admin/payout-runs/run1/modulr-refresh-funding',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            ...(auth?{Authorization:`Bearer ${auth}`}:{})
          },
          body:JSON.stringify(body)
        }
      );

      return {
        status:response.status,
        body:await response.json()
      };
    };

    const state=()=>db.prepare(`
      SELECT status,funding_status,funds_cleared_at
      FROM payout_runs WHERE id='run1'
    `).get();

    const count=()=>db.prepare(`
      SELECT COUNT(*) AS n
      FROM modulr_funding_verifications
    `).get().n;

    await callback({
      request,token,state,count,
      gets:()=>gets,
      audits:()=>audits
    });

    assert.equal(posts,0,'No provider payments permitted');

  } finally {
    if(server){
      await new Promise((resolve,reject)=>
        server.close(e=>e?reject(e):resolve())
      );
    }

    if(previous===undefined){
      delete process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;
    }else{
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED=previous;
    }

    db.close();
  }
}


test('MFA platform admin refreshes existing earmark without payment',async()=>{
 await scenario(async({request,token,state,gets,audits})=>{
  const r=await request(token('admin'));
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(r.body.refreshed,true);
  assert.equal(r.body.paymentSubmitted,false);
  assert.equal(r.body.fundsCleared,false);
  assert.equal(state().funding_status,'balance_verified');
  assert.equal(gets(),1);
  assert.equal(audits(),1);
 });
});
test('No token prevents provider GET',async()=>{
 await scenario(async({request,gets})=>{
  assert.notEqual((await request()).status,200);
  assert.equal(gets(),0);
 });
});
test('MFA-disabled administrator cannot refresh',async()=>{
 await scenario(async({request,token,gets})=>{
  assert.equal((await request(token('no_mfa'))).status,403);
  assert.equal(gets(),0);
 });
});
test('Wrong provider account cannot refresh evidence',async()=>{
 await scenario(async({request,token,state})=>{
  assert.equal((await request(token('admin'))).status,409);
  assert.equal(state().funding_status,'balance_verified');
 },{wrongAccount:true});
});
test('Provider failure fails closed',async()=>{
 await scenario(async({request,token})=>{
  assert.equal((await request(token('admin'))).status,502);
 },{providerFailure:true});
});
