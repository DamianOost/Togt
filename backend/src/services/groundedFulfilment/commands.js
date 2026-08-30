const { withTx } = require('../../config/db');
const { ProblemError, typeUri } = require('../../lib/problemJson');
const { requestHash } = require('./contracts');
const { createPinMaterial, verifyPin, revealPin, deviceIdHash } = require('./pin');
const { serializeFulfilment } = require('./privacy');
const { canonicalScopeSnapshot, scopeMaterialsResolved } = require('./scope');
const store = require('./store');

const KNOWN_STATUSES = new Set(['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'terminated_after_start']);
const KNOWN_PHASES = new Set([
  'matching', 'assigned', 'scheduled', 'en_route', 'arrived',
  'scope_confirmation', 'work_active', 'completion_review',
  'payment_pending', 'closed',
]);

function problem(type, title, status, detail, extensions) {
  throw new ProblemError({ type, title, status, detail, extensions });
}

function problemBody(type, title, status, detail, extensions, extra = {}) {
  return {
    type: typeUri(type),
    title,
    status,
    ...(detail ? { detail } : {}),
    ...(extensions ? { extensions } : {}),
    error: title,
    ...extra,
  };
}

function actorRole(actor) {
  return actor.role === 'labourer' ? 'labourer' : actor.role;
}

function publicRole(role) {
  return role === 'labourer' ? 'worker' : role;
}

function assertParticipantRole(booking, actor) {
  const validCustomer = actor.role === 'customer' && booking.customer_id === actor.id;
  const validWorker = actor.role === 'labourer' && booking.labourer_id === actor.id;
  if (!validCustomer && !validWorker) {
    problem(
      'fulfilment_actor_forbidden',
      'The participant role does not match this Project',
      403,
      'Use the signed-in customer or assigned Worker identity for this Project.'
    );
  }
}

function assertWorker(booking, actor) {
  if (actor.role !== 'labourer' || booking.labourer_id !== actor.id) {
    problem(
      'fulfilment_worker_only',
      'Only the assigned Worker can perform this transition',
      403
    );
  }
}

function assertCustomer(booking, actor) {
  if (actor.role !== 'customer' || booking.customer_id !== actor.id) {
    problem(
      'fulfilment_customer_only',
      'Only the Project customer can perform this transition',
      403
    );
  }
}

function assertKnownState(booking) {
  if (!KNOWN_STATUSES.has(booking.status) || !KNOWN_PHASES.has(booking.operational_phase)) {
    problem(
      'fulfilment_state_unknown',
      'This Project state is not supported for automated fulfilment',
      409,
      'The Project remains read-only until support reconciles its legacy state.',
      { bookingStatus: booking.status, operationalPhase: booking.operational_phase }
    );
  }
}

function requirePolicy(booking) {
  if (!booking.policy_version) {
    problem(
      'fulfilment_policy_missing',
      'A fulfilment policy snapshot is required',
      409,
      'No timing, PIN, arrival or proposal policy is inferred for this Project.'
    );
  }
}

function assertExpectedRevision(booking, expectedRevision) {
  const currentRevision = Number(booking.lifecycle_revision || 0);
  if (currentRevision !== expectedRevision) {
    problem(
      'project_revision_mismatch',
      'Project revision is stale',
      412,
      'Fetch the latest fulfilment state before retrying this transition.',
      { expectedRevision, currentRevision }
    );
  }
}

function assertAccepted(booking, phases) {
  if (booking.status !== 'accepted' || !phases.includes(booking.operational_phase)) {
    problem(
      'fulfilment_wrong_phase',
      'This transition is not available in the current Project phase',
      409,
      'Refresh the Project and use an action listed in allowedActions.',
      { bookingStatus: booking.status, operationalPhase: booking.operational_phase }
    );
  }
}

async function assertNoOpenRecovery(client, bookingId) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM grounded_no_show_reports
        WHERE booking_id = $1 AND status IN ('received', 'replacement_requested')
     ) AS blocked`,
    [bookingId]
  );
  if (result.rows[0].blocked) {
    problem(
      'fulfilment_recovery_open',
      'Fulfilment is paused for no-show recovery',
      409,
      'Support or replacement handling must resolve the recovery record first.'
    );
  }
}

function assertAccessActive(booking) {
  if (booking.fulfilment_access_revoked_at) {
    problem(
      'fulfilment_access_revoked',
      'This Worker assignment can no longer advance fulfilment',
      409,
      'The assignment was revoked for a recovery or safety reason.'
    );
  }
}

async function beginCommand(client, context) {
  const fingerprint = requestHash(context.body, context.expectedRevision);
  let inserted = await client.query(
    `INSERT INTO grounded_fulfilment_commands (
       actor_user_id, booking_id, command_type, idempotency_key, request_hash
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (actor_user_id, booking_id, command_type, idempotency_key) DO NOTHING
     RETURNING request_hash`,
    [context.actor.id, context.bookingId, context.commandType, context.idempotencyKey, fingerprint]
  );
  if (inserted.rows.length) return { replay: false };

  let existing = await client.query(
    `SELECT request_hash, response_status, response_body, expires_at
       FROM grounded_fulfilment_commands
      WHERE actor_user_id = $1 AND booking_id = $2
        AND command_type = $3 AND idempotency_key = $4
      FOR UPDATE`,
    [context.actor.id, context.bookingId, context.commandType, context.idempotencyKey]
  );
  let row = existing.rows[0];
  if (row && new Date(row.expires_at) <= new Date()) {
    await client.query(
      `DELETE FROM grounded_fulfilment_commands
        WHERE actor_user_id = $1 AND booking_id = $2
          AND command_type = $3 AND idempotency_key = $4`,
      [context.actor.id, context.bookingId, context.commandType, context.idempotencyKey]
    );
    inserted = await client.query(
      `INSERT INTO grounded_fulfilment_commands (
         actor_user_id, booking_id, command_type, idempotency_key, request_hash
       ) VALUES ($1, $2, $3, $4, $5) RETURNING request_hash`,
      [context.actor.id, context.bookingId, context.commandType, context.idempotencyKey, fingerprint]
    );
    return { replay: false };
  }
  if (!row || row.request_hash !== fingerprint) {
    problem(
      'idempotency_key_reused',
      'Idempotency-Key reused with different input',
      422,
      'Use a fresh key when the body or If-Match revision changes.'
    );
  }
  if (row.response_status == null || !row.response_body) {
    problem(
      'idempotency_command_in_progress',
      'The command is still in progress',
      409,
      'Retry the exact request with the same Idempotency-Key.'
    );
  }
  return {
    replay: true,
    response: { status: Number(row.response_status), body: row.response_body },
  };
}

function receiptBody(context, response) {
  if (context.commandType !== 'reveal_start_pin' || !response.body.startPin) {
    return response.body;
  }
  const safe = { ...response.body };
  delete safe.startPin;
  safe._startPinChallengeId = response.startPinChallengeId;
  return safe;
}

async function completeCommand(client, context, response) {
  await client.query(
    `UPDATE grounded_fulfilment_commands
        SET response_status = $5, response_body = $6::jsonb, completed_at = NOW()
      WHERE actor_user_id = $1 AND booking_id = $2
        AND command_type = $3 AND idempotency_key = $4`,
    [
      context.actor.id,
      context.bookingId,
      context.commandType,
      context.idempotencyKey,
      response.status,
      JSON.stringify(receiptBody(context, response)),
    ]
  );
}

async function hydrateReplay(client, context, response) {
  const body = { ...response.body };
  const challengeId = body._startPinChallengeId;
  delete body._startPinChallengeId;
  if (context.commandType === 'reveal_start_pin' && challengeId) {
    const challenge = await store.getPinById(client, challengeId);
    if (challenge && challenge.status === 'active' && new Date(challenge.expires_at) > new Date()) {
      body.startPin = revealPin(challenge);
    } else {
      body.startPin = null;
    }
  }
  return { status: response.status, body };
}

async function executeCommand(context, commandType, mutate) {
  const fullContext = { ...context, commandType };
  return withTx(async (client) => {
    const booking = await store.getBooking(client, context.bookingId, context.actor, { forUpdate: true });
    if (!booking) {
      problem(
        'project_not_found',
        'Project not found',
        404,
        'No participant-visible Project exists for this identifier.'
      );
    }
    assertParticipantRole(booking, context.actor);
    const command = await beginCommand(client, fullContext);
    if (command.replay) {
      const hydrated = await hydrateReplay(client, fullContext, command.response);
      return { ...hydrated, replay: true, problem: hydrated.status >= 400 };
    }
    assertKnownState(booking);
    assertExpectedRevision(booking, context.expectedRevision);
    const response = await mutate(client, booking);
    await completeCommand(client, fullContext, response);
    return { ...response, replay: false, problem: response.status >= 400 };
  });
}

async function fulfilmentResponse(client, bookingId, actor, transition) {
  const booking = await store.getBooking(client, bookingId, actor);
  const state = await store.getState(client, booking);
  return {
    fulfilment: serializeFulfilment(booking, state, actor),
    transition,
  };
}

async function advance(client, booking, actor, {
  eventType,
  status = booking.status,
  phase = booking.operational_phase,
  payload = {},
}) {
  const revision = Number(booking.lifecycle_revision || 0) + 1;
  await store.appendEvent(client, {
    booking,
    revision,
    eventType,
    actor,
    status,
    phase,
    payload: { projectId: booking.id, revision, ...payload },
  });
  return revision;
}

async function startRoute(context) {
  return executeCommand(context, 'start_route', async (client, booking) => {
    assertWorker(booking, context.actor);
    requirePolicy(booking);
    assertAccepted(booking, ['scheduled']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);

    const revealAt = new Date(booking.scheduled_at).getTime()
      - Number(booking.route_reveal_lead_minutes) * 60_000;
    if (Date.now() < revealAt) {
      problem(
        'route_reveal_too_early',
        'Exact job location is not available yet',
        409,
        'Start route becomes available inside the snapshotted lead-time window.',
        { availableAt: new Date(revealAt).toISOString() }
      );
    }

    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      `UPDATE bookings
          SET operational_phase = 'en_route', en_route_at = NOW(),
              route_access_granted_at = NOW(), phase_updated_at = NOW(),
              lifecycle_revision = $2
        WHERE id = $1`,
      [booking.id, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'booking.en_route',
      actor: context.actor,
      status: 'accepted',
      phase: 'en_route',
      payload: { projectId: booking.id, revision, policyVersion: booking.policy_version },
    });
    return {
      status: 200,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'route_started', applied: true,
      }),
    };
  });
}

async function markArrived(context) {
  return executeCommand(context, 'mark_arrived', async (client, booking) => {
    assertWorker(booking, context.actor);
    requirePolicy(booking);
    assertAccepted(booking, ['en_route']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    if (booking.arrival_evidence_mode !== 'worker_attestation' || context.body.attestation !== true) {
      problem('arrival_evidence_unavailable', 'Approved arrival evidence is required', 409);
    }

    await client.query(
      `INSERT INTO grounded_arrival_attestations (
         booking_id, worker_id, evidence_mode
       ) VALUES ($1, $2, 'worker_attestation')`,
      [booking.id, context.actor.id]
    );
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      `UPDATE bookings
          SET operational_phase = 'arrived', arrived_at = NOW(),
              phase_updated_at = NOW(), lifecycle_revision = $2
        WHERE id = $1`,
      [booking.id, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'booking.arrived',
      actor: context.actor,
      status: 'accepted',
      phase: 'arrived',
      payload: { projectId: booking.id, revision, evidenceMode: 'worker_attestation' },
    });
    return {
      status: 200,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'arrival_attested', applied: true,
      }),
    };
  });
}

async function proposeScope(context) {
  return executeCommand(context, 'propose_scope', async (client, booking) => {
    requirePolicy(booking);
    assertAccepted(booking, ['arrived', 'scope_confirmation']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    if (await store.getPendingScope(client, booking.id, { forUpdate: true })) {
      problem('scope_proposal_pending', 'A scope proposal is already awaiting a decision', 409);
    }
    const current = await store.getConfirmedScope(client, booking.id, { forUpdate: true });
    const currentVersion = current ? Number(current.version) : null;
    if (context.body.baseVersion !== currentVersion) {
      problem(
        'scope_base_version_mismatch',
        'Scope base version is stale',
        412,
        'Propose against the current confirmed scope version.',
        { expectedBaseVersion: currentVersion, receivedBaseVersion: context.body.baseVersion }
      );
    }
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM grounded_scope_versions WHERE booking_id = $1',
      [booking.id]
    );
    const version = Number(versionResult.rows[0].version);
    const customer = actorRole(context.actor) === 'customer';
    await client.query(
      `INSERT INTO grounded_scope_versions (
         booking_id, version, base_version, status, source,
         proposed_by, proposed_by_role, scope_snapshot,
         customer_confirmed_by, customer_confirmed_at,
         worker_confirmed_by, worker_confirmed_at
       ) VALUES (
         $1, $2, $3, 'proposed', 'participant_proposal', $4, $5, $6::jsonb,
         $7, CASE WHEN $7::uuid IS NULL THEN NULL ELSE NOW() END,
         $8, CASE WHEN $8::uuid IS NULL THEN NULL ELSE NOW() END
       )`,
      [
        booking.id,
        version,
        currentVersion,
        context.actor.id,
        actorRole(context.actor),
        JSON.stringify({
          description: context.body.description,
          items: context.body.items,
          materialsResponsibility: context.body.materialsResponsibility,
          materialsResponsibilityCode: context.body.materialsResponsibilityCode,
          estimatedMinutes: context.body.estimatedMinutes,
        }),
        customer ? context.actor.id : null,
        customer ? null : context.actor.id,
      ]
    );
    const revoked = await client.query(
      `UPDATE grounded_start_pin_challenges
          SET status = 'revoked', revoked_at = NOW()
        WHERE booking_id = $1 AND status = 'active'
        RETURNING id`,
      [booking.id]
    );
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      `UPDATE bookings
          SET operational_phase = 'scope_confirmation', phase_updated_at = NOW(),
              scope_confirmed_by_customer = false,
              scope_confirmed_by_labourer = false,
              scope_confirmed_at = NULL,
              lifecycle_revision = $2
        WHERE id = $1`,
      [booking.id, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'scope.proposed',
      actor: context.actor,
      status: 'accepted',
      phase: 'scope_confirmation',
      payload: {
        projectId: booking.id,
        revision,
        scopeVersion: version,
        baseVersion: currentVersion,
        priorPinRevoked: revoked.rows.length > 0,
      },
    });
    return {
      status: 201,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'scope_proposed', applied: true, scopeVersion: version,
      }),
    };
  });
}

async function decideScope(context) {
  return executeCommand(context, 'confirm_scope', async (client, booking) => {
    requirePolicy(booking);
    assertAccepted(booking, ['scope_confirmation']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    const proposal = await store.getScopeVersion(
      client,
      booking.id,
      context.body.scopeVersion,
      { forUpdate: true }
    );
    if (!proposal || proposal.status !== 'proposed') {
      problem('scope_proposal_not_pending', 'The scope proposal is not awaiting a decision', 409);
    }
    if (proposal.proposed_by === context.actor.id) {
      problem(
        'scope_bilateral_confirmation_required',
        'The other participant must decide this scope',
        403,
        'A proposer cannot supply both sides of the bilateral confirmation.'
      );
    }

    const revision = Number(booking.lifecycle_revision || 0) + 1;
    if (context.body.decision === 'decline') {
      await client.query(
        `UPDATE grounded_scope_versions
            SET status = 'declined', declined_by = $3, declined_at = NOW(), updated_at = NOW()
          WHERE booking_id = $1 AND version = $2 AND status = 'proposed'`,
        [booking.id, proposal.version, context.actor.id]
      );
      const current = await store.getConfirmedScope(client, booking.id, { forUpdate: true });
      const phase = current ? 'scope_confirmation' : 'arrived';
      await client.query(
        `UPDATE bookings
            SET operational_phase = $2, phase_updated_at = NOW(), lifecycle_revision = $3
          WHERE id = $1`,
        [booking.id, phase, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: 'scope.declined',
        actor: context.actor,
        status: 'accepted',
        phase,
        payload: { projectId: booking.id, revision, scopeVersion: Number(proposal.version) },
      });
      return {
        status: 200,
        body: await fulfilmentResponse(client, booking.id, context.actor, {
          type: 'scope_declined', applied: true, scopeVersion: Number(proposal.version),
        }),
      };
    }

    const customer = context.actor.role === 'customer';
    await client.query(
      `UPDATE grounded_scope_versions
          SET status = 'superseded', updated_at = NOW()
        WHERE booking_id = $1 AND status = 'confirmed'`,
      [booking.id]
    );
    await client.query(
      `UPDATE grounded_scope_versions
          SET status = 'confirmed',
              customer_confirmed_by = COALESCE(customer_confirmed_by, $3),
              customer_confirmed_at = COALESCE(customer_confirmed_at, NOW()),
              worker_confirmed_by = COALESCE(worker_confirmed_by, $4),
              worker_confirmed_at = COALESCE(worker_confirmed_at, NOW()),
              updated_at = NOW()
        WHERE booking_id = $1 AND version = $2 AND status = 'proposed'`,
      [
        booking.id,
        proposal.version,
        customer ? context.actor.id : null,
        customer ? null : context.actor.id,
      ]
    );
    await client.query(
      `UPDATE bookings
          SET current_scope_version = $2,
              scope_items = $3::jsonb,
              scope_confirmed_by_customer = true,
              scope_confirmed_by_labourer = true,
              scope_confirmed_at = NOW(),
              operational_phase = 'scope_confirmation',
              phase_updated_at = NOW(), lifecycle_revision = $4
        WHERE id = $1`,
      [booking.id, proposal.version, JSON.stringify(proposal.scope_snapshot.items || []), revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'scope.confirmed',
      actor: context.actor,
      status: 'accepted',
      phase: 'scope_confirmation',
      payload: { projectId: booking.id, revision, scopeVersion: Number(proposal.version) },
    });
    return {
      status: 200,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'scope_confirmed', applied: true, scopeVersion: Number(proposal.version),
      }),
    };
  });
}

async function revealStartPin(context) {
  return executeCommand(context, 'reveal_start_pin', async (client, booking) => {
    assertCustomer(booking, context.actor);
    requirePolicy(booking);
    assertAccepted(booking, ['scope_confirmation']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    const pending = await store.getPendingScope(client, booking.id, { forUpdate: true });
    const scope = await store.getConfirmedScope(client, booking.id, { forUpdate: true });
    if (pending || !scope || Number(scope.version) !== Number(booking.current_scope_version)) {
      problem(
        'start_scope_not_confirmed',
        'Both participants must confirm the current scope first',
        409
      );
    }
    if (!scopeMaterialsResolved(scope)) {
      problem(
        'start_materials_responsibility_unresolved',
        'Materials responsibility must be confirmed before work starts',
        409,
        'Confirm who supplies materials or parts in a bilateral on-site scope before revealing the start PIN.'
      );
    }

    let challenge = await store.getActivePin(client, booking.id, { forUpdate: true });
    if (challenge && new Date(challenge.expires_at) <= new Date()) {
      await client.query(
        `UPDATE grounded_start_pin_challenges
            SET status = 'expired'
          WHERE id = $1 AND status = 'active'`,
        [challenge.id]
      );
      challenge = null;
    }
    let created = false;
    if (!challenge) {
      const generationResult = await client.query(
        `SELECT COALESCE(MAX(generation), 0) + 1 AS generation
           FROM grounded_start_pin_challenges WHERE booking_id = $1`,
        [booking.id]
      );
      const generation = Number(generationResult.rows[0].generation);
      const material = createPinMaterial({
        bookingId: booking.id,
        scopeVersion: Number(scope.version),
        generation,
      });
      const inserted = await client.query(
        `INSERT INTO grounded_start_pin_challenges (
           booking_id, generation, scope_version, pin_salt, pin_hash,
           max_attempts, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 * INTERVAL '1 minute'))
         RETURNING *`,
        [
          booking.id,
          generation,
          scope.version,
          material.salt,
          material.hash,
          booking.start_pin_max_attempts,
          booking.start_pin_ttl_minutes,
        ]
      );
      challenge = inserted.rows[0];
      created = true;
      const revision = Number(booking.lifecycle_revision || 0) + 1;
      await client.query(
        `UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1`,
        [booking.id, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: 'start_pin.issued',
        actor: context.actor,
        status: 'accepted',
        phase: 'scope_confirmation',
        payload: {
          projectId: booking.id,
          revision,
          scopeVersion: Number(scope.version),
          generation,
          expiresAt: new Date(challenge.expires_at).toISOString(),
        },
      });
    }
    const body = await fulfilmentResponse(client, booking.id, context.actor, {
      type: 'start_pin_revealed', applied: created,
    });
    body.startPin = revealPin(challenge);
    body.expiresAt = new Date(challenge.expires_at).toISOString();
    return { status: created ? 201 : 200, body, startPinChallengeId: challenge.id };
  });
}

async function startWork(context) {
  return executeCommand(context, 'start_work', async (client, booking) => {
    assertWorker(booking, context.actor);
    requirePolicy(booking);
    assertAccepted(booking, ['scope_confirmation']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    if (await store.getPendingScope(client, booking.id, { forUpdate: true })) {
      problem('start_scope_pending', 'The pending scope must be decided before work starts', 409);
    }
    const scope = await store.getConfirmedScope(client, booking.id, { forUpdate: true });
    if (!scope || Number(scope.version) !== Number(booking.current_scope_version)) {
      problem('start_scope_not_confirmed', 'Both participants must confirm the current scope first', 409);
    }
    if (!scopeMaterialsResolved(scope)) {
      problem(
        'start_materials_responsibility_unresolved',
        'Materials responsibility must be confirmed before work starts',
        409,
        'Confirm who supplies materials or parts in a bilateral on-site scope before entering the start PIN.'
      );
    }
    const pendingReschedule = await client.query(
      `SELECT EXISTS (
         SELECT 1 FROM grounded_reschedule_proposals
          WHERE booking_id = $1 AND status = 'pending'
       ) AS exists`,
      [booking.id]
    );
    if (pendingReschedule.rows[0].exists) {
      problem('start_reschedule_pending', 'The pending reschedule must be decided before work starts', 409);
    }
    const challenge = await store.getActivePin(client, booking.id, { forUpdate: true });
    if (!challenge || Number(challenge.scope_version) !== Number(scope.version)) {
      problem('start_pin_not_active', 'Ask the customer to reveal a current start PIN', 409);
    }

    if (new Date(challenge.expires_at) <= new Date()) {
      await client.query(
        `UPDATE grounded_start_pin_challenges SET status = 'expired'
          WHERE id = $1 AND status = 'active'`,
        [challenge.id]
      );
      const revision = Number(booking.lifecycle_revision || 0) + 1;
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: 'start_pin.expired',
        actor: context.actor,
        status: 'accepted',
        phase: 'scope_confirmation',
        payload: { projectId: booking.id, revision, challengeId: challenge.id },
      });
      const fulfilment = await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'start_pin_expired', applied: true,
      });
      return {
        status: 409,
        body: problemBody(
          'start_pin_expired',
          'The start PIN has expired',
          409,
          'Ask the customer to reveal a new PIN.',
          null,
          fulfilment
        ),
      };
    }

    const deviceHash = deviceIdHash(context.body.deviceId);
    if (!verifyPin(context.body.startPin, challenge)) {
      const attempts = Number(challenge.failed_attempts) + 1;
      const locked = attempts >= Number(challenge.max_attempts);
      await client.query(
        `UPDATE grounded_start_pin_challenges
            SET failed_attempts = $2,
                status = CASE WHEN $3 THEN 'locked' ELSE 'active' END,
                locked_at = CASE WHEN $3 THEN NOW() ELSE NULL END
          WHERE id = $1 AND status = 'active'`,
        [challenge.id, attempts, locked]
      );
      await client.query(
        `INSERT INTO grounded_start_pin_attempts (
           challenge_id, booking_id, worker_id, device_id_hash, outcome
         ) VALUES ($1, $2, $3, $4, $5)`,
        [challenge.id, booking.id, context.actor.id, deviceHash, locked ? 'locked' : 'invalid']
      );
      const revision = Number(booking.lifecycle_revision || 0) + 1;
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: locked ? 'start_pin.locked' : 'start_pin.invalid',
        actor: context.actor,
        status: 'accepted',
        phase: 'scope_confirmation',
        payload: {
          projectId: booking.id,
          revision,
          challengeId: challenge.id,
          attemptsRemaining: Math.max(0, Number(challenge.max_attempts) - attempts),
        },
      });
      const fulfilment = await fulfilmentResponse(client, booking.id, context.actor, {
        type: locked ? 'start_pin_locked' : 'start_pin_rejected', applied: true,
      });
      return {
        status: 403,
        body: problemBody(
          locked ? 'start_pin_locked' : 'start_pin_invalid',
          locked ? 'The start PIN is locked' : 'The start PIN is incorrect',
          403,
          locked ? 'The customer must reveal a new PIN.' : 'Check the PIN with the customer and retry.',
          { attemptsRemaining: Math.max(0, Number(challenge.max_attempts) - attempts) },
          fulfilment
        ),
      };
    }

    await client.query(
      `INSERT INTO grounded_start_pin_attempts (
         challenge_id, booking_id, worker_id, device_id_hash, outcome
       ) VALUES ($1, $2, $3, $4, 'success')`,
      [challenge.id, booking.id, context.actor.id, deviceHash]
    );
    await client.query(
      `UPDATE grounded_start_pin_challenges
          SET status = 'consumed', consumed_at = NOW()
        WHERE id = $1 AND status = 'active'`,
      [challenge.id]
    );
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      `UPDATE bookings
          SET status = 'in_progress', operational_phase = 'work_active',
              work_started_at = NOW(), start_verified_at = NOW(),
              start_verified_by = $2, start_device_id_hash = $3,
              phase_updated_at = NOW(), lifecycle_revision = $4
        WHERE id = $1 AND status = 'accepted'`,
      [booking.id, context.actor.id, deviceHash, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'booking.started',
      actor: context.actor,
      status: 'in_progress',
      phase: 'work_active',
      payload: {
        projectId: booking.id,
        revision,
        scopeVersion: Number(scope.version),
        challengeId: challenge.id,
      },
    });
    return {
      status: 200,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'work_started', applied: true,
      }),
    };
  });
}

async function proposeReschedule(context) {
  return executeCommand(context, 'propose_reschedule', async (client, booking) => {
    requirePolicy(booking);
    assertAccepted(booking, ['scheduled']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    const pending = await client.query(
      `SELECT id FROM grounded_reschedule_proposals
        WHERE booking_id = $1 AND status = 'pending' FOR UPDATE`,
      [booking.id]
    );
    if (pending.rows.length) {
      problem('reschedule_proposal_pending', 'A reschedule proposal is already awaiting a decision', 409);
    }
    if (context.body.proposedStartsAt.getTime() === new Date(booking.scheduled_at).getTime()) {
      problem('reschedule_time_unchanged', 'The proposed schedule must be different', 422);
    }
    if (context.body.proposedStartsAt.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
      problem('reschedule_time_too_distant', 'The proposed schedule is outside the supported 90-day window', 422);
    }
    const versionResult = await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM grounded_reschedule_proposals WHERE booking_id = $1`,
      [booking.id]
    );
    const version = Number(versionResult.rows[0].version);
    const inserted = await client.query(
      `INSERT INTO grounded_reschedule_proposals (
         booking_id, version, schedule_revision, proposed_by, proposed_by_role,
         original_scheduled_at, proposed_scheduled_at, reason, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 NOW() + ($9 * INTERVAL '1 minute'))
       RETURNING id`,
      [
        booking.id,
        version,
        booking.schedule_revision,
        context.actor.id,
        actorRole(context.actor),
        booking.scheduled_at,
        context.body.proposedStartsAt,
        context.body.reason,
        booking.reschedule_expiry_minutes,
      ]
    );
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
      [booking.id, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'reschedule.requested',
      actor: context.actor,
      status: 'accepted',
      phase: 'scheduled',
      payload: {
        projectId: booking.id,
        revision,
        proposalId: inserted.rows[0].id,
        scheduleRevision: Number(booking.schedule_revision),
      },
    });
    return {
      status: 201,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'reschedule_proposed', applied: true, proposalId: inserted.rows[0].id,
      }),
    };
  });
}

