import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyModulrSubmission
} from '../server/lib/modulr-transfer-outcome.mjs';

test('Accepts documented HTTP 201 payment creation', () => {
  const result = classifyModulrSubmission({
    httpStatus: 201,
    body: { id: 'P_TEST_001', status: 'VALIDATED' }
  });

  assert.equal(result.status, 'submitted');
  assert.equal(result.providerTransferId, 'P_TEST_001');
  assert.equal(result.providerStatus, 'VALIDATED');
  assert.equal(result.accountingFinalised, false);
});

test('Rejects missing provider payment ID', () => {
  assert.equal(classifyModulrSubmission({
    httpStatus: 201,
    body: { status: 'VALIDATED' }
  }).status, 'unknown');
});

test('Rejects missing provider status', () => {
  assert.equal(classifyModulrSubmission({
    httpStatus: 201,
    body: { id: 'P_TEST_001' }
  }).status, 'unknown');
});

test('Rejects unexpected successful HTTP codes', () => {
  for (const httpStatus of [200, 202, 204]) {
    assert.equal(classifyModulrSubmission({
      httpStatus,
      body: { id: 'P_TEST_001', status: 'VALIDATED' }
    }).status, 'unknown');
  }
});

test('Network and provider failures remain uncertain', () => {
  for (const response of [
    { timeout: true },
    { networkError: true },
    { httpStatus: 400 },
    { httpStatus: 429 },
    { httpStatus: 500 },
    null
  ]) {
    assert.equal(classifyModulrSubmission(response).status, 'unknown');
  }
});

test('Legacy transferId does not replace provider id', () => {
  assert.equal(classifyModulrSubmission({
    httpStatus: 201,
    transferId: 'mock_001'
  }).status, 'unknown');
});
