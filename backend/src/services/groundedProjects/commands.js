const crypto = require('crypto');
const { withTx } = require('../../config/db');
const { ProblemError } = require('../../lib/problemJson');
const { serializeProject } = require('./privacy');
const { emitEvent } = require('../events');
const { deriveOperationalPhase } = require('./state');
const {
  getProject,
  getTimeline,
  ensureCreationEvent,
  hasOpenChangeOrder,
  hasSafetyHold,
  createCommercialSnapshot,
  appendLifecycleEvent,
} = require('./store');

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function requestHash(body, expectedRevision) {
  return crypto
    .createHash('sha256')
    .update(canonicalJson({ body: body || {}, expectedRevision }))
    .digest('hex');
}

function problem(type, title, status, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function assertExpectedRevision(booking, expectedRevision) {
  const current = Number(booking.lifecycle_revision || 0);
  if (current !== expectedRevision) {
    problem(
      'project_revision_mismatch',
      'Project revision is stale',
      412,
      'Fetch the latest Project before retrying this transition.',
      { expectedRevision, currentRevision: current }
    );
  }
}

async function beginCommand(client, {
  actor,
  bookingId,
  commandType,
  idempotencyKey,
  body,
  expectedRevision,
}) {
  const fingerprint = requestHash(body, expectedRevision);
  const inserted = await client.query(
    `INSERT INTO grounded_project_commands (
       actor_user_id, booking_id, command_type, idempotency_key, request_hash
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (actor_user_id, booking_id, command_type, idempotency_key) DO NOTHING
     RETURNING request_hash`,
    [actor.id, bookingId, commandType, idempotencyKey, fingerprint]
  );
  if (inserted.rows.length > 0) return { replay: false, fingerprint };

  const existing = await client.query(
    `SELECT request_hash, response_status, response_body
       FROM grounded_project_commands
      WHERE actor_user_id = $1 AND booking_id = $2
        AND command_type = $3 AND idempotency_key = $4`,
    [actor.id, bookingId, commandType, idempotencyKey]
  );
  const row = existing.rows[0];
  if (!row || row.request_hash !== fingerprint) {
    problem(
      'idempotency_key_reused',
      'Idempotency-Key reused with different command input',
      422,
      'Use a fresh Idempotency-Key when the body or If-Match revision changes.'
    );
  }
  if (row.response_status === null || !row.response_body) {
    problem(
      'idempotency_command_in_progress',
      'Command is still in progress',
      409,
      'Retry the exact request with the same Idempotency-Key.'
    );
  }
  return {
    replay: true,
    response: { status: Number(row.response_status), body: row.response_body },
  };
}

async function completeCommand(client, context, response) {
  await client.query(
    `UPDATE grounded_project_commands
        SET response_status = $5, response_body = $6::jsonb, completed_at = NOW()
      WHERE actor_user_id = $1 AND booking_id = $2
        AND command_type = $3 AND idempotency_key = $4`,
    [
      context.actor.id,
      context.bookingId,
      context.commandType,
      context.idempotencyKey,
      response.status,
      JSON.stringify(response.body),
    ]
  );
}

async function currentProjectResponse(client, bookingId, actor, transition) {
  const current = await getProject(client, bookingId, actor);
  const events = await getTimeline(client, bookingId);
  return {
    project: serializeProject(current, actor, { detail: true, events }),
    transition,
  };
}

async function executeCommand(context, mutate) {
  return withTx(async (client) => {
    const booking = await getProject(client, context.bookingId, context.actor, { forUpdate: true });
    if (!booking) {
      problem(
        'project_not_found',
        'Project not found',
        404,
        'No participant-visible Project exists for this identifier.'
      );
    }

    const command = await beginCommand(client, context);
    if (command.replay) return { ...command.response, replay: true };

    const response = await mutate(client, booking);
    await completeCommand(client, context, response);
    return { ...response, replay: false };
  });
}

function assertAssignedWorker(booking, actor) {
  if (actor.role !== 'labourer' || booking.labourer_id !== actor.id) {
    problem(
      'completion_worker_only',
      'Only the assigned worker can request completion',
      403,
      'The request must come from the worker assigned to this Project.'
    );
  }
}

function assertCustomer(booking, actor, verb) {
  if (actor.role !== 'customer' || booking.customer_id !== actor.id) {
    problem(
      'completion_customer_only',
      `Only the customer can ${verb} completion`,
      403,
      'The decision must come from the customer who owns this Project.'
    );
  }
}

async function requestCompletion(context) {
  return executeCommand(
    { ...context, commandType: 'request_completion' },
    async (client, booking) => {
      assertAssignedWorker(booking, context.actor);
      assertExpectedRevision(booking, context.expectedRevision);

      if (booking.completion_status === 'requested') {
        return {
          status: 200,
          body: await currentProjectResponse(client, booking.id, context.actor, {
            type: 'completion_requested',
            applied: false,
          }),
        };
      }
      if (booking.completion_status) {
        problem(
          'completion_already_decided',
          'Completion has already been decided',
          409,
          `Completion is already '${booking.completion_status}' and cannot be requested again.`
        );
      }
      if (booking.status !== 'in_progress' || deriveOperationalPhase(booking) !== 'work_active') {
        problem(
          'completion_wrong_phase',
          'Completion cannot be requested in this phase',
          409,
          'The booking must be actively in progress before completion can be requested.',
          { bookingStatus: booking.status, operationalPhase: deriveOperationalPhase(booking) }
        );
      }
      if (await hasOpenChangeOrder(client, booking.id)) {
        problem(
          'completion_open_change_order',
          'Resolve the pending change order first',
          409,
          'Completion cannot be requested while a change order awaits a decision.'
        );
      }

      await ensureCreationEvent(client, booking);
      const snapshot = await createCommercialSnapshot(client, booking);
      const nextRevision = Number(booking.lifecycle_revision || 0) + 1;
      await client.query(
        `INSERT INTO grounded_project_completions (
           booking_id, status, requested_by, snapshot_id
         ) VALUES ($1, 'requested', $2, $3)`,
        [booking.id, context.actor.id, snapshot.id]
      );
      await client.query(
        `UPDATE bookings
            SET operational_phase = 'completion_review',
                phase_updated_at = NOW(),
                lifecycle_revision = $2
          WHERE id = $1`,
        [booking.id, nextRevision]
      );
      await appendLifecycleEvent(client, {
        booking,
        sequence: nextRevision,
        eventType: 'completion.requested',
        actor: context.actor,
        bookingStatus: 'in_progress',
        operationalPhase: 'completion_review',
        payload: {
          projectId: booking.id,
          revision: nextRevision,
          commercialSnapshotId: snapshot.id,
        },
      });

      return {
        status: 201,
        body: await currentProjectResponse(client, booking.id, context.actor, {
          type: 'completion_requested',
          applied: true,
        }),
      };
    }
  );
}

async function confirmCompletion(context) {
  return executeCommand(
    { ...context, commandType: 'confirm_completion' },
    async (client, booking) => {
      assertCustomer(booking, context.actor, 'confirm');
      assertExpectedRevision(booking, context.expectedRevision);
      if (booking.completion_status === 'confirmed' && booking.status === 'completed') {
        return {
          status: 200,
          body: await currentProjectResponse(client, booking.id, context.actor, {
            type: 'completion_confirmed',
            applied: false,
          }),
        };
      }
      if (booking.completion_status !== 'requested' || booking.status !== 'in_progress') {
        problem(
          'completion_not_awaiting_confirmation',
          'Completion is not awaiting confirmation',
          409,
          'The worker must request completion and the request must remain undecided.'
        );
      }
      if (await hasOpenChangeOrder(client, booking.id)) {
        problem(
          'completion_open_change_order',
          'Resolve the pending change order first',
          409,
          'Completion cannot be confirmed while a change order awaits a decision.'
        );
      }
      if (await hasSafetyHold(client, booking.id)) {
        problem(
          'completion_open_safety_hold',
          'Completion is blocked by a safety hold',
          409,
          'Support must resolve the safety record before fulfilment can close.'
        );
      }

      const paymentPhase = ['paid', 'refunded'].includes(booking.payment_status)
        ? 'closed'
        : 'payment_pending';
      const firstSequence = Number(booking.lifecycle_revision || 0) + 1;
      const finalRevision = firstSequence + 1;
      await client.query(
        `UPDATE grounded_project_completions
            SET status = 'confirmed', decided_by = $2, decided_at = NOW()
          WHERE booking_id = $1 AND status = 'requested'`,
        [booking.id, context.actor.id]
      );
      await client.query(
        `UPDATE bookings
            SET status = 'completed', completed_at = NOW(),
                operational_phase = $2, phase_updated_at = NOW(),
                lifecycle_revision = $3
          WHERE id = $1 AND status = 'in_progress'`,
        [booking.id, paymentPhase, finalRevision]
      );
      await appendLifecycleEvent(client, {
        booking,
        sequence: firstSequence,
        eventType: 'completion.confirmed',
        actor: context.actor,
        bookingStatus: 'in_progress',
        operationalPhase: 'completion_review',
        payload: { projectId: booking.id, revision: firstSequence },
      });
      await appendLifecycleEvent(client, {
        booking,
        sequence: finalRevision,
        eventType: 'booking.completed',
        actor: context.actor,
        bookingStatus: 'completed',
        operationalPhase: paymentPhase,
        payload: { projectId: booking.id, revision: finalRevision },
      });
      // Preserve the existing tenant-scoped webhook contract while the
      // Grounded Project outbox becomes the canonical internal event stream.
      // This runs on the same transaction/client as the state mutation.
      await emitEvent(client, {
        eventType: 'booking.completed',
        resourceType: 'booking',
        resourceId: booking.id,
        actorUserIds: [booking.customer_id, booking.labourer_id],
        previousState: 'in_progress',
        state: 'completed',
        data: { ...booking, status: 'completed' },
      });

      return {
        status: 200,
        body: await currentProjectResponse(client, booking.id, context.actor, {
          type: 'completion_confirmed',
          applied: true,
        }),
      };
    }
  );
}

async function disputeCompletion(context) {
  return executeCommand(
    { ...context, commandType: 'dispute_completion' },
    async (client, booking) => {
      assertCustomer(booking, context.actor, 'dispute');
      assertExpectedRevision(booking, context.expectedRevision);
      if (booking.completion_status === 'disputed') {
        return {
          status: 200,
          body: await currentProjectResponse(client, booking.id, context.actor, {
            type: 'completion_disputed',
            applied: false,
          }),
        };
      }
      if (booking.completion_status !== 'requested' || booking.status !== 'in_progress') {
        problem(
          'completion_not_awaiting_decision',
          'Completion is not awaiting a decision',
          409,
          'Only an undecided worker completion request can be disputed.'
        );
      }

      const issueResult = await client.query(
        `INSERT INTO grounded_project_issues (
           booking_id, kind, status, opened_by, reason
         ) VALUES ($1, 'completion_dispute', 'open', $2, $3)
         RETURNING id`,
        [booking.id, context.actor.id, context.body.reason]
      );
      const issueId = issueResult.rows[0].id;
      const nextRevision = Number(booking.lifecycle_revision || 0) + 1;
      await client.query(
        `UPDATE grounded_project_completions
            SET status = 'disputed', decided_by = $2, decided_at = NOW(),
                dispute_issue_id = $3
          WHERE booking_id = $1 AND status = 'requested'`,
        [booking.id, context.actor.id, issueId]
      );
      await client.query(
        `UPDATE bookings
            SET operational_phase = 'completion_review',
                phase_updated_at = NOW(), lifecycle_revision = $2
          WHERE id = $1`,
        [booking.id, nextRevision]
      );
      await appendLifecycleEvent(client, {
        booking,
        sequence: nextRevision,
        eventType: 'completion.disputed',
        actor: context.actor,
        bookingStatus: 'in_progress',
        operationalPhase: 'completion_review',
        payload: { projectId: booking.id, revision: nextRevision, issueId },
      });

      return {
        status: 200,
        body: await currentProjectResponse(client, booking.id, context.actor, {
          type: 'completion_disputed',
          applied: true,
        }),
      };
    }
  );
}

module.exports = {
  canonicalJson,
  requestHash,
  requestCompletion,
  confirmCompletion,
  disputeCompletion,
};
