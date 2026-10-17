import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// Deliberately unexposed to HTTP. Sandbox-only accounting engine, disabled by default.
// Operational authorisation requires a separately reviewed server integration.
const minor = n => {const v=Number(n), p=Math.round(v*100);return Number.isFinite(v)&&Number.isSafeInteger(p)&&p>0&&Math.abs(v*100-p)<1e-6?p:null;};
const get = (db,sql,...args) => db.prepare(sql).get(...args);
const all = (db,sql,...args) => db.prepare(sql).all(...args);
function gate(db) {
  if(process.env.MODULR_ENV!=='sandbox'||process.env.MODULR_ENABLED!=='false'||
    process.env.MODULR_SENT_ACCOUNTING_ENABLED!=='true'||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED!=='false'||
    process.env.AUTOCAB_ADJUSTMENTS_ENABLED!=='false'||
    process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED==='true') throw Error('Modulr sent accounting gate closed');
  if(db.isTransaction) throw Error('Existing transaction prohibited');
  const dbs=all(db,'PRAGMA database_list');
  if(dbs.length!==1||dbs[0].name!=='main') throw Error('Attached databases prohibited');
  if(dbs[0].file!=='') {
    const expected=process.env.MODULR_SENT_ACCOUNTING_FIXTURE_DB;
    const filename=fs.realpathSync(dbs[0].file);
    const base=path.basename(filename);
    if(process.env.MODULR_SENT_ACCOUNTING_FILE_FIXTURE_ENABLED!=='true'||
       !expected||!fs.existsSync(expected)||fs.realpathSync(expected)!==filename||
       path.dirname(filename)!==fs.realpathSync(os.tmpdir())||
       !/^faivopay-modulr-sandbox-fixture-[a-z0-9-]+\.sqlite$/.test(base))
      throw Error('Persistent accounting permitted only for explicit temporary sandbox fixture');
  }
}
export function createModulrSentAccountingSchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS modulr_sent_postings (
    payout_id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL UNIQUE, provider_payment_id TEXT NOT NULL UNIQUE,
    run_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
    ledger_id TEXT NOT NULL UNIQUE, posted_at TEXT NOT NULL,
    reversed_at TEXT, return_id TEXT UNIQUE, reversal_ledger_id TEXT UNIQUE
  );
  CREATE TABLE IF NOT EXISTS modulr_sent_run_closeouts (
    run_id TEXT PRIMARY KEY, closed_at TEXT NOT NULL, payout_count INTEGER NOT NULL, total_minor INTEGER NOT NULL
  );`);
}
function load(db,runId){
 const run=get(db,'SELECT * FROM payout_runs WHERE id=?',runId);
 if(!run||run.provider!=='modulr'||run.status==='cancelled'||!['release_approved','cleared'].includes(run.funding_status)) throw Error('Run or funding ineligible');
 const payouts=all(db,'SELECT * FROM payouts WHERE payout_run_id=?',runId);
 const transfers=all(db,"SELECT * FROM payout_transfer_intents WHERE payout_run_id=? AND provider='modulr'",runId);
 if(!payouts.length||payouts.length!==run.item_count||transfers.length!==payouts.length||
    minor(run.total_amount)!==payouts.reduce((s,p)=>s+(minor(p.net_amount??p.amount)||0),0)) throw Error('Run totals invalid');
 return {run,payouts,transfers};
}
function assertPayment(db,p,t){
 if(!t||t.payout_id!==p.id||t.payout_run_id!==p.payout_run_id||t.status!=='confirmed'||
    t.provider_status!=='PROCESSED'||!t.confirmed_at||t.environment!=='sandbox'||t.currency!=='GBP'||
    !t.provider_transfer_id||t.amount_minor!==minor(p.net_amount??p.amount)) throw Error('Provider payment invalid');
 const confirmations=all(db,"SELECT * FROM modulr_payment_events WHERE transfer_id=? AND event_type='confirmed' AND provider_reference=? AND source='modulr_api'",t.id,t.provider_transfer_id);
 if(confirmations.length!==1) throw Error('Independent provider confirmation missing or repeated');
 const observations=all(db,'SELECT * FROM modulr_debit_evidence WHERE transfer_id=?',t.id);
 if(observations.length!==1||observations[0].provider_payment_id!==t.provider_transfer_id||
    observations[0].amount_minor!==t.amount_minor||observations[0].currency!=='GBP'||
    observations[0].evidence_status!=='debit_observed'||!observations[0].provider_transaction_id||
    !observations[0].source_account_id) throw Error('Debit evidence not verified');
 if(get(db,'SELECT 1 FROM modulr_return_register WHERE transfer_id=? LIMIT 1',t.id)||
    get(db,"SELECT 1 FROM modulr_payment_events WHERE transfer_id=? AND event_type IN ('returned','failed','unknown') LIMIT 1",t.id)) throw Error('Return or unknown payment requires review');
 if(get(db,'SELECT 1 FROM modulr_sent_postings WHERE payout_id=?',p.id)||p.status==='paid'||p.paid_at) throw Error('Already posted');
 if(p.status!=='batched'||!Number.isInteger(p.driver_id)) throw Error('Payout not eligible');
 if(minor(p.fee||0)!==null && Number(p.fee)!==0) throw Error('Fee accounting requires separate approval');
 if(Number(p.fee)!==0 || Number(p.weekly_fee||0)!==0 || Number(p.carried_charges||0)!==0) throw Error('Weekly fee, early fee and carried deductions require reconciled Autocab accounting');
 if(get(db,'SELECT 1 FROM payout_confirmations WHERE payout_id=? LIMIT 1',p.id)) throw Error('Existing confirmation requires review');
 if(get(db,"SELECT 1 FROM driver_ledger WHERE reference_id=? AND entry_type IN ('early_payout','weekly_payout') LIMIT 1",p.id)) throw Error('Existing ledger posting requires review');
}
export function postModulrSentRun(db,runId){
 gate(db); db.exec('BEGIN IMMEDIATE');
 try {
  const {run,payouts,transfers}=load(db,runId);
  if(get(db,'SELECT 1 FROM modulr_sent_run_closeouts WHERE run_id=?',runId)) throw Error('Run already closed');
  const now=new Date().toISOString();
  for(const p of payouts){
   const matches=transfers.filter(t=>t.payout_id===p.id);
   if(matches.length!==1) throw Error('Transfer binding ambiguous');
   const t=matches[0]; assertPayment(db,p,t);
   const ledgerId=crypto.randomUUID(), amount=t.amount_minor/100;
   db.prepare("INSERT INTO driver_ledger(id,driver_id,entry_type,direction,amount,fee_amount,description,reference_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(ledgerId,p.driver_id,p.type==='early'?'early_payout':'weekly_payout','credit',amount,0,'Modulr payment sent',p.id,'paid',now);
   const changed=db.prepare("UPDATE payouts SET status='paid',paid_at=?,updated_at=? WHERE id=? AND status='batched' AND paid_at IS NULL").run(now,now,p.id);
   if(changed.changes!==1) throw Error('Concurrent payout change');
   db.prepare('INSERT INTO modulr_sent_postings(payout_id,transfer_id,provider_payment_id,run_id,amount_minor,ledger_id,posted_at) VALUES(?,?,?,?,?,?,?)')
    .run(p.id,t.id,t.provider_transfer_id,runId,t.amount_minor,ledgerId,now);
  }
  if(new Set(transfers.map(t=>t.provider_transfer_id)).size!==transfers.length) throw Error('Duplicate provider references');
  const changed=db.prepare("UPDATE payout_runs SET status='paid',paid_at=?,reconciled_at=? WHERE id=? AND status!='cancelled' AND paid_at IS NULL").run(now,now,run.id);
  if(changed.changes!==1) throw Error('Run changed during closeout');
  db.prepare('INSERT INTO modulr_sent_run_closeouts(run_id,closed_at,payout_count,total_minor) VALUES(?,?,?,?)').run(runId,now,payouts.length,minor(run.total_amount));
  db.exec('COMMIT');
  return {runId,posted:payouts.length,totalMinor:minor(run.total_amount),status:'sent_via_modulr',autocabWritten:false};
 }catch(e){try{db.exec('ROLLBACK')}catch{} throw e;}
}
export function reverseModulrReturnedPayment(db,transferId,returnId){
 gate(db); db.exec('BEGIN IMMEDIATE');
 try {
  const r=get(db,'SELECT * FROM modulr_return_register WHERE id=? AND transfer_id=?',returnId,transferId);
  const posting=get(db,'SELECT * FROM modulr_sent_postings WHERE transfer_id=?',transferId);
  if(!r||!posting||r.original_payment_id!==posting.provider_payment_id) throw Error('Independently registered return not matched to sent payout');
  if(posting.reversed_at||posting.return_id) throw Error('Payment already reversed');
  const p=get(db,'SELECT * FROM payouts WHERE id=?',posting.payout_id);
  if(!p||p.status!=='paid'||!p.paid_at) throw Error('Original accounting record missing');
  const now=new Date().toISOString(),ledgerId=crypto.randomUUID();
  db.prepare('INSERT INTO driver_ledger(id,driver_id,entry_type,direction,amount,fee_amount,description,reference_id,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(ledgerId,p.driver_id,'modulr_return_reversal','debit',posting.amount_minor/100,0,'Modulr bank return reversal',returnId,'review',now);
  const result=db.prepare('UPDATE modulr_sent_postings SET reversed_at=?,return_id=?,reversal_ledger_id=? WHERE transfer_id=? AND reversed_at IS NULL')
   .run(now,returnId,ledgerId,transferId);
  if(result.changes!==1) throw Error('Concurrent reversal');
  db.exec('COMMIT');
  return {transferId,returnId,reversedMinor:posting.amount_minor,manualReviewRequired:true,retryAuthorised:false,autocabWritten:false};
 }catch(e){try{db.exec('ROLLBACK')}catch{} throw e;}
}
