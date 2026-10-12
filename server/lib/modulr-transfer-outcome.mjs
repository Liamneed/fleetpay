// Interpretation of simulated Modulr submission outcomes.
// This module performs no HTTP requests or database writes.

export function classifyModulrSubmission(response) {
  if (
    !response ||
    response.timeout === true ||
    response.networkError === true
  ) {
    return {
      status: 'unknown',
      reason: 'provider_outcome_uncertain'
    };
  }

  const httpStatus = Number(response.httpStatus);

  // Do not assume a transfer succeeded merely because the
  // provider accepted the instruction.
  if (httpStatus >= 200 && httpStatus < 300) {
    const transferId = response.transferId;

    if (typeof transferId !== 'string' || !transferId.trim()) {
      return {
        status: 'unknown',
        reason: 'missing_provider_transfer_id'
      };
    }

    return {
      status: 'submitted',
      providerTransferId: transferId
    };
  }

  // Only an explicit, reliably classified rejection is final.
  // Generic HTTP failures remain uncertain.
  if (
    response.definitiveRejection === true &&
    httpStatus >= 400 &&
    httpStatus < 500
  ) {
    return {
      status: 'unknown',
      reason: 'rejection_requires_verification'
    };
  }

  return {
    status: 'unknown',
    reason: 'provider_outcome_uncertain'
  };
}
