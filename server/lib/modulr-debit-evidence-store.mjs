// Durable, non-authorising, sandbox-only provider debit observations.
// Accept ONLY the result of an independent read-only provider lookup.
// A matching debit is not proof that the beneficiary received funds.
import crypto from 'node:crypto';

const validId = x => typeof x === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);

export function createModulrDebitEvidenceTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS modulr_debit_evidence (
    id TEXT PRIMARY KEY,
    transfer_id TEXT NOT NULL,
    provider_payment_id TEXT NOT NULL,
    provider_transaction_id TEXT NOT NULL,
    source_account_id TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    currency TEXT NOT NULL CHECK(currency='GBP'),
    transaction_hash TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    evidence_status TEXT NOT NULL DEFAULT 'debit_observed' CHECK(evidence_status='debit_observed'),
    UNIQUE(transfer_id), UNIQUE(source_account_id,provider_transaction_id),
    FOREIGN KEY(transfer_id) REFERENCES payout_transfer_intents(id)
  );`);
}

export function storeModulrDebitObservation(db, {transferId, lookup, sourceAccountId}={}) {
  if(process.env.MODULR_ENV!=='sandbox' || process.env.MODULR_ENABLED!=='false' ||
     process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED!=='false' ||
     process.env.AUTOCAB_ADJUSTMENTS_ENABLED!=='false' ||
     process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED==='true') throw Error('Unsafe environment');
  if(!validId(transferId)||!validId(sourceAccountId)||!lookup ||
     lookup.found!==true||lookup.matched!==true||lookup.settlementVerified!==false||
     lookup.accountingAuthorised!==false||lookup.previewOnly!==true) throw Error('Independent read-only lookup required');
  const t=lookup.transaction;
  if(!t || !validId(t.id)||t.sourceId!==lookup.paymentId||
     t.account?.id!==sourceAccountId||t.credit!==false||t.currency!=='GBP'||
     !Number.isFinite(t.amount)) throw Error('Invalid transaction identity');
  const amountMinor=Math.round(Math.abs(t.amount)*100);
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||
     Math.abs(Math.abs(t.amount)*100-amountMinor)>0.000001) throw Error('Invalid debit amount');
  const transactionHash=crypto.createHash('sha256').update(JSON.stringify({
    id:t.id,sourceId:t.sourceId,accountId:t.account.id,credit:t.credit,currency:t.currency,amount:t.amount
  })).digest('hex');
  db.exec('BEGIN IMMEDIATE');
  try{
    const transfer=db.prepare(`SELECT * FROM payout_transfer_intents WHERE id=? AND provider='modulr' AND environment='sandbox'`).get(transferId);
    if(!transfer || !['submitted','unknown','confirmed'].includes(transfer.status) ||
       transfer.provider_transfer_id!==lookup.paymentId || transfer.amount_minor!==amountMinor || transfer.currency!=='GBP')
      throw Error('Transfer and independent debit differ');
    const existing=db.prepare('SELECT * FROM modulr_debit_evidence WHERE transfer_id=?').get(transferId);
    if(existing){
      if(existing.provider_transaction_id!==t.id||existing.transaction_hash!==transactionHash ||
         existing.source_account_id!==sourceAccountId) throw Error('Conflicting debit observation');
      db.exec('COMMIT');
      return {recorded:false,alreadyRecorded:true,transferId,accountingAuthorised:false,settlementVerified:false};
    }
    db.prepare(`INSERT INTO modulr_debit_evidence(id,transfer_id,provider_payment_id,provider_transaction_id,source_account_id,amount_minor,currency,transaction_hash,observed_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),transferId,lookup.paymentId,t.id,sourceAccountId,amountMinor,'GBP',transactionHash,new Date().toISOString());
    db.exec('COMMIT');
    return {recorded:true,alreadyRecorded:false,transferId,accountingAuthorised:false,settlementVerified:false};
  }catch(err){try{db.exec('ROLLBACK')}catch{} throw err;}
}
export function readModulrDebitObservations(db, transferIds){
  if(!Array.isArray(transferIds)||transferIds.some(id=>!validId(id))) throw Error('Invalid transfer IDs');
  return transferIds.map(id=>db.prepare(`SELECT transfer_id AS transferId,provider_payment_id AS providerPaymentId,
    provider_transaction_id AS providerTransactionId,source_account_id AS sourceAccountId,
    amount_minor AS amountMinor,currency,observed_at AS observedAt,evidence_status AS evidenceStatus
    FROM modulr_debit_evidence WHERE transfer_id=?`).get(id)).filter(Boolean);
}
