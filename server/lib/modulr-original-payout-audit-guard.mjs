// Protect original Modulr payout references against changes that
// would invalidate previously recorded bank-return evidence.
//
// ISOLATED IN-MEMORY SQLITE TESTS ONLY.
// Never install against an application or financial database.
// Does not authorise settlement, accounting or payment retries.

export function installModulrOriginalPayoutAuditGuard(
  db,
  { isolatedTestOnly = false } = {}
) {
  if (isolatedTestOnly !== true) {
    throw new Error('Explicit test isolation required.');
  }

  const databases = db.prepare('PRAGMA database_list').all();

  if (
    databases.length !== 1 ||
    databases[0].name !== 'main' ||
    databases[0].file !== ''
  ) {
    throw new Error('In-memory SQLite database required.');
  }

  const required = [
    ['payout_transfer_intents', 'id'],
    ['payout_transfer_intents', 'provider_transfer_id'],
    ['payout_transfer_intents', 'provider_scheme_id'],
    ['modulr_return_register', 'transfer_id'],
    ['modulr_return_register', 'original_payment_id'],
    ['modulr_return_register', 'original_scheme_id']
  ];

  for (const [table, column] of required) {
    const columns = db.prepare(
      `PRAGMA table_info(${table})`
    ).all();

    if (!columns.some(item => item.name === column)) {
      throw new Error(
        `Required audit column missing: ${table}.${column}`
      );
    }
  }

  // Refuse installation if existing return references already
  // disagree with the original payout.
  const mismatch = db.prepare(`
    SELECT r.return_payment_id
    FROM modulr_return_register r
    LEFT JOIN payout_transfer_intents t
      ON t.id = r.transfer_id
    WHERE t.id IS NULL
       OR t.provider != 'modulr'
       OR t.environment != 'sandbox'
       OR t.provider_transfer_id IS NOT r.original_payment_id
       OR t.provider_scheme_id IS NOT r.original_scheme_id
       OR t.provider_transfer_id IS NULL
       OR t.provider_scheme_id IS NULL
    LIMIT 1
  `).get();

  if (mismatch) {
    throw new Error(
      'Existing original payout audit evidence is inconsistent.'
    );
  }

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_original_payment_immutable
    BEFORE UPDATE OF provider_transfer_id
    ON payout_transfer_intents
    WHEN NEW.provider_transfer_id IS NOT OLD.provider_transfer_id
      AND EXISTS (
        SELECT 1
        FROM modulr_return_register r
        WHERE r.transfer_id = OLD.id
      )
    BEGIN
      SELECT RAISE(
        ABORT,
        'Original payout payment reference cannot be changed'
      );
    END;

    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_original_scheme_immutable
    BEFORE UPDATE OF provider_scheme_id
    ON payout_transfer_intents
    WHEN NEW.provider_scheme_id IS NOT OLD.provider_scheme_id
      AND EXISTS (
        SELECT 1
        FROM modulr_return_register r
        WHERE r.transfer_id = OLD.id
      )
    BEGIN
      SELECT RAISE(
        ABORT,
        'Original payout scheme reference cannot be changed'
      );
    END;
  `);

  return {
    installed: true,
    accountingAuthorised: false,
    settlementVerified: false,
    retryAuthorised: false
  };
}
