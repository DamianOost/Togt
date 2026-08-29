const db = require('../../config/db');
const {
  assertUuid,
  normalizeRequestInput,
  normalizeQuoteInput,
  mergeQuoteInput,
  assertCompleteQuote,
  hashPayload,
  rejectUnknownFields,
  assertEmptyCommandBody,
  fail,
} = require('./contracts');
const { catalogueService, requestProjection, quoteProjection } = require('./projections');
const store = require('./store');
const {
  requireApprovedFulfilmentPolicy,
  bootstrapCanonicalFulfilment,
} = require('../groundedFulfilment/bootstrap');

function positiveVersion(value, label = 'serviceVersion') {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail('service_version_invalid', `${label} must be a positive integer`, 400);
  }
  return value;
}

async function executeCommand({ actor, commandType, key, identity, body, run }) {
  const requestHash = hashPayload({ identity, body: body || {} });
  return db.withTx(async (client) => {
    await client.query('DELETE FROM grounded_quote_command_receipts WHERE expires_at <= NOW()');
    const inserted = await client.query(
      `INSERT INTO grounded_quote_command_receipts (
         actor_user_id, command_type, idempotency_key, request_hash
       ) VALUES ($1, $2, $3, $4)
       ON CONFLICT (actor_user_id, command_type, idempotency_key) DO NOTHING
       RETURNING actor_user_id`,
      [actor.id, commandType, key, requestHash]
    );
    if (inserted.rows.length === 0) {
      const existing = await client.query(
        `SELECT request_hash, response_status, response_body
           FROM grounded_quote_command_receipts
          WHERE actor_user_id = $1 AND command_type = $2 AND idempotency_key = $3
          FOR UPDATE`,
        [actor.id, commandType, key]
      );
      const receipt = existing.rows[0];
      if (!receipt || receipt.request_hash !== requestHash) {
        fail(
          'idempotency_key_reused',
          'Idempotency-Key reused with different input',
          422,
          'Use a fresh key when the route, resource or request body changes.'
        );
      }
      if (receipt.response_status == null || receipt.response_body == null) {
        fail('command_in_progress', 'The command is still in progress', 409);
      }
      return {
        status: Number(receipt.response_status),
        body: receipt.response_body,
        replayed: true,
      };
    }

    const response = await run(client);
    await client.query(
      `UPDATE grounded_quote_command_receipts
          SET response_status = $4, response_body = $5::jsonb, completed_at = NOW()
        WHERE actor_user_id = $1 AND command_type = $2 AND idempotency_key = $3`,
      [actor.id, commandType, key, response.status, JSON.stringify(response.body)]
    );
    return { ...response, replayed: false };
  });
}

