// Additive Modulr scheme-reference schema support.
//
// Must only be called during an explicitly authorised
// database schema upgrade.
//
// Never creates payments, changes payout statuses,
// reconciles accounting or posts Autocab adjustments.

export function ensureModulrSchemeReferenceColumn(db) {
  const columns = db.prepare(
    'PRAGMA table_info(payout_transfer_intents)'
  ).all();

  if (!columns.some(column => column.name === 'id') ||
      !columns.some(column => column.name === 'provider_transfer_id')) {
    throw new Error(
      'Expected payout transfer schema is missing.'
    );
  }

  if (columns.some(column => column.name === 'provider_scheme_id')) {
    return {
      changed: false,
      column: 'provider_scheme_id'
    };
  }

  db.exec(
    'ALTER TABLE payout_transfer_intents ' +
    'ADD COLUMN provider_scheme_id TEXT'
  );

  return {
    changed: true,
    column: 'provider_scheme_id'
  };
}
