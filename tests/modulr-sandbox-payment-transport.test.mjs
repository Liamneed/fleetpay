import test from 'node:test';
import assert from 'node:assert/strict';
import { executeModulrSandboxTransport } from
  '../server/lib/modulr-sandbox-payment-transport.mjs';

function fixture(overrides = {}) {
  return {
    validatedSubmission: {
      eligible: true,
      requiresExplicitAuthorisation: true,
      executionEnabled: false,
      request: {
        method: 'POST',
        path: '/payments',
        executionEnabled: false,
        paymentSubmitted: false,
        headers: { 'x-mod-nonce': 'nonce_safe_1' },
        body: {
          sourceAccountId: 'A_TEST_1',
          destination: { type: 'BENEFICIARY', id: 'B_TEST_1' },
          currency: 'GBP',
          amount: 1,
          externalReference: 'intent_test_1'
        }
      }
    },
    apiKey: 'synthetic-key-not-real',
    ...overrides
  };
}

async function withSandbox(callback) {
  const names = [
    'MODULR_ENV',
    'MODULR_ENABLED',
    'PAYOUT_ACCOUNTING_FINALISATION_ENABLED',
    'MODULR_SANDBOX_POST_ENABLED'
  ];
  const previous = Object.fromEntries(
    names.map(name => [name, process.env[name]])
  );
  try {
    process.env.MODULR_ENV = 'sandbox';
    process.env.MODULR_ENABLED = 'false';
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';
    process.env.MODULR_SANDBOX_POST_ENABLED = 'true';
    return await callback();
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
}

test('Mock 201 records acceptance, never settlement', () =>
  withSandbox(async () => {
    let requests = 0;
    const result = await executeModulrSandboxTransport(fixture({
      fetchImpl: async (url, options) => {
        requests++;
        assert.match(url, /^https:\/\/api-sandbox\.modulrfinance\.com\//);
        assert.equal(options.method, 'POST');
        assert.equal(options.headers['x-mod-nonce'], 'nonce_safe_1');
        assert.equal(JSON.parse(options.body).amount, 1);
        return {
          status: 201,
          json: async () => ({ id: 'P_TEST_1', status: 'VALIDATED' })
        };
      }
    }));
    assert.equal(requests, 1);
    assert.equal(result.status, 'submitted');
    assert.equal(result.providerTransferId, 'P_TEST_1');
    assert.equal(result.accountingFinalised, false);
  })
);

test('Mock timeout remains uncertain without retry', () =>
  withSandbox(async () => {
    let requests = 0;
    const result = await executeModulrSandboxTransport(fixture({
      fetchImpl: async () => {
        requests++;
        throw new Error('Simulated timeout');
      }
    }));
    assert.equal(requests, 1);
    assert.equal(result.status, 'unknown');
    assert.equal(result.providerRequestAttempted, true);
  })
);

test('Mock HTTP failure remains uncertain', () =>
  withSandbox(async () => {
    const result = await executeModulrSandboxTransport(fixture({
      fetchImpl: async () => ({
        status: 500,
        json: async () => ({ error: 'simulated' })
      })
    }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.accountingFinalised, false);
  })
);

test('Missing explicit transport enablement blocks POST', async () => {
  const before = process.env.MODULR_SANDBOX_POST_ENABLED;
  try {
    delete process.env.MODULR_SANDBOX_POST_ENABLED;
    let requests = 0;
    await assert.rejects(
      executeModulrSandboxTransport(fixture({
        fetchImpl: async () => { requests++; }
      })),
      /disabled/
    );
    assert.equal(requests, 0);
  } finally {
    if (before === undefined) delete process.env.MODULR_SANDBOX_POST_ENABLED;
    else process.env.MODULR_SANDBOX_POST_ENABLED = before;
  }
});
