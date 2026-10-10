import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('server/index.js','utf8');
const routes=new Map();
let state,writes,audits;

const context=vm.createContext({
 app:{post:(route,...handlers)=>routes.set(route,handlers.at(-1))},
 adminAuth:()=>{},
 requireStaffRole:()=>()=>{},
 readDemoState:()=>state,
 writeDemoState:value=>{state=value;writes++},
 demoStamp:()=>new Date().toISOString(),
 audit:(...args)=>audits.push(args),
 demoFunding:()=>{},
 demoPending:()=>[],
 demoApproved:()=>[],
 demoCanReconcile:()=>false,
 demoPaidItem:()=>{},
 demoRunId:()=> 'test',
 money:v=>`£${v}`,
 console
});

const names=[
 '/api/admin/demo/:kind/cancel',
 ...['monday','early'].flatMap(k=>
  ['sync','approve-all','freeze','top-up','fund',
   'release','refresh-status','retry-failed','reconcile']
  .map(a=>`/api/admin/demo/${k}/${a}`)
 ),
 '/api/admin/demo/monday/confirm-rentsheets',
 '/api/admin/demo/monday/:id'
];

for(const route of names){
 const start=source.indexOf(`app.post('${route}'`);
 assert.ok(start>=0,`Missing actual route: ${route}`);

 const end=route==='/api/admin/demo/:kind/cancel'
  ?source.indexOf('\n});',start)+4
  :source.indexOf('\n',start);

 assert.ok(end>start,`Invalid route boundary: ${route}`);

 const code=source.slice(start,end).trim();
 assert.ok(code.endsWith(');'),`Incomplete route: ${route}`);

 vm.runInContext(code,context,{
  filename:route,
  timeout:1000
 });
}

function reset(kind,stage){
 state={
  monday:{
   stage:'review',status:'review',locked:false,
   items:[],wiseBalance:200,fundingRequired:100
  },
  early:{
   stage:'review',status:'review',locked:false,
   items:[],wiseBalance:200,fundingRequired:100
  }
 };
 state[kind].stage=stage;
 state[kind].status=stage;
 writes=0;
 audits=[];
}

function call(route,body={},params={}){
 const handler=routes.get(route);
 assert.ok(handler,`Missing handler: ${route}`);

 const response={
  code:200,
  status(code){this.code=code;return this},
  json(data){this.body=data;return this}
 };

 handler({
  body,params,
  auth:{email:'test@example.invalid'}
 },response);

 return response;
}

function cancel(kind,reason='Operator cancellation test'){
 return call('/api/admin/demo/:kind/cancel',{reason},{kind});
}

for(const kind of ['monday','early']){
 const stages=kind==='monday'
  ?['rentsheets','sync','review','funding','funding_wait','funded']
  :['balance','review','funding','funding_wait','funded'];

 for(const stage of stages){
  test(`${kind}: cancellation permitted at ${stage}`,()=>{
   reset(kind,stage);

   const other=kind==='monday'?'early':'monday';
   const original=structuredClone(state[other]);

   assert.equal(cancel(kind).code,200);
   assert.equal(state[kind].stage,'cancelled');
   assert.equal(state[kind].status,'cancelled');
   assert.equal(state[kind].locked,true);
   assert.equal(state[kind].cancelReason,'Operator cancellation test');
   assert.ok(state[kind].cancelledAt);

   assert.deepEqual(state[other],original);
   assert.equal(writes,1);
   assert.equal(audits.length,1);
   assert.equal(audits[0][3],'demo_run_cancelled');
  });
 }

 test(`${kind}: cancellation reason mandatory`,()=>{
  reset(kind,'funded');
  assert.equal(cancel(kind,'x').code,400);
  assert.equal(state[kind].stage,'funded');
  assert.equal(writes,0);
  assert.equal(audits.length,0);
 });

 test(`${kind}: cancellation blocked after release`,()=>{
  for(const stage of ['monitor','complete','funded']){
   reset(kind,stage);

   if(stage==='funded'){
    state[kind].releasedAt=new Date().toISOString();
   }

   assert.equal(cancel(kind).code,400);
   assert.equal(writes,0);
  }
 });

 test(`${kind}: cancelled run blocks subsequent actions`,()=>{
  reset(kind,'funded');
  assert.equal(cancel(kind).code,200);

  const original=JSON.stringify(state);

  const actions=[
   'sync','approve-all','freeze','top-up','fund',
   'release','refresh-status','retry-failed','reconcile'
  ];

  if(kind==='monday')actions.push('confirm-rentsheets');

  for(const action of actions){
   const result=call(`/api/admin/demo/${kind}/${action}`);

   assert.ok(result.code>=400,
    `${kind}/${action} unexpectedly succeeded`);

   assert.equal(JSON.stringify(state),original,
    `${kind}/${action} modified cancelled state`);
  }

  assert.equal(writes,1);
  assert.equal(audits.length,1);
 });

 test(`${kind}: repeated cancellation is idempotent`,()=>{
  reset(kind,'review');

  assert.equal(cancel(kind).code,200);
  assert.equal(cancel(kind).code,200);

  assert.equal(writes,1);
  assert.equal(audits.length,1);
 });
}

console.log(
 'Demo route tests use in-memory state only; no live API or database.'
);
