// Controlled storage of independently validated scheme evidence.
// Database-writing helper: do not connect to live application
// or invoke against a financial database without authorisation.
// Does not submit payments, change payout statuses or finalise accounting.

export function storeValidatedModulrSchemeReference({
  db,
  intentId,
  preview
} = {}) {
  if (!db ||
      typeof intentId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(intentId)) {
    throw new Error('Invalid storage arguments.');
  }

  if (!preview ||
      preview.ok !== true ||
      preview.previewOnly !== true ||
      preview.accountingAuthorised !== false ||
      preview.settlementVerified !== false ||
      preview.retryAuthorised !== false ||
      preview.paymentSubmitted !== false ||
      typeof preview.providerPaymentId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(preview.providerPaymentId) ||
      typeof preview.schemeId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(preview.schemeId) ||
      !Number.isSafeInteger(preview.amountMinor) ||
      preview.amountMinor <= 0 ||
      preview.currency !== 'GBP' ||
      typeof preview.recipientId !== 'string' ||
      !preview.recipientId) {
    throw new Error('Validated reconciliation preview required.');
  }

  db.exec('BEGIN IMMEDIATE');

  try {
    const intent = db.prepare(`
      SELECT id, provider, environment, status,
             provider_transfer_id, provider_scheme_id,
             recipient_id, amount_minor, currency
      FROM payout_transfer_intents
      WHERE id=?
    `).get(intentId);

    if (!intent ||
        intent.provider !== 'modulr' ||
        intent.environment !== 'sandbox' ||
        !['submitted', 'unknown', 'confirmed'].includes(intent.status) ||
        intent.provider_transfer_id !== preview.providerPaymentId ||
        intent.recipient_id !== preview.recipientId ||
        intent.amount_minor !== preview.amountMinor ||
        intent.currency !== preview.currency) {
      throw new Error('Transfer evidence mismatch.');
    }

    if (intent.provider_scheme_id !== null) {
      if (intent.provider_scheme_id !== preview.schemeId) {
        throw new Error('Conflicting scheme reference.');
      }

      db.exec('COMMIT');

      return {
        stored: false,
        alreadyPresent: true,
        accountingAuthorised: false,
        settlementVerified: false,
        retryAuthorised: false
      };
    }

    const updated = db.prepare(`
      UPDATE payout_transfer_intents
      SET provider_scheme_id=?
      WHERE id=?
        AND provider='modulr'
        AND environment='sandbox'
        AND provider_transfer_id=?
        AND recipient_id=?
        AND status IN ('submitted','unknown','confirmed')
        AND amount_minor=?
        AND currency='GBP'
        AND provider_scheme_id IS NULL
    `).run(
      preview.schemeId,
      intentId,
      preview.providerPaymentId,
      preview.recipientId,
      preview.amountMinor
    );

    if (updated.changes !== 1) {
      throw new Error('Scheme-reference storage conflict.');
    }

    db.exec('COMMIT');

    return {
      stored: true,
      alreadyPresent: false,
      accountingAuthorised: false,
      settlementVerified: false,
      retryAuthorised: false
    };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    throw error;
  }
}