async function appendEvent(client, {
  request,
  quote = null,
  eventType,
  actor,
  payload = {},
}) {
  await client.query(
    `INSERT INTO grounded_quote_events (
       quote_request_id, quote_id, event_type, actor_user_id, actor_role,
       request_version, request_status, quote_version, quote_status, payload
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      request.id,
      quote?.id || null,
      eventType,
      actor.id,
      actor.role,
      Number(request.request_version),
      request.status,
      quote?.current_version == null ? null : Number(quote.current_version),
      quote?.status || null,
      JSON.stringify(payload),
    ]
  );
}

function validateQuoteCommandWrapper(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  rejectUnknownFields(input, ['quote', 'submit'], 'quote command');
  if (Object.prototype.hasOwnProperty.call(input, 'submit') && typeof input.submit !== 'boolean') {
    fail('quote_payload_invalid', 'submit must be a boolean', 422);
  }
  return input;
}

function quoteInputFromRow(row) {
  return {
    scope: row.scope,
    deliverables: row.deliverables || [],
    exclusions: row.exclusions || [],
    assumptions: row.assumptions || [],
    proposedStartAt: row.proposed_start_at,
    proposedEndAt: row.proposed_end_at,
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    labourAmount: row.labour_amount == null ? null : String(row.labour_amount),
    materialsAmount: row.materials_amount == null ? null : String(row.materials_amount),
    validUntil: row.valid_until,
  };
}

function preparedQuoteInput(input) {
  return {
    scope: input.scope ?? null,
    deliverables: input.deliverables ?? [],
    exclusions: input.exclusions ?? [],
    assumptions: input.assumptions ?? [],
    proposedStartAt: input.proposedStartAt ?? null,
    proposedEndAt: input.proposedEndAt ?? null,
    durationMinutes: input.durationMinutes ?? null,
    labourAmount: input.labourAmount ?? null,
    materialsAmount: input.materialsAmount ?? null,
    validUntil: input.validUntil ?? null,
  };
}

async function insertQuoteVersion(client, quoteId, version, input, authoredAs) {
  const prepared = preparedQuoteInput(input);
  const contentHash = hashPayload({ ...prepared, authoredAs });
  await client.query(
    `INSERT INTO grounded_quote_versions (
       quote_id, version, scope, deliverables, exclusions, assumptions,
       proposed_start_at, proposed_end_at, duration_minutes,
       labour_amount, materials_amount, currency,
       platform_fee_snapshot, worker_net_snapshot, valid_until,
       authored_as, content_hash
     ) VALUES (
       $1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb,
       $7, $8, $9, $10, $11, 'ZAR',
       '{"state":"not_configured","amount":null}'::jsonb,
       '{"state":"not_available","amount":null}'::jsonb,
       $12, $13, $14
     )`,
    [
      quoteId,
      version,
      prepared.scope,
      JSON.stringify(prepared.deliverables),
      JSON.stringify(prepared.exclusions),
      JSON.stringify(prepared.assumptions),
      prepared.proposedStartAt,
      prepared.proposedEndAt,
      prepared.durationMinutes,
      prepared.labourAmount,
      prepared.materialsAmount,
      prepared.validUntil,
      authoredAs,
      contentHash,
    ]
  );
}

async function requireActiveRequest(client, requestId) {
  const request = await store.loadRequest(client, requestId, { lock: true });
  if (!request) fail('quote_request_not_found', 'Quote request not found', 404);
  if (!['open', 'receiving'].includes(request.status) || new Date(request.quotes_close_at) <= new Date()) {
    fail('quote_request_closed', 'Quote request is no longer accepting quotes', 409, undefined, {
      status: request.status,
    });
  }
  return request;
}

async function createRequest({ actor, key, body }) {
  const serviceId = assertUuid(body?.serviceId, 'service_id');
  const serviceVersion = positiveVersion(body?.serviceVersion);
  return executeCommand({
    actor,
    commandType: 'create_request',
    key,
    identity: { serviceId, serviceVersion },
    body,
    run: async (client) => {
      const service = await store.getCatalogueService(client, serviceId, serviceVersion);
      if (!service) fail('catalogue_service_not_found', 'Published service version not found', 404);
      if (service.pricing_mode !== 'remote_quote' || service.fulfilment_mode !== 'receive_quotes') {
        fail(
          'service_not_quote_enabled',
          'This service version does not use remote quotes',
          422,
          'Start the fulfilment mode declared by the catalogue instead.'
        );
      }
      const input = normalizeRequestInput(body, service);
      const snapshot = catalogueService(service);
      const inserted = await client.query(
        `INSERT INTO grounded_quote_requests (
           customer_id, service_id, service_version, service_snapshot,
           brief_snapshot, broad_area_label, private_location_snapshot,
           schedule_snapshot, questions_deadline_at, quotes_close_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8::jsonb, $9, $10)
         RETURNING *`,
        [
          actor.id,
          serviceId,
          serviceVersion,
          JSON.stringify(snapshot),
          JSON.stringify(input.brief),
          input.broadAreaLabel,
          JSON.stringify(input.privateLocation),
          JSON.stringify(input.schedule),
          input.questionsDeadlineAt,
          input.quotesCloseAt,
        ]
      );
      await appendEvent(client, {
        request: inserted.rows[0],
        eventType: 'request.created',
        actor,
        payload: { serviceId, serviceVersion },
      });
      return { status: 201, body: { quoteRequest: requestProjection(inserted.rows[0], 'customer') } };
    },
  });
}

async function cancelRequest({ actor, key, requestId, body }) {
  assertUuid(requestId, 'quote_request_id');
  await store.expireStale(db, requestId);
  return executeCommand({
    actor,
    commandType: 'cancel_request',
    key,
    identity: { requestId },
    body,
    run: async (client) => {
      assertEmptyCommandBody(body);
      const request = await store.loadRequest(client, requestId, { lock: true });
      if (!request || request.customer_id !== actor.id) {
        fail('quote_request_not_found', 'Quote request not found', 404);
      }
      if (request.status === 'cancelled') {
        return { status: 200, body: { quoteRequest: requestProjection(request, 'customer') } };
      }
      if (!['open', 'receiving'].includes(request.status)) {
        fail('quote_request_not_cancellable', 'Quote request can no longer be cancelled', 409, undefined, {
          status: request.status,
        });
      }
      const lostQuotes = await client.query(
        `UPDATE grounded_quotes
            SET status = 'lost', lost_at = NOW(), updated_at = NOW()
          WHERE quote_request_id = $1 AND status IN ('draft', 'submitted')
          RETURNING id, current_version, status`,
        [requestId]
      );
      const updated = await client.query(
        `UPDATE grounded_quote_requests
            SET status = 'cancelled', cancelled_at = NOW(),
                request_version = request_version + 1, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [requestId]
      );
      await appendEvent(client, {
        request: updated.rows[0],
        eventType: 'request.cancelled',
        actor,
      });
      for (const lostQuote of lostQuotes.rows) {
        await appendEvent(client, {
          request: updated.rows[0],
          quote: lostQuote,
          eventType: 'quote.lost',
          actor,
        });
      }
      return { status: 200, body: { quoteRequest: requestProjection(updated.rows[0], 'customer') } };
    },
  });
}

