// Explicit safety settings for offline sandbox tests.
process.env.MODULR_ENV = 'sandbox';
process.env.MODULR_ENABLED = 'false';
process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';
process.env.AUTOCAB_ADJUSTMENTS_ENABLED = 'false';
process.env.LIVE_TEST_AUTOCAB_WRITES_ENABLED = 'false';

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateClaimedModulrSubmission
} from '../server/lib/modulr-submission-gate.mjs';

const intent = {
  id: 'synthetic_gate_297',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'submitting',
  recipient_id: 'B_TEST_297',
  amount_minor: 2500,
  currency: 'GBP',
  idempotency_key: 'nonce_gate_297',
  provider_transfer_id: null,
  confirmed_at: null
};

const claim = {
  ok: true,
  status: 'submitting',
  amountMinor: 2500,
  paymentSubmitted: false,
  paymentExecutionEnabled: false
};

const args = {
  intent,
  claim,
  sourceAccountId: 'A_TEST_297'
};

test('Valid claimed transfer passes offline gate', () => {
  const r = validateClaimedModulrSubmission(args);
  assert.equal(r.eligible, true);
  assert.equal(r.paymentSubmitted, false);
  assert.equal(r.executionEnabled, false);
  assert.equal(r.requiresExplicitAuthorisation, true);
  assert.equal(r.request.body.amount, 25);
});

test('Prepared transfer without claim is blocked', () => {
  const r = validateClaimedModulrSubmission({
    ...args,
    intent: { ...intent, status: 'prepared' }
  });
  assert.equal(r.eligible, false);
});

test('Claim amount mismatch is blocked', () => {
  const r = validateClaimedModulrSubmission({
    ...args,
    claim: { ...claim, amountMinor: 2600 }
  });
  assert.equal(r.eligible, false);
});

test('Missing claim evidence is blocked', () => {
  assert.equal(validateClaimedModulrSubmission({
    ...args, claim: null
  }).eligible, false);
});

test('Existing provider payment ID is blocked', () => {
  assert.equal(validateClaimedModulrSubmission({
    ...args,
    intent: { ...intent, provider_transfer_id: 'P_EXISTING' }
  }).eligible, false);
});

test('Invalid beneficiary is blocked', () => {
  assert.equal(validateClaimedModulrSubmission({
    ...args,
    intent: { ...intent, recipient_id: '' }
  }).eligible, false);
});

test('Production transfer is blocked', () => {
  assert.equal(validateClaimedModulrSubmission({
    ...args,
    intent: { ...intent, environment: 'production' }
  }).eligible, false);
});

test('A caller cannot claim payment was already executed', () => {
  assert.equal(validateClaimedModulrSubmission({
    ...args,
    claim: { ...claim, paymentSubmitted: true }
  }).eligible, false);
});
