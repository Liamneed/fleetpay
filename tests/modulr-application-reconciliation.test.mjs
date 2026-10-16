import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {reviewModulrApplicationAccounting} from '../server/lib/modulr-application-reconciliation.mjs';
const db = new DatabaseSync(':memory:');
test('missing financial audit tables always blocks, never mutates',()=>{
  db.exec("CREATE TABLE payout_runs(id TEXT PRIMARY KEY,provider TEXT)");
  const before=db.prepare("SELECT sql FROM sqlite_master WHERE name='payout_runs'").get().sql;
  const result=reviewModulrApplicationAccounting(db,'r1');
  assert.equal(result.accountingAuthorised,false);
  assert.equal(result.livePaymentsAuthorised,false);
  assert.ok(result.blockers.includes('missing_table:payouts'));
  assert.equal(db.prepare("SELECT sql FROM sqlite_master WHERE name='payout_runs'").get().sql,before);
});
test('invalid run identifiers fail closed',()=>{
  assert.throws(()=>reviewModulrApplicationAccounting(db,'r1; DROP TABLE payouts'));
});