async function createQuote({ actor, key, requestId, body }) {
  assertUuid(requestId, 'quote_request_id');
  await store.expireStale(db, requestId);
  const wrapper = validateQuoteCommandWrapper(body);
  const submit = wrapper.submit === true;
  const quoteBody = wrapper.quote || {};
  return executeCommand({
    actor,
    commandType: 'create_quote',
    key,
    identity: { requestId },
    body,
    run: async (client) => {
      const request = await requireActiveRequest(client, requestId);
      if (!(await store.isEligibleWorker(client, request, actor.id))) {
        fail('quote_worker_not_eligible', 'Worker is not eligible for this service version', 403);
      }
      const duplicate = await client.query(
        'SELECT id FROM grounded_quotes WHERE quote_request_id = $1 AND worker_id = $2',
        [requestId, actor.id]
      );
      if (duplicate.rows.length) {
        fail('quote_already_exists', 'Worker already has a quote for this request', 409, undefined, {
          quoteId: duplicate.rows[0].id,
        });
      }
      const input = normalizeQuoteInput(quoteBody, { requireComplete: submit });
      const prepared = preparedQuoteInput(input);
      if (submit) assertCompleteQuote(prepared, request);
      const created = await client.query(
        `INSERT INTO grounded_quotes (
           quote_request_id, worker_id, status, current_version, submitted_at
         ) VALUES ($1, $2, $3::varchar(20), 1, CASE WHEN $4::boolean THEN NOW() ELSE NULL END)
         RETURNING id`,
        [requestId, actor.id, submit ? 'submitted' : 'draft', submit]
      );
      await insertQuoteVersion(client, created.rows[0].id, 1, prepared, submit ? 'submitted' : 'draft');
      let eventRequest = request;
      if (submit && request.status === 'open') {
        const updatedRequest = await client.query(
          `UPDATE grounded_quote_requests
              SET status = 'receiving', request_version = request_version + 1, updated_at = NOW()
            WHERE id = $1 RETURNING *`,
          [requestId]
        );
        eventRequest = updatedRequest.rows[0];
      } else if (submit) {
        const updatedRequest = await client.query(
          `UPDATE grounded_quote_requests
              SET request_version = request_version + 1, updated_at = NOW()
            WHERE id = $1 RETURNING *`,
          [requestId]
        );
        eventRequest = updatedRequest.rows[0];
      }
      const quote = await store.loadQuote(client, created.rows[0].id);
      await appendEvent(client, {
        request: eventRequest,
        quote,
        eventType: submit ? 'quote.submitted' : 'quote.drafted',
        actor,
      });
      return { status: 201, body: { quote: quoteProjection(quote) } };
    },
  });
}

