// Interpret Modulr Create Payment responses.
// Pure logic: no HTTP, database access, retries or accounting.

export function classifyModulrSubmission(response) {
  const unknown = reason => ({
    status: 'unknown',
    reason
  });

  if (!response || response.timeout === true ||
      response.networkError === true) {
    return unknown('provider_outcome_uncertain');
  }

  // Modulr documents HTTP 201 for a created payment.
  // Creation does not establish settlement.
  if (response.httpStatus === 201) {
    const payment = response.body;

    if (!payment || typeof payment.id !== 'string' ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(payment.id)) {
      return unknown('missing_provider_transfer_id');
    }

    if (typeof payment.status !== 'string' ||
        !payment.status.trim()) {
      return unknown('missing_provider_status');
    }

    return {
      status: 'submitted',
      providerTransferId: payment.id,
      providerStatus: payment.status,
      accountingFinalised: false
    };
  }

  // Never automatically retry an uncertain provider outcome.
  return unknown('provider_outcome_uncertain');
}
