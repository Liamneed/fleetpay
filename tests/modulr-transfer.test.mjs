import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  canSubmitModulrTransfer,
  canTransitionModulrTransfer
} from '../server/lib/modulr-transfer-state.mjs';

import { claimValidatedModulrTransfer } from '../server/lib/modulr-validated-claim.mjs';

import {
  transitionModulrTransfer,
  recordModulrTransferSubmission,
  recordMockModulrReconciliation
} from '../server/lib/modulr-transfer-store.mjs';

import {
  classifyModulrSubmission
} from '../server/lib/modulr-transfer-outcome.mjs';

import {
  validateModulrReconciliation
} from '../server/lib/modulr-transfer-reconciliation.mjs';

const fixture = path.resolve(
  'data/faivopay-modulr-preview-fixture.sqlite'
);

function withSnapshot(callback) {
  assert.ok(fs.existsSync(fixture), 'Synthetic fixture missing');

  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'faivopay-modulr-test-')
  );

  const target = path.join(directory, 'snapshot.sqlite');

  let source;
  let db;

  try {
    source = new DatabaseSync(fixture, { readOnly: true });
    source.exec(
      `VACUUM INTO '${target.replaceAll("'", "''")}'`
    );
    source.close();
    source = null;

    db = new DatabaseSync(target);

    const intent = db.prepare(`
      SELECT *
      FROM payout_transfer_intents
      WHERE provider='modulr'
        AND environment='sandbox'
        AND status='prepared'
    `).get();

    assert.ok(intent, 'Prepared synthetic transfer missing');
    assert.equal(intent.amount_minor, 2500);

    // Normalise legacy synthetic bank references in this temporary
    // SQLite snapshot only. Never modify the original fixture.
    const payout = db.prepare(
      'SELECT driver_id FROM payouts WHERE id=?'
    ).get(intent.payout_id);

    const bank = db.prepare(`
      SELECT sort_code_last2, account_number_last4
      FROM driver_bank_accounts WHERE driver_id=?
    `).get(payout.driver_id);

    assert.ok(bank, 'Synthetic bank record missing');

    db.prepare(`
      UPDATE payout_transfer_intents
      SET recipient_sort_code_last2=?,
          recipient_account_last4=?
      WHERE id=? AND status='prepared'
    `).run(
      bank.sort_code_last2,
      bank.account_number_last4,
      intent.id
    );

    return callback(db, intent);

  } finally {
    db?.close();
    source?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

// Synthetic fixture only: no provider lookup and no payment execution.
function claimSynthetic(db, intent) {
  const columns = db.prepare(
    'PRAGMA table_info(payout_transfer_intents)'
  ).all();

  if (!columns.some(column => column.name === 'attempt_started_at')) {
    db.exec(
      'ALTER TABLE payout_transfer_intents ADD COLUMN attempt_started_at TEXT'
    );
  }

  const payout = db.prepare('SELECT * FROM payouts WHERE id=?')
    .get(intent.payout_id);
  const bank = db.prepare('SELECT * FROM driver_bank_accounts WHERE driver_id=?')
    .get(payout.driver_id);
  return claimValidatedModulrTransfer(db, intent.id, {
    matched: true,
    beneficiaryId: intent.recipient_id,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    approvalRequired: false,
    bankUpdatedAt: bank.updated_at,
    bankSortCodeEnc: bank.sort_code_enc,
    bankAccountNumberEnc: bank.account_number_enc
  });
}

test('Only prepared transfers can be submitted', () => {
  assert.equal(canSubmitModulrTransfer('prepared'), true);

  for (const status of [
    'submitting', 'submitted', 'unknown',
    'confirmed', 'failed', 'cancelled'
  ]) {
    assert.equal(canSubmitModulrTransfer(status), false);
  }

  assert.equal(
    canTransitionModulrTransfer('unknown', 'submitting'),
    false
  );
});

test('An atomic claim cannot be repeated', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    assert.throws(() => {
      transitionModulrTransfer(
        db, intent.id, 'prepared', 'submitting'
      );
    });

    const saved = db.prepare(`
      SELECT status FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    assert.equal(saved.status, 'submitting');
  });
});

test('Provider reference is stored once', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    recordModulrTransferSubmission(
      db, intent.id, 'mock_transfer_001'
    );

    assert.throws(() => {
      recordModulrTransferSubmission(
        db, intent.id, 'mock_transfer_002'
      );
    });

    const saved = db.prepare(`
      SELECT status, provider_transfer_id
      FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    assert.equal(saved.status, 'submitted');
    assert.equal(saved.provider_transfer_id, 'mock_transfer_001');
  });
});

