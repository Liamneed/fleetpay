import test from 'node:test';
import assert from 'node:assert/strict';

import {
  searchModulrOriginalByScheme
} from '../server/lib/modulr-return-scheme-search.mjs';

const saved = {
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
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function page(content, overrides = {}) {
  return {
    content,
    page: 0,
    totalPages: 1,
    totalSize: content.length,
    last: true,
    ...overrides
  };
}

const payment = {
  id: 'P_ORIGINAL_001',
  externalReference: 'TRANSFER_TEST_001',
  status: 'PROCESSED'
};

async function run(pages) {
  const requests = [];

  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return {
      status: 200,
      json: async () => pages[requests.length - 1]
    };
  };

  const result = await searchModulrOriginalByScheme({
    originalSchemeId: 'SCHEME_ORIGINAL_001',
    fromCreatedDate: '2026-10-01T00:00:00Z',
    apiKey: 'synthetic-key',
    fetchImpl
  });

  return { result, requests };
}

test('one result is identified for independent review', async () => {
  const { result, requests } = await run([page([payment])]);

  assert.equal(result.found, true);
  assert.equal(result.providerPaymentId, payment.id);
  assert.equal(result.accountingAuthorised, false);

  const url = new URL(requests[0].url);
  assert.equal(url.searchParams.get('schemeId'),
    'PAYPORT:SCHEME_ORIGINAL_001');
  assert.equal(url.searchParams.get('type'), 'PAYOUT');
  assert.equal(requests[0].options.method, 'GET');
});

test('empty complete search remains unresolved', async () => {
  const { result } = await run([page([])]);
  assert.equal(result.found, false);
  assert.equal(result.reason, 'no_scheme_match');
});

test('multiple matches remain unresolved', async () => {
  const { result } = await run([page([payment, payment])]);
  assert.equal(result.found, false);
  assert.equal(result.reason, 'ambiguous_scheme_match');
});

test('inconsistent page number fails closed', async () => {
  const { result } = await run([
    page([payment], { page: 1 })
  ]);
  assert.equal(result.found, false);
});

test('incomplete pagination fails closed', async () => {
  const { result } = await run([
    page([payment], {
      totalPages: 2,
      totalSize: 2,
      last: false
    }),
    {
      content: [],
      page: 1,
      totalPages: 2,
      totalSize: 2,
      last: true
    }
  ]);
  assert.equal(result.found, false);
});

test('malformed payment fails closed', async () => {
  const { result } = await run([
    page([{ status: 'PROCESSED' }])
  ]);
  assert.equal(result.found, false);
});

test('result never authorises financial actions', async () => {
  const { result } = await run([page([payment])]);

  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.requiresManualReconciliation, true);
});
