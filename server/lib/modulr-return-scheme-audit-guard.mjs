// Additional Modulr bank-return audit protection.
//
// IN-MEMORY TEST DATABASES ONLY.
// Never invoke against the application financial database.
// Does not confirm a return, authorise accounting or retry payments.

export function installModulrReturnSchemeAuditGuard(
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

  // Never silently accept previously mismatched audit records.
  const mismatch = db.prepare(`
    SELECT r.return_payment_id
    FROM modulr_return_register r
    LEFT JOIN payout_transfer_intents t
      ON t.id = r.transfer_id
    WHERE t.id IS NULL
       OR t.provider != 'modulr'
       OR t.environment != 'sandbox'
       OR t.provider_transfer_id IS NULL
       OR t.provider_scheme_id IS NULL
       OR t.provider_transfer_id != r.original_payment_id
       OR t.provider_scheme_id != r.original_scheme_id
    LIMIT 1
  `).get();

  if (mismatch) {
    throw new Error(
      'Existing return audit evidence is inconsistent.'
    );
  }

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_return_scheme_match
    BEFORE INSERT ON modulr_return_register
    BEGIN
      SELECT RAISE(
        ABORT,
        'Original scheme association mismatch'
      )
      WHERE NOT EXISTS (
        SELECT 1
        FROM payout_transfer_intents t
        WHERE t.id = NEW.transfer_id
          AND t.provider = 'modulr'
          AND t.environment = 'sandbox'
          AND t.provider_transfer_id =
              NEW.original_payment_id
          AND t.provider_scheme_id =
              NEW.original_scheme_id
          AND t.provider_scheme_id IS NOT NULL
      );
    END;

    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_return_scheme_immutable
    BEFORE UPDATE OF original_scheme_id
    ON modulr_return_register
    BEGIN
      SELECT RAISE(
        ABORT,
        'Original scheme reference cannot be changed'
      )
      WHERE NEW.original_scheme_id IS NOT
            OLD.original_scheme_id;
    END;
  `);

  return {
    installed: true,
    accountingAuthorised: false,
    settlementVerified: false,
    retryAuthorised: false
  };
}
