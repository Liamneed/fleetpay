import test from 'node:test';
import assert from 'node:assert/strict';

import {
  monitorModulrSandboxReturns
} from '../server/lib/modulr-return-monitor.mjs';

const oldEnv = {
  MODULR_ENV: process.env.MODULR_ENV,
  MODULR_ENABLED: process.env.MODULR_ENABLED,
  PAYOUT_ACCOUNTING_FINALISATION_ENABLED:
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED
};

test.before(() => {
  process.env.MODULR_ENV = 'sandbox';
  process.env.MODULR_ENABLED = 'false';
  process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';
});

test.after(() => {
  for (const [key, value] of Object.entries(oldEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const candidate = {
  id: 'P_RETURN_TEST',
  type: 'RETURN',
  status: 'PROCESSED',
  returnDetails: {
    originalSchemeId: 'SCHEME_TEST',
    returnReasonCode: 'TEST'
  }
};

function response(body, status = 200) {
  return {
    status,
    json: async () => body
  };
}

async function run({
  list = {
    content: [candidate],
    page: 0,
    totalPages: 1,
    totalSize: 1
  },
  detail = candidate,
  listStatus = 200
} = {}) {
  const methods = [];

  const fetchImpl = async (url, options) => {
    methods.push(options.method);

    assert.equal(options.method, 'GET');

    const parsed = new URL(url);

    assert.equal(
      parsed.origin,
      'https://api-sandbox.modulrfinance.com'
    );

    if (parsed.pathname.endsWith('/payments')) {
      const type = parsed.searchParams.get('type');

      assert.ok(['RETURN', 'PAYIN'].includes(type));
      assert.ok(parsed.searchParams.has('fromCreatedDate'));

      if (type === 'PAYIN') {
        return response({
          content: [],
          page: 0,
          totalPages: 1,
          totalSize: 0
        });
      }

      return response(list, listStatus);
    }

    assert.equal(
      parsed.pathname.endsWith('/payments/P_RETURN_TEST'),
      true
    );

    return response(detail);
  };

  const result = await monitorModulrSandboxReturns({
    apiKey: 'synthetic-test-key',
    fromCreatedDate: '2026-10-01T00:00:00Z',
    fetchImpl
  });

  return { ...result, methods };
}

test('retrieves potential return for manual review', async () => {
  const result = await run();

  assert.equal(result.ok, true);
  assert.equal(result.checked, 1);
  assert.equal(result.candidates[0].originalSchemeId, 'SCHEME_TEST');
  assert.equal(result.candidates[0].returnConfirmed, false);
  assert.deepEqual(result.methods, ['GET', 'GET', 'GET']);
});

test('empty results are handled correctly', async () => {
  const result = await run({
    list: {
      content: [],
      page: 0,
      totalPages: 1,
      totalSize: 0
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.checked, 0);
  assert.deepEqual(result.methods, ['GET', 'GET']);
});

test('multiple pages cannot be mistaken for complete results', async () => {
  const result = await run({
    list: {
      content: [candidate],
      page: 0,
      totalPages: 2,
      totalSize: 2
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'incomplete_provider_results');
});

test('provider search failure remains unresolved', async () => {
  const result = await run({ listStatus: 500 });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_search_failed');
});

test('incorrect independent GET identity fails closed', async () => {
  const result = await run({
    detail: { ...candidate, id: 'P_WRONG' }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider_retrieval_uncertain');
});

test('monitor never authorises financial operations', async () => {
  const result = await run();

  assert.equal(result.returnConfirmed, false);
  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.retryAuthorised, false);
  assert.equal(result.requiresManualReview, true);
});
