import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createModulrLifecycleFixture,rehearseModulrRunFinalisation,rehearseLateModulrReturn} from '../server/lib/modulr-lifecycle-rehearsal.mjs';
const env={MODULR_ENV:'sandbox', MODULR_ENABLED:'false',PAYOUT_ACCOUNTING_FINALISATION_ENABLED:'false',AUTOCAB_ADJUSTMENTS_ENABLED:'false',LIVE_TEST_AUTOCAB_WRITES_ENABLED:'false'};
for(const [k,v] of Object.entries(env)) process.env[k]=v;
function setup(opts={}){
  const db=new DatabaseSync(':memory:'); createModulrLifecycleFixture(db);
  db.prepare('INSERT INTO rehearsal_runs(id,total_minor,item_count) VALUES(?,?,?)').run('runA',3000,2);
  for(const [id,driver,amount,ref,debit] of [['p1','d1',1000,'provider1','debit1'],['p2','d2',2000,'provider2','debit2']]){
    db.prepare('INSERT INTO rehearsal_payouts(id,run_id,driver_id,amount_minor,provider_id) VALUES(?,?,?,?,?)').run(id,'runA',driver,amount,ref);
    if(opts.missing!==id)db.prepare('INSERT INTO rehearsal_evidence(provider_id,amount_minor,currency,source_account,outgoing_debit_id,status) VALUES(?,?,?,?,?,?)').run(ref,amount,'GBP','account1',debit,'simulated_debit_verified');
  }
  return db;
}
const counts=db=>({ledger:db.prepare('SELECT COUNT(*) AS n FROM rehearsal_ledger').get().n,paid:db.prepare("SELECT COUNT(*) AS n FROM rehearsal_payouts WHERE status='paid'").get().n, status:db.prepare("SELECT status FROM rehearsal_runs WHERE id='runA'").get().status});
test('two-driver accounting atomically closes simulated run',()=>{const db=setup();try{const r=rehearseModulrRunFinalisation(db,'runA');assert.equal(r.payoutCount,2);assert.equal(r.productionAccountingAuthorised,false);assert.deepEqual(counts(db),{ledger:2,paid:2,status:'closed'});}finally{db.close()}});
test('duplicate finalisation cannot create ledger entry',()=>{const db=setup();try{rehearseModulrRunFinalisation(db,'runA');assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));assert.equal(counts(db).ledger,2);}finally{db.close()}});
test('missing evidence rolls back entire run',()=>{const db=setup({missing:'p2'});try{assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));assert.deepEqual(counts(db),{ledger:0,paid:0,status:'held'});}finally{db.close()}});
test('run total mismatch rolls back',()=>{const db=setup();try{db.prepare('UPDATE rehearsal_runs SET total_minor=3001').run();assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));assert.equal(counts(db).ledger,0);}finally{db.close()}});
test('mismatched debit blocks entire run',()=>{const db=setup();try{db.prepare('UPDATE rehearsal_evidence SET amount_minor=1999 WHERE provider_id=?').run('provider2');assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));assert.equal(counts(db).ledger,0);}finally{db.close()}});
test('pre-existing return prevents finalisation',()=>{const db=setup();try{rehearseLateModulrReturn(db,'provider2','return1');assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));assert.equal(counts(db).ledger,0);}finally{db.close()}});
test('late return does not reverse paid ledger or retry',()=>{const db=setup();try{rehearseModulrRunFinalisation(db,'runA');const r=rehearseLateModulrReturn(db,'provider1','return1');assert.equal(r.automaticRetryAuthorised,false);assert.equal(counts(db).ledger,2);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rehearsal_returns').get().n,1);}finally{db.close()}});
test('duplicate return identity cannot post again',()=>{const db=setup();try{rehearseLateModulrReturn(db,'provider1','return1');assert.throws(()=>rehearseLateModulrReturn(db,'provider1','return2'));assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rehearsal_returns').get().n,1);}finally{db.close()}});
test('file-backed and attached databases rejected',()=>{const db=setup();try{db.exec("ATTACH DATABASE ':memory:' AS other");assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));db.exec('DETACH DATABASE other');}finally{db.close()}});
test('non-rehearsal table rejects transaction',()=>{const db=setup();try{db.exec('CREATE TABLE payouts(id TEXT)');assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));}finally{db.close()}});
test('enabled accounting blocks run',()=>{const db=setup();try{process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='true';assert.throws(()=>rehearseModulrRunFinalisation(db,'runA'));assert.equal(counts(db).ledger,0);}finally{process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED='false';db.close()}});
