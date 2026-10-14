import test from 'node:test';
import assert from 'node:assert/strict';
import { searchModulrReferenceRecovery } from
  '../server/lib/modulr-reference-search.mjs';

const intent = {
  id: 'intent_101',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'unknown',
  provider_transfer_id: null,
  attempt_started_at: '2026-10-14T08:00:00Z',
  recipient_id: 'B_TEST',
  amount_minor: 2500,
  currency: 'GBP'
};

const payment = {
  id: 'P_TEST',
  externalReference: 'intent_101',
  status: 'PROCESSED',
  details: {
    sourceAccountId: 'A_TEST',
    destination: {
      type: 'BENEFICIARY', id: 'B_TEST'
    },
    amount: 25,
    currency: 'GBP'
  }
};

async function scenario(pages, options = {}) {
  let calls = 0;
  const result = await searchModulrReferenceRecovery({
    intent,
    sourceAccountId: 'A_TEST',
    apiKey: 'synthetic-key',
    pageSize: 2,
    maxPages: 3,
    fetchImpl: async (url, req) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page'));

      assert.equal(parsed.hostname, 'api-sandbox.modulrfinance.com');
      assert.equal(parsed.pathname, '/api-sandbox-token/payments');
      assert.equal(parsed.searchParams.get('externalReference'), intent.id);
      assert.equal(parsed.searchParams.get('sourceAccountId'), 'A_TEST');
      assert.ok(parsed.searchParams.has('fromCreatedDate'));
      assert.equal(parsed.searchParams.get('type'), 'PAYOUT');
      assert.equal(req.method, 'GET');

      calls++;
      return pages[page] ?? {
        status: 500,
        json: async () => ({})
      };
    },
    ...options
  });
  return { result, calls };
}

const ok = body => ({
  status: 200, json: async () => body
});

test('GET-only search finds a unique exact reference', async () => {
  const { result, calls } = await scenario([
    ok({ content: [payment], last: true, number: 0 })
  ]);
  assert.equal(calls, 1);
  assert.equal(result.verified, true);
  assert.equal(result.providerPaymentId, 'P_TEST');
  assert.equal(result.accountingFinalised, false);
  assert.equal(result.automaticRetryAllowed, false);
});

test('Search checks subsequent pages', async () => {
  const other = {
    ...payment, id: 'OTHER',
    externalReference: 'unrelated'
  };
  const { result, calls } = await scenario([
    ok({ content: [other, other], last: false, number: 0 }),
    ok({ content: [payment], last: true, number: 1 })
  ]);
  assert.equal(calls, 2);
  assert.equal(result.verified, true);
});

test('Duplicates across pages remain unresolved', async () => {
  const { result } = await scenario([
    ok({ content: [payment, payment], last: false }),
    ok({ content: [], last: true })
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'ambiguous_reference_matches');
});

test('Provider failure on later page fails closed', async () => {
  const { result } = await scenario([
    ok({ content: [payment, payment], last: false }),
    { status: 502, json: async () => ({}) }
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'provider_search_failed');
});

test('Unfinished pagination fails closed', async () => {
  const full = ok({ content: [payment, payment], last: false });
  const { result } = await scenario([full, full, full]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'pagination_incomplete');
});

test('Malformed provider page fails closed', async () => {
  const { result } = await scenario([
    ok({ content: 'invalid', last: true })
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'invalid_provider_page');
});

test('Missing attempt timestamp never contacts Modulr', async () => {
  const { result, calls } = await scenario([], {
    intent: { ...intent, attempt_started_at: null }
  });
  assert.equal(calls, 0);
  assert.equal(result.verified, false);
});

test('Unsafe environment blocks provider lookup', async () => {
  const original = process.env.MODULR_ENABLED;
  process.env.MODULR_ENABLED = 'true';
  try {
    const { result, calls } = await scenario([]);
    assert.equal(calls, 0);
    assert.equal(result.reason, 'unsafe_environment');
  } finally {
    if (original === undefined) delete process.env.MODULR_ENABLED;
    else process.env.MODULR_ENABLED = original;
  }
});

test('Short page without completion metadata fails closed', async () => {
  const { result, calls } = await scenario([
    ok({ content: [payment] })
  ]);
  assert.equal(calls, 1);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'pagination_metadata_missing');
  assert.equal(result.automaticRetryAllowed, false);
});

test('Contradictory page number fails closed', async () => {
  const { result } = await scenario([
    ok({ content: [payment], last: true, number: 2 })
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'pagination_mismatch');
});

test('Last page contradicting totalPages fails closed', async () => {
  const { result } = await scenario([
    ok({ content: [payment], number: 0,
         last: true, totalPages: 2 })
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'pagination_mismatch');
});

test('Provider claiming further pages past total fails closed', async () => {
  const { result } = await scenario([
    ok({ content: [payment], number: 0,
         last: false, totalPages: 1 })
  ]);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'pagination_mismatch');
});
