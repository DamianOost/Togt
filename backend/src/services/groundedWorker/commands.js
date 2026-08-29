const { SCHEMA, fail } = require('./contracts');
const { executeCommand, assertRevision } = require('./command');
const {
  loadWorkerProfile,
  listWorkerOfferings,
  loadWorkerOffering,
  loadCatalogueService,
  listAcknowledgements,
  loadAcknowledgement,
  bumpActivationState,
} = require('./store');
const {
  identityEvidence,
  requiredCredentials,
  pricingEvidence,
  offeringEligibility,
  serializeOffering,
  serializePublicProfile,
  serializeActivation,
} = require('./projections');

async function requireWorker(queryable, workerId, options) {
  const row = await loadWorkerProfile(queryable, workerId, options);
  if (!row) fail('worker_profile_not_found', 'Worker profile not found', 404);
  return row;
}

async function readActivationBundle(queryable, workerId) {
  const worker = await requireWorker(queryable, workerId);
  const offerings = await listWorkerOfferings(queryable, workerId);
  const acknowledgements = await listAcknowledgements(queryable, workerId);
  return serializeActivation(worker, offerings, acknowledgements);
}

async function savePublicProfile(context) {
  return executeCommand(context, async (client) => {
    const worker = await requireWorker(client, context.actor.id, { lock: true });
    assertRevision({ revision: worker.profile_revision || 1 }, context.expectedRevision, 'public profile');
    const existing = worker.profile_revision != null;
    let updated;
    if (existing) {
      const result = await client.query(
        `UPDATE grounded_worker_public_profiles
            SET public_display_name = $2,
                about_experience = $3,
                revision = revision + 1,
                updated_at = NOW()
          WHERE worker_id = $1
          RETURNING revision`,
        [context.actor.id, context.body.displayName, context.body.about]
      );
      updated = result.rows[0];
    } else {
      const result = await client.query(
        `INSERT INTO grounded_worker_public_profiles (
           worker_id, public_display_name, about_experience
         ) VALUES ($1, $2, $3)
         RETURNING revision`,
        [context.actor.id, context.body.displayName, context.body.about]
      );
      updated = result.rows[0];
    }
    await bumpActivationState(client, context.actor.id);
    const freshWorker = await loadWorkerProfile(client, context.actor.id);
    const offerings = await listWorkerOfferings(client, context.actor.id);
    const publicProfile = serializePublicProfile(freshWorker, offerings);
    return {
      status: 200,
      resourceId: context.actor.id,
      body: { schema: SCHEMA, publicProfile: { ...publicProfile, stateVersion: Number(updated.revision) } },
    };
  });
}

function catalogueDescription(catalogue) {
  return String(catalogue.description_en_za || '').trim();
}