async function decideReschedule(context, decision) {
  const commandType = decision === 'accept' ? 'accept_reschedule' : 'decline_reschedule';
  const keyedContext = { ...context, body: { ...context.body, proposalId: context.proposalId } };
  return executeCommand(keyedContext, commandType, async (client, booking) => {
    requirePolicy(booking);
    assertAccepted(booking, ['scheduled']);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    const proposal = await store.getReschedule(
      client,
      booking.id,
      context.proposalId,
      { forUpdate: true }
    );
    if (!proposal || proposal.status !== 'pending') {
      problem('reschedule_not_pending', 'The reschedule proposal is not awaiting a decision', 409);
    }
    if (proposal.proposed_by === context.actor.id) {
      problem(
        'reschedule_bilateral_decision_required',
        'The other participant must decide this reschedule',
        403
      );
    }
    if (Number(proposal.schedule_revision) !== Number(booking.schedule_revision)) {
      problem('reschedule_schedule_stale', 'The proposal targets an old schedule revision', 409);
    }
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    if (new Date(proposal.expires_at) <= new Date()) {
      await client.query(
        `UPDATE grounded_reschedule_proposals
            SET status = 'expired', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [proposal.id]
      );
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: 'reschedule.expired',
        actor: context.actor,
        status: 'accepted',
        phase: 'scheduled',
        payload: { projectId: booking.id, revision, proposalId: proposal.id },
      });
      const fulfilment = await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'reschedule_expired', applied: true,
      });
      return {
        status: 409,
        body: problemBody(
          'reschedule_expired',
          'The reschedule proposal has expired',
          409,
          'Create a new proposal if the schedule still needs to change.',
          null,
          fulfilment
        ),
      };
    }
    const status = decision === 'accept' ? 'accepted' : 'declined';
    await client.query(
      `UPDATE grounded_reschedule_proposals
          SET status = $2, decided_by = $3, decided_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [proposal.id, status, context.actor.id]
    );
    if (decision === 'accept') {
      await client.query(
        `UPDATE bookings
            SET scheduled_at = $2, schedule_revision = schedule_revision + 1,
                lifecycle_revision = $3, phase_updated_at = NOW()
          WHERE id = $1`,
        [booking.id, proposal.proposed_scheduled_at, revision]
      );
    } else {
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
    }
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: decision === 'accept' ? 'reschedule.accepted' : 'reschedule.declined',
      actor: context.actor,
      status: 'accepted',
      phase: 'scheduled',
      payload: { projectId: booking.id, revision, proposalId: proposal.id },
    });
    return {
      status: 200,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: decision === 'accept' ? 'reschedule_accepted' : 'reschedule_declined',
        applied: true,
        proposalId: proposal.id,
      }),
    };
  });
}

