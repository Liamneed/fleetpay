// Read provider data server-side, then persist a non-authorising debit observation.
// No caller-supplied transaction object is accepted by this operation.
import {lookupModulrOutgoingDebit} from './modulr-debit-lookup.mjs';
import {createModulrDebitEvidenceTable,storeModulrDebitObservation} from './modulr-debit-evidence-store.mjs';
const valid=x=>typeof x==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(x);
export async function observeAuthenticatedModulrDebit({db,transferId,sourceAccountId,apiKey,fetchImpl}={}){
 const blocked=reason=>({ok:false,reason,accountingAuthorised:false,settlementVerified:false,paymentSubmitted:false,retryAuthorised:false});
 if(process.env.MODULR_ENV!=='sandbox'||process.env.MODULR_ENABLED!=='false'||
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED!=='false'||
    process.env.AUTOCAB_ADJUSTMENTS_ENABLED!=='false'||
    process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED==='true'||
    process.env.MODULR_SANDBOX_POST_ENABLED==='true'||
    process.env.MODULR_ONE_POUND_EXECUTION_ENABLED==='true')return blocked('unsafe_environment');
 if(!db||!valid(transferId)||!valid(sourceAccountId)||!apiKey||typeof fetchImpl!=='function')return blocked('invalid_input');
 // No schema creation before authentication / environment checks at the HTTP boundary.
 const intent=db.prepare(`SELECT * FROM payout_transfer_intents WHERE id=? AND provider='modulr' AND environment='sandbox'`).get(transferId);
 if(!intent||!['submitted','unknown','confirmed'].includes(intent.status)||!valid(intent.provider_transfer_id))return blocked('ineligible_transfer');
 const lookup=await lookupModulrOutgoingDebit({intent,sourceAccountId,apiKey,fetchImpl});
 if(lookup.found!==true||lookup.matched!==true||lookup.previewOnly!==true||
    lookup.settlementVerified!==false||lookup.accountingAuthorised!==false||lookup.retryAuthorised!==false)
   return blocked(lookup.reason||'debit_not_verified');
 // A failed or conflicting insert is never converted to an affirmative result.
 createModulrDebitEvidenceTable(db);
 const stored=storeModulrDebitObservation(db,{transferId,lookup,sourceAccountId});
 return {ok:true,transferId,recorded:stored.recorded,alreadyRecorded:stored.alreadyRecorded,
   providerTransactionId:lookup.transaction.id,accountingAuthorised:false,settlementVerified:false,
   paymentSubmitted:false,retryAuthorised:false};
}
