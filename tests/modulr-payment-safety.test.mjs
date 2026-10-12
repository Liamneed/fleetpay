import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessModulrRetry, classifyModulrPaymentStatus
} from '../server/lib/modulr-payment-safety.mjs';

const base = {
  intent: { provider:'modulr', environment:'sandbox',
    status:'unknown', idempotency_key:'unique-nonce' },
  originalSubmittedAt:'2026-10-12T10:00:00Z',
  now:'2026-10-12T11:00:00Z', sameRequest:true
};
test('Never authorises automatic retries, even inside nonce window', () => {
  const r=assessModulrRetry(base);
  assert.equal(r.permitted,false);
  assert.equal(r.theoreticalSafeWindow,true);
  assert.equal(r.retryNonce,'unique-nonce');
});
test('Rejects changed request content', () => {
  assert.equal(assessModulrRetry({...base,sameRequest:false}).reason,
    'original_request_must_be_identical');
});
test('Rejects retries after 48 hours', () => {
  const r=assessModulrRetry({...base,now:'2026-10-14T10:00:00Z'});
  assert.equal(r.reason,'nonce_window_expired_reconcile_manually');
  assert.equal(r.permitted,false);
});
test('Rejects known provider ID, and later results require reconciliation', () => {
  assert.equal(assessModulrRetry({...base,intent:{...base.intent,
    provider_transfer_id:'payment-1'}}).reason,'reconcile_existing_payment');
  assert.equal(assessModulrRetry({...base,providerOutcomeKnown:true}).permitted,false);
});
test('Rejects production and prepared transfer retries', () => {
  assert.equal(assessModulrRetry({...base,intent:{...base.intent,
    environment:'production'}}).permitted,false);
  assert.equal(assessModulrRetry({...base,intent:{...base.intent,
    status:'prepared'}}).permitted,false);
});
test('Provider PROCESSED is not automatic accounting finalisation', () => {
  const r=classifyModulrPaymentStatus('PROCESSED');
  assert.equal(r.outcome,'processed');
  assert.equal(r.finalAccountingAuthorised,false);
  assert.equal(r.requiresBankReturnMonitoring,true);
});
test('Pending and unfamiliar outcomes never finalise accounting', () => {
  for(const status of ['VALIDATED','PENDING','FAILED','UNRECOGNISED',null]){
    assert.equal(classifyModulrPaymentStatus(status).finalAccountingAuthorised,false);
  }
});
