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
