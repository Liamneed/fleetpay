
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readModulrSandboxPayment
} from '../server/lib/modulr-sandbox-adapter.mjs';

const originalEnv = {
  MODULR_ENV: process.env.MODULR_ENV,
  MODULR_ENABLED: process.env.MODULR_ENABLED,
  PAYOUT_ACCOUNTING_FINALISATION_ENABLED:
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED
};

function safeEnvironment() {
  process.env.MODULR_ENV = 'sandbox';
  process.env.MODULR_ENABLED = 'false';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';
}

function restoreEnvironment() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('Retrieves payment using GET only', async () => {
  safeEnvironment();

  try {
    let called = 0;

    const payment = await readModulrSandboxPayment({
      paymentId: 'P_TEST_292',
      apiKey: 'synthetic-key',
      fetchImpl: async (url, options) => {
        called++;

        assert.match(url, /api-sandbox-token\/payments\/P_TEST_292$/);
        assert.equal(options.method, 'GET');
        assert.equal(options.headers.Authorization, 'synthetic-key');

        return {
          status: 200,
          json: async () => ({
            id: 'P_TEST_292',
            status: 'PROCESSED'
          })
        };
      }
    });

    assert.equal(called, 1);
    assert.equal(payment.status, 'PROCESSED');
  } finally {
    restoreEnvironment();
  }
});

test('Blocks production and enabled payments', async () => {
  safeEnvironment();

  try {
    for (const [key, value] of [
      ['MODULR_ENV', 'production'],
      ['MODULR_ENABLED', 'true'],
      ['PAYOUT_ACCOUNTING_FINALISATION_ENABLED', 'true']
    ]) {
      safeEnvironment();
      process.env[key] = value;

      await assert.rejects(
        readModulrSandboxPayment({
          paymentId: 'P_TEST_292',
          apiKey: 'synthetic-key',
          fetchImpl: () => {
            throw new Error('Network should not be reached');
          }
        }),
        /Sandbox read-only environment required/
      );
    }
  } finally {
    restoreEnvironment();
  }
});

test('Rejects incorrect provider payment identity', async () => {
  safeEnvironment();

  try {
    await assert.rejects(
      readModulrSandboxPayment({
        paymentId: 'P_TEST_292',
        apiKey: 'synthetic-key',
        fetchImpl: async () => ({
          status: 200,
          json: async () => ({
            id: 'P_WRONG',
            status: 'PROCESSED'
          })
        })
      }),
      /response invalid/
    );
  } finally {
    restoreEnvironment();
  }
});

test('Rejects provider HTTP failures', async () => {
  safeEnvironment();

  try {
    await assert.rejects(
      readModulrSandboxPayment({
        paymentId: 'P_TEST_292',
        apiKey: 'synthetic-key',
        fetchImpl: async () => ({ status: 404 })
      }),
      /retrieval unsuccessful/
    );
  } finally {
    restoreEnvironment();
  }
});

test('Rejects invalid IDs before network access', async () => {
  safeEnvironment();

  try {
    await assert.rejects(
      readModulrSandboxPayment({
        paymentId: '../payments',
        apiKey: 'synthetic-key',
        fetchImpl: () => {
          throw new Error('Network should not be reached');
        }
      }),
      /Valid provider payment ID required/
    );
  } finally {
    restoreEnvironment();
  }
});
