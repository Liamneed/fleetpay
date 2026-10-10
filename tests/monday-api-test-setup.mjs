import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const tempDir = mkdtempSync(join(tmpdir(), 'faivopay-api-test-'));
const dbPath = join(tempDir, 'test.sqlite');

const port = 38000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;

const env = {
  PATH: process.env.PATH,
  HOME: tempDir,

  NODE_ENV: 'test',
  PORT: String(port),
  DATA_DIR: tempDir,
  DB_PATH: dbPath,
  DOTENV_CONFIG_PATH: join(tempDir, 'nonexistent.env'),

  PORTAL_TOKEN_SECRET: randomBytes(32).toString('hex'),

  BACKGROUND_JOBS_DISABLED: 'true',
  WEEKLY_INVOICE_SCHEDULER_ENABLED: 'false',

  AUTOCAB_ADJUSTMENTS_ENABLED: 'false',
  LIVE_TEST_AUTOCAB_WRITES_ENABLED: 'false',

  AUTOCAB_API_KEY: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET: '',
  WISE_API_TOKEN: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_MESSAGING_SERVICE_SID: '',
  TWILIO_FROM_NUMBER: '',

  ADMIN_EMAIL: 'api-test-admin@example.invalid',
  ADMIN_PASSWORD: randomBytes(24).toString('hex')
};

const child = spawn(
  process.execPath,
  [
    '--require',
    join(process.cwd(), 'tests/block-external-network.cjs'),
    join(process.cwd(), 'server/index.js')
  ],
  {
    cwd: tempDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  }
);

let stderr = '';

child.stderr.on('data', chunk => {
  stderr += chunk.toString();
});

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited: ${stderr}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);

      if (response.ok) return;
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  throw new Error(`Test server failed to start: ${stderr}`);
}