async function createOffering(context) {
  return executeCommand(context, async (client) => {
    const worker = await requireWorker(client, context.actor.id, { lock: true });
    const catalogue = await loadCatalogueService(
      client,
      context.body.serviceId,
      context.body.serviceVersion,
      { lock: true }
    );
    if (!catalogue) {
      fail(
        'worker_catalogue_service_unavailable',
        'Catalogue service is unavailable',
        404,
        'Only an exact published, non-retired catalogue version can be selected.'
      );
    }
    if (context.expectedRevision !== Number(catalogue.service_version)) {
      fail(
        'worker_catalogue_revision_mismatch',
        'Catalogue service version is stale',
        412,
        'Fetch the current published catalogue service before selecting it.',
        { expectedRevision: context.expectedRevision, currentRevision: Number(catalogue.service_version) }
      );
    }
    const duplicate = await client.query(
      `SELECT id FROM grounded_worker_service_offerings
        WHERE worker_id = $1 AND service_id = $2 AND service_version = $3`,
      [context.actor.id, catalogue.service_id, catalogue.service_version]
    );
    if (duplicate.rowCount > 0) {
      fail(
        'worker_offering_already_exists',
        'Worker offering already exists',
        409,
        'Fetch and update the existing offering instead.',
        { offeringId: duplicate.rows[0].id }
      );
    }
    const callOutAmountMinor = catalogue.call_out_fee == null
      ? null
      : Math.round(Number(catalogue.call_out_fee) * 100);
    const inserted = await client.query(
      `INSERT INTO grounded_worker_service_offerings (
         worker_id, service_id, service_version, customer_facing_title,
         description, minimum_duration_minutes, call_out_amount_minor
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        context.actor.id,
        catalogue.service_id,
        catalogue.service_version,
        catalogue.label_en_za,
        catalogueDescription(catalogue),
        catalogue.minimum_duration_minutes,
        callOutAmountMinor,
      ]
    );
    await client.query(
      `INSERT INTO catalogue_worker_opt_ins (
         worker_id, service_id, service_version, status, deactivated_at
       ) VALUES ($1, $2, $3, 'inactive', NOW())
       ON CONFLICT (worker_id, service_id, service_version) DO NOTHING`,
      [context.actor.id, catalogue.service_id, catalogue.service_version]
    );
    await bumpActivationState(client, context.actor.id);
    const offering = await loadWorkerOffering(client, context.actor.id, inserted.rows[0].id);
    return {
      status: 201,
      resourceId: offering.id,
      body: { schema: SCHEMA, offering: serializeOffering(offering, worker) },
    };
  });
}

function editableFields(row) {
  const fields = row.pricing_rules?.workerEditableFields;
  return new Set(Array.isArray(fields) ? fields.filter((value) => typeof value === 'string') : []);
}

function assertPricingMutation(row, body) {
  if (body.hourlyRateMinor !== undefined) {
    if (row.pricing_mode !== 'hourly_estimated') {
      fail(
        'worker_hourly_rate_not_editable',
        'Hourly rate is not editable for this service',
        422,
        'Hourly rates are accepted only for hourly catalogue services.'
      );
    }
    const bounds = row.pricing_rules?.hourlyRateBounds;
    const minimum = Number(bounds?.minimumMinor);
    const maximum = Number(bounds?.maximumMinor);
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) || minimum < 0 || maximum < minimum) {
      fail(
        'worker_hourly_bounds_unavailable',
        'Hourly rate bounds are unavailable',
        422,
        'The catalogue must publish valid hourly rate bounds before a rate can be saved.'
      );
    }
    if (!Number.isSafeInteger(body.hourlyRateMinor)
      || body.hourlyRateMinor < minimum || body.hourlyRateMinor > maximum) {
      fail(
        'worker_hourly_rate_outside_bounds',
        'Hourly rate is outside catalogue bounds',
        422,
        'Choose a whole-cent amount within the exact published bounds.',
        { minimumMinor: minimum, maximumMinor: maximum, currency: 'ZAR' }
      );
    }
  }
  const allowed = editableFields(row);
  const unchangedMinimumDuration = body.minimumDurationMinutes !== undefined
    && Number(body.minimumDurationMinutes) === Number(row.minimum_duration_minutes);
  if (body.minimumDurationMinutes !== undefined
    && !allowed.has('minimumDurationMinutes')
    && !unchangedMinimumDuration) {
    fail(
      'worker_minimum_duration_read_only',
      'Minimum duration is catalogue controlled',
      422,
      'This catalogue version does not permit workers to edit minimum duration.'
    );
  }
  const unchangedCallOutAmount = body.callOutAmountMinor !== undefined
    && Number(body.callOutAmountMinor) === Number(row.call_out_amount_minor);
  if (body.callOutAmountMinor !== undefined
    && !allowed.has('callOutAmountMinor')
    && !unchangedCallOutAmount) {
    fail(
      'worker_call_out_read_only',
      'Call-out amount is catalogue controlled',
      422,
      'This catalogue version does not permit workers to edit the call-out amount.'
    );
  }
}

function assertCanActivate(candidate, worker) {
  const evidence = offeringEligibility(candidate, worker);
  if (!evidence.current) {
    fail('worker_service_not_current', 'Catalogue service is not current', 409, 'Choose a published, non-retired service version.');
  }
  if (!evidence.configured) {
    fail('worker_offering_incomplete', 'Offering is incomplete', 422, 'Add a title, description, and service area before activating.');
  }
  if (!evidence.pricing.ready) {
    fail('worker_pricing_incomplete', 'Pricing evidence is incomplete', 422, evidence.pricing.reason);
  }
  if (!evidence.accountReady) {
    fail('worker_account_evidence_incomplete', 'Account evidence is incomplete', 422, 'Complete the supported account verification flow before activating a service.');
  }
  if (!evidence.identityReady) {
    fail('worker_identity_evidence_incomplete', 'Identity assurance is incomplete', 422, 'This service requires authoritative identity verification.');
  }
  if (!evidence.credentialReady) {
    fail(
      'worker_credentials_unavailable',
      'Required credential evidence is unavailable',
      422,
      'This service cannot be activated until every required credential is verified in the canonical credential registry.',
      { requiredCredentialIds: evidence.credentials }
    );
  }
}

async function updateOffering(context) {
  return executeCommand(context, async (client) => {
    const worker = await requireWorker(client, context.actor.id, { lock: true });
    const current = await loadWorkerOffering(client, context.actor.id, context.resourceId, { lock: true });
    if (!current) fail('worker_offering_not_found', 'Worker offering not found', 404);
    assertRevision(current, context.expectedRevision, 'worker offering');
    if (current.is_published !== true || current.retired_at != null) {
      const deactivationOnly = Object.keys(context.body).length === 1 && context.body.active === false;
      if (!deactivationOnly) {
        fail(
          'worker_service_not_current',
          'Catalogue service is not current',
          409,
          'A retired or unpublished service may only be deactivated.'
        );
      }
    }
    assertPricingMutation(current, context.body);
    const candidate = {
      ...current,
      customer_facing_title: context.body.title ?? current.customer_facing_title,
      description: context.body.description ?? current.description,
      hourly_rate_minor: context.body.hourlyRateMinor !== undefined
        ? context.body.hourlyRateMinor : current.hourly_rate_minor,
      minimum_duration_minutes: context.body.minimumDurationMinutes !== undefined
        ? context.body.minimumDurationMinutes : current.minimum_duration_minutes,
      call_out_amount_minor: context.body.callOutAmountMinor !== undefined
        ? context.body.callOutAmountMinor : current.call_out_amount_minor,
      service_area_label: context.body.serviceAreaLabel ?? current.service_area_label,
    };
    if (context.body.active === true) assertCanActivate(candidate, worker);

    const updatedResult = await client.query(
      `UPDATE grounded_worker_service_offerings
          SET customer_facing_title = $3,
              description = $4,
              hourly_rate_minor = $5,
              minimum_duration_minutes = $6,
              call_out_amount_minor = $7,
              service_area_label = $8,
              revision = revision + 1,
              updated_at = NOW()
        WHERE worker_id = $1 AND id = $2
        RETURNING id`,
      [
        context.actor.id,
        context.resourceId,
        candidate.customer_facing_title,
        candidate.description,
        candidate.hourly_rate_minor,
        candidate.minimum_duration_minutes,
        candidate.call_out_amount_minor,
        candidate.service_area_label,
      ]
    );
    if (context.body.active !== undefined) {
      await client.query(
        `INSERT INTO catalogue_worker_opt_ins (
           worker_id, service_id, service_version, status, opted_in_at, deactivated_at
         ) VALUES (
           $1, $2, $3, $4::varchar, NOW(), CASE WHEN $4::varchar = 'inactive' THEN NOW() ELSE NULL END
         )
         ON CONFLICT (worker_id, service_id, service_version) DO UPDATE
           SET status = EXCLUDED.status,
               opted_in_at = CASE WHEN EXCLUDED.status = 'active' THEN NOW() ELSE catalogue_worker_opt_ins.opted_in_at END,
               deactivated_at = CASE WHEN EXCLUDED.status = 'inactive' THEN NOW() ELSE NULL END`,
        [
          context.actor.id,
          current.service_id,
          current.service_version,
          context.body.active ? 'active' : 'inactive',
        ]
      );
    }
    await bumpActivationState(client, context.actor.id);
    const updated = await loadWorkerOffering(client, context.actor.id, updatedResult.rows[0].id);
    return {
      status: 200,
      resourceId: updated.id,
      body: { schema: SCHEMA, offering: serializeOffering(updated, worker) },
    };
  });
}

async function acknowledgeActivationItem(context) {
  return executeCommand(context, async (client) => {
    await requireWorker(client, context.actor.id, { lock: true });
    const current = await loadAcknowledgement(
      client,
      context.actor.id,
      context.body.kind,
      { lock: true }
    );
    assertRevision({ revision: current?.revision || 1 }, context.expectedRevision, 'activation acknowledgement');
    let result;
    if (current) {
      result = await client.query(
        `UPDATE grounded_worker_activation_acknowledgements
            SET policy_version = $3, acknowledged_at = NOW(), revision = revision + 1
          WHERE worker_id = $1 AND acknowledgement_kind = $2
          RETURNING acknowledgement_kind, policy_version, acknowledged_at, revision`,
        [context.actor.id, context.body.kind, context.body.policyVersion]
      );
    } else {
      result = await client.query(
        `INSERT INTO grounded_worker_activation_acknowledgements (
           worker_id, acknowledgement_kind, policy_version
         ) VALUES ($1, $2, $3)
         RETURNING acknowledgement_kind, policy_version, acknowledged_at, revision`,
        [context.actor.id, context.body.kind, context.body.policyVersion]
      );
    }
    await client.query(
      `INSERT INTO grounded_worker_activation_ack_events (
         worker_id, acknowledgement_kind, policy_version
       ) VALUES ($1, $2, $3)`,
      [context.actor.id, context.body.kind, context.body.policyVersion]
    );
    await bumpActivationState(client, context.actor.id);
    return {
      status: 200,
      resourceId: context.actor.id,
      body: {
        schema: SCHEMA,
        acknowledgement: {
          kind: result.rows[0].acknowledgement_kind,
          policyVersion: result.rows[0].policy_version,
          acknowledgedAt: new Date(result.rows[0].acknowledged_at).toISOString(),
          stateVersion: Number(result.rows[0].revision),
          scope: 'server_record_only',
          devicePermissionVerified: false,
        },
        activation: await readActivationBundle(client, context.actor.id),
      },
    };
  });
}

async function saveEmergencyContact(context) {
  return executeCommand(context, async (client) => {
    const worker = await requireWorker(client, context.actor.id, { lock: true });
    assertRevision(
      { revision: Number(worker.activation_revision || 1) },
      context.expectedRevision,
      'worker activation'
    );
    await client.query(
      `UPDATE users
          SET emergency_contact = $2
        WHERE id = $1`,
      [context.actor.id, context.body.phone]
    );
    await bumpActivationState(client, context.actor.id);
    return {
      status: 200,
      resourceId: context.actor.id,
      body: {
        schema: SCHEMA,
        activation: await readActivationBundle(client, context.actor.id),
      },
    };
  });
}

module.exports = {
  savePublicProfile,
  createOffering,
  updateOffering,
  acknowledgeActivationItem,
  saveEmergencyContact,
  assertCanActivate,
  readActivationBundle,
};
