const originalFetch=globalThis.fetch;

function makeAccount(id,balance=10){
 return {
  driverId:id,
  previousBalance:balance,
  currentBalance:balance,
  allJobsTotal:0
 };
}

function json(data,status=200){
 return new Response(JSON.stringify(data),{
  status,
  headers:{'Content-Type':'application/json'}
 });
}

const mode=String(
 process.env.FAIVOPAY_AUTOCAB_MOCK_MODE||'valid'
);

if(!['valid','duplicate','missing','missing_balance'].includes(mode)){
 throw new Error('Invalid Autocab mock test mode.');
}

let accountRequests=0;

globalThis.fetch=async function(input,options={}){
 const url=String(input);

 if(!url.startsWith('https://autocab-api.azure-api.net/')){
  return originalFetch(input,options);
 }

 const parsed=new URL(url);

 if(parsed.pathname==='/accounts/v1/DriversAccounts'){
  accountRequests++;

  const page=Number(parsed.searchParams.get('pageno'));
  const size=Number(parsed.searchParams.get('pagesize'));

  // STEP171_MISSING_FINANCIAL_BALANCE
  const accounts=Array.from(
   {length:1001},
   (_,i)=>{
    const account=makeAccount(10001+i);

    if(mode==='missing_balance' && i===0){
     delete account.previousBalance;
    }

    return account;
   }
  );

  if(mode==='duplicate' && page===2){
   return json({
    totalSummariesCount:1001,
    summaries:[makeAccount(10001)]
   });
  }

  if(mode==='missing' && page===2){
   return json({
    totalSummariesCount:1001,
    summaries:[]
   });
  }

  const start=(page-1)*size;

  return json({
   totalSummariesCount:accounts.length,
   summaries:accounts.slice(start,start+size)
  });
 }

 if(parsed.pathname==='/driver/v1/drivers/active'){
  return json(
   Array.from({length:1001},(_,i)=>({
    id:10001+i,
    callsign:String(10001+i),
    forename:'Test',
    surname:'Driver',
    fullName:'Test Driver',
    mobile:'',
    email:'',
    active:true,
    suspended:false
   }))
  );
 }

 if(parsed.pathname==='/driver/v1/accounts/driveraccounts/dockets'){
  return json([]);
 }

 throw new Error(
  `Unexpected Autocab test request: ${parsed.pathname}`
 );
};
