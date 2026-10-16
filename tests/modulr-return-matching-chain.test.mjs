import test from 'node:test';
import assert from 'node:assert/strict';

import {
  searchModulrOriginalByScheme
} from '../server/lib/modulr-return-scheme-search.mjs';

import {
  readModulrSandboxPayment
} from '../server/lib/modulr-sandbox-adapter.mjs';

import {
  matchModulrReturnToOriginal
} from '../server/lib/modulr-return-original-match.mjs';

const originalEnvironment = {
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
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const intent = {
  id: 'TRANSFER_TEST_001',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'confirmed',
  provider_transfer_id: 'P_ORIGINAL_001',
  recipient_id: 'B_TEST',
  amount_minor: 100,
  currency: 'GBP'
};

const originalPayment = {
  id: 'P_ORIGINAL_001',
  type: 'PAYOUT',
  externalReference: intent.id,
  status: 'PROCESSED',
  details: {
    externalReference: intent.id,
    sourceAccountId: 'A_TEST',
    destination: {
      type: 'BENEFICIARY',
      id: 'B_TEST'
    },
    amount: 1,
    currency: 'GBP'
  }
};

function paymentList(items) {
  return {
    content: items,
    page: 0,
    totalPages: 1,
    totalSize: items.length,
    last: true
  };
}

async function run({
  list = paymentList([originalPayment]),
  detail = originalPayment
} = {}) {
  const methods = [];

  const fetchImpl = async (url, options) => {
    methods.push(options.method);

    if (options.method !== 'GET') {
      throw new Error('Unexpected non-GET request');
    }

    if (url.includes('?')) {
      const params = new URL(url).searchParams;

      assert.equal(
        params.get('schemeId'),
        'PAYPORT:SCHEME_ORIGINAL_001'
      );

      return {
        status: 200,
        json: async () => list
      };
    }

    return {
      status: 200,
      json: async () => detail
    };
  };

  const lookup = await searchModulrOriginalByScheme({
    originalSchemeId: 'SCHEME_ORIGINAL_001',
    fromCreatedDate: '2026-10-01T00:00:00Z',
    apiKey: 'synthetic-key',
    fetchImpl
  });

  if (!lookup.found) {
    return { matched: false, reason: lookup.reason, methods };
  }

  const retrieved = await readModulrSandboxPayment({
    paymentId: lookup.providerPaymentId,
    apiKey: 'synthetic-key',
    fetchImpl
  });

  const association = matchModulrReturnToOriginal({
    intent,
    lookup,
    originalPayment: retrieved,
    sourceAccountId: 'A_TEST'
  });

  return { ...association, methods };
}

test('complete synthetic chain associates for review', async () => {
  const result = await run();

  assert.equal(result.matched, true);
  assert.equal(result.returnConfirmed, false);
  assert.equal(result.accountingAuthorised, false);
  assert.deepEqual(result.methods, ['GET', 'GET']);
});

test('missing scheme search result remains unresolved', async () => {
  const result = await run({
    list: paymentList([])
  });

  assert.equal(result.matched, false);
  assert.deepEqual(result.methods, ['GET']);
});

test('ambiguous scheme search remains unresolved', async () => {
  const result = await run({
    list: paymentList([
      originalPayment,
      originalPayment
    ])
  });

  assert.equal(result.matched, false);
  assert.deepEqual(result.methods, ['GET']);
});

test('independent GET returning PAYIN is rejected', async () => {
  const result = await run({
    detail: {
      ...originalPayment,
      type: 'PAYIN'
    }
  });

  assert.equal(result.matched, false);
});

test('independent GET with conflicting references fails', async () => {
  const result = await run({
    detail: {
      ...originalPayment,
      details: {
        ...originalPayment.details,
        externalReference: 'TRANSFER_OTHER'
      }
    }
  });

  assert.equal(result.matched, false);
});

test('independent GET wrong amount fails', async () => {
  const result = await run({
    detail: {
      ...originalPayment,
      details: {
        ...originalPayment.details,
        amount: 1.01
      }
    }
  });

  assert.equal(result.matched, false);
});

test('matching chain never authorises financial activity', async () => {
  const result = await run();

  assert.equal(result.accountingAuthorised, false);
  assert.equal(result.retryAuthorised, false);
  assert.equal(result.requiresManualReview, true);
});
