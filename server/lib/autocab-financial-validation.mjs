import {
  isVerifiedAutocabAccountCollection
} from './autocab-account-pagination.mjs';

// STEP122B_AUTOCAB_FINANCIAL_VALIDATION
// Pure financial-source validation.
// No database access, network requests or external side effects.

export function validateAutocabFinancialSource({
  drivers,
  accountsResponse,
  requiredDriverIds=[],
  pageSize=1000,
  completenessEvidence=null,
  verifiedCollection=null
}={}){

  const errors=[];

  if(!Array.isArray(drivers)){
    errors.push('Active-driver response is not an array.');
  }

  if(!accountsResponse ||
     !Array.isArray(accountsResponse.summaries)){
    errors.push('Driver-account response has no summaries array.');
  }

  const activeDrivers=Array.isArray(drivers)?drivers:[];
  const accounts=Array.isArray(accountsResponse?.summaries)
    ?accountsResponse.summaries:[];

  if(activeDrivers.length===0){
    errors.push('Active-driver response is empty.');
  }

  if(accounts.length===0){
    errors.push('Driver-account response is empty.');
  }

  const driverIds=new Set();

  for(const driver of activeDrivers){
    const id=Number(driver?.id);

    if(!Number.isSafeInteger(id)||id<=0){
      errors.push('Active-driver response contains an invalid driver ID.');
      continue;
    }

    if(driverIds.has(id)){
      errors.push(`Duplicate active driver ID: ${id}`);
    }

    driverIds.add(id);
  }

  const accountIds=new Set();
  const accountsByDriver=new Map();

  for(const account of accounts){
    const id=Number(account?.driverId);

    if(!Number.isSafeInteger(id)||id<=0){
      errors.push('Driver-account response contains an invalid driver ID.');
      continue;
    }

    if(accountIds.has(id)){
      errors.push(`Duplicate driver-account ID: ${id}`);
    }

    accountIds.add(id);
    accountsByDriver.set(id,account);

    const balance=account.previousBalance;

    if(balance===null ||
       balance===undefined ||
       balance==='' ||
       !Number.isFinite(Number(balance))){
      errors.push(`Invalid Previous Balance for driver ${id}`);
    }
  }

  for(const rawId of requiredDriverIds){
    const id=Number(rawId);

    if(!Number.isSafeInteger(id)||id<=0){
      errors.push('Settlement contains an invalid driver ID.');
      continue;
    }

    if(!driverIds.has(id)){
      errors.push(`Settlement driver ${id} missing from active-driver data.`);
    }

    if(!accountsByDriver.has(id)){
      errors.push(`Settlement driver ${id} has no driver account.`);
    }
  }

  // STEP165_TRUSTED_PAGINATION_EVIDENCE
  // A caller-provided assertion cannot certify an account collection.
  const completenessConfirmed=Boolean(
    isVerifiedAutocabAccountCollection(verifiedCollection) &&
    accountsResponse?.summaries===verifiedCollection.summaries &&
    accounts.length===verifiedCollection.totalSummariesCount
  );

  // Without verified collection provenance, a full page is ambiguous.
  const paginationUnconfirmed=
    !completenessConfirmed && accounts.length>=pageSize;

  if(paginationUnconfirmed){
    errors.push(
      'Driver-account pagination is unconfirmed: first page is full.'
    );
  }

  return {
    valid:errors.length===0,
    complete:completenessConfirmed,
    financialVerificationReady:
      errors.length===0 && completenessConfirmed,
    errors,
    driverCount:activeDrivers.length,
    accountCount:accounts.length,
    requiredDriverCount:requiredDriverIds.length,
    paginationUnconfirmed
  };
}
