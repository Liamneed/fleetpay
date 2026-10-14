
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inspectModulrSandboxTransfer
} from '../server/lib/modulr-sandbox-reconcile.mjs';

const intent = {
  id: 'synthetic_293',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'submitted',
  provider_transfer_id: 'P_TEST_293',
  recipient_id: 'B_TEST_293',
  amount_minor: 2500,
  currency: 'GBP'
};

const processed = {
  id: 'P_TEST_293',
  status: 'PROCESSED',
  details: {
    sourceAccountId: 'A_TEST_293',
    destination: {
      type: 'BENEFICIARY',
      id: 'B_TEST_293'
    },
    amount: 25,
    currency: 'GBP'
  }
};

function providerResponse(payment, status = 200) {
  return async (url, options) => {
    assert.match(url, /\/payments\/P_TEST_293$/);
    assert.equal(options.method, 'GET');
    return {
      status,
      json: async () => payment
    };
  };
}

test('Independent GET validates processed transfer', async () => {
  const result = await inspectModulrSandboxTransfer({
    intent,
    apiKey: 'synthetic-key',
    sourceAccountId: 'A_TEST_293',
    fetchImpl: providerResponse(processed)
  });

  assert.equal(result.verified, true);
  assert.equal(result.status, 'confirmed');
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.accountingFinalised, false);
});

test('Pending payment never confirms', async () => {
  const result = await inspectModulrSandboxTransfer({
    intent,
    apiKey: 'synthetic-key',
    sourceAccountId: 'A_TEST_293',
    fetchImpl: providerResponse({
      ...processed,
      status: 'PENDING'
    })
  });

  assert.equal(result.verified, false);
});

test('Incorrect beneficiary never confirms', async () => {
  const result = await inspectModulrSandboxTransfer({
    intent,
    apiKey: 'synthetic-key',
    sourceAccountId: 'A_TEST_293',
    fetchImpl: providerResponse({
      ...processed,
      details: {
        ...processed.details,
        destination: {
          type: 'BENEFICIARY',
          id: 'B_WRONG'
        }
      }
    })
  });

  assert.equal(result.verified, false);
});

test('Provider retrieval failure remains uncertain', async () => {
  const result = await inspectModulrSandboxTransfer({
    intent,
    apiKey: 'synthetic-key',
    sourceAccountId: 'A_TEST_293',
    fetchImpl: providerResponse({}, 500)
  });

  assert.equal(result.verified, false);
  assert.equal(result.status, 'unknown');
  assert.equal(result.accountingFinalised, false);
});

test('Missing provider ID never contacts provider', async () => {
  const result = await inspectModulrSandboxTransfer({
    intent: {
      ...intent,
      provider_transfer_id: null
    },
    apiKey: 'synthetic-key',
    sourceAccountId: 'A_TEST_293',
    fetchImpl: () => {
      throw new Error('Unexpected provider request');
    }
  });

  assert.equal(result.verified, false);
  assert.equal(result.reason, 'transfer_not_eligible');
});


test('Missing expected account blocks GET', async () => {
  let requests = 0;
  const result = await inspectModulrSandboxTransfer({
    intent,
    apiKey: 'synthetic-key',
    fetchImpl: () => {
      requests++;
      throw new Error('Unexpected GET');
    }
  });
  assert.equal(requests, 0);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'transfer_not_eligible');
});

test('Incorrect account from independent GET is rejected', async () => {
  const result = await inspectModulrSandboxTransfer({
    intent,
    apiKey: 'synthetic-key',
    sourceAccountId: 'A_TEST_293',
    fetchImpl: providerResponse({
      ...processed,
      details: { ...processed.details, sourceAccountId: 'A_WRONG' }
    })
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'source_account_mismatch');
  assert.equal(result.accountingFinalised, false);
});
