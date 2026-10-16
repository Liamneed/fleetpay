import test from 'node:test';
import assert from 'node:assert/strict';

import {
  previewModulrAccounting
} from '../server/lib/modulr-accounting-preview.mjs';

// Synthetic read-only database interface.
// No SQLite database, provider API or financial records are opened.

const TRANSFER = 'TRANSFER_SYNTHETIC_001';

function mockDb() {
  return {
    prepare(sql) {
      const query = sql.replace(/\s+/g, ' ').trim();

      return {
        get() {
          if (query.includes('FROM payout_transfer_intents')) {
            return {
              id: TRANSFER,
              provider: 'modulr',
              environment: 'sandbox',
              payout_id: 'PAYOUT_SYNTHETIC',
              payout_run_id: 'RUN_SYNTHETIC',
              provider_transfer_id: 'PROVIDER_SYNTHETIC',
              amount_minor: 100,
              currency: 'GBP',
              status: 'confirmed',
              provider_status: 'PROCESSED',
              confirmed_at: '2026-10-15T18:00:00Z'
            };
          }

          if (query.includes('FROM payouts')) {
            return {
              id: 'PAYOUT_SYNTHETIC',
              payout_run_id: 'RUN_SYNTHETIC',
              status: 'batched',
              paid_at: null,
              net_amount: 1
            };
          }

          if (query.includes('FROM payout_runs')) {
            return {
              id: 'RUN_SYNTHETIC',
              status: 'funded',
              funding_status: 'cleared',
              provider: 'modulr',
              paid_at: null,
              reconciled_at: null,
              item_count: 1,
              total_amount: 1
            };
          }

          if (query.includes('sqlite_master')) {
            return { name: 'modulr_payment_events' };
          }

          return { count: 0 };
        },

        all() {
          if (query.includes('FROM modulr_payment_events')) {
            return [{
              event_type: 'confirmed',
              provider_reference: 'PROVIDER_SYNTHETIC',
              provider_status: 'PROCESSED',
              source: 'modulr_api'
            }];
          }

          if (query.includes('FROM payouts')) {
            return [{
              id: 'PAYOUT_SYNTHETIC',
              net_amount: 1
            }];
          }

          if (query.includes('sqlite_master')) {
            return [
              { name: 'modulr_payment_events' },
              { name: 'driver_ledger' },
              { name: 'fee_ledger' },
              { name: 'payout_confirmations' }
            ];
          }

          return [];
        }
      };
    }
  };
}

test('provider processing cannot authorise accounting', () => {
  const previousEnv = process.env.MODULR_ENV;
  const previousFinalisation =
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;

  try {
    process.env.MODULR_ENV = 'sandbox';
    process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED = 'false';

    const result = previewModulrAccounting(
      mockDb(),
      TRANSFER
    );

    assert.equal(result.eligible, false);
    assert.equal(result.previewOnly, true);
    assert.equal(result.accountingFinalised, false);

    assert.ok(
      result.issues.includes(
        'independent_settlement_evidence_missing'
      )
    );
  } finally {
    if (previousEnv === undefined) {
      delete process.env.MODULR_ENV;
    } else {
      process.env.MODULR_ENV = previousEnv;
    }

    if (previousFinalisation === undefined) {
      delete process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED;
    } else {
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED =
        previousFinalisation;
    }
  }
});