test('Uncertain outcomes cannot automatically retry', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    const outcome = classifyModulrSubmission({
      timeout: true
    });

    assert.equal(outcome.status, 'unknown');

    transitionModulrTransfer(
      db, intent.id, 'submitting', 'unknown'
    );

    assert.throws(() => {
      transitionModulrTransfer(
        db, intent.id, 'unknown', 'submitting'
      );
    });
  });
});

test('Mock reconciliation does not pay the driver', () => {
  withSnapshot((db, intent) => {
    const before = db.prepare(`
      SELECT status, paid_at FROM payouts WHERE id=?
    `).get(intent.payout_id);

    const evidenceBefore = db.prepare(`
      SELECT COUNT(*) AS count
      FROM payout_confirmations WHERE payout_id=?
    `).get(intent.payout_id).count;

    claimSynthetic(db, intent);

    recordModulrTransferSubmission(
      db, intent.id, 'mock_transfer_001'
    );

    const submitted = db.prepare(`
      SELECT * FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    const validation = validateWithSource(
      submitted,
      {
        id: 'mock_transfer_001',
        status: 'PROCESSED',
        details: {
          sourceAccountId: 'A_TEST_001',
          destination: {
            type: 'BENEFICIARY',
            id: submitted.recipient_id
          },
          amount: 2500 / 100,
          currency: 'GBP'
        }
      }
    );

    assert.equal(validation.verified, true);

    const result = recordMockModulrReconciliation(
      db, intent.id, validation
    );

    assert.equal(result.simulated, true);
    assert.equal(result.accountingFinalised, false);

    assert.throws(() => {
      recordMockModulrReconciliation(
        db, intent.id, validation
      );
    });

    const after = db.prepare(`
      SELECT status, paid_at FROM payouts WHERE id=?
    `).get(intent.payout_id);

    assert.deepEqual(after, before);

    const evidenceAfter = db.prepare(`
      SELECT COUNT(*) AS count
      FROM payout_confirmations WHERE payout_id=?
    `).get(intent.payout_id).count;

    assert.equal(evidenceAfter, evidenceBefore);
  });
});

test('Incorrect provider details fail reconciliation', () => {
  const intent = {
    provider: 'modulr',
    environment: 'sandbox',
    status: 'submitted',
    provider_transfer_id: 'mock_transfer_001',
    recipient_id: 'mock_beneficiary_001',
    amount_minor: 2500,
    currency: 'GBP'
  };

  const payment = {
    id: 'mock_transfer_001',
    status: 'PROCESSED',
    details: {
      sourceAccountId: 'A_TEST_001',
      destination: {
        type: 'BENEFICIARY',
        id: 'mock_beneficiary_001'
      },
      amount: 25,
      currency: 'GBP'
    }
  };

  assert.equal(
    validateWithSource(
      intent, { ...payment, details: { ...payment.details, amount: 26 } }
    ).verified,
    false
  );

  assert.equal(
    validateWithSource(
      intent, { ...payment, details: {
        ...payment.details,
        destination: { type: 'BENEFICIARY', id: 'wrong' }
      } }
    ).verified,
    false
  );

  assert.equal(
    validateWithSource(
      intent, { ...payment, status: 'PENDING' }
    ).verified,
    false
  );

  assert.equal(
    validateWithSource(
      intent, { ...payment, details: { ...payment.details, currency: 'EUR' } }
    ).verified,
    false
  );
});


test('Generic transitions cannot establish final payment outcomes', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    recordModulrTransferSubmission(
      db, intent.id, 'mock_final_guard'
    );

    assert.throws(() => {
      transitionModulrTransfer(
        db, intent.id, 'submitted', 'confirmed'
      );
    });

    assert.throws(() => {
      transitionModulrTransfer(
        db, intent.id, 'submitted', 'failed'
      );
    });

    const saved = db.prepare(`
      SELECT status FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    assert.equal(saved.status, 'submitted');
  });
});

test('Mock confirmation never creates a genuine confirmed transfer', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    recordModulrTransferSubmission(
      db, intent.id, 'mock_safe_confirmation'
    );

    const submitted = db.prepare(`
      SELECT * FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    const validation = validateWithSource(
      submitted,
      {
        id: 'mock_safe_confirmation',
        status: 'PROCESSED',
        details: {
          sourceAccountId: 'A_TEST_001',
          destination: {
            type: 'BENEFICIARY',
            id: submitted.recipient_id
          },
          amount: submitted.amount_minor / 100,
          currency: 'GBP'
        }
      }
    );

    const result = recordMockModulrReconciliation(
      db, intent.id, validation
    );

    assert.equal(result.status, 'unknown');
    assert.equal(result.simulated, true);

    const saved = db.prepare(`
      SELECT status, provider_status, confirmed_at
      FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    assert.equal(saved.status, 'unknown');
    assert.equal(saved.provider_status, 'MOCK_ONLY');
    assert.equal(saved.confirmed_at, null);

    assert.throws(() => {
      recordMockModulrReconciliation(
        db, intent.id, validation
      );
    });
  });
});


