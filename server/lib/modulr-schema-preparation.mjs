// Modulr schema preparation for isolated integration tests.
//
// Not connected to application startup.
// Never run against a real financial database.
// No payments, accounting or Autocab operations.

import {
  ensureModulrSchemeReferenceColumn
} from './modulr-scheme-reference-schema.mjs';

export function prepareIsolatedModulrSchema(
  db,
  { isolatedTestOnly = false } = {}
) {
  if (isolatedTestOnly !== true) {
    throw new Error('Explicit test isolation required.');
  }

  const databases = db.prepare(
    'PRAGMA database_list'
  ).all();

  if (
    databases.length !== 1 ||
    databases[0].name !== 'main' ||
    databases[0].file !== ''
  ) {
    throw new Error('In-memory SQLite database required.');
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
      'Application financial tables are not permitted.'
    );
  }

  const result = ensureModulrSchemeReferenceColumn(db);

  return {
    prepared: true,
    schemaChanged: result.changed,
    column: result.column,
    paymentAuthorised: false,
    accountingAuthorised: false,
    settlementVerified: false,
    retryAuthorised: false,
    autocabWritesAuthorised: false
  };
}
