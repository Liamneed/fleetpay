import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { DatabaseSync } from 'node:sqlite';

import {
  validateModulrFundingBalance
} from '../server/lib/modulr-funding-validation.mjs';

const source = fs.readFileSync('server/index.js', 'utf8');

function line(name) {
  const result = source.split('\n').find(
    x => x.startsWith(`function ${name}(`)
  );
  assert.ok(result, `Missing ${name}`);
  return result;
}

function section(start, end) {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing ${start}`);
  return source.slice(a, b);
}

const route = section(
  '// Read-only Modulr funding check.',
  "app.post('/api/admin/payout-runs/:id/funding-sent'"
);

const build = new Function(
  'app','db','crypto','Buffer','TOKEN_SECRET',
  'MODULR_ENV','MODULR_ENABLED',
  'AUTOCAB_ADJUSTMENTS_ENABLED',
  'MODULR_API_KEY','MODULR_ACCOUNT_ID',
  'MODULR_CUSTOMER_ID','MODULR_BASE_URL',
  'validateModulrFundingBalance','fetch',
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

async function scenario(callback, options = {}) {
  const db = new DatabaseSync(':memory:');

  db.exec(`
    CREATE TABLE staff_users (
      id TEXT PRIMARY KEY,
      active INTEGER,
      role TEXT
    );

    CREATE TABLE platform_admins (
      staff_id TEXT PRIMARY KEY
    );

    CREATE TABLE payout_runs (
      id TEXT PRIMARY KEY,
      provider TEXT,
      status TEXT,
      total_amount REAL,
      funding_status TEXT
    );

    INSERT INTO staff_users VALUES
      ('admin',1,'administrator'),
      ('ordinary',1,'administrator'),
      ('inactive',0,'administrator'),
      ('finance',1,'finance');

    INSERT INTO platform_admins VALUES
      ('admin'),
      ('inactive');

    INSERT INTO payout_runs VALUES
      ('run1','modulr','funding_pending',125.50,'awaiting_clearance'),
      ('wise','wise','funding_pending',125.50,'awaiting_clearance'),
      ('done','modulr','funded',125.50,'cleared');
  `);

  const app = express();
  let server;
  let providerGets = 0;
  let providerPosts = 0;

  const providerFetch = async (url, request) => {
    if (request?.method !== 'GET') {
      providerPosts++;
      throw new Error('Provider writes prohibited');
    }

    providerGets++;

    assert.equal(
      String(url),
      'https://synthetic.invalid/accounts/ACCOUNT_TEST'
    );

    if (options.providerError) {
      return {status: 503};
    }

    return {
      status: 200,
      json: async () => ({
        id: options.wrongAccount ? 'WRONG' : 'ACCOUNT_TEST',
        customerId: 'CUSTOMER_TEST',
        currency: 'GBP',
        status: 'ACTIVE',
        availableBalance: options.balance ?? '125.50'
      })
    };
  };

  const {signToken} = build(
    app,db,crypto,Buffer,
    'test-only-token-secret',
    options.environment ?? 'sandbox',
    false,
    false,
    'synthetic-api-key',
    'ACCOUNT_TEST',
    'CUSTOMER_TEST',
    'https://synthetic.invalid/',
    validateModulrFundingBalance,
    providerFetch
  );

  const previous = process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;

  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';

  try {
    server = await new Promise((resolve,reject) => {
      const s = app.listen(0,'127.0.0.1',() => resolve(s));
      s.once('error',reject);
    });

    const token = (staffId,mfa=true) =>
      signToken({
        role:'admin',
        staffRole: staffId === 'finance' ? 'finance' : 'administrator',
        staffId,
        mfa
      },1);

    const request = async (auth,id='run1') => {
      const result = await fetch(
        `http://127.0.0.1:${server.address().port}` +
        `/api/admin/payout-runs/${id}/modulr-funding-check`,
        {
          headers:auth
            ? {Authorization:`Bearer ${auth}`}
            : {}
        }
      );

      return {
        status:result.status,
        body:await result.json()
      };
    };

    const state = () => db.prepare(
      "SELECT status,funding_status FROM payout_runs WHERE id='run1'"
    ).get();

    await callback({
      request,token,state,
      providerGets:()=>providerGets
    });

    assert.equal(providerPosts,0);
    assert.deepEqual({...state()},{
      status:'funding_pending',
      funding_status:'awaiting_clearance'
    });

  } finally {
    if (server) {
      await new Promise((resolve,reject) =>
        server.close(e=>e?reject(e):resolve())
      );
    }

    if (previous===undefined) {
      delete process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;
    } else {
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED=previous;
    }

    db.close();
  }
}

test('unauthenticated user blocked',async()=>{
  await scenario(async x=>{
    assert.equal((await x.request()).status,401);
    assert.equal(x.providerGets(),0);
  });
});

test('MFA required',async()=>{
  await scenario(async x=>{
    assert.equal(
      (await x.request(x.token('admin',false))).status,401
    );
    assert.equal(x.providerGets(),0);
  });
});

test('finance user blocked',async()=>{
  await scenario(async x=>{
    assert.equal(
      (await x.request(x.token('finance'))).status,403
    );
    assert.equal(x.providerGets(),0);
  });
});

test('ordinary administrator blocked',async()=>{
  await scenario(async x=>{
    assert.equal(
      (await x.request(x.token('ordinary'))).status,403
    );
    assert.equal(x.providerGets(),0);
  });
});

test('inactive administrator blocked',async()=>{
  await scenario(async x=>{
    assert.equal(
      (await x.request(x.token('inactive'))).status,403
    );
    assert.equal(x.providerGets(),0);
  });
});

test('exact balance verified without funding run',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'));

    assert.equal(r.status,200);
    assert.equal(r.body.verified,true);
    assert.equal(r.body.availableMinor,12550);
    assert.equal(r.body.requiredMinor,12550);
    assert.equal(r.body.fundingAuthorised,false);
    assert.equal(r.body.paymentSubmitted,false);
    assert.equal(r.body.accountingFinalised,false);
    assert.equal(r.body.autocabReconciled,false);
    assert.equal(x.providerGets(),1);
  });
});

test('insufficient balance blocked',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'));
    assert.equal(r.status,409);
    assert.equal(r.body.verified,false);
  },{balance:'125.49'});
});

test('wrong account blocked',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'));
    assert.equal(r.status,409);
    assert.equal(r.body.verified,false);
  },{wrongAccount:true});
});

test('provider failure blocked',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'));
    assert.equal(r.status,502);
    assert.equal(r.body.verified,false);
  },{providerError:true});
});

test('production environment blocked',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'));
    assert.equal(r.status,403);
    assert.equal(x.providerGets(),0);
  },{environment:'production'});
});

test('wrong provider blocked before lookup',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'),'wise');
    assert.equal(r.status,409);
    assert.equal(x.providerGets(),0);
  });
});

test('funded run cannot be reverified',async()=>{
  await scenario(async x=>{
    const r=await x.request(x.token('admin'),'done');
    assert.equal(r.status,409);
    assert.equal(x.providerGets(),0);
  });
});
