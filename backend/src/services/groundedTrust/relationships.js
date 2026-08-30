const { executeCommand, assertRevision } = require('./command');
const { appendTrustEvent } = require('./events');
const {
  SCHEMA,
  fail,
  boundedJsonObject,
  boundedText,
  futureIso,
} = require('./contracts');
const {
  getRelationshipBooking,
  relationshipEligible,
  pairBlocked,
  getRebookDraft,
} = require('./store');
const {
  serializeFavourite,
  serializeBlock,
  serializeRebookDraft,
} = require('./privacy');
const { canonicalScopeSnapshot } = require('../groundedFulfilment/scope');

function assertCustomer(actor) {
  if (actor.role !== 'customer') {
    fail('relationship_customer_only', 'Only a customer can use this relationship action', 403);
  }
}

function assertParticipantCounterpart(booking, actor, counterpartId) {
  const counterpart = actor.id === booking.customer_id
    ? booking.labourer_id
    : booking.customer_id;
  if (counterpart !== counterpartId) {
    fail(
      'relationship_counterpart_invalid',
      'Relationship counterpart is invalid',
      403,
      'The counterpart must be the other participant in the source Project.'
    );
  }
}

function assertEligible(eligible) {
  if (!eligible) {
    fail(
      'relationship_not_eligible',
      'This relationship action is not available',
      409,
      'Confirmed completion, a reconciled paid payment, and no open issue or block are required.'
    );
  }
}

async function loadBookingOrFail(client, bookingId, actor) {
  const booking = await getRelationshipBooking(client, bookingId, actor, { forUpdate: true });
  if (!booking) {
    fail(
      'relationship_project_not_found',
      'Project not found',
      404,
      'No participant-visible source Project exists for this identifier.'
    );
  }
  return booking;
}

async function favouriteResponse(client, favouriteId) {
  const result = await client.query(
    `SELECT f.*, u.name AS worker_name, u.avatar_url AS worker_avatar
       FROM grounded_favourites f
       JOIN users u ON u.id = f.worker_id
      WHERE f.id = $1`,
    [favouriteId]
  );
  return serializeFavourite(result.rows[0]);
}

