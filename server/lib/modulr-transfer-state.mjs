// Modulr transfer state rules.
// Pure logic only: no network calls, database writes or payment execution.

const TRANSITIONS = Object.freeze({
  prepared: Object.freeze(['submitting', 'cancelled']),
  submitting: Object.freeze(['submitted', 'unknown']),
  submitted: Object.freeze(['confirmed', 'failed', 'unknown']),
  unknown: Object.freeze(['submitted', 'confirmed', 'failed']),
  confirmed: Object.freeze([]),
  failed: Object.freeze([]),
  cancelled: Object.freeze([])
});

export function canTransitionModulrTransfer(from, to) {
  return Object.hasOwn(TRANSITIONS, from) &&
    TRANSITIONS[from].includes(to);
}

export function assertModulrTransferTransition(from, to) {
  if (!canTransitionModulrTransfer(from, to)) {
    throw new Error(
      `Invalid Modulr transfer transition: ${from} -> ${to}`
    );
  }
  return true;
}

export function canSubmitModulrTransfer(status) {
  return status === 'prepared';
}

export function requiresModulrReconciliation(status) {
  return ['submitting', 'submitted', 'unknown'].includes(status);
}
