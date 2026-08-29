const { ProblemError } = require('../../lib/problemJson');
const { resolveApprovedFulfilmentPolicy } = require('../../config/groundedFulfilmentPolicy');

function requireApprovedFulfilmentPolicy() {
  const resolved = resolveApprovedFulfilmentPolicy();
  if (!resolved.available) {
    throw new ProblemError({
      type: 'fulfilment_policy_unavailable',
      title: 'Canonical fulfilment policy is unavailable',
      status: 503,
      detail: 'No Project was created and no quote, request or match acceptance state was changed.',
      extensions: {
        reasonCode: resolved.reasonCode,
        ...(resolved.invalidFields.length > 0
          ? { invalidFields: resolved.invalidFields }
          : {}),
      },
    });
  }
  return resolved.snapshot;
}

async function bootstrapCanonicalFulfilment(client, {
  bookingId,
  policy,
  proposedBy,
  proposedByRole,
  customerId,
  workerId,
  scopeSnapshot,
  scopeItems,
}) {
  await client.query(
    `INSERT INTO grounded_fulfilment_policy_snapshots (
       booking_id, policy_version, source, route_reveal_lead_minutes,
       arrival_evidence_mode, no_show_grace_minutes, start_pin_ttl_minutes,
       start_pin_max_attempts, reschedule_expiry_minutes,
       change_order_expiry_minutes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      bookingId,
      policy.policyVersion,
      policy.source,
      policy.routeRevealLeadMinutes,
      policy.arrivalEvidenceMode,
      policy.noShowGraceMinutes,
      policy.startPinTtlMinutes,
      policy.startPinMaxAttempts,
      policy.rescheduleExpiryMinutes,
      policy.changeOrderExpiryMinutes,
    ]
  );
  await client.query(
    `INSERT INTO grounded_scope_versions (
       booking_id, version, base_version, status, source,
       proposed_by, proposed_by_role, scope_snapshot,
       customer_confirmed_by, customer_confirmed_at,
       worker_confirmed_by, worker_confirmed_at
     ) VALUES (
       $1, 1, NULL, 'confirmed', 'accepted_agreement',
       $2, $3, $4::jsonb, $5, NOW(), $6, NOW()
     )`,
    [
      bookingId,
      proposedBy,
      proposedByRole,
      JSON.stringify(scopeSnapshot),
      customerId,
      workerId,
    ]
  );
  await client.query(
    `UPDATE bookings
        SET current_scope_version = 1,
            scope_items = $2::jsonb,
            scope_confirmed_by_customer = true,
            scope_confirmed_by_labourer = true,
            scope_confirmed_at = NOW()
      WHERE id = $1`,
    [bookingId, JSON.stringify(scopeItems)]
  );
}

module.exports = {
  requireApprovedFulfilmentPolicy,
  bootstrapCanonicalFulfilment,
};
