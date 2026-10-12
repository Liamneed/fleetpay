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

    return callback(db, intent);

  } finally {
    db?.close();
    source?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
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
    transitionModulrTransfer(
      db, intent.id, 'prepared', 'submitting'
    );

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
    transitionModulrTransfer(
      db, intent.id, 'prepared', 'submitting'
    );

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
    transitionModulrTransfer(
      db, intent.id, 'prepared', 'submitting'
    );

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

    transitionModulrTransfer(
      db, intent.id, 'prepared', 'submitting'
    );

    recordModulrTransferSubmission(
      db, intent.id, 'mock_transfer_001'
    );

    const submitted = db.prepare(`
      SELECT * FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    const validation = validateModulrReconciliation(
      submitted,
      {
        id: 'mock_transfer_001',
        recipientId: submitted.recipient_id,
        amountMinor: 2500,
        currency: 'GBP',
        status: 'COMPLETED'
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
    recipientId: 'mock_beneficiary_001',
    amountMinor: 2500,
    currency: 'GBP',
    status: 'COMPLETED'
  };

  assert.equal(
    validateModulrReconciliation(
      intent, { ...payment, amountMinor: 2600 }
    ).verified,
    false
  );

  assert.equal(
    validateModulrReconciliation(
      intent, { ...payment, recipientId: 'wrong' }
    ).verified,
    false
  );

  assert.equal(
    validateModulrReconciliation(
      intent, { ...payment, status: 'PENDING' }
    ).verified,
    false
  );

  assert.equal(
    validateModulrReconciliation(
      intent, { ...payment, currency: 'EUR' }
    ).verified,
    false
  );
});


test('Generic transitions cannot establish final payment outcomes', () => {
  withSnapshot((db, intent) => {
    transitionModulrTransfer(
      db, intent.id, 'prepared', 'submitting'
    );

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
    transitionModulrTransfer(
      db, intent.id, 'prepared', 'submitting'
    );

    recordModulrTransferSubmission(
      db, intent.id, 'mock_safe_confirmation'
    );

    const submitted = db.prepare(`
      SELECT * FROM payout_transfer_intents WHERE id=?
    `).get(intent.id);

    const validation = validateModulrReconciliation(
      submitted,
      {
        id: 'mock_safe_confirmation',
        recipientId: submitted.recipient_id,
        amountMinor: submitted.amount_minor,
        currency: 'GBP',
        status: 'COMPLETED'
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
