import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decideModulrPayout
} from '../server/lib/modulr-payout-decision.mjs';

const intent = {
  id: 'TRANSFER_SYNTHETIC',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'confirmed',
  provider_transfer_id: 'PAYMENT_SYNTHETIC',
  recipient_id: 'BENEFICIARY_SYNTHETIC',
  amount_minor: 100,
  currency: 'GBP'
};

const payment = {
  id: 'PAYMENT_SYNTHETIC',
  type: 'PAYOUT',
  status: 'PROCESSED',
  externalReference: intent.id,
  details: {
    externalReference: intent.id,
    sourceAccountId: 'SOURCE_SYNTHETIC',
    destination: {
      type: 'BENEFICIARY',
      id: 'BENEFICIARY_SYNTHETIC'
    },
    amount: 1,
    currency: 'GBP'
  }
};

const base = {
  intent,
  providerPayment: payment,
  sourceAccountId: 'SOURCE_SYNTHETIC'
};

const scenarios = [
  ['processed payout', base, 'settlement_unverified'],
  ['possible return', {
    ...base, returnEvidence: { candidate: true }
  }, 'return_candidate'],
  ['incorrect source account', {
    ...base, sourceAccountId: 'WRONG'
  }, 'unknown'],
  ['incorrect provider source', {
    ...base,
    providerPayment: {
      ...payment,
      details: { ...payment.details, sourceAccountId: 'WRONG' }
    }
  }, 'unknown'],
  ['incorrect external reference', {
    ...base,
    providerPayment: { ...payment, externalReference: 'WRONG' }
  }, 'unknown'],
  ['conflicting references', {
    ...base,
    providerPayment: {
      ...payment,
      details: { ...payment.details, externalReference: 'WRONG' }
    }
  }, 'unknown'],
  ['missing references', {
    ...base,
    providerPayment: {
      ...payment,
      externalReference: undefined,
      details: { ...payment.details, externalReference: undefined }
    }
  }, 'unknown'],
  ['invalid transfer status', {
    ...base, intent: { ...intent, status: 'failed' }
  }, 'unknown'],
  ['incorrect payment type', {
    ...base, providerPayment: { ...payment, type: 'PAYIN' }
  }, 'unknown'],
  ['incorrect beneficiary', {
    ...base,
    providerPayment: {
      ...payment,
      details: {
        ...payment.details,
        destination: { type: 'BENEFICIARY', id: 'WRONG' }
      }
    }
  }, 'unknown'],
  ['incorrect amount', {
    ...base,
    providerPayment: {
      ...payment,
      details: { ...payment.details, amount: 1.01 }
    }
  }, 'unknown'],
  ['unresolved return evidence', {
    ...base, returnEvidence: { candidate: false }
  }, 'unknown']
];

for (const [name, input, expected] of scenarios) {
  test(name, () => {
    const result = decideModulrPayout(input);

    assert.equal(result.decision, expected);
    assert.equal(result.settlementVerified, false);
    assert.equal(result.accountingAuthorised, false);
    assert.equal(result.retryAuthorised, false);
    assert.equal(result.paymentSubmitted, false);
    assert.equal(result.previewOnly, true);
  });
}


// STEP 765 — outgoing debit regression coverage

const debitIntent = {
  id: 'TEST_TRANSFER',
  provider: 'modulr',
  environment: 'sandbox',
  status: 'confirmed',
  provider_transfer_id: 'TEST_PAYMENT',
  recipient_id: 'TEST_BENEFICIARY',
  amount_minor: 100,
  currency: 'GBP'
};

const debitPayment = {
  id: 'TEST_PAYMENT',
  type: 'PAYOUT',
  status: 'PROCESSED',
  externalReference: 'TEST_TRANSFER',
  details: {
    sourceAccountId: 'TEST_ACCOUNT',
    destination: {
      type: 'BENEFICIARY',
      id: 'TEST_BENEFICIARY'
    },
    amount: 1,
    currency: 'GBP'
  }
};

const debitTransaction = {
  id: 'TEST_TRANSACTION',
  sourceId: 'TEST_PAYMENT',
  account: { id: 'TEST_ACCOUNT' },
  credit: false,
  amount: 1,
  currency: 'GBP'
};

const debitBase = {
  intent: debitIntent,
  providerPayment: debitPayment,
  sourceAccountId: 'TEST_ACCOUNT'
};

const debitScenarios = [
  ['verified outgoing debit', {
    ...debitBase,
    debitEvidence: {
      found: true,
      matched: true,
      transaction: debitTransaction
    }
  }, 'settlement_unverified', true],

  ['no debit evidence', debitBase,
    'settlement_unverified', false],

  ['missing debit transaction', {
    ...debitBase,
    debitEvidence: { found: true, matched: true }
  }, 'unknown', false],

  ['incorrect debit account', {
    ...debitBase,
    debitEvidence: {
      found: true,
      matched: true,
      transaction: {
        ...debitTransaction,
        account: { id: 'WRONG_ACCOUNT' }
      }
    }
  }, 'unknown', false],

  ['incorrect debit amount', {
    ...debitBase,
    debitEvidence: {
      found: true,
      matched: true,
      transaction: { ...debitTransaction, amount: 2 }
    }
  }, 'unknown', false],

  ['credit instead of debit', {
    ...debitBase,
    debitEvidence: {
      found: true,
      matched: true,
      transaction: { ...debitTransaction, credit: true }
    }
  }, 'unknown', false],

  ['unverified lookup', {
    ...debitBase,
    debitEvidence: { found: false, matched: false }
  }, 'unknown', false],

  ['bank return takes precedence', {
    ...debitBase,
    debitEvidence: {
      found: true,
      matched: true,
      transaction: debitTransaction
    },
    returnEvidence: { candidate: true }
  }, 'return_candidate', false]
];

for (const [name, input, expectedDecision, expectedDebit]
     of debitScenarios) {
  test('debit decision — ' + name, () => {
    const result = decideModulrPayout(input);

    assert.equal(result.decision, expectedDecision);
    assert.equal(result.outgoingDebitVerified, expectedDebit);
    assert.equal(result.settlementVerified, false);
    assert.equal(result.accountingAuthorised, false);
    assert.equal(result.retryAuthorised, false);
    assert.equal(result.paymentSubmitted, false);
    assert.equal(result.previewOnly, true);
  });
}
