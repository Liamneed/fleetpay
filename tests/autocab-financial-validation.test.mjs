import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAutocabFinancialSource
} from '../server/lib/autocab-financial-validation.mjs';

const drivers=[
  {id:101,callsign:'101'},
  {id:102,callsign:'102'}
];

const accountsResponse={
  summaries:[
    {driverId:101,previousBalance:0},
    {driverId:102,previousBalance:25.50}
  ]
};

const check=(overrides={})=>
  validateAutocabFinancialSource({
    drivers,
    accountsResponse,
    requiredDriverIds:[101,102],
    ...overrides
  });

test('valid financial source passes',()=>{
  assert.equal(check().valid,true);
});

test('zero balance is valid',()=>{
  assert.equal(check().valid,true);
});

test('missing account response fails',()=>{
  assert.equal(
    check({accountsResponse:{}}).valid,false
  );
});

test('duplicate active driver fails',()=>{
  assert.equal(
    check({drivers:[drivers[0],drivers[0]]}).valid,false
  );
});

test('duplicate driver account fails',()=>{
  assert.equal(
    check({
      accountsResponse:{
        summaries:[
          accountsResponse.summaries[0],
          accountsResponse.summaries[0]
        ]
      }
    }).valid,false
  );
});

test('missing settlement driver fails',()=>{
  assert.equal(
    check({requiredDriverIds:[101,103]}).valid,false
  );
});

test('missing Previous Balance fails',()=>{
  assert.equal(
    check({
      accountsResponse:{
        summaries:[
          {driverId:101},
          accountsResponse.summaries[1]
        ]
      }
    }).valid,false
  );
});

test('nonnumeric Previous Balance fails',()=>{
  assert.equal(
    check({
      accountsResponse:{
        summaries:[
          {driverId:101,previousBalance:'invalid'},
          accountsResponse.summaries[1]
        ]
      }
    }).valid,false
  );
});

test('full page requires pagination confirmation',()=>{
  const result=check({pageSize:2});

  assert.equal(result.valid,false);
  assert.equal(result.paginationUnconfirmed,true);
});

test('empty driver response fails',()=>{
  assert.equal(check({drivers:[]}).valid,false);
});

// STEP122D_COMPLETENESS_TESTS

test('valid records do not prove source completeness',()=>{
  const result=check();

  assert.equal(result.valid,true);
  assert.equal(result.complete,false);
  assert.equal(result.financialVerificationReady,false);
});

test('caller cannot self-certify completeness',()=>{
  const result=check({
    completenessEvidence:{
      complete:true,
      totalRecords:2
    }
  });

  assert.equal(result.complete,false);
  assert.equal(result.financialVerificationReady,false);
});

test('short first page does not prove completeness',()=>{
  const result=check({pageSize:1000});

  assert.equal(result.valid,true);
  assert.equal(result.complete,false);
});


// STEP165_TRUSTED_PAGINATION_EVIDENCE
test('trusted collection permits financial verification',async()=>{
 const {collectAutocabAccountPages}=await import(
  '../server/lib/autocab-account-pagination.mjs'
 );

 const collection=await collectAutocabAccountPages({
  pageSize:2,
  fetchPage:async()=>({
   totalSummariesCount:2,
   summaries:accountsResponse.summaries
  })
 });

 const result=check({
  accountsResponse:collection,
  verifiedCollection:collection,
  pageSize:2
 });

 assert.equal(result.valid,true);
 assert.equal(result.complete,true);
 assert.equal(result.financialVerificationReady,true);
 assert.equal(result.paginationUnconfirmed,false);
});

test('forged pagination evidence cannot certify completeness',()=>{
 const forged={
  ...accountsResponse,
  totalSummariesCount:2,
  complete:true,
  paginationContractConfirmed:true
 };

 const result=check({
  accountsResponse:forged,
  verifiedCollection:forged
 });

 assert.equal(result.complete,false);
 assert.equal(result.financialVerificationReady,false);
});

test('trusted evidence cannot certify unrelated account data',async()=>{
 const {collectAutocabAccountPages}=await import(
  '../server/lib/autocab-account-pagination.mjs'
 );

 const collection=await collectAutocabAccountPages({
  fetchPage:async()=>({
   totalSummariesCount:2,
   summaries:accountsResponse.summaries
  })
 });

 const result=check({
  verifiedCollection:collection,
  accountsResponse
 });

 assert.equal(result.complete,false);
 assert.equal(result.financialVerificationReady,false);
});

test('trusted pagination does not excuse a missing balance',async()=>{
 const {collectAutocabAccountPages}=await import(
  '../server/lib/autocab-account-pagination.mjs'
 );

 const collection=await collectAutocabAccountPages({
  fetchPage:async()=>({
   totalSummariesCount:2,
   summaries:[
    {driverId:101},
    {driverId:102,previousBalance:25.50}
   ]
  })
 });

 const result=check({
  verifiedCollection:collection,
  accountsResponse:collection
 });

 assert.equal(result.complete,true);
 assert.equal(result.valid,false);
 assert.equal(result.financialVerificationReady,false);
});
