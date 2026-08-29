const { executeCommand, assertRevision } = require('./command');
const { appendTrustEvent } = require('./events');
const {
  fail,
  sha256,
  futureIso,
  validateOccurrenceSchedule,
} = require('./contracts');
const {
  getRelationshipBooking,
  relationshipEligible,
  pairBlocked,
  getSeriesRow,
  getSeriesBundle,
} = require('./store');
const { serializeSeries } = require('./privacy');

const SUBSTITUTION_POLICIES = new Set([
  'no_substitution',
  'explicit_approval_each_time',
]);

function assertCustomer(actor) {
  if (actor.role !== 'customer') {
    fail('recurring_customer_only', 'Only the source customer can create a recurring series', 403);
  }
}

function assertParticipant(series, actor) {
  if (series.customer_id !== actor.id && series.worker_id !== actor.id) {
    fail('recurring_series_not_found', 'Recurring series not found', 404);
  }
}

function counterpartId(series, actorId) {
  return series.customer_id === actorId ? series.worker_id : series.customer_id;
}

async function assertUnblocked(client, series) {
  if (series.status === 'blocked' || await pairBlocked(client, series.customer_id, series.worker_id)) {
    fail(
      'relationship_block_active',
      'This recurring relationship is blocked',
      409,
      'No recurring work or participant contact can proceed while either party has an active block.'
    );
  }
}

function validateSubstitutionPolicy(value) {
  if (!SUBSTITUTION_POLICIES.has(value)) {
    fail(
      'recurring_substitution_policy_invalid',
      'Substitution policy is invalid',
      422,
      'Choose no_substitution or explicit_approval_each_time. Automatic substitution is not supported.'
    );
  }
  return value;
}

function safeServiceSnapshot(booking) {
  const source = booking.agreement_service_snapshot || {};
  return {
    id: booking.agreement_service_id,
    version: Number(booking.agreement_service_version),
    label: source.label || booking.skill_needed,
    pricingMode: source.pricingMode || source.pricing_mode || null,
    fulfilmentMode: source.fulfilmentMode || source.fulfilment_mode || null,
    recurrenceEligible: true,
  };
}

function safeCommercialSnapshot(booking) {
  const source = booking.agreement_commercial_snapshot || {};
  return {
    schemaVersion: 1,
    agreement: 'same_terms_snapshot',
    pricingMode: source.pricingMode || null,
    customerTotalAmount: source.customerTotalAmount || (
      booking.total_amount === null || booking.total_amount === undefined
        ? null
        : String(booking.total_amount)
    ),
    currency: source.currency || booking.payment_currency || 'ZAR',
    bookingCreationRequiresReconfirmation: true,
    rateChangesRequireNewMutualTerms: true,
  };
}

function buildTerms(booking, body, now = Date.now()) {
  const schedule = validateOccurrenceSchedule(body.schedule, now);
  const substitutionPolicy = validateSubstitutionPolicy(body.substitutionPolicy);
  const serviceSnapshot = safeServiceSnapshot(booking);
  const commercialSnapshot = safeCommercialSnapshot(booking);
  const cancellationPolicyVersion = booking.cancellation_policy_version;
  const hash = sha256({
    serviceSnapshot,
    schedule,
    commercialSnapshot,
    substitutionPolicy,
    cancellationPolicyVersion,
  });
  return {
    serviceSnapshot,
    schedule,
    commercialSnapshot,
    substitutionPolicy,
    cancellationPolicyVersion,
    hash,
  };
}

async function loadEligibleRecurringSource(client, bookingId, actor) {
  const booking = await getRelationshipBooking(client, bookingId, actor, { forUpdate: true });
  if (!booking) {
    fail('recurring_source_not_found', 'Source Project not found', 404);
  }
  if (booking.customer_id !== actor.id) {
    fail('recurring_customer_only', 'Only the source customer can create a recurring series', 403);
  }
  if (!await relationshipEligible(client, booking)) {
    fail(
      'relationship_not_eligible',
      'Recurring work is not available for this relationship',
      409,
      'Confirmed completion, a reconciled paid payment, and no open issue or block are required.'
    );
  }
  if (!booking.agreement_service_id
      || booking.recurrence_eligible !== true
      || !booking.cancellation_policy_version) {
    fail(
      'recurring_service_not_eligible',
      'This service is not configured for recurring work',
      409,
      'An accepted versioned service agreement, recurrence rule, and cancellation policy are required.'
    );
  }
  return booking;
}

