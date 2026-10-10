// STEP155_VERIFIED_TOTAL_COUNT_PAGINATION
// Read-only pagination collector with strict count verification.
// No financial writes, database access or direct network access.

// STEP165_TRUSTED_PAGINATION_EVIDENCE
// Provenance is internal to this module, not caller-supplied metadata.
const verifiedCollections=new WeakSet();

export function isVerifiedAutocabAccountCollection(value){
 return Boolean(
  value &&
  typeof value==='object' &&
  verifiedCollections.has(value) &&
  value.complete===true &&
  value.paginationContractConfirmed===true &&
  Number.isSafeInteger(value.totalSummariesCount) &&
  value.totalSummariesCount>0 &&
  Array.isArray(value.summaries) &&
  value.summaries.length===value.totalSummariesCount
 );
}

export async function collectAutocabAccountPages({
 fetchPage,
 pageSize=1000,
 maxPages=10
}={}){
 if(typeof fetchPage!=='function'){
  throw new Error('fetchPage callback is required.');
 }

 if(
  !Number.isSafeInteger(pageSize) ||
  pageSize<1 ||
  pageSize>1000 ||
  !Number.isSafeInteger(maxPages) ||
  maxPages<1 ||
  maxPages>100
 ){
  throw new Error('Invalid pagination configuration.');
 }

 const accounts=[];
 const seen=new Set();
 const pages=[];
 let expectedTotal=null;

 for(let page=1;page<=maxPages;page++){
  const response=await fetchPage({page,pageSize});

  if(!response || !Array.isArray(response.summaries)){
   throw new Error(`Autocab page ${page} has no valid summaries array.`);
  }

  const total=response.totalSummariesCount;

  if(!Number.isSafeInteger(total) || total<=0){
   throw new Error(`Autocab page ${page} has invalid totalSummariesCount.`);
  }

  if(expectedTotal===null){
   expectedTotal=total;
  }else if(total!==expectedTotal){
   throw new Error('Autocab totalSummariesCount changed between pages.');
  }

  const summaries=response.summaries;
  const remaining=expectedTotal-accounts.length;
  const expectedPageCount=Math.min(pageSize,remaining);

  if(
   remaining<=0 ||
   summaries.length!==expectedPageCount
  ){
   throw new Error(
    `Autocab page ${page} returned ${summaries.length} `+
    `accounts; expected ${expectedPageCount}.`
   );
  }

  for(const account of summaries){
   const rawId=account?.driverId;
   const driverId=Number(rawId);

   if(
    rawId===null ||
    rawId===undefined ||
    rawId==='' ||
    typeof rawId==='boolean' ||
    !Number.isSafeInteger(driverId) ||
    driverId<=0
   ){
    throw new Error(`Autocab page ${page} contains invalid driver ID.`);
   }

   if(seen.has(driverId)){
    throw new Error(`Duplicate Autocab driver account ${driverId}.`);
   }

   seen.add(driverId);
   accounts.push(account);
  }

  pages.push({page,count:summaries.length});

  if(accounts.length===expectedTotal){
   // STEP167_IMMUTABLE_FINANCIAL_SOURCE
   // Detach the verified result from mutable transport responses.
   const frozenAccounts=accounts.map(account=>
    Object.freeze(structuredClone(account))
   );

   const frozenPages=pages.map(item=>
    Object.freeze({...item})
   );

   const collection=Object.freeze({
    summaries:Object.freeze(frozenAccounts),
    pages:Object.freeze(frozenPages),
    pageCount:pages.length,
    accountCount:accounts.length,
    totalSummariesCount:expectedTotal,
    complete:true,
    paginationContractConfirmed:true,
    financialVerificationReady:false
   });

   verifiedCollections.add(collection);
   return collection;
  }
 }

 throw new Error(
  'Autocab account pagination reached the page safety limit '+
  'before retrieving all expected accounts.'
 );
}