async function lockOwnedQuote(client, actor, quoteId, { activeRequest = false } = {}) {
  const requestId = await store.findQuoteRequestId(client, quoteId);
  if (!requestId) fail('quote_not_found', 'Quote not found', 404);
  const request = activeRequest
    ? await requireActiveRequest(client, requestId)
    : await store.loadRequest(client, requestId, { lock: true });
  const quote = await store.loadQuote(client, quoteId, { lock: true });
  if (!quote || quote.worker_id !== actor.id) fail('quote_not_found', 'Quote not found', 404);
  return { request, quote };
}

async function editQuote({ actor, key, quoteId, body }) {
  assertUuid(quoteId, 'quote_id');
  await store.expireStale();
  const wrapper = validateQuoteCommandWrapper(body);
  return executeCommand({
    actor,
    commandType: 'edit_quote',
    key,
    identity: { quoteId },
    body,
    run: async (client) => {
      const { request, quote } = await lockOwnedQuote(client, actor, quoteId, { activeRequest: true });
      if (!['draft', 'submitted'].includes(quote.status)) {
        fail('quote_not_editable', 'Quote can no longer be edited', 409, undefined, { status: quote.status });
      }
      if (!(await store.isEligibleWorker(client, request, actor.id))) {
        fail('quote_worker_not_eligible', 'Worker is no longer eligible for this service version', 403);
      }
      const patch = normalizeQuoteInput(wrapper.quote || {}, { requireComplete: false });
      const merged = mergeQuoteInput(quoteInputFromRow(quote), patch);
      const submit = quote.status === 'submitted' || wrapper.submit === true;
      const transitionedToSubmitted = quote.status === 'draft' && submit;
      if (submit) assertCompleteQuote(merged, request);
      const nextVersion = Number(quote.current_version) + 1;
      await insertQuoteVersion(client, quoteId, nextVersion, merged, submit ? 'submitted' : 'draft');
      await client.query(
        `UPDATE grounded_quotes
            SET current_version = $2,
                status = $3::varchar(20),
                submitted_at = CASE WHEN $3::varchar(20) = 'submitted' THEN COALESCE(submitted_at, NOW()) ELSE NULL END,
                updated_at = NOW()
          WHERE id = $1`,
        [quoteId, nextVersion, submit ? 'submitted' : 'draft']
      );
      let eventRequest = request;
      if (submit) {
        const updatedRequest = await client.query(
          `UPDATE grounded_quote_requests
              SET status = CASE WHEN status = 'open' THEN 'receiving' ELSE status END,
                  request_version = request_version + 1,
                  updated_at = NOW()
            WHERE id = $1 RETURNING *`,
          [request.id]
        );
        eventRequest = updatedRequest.rows[0];
      }
      const updated = await store.loadQuote(client, quoteId);
      await appendEvent(client, {
        request: eventRequest,
        quote: updated,
        eventType: transitionedToSubmitted ? 'quote.submitted' : 'quote.edited',
        actor,
      });
      return { status: 200, body: { quote: quoteProjection(updated) } };
    },
  });
}