async function proposeChangeOrder(context) {
  return executeCommand(context, 'propose_change_order', async (client, booking) => {
    assertWorker(booking, context.actor);
    requirePolicy(booking);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    if (booking.status !== 'in_progress' || booking.operational_phase !== 'work_active') {
      problem('change_order_wrong_phase', 'Change orders require active work', 409);
    }
    const scope = await store.getConfirmedScope(client, booking.id, { forUpdate: true });
    if (!scope || Number(scope.version) !== context.body.baseScopeVersion) {
      problem(
        'change_order_scope_stale',
        'The change order targets an old scope version',
        412,
        null,
        { currentScopeVersion: scope ? Number(scope.version) : null }
      );
    }
    const completion = await client.query(
      'SELECT status FROM grounded_project_completions WHERE booking_id = $1',
      [booking.id]
    );
    if (completion.rows.length) {
      problem('change_order_completion_open', 'Change orders are closed after completion review begins', 409);
    }
    const pending = await client.query(
      `SELECT id FROM change_orders
        WHERE booking_id = $1 AND status = 'pending' FOR UPDATE`,
      [booking.id]
    );
    if (pending.rows.length) {
      problem('change_order_pending', 'A change order is already awaiting a customer decision', 409);
    }
    if (booking.total_amount == null) {
      problem(
        'change_order_commercial_baseline_missing',
        'The agreed commercial total is unavailable',
        409,
        'No new price can be calculated without a durable original total.'
      );
    }
    const additional = (Number(context.body.labourAmount) + Number(context.body.materialsAmount)).toFixed(2);
    const legacy = await client.query(
      `INSERT INTO change_orders (
         booking_id, requested_by, description, extra_hours, extra_amount
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        booking.id,
        context.actor.id,
        context.body.description,
        context.body.extraMinutes == null ? null : context.body.extraMinutes / 60,
        additional,
      ]
    );
    const versionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM grounded_change_orders WHERE booking_id = $1',
      [booking.id]
    );
    const version = Number(versionResult.rows[0].version);
    const inserted = await client.query(
      `INSERT INTO grounded_change_orders (
         booking_id, version, base_scope_version, legacy_change_order_id,
         proposed_by, description, added_scope_items, extra_minutes,
         labour_amount, materials_amount, original_total_amount, expires_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11,
                 NOW() + ($12 * INTERVAL '1 minute'))
       RETURNING id`,
      [
        booking.id,
        version,
        scope.version,
        legacy.rows[0].id,
        context.actor.id,
        context.body.description,
        JSON.stringify(context.body.addedScopeItems),
        context.body.extraMinutes,
        context.body.labourAmount,
        context.body.materialsAmount,
        booking.total_amount,
        booking.change_order_expiry_minutes,
      ]
    );
    await client.query(
      'UPDATE change_orders SET canonical_grounded_id = $2 WHERE id = $1',
      [legacy.rows[0].id, inserted.rows[0].id]
    );
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
      [booking.id, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'change_order.requested',
      actor: context.actor,
      status: 'in_progress',
      phase: 'work_active',
      payload: {
        projectId: booking.id,
        revision,
        changeOrderId: inserted.rows[0].id,
        baseScopeVersion: Number(scope.version),
        commercial: {
          originalTotalAmount: String(booking.total_amount),
          additionalAmount: additional,
          currency: 'ZAR',
        },
      },
    });
    return {
      status: 201,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'change_order_proposed', applied: true, changeOrderId: inserted.rows[0].id,
      }),
    };
  });
}

async function decideChangeOrder(context, decision) {
  const commandType = decision === 'approve' ? 'approve_change_order' : 'decline_change_order';
  const keyedContext = { ...context, body: { ...context.body, changeOrderId: context.changeOrderId } };
  return executeCommand(keyedContext, commandType, async (client, booking) => {
    assertCustomer(booking, context.actor);
    requirePolicy(booking);
    assertAccessActive(booking);
    await assertNoOpenRecovery(client, booking.id);
    if (booking.status !== 'in_progress' || booking.operational_phase !== 'work_active') {
      problem('change_order_wrong_phase', 'Change orders require active work', 409);
    }
    const change = await store.getChange(client, booking.id, context.changeOrderId, { forUpdate: true });
    if (!change || change.status !== 'pending') {
      problem('change_order_not_pending', 'The change order is not awaiting a decision', 409);
    }
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    if (new Date(change.expires_at) <= new Date()) {
      await client.query(
        `UPDATE grounded_change_orders SET status = 'expired', updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [change.id]
      );
      await client.query(
        `UPDATE change_orders SET status = 'declined', responded_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [change.legacy_change_order_id]
      );
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: 'change_order.expired',
        actor: context.actor,
        status: 'in_progress',
        phase: 'work_active',
        payload: { projectId: booking.id, revision, changeOrderId: change.id },
      });
      const fulfilment = await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'change_order_expired', applied: true,
      });
      return {
        status: 409,
        body: problemBody(
          'change_order_expired',
          'The change order has expired',
          409,
          'The Worker must create a fresh change order.',
          null,
          fulfilment
        ),
      };
    }
    const currentScope = await store.getConfirmedScope(client, booking.id, { forUpdate: true });
    if (!currentScope || Number(currentScope.version) !== Number(change.base_scope_version)) {
      problem('change_order_scope_stale', 'The change order targets an old scope version', 409);
    }

    if (decision === 'decline') {
      await client.query(
        `UPDATE grounded_change_orders
            SET status = 'declined', decided_by = $2, decided_at = NOW(), updated_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [change.id, context.actor.id]
      );
      await client.query(
        `UPDATE change_orders SET status = 'declined', responded_at = NOW()
          WHERE id = $1 AND status = 'pending'`,
        [change.legacy_change_order_id]
      );
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
      await store.appendEvent(client, {
        booking,
        revision,
        eventType: 'change_order.declined',
        actor: context.actor,
        status: 'in_progress',
        phase: 'work_active',
        payload: { projectId: booking.id, revision, changeOrderId: change.id },
      });
      return {
        status: 200,
        body: await fulfilmentResponse(client, booking.id, context.actor, {
          type: 'change_order_declined', applied: true, changeOrderId: change.id,
        }),
      };
    }

    const currentSnapshot = canonicalScopeSnapshot(currentScope.scope_snapshot, currentScope.source) || {};
    const currentItems = Array.isArray(currentSnapshot.items) ? currentSnapshot.items : [];
    const addedItems = Array.isArray(change.added_scope_items) ? change.added_scope_items : [];
    if (currentItems.length < 1 || !currentItems.every((item) => (
      typeof item === 'string' && item.trim().length > 0
    ))) {
      problem(
        'change_order_scope_not_canonical',
        'The current scope cannot be safely extended',
        409,
        'The existing agreement contains an unsupported scope shape and must be reconciled first.'
      );
    }
    const history = Array.isArray(currentSnapshot.changeOrders) ? currentSnapshot.changeOrders : [];
    const nextVersionResult = await client.query(
      'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM grounded_scope_versions WHERE booking_id = $1',
      [booking.id]
    );
    const nextVersion = Number(nextVersionResult.rows[0].version);
    const nextSnapshot = {
      ...currentSnapshot,
      items: [...currentItems, ...addedItems],
      estimatedMinutes: currentSnapshot.estimatedMinutes == null
        ? null
        : Number(currentSnapshot.estimatedMinutes) + Number(change.extra_minutes || 0),
      changeOrders: [
        ...history,
        {
          id: change.id,
          description: change.description,
          addedScopeItems: addedItems,
          extraMinutes: change.extra_minutes == null ? null : Number(change.extra_minutes),
          commercial: {
            additionalAmount: String(change.additional_amount),
            revisedTotalAmount: String(change.revised_total_amount),
            currency: change.currency,
          },
        },
      ],
    };
    await client.query(
      `UPDATE grounded_scope_versions SET status = 'superseded', updated_at = NOW()
        WHERE booking_id = $1 AND status = 'confirmed'`,
      [booking.id]
    );
    await client.query(
      `INSERT INTO grounded_scope_versions (
         booking_id, version, base_version, status, source,
         proposed_by, proposed_by_role, scope_snapshot,
         customer_confirmed_by, customer_confirmed_at,
         worker_confirmed_by, worker_confirmed_at
       ) VALUES (
         $1, $2, $3, 'confirmed', 'approved_change_order',
         $4, 'labourer', $5::jsonb, $6, NOW(), $4, NOW()
       )`,
      [
        booking.id,
        nextVersion,
        currentScope.version,
        change.proposed_by,
        JSON.stringify(nextSnapshot),
        context.actor.id,
      ]
    );
    await client.query(
      `UPDATE grounded_change_orders
          SET status = 'approved', decided_by = $2, decided_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [change.id, context.actor.id]
    );
    await client.query(
      `UPDATE change_orders SET status = 'accepted', responded_at = NOW()
        WHERE id = $1 AND status = 'pending'`,
      [change.legacy_change_order_id]
    );
    await client.query(
      `UPDATE bookings
          SET current_scope_version = $2, scope_items = $3::jsonb,
              total_amount = $4, lifecycle_revision = $5, phase_updated_at = NOW()
        WHERE id = $1`,
      [booking.id, nextVersion, JSON.stringify(nextSnapshot.items), change.revised_total_amount, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'change_order.approved',
      actor: context.actor,
      status: 'in_progress',
      phase: 'work_active',
      payload: {
        projectId: booking.id,
        revision,
        changeOrderId: change.id,
        scopeVersion: nextVersion,
        commercial: {
          previousTotalAmount: String(change.original_total_amount),
          additionalAmount: String(change.additional_amount),
          revisedTotalAmount: String(change.revised_total_amount),
          currency: change.currency,
        },
      },
    });
    return {
      status: 200,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'change_order_approved',
        applied: true,
        changeOrderId: change.id,
        scopeVersion: nextVersion,
      }),
    };
  });
}

async function reportNoShow(context) {
  return executeCommand(context, 'report_no_show', async (client, booking) => {
    requirePolicy(booking);
    assertAccepted(booking, ['scheduled', 'en_route']);
    const eligibleAt = new Date(booking.scheduled_at).getTime()
      + Number(booking.no_show_grace_minutes) * 60_000;
    if (Date.now() < eligibleAt) {
      problem(
        'no_show_grace_active',
        'The no-show grace window is still active',
        409,
        'No-show reporting becomes available after the snapshotted grace period.',
        { eligibleAt: new Date(eligibleAt).toISOString() }
      );
    }
    const absentRole = context.actor.role === 'customer' ? 'labourer' : 'customer';
    const inserted = await client.query(
      `INSERT INTO grounded_no_show_reports (
         booking_id, reported_by, absent_role, attestation
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id, absent_role) DO NOTHING
       RETURNING id`,
      [booking.id, context.actor.id, absentRole, context.body.attestation]
    );
    if (!inserted.rows.length) {
      problem('no_show_already_reported', 'This no-show has already been reported', 409);
    }
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    if (absentRole === 'labourer') {
      await client.query(
        `UPDATE bookings
            SET fulfilment_access_revoked_at = NOW(),
                fulfilment_access_revoked_reason = 'worker_no_show',
                lifecycle_revision = $2, phase_updated_at = NOW()
          WHERE id = $1`,
        [booking.id, revision]
      );
    } else {
      await client.query(
        'UPDATE bookings SET lifecycle_revision = $2, phase_updated_at = NOW() WHERE id = $1',
        [booking.id, revision]
      );
    }
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'no_show.reported',
      actor: context.actor,
      status: 'accepted',
      phase: booking.operational_phase,
      payload: {
        projectId: booking.id,
        revision,
        noShowReportId: inserted.rows[0].id,
        absentRole: publicRole(absentRole),
        workerAccessRevoked: absentRole === 'labourer',
      },
    });
    return {
      status: 201,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'no_show_reported', applied: true, noShowReportId: inserted.rows[0].id,
      }),
    };
  });
}

async function requestReplacement(context) {
  return executeCommand(context, 'request_replacement', async (client, booking) => {
    assertCustomer(booking, context.actor);
    requirePolicy(booking);
    assertAccepted(booking, ['scheduled', 'en_route']);
    const reportResult = await client.query(
      `SELECT * FROM grounded_no_show_reports
        WHERE booking_id = $1 AND absent_role = 'labourer'
          AND status IN ('received', 'replacement_requested')
        FOR UPDATE`,
      [booking.id]
    );
    const report = reportResult.rows[0];
    if (!report) {
      problem(
        'replacement_no_show_required',
        'A Worker no-show report is required before replacement',
        409
      );
    }
    const inserted = await client.query(
      `INSERT INTO grounded_replacement_requests (
         booking_id, no_show_report_id, requested_by, original_worker_id
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id) DO NOTHING
       RETURNING id`,
      [booking.id, report.id, context.actor.id, booking.labourer_id]
    );
    if (!inserted.rows.length) {
      problem('replacement_already_requested', 'A replacement request already exists', 409);
    }
    await client.query(
      `UPDATE grounded_no_show_reports SET status = 'replacement_requested'
        WHERE id = $1 AND status = 'received'`,
      [report.id]
    );
    const revision = Number(booking.lifecycle_revision || 0) + 1;
    await client.query(
      `UPDATE bookings
          SET fulfilment_access_revoked_at = COALESCE(fulfilment_access_revoked_at, NOW()),
              fulfilment_access_revoked_reason = 'replacement_requested',
              lifecycle_revision = $2, phase_updated_at = NOW()
        WHERE id = $1`,
      [booking.id, revision]
    );
    await store.appendEvent(client, {
      booking,
      revision,
      eventType: 'replacement.requested',
      actor: context.actor,
      status: 'accepted',
      phase: booking.operational_phase,
      payload: {
        projectId: booking.id,
        revision,
        replacementRequestId: inserted.rows[0].id,
        originalWorkerAccessRevoked: true,
        assignmentChanged: false,
      },
    });
    return {
      status: 202,
      body: await fulfilmentResponse(client, booking.id, context.actor, {
        type: 'replacement_requested',
        applied: true,
        replacementRequestId: inserted.rows[0].id,
        assignmentChanged: false,
      }),
    };
  });
}

module.exports = {
  startRoute,
  markArrived,
  proposeScope,
  decideScope,
  revealStartPin,
  startWork,
  proposeReschedule,
  decideReschedule,
  proposeChangeOrder,
  decideChangeOrder,
  reportNoShow,
  requestReplacement,
};
