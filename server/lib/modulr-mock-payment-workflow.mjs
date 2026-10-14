// Synthetic, offline integration test workflow ONLY.
// No server route, real credentials, production DB or real payment authority.

import { claimValidatedModulrTransfer } from './modulr-validated-claim.mjs';
import { validateClaimedModulrSubmission } from './modulr-submission-gate.mjs';
import { executeModulrSandboxTransport } from './modulr-sandbox-payment-transport.mjs';
import {
  recordModulrTransferSubmission,
  transitionModulrTransfer
} from './modulr-transfer-store.mjs';

export async function runMockModulrPaymentWorkflow({
  db, intentId, beneficiaryMatch, fetchImpl
}) {
  if (process.env.MODULR_MOCK_WORKFLOW !== 'true' ||
      process.env.MODULR_ENV !== 'sandbox' ||
      process.env.MODULR_ENABLED !== 'false' ||
      process.env.PAYOUT_ACCOUNTING_FINALISATION_ENABLED !== 'false' ||
      typeof fetchImpl !== 'function' ||
      !db || typeof db.prepare !== 'function' ||
      typeof intentId !== 'string' ||
      !beneficiaryMatch) {
    throw new Error('Synthetic mock workflow only.');
  }

  // A hardcoded synthetic source account and credential. The workflow
  // never reads real Modulr credentials and is not connected to routes.
  const sourceAccountId = 'A_TEST_299';
  const apiKey = 'synthetic-key-not-real';

  // This function tests orchestration, NOT beneficiary authentication.
  // Production must obtain the match independently from Modulr.
  const claim = claimValidatedModulrTransfer(
    db, intentId, beneficiaryMatch
  );

  // The claim is committed before any HTTP simulation.
  const intent = db.prepare(`
    SELECT * FROM payout_transfer_intents WHERE id=?
  `).get(intentId);

  const gate = validateClaimedModulrSubmission({
    intent, claim, sourceAccountId
  });

  if (!gate.eligible) {
    transitionModulrTransfer(
      db, intentId, 'submitting', 'unknown'
    );
    return {
      status: 'unknown',
      reason: gate.reason,
      accountingFinalised: false
    };
  }

  // An existing claim can never be reused to enter this workflow.
  // Any simulated transport exception leaves the claim uncertain.
  let result;
  try {
    result = await executeModulrSandboxTransport({
      validatedSubmission: gate,
      apiKey,
      fetchImpl
    });
  } catch {
    result = { status: 'unknown' };
  }

  if (result.status === 'submitted' &&
      result.providerTransferId) {
    try {
      recordModulrTransferSubmission(
        db, intentId, result.providerTransferId
      );
    } catch {
      // Provider may have accepted the request. Never issue another.
      const current = db.prepare(`
        SELECT status FROM payout_transfer_intents WHERE id=?
      `).get(intentId);
      if (current?.status === 'submitting') {
        transitionModulrTransfer(
          db, intentId, 'submitting', 'unknown'
        );
      }
      return {
        status: 'unknown',
        reason: 'submission_recording_uncertain',
        accountingFinalised: false
      };
    }
  } else {
    transitionModulrTransfer(
      db, intentId, 'submitting', 'unknown'
    );
  }

  return {
    status: result.status,
    providerTransferId: result.providerTransferId ?? null,
    accountingFinalised: false
  };
}
