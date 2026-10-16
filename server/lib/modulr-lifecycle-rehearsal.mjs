// Isolated, in-memory-only Modulr lifecycle transaction rehearsal.
// NOT provider verification and NOT a production payment finaliser.
import crypto from 'node:crypto';

function assertFixture(db) {
  if (process.env.MODULR_ENV !== 'sandbox' || process.env.MODULR_ENABLED === 'true' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true' ||
      process.env.AUTOCAB_ADJUSTMENTS_ENABLED === 'true' ||
      process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED === 'true') {
    throw new Error('Financial rehearsal safety gate closed');
  }
  const databases = db.prepare('PRAGMA database_list').all();
  if (databases.length !== 1 || databases[0].name !== 'main' || databases[0].file !== '' || db.isTransaction) {
    throw new Error('Requires an isolated, unattached, in-memory SQLite database');
  }
  const allowed = new Set(['rehearsal_runs','rehearsal_payouts','rehearsal_evidence','rehearsal_ledger','rehearsal_returns','sqlite_sequence']);
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  if (names.some(x => !allowed.has(x))) throw new Error('Non-rehearsal database tables present');
}
export function createModulrLifecycleFixture(db) {
  if (process.env.MODULR_ENV !== 'sandbox' || process.env.MODULR_ENABLED === 'true' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true' ||
      process.env.AUTOCAB_ADJUSTMENTS_ENABLED === 'true' ||
      process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED === 'true') throw new Error('Fixture safety gate closed');
  if (db.isTransaction) throw new Error('Transaction active');
  const databases = db.prepare('PRAGMA database_list').all();
  if (databases.length!==1 || databases[0].file!=='' || databases[0].name!=='main') throw new Error('In-memory fixture required');
  if (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'").get().n) throw new Error('Fixture must be empty');
  db.exec(`
    CREATE TABLE rehearsal_runs (id TEXT PRIMARY KEY, total_minor INTEGER NOT NULL CHECK(total_minor>0), item_count INTEGER NOT NULL CHECK(item_count>0), status TEXT NOT NULL DEFAULT 'held');
    CREATE TABLE rehearsal_payouts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES rehearsal_runs(id), driver_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>0), provider_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'batched');
    CREATE TABLE rehearsal_evidence (provider_id TEXT PRIMARY KEY, amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, source_account TEXT NOT NULL, outgoing_debit_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL);
    CREATE TABLE rehearsal_ledger (id TEXT PRIMARY KEY, payout_id TEXT NOT NULL UNIQUE REFERENCES rehearsal_payouts(id), driver_id TEXT NOT NULL, amount_minor INTEGER NOT NULL, type TEXT NOT NULL);
    CREATE TABLE rehearsal_returns (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'manual_review');
  `);
}
export function rehearseModulrRunFinalisation(db, runId) {
  assertFixture(db);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(runId||'')) throw new Error('Invalid run ID');
  db.exec('BEGIN IMMEDIATE');
  try {
    const run = db.prepare('SELECT * FROM rehearsal_runs WHERE id=?').get(runId);
    if (!run || run.status!=='held') throw new Error('Run not held or already finalised');
    const payouts = db.prepare('SELECT * FROM rehearsal_payouts WHERE run_id=? ORDER BY id').all(runId);
    if (payouts.length!==run.item_count || payouts.reduce((s,p)=>s+p.amount_minor,0)!==run.total_minor)
      throw new Error('Run totals mismatch');
    for (const p of payouts) {
      if (p.status!=='batched' || db.prepare('SELECT 1 FROM rehearsal_ledger WHERE payout_id=?').get(p.id))
        throw new Error('Duplicate or invalid accounting');
      const e=db.prepare('SELECT * FROM rehearsal_evidence WHERE provider_id=?').get(p.provider_id);
      if (!e || e.status!=='simulated_debit_verified' || e.amount_minor!==p.amount_minor || e.currency!=='GBP' ||
          !e.outgoing_debit_id || !e.source_account) throw new Error('Missing or mismatched simulated debit evidence');
      if (db.prepare('SELECT 1 FROM rehearsal_returns WHERE provider_id=?').get(p.provider_id))
        throw new Error('Return blocks financial finalisation');
    }
    for (const p of payouts) {
      db.prepare("INSERT INTO rehearsal_ledger(id,payout_id,driver_id,amount_minor,type) VALUES(?,?,?,?, 'payout')")
        .run(crypto.randomUUID(),p.id,p.driver_id,p.amount_minor);
      const updated=db.prepare("UPDATE rehearsal_payouts SET status='paid' WHERE id=? AND status='batched'").run(p.id);
      if (updated.changes!==1) throw new Error('Concurrent payout state change');
    }
    const changed=db.prepare("UPDATE rehearsal_runs SET status='closed' WHERE id=? AND status='held'").run(runId);
    if (changed.changes!==1) throw new Error('Concurrent run state change');
    db.exec('COMMIT');
    return {ok:true,simulationOnly:true,runId,payoutCount:payouts.length,totalMinor:run.total_minor,
      realSettlementVerified:false,productionAccountingAuthorised:false,productionCommitmentReleased:false,autocabWritten:false};
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}
export function rehearseLateModulrReturn(db, providerId, returnId) {
  assertFixture(db);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(providerId||'') || !/^[A-Za-z0-9_-]{1,128}$/.test(returnId||'')) throw new Error('Invalid return reference');
  db.exec('BEGIN IMMEDIATE');
  try {
    const payout=db.prepare('SELECT * FROM rehearsal_payouts WHERE provider_id=?').get(providerId);
    if (!payout) throw new Error('Original payout not found');
    db.prepare('INSERT INTO rehearsal_returns(id, provider_id) VALUES(?,?)').run(returnId,providerId);
    // Never silently reverse paid ledger or regenerate an outbound payment.
    db.exec('COMMIT');
    return {recorded:true,simulationOnly:true,requiresManualReview:true,ledgerUnchanged:true,
      automaticRetryAuthorised:false,autocabWritten:false};
  } catch(e) {try {db.exec('ROLLBACK');}catch{} throw e;}
}
