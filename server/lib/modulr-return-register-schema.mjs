// Offline Modulr return-register schema.
//
// Not connected to application startup or financial databases.
// No provider requests, reconciliation, payouts or accounting.
//
// Caller must supply an explicitly isolated test database.

export function createModulrReturnRegisterSchema(
  db,
  { isolatedTestOnly = false } = {}
) {
  if (isolatedTestOnly !== true) {
    throw new Error(
      'Return-register schema requires explicit test isolation.'
    );
  }

  // SQLite reports an empty filename for a true in-memory database.
  // Reject file-backed, attached or otherwise unexpected databases.
  const databases = db.prepare(
    'PRAGMA database_list'
  ).all();

  if (
    databases.length !== 1 ||
    databases[0].name !== 'main' ||
    databases[0].file !== ''
  ) {
    throw new Error(
      'Return-register schema requires an in-memory SQLite database.'
    );
  }

  const applicationTables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name IN (
        'payouts',
        'payout_runs',
        'payout_confirmations',
        'driver_ledger',
        'autocab_adjustments'
      )
  `).all();

  if (applicationTables.length > 0) {
    throw new Error(
      'Return-register schema cannot run against application tables.'
    );
  }

  // Fail closed if an existing table has an incompatible definition.
  const existing = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type='table'
      AND name='modulr_return_register'
  `).get();

  if (existing) {
    const columns = db.prepare(
      'PRAGMA table_info(modulr_return_register)'
    ).all();

    const names = columns.map(column => column.name);

    const required = [
      'return_payment_id',
      'transfer_id',
      'original_payment_id',
      'original_scheme_id',
      'return_reason_code',
      'return_amount_minor',
      'currency',
      'provider_status',
      'evidence_source',
      'status',
      'created_at'
    ];

    if (
      names.length !== required.length ||
      required.some(name => !names.includes(name))
    ) {
      throw new Error(
        'Existing return-register schema is incompatible.'
      );
    }

    const byName = new Map(
      columns.map(column => [column.name, column])
    );

    const primaryKey = byName.get('return_payment_id');

    const foreignKeys = db.prepare(
      'PRAGMA foreign_key_list(modulr_return_register)'
    ).all();

    const validForeignKey = foreignKeys.some(key =>
      key.table === 'payout_transfer_intents' &&
      key.from === 'transfer_id' &&
      key.to === 'id'
    );

    const sql = String(existing.sql || '');

    const manualReviewConstraint =
      /CHECK\s*\(\s*status\s*=\s*'manual_review'\s*\)/i
        .test(sql);

    if (
      primaryKey?.pk !== 1 ||
      !validForeignKey ||
      !manualReviewConstraint
    ) {
      throw new Error(
        'Existing return-register constraints are incompatible.'
      );
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS modulr_return_register (
      return_payment_id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL,
      original_payment_id TEXT NOT NULL,
      original_scheme_id TEXT NOT NULL,
      return_reason_code TEXT,
      return_amount_minor INTEGER
        CHECK(return_amount_minor > 0),
      currency TEXT
        CHECK(currency = 'GBP'),
      provider_status TEXT,
      evidence_source TEXT,
      status TEXT NOT NULL DEFAULT 'manual_review'
        CHECK(status = 'manual_review'),
      created_at TEXT NOT NULL,
      FOREIGN KEY(transfer_id)
        REFERENCES payout_transfer_intents(id)
    );

    CREATE INDEX IF NOT EXISTS
      idx_modulr_return_register_transfer
    ON modulr_return_register(transfer_id);

    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_return_original_payment_match
    BEFORE INSERT ON modulr_return_register
    BEGIN
      SELECT RAISE(
        ABORT,
        'Original payment association mismatch'
      )
      WHERE NOT EXISTS (
        SELECT 1
        FROM payout_transfer_intents t
        WHERE t.id = NEW.transfer_id
          AND t.provider = 'modulr'
          AND t.environment = 'sandbox'
          AND t.provider_transfer_id = NEW.original_payment_id
      );
    END;

    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_return_original_payment_update
    BEFORE UPDATE OF transfer_id, original_payment_id
    ON modulr_return_register
    BEGIN
      SELECT RAISE(
        ABORT,
        'Original payment association cannot be changed'
      )
      WHERE NEW.transfer_id != OLD.transfer_id
         OR NEW.original_payment_id != OLD.original_payment_id;
    END;

    CREATE TRIGGER IF NOT EXISTS
      trg_modulr_return_prevent_delete
    BEFORE DELETE ON modulr_return_register
    BEGIN
      SELECT RAISE(
        ABORT,
        'Return audit records cannot be deleted'
      );
    END;
  `);
}
