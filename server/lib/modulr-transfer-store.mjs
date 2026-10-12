import {
  assertModulrTransferTransition
} from './modulr-transfer-state.mjs';

// Local state management only. Never contacts Modulr.
export function transitionModulrTransfer(db, intentId, from, to) {
  assertModulrTransferTransition(from, to);

  // The generic writer may only cancel an untouched intent or move an
  // in-flight transfer into an uncertain state. It cannot claim, submit,
  // confirm, fail or resurrect a transfer without independent evidence.
  if (!((from === 'prepared' && to === 'cancelled') ||
        (from === 'submitting' && to === 'unknown') ||
        (from === 'submitted' && to === 'unknown'))) {
    throw new Error('This transition requires a dedicated verified workflow.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const intent = db.prepare(`
      SELECT id, status, provider, environment
      FROM payout_transfer_intents
      WHERE id = ?
    `).get(intentId);

    if (
      !intent ||
      intent.provider !== 'modulr' ||
      intent.environment !== 'sandbox' ||
      intent.status !== from
    ) {
      throw new Error('Transfer state changed or is ineligible.');
    }

    const now = new Date().toISOString();

    const result = db.prepare(`
      UPDATE payout_transfer_intents
      SET status = ?, updated_at = ?
      WHERE id = ?
        AND status = ?
        AND provider = 'modulr'
        AND environment = 'sandbox'
    `).run(to, now, intentId, from);

    if (result.changes !== 1) {
      throw new Error('Transfer state changed during update.');
    }

    db.exec('COMMIT');
    return { ok: true, status: to };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

// Record provider acceptance atomically.
// Caller must supply a validated provider transfer ID.
// No HTTP requests, accounting writes or Autocab operations.
export function recordModulrTransferSubmission(db, intentId, transferId) {
  if (typeof transferId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(transferId)) {
    throw new Error('Valid provider transfer ID required.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const intent = db.prepare(`
      SELECT id, status, provider_transfer_id
      FROM payout_transfer_intents
      WHERE id=?
        AND provider='modulr'
        AND environment='sandbox'
    `).get(intentId);

    if (!intent || intent.status !== 'submitting' ||
        intent.provider_transfer_id) {
      throw new Error('Transfer is not eligible for submission recording.');
    }

    const now = new Date().toISOString();

    const result = db.prepare(`
      UPDATE payout_transfer_intents
      SET status='submitted',
          provider_transfer_id=?,
          provider_status='SUBMITTED',
          submitted_at=?,
          updated_at=?
      WHERE id=?
        AND status='submitting'
        AND provider_transfer_id IS NULL
        AND provider='modulr'
        AND environment='sandbox'
    `).run(transferId, now, now, intentId);

    if (result.changes !== 1) {
      throw new Error('Transfer changed during submission recording.');
    }

    db.exec('COMMIT');

    return { ok: true, status: 'submitted' };

  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

// Record a MOCK reconciliation result only.
// This function is not authorised to establish provider-paid evidence.
// Never connect it to a production route or actual Modulr response.
export function recordMockModulrReconciliation(db, intentId, validation) {
  if (
    !validation ||
    validation.verified !== true ||
    validation.status !== 'confirmed' ||
    typeof validation.providerTransferId !== 'string' ||
    !validation.providerTransferId.trim() ||
    !Number.isSafeInteger(validation.amountMinor) ||
    validation.amountMinor <= 0 ||
    validation.currency !== 'GBP'
  ) {
    throw new Error('Valid mock reconciliation required.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const intent = db.prepare(`
      SELECT id, status, provider_transfer_id,
             provider_status, amount_minor, currency
      FROM payout_transfer_intents
      WHERE id=?
        AND provider='modulr'
        AND environment='sandbox'
    `).get(intentId);

    if (
      !intent ||
      !['submitted', 'unknown'].includes(intent.status) ||
      intent.provider_status === 'MOCK_ONLY' ||
      !intent.provider_transfer_id ||
      intent.provider_transfer_id !== validation.providerTransferId ||
      intent.amount_minor !== validation.amountMinor ||
      intent.currency !== validation.currency
    ) {
      throw new Error('Mock reconciliation does not match transfer.');
    }

    const now = new Date().toISOString();

    const changed = db.prepare(`
      UPDATE payout_transfer_intents
      SET status='unknown',
          provider_status='MOCK_ONLY',
          updated_at=?
      WHERE id=?
        AND status=?
        AND provider_transfer_id=?
        AND amount_minor=?
        AND currency='GBP'
        AND provider='modulr'
        AND environment='sandbox'
    `).run(
      now,
      intentId,
      intent.status,
      validation.providerTransferId,
      validation.amountMinor
    );

    if (changed.changes !== 1) {
      throw new Error('Transfer changed during mock reconciliation.');
    }

    db.exec('COMMIT');

    return {
      ok: true,
      status: 'unknown',
      simulated: true,
      accountingFinalised: false
    };

  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
