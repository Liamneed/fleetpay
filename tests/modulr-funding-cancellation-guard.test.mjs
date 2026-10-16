import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('server/index.js','utf8');
const routeName='/api/admin/payout-runs/:id/cancel';
const start=source.indexOf(`app.post('${routeName}'`);
const end=source.indexOf('\n});',start);

assert.ok(start>=0 && end>start,'Cancellation route missing');

const route=source.slice(start,end+4);
const begin=route.indexOf("db.exec('BEGIN IMMEDIATE')");
const locked=route.indexOf('lockedRun=db.prepare');
const commitmentGuard=route.indexOf(
  "lockedRun.provider==='modulr'"
);

test('commitment guard exists inside locked transaction',()=>{
  assert.ok(begin>=0);
  assert.ok(locked>begin);
  assert.ok(commitmentGuard>locked);
  assert.ok(commitmentGuard<route.indexOf(
    "items=db.prepare("
  ));
  assert.match(route.slice(commitmentGuard),
    /balance_verified.*release_approved.*cleared/s);
});

function invoke(fundingStatus,provider='modulr'){
  const routes=new Map();
  let transactions=0;

  const run={
    id:'test-run',
    provider,
    status:'funding_pending',
    funding_status:fundingStatus,
    item_count:0,
    total_amount:100
  };

  const db={
    prepare(){
      return {get:()=>run};
    },
    exec(){
      transactions++;
      throw new Error('STOP: transaction reached');
    }
  };

  const context=vm.createContext({
    app:{post:(path,...handlers)=>{
      routes.set(path,handlers.at(-1));
    }},
    adminAuth:()=>{},
    requireStaffRole:()=>()=>{},
    db,
    audit:()=>{},
    console
  });

  vm.runInContext(route,context);

  const res={
    statusCode:200,
    status(code){this.statusCode=code;return this},
    json(body){this.body=body;return this}
  };

  let error;

  try{
    routes.get(routeName)(
      {
        params:{id:'test-run'},
        body:{reason:'Test cancellation'},
        auth:{email:'test@example.invalid'}
      },
      res
    );
  }catch(e){
    error=e;
  }

  return {res,transactions,error};
}

for(const state of [
  'balance_verified',
  'release_approved',
  'cleared'
]){
  test(`Modulr ${state} blocks cancellation`,()=>{
    const result=invoke(state);

    assert.equal(result.res.statusCode,409);
    assert.match(result.res.body.error,/reconciliation/i);
    assert.equal(result.transactions,0);
    assert.equal(result.error,undefined);
  });
}

test('unverified Modulr run is not prematurely blocked',()=>{
  const result=invoke('awaiting_clearance');

  assert.equal(result.transactions,1);
  assert.match(result.error.message,/transaction reached/);
});

test('non-Modulr run is not blocked by Modulr-specific guard',()=>{
  const result=invoke('balance_verified','wise');

  assert.equal(result.transactions,1);
  assert.match(result.error.message,/transaction reached/);
});
