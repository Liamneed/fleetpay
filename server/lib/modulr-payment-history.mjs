// Append-only Modulr payment history.
// No provider requests, payment submission or accounting writes.

import crypto from 'node:crypto';

export const MODULR_EVENT_TYPES = Object.freeze([
  'prepared',
  'submitting',
  'submitted',
  'processing',
  'confirmed',
  'failed',
  'unknown',
  'cancelled',
  'returned',
  'accounting_finalised',
  'autocab_posted',
  'autocab_failed'
]);

export function createModulrPaymentHistoryTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS modulr_payment_events (
      id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      provider_reference TEXT,
      provider_status TEXT,
      reason TEXT,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(transfer_id)
        REFERENCES payout_transfer_intents(id)
    );

    CREATE INDEX IF NOT EXISTS idx_modulr_payment_events_transfer
    ON modulr_payment_events(transfer_id, created_at, id);
  `);
}

export function recordModulrPaymentEvent(db, {
  transferId,
  eventType,
  providerReference = null,
  providerStatus = null,
  reason = null,
  source = 'system'
}) {
  if (typeof transferId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(transferId)) {
    throw new Error('Valid transfer ID required.');
  }

  if (!MODULR_EVENT_TYPES.includes(eventType)) {
    throw new Error('Invalid Modulr payment event.');
  }

  if (typeof source !== 'string' ||
      !/^[A-Za-z0-9:_-]{1,80}$/.test(source)) {
    throw new Error('Valid payment event source required.');
  }

  for (const value of [providerReference, providerStatus, reason]) {
    if (value !== null &&
        (typeof value !== 'string' || value.length > 300)) {
      throw new Error('Invalid payment event detail.');
    }
  }

  const transfer = db.prepare(`
    SELECT id, provider_transfer_id
    FROM payout_transfer_intents
    WHERE id=? AND provider='modulr'
  `).get(transferId);

  if (!transfer) {
    throw new Error('Modulr transfer not found.');
  }

  if (providerReference !== null &&
      transfer.provider_transfer_id !== providerReference) {
    throw new Error('Provider reference mismatch.');
  }

  const event = {
    id: crypto.randomUUID(),
    transferId,
    eventType,
    providerReference: providerReference ?? transfer.provider_transfer_id,
    providerStatus,
    reason,
    source,
    createdAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO modulr_payment_events (
      id, transfer_id, event_type, provider_reference,
      provider_status, reason, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.transferId,
    event.eventType,
    event.providerReference,
    event.providerStatus,
    event.reason,
    event.source,
    event.createdAt
  );

  return event;
}

export function getModulrPaymentHistory(db, transferId) {
  return db.prepare(`
    SELECT id,
           transfer_id AS transferId,
           event_type AS eventType,
           provider_reference AS providerReference,
           provider_status AS providerStatus,
           reason,
           source,
           created_at AS createdAt
    FROM modulr_payment_events
    WHERE transfer_id=?
    ORDER BY created_at, id
  `).all(transferId);
}