async function insertTermsAndOccurrences(client, {
  seriesId,
  termsRevision,
  terms,
  actor,
}) {
  await client.query(
    `INSERT INTO grounded_recurring_terms (
       series_id, terms_revision, service_snapshot, schedule_snapshot,
       commercial_snapshot, substitution_policy,
       cancellation_policy_version, terms_hash, proposed_by
     ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8, $9)`,
    [
      seriesId,
      termsRevision,
      JSON.stringify(terms.serviceSnapshot),
      JSON.stringify(terms.schedule),
      JSON.stringify(terms.commercialSnapshot),
      terms.substitutionPolicy,
      terms.cancellationPolicyVersion,
      terms.hash,
      actor.id,
    ]
  );
  await client.query(
    `INSERT INTO grounded_recurring_acceptances (
       series_id, terms_revision, user_id, terms_hash
     ) VALUES ($1, $2, $3, $4)`,
    [seriesId, termsRevision, actor.id, terms.hash]
  );
  const values = terms.schedule.occurrences.map((scheduledAt, index) => ({
    sequence: index + 1,
    scheduledAt,
  }));
  const placeholders = values.map((_, index) => (
    `($1, $2, $${index * 2 + 3}, $${index * 2 + 4}, 'proposed')`
  )).join(', ');
  const params = [
    seriesId,
    termsRevision,
    ...values.flatMap((item) => [item.sequence, item.scheduledAt]),
  ];
  await client.query(
    `INSERT INTO grounded_recurring_occurrences (
       series_id, terms_revision, sequence_number, scheduled_at, status
     ) VALUES ${placeholders}`,
    params
  );
}

async function seriesResponse(client, seriesId, actor) {
  const bundle = await getSeriesBundle(client, seriesId, actor);
  return serializeSeries(bundle);
}

async function createSeries(context) {
  assertCustomer(context.actor);
  return executeCommand({ ...context, commandType: 'create_recurring_series' }, async (client) => {
    const booking = await loadEligibleRecurringSource(
      client,
      context.body.sourceBookingId,
      context.actor
    );
    const terms = buildTerms(booking, context.body);
    const inserted = await client.query(
      `INSERT INTO grounded_recurring_series (
         customer_id, worker_id, source_booking_id, status,
         proposed_terms_revision, proposed_by
       ) VALUES ($1, $2, $3, 'awaiting_acceptance', 1, $1)
       RETURNING *`,
      [booking.customer_id, booking.labourer_id, booking.id]
    );
    const series = inserted.rows[0];
    await insertTermsAndOccurrences(client, {
      seriesId: series.id,
      termsRevision: 1,
      terms,
      actor: context.actor,
    });
    await appendTrustEvent(client, {
      aggregateType: 'recurring_series',
      aggregateId: series.id,
      sequence: series.revision,
      eventType: 'recurring_series.proposed',
      actor: context.actor,
      payload: {
        status: series.status,
        termsRevision: 1,
        occurrenceCount: terms.schedule.occurrences.length,
        automaticBookingsCreated: false,
        substitutionPolicy: terms.substitutionPolicy,
      },
    });
    return {
      status: 201,
      resourceId: series.id,
      body: { recurringSeries: await seriesResponse(client, series.id, context.actor) },
    };
  });
}

async function loadSeriesForCommand(client, context) {
  const series = await getSeriesRow(client, context.resourceId, context.actor, { forUpdate: true });
  if (!series) fail('recurring_series_not_found', 'Recurring series not found', 404);
  assertParticipant(series, context.actor);
  assertRevision(series, context.expectedRevision, 'Recurring series');
  return series;
}

