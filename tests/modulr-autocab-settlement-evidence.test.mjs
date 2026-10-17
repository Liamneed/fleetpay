import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { assessModulrAutocabSettlement as assess } from '../server/lib/modulr-autocab-settlement-evidence.mjs';
const payout = Object.freeze({id:'p1',driver_id:21,type:'weekly',weekly_fee:1,carried_charges:2.5,net_amount:40});
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE autocab_adjustments (event_key TEXT UNIQUE, driver_id INTEGER, amount REAL, is_credit INTEGER, status TEXT, completed_at TEXT)');
 const add=(type,amount,extra={})=>db.prepare('INSERT INTO autocab_adjustments VALUES(?,?,?,?,?,?)').run(`payout:p1:${type}`,extra.driver??21,extra.amount??amount,extra.credit??0,extra.status??'completed',extra.completed===false?null:'2026-10-17T07:00:00Z');
 return {db,add};
}
test('exactly matched completed fee, carried and payout adjustments verify without mutation',()=>{
 const {db,add}=fixture();add('fee',1);add('carried',2.5);add('payment',40);
 const before=db.prepare('SELECT COUNT(*) AS count FROM autocab_adjustments').get().count;
 const result=assess(db,payout);
 assert.equal(result.verified,true);assert.equal(result.feePence,100);assert.equal(result.carriedPence,250);
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM autocab_adjustments').get().count,before);db.close();
});
test('no previously verified Autocab deductions does not authorise fee-bearing payout',()=>{
 const {db}=fixture();assert.equal(assess(db,payout).verified,false);db.close();
});
test('wrong driver and wrong fee amount are rejected',()=>{
 const {db,add}=fixture();add('fee',1,{driver:99});add('carried',2.5);add('payment',40);
 assert.ok(assess(db,payout).blockers.includes('fee_adjustment_mismatch'));db.close();
});
test('pending adjustment, even with correct amount, is not proof of a debit',()=>{
 const {db,add}=fixture();add('fee',1,{status:'pending'});add('carried',2.5);add('payment',40);
 assert.ok(assess(db,payout).blockers.includes('fee_adjustment_not_completed'));db.close();
});
test('no fee waiver requires no fee adjustment, but does require payout debit',()=>{
 const {db,add}=fixture();add('payment',40);
 assert.equal(assess(db,{...payout,weekly_fee:0,carried_charges:0}).verified,true);db.close();
});
test('unexpected adjustment fails closed',()=>{
 const {db,add}=fixture();add('fee',1);add('carried',2.5);add('payment',40);add('other',1);
 assert.ok(assess(db,payout).blockers.includes('unexpected_autocab_adjustment'));db.close();
});

test('incomplete adjustment evidence schema fails closed rather than crashing payout review',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE autocab_adjustments (event_key TEXT)');
 const result=assess(db,payout);
 assert.equal(result.verified,false);
 assert.ok(result.blockers.includes('autocab_adjustment_evidence_schema_incomplete'));
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM autocab_adjustments').get().n,0);
 db.close();
});
