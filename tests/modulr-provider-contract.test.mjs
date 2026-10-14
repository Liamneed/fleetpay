import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateModulrReconciliation
} from '../server/lib/modulr-transfer-reconciliation.mjs';

const intent = {
  provider: 'modulr',
  environment: 'sandbox',
  status: 'submitted',
  provider_transfer_id: 'P_TEST_001',
  recipient_id: 'B_TEST_001',
  amount_minor: 2501,
  currency: 'GBP'
};

const payment = {
  id: 'P_TEST_001',
  status: 'PROCESSED',
  details: {
    sourceAccountId: 'A_TEST_001',
    destination: {
      type: 'BENEFICIARY',
      id: 'B_TEST_001'
    },
    currency: 'GBP',
    amount: 25.01,
    reference: 'FAIVOPAY'
  },
  type: 'PAYOUT'
};

test('Verifies documented processed payment structure', () => {
  const result = validateWithSource(intent, payment);
  assert.equal(result.verified, true);
  assert.equal(result.amountMinor, 2501);
  assert.equal(result.accountingFinalised, false);
  assert.equal(result.requiresBankReturnMonitoring, true);
});

test('Rejects incorrect payment identity', () => {
  assert.equal(validateWithSource(
    intent, { ...payment, id: 'P_WRONG' }
  ).verified, false);
});

test('Rejects incorrect beneficiary', () => {
  const changed = {
    ...payment,
    details: {
      ...payment.details,
      destination: { type: 'BENEFICIARY', id: 'B_WRONG' }
    }
  };
  assert.equal(validateWithSource(intent, changed).verified, false);
});

test('Rejects incorrect amount', () => {
  assert.equal(validateWithSource(intent, {
    ...payment,
    details: { ...payment.details, amount: 26.01 }
  }).verified, false);
});

test('Rejects non-final and mock completion statuses', () => {
  for (const status of ['VALIDATED', 'PENDING', 'COMPLETED', 'ER_INVALID']) {
    assert.equal(validateWithSource(
      intent, { ...payment, status }
    ).verified, false);
  }
});

test('Rejects old flat mock payment structures', () => {
  assert.equal(validateWithSource(intent, {
    id: 'P_TEST_001',
    recipientId: 'B_TEST_001',
    amountMinor: 2501,
    currency: 'GBP',
    status: 'PROCESSED'
  }).verified, false);
});


function validateWithSource(intent, payment) {
  return validateModulrReconciliation(intent, payment, 'A_TEST_001');
}

test('Missing expected source account fails closed', () => {
  const result = validateModulrReconciliation(intent, payment);
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'source_account_mismatch');
});

test('Wrong expected source account fails closed', () => {
  const result = validateModulrReconciliation(
    intent, payment, 'A_WRONG'
  );
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'source_account_mismatch');
});

test('Missing provider source account fails closed', () => {
  const result = validateModulrReconciliation(
    intent,
    {
      ...payment,
      details: { ...payment.details, sourceAccountId: undefined }
    },
    'A_TEST_001'
  );
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'source_account_mismatch');
});

test('Wrong provider source account fails closed', () => {
  const result = validateModulrReconciliation(
    intent,
    {
      ...payment,
      details: { ...payment.details, sourceAccountId: 'A_WRONG' }
    },
    'A_TEST_001'
  );
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'source_account_mismatch');
});