async function updateSeries(context) {
  return executeCommand({
    ...context,
    commandType: `recurring_series_${context.body.action}`,
  }, async (client) => {
    const series = await loadSeriesForCommand(client, context);
    const action = context.body.action;
    if (action !== 'request_cancel_series') await assertUnblocked(client, series);

    let eventType;
    let eventPayload = {};
    let nextRevision = Number(series.revision) + 1;

    if (action === 'accept_terms') {
      if (!['awaiting_acceptance', 'terms_change_pending'].includes(series.status)) {
        fail('recurring_terms_not_pending', 'No recurring terms await acceptance', 409);
      }
      if (series.proposed_by === context.actor.id) {
        fail(
          'recurring_counterparty_acceptance_required',
          'The other participant must accept these terms',
          403
        );
      }
      const termsResult = await client.query(
        `SELECT * FROM grounded_recurring_terms
          WHERE series_id = $1 AND terms_revision = $2
          FOR UPDATE`,
        [series.id, series.proposed_terms_revision]
      );
      const terms = termsResult.rows[0];
      if (!terms) fail('recurring_terms_not_found', 'Proposed recurring terms not found', 409);
      await client.query(
        `INSERT INTO grounded_recurring_acceptances (
           series_id, terms_revision, user_id, terms_hash
         ) VALUES ($1, $2, $3, $4)
         ON CONFLICT (series_id, terms_revision, user_id) DO NOTHING`,
        [series.id, terms.terms_revision, context.actor.id, terms.terms_hash]
      );
      const acceptanceCount = await client.query(
        `SELECT COUNT(*)::int AS count
           FROM grounded_recurring_acceptances
          WHERE series_id = $1 AND terms_revision = $2
            AND user_id IN ($3, $4)`,
        [series.id, terms.terms_revision, series.customer_id, series.worker_id]
      );
      if (acceptanceCount.rows[0].count !== 2) {
        fail(
          'recurring_mutual_acceptance_incomplete',
          'Both participants have not accepted the same terms',
          409
        );
      }
      if (series.current_terms_revision) {
        await client.query(
          `UPDATE grounded_recurring_occurrences
              SET status = 'superseded', updated_at = NOW()
            WHERE series_id = $1 AND terms_revision = $2
              AND booking_id IS NULL
              AND status IN ('planned', 'held', 'change_pending')`,
          [series.id, series.current_terms_revision]
        );
      }
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'planned', updated_at = NOW()
          WHERE series_id = $1 AND terms_revision = $2 AND status = 'proposed'`,
        [series.id, terms.terms_revision]
      );
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'active', current_terms_revision = $2,
                proposed_terms_revision = NULL, proposed_by = NULL,
                revision = $3, updated_at = NOW(),
                activated_at = COALESCE(activated_at, NOW())
          WHERE id = $1`,
        [series.id, terms.terms_revision, nextRevision]
      );
      eventType = 'recurring_series.terms_accepted';
      eventPayload = {
        status: 'active',
        termsRevision: Number(terms.terms_revision),
        mutualAcceptance: true,
        automaticBookingsCreated: false,
      };
    } else if (action === 'propose_terms') {
      if (!['active', 'paused'].includes(series.status)) {
        fail(
          'recurring_terms_change_unavailable',
          'Series terms cannot be changed in this state',
          409,
          `The series is '${series.status}'.`
        );
      }
      const booking = await getRelationshipBooking(
        client,
        series.source_booking_id,
        context.actor,
        { forUpdate: true }
      );
      if (!booking || !await relationshipEligible(client, booking)) {
        fail('relationship_not_eligible', 'New recurring terms are not available', 409);
      }
      const terms = buildTerms(booking, context.body);
      const nextTermsResult = await client.query(
        `SELECT COALESCE(MAX(terms_revision), 0) + 1 AS revision
           FROM grounded_recurring_terms
          WHERE series_id = $1`,
        [series.id]
      );
      const termsRevision = Number(nextTermsResult.rows[0].revision);
      await insertTermsAndOccurrences(client, {
        seriesId: series.id,
        termsRevision,
        terms,
        actor: context.actor,
      });
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'terms_change_pending', proposed_terms_revision = $2,
                proposed_by = $3, revision = $4, updated_at = NOW()
          WHERE id = $1`,
        [series.id, termsRevision, context.actor.id, nextRevision]
      );
      eventType = 'recurring_series.terms_proposed';
      eventPayload = {
        status: 'terms_change_pending',
        termsRevision,
        occurrenceCount: terms.schedule.occurrences.length,
        currentTermsRemainActiveUntilAccepted: true,
      };
    } else if (action === 'pause') {
      if (series.status !== 'active') {
        fail('recurring_pause_unavailable', 'Only an active series can be paused', 409);
      }
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'paused', paused_by = $2, revision = $3, updated_at = NOW()
          WHERE id = $1`,
        [series.id, context.actor.id, nextRevision]
      );
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'held', updated_at = NOW()
          WHERE series_id = $1 AND terms_revision = $2 AND status = 'planned'`,
        [series.id, series.current_terms_revision]
      );
      eventType = 'recurring_series.paused';
      eventPayload = { status: 'paused', pausedByRole: context.actor.role === 'labourer' ? 'worker' : 'customer' };
    } else if (action === 'request_resume') {
      if (series.status !== 'paused') {
        fail('recurring_resume_unavailable', 'Only a paused series can request resume', 409);
      }
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'resume_requested', resume_requested_by = $2,
                revision = $3, updated_at = NOW()
          WHERE id = $1`,
        [series.id, context.actor.id, nextRevision]
      );
      eventType = 'recurring_series.resume_requested';
      eventPayload = { status: 'resume_requested' };
    } else if (action === 'accept_resume') {
      if (series.status !== 'resume_requested') {
        fail('recurring_resume_not_pending', 'No series resume awaits acceptance', 409);
      }
      if (series.resume_requested_by === context.actor.id) {
        fail('recurring_counterparty_acceptance_required', 'The other participant must accept resume', 403);
      }
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'active', paused_by = NULL, resume_requested_by = NULL,
                revision = $2, updated_at = NOW()
          WHERE id = $1`,
        [series.id, nextRevision]
      );
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'planned', updated_at = NOW()
          WHERE series_id = $1 AND terms_revision = $2 AND status = 'held'
            AND booking_id IS NULL`,
        [series.id, series.current_terms_revision]
      );
      eventType = 'recurring_series.resumed';
      eventPayload = { status: 'active', mutualAcceptance: true };
    } else if (action === 'request_cancel_series') {
      if (!['active', 'paused', 'resume_requested', 'terms_change_pending'].includes(series.status)) {
        fail('recurring_cancel_unavailable', 'This series cannot request cancellation', 409);
      }
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'cancellation_requested', cancellation_requested_by = $2,
                proposed_terms_revision = NULL, proposed_by = NULL,
                revision = $3, updated_at = NOW()
          WHERE id = $1`,
        [series.id, context.actor.id, nextRevision]
      );
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'held', updated_at = NOW()
          WHERE series_id = $1 AND status IN ('planned', 'change_pending')`,
        [series.id]
      );
      eventType = 'recurring_series.cancellation_requested';
      eventPayload = { status: 'cancellation_requested', wholeSeries: true };
    } else if (action === 'accept_cancel_series') {
      if (series.status !== 'cancellation_requested') {
        fail('recurring_cancellation_not_pending', 'No whole-series cancellation awaits acceptance', 409);
      }
      if (series.cancellation_requested_by === context.actor.id) {
        fail('recurring_counterparty_acceptance_required', 'The other participant must accept cancellation', 403);
      }
      await client.query(
        `UPDATE grounded_recurring_series
            SET status = 'cancelled', cancellation_requested_by = NULL,
                revision = $2, updated_at = NOW(), cancelled_at = NOW()
          WHERE id = $1`,
        [series.id, nextRevision]
      );
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'cancelled', updated_at = NOW()
          WHERE series_id = $1 AND booking_id IS NULL
            AND status IN ('proposed', 'planned', 'held', 'change_pending')`,
        [series.id]
      );
      eventType = 'recurring_series.cancelled';
      eventPayload = {
        status: 'cancelled',
        wholeSeries: true,
        linkedBookingsMutated: false,
      };
    } else if (action === 'request_occurrence_change') {
      if (!['active', 'paused'].includes(series.status)) {
        fail('recurring_occurrence_change_unavailable', 'Occurrence changes are unavailable in this state', 409);
      }
      const occurrenceResult = await client.query(
        `SELECT * FROM grounded_recurring_occurrences
          WHERE id = $1 AND series_id = $2 AND terms_revision = $3
          FOR UPDATE`,
        [context.body.occurrenceId, series.id, series.current_terms_revision]
      );
      const occurrence = occurrenceResult.rows[0];
      if (!occurrence) fail('recurring_occurrence_not_found', 'Occurrence not found', 404);
      if (occurrence.booking_id) {
        fail(
          'recurring_occurrence_booking_exists',
          'This occurrence already has a booking',
          409,
          'Use the explicit booking reschedule/cancellation flow; this endpoint will not mutate it.'
        );
      }
      if (!['planned', 'held'].includes(occurrence.status)) {
        fail('recurring_occurrence_not_editable', 'Occurrence is not editable', 409);
      }
      const kind = context.body.changeKind;
      if (!['reschedule', 'cancel'].includes(kind)) {
        fail('recurring_occurrence_change_invalid', 'Occurrence change is invalid', 422);
      }
      const proposedAt = kind === 'reschedule'
        ? futureIso(context.body.proposedScheduledAt, 'proposedScheduledAt')
        : null;
      if (kind === 'cancel' && context.body.proposedScheduledAt !== undefined) {
        fail(
          'recurring_occurrence_change_invalid',
          'Cancellation cannot include a replacement time',
          422
        );
      }
      const changeResult = await client.query(
        `INSERT INTO grounded_recurring_occurrence_changes (
           series_id, occurrence_id, change_kind, proposed_scheduled_at, requested_by
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [series.id, occurrence.id, kind, proposedAt, context.actor.id]
      );
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'change_pending', updated_at = NOW()
          WHERE id = $1`,
        [occurrence.id]
      );
      await client.query(
        `UPDATE grounded_recurring_series SET revision = $2, updated_at = NOW() WHERE id = $1`,
        [series.id, nextRevision]
      );
      eventType = 'recurring_series.occurrence_change_requested';
      eventPayload = {
        status: series.status,
        scope: 'one_occurrence',
        occurrenceId: occurrence.id,
        changeRequestId: changeResult.rows[0].id,
        changeKind: kind,
      };
    } else if (['accept_occurrence_change', 'decline_occurrence_change'].includes(action)) {
      if (!['active', 'paused'].includes(series.status)) {
        fail('recurring_occurrence_decision_unavailable', 'Occurrence decisions are unavailable in this state', 409);
      }
      const changeResult = await client.query(
        `SELECT c.*, o.booking_id
           FROM grounded_recurring_occurrence_changes c
           JOIN grounded_recurring_occurrences o ON o.id = c.occurrence_id
          WHERE c.id = $1 AND c.series_id = $2
          FOR UPDATE OF c, o`,
        [context.body.changeRequestId, series.id]
      );
      const change = changeResult.rows[0];
      if (!change) fail('recurring_occurrence_change_not_found', 'Occurrence change not found', 404);
      if (change.status !== 'pending') {
        fail('recurring_occurrence_change_decided', 'Occurrence change is already decided', 409);
      }
      if (change.requested_by === context.actor.id) {
        fail('recurring_counterparty_acceptance_required', 'The other participant must decide this change', 403);
      }
      if (change.booking_id) {
        fail(
          'recurring_occurrence_booking_exists',
          'This occurrence now has a booking',
          409,
          'No linked booking was changed.'
        );
      }
      const accepted = action === 'accept_occurrence_change';
      await client.query(
        `UPDATE grounded_recurring_occurrence_changes
            SET status = $2, decided_by = $3, decided_at = NOW()
          WHERE id = $1`,
        [change.id, accepted ? 'accepted' : 'declined', context.actor.id]
      );
      let occurrenceStatus = series.status === 'active' ? 'planned' : 'held';
      if (accepted && change.change_kind === 'cancel') occurrenceStatus = 'cancelled';
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = $2,
                scheduled_at = CASE
                  WHEN $3::boolean AND $4 = 'reschedule' THEN $5
                  ELSE scheduled_at
                END,
                updated_at = NOW()
          WHERE id = $1`,
        [
          change.occurrence_id,
          occurrenceStatus,
          accepted,
          change.change_kind,
          change.proposed_scheduled_at,
        ]
      );
      await client.query(
        `UPDATE grounded_recurring_series SET revision = $2, updated_at = NOW() WHERE id = $1`,
        [series.id, nextRevision]
      );
      eventType = accepted
        ? 'recurring_series.occurrence_change_accepted'
        : 'recurring_series.occurrence_change_declined';
      eventPayload = {
        status: series.status,
        scope: 'one_occurrence',
        occurrenceId: change.occurrence_id,
        changeRequestId: change.id,
        changeKind: change.change_kind,
        applied: accepted,
        linkedBookingMutated: false,
      };
    } else {
      fail('recurring_action_unsupported', 'Recurring series action is unsupported', 422);
    }

    await appendTrustEvent(client, {
      aggregateType: 'recurring_series',
      aggregateId: series.id,
      sequence: nextRevision,
      eventType,
      actor: context.actor,
      payload: eventPayload,
    });
    return {
      status: 200,
      resourceId: series.id,
      body: { recurringSeries: await seriesResponse(client, series.id, context.actor) },
    };
  });
}

module.exports = {
  SUBSTITUTION_POLICIES,
  buildTerms,
  createSeries,
  updateSeries,
};
