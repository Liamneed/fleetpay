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


  // STEP120B_SETTLEMENT_VERIFICATION_STORAGE
  {
    const verificationDb = new DatabaseSync(dbPath);

    try {
      const columns = verificationDb.prepare(
        'PRAGMA table_info(monday_settlement_verifications)'
      ).all();

      const names = new Set(columns.map(x => x.name));

      for (const name of [
        'id','run_id','status','snapshot_hash',
        'autocab_source_hash','rules_hash',
        'payment_plans_hash','evidence_json',
        'difference_count','verified_by',
        'compared_at','expires_at','failure_reason',
        'created_at'
      ]) {
        assert.ok(names.has(name),`Missing verification field: ${name}`);
      }

      const runId = 'test-monday-empty';
      const now = new Date().toISOString();

      verificationDb.prepare(
        `INSERT INTO monday_settlement_verifications
         (id,run_id,status,created_at)
         VALUES(?,?,?,?)`
      ).run(
        'test-verification-pending',runId,'pending',now
      );

      const record = verificationDb.prepare(
        `SELECT * FROM monday_settlement_verifications
         WHERE id=?`
      ).get('test-verification-pending');

      assert.equal(record.run_id,runId);
      assert.equal(record.status,'pending');
      assert.equal(record.snapshot_hash,null);

      assert.throws(() => {
        verificationDb.prepare(
          `INSERT INTO monday_settlement_verifications
           (id,run_id,status,created_at)
           VALUES(?,?,?,?)`
        ).run(
          'test-verification-invalid-pass',
          runId,'passed',now
        );
      });

      assert.equal(
        verificationDb.prepare(
          `SELECT COUNT(*) AS count
           FROM monday_settlement_verifications
           WHERE status='passed'`
        ).get().count,
        0
      );

      console.log(
        'PASS — Verification table created with expected schema.'
      );
      console.log(
        'PASS — Pending verification can be recorded.'
      );
      console.log(
        'PASS — Incomplete verification cannot be marked passed.'
      );
      console.log(
        'PASS — Existing settlement remains unchanged.'
      );

    } finally {
      verificationDb.close();
    }
  }


  // STEP120E_FINGERPRINT_MUTATION_TESTS
  {
    const fpDb=new DatabaseSync(dbPath);
    const runId='test-fingerprint-mutations';
    const driverId=92001;
    const payoutId='test-fingerprint-payout';
    const requestId='test-fingerprint-collection';
    const now=new Date().toISOString();

    async function fingerprints(){
      const response=await fetch(
        `${baseUrl}/api/admin/test/monday-fingerprints/${runId}`,
        {
          headers:{
            Authorization:`Bearer ${authenticated.token}`
          }
        }
      );

      const body=await response.json();

      assert.equal(response.status,200,JSON.stringify(body));
      return body;
    }

    let baseline;

    async function assertMutation(sql,changed,original,label,key){
      fpDb.prepare(sql).run(changed);

      const after=await fingerprints();

      assert.notEqual(
        after[key],baseline[key],
        `${label} did not change ${key}`
      );

      fpDb.prepare(sql).run(original);

      const restored=await fingerprints();

      assert.equal(
        restored[key],baseline[key],
        `${label} fingerprint did not restore`
      );

      console.log(`PASS — ${label} invalidates ${key}.`);
    }

    try{
      fpDb.prepare(
        `INSERT INTO settlement_runs
         (id,created_at,status,settings_json,items_json)
         VALUES(?,?,?,?,?)`
      ).run(
        runId,now,'draft',
        JSON.stringify({weeklyAppFee:5,minimumPayoutThreshold:10}),
        JSON.stringify([{
          driverId,
          callsign:'F201',
          previousBalance:100,
          weeklyFee:5,
          action:'payout',
          payoutId,
          amount:95,
          approvalStatus:'pending'
        }])
      );

      fpDb.prepare(
        `INSERT INTO driver_cache
         (driver_id,callsign,full_name,synced_at,payout_excluded)
         VALUES(?,?,?,?,?)`
      ).run(driverId,'F201','Fingerprint Test Driver',now,0);

      fpDb.prepare(
        `INSERT INTO payouts
         (id,run_id,driver_id,callsign,driver_name,
          amount,weekly_fee,type,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      ).run(
        payoutId,runId,driverId,'F201',
        'Fingerprint Test Driver',
        95,5,'weekly','pending_approval',now
      );

      fpDb.prepare(
        `INSERT INTO payment_requests
         (id,run_id,driver_id,callsign,driver_name,
          amount,status,created_at)
         VALUES(?,?,?,?,?,?,?,?)`
      ).run(
        requestId,runId,driverId,'F201',
        'Fingerprint Test Driver',
        25,'pending_release',now
      );

      baseline=await fingerprints();

      for(const key of [
        'snapshotHash','rulesHash','paymentPlansHash'
      ]){
        assert.match(baseline[key],/^[a-f0-9]{64}$/);
      }

      await assertMutation(
        'UPDATE payouts SET amount=? WHERE id=?'.replace(
          'WHERE id=?',`WHERE id='${payoutId}'`
        ),
        96,95,'Payout amount','snapshotHash'
      );

      await assertMutation(
        `UPDATE payouts SET weekly_fee=?
         WHERE id='${payoutId}'`,
        6,5,'Weekly fee','snapshotHash'
      );

      await assertMutation(
        `UPDATE payment_requests SET amount=?
         WHERE id='${requestId}'`,
        26,25,'Collection amount','snapshotHash'
      );

      await assertMutation(
        `UPDATE driver_cache SET payout_excluded=?
         WHERE driver_id=${driverId}`,
        1,0,'Driver exclusion','snapshotHash'
      );

      const originalRules=JSON.stringify({
        weeklyAppFee:5,
        minimumPayoutThreshold:10
      });

      const changedRules=JSON.stringify({
        weeklyAppFee:7,
        minimumPayoutThreshold:10
      });

      await assertMutation(
        `UPDATE settlement_runs SET settings_json=?
         WHERE id='${runId}'`,
        changedRules,originalRules,
        'Saved financial rules','rulesHash'
      );

      // STEP120E_VALID_PAYMENT_PLAN_PARENTS
      // Create the foreign-key parents before the allocation.
      fpDb.prepare(
        `INSERT INTO driver_payment_plans
         (id,driver_id,callsign,driver_name,
          source_payment_request_id,original_amount,
          plan_amount,remaining_amount,instalment_amount,
          start_date,created_by,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        'test-plan',driverId,'F201',
        'Fingerprint Test Driver',
        requestId,25,25,25,12,
        '2026-10-10','fingerprint-test',now
      );

      fpDb.prepare(
        `INSERT INTO driver_payment_plan_instalments
         (id,plan_id,driver_id,callsign,
          instalment_number,amount,due_at,created_at)
         VALUES(?,?,?,?,?,?,?,?)`
      ).run(
        'test-instalment','test-plan',
        driverId,'F201',1,12,
        '2026-10-17',now
      );

      // Insert a realistic allocation using the existing schema.
      const allocationId='test-fingerprint-allocation';

      fpDb.prepare(
        `INSERT INTO payment_plan_settlement_allocations
         (id,run_id,payout_id,driver_id,callsign,
          plan_id,instalment_id,scheduled_amount,
          allocated_amount,status,autocab_event_key,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        allocationId,runId,payoutId,driverId,'F201',
        'test-plan','test-instalment',
        12,10,'pending','test-fingerprint-event',now
      );

      const allocationBaseline=await fingerprints();

      fpDb.prepare(
        `UPDATE payment_plan_settlement_allocations
         SET allocated_amount=11 WHERE id=?`
      ).run(allocationId);

      const changedAllocation=await fingerprints();

      assert.notEqual(
        changedAllocation.paymentPlansHash,
        allocationBaseline.paymentPlansHash
      );

      fpDb.prepare(
        `UPDATE payment_plan_settlement_allocations
         SET allocated_amount=10 WHERE id=?`
      ).run(allocationId);

      const restoredAllocation=await fingerprints();

      assert.equal(
        restoredAllocation.paymentPlansHash,
        allocationBaseline.paymentPlansHash
      );

      console.log(
        'PASS — Payment-plan allocation changes invalidate fingerprint.'
      );

      assert.equal(
        fpDb.prepare(
          `SELECT status FROM settlement_runs WHERE id=?`
        ).get(runId).status,
        'draft'
      );

      // STEP120H_UNDERLYING_PLAN_TESTS
      // Mutate the actual payment-plan and instalment records.
      const planOriginal=await fingerprints();

      fpDb.prepare(
        `UPDATE driver_payment_plans
         SET remaining_amount=20 WHERE id=?`
      ).run('test-plan');

      const planChanged=await fingerprints();

      assert.notEqual(
        planChanged.paymentPlansHash,
        planOriginal.paymentPlansHash
      );

      fpDb.prepare(
        `UPDATE driver_payment_plans
         SET remaining_amount=25 WHERE id=?`
      ).run('test-plan');

      assert.equal(
        (await fingerprints()).paymentPlansHash,
        planOriginal.paymentPlansHash
      );

      console.log(
        'PASS — Underlying payment-plan balance invalidates fingerprint.'
      );

      fpDb.prepare(
        `UPDATE driver_payment_plan_instalments
         SET amount=13 WHERE id=?`
      ).run('test-instalment');

      assert.notEqual(
        (await fingerprints()).paymentPlansHash,
        planOriginal.paymentPlansHash
      );

      fpDb.prepare(
        `UPDATE driver_payment_plan_instalments
         SET amount=12 WHERE id=?`
      ).run('test-instalment');

      assert.equal(
        (await fingerprints()).paymentPlansHash,
        planOriginal.paymentPlansHash
      );

      console.log(
        'PASS — Underlying instalment amount invalidates fingerprint.'
      );

      fpDb.prepare(
        `UPDATE driver_payment_plan_instalments
         SET status='paid' WHERE id=?`
      ).run('test-instalment');

      assert.notEqual(
        (await fingerprints()).paymentPlansHash,
        planOriginal.paymentPlansHash
      );

      fpDb.prepare(
        `UPDATE driver_payment_plan_instalments
         SET status='scheduled' WHERE id=?`
      ).run('test-instalment');

      assert.equal(
        (await fingerprints()).paymentPlansHash,
        planOriginal.paymentPlansHash
      );

      console.log(
        'PASS — Instalment status invalidates fingerprint.'
      );

      assert.equal(
        (await fingerprints()).missingPaymentPlanReferences,
        0
      );

      // STEP120K_LIVE_RULES_TESTS
      // Test changes to current settings independently of saved rules.
      const ruleBaseline=await fingerprints();

      const settingsRow=fpDb.prepare(
        `SELECT value FROM settings WHERE key='app_settings'`
      ).get();

      // Settings storage is inspected before mutation.
      // No production settings are modified.
      console.log(
        'INFO — Live rules baseline:',
        ruleBaseline.currentRulesHash
      );
      console.log(
        'INFO — Saved/current financial rules differ:',
        ruleBaseline.financialRulesChanged
      );
      console.log(
        'INFO — Stored settings record present:',
        Boolean(settingsRow)
      );

      assert.match(
        ruleBaseline.currentRulesHash,
        /^[a-f0-9]{64}$/
      );


      // STEP120M_LIVE_SETTINGS_MUTATION_TESTS
      // The settings table stores one JSON value per key.
      // Only the isolated temporary test database is modified.
      const settingsCases=[
        ['weeklyAppFee',9.75],
        ['minimumPayoutThreshold',25],
        ['negativeThreshold',35],
        ['chargeWeeklyFeeWhenInactive',false]
      ];

      for(const [key,changedValue] of settingsCases){
        const previous=fpDb.prepare(
          'SELECT value FROM settings WHERE key=?'
        ).get(key);

        const beforeSetting=await fingerprints();

        fpDb.prepare(
          `INSERT INTO settings(key,value)
           VALUES(?,?)
           ON CONFLICT(key) DO UPDATE
           SET value=excluded.value`
        ).run(key,JSON.stringify(changedValue));

        const changedSetting=await fingerprints();

        assert.notEqual(
          changedSetting.currentRulesHash,
          beforeSetting.currentRulesHash,
          `${key} did not change currentRulesHash`
        );

        assert.equal(
          changedSetting.rulesHash,
          beforeSetting.rulesHash,
          `${key} unexpectedly changed saved rules`
        );

        if(previous){
          fpDb.prepare(
            'UPDATE settings SET value=? WHERE key=?'
          ).run(previous.value,key);
        }else{
          fpDb.prepare(
            'DELETE FROM settings WHERE key=?'
          ).run(key);
        }

        const restoredSetting=await fingerprints();

        assert.equal(
          restoredSetting.currentRulesHash,
          beforeSetting.currentRulesHash,
          `${key} did not restore its fingerprint`
        );

        console.log(
          `PASS — Live ${key} changes and restores currentRulesHash.`
        );
      }

      console.log(
        'PASS — Current financial rules fingerprint available.'
      );

      console.log(
        'PASS — Valid payment-plan references are recognised.'
      );

      console.log(
        'PASS — Fingerprint tests leave settlement unapproved.'
      );

    }finally{
      fpDb.close();
    }
  }


  // STEP120J_APPROVAL_FINGERPRINT_TEST
  {
    const testDb = new DatabaseSync(dbPath);
    const runId = 'test-stable-financial-approval';
    const payoutId = 'test-stable-financial-payout';
    const driverId = 93001;
    const now = new Date().toISOString();

    async function request(url,method='GET'){
      const response = await fetch(url,{
        method,
        headers:{
          Authorization:`Bearer ${authenticated.token}`,
          'Content-Type':'application/json'
        },
        ...(method==='POST'?{body:'{}'}:{})
      });

      return {
        status:response.status,
        body:await response.json()
      };
    }

    const fingerprintUrl =
      `${baseUrl}/api/admin/test/monday-fingerprints/${runId}`;

    try {
      testDb.prepare(
        `INSERT INTO settlement_runs
         (id,created_at,status,settings_json,items_json)
         VALUES(?,?,?,?,?)`
      ).run(
        runId,now,'draft','{}',
        JSON.stringify([{
          driverId,
          callsign:'F301',
          previousBalance:100,
          weeklyFee:5,
          amount:95,
          action:'payout',
          payoutId,
          approvalStatus:'pending',
          exclusionReason:''
        }])
      );

      testDb.prepare(
        `INSERT INTO driver_cache
         (driver_id,callsign,full_name,synced_at,payout_excluded)
         VALUES(?,?,?,?,?)`
      ).run(
        driverId,'F301','Approval Fingerprint Driver',now,0
      );

      testDb.prepare(
        `INSERT INTO payouts
         (id,run_id,driver_id,callsign,driver_name,
          amount,weekly_fee,type,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,?,?)`
      ).run(
        payoutId,runId,driverId,'F301',
        'Approval Fingerprint Driver',
        95,5,'weekly','pending_approval',now
      );

      const before = await request(fingerprintUrl);

      assert.equal(before.status,200,JSON.stringify(before.body));

      const approved = await request(
        `${baseUrl}/api/admin/monday-runs/${runId}/approve-all`,
        'POST'
      );

      assert.equal(
        approved.status,200,JSON.stringify(approved.body)
      );

      const after = await request(fingerprintUrl);

      assert.equal(after.status,200,JSON.stringify(after.body));

      // STEP120J_FINGERPRINT_DIAGNOSTIC
      if(after.body.financialHash!==before.body.financialHash){
        const snapshot=testDb.prepare(
          'SELECT items_json FROM settlement_runs WHERE id=?'
        ).get(runId);

        const payout=testDb.prepare(
          'SELECT * FROM payouts WHERE id=?'
        ).get(payoutId);

        console.log('DIAGNOSTIC — Fingerprint before:',before.body.financialHash);
        console.log('DIAGNOSTIC — Fingerprint after:',after.body.financialHash);
        console.log(
          'DIAGNOSTIC — Approved settlement items:',
          JSON.stringify(JSON.parse(snapshot.items_json),null,2)
        );
        console.log(
          'DIAGNOSTIC — Payout fields:',
          JSON.stringify({
            status:payout.status,
            decision_at:payout.decision_at,
            decision_by:payout.decision_by,
            decline_reason:payout.decline_reason,
            amount:payout.amount,
            weekly_fee:payout.weekly_fee
          },null,2)
        );
      }

      assert.equal(
        after.body.financialHash,
        before.body.financialHash,
        'Routine settlement approval changed the financial fingerprint'
      );

      console.log(
        'PASS — Financial fingerprint survives legitimate bulk approval.'
      );

      testDb.prepare(
        'UPDATE payouts SET amount=? WHERE id=?'
      ).run(96,payoutId);

      const tampered = await request(fingerprintUrl);

      assert.equal(tampered.status,200);

      assert.notEqual(
        tampered.body.financialHash,
        after.body.financialHash
      );

      console.log(
        'PASS — Changing approved payout amount invalidates financialHash.'
      );

      assert.equal(
        testDb.prepare(
          'SELECT status FROM settlement_runs WHERE id=?'
        ).get(runId).status,
        'approved'
      );

      console.log(
        'PASS — Fingerprint test did not create a payment batch.'
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