async function submitQuote({ actor, key, quoteId, body }) {
  assertUuid(quoteId, 'quote_id');
  await store.expireStale();
  return executeCommand({
    actor,
    commandType: 'submit_quote',
    key,
    identity: { quoteId },
    body,
    run: async (client) => {
      assertEmptyCommandBody(body);
      const { request, quote } = await lockOwnedQuote(client, actor, quoteId, { activeRequest: true });
      if (quote.status === 'submitted') {
        return { status: 200, body: { quote: quoteProjection(quote) } };
      }
      if (quote.status !== 'draft') {
        fail('quote_not_submittable', 'Quote can no longer be submitted', 409, undefined, { status: quote.status });
      }
      if (!(await store.isEligibleWorker(client, request, actor.id))) {
        fail('quote_worker_not_eligible', 'Worker is no longer eligible for this service version', 403);
      }
      const current = quoteInputFromRow(quote);
      assertCompleteQuote(current, request);
      const nextVersion = Number(quote.current_version) + 1;
      await insertQuoteVersion(client, quoteId, nextVersion, current, 'submitted');
      await client.query(
        `UPDATE grounded_quotes
            SET current_version = $2, status = 'submitted', submitted_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [quoteId, nextVersion]
      );
      const updatedRequest = await client.query(
        `UPDATE grounded_quote_requests
            SET status = CASE WHEN status = 'open' THEN 'receiving' ELSE status END,
                request_version = request_version + 1,
                updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [request.id]
      );
      const updated = await store.loadQuote(client, quoteId);
      await appendEvent(client, {
        request: updatedRequest.rows[0],
        quote: updated,
        eventType: 'quote.submitted',
        actor,
      });
      return { status: 200, body: { quote: quoteProjection(updated) } };
    },
  });
}

