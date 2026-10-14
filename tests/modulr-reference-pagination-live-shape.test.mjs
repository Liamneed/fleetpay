import test from 'node:test';
import assert from 'node:assert/strict';
import { searchModulrReferenceRecovery } from
  '../server/lib/modulr-reference-search.mjs';

const intent = {
  id: 'test_recovery_001',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'unknown',
  provider_transfer_id: null,
  attempt_started_at: '2026-10-14T12:00:00Z',
  currency: 'GBP',
  amount_minor: 2500,
  recipient_id: 'B_TEST'
};

const invoke = (pages) => {
  let requests = 0;
  const fetchImpl = async () => ({
    status: 200,
    json: async () => pages[requests++]
  });

  return {
    run: () => searchModulrReferenceRecovery({
      intent,
      sourceAccountId: 'A_TEST',
      apiKey: 'synthetic-key',
      fetchImpl
    }),
    requests: () => requests
  };
};

test('Real Modulr empty page shape completes without false verification',
  async () => {
    const check = invoke([{
      content: [],
      page: 0,
      size: 0,
      totalPages: 1,
      totalSize: 0
    }]);

    const result = await check.run();
    assert.equal(check.requests(), 1);
    assert.equal(result.pagesComplete, true);
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'no_reference_match');
    assert.equal(result.automaticRetryAllowed, false);
  }
);

test('Incorrect returned page number fails closed',
  async () => {
    const check = invoke([{
      content: [],
      page: 1,
      size: 0,
      totalPages: 2,
      totalSize: 0
    }]);

    const result = await check.run();
    assert.equal(check.requests(), 1);
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'pagination_mismatch');
    assert.equal(result.automaticRetryAllowed, false);
  }
);

test('Two empty pages with zero total records fail closed',
  async () => {
    const check = invoke([
      {
        content: [],
        page: 0,
        size: 0,
        totalPages: 2,
        totalSize: 0
      },
      {
        content: [],
        page: 1,
        size: 0,
        totalPages: 2,
        totalSize: 0
      }
    ]);

    const result = await check.run();
    assert.equal(check.requests(), 1);
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'pagination_mismatch');
    assert.equal(result.automaticRetryAllowed, false);
  }
);

test('Reported total exceeds returned records and fails closed',
  async () => {
    const check = invoke([{
      content: [],
      page: 0,
      size: 0,
      totalPages: 1,
      totalSize: 1
    }]);

    const result = await check.run();
    assert.equal(check.requests(), 1);
    assert.equal(result.verified, false);
    assert.equal(result.reason, 'pagination_mismatch');
    assert.equal(result.automaticRetryAllowed, false);
  }
);