// Offline submission simulation only. No fetch, network, or financial finalisation.
test('Simulated Modulr 201 records one provider reference', () => {
  withSnapshot((db, intent) => {
    const claim = claimSynthetic(db, intent);
    const claimed = db.prepare(
      'SELECT * FROM payout_transfer_intents WHERE id=?'
    ).get(intent.id);

    assert.equal(claim.status, 'submitting');
    assert.equal(claimed.status, 'submitting');

    const response = classifyModulrSubmission({
      httpStatus: 201,
      body: { id: 'P_SIMULATED_302', status: 'VALIDATED' }
    });

    assert.equal(response.status, 'submitted');

    const result = recordModulrTransferSubmission(
      db, intent.id, response.providerTransferId
    );

    assert.equal(result.status, 'submitted');

    const saved = db.prepare(`
      SELECT status, provider_transfer_id
      FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    assert.equal(saved.status, 'submitted');
    assert.equal(saved.provider_transfer_id, 'P_SIMULATED_302');

    assert.throws(() => recordModulrTransferSubmission(
      db, intent.id, 'P_DUPLICATE_302'
    ));

    const payout = db.prepare(
      'SELECT status, paid_at FROM payouts WHERE id=?'
    ).get(intent.payout_id);

    assert.equal(payout.status, 'batched');
    assert.equal(payout.paid_at, null);
    assert.equal(db.prepare(
      'SELECT COUNT(*) AS n FROM payout_confirmations WHERE payout_id=?'
    ).get(intent.payout_id).n, 0);
  });
});

test('Simulated timeout becomes unknown and blocks another claim', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    const response = classifyModulrSubmission({ timeout: true });
    assert.equal(response.status, 'unknown');

    transitionModulrTransfer(
      db, intent.id, 'submitting', 'unknown'
    );

    const saved = db.prepare(`
      SELECT status, provider_transfer_id
      FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    assert.equal(saved.status, 'unknown');
    assert.equal(saved.provider_transfer_id, null);

    assert.throws(() => claimSynthetic(db, intent));
    assert.throws(() => transitionModulrTransfer(
      db, intent.id, 'unknown', 'submitting'
    ));

    assert.equal(db.prepare(
      'SELECT paid_at FROM payouts WHERE id=?'
    ).get(intent.payout_id).paid_at, null);
  });
});

test('Malformed provider creation stays uncertain', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    const response = classifyModulrSubmission({
      httpStatus: 201,
      body: { status: 'VALIDATED' }
    });

    assert.equal(response.status, 'unknown');

    transitionModulrTransfer(
      db, intent.id, 'submitting', 'unknown'
    );

    const saved = db.prepare(
      'SELECT status, provider_transfer_id FROM payout_transfer_intents WHERE id=?'
    ).get(intent.id);

    assert.equal(saved.status, 'unknown');
    assert.equal(saved.provider_transfer_id, null);
    assert.throws(() => claimSynthetic(db, intent));
  });
});

test('HTTP failure never records a submitted payment', () => {
  withSnapshot((db, intent) => {
    claimSynthetic(db, intent);

    for (const code of [400, 429, 500]) {
      assert.equal(classifyModulrSubmission({
        httpStatus: code
      }).status, 'unknown');
    }

    transitionModulrTransfer(
      db, intent.id, 'submitting', 'unknown'
    );

    assert.throws(() => recordModulrTransferSubmission(
      db, intent.id, 'P_UNAUTHORISED_302'
    ));

    assert.equal(db.prepare(
      'SELECT paid_at FROM payouts WHERE id=?'
    ).get(intent.payout_id).paid_at, null);
  });
});


function validateWithSource(intent, payment) {
  return validateModulrReconciliation(intent, payment, 'A_TEST_001');
}
