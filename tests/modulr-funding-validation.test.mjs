import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateModulrFundingBalance
} from '../server/lib/modulr-funding-validation.mjs';

const account = {
  id: 'ACCOUNT_TEST',
  customerId: 'CUSTOMER_TEST',
  currency: 'GBP',
  status: 'ACTIVE',
  availableBalance: '125.50'
};

function check(overrides = {}) {
  return validateModulrFundingBalance({
    account,
    accountId: 'ACCOUNT_TEST',
    customerId: 'CUSTOMER_TEST',
    requiredMinor: 12550,
    ...overrides
  });
}

test('exact available amount is accepted', () => {
  assert.equal(check().verified, true);
  assert.equal(check().availableMinor, 12550);
  assert.equal(check().fundingAuthorised, false);
});

test('insufficient funds are rejected', () => {
  assert.equal(
    check({ requiredMinor: 12551 }).reason,
    'insufficient_available_balance'
  );
});

test('wrong account is rejected', () => {
  assert.equal(
    check({ accountId: 'WRONG' }).verified,
    false
  );
});

test('inactive account is rejected', () => {
  assert.equal(
    check({
      account: { ...account, status: 'INACTIVE' }
    }).verified,
    false
  );
});

test('invalid balance is rejected', () => {
  assert.equal(
    check({
      account: { ...account, availableBalance: '125.999' }
    }).verified,
    false
  );
});

test('invalid required amount is rejected', () => {
  assert.equal(
    check({ requiredMinor: 0 }).verified,
    false
  );
});

test('no payment execution is authorised', () => {
  const result = check();
  assert.equal(result.paymentSubmitted, false);
  assert.equal(result.fundingAuthorised, false);
});
