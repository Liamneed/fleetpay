// Modulr accounting eligibility preview.
// Read-only: no payout updates, ledger writes, provider requests
// or Autocab operations.

export function previewModulrAccounting(db, transferId) {
  if (process.env.MODULR_ENV !== 'sandbox' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED === 'true') {
    throw new Error('Modulr accounting preview requires sandbox with finalisation disabled.');
  }

  if (typeof transferId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(transferId)) {
    throw new Error('Valid transfer ID required.');
  }

  const transfer = db.prepare(`
    SELECT *
    FROM payout_transfer_intents
    WHERE id=?
      AND provider='modulr'
      AND environment='sandbox'
  `).get(transferId);

  if (!transfer) {
    throw new Error('Modulr sandbox transfer not found.');
  }

  const payout = db.prepare(`
    SELECT *
    FROM payouts
    WHERE id=?
  `).get(transfer.payout_id);

  const run = db.prepare(`
    SELECT *
    FROM payout_runs
    WHERE id=?
  `).get(transfer.payout_run_id);

  const issues = [];

  // Provider PROCESSED is not independent bank settlement evidence.
  // Keep the accounting preview ineligible until a separate,
  // authenticated settlement-verification mechanism exists.
  issues.push('independent_settlement_evidence_missing');

  if (!payout || !run) {
    issues.push('payout_or_run_missing');
  } else {
    if (payout.payout_run_id !== transfer.payout_run_id) {
      issues.push('payout_run_mismatch');
    }

    if (payout.status !== 'batched' || payout.paid_at) {
      issues.push('payout_not_eligible');
    }

    if (run.status !== 'funded' ||
        run.funding_status !== 'cleared') {
      issues.push('run_not_funded');
    }

    if (run.provider !== 'modulr') {
      issues.push('run_provider_mismatch');
    }

    if (run.paid_at || run.reconciled_at ||
        run.status === 'cancelled') {
      issues.push('run_already_completed');
    }

    const expectedMinor = Math.round(
      Number(payout.net_amount ?? payout.amount ?? 0) * 100
    );

    if (!Number.isSafeInteger(expectedMinor) ||
        expectedMinor <= 0 ||
        expectedMinor !== transfer.amount_minor) {
      issues.push('amount_mismatch');
    }
  }

  if (transfer.status !== 'confirmed' ||
      transfer.provider_status !== 'PROCESSED' ||
      !transfer.confirmed_at ||
      !transfer.provider_transfer_id) {
    issues.push('provider_not_confirmed');
  }

  if (transfer.currency !== 'GBP') {
    issues.push('currency_mismatch');
  }

  const historyTable = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name='modulr_payment_events'
  `).get();

  if (!historyTable) {
    issues.push('audit_history_missing');
  } else {
    const history = db.prepare(`
      SELECT event_type
      FROM modulr_payment_events
      WHERE transfer_id=?
    `).all(transferId);

    if (history.filter(x => x.event_type === 'confirmed').length !== 1) {
      issues.push('confirmation_history_invalid');
    }

    if (history.some(x => x.event_type === 'returned')) {
      issues.push('payment_returned');
    }

    if (history.some(x => x.event_type === 'accounting_finalised')) {
      issues.push('already_finalised');
    }
  }



  // Confirm the entire payout run is internally consistent.
  if (run) {
    const runItems = db.prepare(`
      SELECT id, net_amount, amount
      FROM payouts
      WHERE payout_run_id=?
    `).all(run.id);

    const totalMinor = runItems.reduce(
      (total, item) => total +
        Math.round(Number(item.net_amount ?? item.amount ?? 0) * 100),
      0
    );

    if (
      runItems.length !== Number(run.item_count) ||
      totalMinor !== Math.round(Number(run.total_amount) * 100)
    ) {
      issues.push('run_contents_mismatch');
    }
  }

  // Verify trusted reconciliation history, not merely event count.
  if (historyTable) {
    const confirmations = db.prepare(`
      SELECT provider_reference, provider_status, source
      FROM modulr_payment_events
      WHERE transfer_id=?
        AND event_type='confirmed'
    `).all(transferId);

    if (
      confirmations.length !== 1 ||
      confirmations[0].provider_reference !== transfer.provider_transfer_id ||
      confirmations[0].provider_status !== 'PROCESSED' ||
      confirmations[0].source !== 'modulr_api'
    ) {
      issues.push('trusted_confirmation_missing');
    }
  }

  // Fail closed if accounting records already exist.
  // These checks do not create or modify financial entries.
  const accountingTables = [
    'driver_ledger',
    'fee_ledger',
    'payout_confirmations'
  ];

  const availableTables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
  `).all();

  const tableNames = new Set(
    availableTables.map(row => row.name)
  );

  for (const table of accountingTables) {
    if (!tableNames.has(table)) {
      issues.push('accounting_table_missing:' + table);
    }
  }

  if (tableNames.has('driver_ledger')) {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count
      FROM driver_ledger
      WHERE reference_id=?
        AND entry_type IN (
          'weekly_payout',
          'early_payout',
          'early_payout_fee'
        )
    `).get(transfer.payout_id);

    if (existing.count > 0) {
      issues.push('existing_ledger_entries');
    }
  }

  if (tableNames.has('fee_ledger')) {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count
      FROM fee_ledger
      WHERE source_type='payout'
        AND source_id=?
    `).get(transfer.payout_id);

    if (existing.count > 0) {
      issues.push('existing_fee_records');
    }
  }

  if (tableNames.has('payout_confirmations')) {
    const existing = db.prepare(`
      SELECT COUNT(*) AS count
      FROM payout_confirmations
      WHERE payout_id=?
    `).get(transfer.payout_id);

    if (existing.count > 0) {
      issues.push('existing_provider_confirmations');
    }
  }

  return {
    transferId,
    payoutId: transfer.payout_id,
    payoutRunId: transfer.payout_run_id,
    providerReference: transfer.provider_transfer_id,
    amountMinor: transfer.amount_minor,
    currency: transfer.currency,
    eligible: issues.length === 0,
    issues,
    previewOnly: true,
    accountingFinalised: false,
    autocabReconciled: false
  };
}
