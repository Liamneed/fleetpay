import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';

import {
  ensureModulrFundingVerificationTable,
  earmarkVerifiedModulrFunding
} from '../server/lib/modulr-funding-earmark.mjs';

const source=fs.readFileSync('server/index.js','utf8');

function line(name){
 const result=source.split('\n').find(
  x=>x.startsWith(`function ${name}(`)
 );
 assert.ok(result,`Missing ${name}`);
 return result;
}

function section(begin,end){
 const a=source.indexOf(begin);
 const b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,`Missing ${begin}`);
 return source.slice(a,b);
}

const route=section(
 '// Verified Modulr balance snapshot — sandbox only.',
 "app.post('/api/admin/payout-runs/:id/funding-sent'"
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
 'earmarkVerifiedModulrFunding',
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
   role TEXT
  );
  CREATE TABLE platform_admins(
   staff_id TEXT PRIMARY KEY
  );
  CREATE TABLE payout_runs(
   id TEXT PRIMARY KEY,
   provider TEXT,
   status TEXT,
   funding_status TEXT,
   total_amount REAL
  );

  INSERT INTO staff_users VALUES
   ('admin',1,'administrator'),
   ('ordinary',1,'administrator'),
   ('inactive',0,'administrator'),
   ('finance',1,'finance');

  INSERT INTO platform_admins VALUES
   ('admin'),('inactive');

  INSERT INTO payout_runs VALUES
   ('run1','modulr','funding_pending','awaiting_clearance',125.50),
   ('run2','modulr','funding_pending','awaiting_clearance',100.00);
 `);

 ensureModulrFundingVerificationTable(db);

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

  if(opts.providerFailure)return {status:503};

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
  earmarkVerifiedModulrFunding
 );

 const previous=process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;
 process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';

 try{
  server=await new Promise((resolve,reject)=>{
   const s=app.listen(0,'127.0.0.1',()=>resolve(s));
   s.once('error',reject);
  });

  const token=(staffId,mfa=true)=>signToken({
   role:'admin',
   staffRole:staffId==='finance'?'finance':'administrator',
   staffId,mfa,email:'test@example.invalid'
  },1);

  const request=async(auth,id='run1')=>{
   const response=await fetch(
    `http://127.0.0.1:${server.address().port}`+
    `/api/admin/payout-runs/${id}/modulr-verify-funding`,
    {
     method:'POST',
     headers:auth?{Authorization:`Bearer ${auth}`}:{}
    }
   );

   return {
    status:response.status,
    body:await response.json()
   };
  };

  const state=id=>db.prepare(
   'SELECT status,funding_status FROM payout_runs WHERE id=?'
  ).get(id);

  const count=()=>db.prepare(
   'SELECT COUNT(*) AS n FROM modulr_funding_verifications'
  ).get().n;

  await callback({
   request,token,state,count,
   gets:()=>gets,
   audits:()=>audits
  });

  assert.equal(posts,0);

 }finally{
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

test('authentication required',async()=>{
 await scenario(async x=>{
  assert.equal((await x.request()).status,401);
  assert.equal(x.gets(),0);
 });
});

test('MFA required',async()=>{
 await scenario(async x=>{
  assert.equal(
   (await x.request(x.token('admin',false))).status,401
  );
  assert.equal(x.gets(),0);
 });
});

test('finance user rejected',async()=>{
 await scenario(async x=>{
  assert.equal(
   (await x.request(x.token('finance'))).status,403
  );
  assert.equal(x.gets(),0);
 });
});

test('administrator without platform grant rejected',async()=>{
 await scenario(async x=>{
  assert.equal(
   (await x.request(x.token('ordinary'))).status,403
  );
 });
});

test('inactive administrator rejected',async()=>{
 await scenario(async x=>{
  assert.equal(
   (await x.request(x.token('inactive'))).status,403
  );
 });
});

test('funding verification records snapshot only',async()=>{
 await scenario(async x=>{
  const r=await x.request(x.token('admin'));

  assert.equal(r.status,200);
  assert.equal(r.body.verified,true);
  assert.equal(r.body.fundingStatus,'balance_verified');
  assert.equal(r.body.providerFundsReserved,false);
  assert.equal(r.body.paymentSubmitted,false);
  assert.equal(r.body.accountingFinalised,false);
  assert.equal(r.body.autocabReconciled,false);

  assert.equal(x.state('run1').status,'funding_pending');
  assert.equal(
   x.state('run1').funding_status,'balance_verified'
  );
  assert.equal(x.count(),1);
  assert.equal(x.gets(),1);
  assert.equal(x.audits(),1);
 });
});

test('duplicate verification rejected',async()=>{
 await scenario(async x=>{
  const token=x.token('admin');

  assert.equal((await x.request(token)).status,200);
  assert.equal((await x.request(token)).status,409);
  assert.equal(x.count(),1);
  assert.equal(x.gets(),1);
 });
});

test('second run cannot reuse funding earmark',async()=>{
 await scenario(async x=>{
  const token=x.token('admin');

  assert.equal((await x.request(token)).status,200);

  const second=await x.request(token,'run2');

  assert.equal(second.status,409);
  assert.equal(x.state('run2').funding_status,'awaiting_clearance');
  assert.equal(x.count(),1);
 });
});

test('insufficient balance leaves run unchanged',async()=>{
 await scenario(async x=>{
  const r=await x.request(x.token('admin'));

  assert.equal(r.status,409);
  assert.equal(x.state('run1').funding_status,'awaiting_clearance');
  assert.equal(x.count(),0);
 },{balance:'125.49'});
});

test('wrong account leaves run unchanged',async()=>{
 await scenario(async x=>{
  const r=await x.request(x.token('admin'));

  assert.equal(r.status,409);
  assert.equal(x.count(),0);
 },{wrongAccount:true});
});

test('provider error does not earmark',async()=>{
 await scenario(async x=>{
  const r=await x.request(x.token('admin'));

  assert.equal(r.status,502);
  assert.equal(x.count(),0);
 },{providerFailure:true});
});

test('production environment blocked',async()=>{
 await scenario(async x=>{
  const r=await x.request(x.token('admin'));

  assert.equal(r.status,403);
  assert.equal(x.gets(),0);
 },{environment:'production'});
});
