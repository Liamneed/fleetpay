// Local accounting only. Requires independently reviewed return evidence.
// Never sends payouts, retries transfers, or writes to Autocab.
import {randomUUID} from 'node:crypto';
import {assertModulrSandboxAccountingDatabase} from './modulr-sandbox-accounting-database.mjs';
const minor=v=>{const n=Number(v),c=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(c)||c<=0||Math.abs(n*100-c)>1e-6)throw Error('Invalid amount');return c;};
function gate(){
 for(const [key,want] of Object.entries({MODULR_APPLICATION_ACCOUNTING_ENABLED:'true',MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'}))
  if(process.env[key]!==want)throw Error('Modulr return accounting disabled or unsafe environment');
}
// Explicit operator-reviewed evidence, independent of a signed webhook or return register row.
// The caller must create a separate verified review before invoking this function.
export function createModulrApplicationReturnReviewSchema(db){
 db.exec(`CREATE TABLE IF NOT EXISTS modulr_application_return_reviews (
  return_payment_id TEXT PRIMARY KEY, transfer_id TEXT NOT NULL,
  verified_by TEXT NOT NULL, verified_at TEXT NOT NULL,
  independent_reference TEXT NOT NULL UNIQUE,
  original_amount_minor INTEGER NOT NULL CHECK(original_amount_minor>0),
  evidence_source TEXT NOT NULL CHECK(evidence_source IN ('authenticated_provider_api','bank_statement')),
  CHECK(length(verified_by)>0 AND length(independent_reference)>0)
 );
 CREATE TABLE IF NOT EXISTS modulr_application_return_reversals (
  return_payment_id TEXT PRIMARY KEY, payout_id TEXT NOT NULL UNIQUE,
  ledger_id TEXT NOT NULL UNIQUE, posted_at TEXT NOT NULL
 );`);
}
export function reverseModulrApplicationReturn(db,returnPaymentId){
 gate();
 if(typeof returnPaymentId!=='string'||!/^[\w-]{1,128}$/.test(returnPaymentId))throw Error('Invalid return identity');
 assertModulrSandboxAccountingDatabase(db);
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const name of ['modulr_return_register','modulr_application_return_reviews','modulr_application_return_reversals','payout_transfer_intents','payouts','driver_ledger'])
   if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('Missing return accounting table: '+name);
  const r=db.prepare('SELECT * FROM modulr_return_register WHERE return_payment_id=?').get(returnPaymentId);
  const e=db.prepare('SELECT * FROM modulr_application_return_reviews WHERE return_payment_id=?').get(returnPaymentId);
  if(!r||!e||r.transfer_id!==e.transfer_id||!e.verified_by||!e.verified_at||!e.independent_reference)
   throw Error('Independently reviewed return evidence required');
  if(r.currency!=='GBP'||r.provider_status!=='RETURNED'||r.status!=='manual_review'||
     minor(r.return_amount_minor/100)!==e.original_amount_minor)throw Error('Return evidence inconsistent');
  const t=db.prepare("SELECT * FROM payout_transfer_intents WHERE id=? AND provider='modulr' AND environment='sandbox'").get(r.transfer_id);
  if(!t||t.provider_transfer_id!==r.original_payment_id||t.amount_minor!==e.original_amount_minor)
   throw Error('Return does not match original transfer');
  const p=db.prepare('SELECT * FROM payouts WHERE id=?').get(t.payout_id);
  if(db.prepare('SELECT 1 FROM modulr_application_return_reversals WHERE return_payment_id=? OR payout_id=?').get(returnPaymentId,t.payout_id))throw Error('Return already reversed');
  // A provider PROCESSED/SENT transfer is not evidence of beneficiary credit.
  // Independently verified returns must be reversible without ever marking it PAID.
  if(!p||!['sent','paid'].includes(p.status)||
     (p.status==='sent' && p.paid_at)||
     (p.status==='paid' && !p.paid_at)||
     minor(p.net_amount??p.amount)!==t.amount_minor)throw Error('Original payout is not eligible for return reversal');
  const type=p.type==='weekly'?'weekly_payout':p.type==='early'?'early_payout':null;
  if(!type)throw Error('Unsupported payout type');
  const sent=db.prepare("SELECT * FROM driver_ledger WHERE reference_id=? AND entry_type=? AND direction='credit' AND status='sent'").all(p.id,type);
  if(sent.length!==1||sent[0].driver_id!==p.driver_id||minor(sent[0].amount)!==t.amount_minor)throw Error('Unique matching sent ledger entry required');
  if(db.prepare("SELECT 1 FROM driver_ledger WHERE reference_id=? AND entry_type='modulr_return_reversal'").get(returnPaymentId))throw Error('Existing return ledger entry');
  const ledgerId=`modulr_return_${randomUUID()}`,now=new Date().toISOString();
  db.prepare(`INSERT INTO driver_ledger(id,driver_id,entry_type,direction,amount,fee_amount,description,reference_id,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(ledgerId,p.driver_id,'modulr_return_reversal','debit',t.amount_minor/100,0,'Modulr returned SENT payout - investigation required',returnPaymentId,'review',now);
  db.prepare('INSERT INTO modulr_application_return_reversals VALUES(?,?,?,?)').run(returnPaymentId,p.id,ledgerId,now);
  const updated=db.prepare("UPDATE payouts SET status='returned' WHERE id=? AND status=?").run(p.id,p.status);
  if(updated.changes!==1)throw Error('Original payout changed during return reversal');
  db.exec('COMMIT');
  return {payoutId:p.id,returnPaymentId,amountMinor:t.amount_minor,manualReviewRequired:true,automaticRetry:false,autocabAdjusted:false};
 }catch(error){try{db.exec('ROLLBACK')}catch{}throw error;}
}
