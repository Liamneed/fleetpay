import test from 'node:test';
import assert from 'node:assert/strict';
import {postModulrApplicationSentRun} from '../server/lib/modulr-application-posting.mjs';
test('real-ledger Modulr posting stays disabled by default',()=>{
 const prior=process.env.MODULR_APPLICATION_ACCOUNTING_ENABLED;
 delete process.env.MODULR_APPLICATION_ACCOUNTING_ENABLED;
 try{assert.throws(()=>postModulrApplicationSentRun({exec(){throw Error('DB touched')}},'run_demo'),/disabled/);}
 finally{if(prior===undefined)delete process.env.MODULR_APPLICATION_ACCOUNTING_ENABLED;else process.env.MODULR_APPLICATION_ACCOUNTING_ENABLED=prior;}
});
test('real-ledger posting refuses enabled payment execution',()=>{
 const keys=['MODULR_APPLICATION_ACCOUNTING_ENABLED','MODULR_ENV','MODULR_ENABLED'];
 const old=keys.map(k=>process.env[k]);
 Object.assign(process.env,{MODULR_APPLICATION_ACCOUNTING_ENABLED:'true',MODULR_ENV:'sandbox',MODULR_ENABLED:'true'});
 try{assert.throws(()=>postModulrApplicationSentRun({exec(){throw Error('DB touched')}},'run_demo'),/disabled/);}
 finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);}
});
test('application posting refuses a persistent database even when accounting flags are enabled',()=>{
 const prior={};
 const flags={MODULR_APPLICATION_ACCOUNTING_ENABLED:'true',MODULR_ENV:'sandbox',MODULR_ENABLED:'false',MODULR_SANDBOX_POST_ENABLED:'false',MODULR_ONE_POUND_EXECUTION_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'};
 for(const [k,v] of Object.entries(flags)){prior[k]=process.env[k];process.env[k]=v;}
 try{
  const fake={isTransaction:false,prepare(sql){assert.match(sql,/PRAGMA database_list/);return {all(){return [{name:'main',file:'/tmp/live.sqlite'}];}};},exec(){throw Error('Database mutated');}};
  assert.throws(()=>postModulrApplicationSentRun(fake,'run_demo'),/in-memory sandbox fixture/);
 }finally{for(const k of Object.keys(flags))prior[k]===undefined?delete process.env[k]:process.env[k]=prior[k];}
});