async function createFavourite(context) {
  assertCustomer(context.actor);
  return executeCommand({ ...context, commandType: 'create_favourite' }, async (client) => {
    const booking = await loadBookingOrFail(client, context.body.sourceBookingId, context.actor);
    if (booking.customer_id !== context.actor.id || booking.labourer_id !== context.body.workerId) {
      fail(
        'favourite_worker_invalid',
        'Worker is not eligible for this favourite',
        403,
        'The worker must be the assigned worker on the source Project.'
      );
    }
    assertEligible(await relationshipEligible(client, booking));

    const existingResult = await client.query(
      `SELECT * FROM grounded_favourites
        WHERE customer_id = $1 AND worker_id = $2
        FOR UPDATE`,
      [context.actor.id, context.body.workerId]
    );
    let row = existingResult.rows[0];
    let applied = false;
    if (!row) {
      const inserted = await client.query(
        `INSERT INTO grounded_favourites (
           customer_id, worker_id, source_booking_id
         ) VALUES ($1, $2, $3)
         RETURNING *`,
        [context.actor.id, context.body.workerId, booking.id]
      );
      row = inserted.rows[0];
      applied = true;
    } else if (row.status !== 'active') {
      const restored = await client.query(
        `UPDATE grounded_favourites
            SET status = 'active', source_booking_id = $2, removed_at = NULL,
                revision = revision + 1, updated_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [row.id, booking.id]
      );
      row = restored.rows[0];
      applied = true;
    }

    if (applied) {
      await appendTrustEvent(client, {
        aggregateType: 'favourite',
        aggregateId: row.id,
        sequence: row.revision,
        eventType: 'relationship.favourite_added',
        actor: context.actor,
        payload: {
          customerId: context.actor.id,
          workerId: row.worker_id,
          sourceProjectId: booking.id,
          status: row.status,
        },
      });
    }
    return {
      status: applied ? 201 : 200,
      resourceId: row.id,
      body: { favourite: await favouriteResponse(client, row.id), transition: { applied } },
    };
  });
}

async function removeFavourite(context) {
  assertCustomer(context.actor);
  return executeCommand({ ...context, commandType: 'remove_favourite' }, async (client) => {
    const existing = await client.query(
      `SELECT * FROM grounded_favourites
        WHERE customer_id = $1 AND worker_id = $2
        FOR UPDATE`,
      [context.actor.id, context.resourceId]
    );
    const row = existing.rows[0];
    if (!row || row.status !== 'active') {
      return {
        status: 200,
        resourceId: row?.id,
        body: {
          result: {
            workerReference: context.resourceId,
            removed: false,
            status: row?.status || 'not_found',
          },
        },
      };
    }
    const updatedResult = await client.query(
      `UPDATE grounded_favourites
          SET status = 'removed', removed_at = NOW(), updated_at = NOW(),
              revision = revision + 1
        WHERE id = $1
        RETURNING *`,
      [row.id]
    );
    const updated = updatedResult.rows[0];
    await appendTrustEvent(client, {
      aggregateType: 'favourite',
      aggregateId: updated.id,
      sequence: updated.revision,
      eventType: 'relationship.favourite_removed',
      actor: context.actor,
      payload: {
        customerId: context.actor.id,
        workerId: updated.worker_id,
        status: updated.status,
      },
    });
    return {
      status: 200,
      resourceId: updated.id,
      body: {
        result: {
          workerReference: updated.worker_id,
          removed: true,
          status: updated.status,
          revision: Number(updated.revision),
        },
      },
    };
  });
}

async function blockRelationship(context) {
  return executeCommand({ ...context, commandType: 'block_relationship' }, async (client) => {
    const booking = await loadBookingOrFail(client, context.body.sourceBookingId, context.actor);
    assertParticipantCounterpart(booking, context.actor, context.body.blockedUserId);

    const existing = await client.query(
      `SELECT * FROM grounded_relationship_blocks
        WHERE blocker_user_id = $1 AND blocked_user_id = $2
        FOR UPDATE`,
      [context.actor.id, context.body.blockedUserId]
    );
    if (existing.rowCount === 1) {
      return {
        status: 200,
        resourceId: existing.rows[0].id,
        body: { block: serializeBlock(existing.rows[0]), transition: { applied: false } },
      };
    }

    const inserted = await client.query(
      `INSERT INTO grounded_relationship_blocks (
         blocker_user_id, blocked_user_id, source_booking_id, reason_code
       ) VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [context.actor.id, context.body.blockedUserId, booking.id, context.body.reasonCode]
    );
    const block = inserted.rows[0];

    const customerId = booking.customer_id;
    const workerId = booking.labourer_id;
    const favouriteResult = await client.query(
      `UPDATE grounded_favourites
          SET status = 'blocked', removed_at = NOW(), updated_at = NOW(),
              revision = revision + 1
        WHERE customer_id = $1 AND worker_id = $2 AND status = 'active'
        RETURNING id, revision, worker_id`,
      [customerId, workerId]
    );
    const blockedDrafts = await client.query(
      `UPDATE grounded_rebook_drafts
          SET status = 'blocked', revision = revision + 1, updated_at = NOW()
        WHERE customer_id = $1 AND preferred_worker_id = $2 AND status = 'draft'
        RETURNING id, revision`,
      [customerId, workerId]
    );
    const affectedSeries = await client.query(
      `UPDATE grounded_recurring_series
          SET status = 'blocked', blocked_at = NOW(), updated_at = NOW(),
              revision = revision + 1
        WHERE customer_id = $1 AND worker_id = $2
          AND status NOT IN ('cancelled', 'blocked')
        RETURNING id, revision`,
      [customerId, workerId]
    );
    if (affectedSeries.rowCount > 0) {
      await client.query(
        `UPDATE grounded_recurring_occurrences
            SET status = 'held', updated_at = NOW()
          WHERE series_id = ANY($1::uuid[]) AND status IN ('proposed', 'planned', 'change_pending')`,
        [affectedSeries.rows.map((row) => row.id)]
      );
      for (const series of affectedSeries.rows) {
        await appendTrustEvent(client, {
          aggregateType: 'recurring_series',
          aggregateId: series.id,
          sequence: series.revision,
          eventType: 'recurring_series.blocked',
          actor: context.actor,
          payload: { status: 'blocked', relationshipBlockId: block.id },
        });
      }
    }

    for (const favourite of favouriteResult.rows) {
      await appendTrustEvent(client, {
        aggregateType: 'favourite',
        aggregateId: favourite.id,
        sequence: favourite.revision,
        eventType: 'relationship.favourite_blocked',
        actor: context.actor,
        payload: {
          customerId,
          workerId: favourite.worker_id,
          status: 'blocked',
          relationshipBlockId: block.id,
        },
      });
    }
    for (const draft of blockedDrafts.rows) {
      await appendTrustEvent(client, {
        aggregateType: 'rebook_draft',
        aggregateId: draft.id,
        sequence: draft.revision,
        eventType: 'rebook.draft_blocked',
        actor: context.actor,
        payload: {
          status: 'blocked',
          relationshipBlockId: block.id,
          bookingCreated: false,
        },
      });
    }

    await appendTrustEvent(client, {
      aggregateType: 'relationship_block',
      aggregateId: block.id,
      sequence: block.revision,
      eventType: 'relationship.blocked',
      actor: context.actor,
      payload: {
        blockerUserId: context.actor.id,
        blockedUserId: block.blocked_user_id,
        sourceProjectId: booking.id,
        reasonCode: block.reason_code,
        favouriteRemoved: favouriteResult.rowCount > 0,
        affectedSeriesCount: affectedSeries.rowCount,
      },
    });
    return {
      status: 201,
      resourceId: block.id,
      body: {
        block: serializeBlock(block),
        transition: {
          applied: true,
          favouriteRemoved: favouriteResult.rowCount > 0,
          affectedSeriesCount: affectedSeries.rowCount,
        },
      },
    };
  });
}

function sourceScope(booking) {
  const source = booking.current_scope_snapshot
    ? canonicalScopeSnapshot(booking.current_scope_snapshot, booking.current_scope_source)
    : booking.agreement_scope_snapshot
    ? canonicalScopeSnapshot(booking.agreement_scope_snapshot, 'accepted_agreement')
    : canonicalScopeSnapshot({
    items: Array.isArray(booking.scope_items) ? booking.scope_items : [],
    }, 'accepted_agreement');
  return boundedJsonObject(source, 'sourceScope');
}

async function rebookResponse(client, draftId, actor) {
  const row = await getRebookDraft(client, draftId, actor.id);
  return serializeRebookDraft(row);
}

async function createRebookDraft(context) {
  assertCustomer(context.actor);
  return executeCommand({ ...context, commandType: 'create_rebook_draft' }, async (client) => {
    const booking = await loadBookingOrFail(client, context.body.sourceBookingId, context.actor);
    if (booking.customer_id !== context.actor.id) {
      fail('rebook_customer_only', 'Only the source customer can rebook', 403);
    }
    assertEligible(await relationshipEligible(client, booking));
    const scope = sourceScope(booking);
    const inserted = await client.query(
      `INSERT INTO grounded_rebook_drafts (
         customer_id, preferred_worker_id, source_booking_id,
         source_service_label, source_scope_snapshot, editable_scope
       ) VALUES ($1, $2, $3, $4, $5::jsonb, $5::jsonb)
       RETURNING *`,
      [
        context.actor.id,
        booking.labourer_id,
        booking.id,
        booking.skill_needed,
        JSON.stringify(scope),
      ]
    );
    const draft = inserted.rows[0];
    await appendTrustEvent(client, {
      aggregateType: 'rebook_draft',
      aggregateId: draft.id,
      sequence: draft.revision,
      eventType: 'rebook.draft_created',
      actor: context.actor,
      payload: {
        sourceProjectId: booking.id,
        preferredWorkerId: booking.labourer_id,
        status: 'draft',
        bookingCreated: false,
      },
    });
    return {
      status: 201,
      resourceId: draft.id,
      body: { rebookDraft: await rebookResponse(client, draft.id, context.actor) },
    };
  });
}

async function updateRebookDraft(context) {
  assertCustomer(context.actor);
  return executeCommand({ ...context, commandType: 'update_rebook_draft' }, async (client) => {
    const draft = await getRebookDraft(client, context.resourceId, context.actor.id, { forUpdate: true });
    if (!draft) {
      fail('rebook_draft_not_found', 'Rebook draft not found', 404);
    }
    assertRevision(draft, context.expectedRevision, 'Rebook draft');
    if (draft.status !== 'draft') {
      fail(
        'rebook_draft_not_editable',
        'Rebook draft is not editable',
        409,
        `The draft is '${draft.status}'.`
      );
    }
    if (await pairBlocked(client, draft.customer_id, draft.preferred_worker_id)) {
      fail(
        'relationship_block_active',
        'This relationship is blocked',
        409,
        'The draft cannot be edited or submitted while either participant has an active block.'
      );
    }

    const hasScope = Object.prototype.hasOwnProperty.call(context.body, 'editableScope');
    const hasArea = Object.prototype.hasOwnProperty.call(context.body, 'broadAreaLabel');
    const hasSchedule = Object.prototype.hasOwnProperty.call(context.body, 'requestedStartsAt');
    if (!hasScope && !hasArea && !hasSchedule) {
      fail('rebook_update_empty', 'No draft changes were supplied', 422);
    }
    const scope = hasScope ? boundedJsonObject(context.body.editableScope, 'editableScope') : null;
    const area = hasArea && context.body.broadAreaLabel !== null
      ? boundedText(context.body.broadAreaLabel, 'broadAreaLabel', { min: 2, max: 160 })
      : null;
    const startsAt = hasSchedule && context.body.requestedStartsAt !== null
      ? futureIso(context.body.requestedStartsAt, 'requestedStartsAt')
      : null;
    const updatedResult = await client.query(
      `UPDATE grounded_rebook_drafts
          SET editable_scope = CASE WHEN $2 THEN $3::jsonb ELSE editable_scope END,
              broad_area_label = CASE WHEN $4 THEN $5 ELSE broad_area_label END,
              requested_starts_at = CASE WHEN $6 THEN $7 ELSE requested_starts_at END,
              revision = revision + 1,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [
        draft.id,
        hasScope,
        hasScope ? JSON.stringify(scope) : null,
        hasArea,
        area,
        hasSchedule,
        startsAt,
      ]
    );
    const updated = updatedResult.rows[0];
    await appendTrustEvent(client, {
      aggregateType: 'rebook_draft',
      aggregateId: updated.id,
      sequence: updated.revision,
      eventType: 'rebook.draft_updated',
      actor: context.actor,
      payload: {
        status: updated.status,
        changedFields: [
          ...(hasScope ? ['editableScope'] : []),
          ...(hasArea ? ['broadAreaLabel'] : []),
          ...(hasSchedule ? ['requestedStartsAt'] : []),
        ],
        bookingCreated: false,
      },
    });
    return {
      status: 200,
      resourceId: updated.id,
      body: { rebookDraft: await rebookResponse(client, updated.id, context.actor) },
    };
  });
}

async function getRelationshipEligibility(queryable, bookingId, actor) {
  const booking = await getRelationshipBooking(queryable, bookingId, actor);
  if (!booking) {
    fail(
      'relationship_project_not_found',
      'Project not found',
      404,
      'No participant-visible source Project exists for this identifier.'
    );
  }
  const eligible = await relationshipEligible(queryable, booking);
  const recurrenceConfigured = eligible
    && Boolean(booking.agreement_service_id)
    && booking.recurrence_eligible === true
    && Boolean(booking.cancellation_policy_version);
  return {
    schema: SCHEMA,
    projectReference: booking.id,
    relationshipEligible: eligible,
    reasonCode: eligible ? null : 'requirements_not_met',
    policy: {
      failClosed: true,
      requiresConfirmedCompletion: true,
      requiresReconciledPaidPayment: true,
      requiresNoOpenIssueOrBlock: true,
    },
    actions: {
      favourite: actor.role === 'customer' && eligible,
      rebookDraft: actor.role === 'customer' && eligible,
      createRecurringSeries: actor.role === 'customer' && recurrenceConfigured,
      block: true,
    },
    recurrence: {
      configuredForService: recurrenceConfigured,
      automaticBookingCreation: false,
    },
  };
}

module.exports = {
  createFavourite,
  removeFavourite,
  blockRelationship,
  createRebookDraft,
  updateRebookDraft,
  assertEligible,
  getRelationshipEligibility,
};
