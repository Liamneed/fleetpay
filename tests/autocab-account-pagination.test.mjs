import test from 'node:test';
import assert from 'node:assert/strict';

import {
 collectAutocabAccountPages
} from '../server/lib/autocab-account-pagination.mjs';

const account=id=>({driverId:id,previousBalance:10});

const collect=(pages,options={})=>
 collectAutocabAccountPages({
  pageSize:2,
  maxPages:5,
  fetchPage:async({page})=>pages[page-1],
  ...options
 });

test('collects all accounts when totals and pages agree',async()=>{
 const result=await collect([
  {totalSummariesCount:3,summaries:[account(101),account(102)]},
  {totalSummariesCount:3,summaries:[account(103)]}
 ]);

 assert.equal(result.accountCount,3);
 assert.equal(result.totalSummariesCount,3);
 assert.equal(result.pageCount,2);
 assert.equal(result.complete,true);
 assert.equal(result.paginationContractConfirmed,true);
 assert.equal(result.financialVerificationReady,false);
});

test('one partial page can satisfy an explicit total',async()=>{
 const result=await collect([
  {totalSummariesCount:1,summaries:[account(101)]}
 ]);

 assert.equal(result.complete,true);
 assert.equal(result.accountCount,1);
 assert.equal(result.financialVerificationReady,false);
});

test('missing total count fails closed',async()=>{
 await assert.rejects(
  collect([{summaries:[account(101)]}]),
  /invalid totalSummariesCount/
 );
});

test('changed total count fails closed',async()=>{
 await assert.rejects(
  collect([
   {totalSummariesCount:3,summaries:[account(101),account(102)]},
   {totalSummariesCount:4,summaries:[account(103)]}
  ]),
  /changed between pages/
 );
});

test('duplicate driver across pages fails',async()=>{
 await assert.rejects(
  collect([
   {totalSummariesCount:3,summaries:[account(101),account(102)]},
   {totalSummariesCount:3,summaries:[account(102)]}
  ]),
  /Duplicate Autocab driver account/
 );
});

test('missing page fails closed',async()=>{
 await assert.rejects(
  collect([
   {totalSummariesCount:3,summaries:[account(101),account(102)]},
   {totalSummariesCount:3,summaries:[]}
  ]),
  /expected 1/
 );
});

test('unexpected page length fails',async()=>{
 await assert.rejects(
  collect([
   {totalSummariesCount:3,summaries:[account(101)]}
  ]),
  /expected 2/
 );
});

test('invalid driver identity fails closed',async()=>{
 await assert.rejects(
  collect([
   {totalSummariesCount:1,summaries:[{driverId:null}]}
  ]),
  /invalid driver ID/
 );
});

test('page safety limit fails closed',async()=>{
 await assert.rejects(
  collect([
   {totalSummariesCount:3,summaries:[account(101),account(102)]}
  ],{maxPages:1}),
  /page safety limit/
 );
});

test('malformed response fails closed',async()=>{
 await assert.rejects(
  collect([{}]),
  /summaries array/
 );
});

test('invalid pagination configuration fails',async()=>{
 await assert.rejects(
  collect([],{pageSize:1001}),
  /Invalid pagination configuration/
 );
});


// STEP167_IMMUTABLE_FINANCIAL_SOURCE
test('verified account collection is immutable',async()=>{
 const source={
  driverId:101,
  previousBalance:25.50
 };

 const result=await collectAutocabAccountPages({
  fetchPage:async()=>({
   totalSummariesCount:1,
   summaries:[source]
  })
 });

 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.summaries),true);
 assert.equal(Object.isFrozen(result.summaries[0]),true);

 assert.throws(()=>{
  result.summaries[0].previousBalance=999;
 },TypeError);

 assert.equal(result.summaries[0].previousBalance,25.50);
});

test('verified accounts are detached from transport objects',async()=>{
 const source={
  driverId:101,
  previousBalance:25.50
 };

 const result=await collectAutocabAccountPages({
  fetchPage:async()=>({
   totalSummariesCount:1,
   summaries:[source]
  })
 });

 source.previousBalance=999;

 assert.equal(result.summaries[0].previousBalance,25.50);
});