async function withdrawQuote({ actor, key, quoteId, body }) {
  assertUuid(quoteId, 'quote_id');
  await store.expireStale();
  return executeCommand({
    actor,
    commandType: 'withdraw_quote',
    key,
    identity: { quoteId },
    body,
    run: async (client) => {
      assertEmptyCommandBody(body);
      const { request, quote } = await lockOwnedQuote(client, actor, quoteId);
      if (quote.status === 'withdrawn') {
        return { status: 200, body: { quote: quoteProjection(quote) } };
      }
      if (!['draft', 'submitted'].includes(quote.status)) {
        fail('quote_not_withdrawable', 'Quote can no longer be withdrawn', 409, undefined, { status: quote.status });
      }
      await client.query(
        `UPDATE grounded_quotes
            SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [quoteId]
      );
      let eventRequest = request;
      if (quote.status === 'submitted') {
        const updatedRequest = await client.query(
          `UPDATE grounded_quote_requests
              SET request_version = request_version + 1, updated_at = NOW()
            WHERE id = $1 RETURNING *`,
          [request.id]
        );
        eventRequest = updatedRequest.rows[0];
      }
      const updated = await store.loadQuote(client, quoteId);
      await appendEvent(client, {
        request: eventRequest,
        quote: updated,
        eventType: 'quote.withdrawn',
        actor,
      });
      return { status: 200, body: { quote: quoteProjection(updated) } };
    },
  });
}

async function declineQuote({ actor, key, quoteId, body }) {
  assertUuid(quoteId, 'quote_id');
  await store.expireStale();
  return executeCommand({
    actor,
    commandType: 'decline_quote',
    key,
    identity: { quoteId },
    body,
    run: async (client) => {
      assertEmptyCommandBody(body);
      const requestId = await store.findQuoteRequestId(client, quoteId);
      if (!requestId) fail('quote_not_found', 'Quote not found', 404);
      const request = await store.loadRequest(client, requestId, { lock: true });
      if (!request || request.customer_id !== actor.id) fail('quote_not_found', 'Quote not found', 404);
      const quote = await store.loadQuote(client, quoteId, { lock: true });
      if (!quote || quote.status === 'draft') fail('quote_not_found', 'Quote not found', 404);
      if (quote.status === 'declined') {
        return { status: 200, body: { quote: quoteProjection(quote, { includeWorkerEvidence: true }) } };
      }
      if (quote.status !== 'submitted' || !['open', 'receiving'].includes(request.status)) {
        fail('quote_not_declineable', 'Quote can no longer be declined', 409, undefined, {
          quoteStatus: quote.status,
          requestStatus: request.status,
        });
      }
      await client.query(
        `UPDATE grounded_quotes SET status = 'declined', declined_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [quoteId]
      );
      const updatedRequest = await client.query(
        `UPDATE grounded_quote_requests
            SET request_version = request_version + 1, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [request.id]
      );
      const updated = await store.loadQuote(client, quoteId);
      await appendEvent(client, {
        request: updatedRequest.rows[0],
        quote: updated,
        eventType: 'quote.declined',
        actor,
      });
      return { status: 200, body: { quote: quoteProjection(updated, { includeWorkerEvidence: true }) } };
    },
  });
}

async function acceptQuote({ actor, key, quoteId, body }) {
  assertUuid(quoteId, 'quote_id');
  return executeCommand({
    actor,
    commandType: 'accept_quote',
    key,
    identity: { quoteId },
    body,
    run: async (client) => {
      assertEmptyCommandBody(body);
      // This runs only for a new command receipt. Exact successful replays can
      // still return their durable response if Operations later closes the
      // gate; a new acceptance resolves policy before any domain mutation.
      const fulfilmentPolicy = requireApprovedFulfilmentPolicy();
      const requestId = await store.findQuoteRequestId(client, quoteId);
      if (!requestId) fail('quote_not_found', 'Quote not found', 404);
      const request = await store.loadRequest(client, requestId, { lock: true });
      if (!request || request.customer_id !== actor.id) fail('quote_not_found', 'Quote not found', 404);
      if (request.status === 'selected') {
        if (request.selected_quote_id === quoteId && request.booking_id) {
          const accepted = await store.loadQuote(client, quoteId);
          return {
            status: 200,
            body: {
              quote: quoteProjection(accepted, { includeWorkerEvidence: true }),
              project: { id: request.booking_id, status: 'accepted', operationalPhase: 'scheduled' },
            },
          };
        }
        fail('quote_acceptance_lost', 'Another quote has already been selected', 409);
      }
      if (!['open', 'receiving'].includes(request.status) || new Date(request.quotes_close_at) <= new Date()) {
        fail('quote_request_closed', 'Quote request is no longer open', 409, undefined, { status: request.status });
      }
      const quote = await store.loadQuote(client, quoteId, { lock: true });
      if (!quote || quote.quote_request_id !== requestId || quote.status === 'draft') {
        fail('quote_not_found', 'Quote not found', 404);
      }
      if (quote.status !== 'submitted') {
        fail('quote_not_acceptable', 'Quote is not available for acceptance', 409, undefined, { status: quote.status });
      }
      if (!(await store.isEligibleWorker(client, request, quote.worker_id))) {
        fail(
          'quote_worker_no_longer_eligible',
          'This worker is no longer eligible for the selected service version',
          409,
          'Refresh the available quotes before selecting another offer.'
        );
      }
      const now = new Date();
      if (!quote.valid_until || new Date(quote.valid_until) <= now) {
        fail('quote_expired', 'Quote has expired', 409);
      }
      const complete = quoteInputFromRow(quote);
      assertCompleteQuote(complete, request, now);

      const scopeSnapshot = {
        schemaVersion: 1,
        quoteVersion: Number(quote.current_version),
        scope: quote.scope,
        description: quote.scope,
        items: quote.deliverables.map((label) => ({ label })),
        deliverables: quote.deliverables,
        exclusions: quote.exclusions,
        assumptions: quote.assumptions,
        estimatedMinutes: Number(quote.duration_minutes),
        customerBrief: request.brief_snapshot,
      };
      const commercialSnapshot = {
        schemaVersion: 1,
        pricingMode: 'remote_quote',
        labourAmount: String(quote.labour_amount),
        materialsAmount: String(quote.materials_amount),
        customerTotalAmount: String(quote.customer_total_amount),
        currency: quote.currency,
        platformFee: quote.platform_fee_snapshot,
        workerNet: quote.worker_net_snapshot,
      };
      const scheduleSnapshot = {
        startsAt: new Date(quote.proposed_start_at).toISOString(),
        endsAt: new Date(quote.proposed_end_at).toISOString(),
        durationMinutes: Number(quote.duration_minutes),
        timezone: 'Africa/Johannesburg',
      };
      const location = request.private_location_snapshot;
      const bookingResult = await client.query(
        `INSERT INTO bookings (
           customer_id, labourer_id, status, operational_phase,
           skill_needed, address, location_lat, location_lng,
           scheduled_at, hours_est, total_amount, notes, scope_items,
           accepted_quote_id, accepted_quote_version
         ) VALUES (
           $1, $2, 'accepted', 'scheduled', $3, $4, $5, $6,
           $7, $8, $9, NULL, $10::jsonb, $11, $12
         ) RETURNING *`,
        [
          actor.id,
          quote.worker_id,
          request.service_snapshot.label,
          location.address,
          location.latitude,
          location.longitude,
          quote.proposed_start_at,
          Number(quote.duration_minutes) / 60,
          quote.customer_total_amount,
          JSON.stringify(quote.deliverables.map((label) => ({ label }))),
          quoteId,
          quote.current_version,
        ]
      );
      const booking = bookingResult.rows[0];
      await client.query(
        `INSERT INTO grounded_booking_agreement_snapshots (
           booking_id, quote_request_id, quote_id, quote_version,
           service_id, service_version, service_snapshot,
           scope_snapshot, commercial_snapshot, schedule_snapshot, accepted_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11)`,
        [
          booking.id,
          request.id,
          quoteId,
          quote.current_version,
          request.service_id,
          request.service_version,
          JSON.stringify(request.service_snapshot),
          JSON.stringify(scopeSnapshot),
          JSON.stringify(commercialSnapshot),
          JSON.stringify(scheduleSnapshot),
          actor.id,
        ]
      );
      await bootstrapCanonicalFulfilment(client, {
        bookingId: booking.id,
        policy: fulfilmentPolicy,
        proposedBy: quote.worker_id,
        proposedByRole: 'labourer',
        customerId: actor.id,
        workerId: quote.worker_id,
        scopeSnapshot: {
          ...scopeSnapshot,
          agreementSource: 'accepted_quote',
          agreementBookingId: booking.id,
          quoteId,
        },
        scopeItems: scopeSnapshot.items,
      });
      await client.query(
        `UPDATE grounded_quotes
            SET status = 'accepted', accepted_at = NOW(), updated_at = NOW()
          WHERE id = $1`,
        [quoteId]
      );
      const lostQuotes = await client.query(
        `UPDATE grounded_quotes
            SET status = 'lost', lost_at = NOW(), updated_at = NOW()
          WHERE quote_request_id = $1 AND id <> $2 AND status IN ('draft', 'submitted')
          RETURNING id, current_version, status`,
        [request.id, quoteId]
      );
      const selectedRequest = await client.query(
        `UPDATE grounded_quote_requests
            SET status = 'selected', selected_quote_id = $2,
                selected_at = NOW(), request_version = request_version + 1, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [request.id, quoteId]
      );
      await client.query(
        `INSERT INTO grounded_project_events (
           booking_id, aggregate_sequence, event_type, actor_user_id, actor_role,
           booking_status, operational_phase, payload
         ) VALUES ($1, 0, 'project.created', $2, 'customer', 'accepted', 'scheduled', $3::jsonb)
         ON CONFLICT (booking_id, aggregate_sequence) DO NOTHING`,
        [booking.id, actor.id, JSON.stringify({ projectId: booking.id, source: 'accepted_quote', quoteId })]
      );
      const accepted = await store.loadQuote(client, quoteId);
      await appendEvent(client, {
        request: selectedRequest.rows[0],
        quote: accepted,
        eventType: 'quote.accepted',
        actor,
        payload: { bookingId: booking.id },
      });
      for (const lostQuote of lostQuotes.rows) {
        await appendEvent(client, {
          request: selectedRequest.rows[0],
          quote: lostQuote,
          eventType: 'quote.lost',
          actor,
        });
      }
      await appendEvent(client, {
        request: selectedRequest.rows[0],
        quote: accepted,
        eventType: 'request.selected',
        actor,
        payload: { bookingId: booking.id, selectedQuoteId: quoteId },
      });
      return {
        status: 200,
        body: {
          quote: quoteProjection(accepted, { includeWorkerEvidence: true }),
          project: {
            id: booking.id,
            status: booking.status,
            operationalPhase: booking.operational_phase,
            agreement: {
              quoteId,
              quoteVersion: Number(quote.current_version),
              serviceId: request.service_id,
              serviceVersion: Number(request.service_version),
              commercial: commercialSnapshot,
            },
          },
        },
      };
    },
  });
}

module.exports = {
  executeCommand,
  createRequest,
  cancelRequest,
  createQuote,
  editQuote,
  submitQuote,
  withdrawQuote,
  declineQuote,
  acceptQuote,
};
