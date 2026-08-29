export type RecurringRequesterRole = 'customer' | 'worker';

export type RecurringPendingRequests = Readonly<{
  resumeRequestedByRole: RecurringRequesterRole | null;
  cancellationRequestedByRole: RecurringRequesterRole | null;
}>;

export type RecurringPendingRequestsResult =
  | Readonly<{ ok: true; value: RecurringPendingRequests }>
  | Readonly<{ ok: false; field: 'pendingRequests' | 'pendingRequests.state' }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requesterRole(value: unknown): RecurringRequesterRole | null | undefined {
  if (value === null) return null;
  return value === 'customer' || value === 'worker' ? value : undefined;
}

export function adaptRecurringPendingRequestsV1(
  value: unknown,
  status: string,
): RecurringPendingRequestsResult {
  if (!isRecord(value)) return Object.freeze({ ok: false, field: 'pendingRequests' });
  const resumeRequestedByRole = requesterRole(value.resumeRequestedByRole);
  const cancellationRequestedByRole = requesterRole(value.cancellationRequestedByRole);
  if (resumeRequestedByRole === undefined || cancellationRequestedByRole === undefined) {
    return Object.freeze({ ok: false, field: 'pendingRequests' });
  }
  if ((status === 'resume_requested') !== (resumeRequestedByRole !== null)
      || (status === 'cancellation_requested') !== (cancellationRequestedByRole !== null)) {
    return Object.freeze({ ok: false, field: 'pendingRequests.state' });
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ resumeRequestedByRole, cancellationRequestedByRole }),
  });
}