try {
  await waitForServer();

  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD
    })
  });

  const login = await response.json();

  assert.equal(response.status, 200);
  assert.equal(login.mfaSetupRequired, true);
  assert.ok(login.setupToken);
  assert.ok(login.secret);


  // Generate the genuine TOTP code for the test-only MFA secret.
  const { createHmac } = await import('node:crypto');
  const { DatabaseSync } = await import('node:sqlite');

  function totp(secret) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0;
    const bytes = [];

    for (const char of secret.toUpperCase()) {
      const index = alphabet.indexOf(char);
      if (index < 0) continue;
      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }

    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));

    const hash = createHmac('sha1', Buffer.from(bytes))
      .update(counter)
      .digest();

    const offset = hash[hash.length - 1] & 15;
    return String(
      (hash.readUInt32BE(offset) & 0x7fffffff) % 1000000
    ).padStart(6, '0');
  }

  const mfaResponse = await fetch(
    `${baseUrl}/api/admin/mfa/enable`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        setupToken: login.setupToken,
        code: totp(login.secret)
      })
    }
  );

  assert.equal(mfaResponse.status, 200);
  const authenticated = await mfaResponse.json();
  assert.ok(authenticated.token);

  const db = new DatabaseSync(dbPath);

  // Fixture uses the actual settlement_runs table.
  const id = 'test-monday-empty';
  const columns = db.prepare(
    'PRAGMA table_info(settlement_runs)'
  ).all();

  const required = columns
    .filter(c => c.notnull && c.dflt_value === null && !c.pk)
    .map(c => c.name);

  const supported = [
    'created_at',
    'status',
    'settings_json',
    'items_json'
  ];

  const unsupported = required.filter(
    c => !supported.includes(c)
  );

  if (unsupported.length) {
    throw new Error(
      'Unrecognised required settlement columns: ' +
      unsupported.join(', ')
    );
  }

  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO settlement_runs
     (id,created_at,status,settings_json,items_json)
     VALUES(?,?,?,?,?)`
  ).run(
    id,
    now,
    'draft',
    '{}',
    '[]'
  );

  db.close();

  async function approve() {
    const response = await fetch(
      `${baseUrl}/api/admin/monday-runs/${id}/approve-all`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authenticated.token}`,
          'Content-Type': 'application/json'
        },
        body: '{}'
      }
    );

    return {
      status: response.status,
      body: await response.json()
    };
  }

  const first = await approve();
  assert.equal(first.status,200,JSON.stringify(first.body));
  assert.equal(first.body.ok,true);

  const second = await approve();
  assert.equal(second.status,409);


  // STEP100_REAL_PAYOUT_APPROVAL_TEST
  {
    const testDb = new DatabaseSync(dbPath);
    const runId = 'test-monday-exclusions';

    try {
      const now = new Date().toISOString();

      testDb.prepare(
        `INSERT INTO settlement_runs
         (id,created_at,status,settings_json,items_json)
         VALUES(?,?,?,?,?)`
      ).run(
        runId,now,'draft','{}',
        JSON.stringify([
          {payoutId:'test-eligible',approvalStatus:'pending'},
          {payoutId:'test-excluded',approvalStatus:'pending'}
        ])
      );

      const insertDriver = testDb.prepare(
        `INSERT INTO driver_cache
         (driver_id,callsign,full_name,synced_at,payout_excluded)
         VALUES(?,?,?,?,?)`
      );

      insertDriver.run(
        90101,'T101','Eligible Test Driver',now,0
      );

      insertDriver.run(
        90102,'T102','Excluded Test Driver',now,1
      );

      const insertPayout = testDb.prepare(
        `INSERT INTO payouts
         (id,run_id,driver_id,callsign,driver_name,
          amount,type,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`
      );

      insertPayout.run(
        'test-eligible',runId,90101,'T101',
        'Eligible Test Driver',100,
        'weekly','pending_approval',now
      );

      insertPayout.run(
        'test-excluded',runId,90102,'T102',
        'Excluded Test Driver',200,
        'weekly','pending_approval',now
      );

      async function approveTestRun() {
        const response = await fetch(
          `${baseUrl}/api/admin/monday-runs/${runId}/approve-all`,
          {
            method:'POST',
            headers:{
              Authorization:`Bearer ${authenticated.token}`,
              'Content-Type':'application/json'
            },
            body:'{}'
          }
        );

        return {
          status:response.status,
          body:await response.json()
        };
      }

      const rejected = await approveTestRun();

      assert.equal(
        rejected.status,409,
        JSON.stringify(rejected.body)
      );

      assert.match(
        rejected.body.error,
        /exclusion/i
      );

      const payoutStatus = id =>
        testDb.prepare(
          'SELECT status FROM payouts WHERE id=?'
        ).get(id).status;

      const settlementStatus = () =>
        testDb.prepare(
          'SELECT status FROM settlement_runs WHERE id=?'
        ).get(runId).status;

      assert.equal(
        payoutStatus('test-eligible'),
        'pending_approval'
      );

      assert.equal(
        payoutStatus('test-excluded'),
        'pending_approval'
      );

      assert.equal(settlementStatus(),'draft');

      console.log(
        'PASS — Excluded driver blocked bulk approval.'
      );
      console.log(
        'PASS — Approval failure left both payouts unchanged.'
      );

      // Resolve the excluded payout explicitly.
      const exclusion = await fetch(
        `${baseUrl}/api/admin/monday-runs/${runId}/payouts/test-excluded`,
        {
          method:'PATCH',
          headers:{
            Authorization:`Bearer ${authenticated.token}`,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            status:'excluded',
            reason:'Permanent payout exclusion'
          })
        }
      );

      const exclusionResult = await exclusion.json();

      assert.equal(
        exclusion.status,200,
        JSON.stringify(exclusionResult)
      );

      assert.equal(
        payoutStatus('test-excluded'),
        'declined'
      );

      const approved = await approveTestRun();

      assert.equal(
        approved.status,200,
        JSON.stringify(approved.body)
      );

      assert.equal(
        payoutStatus('test-eligible'),
        'approved'
      );

      assert.equal(
        payoutStatus('test-excluded'),
        'declined'
      );

      assert.equal(
        settlementStatus(),
        'approved'
      );

      const batchCount = testDb.prepare(
        'SELECT COUNT(*) AS count FROM payout_runs'
      ).get().count;

      assert.equal(batchCount,0);

      const ledgerCount = testDb.prepare(
        'SELECT COUNT(*) AS count FROM driver_ledger'
      ).get().count;

      assert.equal(ledgerCount,0);

      console.log(
        'PASS — Eligible driver approved after exclusion resolved.'
      );
      console.log(
        'PASS — Excluded driver remained excluded.'
      );
      console.log(
        'PASS — Settlement formally approved.'
      );
      console.log(
        'PASS — No payment batch or driver ledger entries created.'
      );
    } finally {
      testDb.close();
    }
  }


  // STEP101_OVERRIDE_ENDPOINT_TEST
  {
    const testDb=new DatabaseSync(dbPath);
    const runId='test-monday-override';
    const payoutId='test-override-payout';
    const driverId=90201;
    const now=new Date().toISOString();

    try{
      testDb.prepare(
        `INSERT INTO settlement_runs
         (id,created_at,status,settings_json,items_json)
         VALUES(?,?,?,?,?)`
      ).run(
        runId,now,'draft','{}',
        JSON.stringify([
          {payoutId,approvalStatus:'excluded'}
        ])
      );

      testDb.prepare(
        `INSERT INTO driver_cache
         (driver_id,callsign,full_name,synced_at,
          payout_excluded,payout_exclusion_reason)
         VALUES(?,?,?,?,?,?)`
      ).run(
        driverId,'T201','Override Test Driver',
        now,1,'Permanent exclusion test'
      );

      testDb.prepare(
        `INSERT INTO payouts
         (id,run_id,driver_id,callsign,driver_name,
          amount,type,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`
      ).run(
        payoutId,runId,driverId,'T201',
        'Override Test Driver',150,
        'weekly','declined',now
      );

      const endpoint=
        `${baseUrl}/api/admin/monday-runs/${runId}`+
        `/payouts/${payoutId}/override-exclusion`;

      async function request(url,method,body,token){
        const response=await fetch(url,{
          method,
          headers:{
            Authorization:`Bearer ${token}`,
            'Content-Type':'application/json'
          },
          body:JSON.stringify(body)
        });

        return {
          status:response.status,
          body:await response.json()
        };
      }

      // A genuine Finance user is created in the isolated database.
      const {scryptSync,randomBytes}=await import('node:crypto');

      const financeSalt=randomBytes(16).toString('hex');
      const financePassword='TestFinanceOnly123!';
      const financeHash=scryptSync(
        financePassword,financeSalt,64
      ).toString('hex');

      const financeId='test-finance-user';
      const financeEmail='finance-test@example.invalid';

      testDb.prepare(
        `INSERT INTO staff_users
         (id,email,name,role,password_hash,password_salt,
          mfa_enabled,active,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      ).run(
        financeId,financeEmail,'Test Finance',
        'finance',financeHash,financeSalt,
        0,1,now,now
      );

      const financeLogin=await request(
        `${baseUrl}/api/admin/login`,
        'POST',
        {
          email:financeEmail,
          password:financePassword
        },
        ''
      );

      assert.equal(financeLogin.status,200);
      assert.equal(financeLogin.body.mfaSetupRequired,true);

      const financeMfa=await request(
        `${baseUrl}/api/admin/mfa/enable`,
        'POST',
        {
          setupToken:financeLogin.body.setupToken,
          code:totp(financeLogin.body.secret)
        },
        ''
      );

      assert.equal(financeMfa.status,200);
      assert.ok(financeMfa.body.token);

      const denied=await request(
        endpoint,'POST',
        {reason:'Finance must not override permanent exclusions'},
        financeMfa.body.token
      );

      assert.equal(denied.status,403);

      console.log(
        'PASS — Finance user denied exclusion override.'
      );

      const allowed=await request(
        endpoint,'POST',
        {reason:'Approved exceptional payment for this run'},
        authenticated.token
      );

      assert.equal(
        allowed.status,200,
        JSON.stringify(allowed.body)
      );

      const payout=testDb.prepare(
        'SELECT status FROM payouts WHERE id=?'
      ).get(payoutId);

      assert.equal(payout.status,'approved');

      const snapshot=testDb.prepare(
        'SELECT items_json FROM settlement_runs WHERE id=?'
      ).get(runId);

      const items=JSON.parse(snapshot.items_json);

      assert.equal(
        items[0].oneRunExclusionOverride.approved,
        true
      );

      assert.equal(
        items[0].oneRunExclusionOverride.driverId,
        driverId
      );

      assert.equal(
        items[0].oneRunExclusionOverride.runId,
        runId
      );

      console.log(
        'PASS — Administrator override approved correct payout.'
      );
      console.log(
        'PASS — Override recorded against correct driver and run.'
      );

      const approval=await request(
        `${baseUrl}/api/admin/monday-runs/${runId}/approve-all`,
        'POST',{},authenticated.token
      );

      assert.equal(
        approval.status,200,
        JSON.stringify(approval.body)
      );

      const changeAfterApproval=await request(
        `${baseUrl}/api/admin/monday-runs/${runId}/payouts/${payoutId}`,
        'PATCH',
        {
          status:'excluded',
          reason:'Attempted change after final approval'
        },
        authenticated.token
      );

      assert.equal(changeAfterApproval.status,409);

      assert.equal(
        testDb.prepare(
          'SELECT status FROM payouts WHERE id=?'
        ).get(payoutId).status,
        'approved'
      );

      console.log(
        'PASS — Approved settlement rejects later payout edits.'
      );

    }finally{
      testDb.close();
    }
  }


  // STEP118B_BATCH_INTEGRITY_API_TESTS
  // Genuine Express requests against isolated SQLite fixtures.
  // No payment-provider or Autocab credentials are configured.
  {
    const testDb = new DatabaseSync(dbPath);
    const now = new Date().toISOString();

    async function createBatch(runId) {
      const response = await fetch(
        `${baseUrl}/api/admin/monday-runs/${runId}/create-payout-run`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authenticated.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({provider:'test-only'})
        }
      );
      return {
        status:response.status,
        body:await response.json()
      };
    }

    function fixture(name, options={}) {
      const runId=`test-batch-integrity-${name}`;
      const payoutId=`test-batch-payout-${name}`;
      const driverId=91000+(
        {valid:1,mismatch:2,missing:3,duplicate:4}[name]
      );
      const callsign=`B${driverId}`;

      const item={
        payoutId,
        driverId,
        callsign,
        action:'payout',
        amount:100,
        approvalStatus:'approved'
      };

      const items=options.missing
        ? []
        :options.duplicate
          ? [item,{...item}]
          :[item];

      testDb.prepare(
        `INSERT INTO settlement_runs
         (id,created_at,status,settings_json,items_json)
         VALUES(?,?,?,?,?)`
      ).run(
        runId,now,'approved','{}',JSON.stringify(items)
      );

      testDb.prepare(
        `INSERT INTO payouts
         (id,run_id,driver_id,callsign,driver_name,
          amount,type,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`
      ).run(
        payoutId,runId,driverId,callsign,
        'Integrity Test Driver',
        options.mismatch?125:100,
        'weekly','approved',now
      );

      return {runId,payoutId};
    }

    function state(runId,payoutId) {
      const settlement=testDb.prepare(
        `SELECT status,payout_run_id
         FROM settlement_runs WHERE id=?`
      ).get(runId);

      const payout=testDb.prepare(
        `SELECT status,payout_run_id,amount
         FROM payouts WHERE id=?`
      ).get(payoutId);

      const batches=testDb.prepare(
        `SELECT COUNT(*) AS count
         FROM payout_runs
         WHERE notes=?`
      ).get(`Monday run ${runId}`).count;

      return {settlement,payout,batches};
    }

    try {
      // Control: an intact approved settlement may be batched.
      const valid=fixture('valid');
      const validResult=await createBatch(valid.runId);

      assert.equal(
        validResult.status,200,
        JSON.stringify(validResult.body)
      );

      const validState=state(valid.runId,valid.payoutId);

      assert.equal(validState.settlement.status,'batched');
      assert.equal(validState.payout.status,'batched');
      assert.ok(validState.settlement.payout_run_id);
      assert.equal(validState.batches,1);

      console.log(
        'PASS — Matching approved snapshot creates one test batch.'
      );

      // Tampered payout: database value no longer matches
      // the amount approved in the saved settlement.
      const mismatch=fixture('mismatch',{mismatch:true});
      const mismatchBefore=state(
        mismatch.runId,mismatch.payoutId
      );
      const mismatchResult=await createBatch(mismatch.runId);

      assert.equal(
        mismatchResult.status,409,
        JSON.stringify(mismatchResult.body)
      );
      assert.match(
        mismatchResult.body.error,
        /integrity|mismatch/i
      );

      assert.deepEqual(
        state(mismatch.runId,mismatch.payoutId),
        mismatchBefore
      );

      console.log(
        'PASS — Tampered payout amount rejected without DB changes.'
      );

      // A database-approved payout is not present in the
      // settlement snapshot.
      const missing=fixture('missing',{missing:true});
      const missingBefore=state(missing.runId,missing.payoutId);
      const missingResult=await createBatch(missing.runId);

      assert.equal(
        missingResult.status,409,
        JSON.stringify(missingResult.body)
      );
      assert.match(
        missingResult.body.error,
        /integrity|count|missing/i
      );
      assert.deepEqual(
        state(missing.runId,missing.payoutId),
        missingBefore
      );

      console.log(
        'PASS — Missing approved snapshot item blocks batching.'
      );

      // A duplicate reference must not be accepted.
      const duplicate=fixture(
        'duplicate',{duplicate:true}
      );
      const duplicateBefore=state(
        duplicate.runId,duplicate.payoutId
      );
      const duplicateResult=await createBatch(
        duplicate.runId
      );

      assert.equal(
        duplicateResult.status,409,
        JSON.stringify(duplicateResult.body)
      );
      assert.match(
        duplicateResult.body.error,
        /duplicate|integrity/i
      );
      assert.deepEqual(
        state(duplicate.runId,duplicate.payoutId),
        duplicateBefore
      );

      console.log(
        'PASS — Duplicate payout reference blocks batching.'
      );

      // None of the test cases should create ledger entries.
      const ledger=testDb.prepare(
        `SELECT COUNT(*) AS count FROM driver_ledger
         WHERE driver_id BETWEEN 91001 AND 91004`
      ).get().count;

      assert.equal(ledger,0);

      console.log(
        'PASS — Batch integrity tests created no driver ledger entries.'
      );

    } finally {
      testDb.close();
    }
  }

  console.log('PASS — Genuine test MFA completed.');
  console.log('PASS — Actual Express approval endpoint accepted a draft.');
  console.log('PASS — Approved settlement rejected repeat approval.');

  console.log('PASS — Isolated server started.');
  console.log('PASS — Temporary SQLite database created.');
  console.log('PASS — Genuine office password authentication succeeded.');
  console.log('PASS — MFA setup required.');
  console.log('PASS — External payment credentials not supplied.');
  console.log('PASS — No production database used.');

} finally {
  child.kill('SIGTERM');

  await new Promise(resolve => {
    if (child.exitCode !== null) return resolve();

    child.once('exit', resolve);

    setTimeout(resolve, 3000);
  });

  rmSync(tempDir, {recursive:true, force:true});
}
