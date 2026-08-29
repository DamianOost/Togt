const { FEATURES } = require('./config/capabilities');

const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });
const parameterRef = (name) => ({ $ref: `#/components/parameters/${name}` });
const responseRef = (name) => ({ $ref: `#/components/responses/${name}` });

const EMPTY_OBJECT = Object.freeze({
  type: 'object',
  maxProperties: 0,
  additionalProperties: false,
});

function pathParameter(name, description) {
  return {
    name,
    in: 'path',
    required: true,
    description,
    schema: { type: 'string', format: 'uuid' },
  };
}

function jsonResponse(description, schema, { etag = false, replay = false } = {}) {
  const headers = {};
  if (etag) headers.ETag = { $ref: '#/components/headers/RevisionETag' };
  if (replay) headers['Idempotent-Replay'] = { $ref: '#/components/headers/IdempotentReplay' };
  return {
    description,
    ...(Object.keys(headers).length ? { headers } : {}),
    content: { 'application/json': { schema } },
  };
}

function envelope(property, name, extraProperties = {}) {
  return {
    type: 'object',
    required: [property],
    properties: {
      [property]: schemaRef(name),
      ...extraProperties,
    },
  };
}

function listEnvelope(property, name, extraProperties = {}) {
  return {
    type: 'object',
    required: [property, 'meta'],
    properties: {
      [property]: { type: 'array', items: schemaRef(name) },
      meta: {
        type: 'object',
        additionalProperties: true,
      },
      ...extraProperties,
    },
  };
}

function jsonRequest(schema, { required = true, description } = {}) {
  return {
    required,
    ...(description ? { description } : {}),
    content: { 'application/json': { schema } },
  };
}

function canonicalProblems({ conflict = true, validation = true, precondition = false } = {}) {
  return {
    '400': responseRef('Problem400'),
    '401': responseRef('Problem401'),
    '403': responseRef('Problem403'),
    '404': responseRef('Problem404'),
    ...(conflict ? { '409': responseRef('Problem409') } : {}),
    ...(precondition ? { '412': responseRef('Problem412') } : {}),
    ...(validation ? { '413': responseRef('Problem413'), '422': responseRef('Problem422') } : {}),
    ...(precondition ? { '428': responseRef('Problem428') } : {}),
  };
}

function projectCommand({
  operationId,
  summary,
  description,
  requestSchema = EMPTY_OBJECT,
  requestRequired = false,
  success = ['200'],
  responseSchema = schemaRef('FulfilmentCommandEnvelope'),
  positiveRevision = false,
  printableIdempotencyKey = true,
}) {
  const responses = Object.fromEntries(success.map((status) => [
    status,
    jsonResponse(
      status === '201' ? 'Created and Project state returned.'
        : status === '202' ? 'Accepted and Project state returned.'
          : 'Project state returned.',
      responseSchema,
      { etag: true, replay: true }
    ),
  ]));
  return {
    operationId,
    summary,
    ...(description ? { description } : {}),
    parameters: [
      parameterRef(printableIdempotencyKey ? 'RequiredPrintableIdempotencyKey' : 'RequiredIdempotencyKey'),
      parameterRef(positiveRevision ? 'IfMatchPositiveRevision' : 'IfMatchProjectRevision'),
    ],
    requestBody: jsonRequest(requestSchema, { required: requestRequired }),
    responses: {
      ...responses,
      ...canonicalProblems({ precondition: true }),
    },
  };
}

function quoteCommand({
  operationId,
  summary,
  requestSchema = EMPTY_OBJECT,
  requestRequired = false,
  created = false,
  responseSchema = envelope('quote', 'Quote'),
}) {
  return {
    operationId,
    summary,
    parameters: [parameterRef('RequiredIdempotencyKey')],
    requestBody: jsonRequest(requestSchema, { required: requestRequired }),
    responses: {
      [created ? '201' : '200']: jsonResponse(
        created ? 'Created.' : 'Updated.',
        responseSchema,
        { replay: true }
      ),
      ...canonicalProblems(),
    },
  };
}

function trustCommand({
  operationId,
  summary,
  requestSchema = EMPTY_OBJECT,
  requestRequired = true,
  responseSchema,
  success = ['200'],
  ifMatch = false,
  etag = false,
}) {
  const parameters = [parameterRef('RequiredIdempotencyKey')];
  if (ifMatch) parameters.push(parameterRef('IfMatchPositiveRevision'));
  return {
    operationId,
    summary,
    parameters,
    requestBody: jsonRequest(requestSchema, { required: requestRequired }),
    responses: {
      ...Object.fromEntries(success.map((status) => [
        status,
        jsonResponse(status === '201' ? 'Created.' : 'Command applied.', responseSchema, {
          etag,
          replay: true,
        }),
      ])),
      ...canonicalProblems({ precondition: ifMatch }),
      '503': responseRef('Problem503'),
    },
  };
}

function workerCommand({
  operationId,
  summary,
  requestSchema,
  responseSchema,
  created = false,
  ifMatchParameter = 'IfMatchPositiveRevision',
}) {
  return {
    operationId,
    summary,
    parameters: [
      parameterRef('RequiredIdempotencyKey'),
      parameterRef(ifMatchParameter),
    ],
    requestBody: jsonRequest(requestSchema),
    responses: {
      [created ? '201' : '200']: jsonResponse(
        created ? 'Created.' : 'Updated.',
        responseSchema,
        { etag: true, replay: true }
      ),
      ...canonicalProblems({ precondition: true }),
      '503': responseRef('Problem503'),
    },
  };
}

function capabilityExtension(name) {
  const capability = FEATURES[name] || { available: false, reason_code: 'not_configured' };
  return {
    name,
    available: capability.available === true,
    ...(capability.reason_code ? { reasonCode: capability.reason_code } : {}),
  };
}

function applyGroundedOpenApi(spec) {
  Object.assign(spec.components.parameters, {
    RequiredIdempotencyKey: {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'Required for this canonical command. Must be 8-255 characters. Reuse with the same body replays the stored response; reuse with different input is rejected.',
      schema: { type: 'string', minLength: 8, maxLength: 255 },
    },
    RequiredPrintableIdempotencyKey: {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'Required for this fulfilment command. Must contain 8-255 printable non-space ASCII characters. Same key plus same revision/body replays the stored response; changed input is rejected.',
      schema: { type: 'string', minLength: 8, maxLength: 255, pattern: '^[!-~]{8,255}$' },
    },
    RequiredRatingIdempotencyKey: {
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description: 'Required 8-255 character submission key. Ratings are immutable: an exact repeat of the already submitted score/comment returns the existing rating with Idempotent-Replay true even when the key differs; changed content is rejected.',
      schema: { type: 'string', minLength: 8, maxLength: 255 },
    },
    IfMatchProjectRevision: {
      name: 'If-Match',
      in: 'header',
      required: true,
      description: 'Latest Project/fulfilment revision, optionally quoted or weak. Revision zero is valid for a new Project lifecycle.',
      schema: { type: 'string', pattern: '^(?:W/)?"?[0-9]+"?$' },
    },
    IfMatchPositiveRevision: {
      name: 'If-Match',
      in: 'header',
      required: true,
      description: 'Latest positive integer resource revision, optionally quoted or weak.',
      schema: { type: 'string', pattern: '^(?:W/)?"?[1-9][0-9]*"?$' },
    },
    IfMatchCatalogueVersion: {
      name: 'If-Match',
      in: 'header',
      required: true,
      description: 'Exact positive serviceVersion of the published catalogue service selected in the request body. A stale catalogue version fails with 412.',
      schema: { type: 'string', pattern: '^(?:W/)?"?[1-9][0-9]*"?$' },
    },
    IfMatchAcknowledgementRevision: {
      name: 'If-Match',
      in: 'header',
      required: true,
      description: 'Current revision of this acknowledgement kind. Use 1 before its first acknowledgement, then use acknowledgement.stateVersion/ETag returned by the prior command.',
      schema: { type: 'string', pattern: '^(?:W/)?"?[1-9][0-9]*"?$' },
    },
  });

  spec.components.headers = {
    ...(spec.components.headers || {}),
    RevisionETag: {
      description: 'Quoted canonical resource or projection revision. Where a mutation requires If-Match, use the latest revision of the specific resource named by that operation.',
      schema: { type: 'string', pattern: '^"[0-9]+"$' },
    },
    IdempotentReplay: {
      description: 'Present with value true when no new mutation was made and the existing result was replayed. Canonical command stores bind this to a key/input; immutable rating repeats are recognised from the submitted rating itself.',
      schema: { type: 'string', enum: ['true'] },
    },
  };

  Object.assign(spec.components.responses, {
    Problem412: {
      description: 'If-Match revision is stale. Fetch the latest named resource and retry with a fresh idempotency key.',
      content: { 'application/problem+json': { schema: schemaRef('Problem') } },
    },
    Problem413: {
      description: 'Payload too large.',
      content: { 'application/problem+json': { schema: schemaRef('Problem') } },
    },
    Problem428: {
      description: 'The required If-Match precondition was not supplied.',
      content: { 'application/problem+json': { schema: schemaRef('Problem') } },
    },
    Problem503: {
      description: 'Capability or approved dependency is unavailable. No unsupported action was performed.',
      content: { 'application/problem+json': { schema: schemaRef('Problem') } },
    },
  });

  Object.assign(spec.components.schemas, {
    RegistrationPolicyDocument: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'title', 'version', 'url', 'required'],
      properties: {
        kind: { type: 'string', enum: ['terms', 'privacy'] },
        title: { type: 'string' },
        version: { type: ['string', 'null'] },
        url: { type: ['string', 'null'], format: 'uri' },
        required: { type: 'boolean', const: true },
      },
    },
    RegistrationPolicy: {
      type: 'object',
      additionalProperties: false,
      required: [
        'schema', 'available', 'reasonCode', 'revision', 'releaseChannel',
        'productionApproved', 'documents',
      ],
      properties: {
        schema: { type: 'string', const: 'togt.registration-policy.v1' },
        available: { type: 'boolean' },
        reasonCode: { type: ['string', 'null'] },
        revision: { type: ['string', 'null'], pattern: '^[a-f0-9]{64}$' },
        releaseChannel: { type: 'string', enum: ['internal_testing', 'production'] },
        productionApproved: { type: 'boolean' },
        documents: {
          type: 'array',
          minItems: 0,
          maxItems: 2,
          items: schemaRef('RegistrationPolicyDocument'),
        },
      },
    },
    RegistrationPolicyConsent: {
      type: 'object',
      additionalProperties: false,
      required: ['revision', 'termsAccepted', 'privacyAccepted'],
      properties: {
        revision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        termsAccepted: { type: 'boolean', const: true },
        privacyAccepted: { type: 'boolean', const: true },
      },
    },
    RegistrationError: {
      type: 'object',
      required: ['error'],
      properties: {
        error: { type: 'string' },
        detail: { type: 'string' },
        reason_code: { type: ['string', 'null'] },
        current_revision: { type: 'string' },
      },
    },
    CapabilitySnapshot: {
      type: 'object',
      required: ['schema_version', 'generated_at', 'ttl_seconds', 'minimum_app_version', 'features'],
      properties: {
        schema_version: { type: 'integer', const: 1 },
        generated_at: { type: 'string', format: 'date-time' },
        ttl_seconds: { type: 'integer', minimum: 1 },
        minimum_app_version: { type: 'string' },
        features: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['available'],
            properties: {
              available: { type: 'boolean' },
              mode: { type: 'string' },
              provider: { type: 'string' },
              assurance: { type: 'string' },
              reason_code: { type: 'string' },
            },
          },
        },
      },
    },
    GroundedProject: {
      type: 'object',
      description: 'Participant-specific canonical Project projection. Customer-entered exact location remains visible to the customer; Worker location/contact fields follow the current canonical reveal phase.',
      required: [
        'schema', 'id', 'revision', 'segment', 'transactionalStatus', 'operational',
        'service', 'schedule', 'area', 'participants', 'commercial', 'payment',
        'completion', 'updatedAt',
      ],
      properties: {
        schema: { type: 'string', const: 'togt.project.v1' },
        id: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 0 },
        segment: { type: 'string', enum: ['active', 'upcoming', 'past'] },
        transactionalStatus: {
          type: 'string',
          enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'terminated_after_start'],
        },
        operational: {
          type: 'object',
          required: ['phase', 'label', 'dominantAction', 'readOnly'],
          properties: {
            phase: {
              type: 'string',
              enum: [
                'matching', 'assigned', 'scheduled', 'en_route', 'arrived',
                'scope_confirmation', 'work_active', 'completion_review',
                'payment_pending', 'closed',
              ],
            },
            label: { type: 'string' },
            dominantAction: { type: 'string' },
            readOnly: { type: 'boolean' },
          },
        },
        service: { type: 'object', additionalProperties: true },
        schedule: { type: 'object', additionalProperties: true },
        area: {
          type: 'object',
          description: 'Exact for the customer. Approximate for the Worker until canonical reveal policy permits exact job access.',
          required: ['precision'],
          properties: {
            precision: { type: 'string', enum: ['exact', 'approximate'] },
            address: { type: 'string' },
            label: { type: 'string' },
            coordinate: { type: 'object', additionalProperties: true },
          },
        },
        participants: { type: 'object', additionalProperties: true },
        commercial: { type: 'object', additionalProperties: true },
        payment: { type: 'object', additionalProperties: true },
        completion: { type: 'object', additionalProperties: true },
        scope: { type: 'object', additionalProperties: true },
        workerLiveLocation: { type: 'object', additionalProperties: true },
        timeline: { type: 'array', items: { type: 'object', additionalProperties: true } },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    ProjectCommandEnvelope: {
      type: 'object',
      required: ['project', 'transition'],
      properties: {
        project: schemaRef('GroundedProject'),
        transition: { type: 'object', additionalProperties: true },
      },
    },
    Fulfilment: {
      type: 'object',
      description: 'Canonical, privacy-aware Project fulfilment state. Worker exact location/contact access is granted only by the route transition and revoked on terminal/recovery transitions.',
      required: [
        'schema', 'projectId', 'revision', 'transactionalStatus', 'operationalPhase',
        'schedule', 'travel', 'location', 'participants', 'scope', 'start',
        'reschedules', 'changeOrders', 'recovery', 'integrity', 'allowedActions', 'updatedAt',
      ],
      properties: {
        schema: { type: 'string', const: 'togt.fulfilment.v1' },
        projectId: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 0 },
        transactionalStatus: { type: 'string' },
        operationalPhase: { type: 'string' },
        schedule: { type: 'object', additionalProperties: true },
        travel: { type: 'object', additionalProperties: true },
        location: { type: 'object', additionalProperties: true },
        participants: { type: 'object', additionalProperties: true },
        scope: { type: 'object', additionalProperties: true },
        start: { type: 'object', additionalProperties: true },
        reschedules: { type: 'array', items: { type: 'object', additionalProperties: true } },
        changeOrders: { type: 'array', items: { type: 'object', additionalProperties: true } },
        recovery: { type: 'object', additionalProperties: true },
        integrity: {
          type: 'object',
          required: ['policySnapshotPresent', 'readOnly'],
          properties: {
            policySnapshotPresent: { type: 'boolean' },
            policyVersion: { type: ['string', 'null'] },
            readOnly: { type: 'boolean' },
          },
        },
        allowedActions: { type: 'object', additionalProperties: { type: 'boolean' } },
        updatedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    FulfilmentCommandEnvelope: {
      type: 'object',
      required: ['fulfilment', 'transition'],
      properties: {
        fulfilment: schemaRef('Fulfilment'),
        transition: { type: 'object', additionalProperties: true },
        startPin: { type: 'string', pattern: '^\\d{6}$' },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
    CatalogueService: {
      type: 'object',
      description: 'Published, versioned catalogue definition. Worker availability and worker lists are intentionally not part of this resource.',
      required: [
        'id', 'version', 'schemaVersion', 'canonicalKey', 'categoryKey', 'label',
        'description', 'pricingMode', 'fulfilmentMode', 'riskTier', 'requiredQuestionIds',
        'briefSchema', 'pricingRules', 'materialsRules', 'changeOrderRules', 'currency',
        'recurrenceEligible', 'workerEligibility',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        version: { type: 'integer', minimum: 1 },
        schemaVersion: { type: 'integer', minimum: 1 },
        canonicalKey: { type: 'string' },
        categoryKey: { type: 'string' },
        label: { type: 'string' },
        description: { type: 'string' },
        pricingMode: { type: 'string', enum: ['fixed_instant', 'hourly_estimated', 'remote_quote', 'diagnostic_visit'] },
        fulfilmentMode: { type: 'string' },
        riskTier: { type: 'string' },
        requiredQuestionIds: { type: 'array', items: { type: 'string' } },
        briefSchema: { type: 'object', additionalProperties: true },
        pricingRules: { type: 'object', additionalProperties: true },
        materialsRules: { type: 'object', additionalProperties: true },
        changeOrderRules: { type: 'object', additionalProperties: true },
        minimumDurationMinutes: { type: ['integer', 'null'] },
        callOutFee: { type: ['string', 'null'] },
        currency: { type: 'string', const: 'ZAR' },
        cancellationPolicyVersion: { type: 'string' },
        recurrenceEligible: { type: 'boolean' },
        workerEligibility: { type: 'object', additionalProperties: true },
        publishedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    QuoteRequest: {
      type: 'object',
      description: 'Viewer-specific quote request. Workers receive only a sanitised brief and broad area; the owning customer additionally receives privateLocation and selection identifiers.',
      required: ['id', 'version', 'status', 'service', 'brief', 'area', 'schedule', 'quotesCloseAt', 'createdAt', 'updatedAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        version: { type: 'integer', minimum: 1 },
        status: { type: 'string', enum: ['open', 'receiving', 'selected', 'expired', 'cancelled', 'no_quotes'] },
        service: { type: 'object', additionalProperties: true },
        brief: { type: 'object', additionalProperties: true },
        area: {
          type: 'object',
          required: ['label', 'precision'],
          properties: { label: { type: 'string' }, precision: { type: 'string', const: 'broad' } },
        },
        schedule: { type: 'object', additionalProperties: true },
        questionsDeadlineAt: { type: ['string', 'null'], format: 'date-time' },
        quotesCloseAt: { type: 'string', format: 'date-time' },
        customerId: { type: 'string', format: 'uuid' },
        privateLocation: { type: 'object', additionalProperties: true },
        selectedQuoteId: { type: ['string', 'null'], format: 'uuid' },
        bookingId: { type: ['string', 'null'], format: 'uuid' },
        selectedAt: { type: ['string', 'null'], format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    Quote: {
      type: 'object',
      required: [
        'id', 'requestId', 'status', 'version', 'scope', 'deliverables', 'exclusions',
        'assumptions', 'schedule', 'commercial', 'createdAt', 'updatedAt',
      ],
      properties: {
        id: { type: 'string', format: 'uuid' },
        requestId: { type: 'string', format: 'uuid' },
        status: { type: 'string', enum: ['draft', 'submitted', 'accepted', 'declined', 'expired', 'withdrawn', 'lost'] },
        version: { type: 'integer', minimum: 1 },
        scope: { type: ['string', 'null'] },
        deliverables: { type: 'array', items: { type: 'string' } },
        exclusions: { type: 'array', items: { type: 'string' } },
        assumptions: { type: 'array', items: { type: 'string' } },
        schedule: { type: 'object', additionalProperties: true },
        commercial: { type: 'object', additionalProperties: true },
        worker: { type: 'object', description: 'Included for customer-visible submitted offers only.', additionalProperties: true },
        validUntil: { type: ['string', 'null'], format: 'date-time' },
        submittedAt: { type: ['string', 'null'], format: 'date-time' },
        acceptedAt: { type: ['string', 'null'], format: 'date-time' },
        declinedAt: { type: ['string', 'null'], format: 'date-time' },
        expiredAt: { type: ['string', 'null'], format: 'date-time' },
        withdrawnAt: { type: ['string', 'null'], format: 'date-time' },
        lostAt: { type: ['string', 'null'], format: 'date-time' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    TrustIncident: {
      type: 'object',
      required: ['schema', 'id', 'kind', 'category', 'state', 'revision', 'channel', 'stateMachine', 'emergencyFallback', 'createdAt', 'updatedAt'],
      properties: {
        schema: { type: 'string', const: 'togt.trust.v1' },
        id: { type: 'string', format: 'uuid' },
        kind: { type: 'string', enum: ['safety', 'support'] },
        category: { type: 'string' },
        state: { type: 'string', enum: ['received', 'acknowledged', 'escalated', 'resolved', 'failed'] },
        revision: { type: 'integer', minimum: 1 },
        bookingReference: { type: 'string', format: 'uuid' },
        summary: { type: 'string' },
        channel: {
          type: 'object',
          description: 'Record-only intake. It does not claim an operator alert, acknowledgement or emergency dispatch.',
          additionalProperties: true,
        },
        stateMachine: { type: 'object', additionalProperties: true },
        emergencyFallback: { type: 'object', additionalProperties: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    Favourite: {
      type: 'object',
      required: ['schema', 'id', 'worker', 'sourceProjectReference', 'status', 'revision', 'createdAt', 'updatedAt'],
      properties: {
        schema: { type: 'string', const: 'togt.trust.v1' },
        id: { type: 'string', format: 'uuid' },
        worker: { type: 'object', additionalProperties: true },
        sourceProjectReference: { type: 'string', format: 'uuid' },
        status: { type: 'string' },
        revision: { type: 'integer', minimum: 1 },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    RebookDraft: {
      type: 'object',
      description: 'Draft only. This endpoint does not submit a booking, reserve a Worker, reuse a stale price, or perform automatic substitution.',
      required: ['schema', 'id', 'revision', 'status', 'sourceProjectReference', 'preferredWorker', 'service', 'confirmationsRequired', 'substitution', 'submission', 'createdAt', 'updatedAt'],
      properties: {
        schema: { type: 'string', const: 'togt.trust.v1' },
        id: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 1 },
        status: { type: 'string' },
        sourceProjectReference: { type: 'string', format: 'uuid' },
        preferredWorker: { type: 'object', additionalProperties: true },
        service: { type: 'object', additionalProperties: true },
        editableScope: { type: 'object', additionalProperties: true },
        broadAreaLabel: { type: 'string' },
        requestedStartsAt: { type: 'string', format: 'date-time' },
        confirmationsRequired: { type: 'object', additionalProperties: { type: 'boolean' } },
        substitution: { type: 'object', additionalProperties: true },
        submission: { type: 'object', additionalProperties: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    RecurringSeries: {
      type: 'object',
      description: 'Mutually accepted recurring terms. Occurrences do not automatically create bookings; each occurrence still requires booking confirmation.',
      required: ['schema', 'id', 'revision', 'status', 'sourceProjectReference', 'participants', 'acceptances', 'occurrences', 'pendingOccurrenceChanges', 'pendingRequests', 'controls', 'createdAt', 'updatedAt'],
      properties: {
        schema: { type: 'string', const: 'togt.trust.v1' },
        id: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 1 },
        status: {
          type: 'string',
          enum: [
            'awaiting_acceptance', 'terms_change_pending', 'active', 'paused',
            'resume_requested', 'cancellation_requested', 'cancelled', 'blocked',
          ],
        },
        sourceProjectReference: { type: 'string', format: 'uuid' },
        participants: { type: 'object', additionalProperties: true },
        currentTerms: { type: 'object', additionalProperties: true },
        proposedTerms: { type: 'object', additionalProperties: true },
        acceptances: { type: 'array', items: { type: 'object', additionalProperties: true } },
        occurrences: { type: 'array', items: { type: 'object', additionalProperties: true } },
        pendingOccurrenceChanges: { type: 'array', items: { type: 'object', additionalProperties: true } },
        pendingRequests: {
          type: 'object',
          additionalProperties: false,
          required: ['resumeRequestedByRole', 'cancellationRequestedByRole'],
          properties: {
            resumeRequestedByRole: { type: ['string', 'null'], enum: ['customer', 'worker', null] },
            cancellationRequestedByRole: { type: ['string', 'null'], enum: ['customer', 'worker', null] },
          },
        },
        controls: { type: 'object', additionalProperties: { type: 'boolean' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
      allOf: [
        {
          if: { properties: { status: { const: 'resume_requested' } }, required: ['status'] },
          then: {
            properties: {
              pendingRequests: {
                properties: {
                  resumeRequestedByRole: { type: 'string', enum: ['customer', 'worker'] },
                  cancellationRequestedByRole: { type: 'null', const: null },
                },
              },
            },
          },
        },
        {
          if: { properties: { status: { const: 'cancellation_requested' } }, required: ['status'] },
          then: {
            properties: {
              pendingRequests: {
                properties: {
                  resumeRequestedByRole: { type: 'null', const: null },
                  cancellationRequestedByRole: { type: 'string', enum: ['customer', 'worker'] },
                },
              },
            },
          },
        },
        {
          if: {
            properties: {
              status: { not: { enum: ['resume_requested', 'cancellation_requested'] } },
            },
            required: ['status'],
          },
          then: {
            properties: {
              pendingRequests: {
                properties: {
                  resumeRequestedByRole: { type: 'null', const: null },
                  cancellationRequestedByRole: { type: 'null', const: null },
                },
              },
            },
          },
        },
      ],
    },
    WorkerActivation: {
      type: 'object',
      description: 'Server-computed Worker readiness. Acknowledgement evidence never claims that device permission was granted. Payout readiness is not required or claimed in this build.',
      required: ['schemaVersion', 'workerId', 'stateVersion', 'items', 'acknowledgementPolicies', 'onlinePermission', 'lastUpdatedAt'],
      properties: {
        schemaVersion: { type: 'integer', const: 1 },
        workerId: { type: 'string', format: 'uuid' },
        stateVersion: { type: 'integer', minimum: 1 },
        items: { type: 'array', items: { type: 'object', additionalProperties: true } },
        acknowledgementPolicies: {
          type: 'array', minItems: 3, maxItems: 3,
          items: {
            oneOf: [
              {
                type: 'object', additionalProperties: false,
                required: ['kind', 'status', 'expectedRevision', 'acknowledgedCurrent', 'policyVersion', 'title', 'body', 'acknowledgementLabel'],
                properties: {
                  kind: { type: 'string', enum: ['foreground_location', 'safety_policy', 'first_job_readiness'] },
                  status: { type: 'string', const: 'available' },
                  expectedRevision: { type: 'integer', minimum: 1 },
                  acknowledgedCurrent: { type: 'boolean' },
                  policyVersion: { type: 'string', minLength: 1, maxLength: 80 },
                  title: { type: 'string' },
                  body: { type: 'string' },
                  acknowledgementLabel: { type: 'string' },
                },
              },
              {
                type: 'object', additionalProperties: false,
                required: ['kind', 'status', 'expectedRevision', 'acknowledgedCurrent', 'reasonCode', 'explanation'],
                properties: {
                  kind: { type: 'string', enum: ['foreground_location', 'safety_policy', 'first_job_readiness'] },
                  status: { type: 'string', const: 'unavailable' },
                  expectedRevision: { type: 'integer', minimum: 1 },
                  acknowledgedCurrent: { type: 'boolean', const: false },
                  reasonCode: { type: 'string', const: 'approved_content_version_not_configured' },
                  explanation: { type: 'string' },
                },
              },
            ],
          },
        },
        onlinePermission: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['supported'] },
            source: { type: 'string', const: 'server' },
            observedAt: { type: 'string', format: 'date-time' },
            value: { type: 'object', additionalProperties: true },
          },
        },
        lastUpdatedAt: { type: 'string', format: 'date-time' },
      },
    },
    WorkerOffering: {
      type: 'object',
      required: [
        'offeringId', 'stateVersion', 'facts', 'customerFacingTitle', 'description',
        'hourlyRate', 'minimumDurationMinutes', 'callOutAmount', 'serviceAreaLabel',
        'portfolio', 'active', 'credentialEvidence', 'mutation', 'eligibility',
      ],
      properties: {
        offeringId: { type: 'string', format: 'uuid' },
        stateVersion: { type: 'integer', minimum: 1 },
        facts: {
          type: 'object',
          required: ['serviceId', 'serviceVersion', 'canonicalCategory', 'catalogueLabel', 'pricingMode', 'riskTier', 'requiredCredentials'],
          properties: {
            serviceId: { type: 'string', format: 'uuid' },
            serviceVersion: { type: 'integer', minimum: 1 },
            canonicalCategory: { type: 'string' },
            catalogueLabel: { type: 'string' },
            pricingMode: { type: 'object', additionalProperties: true },
            riskTier: { type: 'object', additionalProperties: true },
            requiredCredentials: { type: 'array', items: { type: 'string' } },
            fixedCustomerAmount: { type: 'object', additionalProperties: true },
            fixedWorkerNet: { type: 'object', additionalProperties: true },
            hourlyRateBounds: { type: 'object', additionalProperties: true },
            fixedPayoutRule: { type: ['string', 'null'] },
          },
        },
        customerFacingTitle: { type: ['string', 'null'] },
        description: { type: 'string' },
        hourlyRate: {
          oneOf: [
            { type: 'null' },
            { type: 'object', required: ['currency', 'amountMinor'], properties: { currency: { type: 'string', const: 'ZAR' }, amountMinor: { type: 'integer', minimum: 0 } } },
          ],
        },
        minimumDurationMinutes: { type: ['integer', 'null'], minimum: 1 },
        callOutAmount: {
          oneOf: [
            { type: 'null' },
            { type: 'object', required: ['currency', 'amountMinor'], properties: { currency: { type: 'string', const: 'ZAR' }, amountMinor: { type: 'integer', minimum: 0 } } },
          ],
        },
        serviceAreaLabel: { type: 'string' },
        portfolio: { type: 'array', maxItems: 0 },
        active: { type: 'boolean' },
        credentialEvidence: { type: 'array', items: { type: 'object', additionalProperties: true } },
        mutation: { type: 'object', additionalProperties: true },
        eligibility: { type: 'object', additionalProperties: true },
      },
    },
    WorkerServicesProfile: {
      type: 'object',
      required: ['schema', 'workerId', 'stateVersion', 'services', 'publicProfile', 'lastUpdatedAt', 'capabilities'],
      properties: {
        schema: { type: 'string', const: 'togt.worker-profile.v1' },
        workerId: { type: 'string', format: 'uuid' },
        stateVersion: { type: 'integer', minimum: 1 },
        services: { type: 'array', items: schemaRef('WorkerOffering') },
        publicProfile: { type: 'object', additionalProperties: true },
        lastUpdatedAt: { type: 'string', format: 'date-time' },
        capabilities: {
          type: 'object',
          description: 'portfolioUpload, credentialSubmission and payoutAccount are returned as unavailable in this build.',
          additionalProperties: true,
        },
      },
    },
    AssistedIntakeRequest: {
      type: 'object',
      additionalProperties: false,
      required: ['schemaVersion', 'photoAssetIds', 'processingConsent', 'consentPolicyVersion'],
      anyOf: [
        { required: ['typedText'] },
        { required: ['voiceAssetId'] },
        { properties: { photoAssetIds: { minItems: 1 } } },
      ],
      properties: {
        schemaVersion: { type: 'integer', const: 1 },
        typedText: { type: ['string', 'null'], maxLength: 4000 },
        voiceAssetId: { type: ['string', 'null'], maxLength: 160 },
        photoAssetIds: { type: 'array', maxItems: 4, uniqueItems: true, items: { type: 'string', maxLength: 160 } },
        processingConsent: { type: 'boolean', const: true },
        consentPolicyVersion: { type: 'string', maxLength: 160 },
      },
    },
    AssistedIntakeResult: {
      type: 'object',
      required: ['assistance', 'confirmation', 'processing'],
      properties: {
        assistance: { type: 'object', additionalProperties: true },
        confirmation: {
          type: 'object',
          description: 'All derived fields require user review; no Worker, final price, payment, identity or safety decision is made.',
          additionalProperties: { type: 'boolean' },
        },
        processing: { type: 'object', additionalProperties: true },
      },
    },
    RecommendationExplanation: {
      type: 'object',
      required: ['schemaVersion', 'workerId', 'rankingVersion', 'reasons', 'placement', 'claims', 'manualComparisonAvailable'],
      properties: {
        schemaVersion: { type: 'integer', const: 1 },
        workerId: { type: 'string', format: 'uuid' },
        rankingVersion: { type: 'string' },
        reasons: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            required: ['code', 'fact', 'evidenceAsOf'],
            properties: {
              code: {
                type: 'string',
                enum: ['credential_fit', 'verified_availability', 'service_area_fit', 'reliability_evidence', 'price_compatibility', 'past_customer_relationship'],
              },
              fact: { type: 'string' },
              evidenceAsOf: { type: 'string', format: 'date-time' },
            },
          },
        },
        placement: { type: 'object', additionalProperties: true },
        claims: {
          type: 'object',
          properties: {
            bestMatch: { type: 'boolean', const: false },
            guaranteedOutcome: { type: 'boolean', const: false },
          },
        },
        manualComparisonAvailable: { type: 'boolean', const: true },
      },
    },
    ProjectLiveStatus: {
      type: 'object',
      description: 'Privacy-minimised Android live-status projection. It deliberately excludes names, contact, chat, notes, exact location and other private Project detail.',
      required: ['schemaVersion', 'projectId', 'revision', 'state', 'updatedAt'],
      properties: {
        schemaVersion: { type: 'integer', const: 1 },
        projectId: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 0 },
        state: { type: 'string', enum: ['active', 'not_eligible', 'ended'] },
        phase: { type: 'string' },
        title: { type: 'string' },
        status: { type: 'string' },
        actionLabel: { type: 'string' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  });

  const register = spec.paths['/auth/register'].post;
  const registerSchema = register.requestBody.content['application/json'].schema;
  registerSchema.required = [...new Set([...registerSchema.required, 'policyConsent'])];
  registerSchema.properties.policyConsent = schemaRef('RegistrationPolicyConsent');
  register.description = 'Fetch `/auth/registration-policy`, show both current documents, and submit the exact current revision with explicit Terms and Privacy acceptance. No account is created when consent is missing, stale, invalid, or the server policy is unavailable.';
  register.responses['400'] = jsonResponse('Invalid registration fields or consent envelope.', schemaRef('RegistrationError'));
  register.responses['409'] = jsonResponse('Duplicate account or stale policy revision.', schemaRef('RegistrationError'));
  register.responses['428'] = jsonResponse('Explicit acceptance of both current documents is required.', schemaRef('RegistrationError'));
  register.responses['503'] = jsonResponse('Registration is closed because the required policy documents are not approved/configured.', schemaRef('RegistrationError'));

  Object.assign(spec.paths, {
    '/auth/registration-policy': {
      get: {
        operationId: 'get_registration_policy',
        summary: 'Fetch the current server-authoritative registration consent policy.',
        description: 'Canonical public path. The `/api/auth/registration-policy` mount is a compatibility alias. Cache-Control is no-store; clients must submit this exact revision to `/auth/register`.',
        security: [],
        responses: {
          '200': {
            ...jsonResponse('Current registration policy.', schemaRef('RegistrationPolicy')),
            headers: {
              'Cache-Control': {
                description: 'Always no-store so clients re-check the current policy.',
                schema: { type: 'string', const: 'no-store' },
              },
            },
          },
        },
      },
    },
    '/api/capabilities': {
      get: {
        operationId: 'get_capability_snapshot',
        summary: 'Discover server capability gates for this build.',
        description: 'The snapshot is authoritative for capabilities that remain disabled pending provider, safety, privacy, fairness, device or operations evidence.',
        security: [],
        responses: {
          '200': jsonResponse('Capability snapshot.', schemaRef('CapabilitySnapshot')),
        },
      },
    },
    '/api/projects': {
      get: {
        operationId: 'list_projects',
        summary: 'List participant-visible canonical Projects.',
        parameters: [{
          name: 'segment',
          in: 'query',
          required: false,
          schema: { type: 'string', enum: ['active', 'upcoming', 'past'] },
        }],
        responses: {
          '200': jsonResponse('Project list.', {
            type: 'object',
            required: ['schema', 'projects', 'meta'],
            properties: {
              schema: { type: 'string', const: 'togt.project.v1' },
              projects: { type: 'array', items: schemaRef('GroundedProject') },
              meta: { type: 'object', additionalProperties: true },
            },
          }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/projects/{id}': {
      parameters: [pathParameter('id', 'Project identifier (the canonical booking-backed Project id).')],
      get: {
        operationId: 'get_project',
        summary: 'Read a participant-specific Project detail and timeline.',
        responses: {
          '200': jsonResponse('Project detail.', envelope('project', 'GroundedProject'), { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/projects/{id}/completion-requests': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'request_project_completion',
        summary: 'Worker requests customer completion review.',
        success: ['200', '201'],
        responseSchema: schemaRef('ProjectCommandEnvelope'),
        printableIdempotencyKey: false,
      }),
    },
    '/api/projects/{id}/completion-confirmations': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'confirm_project_completion',
        summary: 'Customer confirms a pending completion request.',
        responseSchema: schemaRef('ProjectCommandEnvelope'),
        printableIdempotencyKey: false,
      }),
    },
    '/api/projects/{id}/disputes': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'dispute_project_completion',
        summary: 'Customer reports an issue with a pending completion request.',
        requestRequired: true,
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['reason'],
          properties: { reason: { type: 'string', minLength: 3, maxLength: 1000 } },
        },
        responseSchema: schemaRef('ProjectCommandEnvelope'),
        printableIdempotencyKey: false,
      }),
    },
    '/api/projects/{id}/fulfilment': {
      parameters: [pathParameter('id', 'Project identifier.')],
      get: {
        operationId: 'get_project_fulfilment',
        summary: 'Read privacy-aware canonical fulfilment state and allowed actions.',
        responses: {
          '200': jsonResponse('Fulfilment state.', envelope('fulfilment', 'Fulfilment'), { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/projects/{id}/en-route': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'start_project_route',
        summary: 'Worker starts the canonical route and unlocks exact job access inside policy lead time.',
      }),
    },
    '/api/projects/{id}/arrivals': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'mark_project_arrival',
        summary: 'Worker records arrival with explicit attestation.',
        requestRequired: true,
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['attestation'],
          properties: { attestation: { type: 'boolean', const: true } },
        },
      }),
    },
    '/api/projects/{id}/scope-proposals': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'propose_project_scope',
        summary: 'Propose an on-site scope version without contact details.',
        requestRequired: true,
        success: ['201'],
        requestSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['description', 'items', 'materialsResponsibility'],
          properties: {
            baseVersion: { type: ['integer', 'null'], minimum: 1 },
            description: { type: 'string', minLength: 3, maxLength: 1500 },
            items: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 300 } },
            materialsResponsibility: { type: 'string', minLength: 2, maxLength: 300 },
            estimatedMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080 },
          },
        },
      }),
    },
    '/api/projects/{id}/scope-confirmations': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'decide_project_scope',
        summary: 'Counterparty confirms or declines the current scope proposal.',
        requestRequired: true,
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['scopeVersion', 'decision'],
          properties: {
            scopeVersion: { type: 'integer', minimum: 1 },
            decision: { type: 'string', enum: ['confirm', 'decline'] },
          },
        },
      }),
    },
    '/api/projects/{id}/start-pin-reveals': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'reveal_project_start_pin',
        summary: 'Customer creates or replays the current six-digit start PIN reveal.',
        success: ['200', '201'],
        description: 'The PIN is returned only to the customer response and is never included in Worker fulfilment reads.',
      }),
    },
    '/api/projects/{id}/start': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'start_project_work',
        summary: 'Worker verifies the customer PIN and starts work atomically.',
        requestRequired: true,
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['startPin'],
          properties: {
            startPin: { type: 'string', pattern: '^\\d{6}$', writeOnly: true },
            deviceId: { type: ['string', 'null'], minLength: 8, maxLength: 128 },
          },
        },
      }),
    },
    '/api/projects/{id}/reschedule-proposals': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'propose_project_reschedule',
        summary: 'Propose a future Project start time.',
        requestRequired: true,
        success: ['201'],
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['proposedStartsAt'],
          properties: {
            proposedStartsAt: { type: 'string', format: 'date-time' },
            reason: { type: ['string', 'null'], maxLength: 500 },
          },
        },
      }),
    },
    '/api/projects/{id}/reschedule-proposals/{proposalId}/accept': {
      parameters: [
        pathParameter('id', 'Project identifier.'),
        pathParameter('proposalId', 'Reschedule proposal identifier.'),
      ],
      post: projectCommand({ operationId: 'accept_project_reschedule', summary: 'Accept a counterparty reschedule proposal.' }),
    },
    '/api/projects/{id}/reschedule-proposals/{proposalId}/decline': {
      parameters: [
        pathParameter('id', 'Project identifier.'),
        pathParameter('proposalId', 'Reschedule proposal identifier.'),
      ],
      post: projectCommand({ operationId: 'decline_project_reschedule', summary: 'Decline a counterparty reschedule proposal.' }),
    },
    '/api/projects/{id}/change-orders': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'propose_project_change_order',
        summary: 'Worker proposes additional scope and server-calculated commercial totals.',
        requestRequired: true,
        success: ['201'],
        requestSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['baseScopeVersion', 'description', 'addedScopeItems', 'labourAmount', 'materialsAmount'],
          properties: {
            baseScopeVersion: { type: 'integer', minimum: 1 },
            description: { type: 'string', minLength: 3, maxLength: 1000 },
            addedScopeItems: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', maxLength: 300 } },
            extraMinutes: { type: ['integer', 'null'], minimum: 1, maximum: 10080 },
            labourAmount: { oneOf: [{ type: 'number', minimum: 0 }, { type: 'string', pattern: '^(?:0|[1-9]\\d{0,6})(?:\\.\\d{1,2})?$' }] },
            materialsAmount: { oneOf: [{ type: 'number', minimum: 0 }, { type: 'string', pattern: '^(?:0|[1-9]\\d{0,6})(?:\\.\\d{1,2})?$' }] },
          },
        },
      }),
    },
    '/api/projects/{id}/change-orders/{changeOrderId}/approve': {
      parameters: [
        pathParameter('id', 'Project identifier.'),
        pathParameter('changeOrderId', 'Change-order identifier.'),
      ],
      post: projectCommand({ operationId: 'approve_project_change_order', summary: 'Customer approves a pending change order.' }),
    },
    '/api/projects/{id}/change-orders/{changeOrderId}/decline': {
      parameters: [
        pathParameter('id', 'Project identifier.'),
        pathParameter('changeOrderId', 'Change-order identifier.'),
      ],
      post: projectCommand({ operationId: 'decline_project_change_order', summary: 'Customer declines a pending change order.' }),
    },
    '/api/projects/{id}/no-show-reports': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'report_project_no_show',
        summary: 'Participant records a post-grace-period no-show attestation.',
        requestRequired: true,
        success: ['201'],
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['attestation'],
          properties: { attestation: { type: 'string', minLength: 3, maxLength: 1000 } },
        },
      }),
    },
    '/api/projects/{id}/replacement-requests': {
      parameters: [pathParameter('id', 'Project identifier.')],
      post: projectCommand({
        operationId: 'request_project_replacement',
        summary: 'Customer records a replacement request after a Worker no-show.',
        success: ['202'],
        description: 'This records the request only; it does not claim that a replacement was assigned.',
      }),
    },
    '/api/catalogue/services': {
      get: {
        operationId: 'list_catalogue_services',
        summary: 'List published current catalogue service versions.',
        description: 'Public catalogue metadata only. The response explicitly reports availability as not_included and does not return Workers or live availability.',
        security: [],
        parameters: [
          { name: 'category', in: 'query', required: false, schema: { type: 'string', pattern: '^[a-z0-9]+(?:_[a-z0-9]+)*$' } },
          { name: 'pricingMode', in: 'query', required: false, schema: { type: 'string', enum: ['fixed_instant', 'hourly_estimated', 'remote_quote', 'diagnostic_visit'] } },
        ],
        responses: {
          '200': jsonResponse('Published services.', listEnvelope('services', 'CatalogueService')),
          '400': responseRef('Problem400'),
        },
      },
    },
    '/api/catalogue/services/{id}': {
      parameters: [pathParameter('id', 'Catalogue service identifier.')],
      get: {
        operationId: 'get_catalogue_service',
        summary: 'Read one published catalogue service version.',
        security: [],
        parameters: [{ name: 'version', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } }],
        responses: {
          '200': jsonResponse('Published service.', envelope('service', 'CatalogueService', {
            meta: { type: 'object', additionalProperties: true },
          })),
          '400': responseRef('Problem400'),
          '404': responseRef('Problem404'),
        },
      },
    },
    '/api/quote-requests': {
      get: {
        operationId: 'list_quote_requests',
        summary: 'List caller-visible quote requests.',
        parameters: [{
          name: 'status', in: 'query', required: false,
          schema: { type: 'string', enum: ['open', 'receiving', 'selected', 'expired', 'cancelled', 'no_quotes'] },
        }],
        responses: {
          '200': jsonResponse('Quote requests.', listEnvelope('quoteRequests', 'QuoteRequest')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: {
        operationId: 'create_quote_request',
        summary: 'Customer creates a remote-quote request from a published service version.',
        parameters: [parameterRef('RequiredIdempotencyKey')],
        requestBody: jsonRequest({
          type: 'object',
          additionalProperties: false,
          required: ['serviceId', 'serviceVersion', 'brief', 'broadAreaLabel', 'privateLocation', 'schedule', 'quotesCloseAt'],
          properties: {
            serviceId: { type: 'string', format: 'uuid' },
            serviceVersion: { type: 'integer', minimum: 1 },
            brief: {
              type: 'object', additionalProperties: false, required: ['answers'],
              properties: {
                answers: { type: 'object', additionalProperties: true },
                media: { type: 'array', maxItems: 12, items: { type: 'object', additionalProperties: false, required: ['id', 'kind'], properties: { id: { type: 'string' }, kind: { type: 'string', const: 'image' } } } },
                summary: { type: 'string', maxLength: 1000 },
              },
            },
            broadAreaLabel: { type: 'string', minLength: 2, maxLength: 160 },
            privateLocation: {
              type: 'object', additionalProperties: false, required: ['address', 'latitude', 'longitude'],
              properties: {
                address: { type: 'string', minLength: 3, maxLength: 500 },
                latitude: { type: 'number', minimum: -90, maximum: 90 },
                longitude: { type: 'number', minimum: -180, maximum: 180 },
                accessInstructions: { type: 'string', maxLength: 1000 },
              },
            },
            schedule: {
              type: 'object', additionalProperties: false, required: ['startsAt', 'timezone'],
              properties: {
                startsAt: { type: 'string', format: 'date-time' },
                endsAt: { type: 'string', format: 'date-time' },
                timezone: { type: 'string', const: 'Africa/Johannesburg' },
                flexibility: { type: 'string', maxLength: 160 },
              },
            },
            questionsDeadlineAt: { type: 'string', format: 'date-time' },
            quotesCloseAt: { type: 'string', format: 'date-time' },
          },
        }),
        responses: {
          '201': jsonResponse('Quote request created.', envelope('quoteRequest', 'QuoteRequest'), { replay: true }),
          ...canonicalProblems(),
        },
      },
    },
    '/api/quote-requests/{id}': {
      parameters: [pathParameter('id', 'Quote-request identifier.')],
      get: {
        operationId: 'get_quote_request',
        summary: 'Read a caller-visible quote request and role-specific summary.',
        responses: {
          '200': jsonResponse('Quote request.', envelope('quoteRequest', 'QuoteRequest', {
            quoteSummary: { type: 'object', additionalProperties: true },
            ownQuote: { oneOf: [schemaRef('Quote'), { type: 'null' }] },
          })),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/quote-requests/{id}/quotes': {
      parameters: [pathParameter('id', 'Quote-request identifier.')],
      get: {
        operationId: 'list_quotes_for_request',
        summary: 'List submitted offers for the customer or only the caller Worker’s own quote.',
        responses: {
          '200': jsonResponse('Role-filtered quotes.', listEnvelope('quotes', 'Quote')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: quoteCommand({
        operationId: 'create_quote_draft',
        summary: 'Eligible Worker creates a quote draft or atomically submits a complete quote.',
        requestSchema: schemaRef('QuoteCreateInput'),
        requestRequired: false,
        created: true,
      }),
    },
    '/api/quote-requests/{id}/cancel': {
      parameters: [pathParameter('id', 'Quote-request identifier.')],
      post: {
        operationId: 'cancel_quote_request',
        summary: 'Customer cancels an open quote request.',
        parameters: [parameterRef('RequiredIdempotencyKey')],
        requestBody: jsonRequest(EMPTY_OBJECT, { required: false }),
        responses: {
          '200': jsonResponse('Quote request cancelled.', envelope('quoteRequest', 'QuoteRequest'), { replay: true }),
          ...canonicalProblems(),
        },
      },
    },
    '/api/quotes/{id}': {
      parameters: [pathParameter('id', 'Quote identifier.')],
      get: {
        operationId: 'get_quote',
        summary: 'Read an owned Worker quote or a customer-visible submitted offer.',
        responses: {
          '200': jsonResponse('Quote.', envelope('quote', 'Quote')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      put: quoteCommand({
        operationId: 'edit_quote_draft',
        summary: 'Worker replaces supplied editable fields on a quote draft.',
        requestSchema: schemaRef('QuoteDraftInput'),
        requestRequired: false,
      }),
    },
    '/api/quotes/{id}/submit': {
      parameters: [pathParameter('id', 'Quote identifier.')],
      post: quoteCommand({ operationId: 'submit_quote', summary: 'Worker submits a complete, current quote.' }),
    },
    '/api/quotes/{id}/withdraw': {
      parameters: [pathParameter('id', 'Quote identifier.')],
      post: quoteCommand({ operationId: 'withdraw_quote', summary: 'Worker withdraws an available quote.' }),
    },
    '/api/quotes/{id}/decline': {
      parameters: [pathParameter('id', 'Quote identifier.')],
      post: quoteCommand({ operationId: 'decline_quote', summary: 'Customer declines an available submitted quote.' }),
    },
    '/api/quotes/{id}/accept': {
      parameters: [pathParameter('id', 'Quote identifier.')],
      post: quoteCommand({
        operationId: 'accept_quote',
        summary: 'Customer atomically accepts one current quote and creates the booking-backed Project snapshot.',
        responseSchema: envelope('quote', 'Quote', {
          project: {
            type: 'object',
            description: 'New or previously selected booking-backed Project reference and immutable agreement summary.',
            additionalProperties: true,
          },
        }),
      }),
    },
    '/api/safety/incidents': {
      get: {
        operationId: 'list_safety_incidents',
        summary: 'List the caller’s record-only safety incidents.',
        responses: {
          '200': jsonResponse('Safety incidents.', listEnvelope('incidents', 'TrustIncident')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: trustCommand({
        operationId: 'create_safety_incident',
        summary: 'Record a safety incident without claiming operated SOS or emergency dispatch.',
        requestSchema: schemaRef('TrustIncidentInput'),
        responseSchema: envelope('incident', 'TrustIncident'),
        success: ['201'],
        etag: true,
      }),
    },
    '/api/safety/incidents/{id}': {
      parameters: [pathParameter('id', 'Safety-incident identifier.')],
      get: {
        operationId: 'get_safety_incident',
        summary: 'Read one reporter-visible safety incident.',
        responses: {
          '200': jsonResponse('Safety incident.', envelope('incident', 'TrustIncident')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/support/cases': {
      get: {
        operationId: 'list_support_cases',
        summary: 'List the caller’s record-only support cases.',
        responses: {
          '200': jsonResponse('Support cases.', listEnvelope('cases', 'TrustIncident')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: trustCommand({
        operationId: 'create_support_case',
        summary: 'Record an in-app support case.',
        requestSchema: schemaRef('TrustIncidentInput'),
        responseSchema: envelope('incident', 'TrustIncident'),
        success: ['201'],
        etag: true,
      }),
    },
    '/api/support/cases/{id}': {
      parameters: [pathParameter('id', 'Support-case identifier.')],
      get: {
        operationId: 'get_support_case',
        summary: 'Read one reporter-visible support case.',
        responses: {
          '200': jsonResponse('Support case.', envelope('case', 'TrustIncident')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/operations/safety-incidents/{id}/acknowledge': {
      parameters: [pathParameter('id', 'Safety-incident identifier.')],
      post: {
        operationId: 'acknowledge_safety_incident_disabled',
        summary: 'Unavailable operated safety acknowledgement transition.',
        'x-capability': capabilityExtension('operated_sos'),
        responses: { '400': responseRef('Problem400'), '401': responseRef('Problem401'), '503': responseRef('Problem503') },
      },
    },
    '/api/operations/safety-incidents/{id}/escalate': {
      parameters: [pathParameter('id', 'Safety-incident identifier.')],
      post: {
        operationId: 'escalate_safety_incident_disabled',
        summary: 'Unavailable operated safety escalation transition.',
        'x-capability': capabilityExtension('operated_sos'),
        responses: { '400': responseRef('Problem400'), '401': responseRef('Problem401'), '503': responseRef('Problem503') },
      },
    },
    '/api/operations/safety-incidents/{id}/resolve': {
      parameters: [pathParameter('id', 'Safety-incident identifier.')],
      post: {
        operationId: 'resolve_safety_incident_disabled',
        summary: 'Unavailable operated safety resolution transition.',
        'x-capability': capabilityExtension('operated_sos'),
        responses: { '400': responseRef('Problem400'), '401': responseRef('Problem401'), '503': responseRef('Problem503') },
      },
    },
    '/api/favourites': {
      get: {
        operationId: 'list_favourites',
        summary: 'Customer lists active favourite Workers.',
        responses: {
          '200': jsonResponse('Favourites.', listEnvelope('favourites', 'Favourite')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: trustCommand({
        operationId: 'create_favourite',
        summary: 'Customer favourites a Worker from an eligible completed Project.',
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['workerId', 'sourceBookingId'],
          properties: {
            workerId: { type: 'string', format: 'uuid' },
            sourceBookingId: { type: 'string', format: 'uuid' },
          },
        },
        responseSchema: envelope('favourite', 'Favourite', { transition: { type: 'object', additionalProperties: true } }),
        success: ['200', '201'],
        etag: true,
      }),
    },
    '/api/favourites/{workerId}': {
      parameters: [pathParameter('workerId', 'Worker identifier.')],
      delete: trustCommand({
        operationId: 'remove_favourite',
        summary: 'Customer removes a favourite relationship.',
        requestSchema: EMPTY_OBJECT,
        requestRequired: false,
        responseSchema: {
          type: 'object', required: ['result'],
          properties: { result: { type: 'object', additionalProperties: true } },
        },
      }),
    },
    '/api/blocks': {
      post: trustCommand({
        operationId: 'block_relationship',
        summary: 'Participant blocks a counterpart and prevents future matching/contact/recurrence.',
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['blockedUserId', 'sourceBookingId', 'reasonCode'],
          properties: {
            blockedUserId: { type: 'string', format: 'uuid' },
            sourceBookingId: { type: 'string', format: 'uuid' },
            reasonCode: { type: 'string', enum: ['safety_concern', 'harassment', 'inappropriate_contact', 'work_dispute', 'do_not_match', 'other'] },
          },
        },
        responseSchema: {
          type: 'object', required: ['block', 'transition'],
          properties: {
            block: { type: 'object', additionalProperties: true },
            transition: { type: 'object', additionalProperties: true },
          },
        },
        success: ['200', '201'],
      }),
    },
    '/api/bookings/{id}/relationship-eligibility': {
      parameters: [pathParameter('id', 'Source booking/Project identifier.')],
      get: {
        operationId: 'get_relationship_eligibility',
        summary: 'Read relationship eligibility for rebook, favourite and recurrence actions.',
        responses: {
          '200': jsonResponse('Relationship eligibility.', {
            type: 'object', required: ['relationship'],
            properties: { relationship: { type: 'object', additionalProperties: true } },
          }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/bookings/{id}/rebook-drafts': {
      parameters: [pathParameter('id', 'Source booking/Project identifier.')],
      post: trustCommand({
        operationId: 'create_rebook_draft',
        summary: 'Customer creates a non-submitted rebook draft from an eligible Project.',
        requestSchema: EMPTY_OBJECT,
        requestRequired: false,
        responseSchema: envelope('rebookDraft', 'RebookDraft'),
        success: ['201'],
        etag: true,
      }),
    },
    '/api/rebook-drafts': {
      get: {
        operationId: 'list_rebook_drafts',
        summary: 'Customer lists rebook drafts.',
        responses: {
          '200': jsonResponse('Rebook drafts.', listEnvelope('rebookDrafts', 'RebookDraft')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/rebook-drafts/{id}': {
      parameters: [pathParameter('id', 'Rebook-draft identifier.')],
      get: {
        operationId: 'get_rebook_draft',
        summary: 'Customer reads one rebook draft.',
        responses: {
          '200': jsonResponse('Rebook draft.', envelope('rebookDraft', 'RebookDraft'), { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      patch: trustCommand({
        operationId: 'update_rebook_draft',
        summary: 'Customer updates editable draft fields only.',
        requestSchema: {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: {
            editableScope: { type: 'object', additionalProperties: true },
            broadAreaLabel: { type: ['string', 'null'], minLength: 2, maxLength: 160 },
            requestedStartsAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
        responseSchema: envelope('rebookDraft', 'RebookDraft'),
        ifMatch: true,
        etag: true,
      }),
    },
    '/api/recurring-series': {
      get: {
        operationId: 'list_recurring_series',
        summary: 'List caller-participant recurring series.',
        responses: {
          '200': jsonResponse('Recurring series.', listEnvelope('recurringSeries', 'RecurringSeries')),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: trustCommand({
        operationId: 'create_recurring_series',
        summary: 'Customer proposes mutually accepted recurring terms from an eligible completed Project.',
        requestSchema: schemaRef('RecurringSeriesProposalInput'),
        responseSchema: envelope('recurringSeries', 'RecurringSeries'),
        success: ['201'],
        etag: true,
      }),
    },
    '/api/recurring-series/{id}': {
      parameters: [pathParameter('id', 'Recurring-series identifier.')],
      get: {
        operationId: 'get_recurring_series',
        summary: 'Read one participant-visible recurring series.',
        responses: {
          '200': jsonResponse('Recurring series.', envelope('recurringSeries', 'RecurringSeries'), { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      patch: trustCommand({
        operationId: 'update_recurring_series',
        summary: 'Apply one supported mutual-terms, pause/resume, cancellation, or single-occurrence action.',
        requestSchema: schemaRef('RecurringSeriesActionInput'),
        responseSchema: envelope('recurringSeries', 'RecurringSeries'),
        ifMatch: true,
        etag: true,
      }),
    },
    '/api/worker/activation': {
      get: {
        operationId: 'get_worker_activation',
        summary: 'Worker reads server-computed activation/readiness state.',
        responses: {
          '200': jsonResponse('Worker activation state.', {
            type: 'object', required: ['schema', 'activation'],
            properties: {
              schema: { type: 'string', const: 'togt.worker-profile.v1' },
              activation: schemaRef('WorkerActivation'),
            },
          }, { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
    },
    '/api/worker/activation/acknowledgements/{kind}': {
      parameters: [{
        name: 'kind', in: 'path', required: true,
        schema: { type: 'string', enum: ['foreground_location', 'safety_policy', 'first_job_readiness'] },
      }],
      put: workerCommand({
        operationId: 'acknowledge_worker_activation_item',
        summary: 'Worker records acknowledgement of the current server-required content version.',
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['policyVersion'],
          properties: { policyVersion: { type: 'string', minLength: 1, maxLength: 80 } },
        },
        responseSchema: {
          type: 'object', required: ['schema', 'acknowledgement', 'activation'],
          properties: {
            schema: { type: 'string', const: 'togt.worker-profile.v1' },
            acknowledgement: { type: 'object', additionalProperties: true },
            activation: schemaRef('WorkerActivation'),
          },
        },
        ifMatchParameter: 'IfMatchAcknowledgementRevision',
      }),
    },
    '/api/worker/activation/emergency-contact': {
      put: workerCommand({
        operationId: 'save_worker_emergency_contact',
        summary: 'Worker stores one private emergency-contact phone number for activation readiness.',
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['phone'],
          properties: {
            phone: {
              type: 'string', minLength: 7, maxLength: 30,
              description: 'Private activation evidence. The number is never returned in public Worker projections.',
            },
          },
        },
        responseSchema: {
          type: 'object', required: ['schema', 'activation'],
          properties: {
            schema: { type: 'string', const: 'togt.worker-profile.v1' },
            activation: schemaRef('WorkerActivation'),
          },
        },
      }),
    },
    '/api/worker/profile': {
      get: {
        operationId: 'get_worker_services_profile',
        summary: 'Worker reads their canonical public profile and service offerings.',
        responses: {
          '200': jsonResponse('Worker services profile.', envelope('servicesProfile', 'WorkerServicesProfile'), { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      patch: workerCommand({
        operationId: 'update_worker_public_profile',
        summary: 'Worker updates bounded, contact-screened public display name and about text.',
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['displayName', 'about'],
          properties: {
            displayName: { type: 'string', minLength: 2, maxLength: 80, description: 'Phone numbers and email addresses are rejected.' },
            about: { type: 'string', minLength: 20, maxLength: 1000, description: 'Phone numbers and email addresses are rejected.' },
          },
        },
        responseSchema: {
          type: 'object', required: ['schema', 'publicProfile'],
          properties: {
            schema: { type: 'string', const: 'togt.worker-profile.v1' },
            publicProfile: { type: 'object', additionalProperties: true },
          },
        },
      }),
    },
    '/api/worker/offerings': {
      get: {
        operationId: 'list_worker_offerings',
        summary: 'Worker lists their catalogue-backed offerings.',
        responses: {
          '200': jsonResponse('Worker offerings.', {
            type: 'object', required: ['schema', 'workerId', 'offerings', 'meta'],
            properties: {
              schema: { type: 'string', const: 'togt.worker-profile.v1' },
              workerId: { type: 'string', format: 'uuid' },
              offerings: { type: 'array', items: schemaRef('WorkerOffering') },
              meta: { type: 'object', additionalProperties: true },
            },
          }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      post: workerCommand({
        operationId: 'create_worker_offering',
        summary: 'Worker opts into one published catalogue service version.',
        created: true,
        requestSchema: {
          type: 'object', additionalProperties: false, required: ['serviceId', 'serviceVersion'],
          properties: {
            serviceId: { type: 'string', format: 'uuid' },
            serviceVersion: { type: 'integer', minimum: 1 },
          },
        },
        responseSchema: {
          type: 'object', required: ['schema', 'offering'],
          properties: {
            schema: { type: 'string', const: 'togt.worker-profile.v1' },
            offering: schemaRef('WorkerOffering'),
          },
        },
        ifMatchParameter: 'IfMatchCatalogueVersion',
      }),
    },
    '/api/worker/offerings/{id}': {
      parameters: [pathParameter('id', 'Worker-offering identifier.')],
      get: {
        operationId: 'get_worker_offering',
        summary: 'Worker reads one owned catalogue-backed offering.',
        responses: {
          '200': jsonResponse('Worker offering.', {
            type: 'object', required: ['schema', 'offering'],
            properties: {
              schema: { type: 'string', const: 'togt.worker-profile.v1' },
              offering: schemaRef('WorkerOffering'),
            },
          }, { etag: true }),
          ...canonicalProblems({ conflict: false, validation: false }),
        },
      },
      patch: workerCommand({
        operationId: 'update_worker_offering',
        summary: 'Worker updates allowed contact-screened offering presentation, pricing, area and active state.',
        requestSchema: {
          type: 'object', additionalProperties: false, minProperties: 1,
          properties: {
            title: { type: 'string', minLength: 2, maxLength: 120, description: 'Phone numbers and email addresses are rejected.' },
            description: { type: 'string', minLength: 20, maxLength: 1500, description: 'Phone numbers and email addresses are rejected.' },
            hourlyRateMinor: { type: ['integer', 'null'], minimum: 0 },
            minimumDurationMinutes: { type: ['integer', 'null'], minimum: 1 },
            callOutAmountMinor: { type: ['integer', 'null'], minimum: 0 },
            serviceAreaLabel: { type: 'string', minLength: 2, maxLength: 160, description: 'Phone numbers and email addresses are rejected.' },
            active: { type: 'boolean' },
          },
        },
        responseSchema: {
          type: 'object', required: ['schema', 'offering'],
          properties: {
            schema: { type: 'string', const: 'togt.worker-profile.v1' },
            offering: schemaRef('WorkerOffering'),
          },
        },
      }),
    },
    '/api/bookings/{id}/share-trip': {
      parameters: [pathParameter('id', 'Booking/Project identifier.')],
      post: {
        operationId: 'share_booking_details_preview',
        summary: 'Participant creates a static privacy-minimised booking summary.',
        description: 'Available only to the customer or Worker assigned to the booking. The response has no address, coordinates, participant/contact identifiers, public URL or live tracking; it does not create a share token.',
        'x-capability': capabilityExtension('booking_details_share'),
        responses: {
          '200': jsonResponse('Static non-live booking summary.', schemaRef('SafeBookingDetailsShare')),
          '401': responseRef('Problem401'),
          '403': jsonResponse('Caller is not a booking participant.', schemaRef('LegacyError')),
          '404': jsonResponse('Booking was not found.', schemaRef('LegacyError')),
          '503': jsonResponse('Server-authoritative booking-details-share capability is disabled.', schemaRef('CapabilityUnavailableLegacy')),
        },
      },
    },
    '/api/trust/fairness': {
      get: {
        operationId: 'get_trust_fairness_evidence',
        summary: 'Read the authenticated participant’s separate trust and reliability evidence.',
        description: 'Returns exactly four privacy-minimised evidence rows. This release does not combine them into a score, infer misconduct, or apply an automated restriction.',
        responses: {
          '200': jsonResponse('Two-sided fairness evidence.', schemaRef('TrustFairness')),
          '401': responseRef('Problem401'),
        },
      },
    },
    '/api/ratings/booking/{id}/mine': {
      parameters: [pathParameter('id', 'Completed booking/Project identifier.')],
      get: {
        operationId: 'get_my_project_rating',
        summary: 'Read the authenticated participant’s own double-blind rating state.',
        description: 'A participant sees only their own selection. The counterpart’s sealed submission is not exposed. Publication occurs only after both submit or the 14-day deadline passes.',
        responses: {
          '200': jsonResponse('Own rating state.', schemaRef('DoubleBlindRatingEnvelope')),
          '400': responseRef('Problem400'),
          '401': responseRef('Problem401'),
          '404': responseRef('Problem404'),
        },
      },
    },
    '/api/ratings': {
      post: {
        operationId: 'submit_double_blind_rating',
        summary: 'Submit one immutable post-completion participant rating.',
        description: 'Requires a completed participant Project within its 14-day window. The first submission is sealed; both ratings publish together when the counterpart submits. An exact repeat returns 200 with Idempotent-Replay true even under a different valid key; changed content returns 409.',
        parameters: [parameterRef('RequiredRatingIdempotencyKey')],
        requestBody: jsonRequest(schemaRef('DoubleBlindRatingInput')),
        responses: {
          '200': jsonResponse('Exact immutable rating submission replay.', schemaRef('DoubleBlindRatingEnvelope'), { replay: true }),
          '201': jsonResponse('Rating submitted and sealed or bilaterally published.', schemaRef('DoubleBlindRatingEnvelope')),
          '400': responseRef('Problem400'),
          '401': responseRef('Problem401'),
          '404': responseRef('Problem404'),
          '409': responseRef('Problem409'),
          '422': responseRef('Problem422'),
        },
      },
    },
    '/api/ratings/labourer/{id}': {
      parameters: [pathParameter('id', 'Worker identifier.')],
      get: {
        operationId: 'list_public_worker_ratings',
        summary: 'List up to 20 published ratings received by a Worker.',
        description: 'Public Worker-profile read. Sealed ratings are excluded; reviewer identity is reduced to the first whitespace-delimited name, with no avatar or private account fields.',
        security: [],
        responses: {
          '200': jsonResponse('Published Worker ratings.', {
            type: 'object',
            additionalProperties: false,
            required: ['ratings'],
            properties: { ratings: { type: 'array', maxItems: 20, items: schemaRef('PublishedRating') } },
          }),
          '400': responseRef('Problem400'),
          '404': responseRef('Problem404'),
        },
      },
    },
    '/api/labourers/{id}/grounded-profile': {
      parameters: [pathParameter('id', 'Worker identifier.')],
      get: {
        operationId: 'get_grounded_public_worker_profile',
        summary: 'Read an authenticated customer-facing Grounded Worker profile.',
        description: 'Restricted to authenticated customer and labourer accounts. The projection contains only public verification evidence, active offerings that are currently eligible against the canonical catalogue and Worker evidence, published anonymous reviews, a completed-Project count, and server-derived current availability. It never returns reviewer identity, sealed ratings, private activation evidence, credential/eligibility internals, contact details, coordinates, or Worker-net pricing.',
        responses: {
          '200': jsonResponse('Privacy-minimised public Worker profile.', schemaRef('GroundedPublicWorkerProfileEnvelope')),
          '400': responseRef('Problem400'),
          '401': responseRef('Problem401'),
          '403': responseRef('Problem403'),
          '404': responseRef('Problem404'),
        },
      },
    },
    '/api/ratings/user/{userId}': {
      parameters: [pathParameter('userId', 'Account owner identifier.')],
      get: {
        operationId: 'get_private_received_rating_history',
        summary: 'Account owner reads their published received-rating history.',
        description: 'Authenticated owner-only read. It excludes sealed ratings and returns at most 50 published rows.',
        responses: {
          '200': jsonResponse('Private published received-rating history.', {
            type: 'object',
            additionalProperties: false,
            required: ['ratings', 'avg_score', 'total'],
            properties: {
              ratings: { type: 'array', maxItems: 50, items: schemaRef('PrivateReceivedRating') },
              avg_score: {
                description: 'PostgreSQL numeric average is serialized as a decimal string when present; an empty history returns numeric zero.',
                oneOf: [
                  { type: 'string', pattern: '^(?:[1-4](?:[.][0-9]{1,2})?|5(?:[.]0{1,2})?)$' },
                  { type: 'number', const: 0 },
                ],
              },
              total: { type: 'integer', minimum: 0 },
            },
          }),
          '400': responseRef('Problem400'),
          '401': responseRef('Problem401'),
          '403': responseRef('Problem403'),
        },
      },
    },
    '/api/earnings': {
      get: {
        operationId: 'get_worker_earnings_ledger',
        summary: 'Worker reads completed-Project payment evidence and append-only ledger adjustments.',
        description: 'Worker-only, private no-store projection. The read idempotently materialises any missing recognition/reversal entries after rechecking canonical completion, locked commercial, latest payment and open-hold evidence. Values named paid are reconciled customer-paid Project value—not Worker gross/net, available balance, payout or provider success.',
        responses: {
          '200': {
            ...jsonResponse('Worker payable-ledger projection.', schemaRef('WorkerEarningsResponse')),
            headers: {
              'Cache-Control': {
                description: 'The private Worker projection must not be stored.',
                schema: { type: 'string', const: 'private, no-store' },
              },
            },
          },
          '401': responseRef('Problem401'),
          '403': responseRef('Problem403'),
        },
      },
    },
    '/api/intent/extract': {
      post: {
        operationId: 'extract_assisted_intake_intent',
        summary: 'Feature-gated assisted intake extraction requiring explicit processing consent.',
        description: 'Disabled in the current release. When separately approved and enabled, every derived field remains user-editable and requires confirmation; deterministic intake remains available.',
        'x-capability': capabilityExtension('ai_assisted_intake'),
        requestBody: jsonRequest(schemaRef('AssistedIntakeRequest')),
        responses: {
          '200': {
            ...jsonResponse('Assisted extraction.', schemaRef('AssistedIntakeResult')),
            headers: {
              'Cache-Control': { description: 'Sensitive assisted output is never cached.', schema: { type: 'string', const: 'no-store' } },
            },
          },
          ...canonicalProblems({ conflict: false }),
          '503': responseRef('Problem503'),
        },
      },
    },
    '/api/recommendations/quote-requests/{requestId}/workers/{workerId}/explanation': {
      parameters: [
        pathParameter('requestId', 'Quote-request identifier.'),
        pathParameter('workerId', 'Worker identifier.'),
      ],
      get: {
        operationId: 'get_worker_recommendation_explanation',
        summary: 'Feature-gated customer-only factual recommendation explanation.',
        description: 'Disabled in the current release. Manual comparison remains available; the contract never claims best match or a guaranteed outcome.',
        'x-capability': capabilityExtension('explainable_recommendations'),
        responses: {
          '200': {
            ...jsonResponse('Recommendation explanation.', envelope('recommendation', 'RecommendationExplanation')),
            headers: {
              'Cache-Control': { description: 'Private explanation is never cached.', schema: { type: 'string', const: 'private, no-store' } },
            },
          },
          ...canonicalProblems({ conflict: false, validation: false }),
          '503': responseRef('Problem503'),
        },
      },
    },
    '/api/projects/{projectId}/live-status': {
      parameters: [pathParameter('projectId', 'Project identifier.')],
      get: {
        operationId: 'get_project_live_status',
        summary: 'Feature-gated privacy-minimised Android live status.',
        description: 'Disabled in the current release. The normal Project screen remains the deterministic fallback.',
        'x-capability': capabilityExtension('android_live_updates'),
        responses: {
          '200': {
            ...jsonResponse('Live-status projection.', envelope('liveStatus', 'ProjectLiveStatus'), { etag: true }),
            headers: {
              'Cache-Control': { description: 'Private live status is never cached.', schema: { type: 'string', const: 'private, no-store' } },
              ETag: { $ref: '#/components/headers/RevisionETag' },
            },
          },
          ...canonicalProblems({ conflict: false, validation: false }),
          '503': responseRef('Problem503'),
        },
      },
    },
  });

  Object.assign(spec.components.schemas, {
    LegacyError: {
      type: 'object',
      required: ['error'],
      properties: { error: { type: 'string' } },
    },
    CapabilityUnavailableLegacy: {
      type: 'object',
      additionalProperties: false,
      required: ['error', 'capability', 'reason_code'],
      properties: {
        error: { type: 'string', const: 'capability_unavailable' },
        capability: { type: 'string' },
        reason_code: { type: 'string' },
      },
    },
    SafeBookingDetailsShare: {
      type: 'object',
      additionalProperties: false,
      description: 'Participant-only static Project summary. It contains no address, coordinates, participant/contact identifiers, public token or live tracking.',
      required: ['bookingDetailsShare', 'preview', 'shareText', 'live_tracking', 'public_link'],
      properties: {
        bookingDetailsShare: {
          type: 'object',
          additionalProperties: false,
          required: ['available', 'mode'],
          properties: {
            available: { type: 'boolean', const: true },
            mode: { type: 'string', const: 'non_live_no_address' },
          },
        },
        preview: {
          type: 'object',
          additionalProperties: false,
          required: ['projectReference', 'serviceLabel', 'broadAreaLabel', 'scheduleLabel', 'statusLabel'],
          properties: {
            projectReference: { type: 'string', const: 'TOGT Project' },
            serviceLabel: { type: 'string' },
            broadAreaLabel: { type: 'string', const: 'Area not shared' },
            scheduleLabel: { type: 'string' },
            statusLabel: { type: 'string' },
          },
        },
        shareText: { type: 'string', description: 'Legacy-compatible plain text carrying the same non-live safe preview.' },
        live_tracking: { type: 'boolean', const: false },
        public_link: { type: 'null', const: null },
      },
    },
    TrustFairnessEvidenceItem: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'label', 'valueLabel', 'explanation', 'sourceLabel', 'sampleSize', 'observedAt'],
      properties: {
        id: {
          type: 'string',
          enum: ['completed-projects', 'participant-ratings', 'actor-cancellations', 'no-show-records'],
        },
        label: { type: 'string' },
        valueLabel: { type: 'string' },
        explanation: { type: 'string' },
        sourceLabel: { type: 'string' },
        sampleSize: { type: 'integer', minimum: 0 },
        observedAt: { type: 'string', format: 'date-time' },
      },
    },
    TrustFairness: {
      type: 'object',
      additionalProperties: false,
      description: 'Authenticated two-sided evidence view. Ratings and reliability facts remain separate; this build computes no composite score and applies no automated restriction.',
      required: ['schema', 'generatedAt', 'fairness'],
      properties: {
        schema: { type: 'string', const: 'togt.trust.v1' },
        generatedAt: { type: 'string', format: 'date-time' },
        fairness: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'summary', 'evidence', 'restriction'],
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            evidence: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: schemaRef('TrustFairnessEvidenceItem'),
            },
            restriction: {
              type: 'object',
              additionalProperties: false,
              required: ['status', 'reasonCode', 'reasonLabel', 'evidence', 'recoverySteps', 'humanReview'],
              properties: {
                status: { type: 'string', const: 'none' },
                reasonCode: { type: 'null', const: null },
                reasonLabel: { type: 'string' },
                evidence: { type: 'array', maxItems: 0 },
                recoverySteps: { type: 'array', maxItems: 0 },
                humanReview: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['available', 'channel', 'actionLabel'],
                  properties: {
                    available: { type: 'boolean', const: true },
                    channel: { type: 'string', const: 'in_app_record' },
                    actionLabel: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    DoubleBlindRating: {
      type: 'object',
      additionalProperties: false,
      description: 'The authenticated participant\'s own immutable rating state. A sealed score is never exposed through public/history reads until both participants submit or the 14-day deadline passes.',
      required: ['schema', 'projectReference', 'state', 'selectedValue', 'reasonLabels', 'publicationLabel', 'publishAfter', 'submittedAt'],
      properties: {
        schema: { type: 'string', const: 'togt.rating.v1' },
        projectReference: { type: 'string', format: 'uuid' },
        state: { type: 'string', enum: ['not_open', 'open', 'window_closed', 'sealed', 'published'] },
        selectedValue: { type: ['integer', 'null'], minimum: 1, maximum: 5 },
        reasonLabels: { type: 'array', maxItems: 0, items: { type: 'string' } },
        publicationLabel: { type: 'string' },
        publishAfter: { type: ['string', 'null'], format: 'date-time' },
        submittedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
    DoubleBlindRatingEnvelope: {
      type: 'object',
      additionalProperties: false,
      required: ['schema', 'rating'],
      properties: {
        schema: { type: 'string', const: 'togt.rating.v1' },
        rating: schemaRef('DoubleBlindRating'),
      },
    },
    DoubleBlindRatingInput: {
      type: 'object',
      additionalProperties: false,
      required: ['booking_id', 'score'],
      properties: {
        booking_id: { type: 'string', format: 'uuid' },
        score: { type: 'integer', minimum: 1, maximum: 5 },
        comment: {
          type: ['string', 'null'],
          maxLength: 1000,
          description: 'Optional public review text. Phone numbers and email addresses are rejected.',
        },
      },
    },
    PublishedRating: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'comment', 'created_at', 'reviewer_name'],
      properties: {
        score: { type: 'integer', minimum: 1, maximum: 5 },
        comment: { type: ['string', 'null'], description: 'Contact-bearing or malformed legacy text is quarantined to null at the public serialization boundary.' },
        created_at: { type: 'string', format: 'date-time' },
        reviewer_name: { type: 'string', description: 'First whitespace-delimited name only; avatar and private identity are omitted.' },
      },
    },
    GroundedPublicMoney: {
      type: 'object',
      additionalProperties: false,
      required: ['currency', 'amountMinor'],
      properties: {
        currency: { type: 'string', const: 'ZAR' },
        amountMinor: { type: 'integer', minimum: 0 },
      },
    },
    GroundedPublicMoneyEvidence: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'source', 'observedAt', 'value'],
          properties: {
            status: { type: 'string', const: 'supported' },
            source: { type: 'string', const: 'server' },
            observedAt: { type: 'string', format: 'date-time' },
            value: schemaRef('GroundedPublicMoney'),
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'reasonCode', 'explanation'],
          properties: {
            status: { type: 'string', const: 'unavailable' },
            reasonCode: { type: 'string' },
            explanation: { type: 'string' },
          },
        },
      ],
    },
    GroundedPublicProfilePhoto: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'source', 'observedAt', 'value'],
          properties: {
            status: { type: 'string', const: 'supported' },
            source: { type: 'string', const: 'server' },
            observedAt: { type: 'string', format: 'date-time' },
            value: {
              type: 'object',
              additionalProperties: false,
              required: ['uri'],
              properties: { uri: { type: 'string', format: 'uri' } },
            },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'reasonCode', 'explanation'],
          properties: {
            status: { type: 'string', const: 'unavailable' },
            reasonCode: { type: 'string', const: 'profile_photo_unavailable' },
            explanation: { type: 'string' },
          },
        },
      ],
    },
    GroundedPublicWorkerBadge: {
      type: 'object',
      additionalProperties: false,
      required: ['badgeId', 'label', 'detail', 'status'],
      properties: {
        badgeId: { type: 'string', enum: ['account_evidence', 'identity_assurance'] },
        label: { type: 'string' },
        detail: { type: 'string' },
        status: { type: 'string', enum: ['verified', 'pending', 'not_verified'] },
      },
    },
    GroundedPublicWorkerOffering: {
      type: 'object',
      additionalProperties: false,
      description: 'An active offering that passed the current canonical catalogue, account, identity, credential, contact-screened configuration and pricing eligibility checks. Contact-bearing legacy offerings, eligibility evidence and Worker-net pricing are intentionally omitted.',
      required: [
        'offeringId', 'serviceId', 'serviceVersion', 'canonicalCategory',
        'catalogueLabel', 'title', 'description', 'pricingMode',
        'fixedCustomerAmount', 'hourlyRate', 'minimumDurationMinutes',
        'callOutAmount', 'serviceAreaLabel',
      ],
      properties: {
        offeringId: { type: 'string', format: 'uuid' },
        serviceId: { type: 'string', format: 'uuid' },
        serviceVersion: { type: 'integer', minimum: 1 },
        canonicalCategory: { type: 'string' },
        catalogueLabel: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        pricingMode: { type: 'string', enum: ['fixed', 'hourly', 'remote_quote', 'diagnostic_visit'] },
        fixedCustomerAmount: schemaRef('GroundedPublicMoneyEvidence'),
        hourlyRate: {
          oneOf: [{ type: 'null' }, schemaRef('GroundedPublicMoney')],
        },
        minimumDurationMinutes: { type: ['integer', 'null'], minimum: 1 },
        callOutAmount: {
          oneOf: [{ type: 'null' }, schemaRef('GroundedPublicMoney')],
        },
        serviceAreaLabel: { type: 'string' },
      },
    },
    GroundedAnonymousPublishedReview: {
      type: 'object',
      additionalProperties: false,
      description: 'Published review evidence with no reviewer name, avatar, account identifier or other identity field.',
      required: ['reviewId', 'rating', 'body', 'publishedAt', 'serviceLabel'],
      properties: {
        reviewId: { type: 'string', format: 'uuid' },
        rating: { type: 'integer', minimum: 1, maximum: 5 },
        body: { type: ['string', 'null'], description: 'Contact-bearing or malformed legacy text is quarantined to null at the public serialization boundary.' },
        publishedAt: { type: 'string', format: 'date-time' },
        serviceLabel: { type: ['string', 'null'] },
      },
    },
    GroundedPublicWorkerProfile: {
      type: 'object',
      additionalProperties: false,
      description: 'Customer-facing Worker evidence. Contact-bearing legacy display/about/bio text is quarantined at serialization; public offerings are contact-screened before inclusion.',
      required: [
        'workerId', 'stateVersion', 'displayName', 'about', 'profilePhoto',
        'publicBadges', 'serviceAreaLabel', 'offerings', 'reviews', 'rating',
        'completedJobs', 'currentlyAvailable',
      ],
      properties: {
        workerId: { type: 'string', format: 'uuid' },
        stateVersion: { type: 'integer', minimum: 1 },
        displayName: { type: 'string' },
        about: { type: 'string' },
        profilePhoto: schemaRef('GroundedPublicProfilePhoto'),
        publicBadges: { type: 'array', items: schemaRef('GroundedPublicWorkerBadge') },
        serviceAreaLabel: { type: 'string' },
        offerings: { type: 'array', items: schemaRef('GroundedPublicWorkerOffering') },
        reviews: { type: 'array', maxItems: 20, items: schemaRef('GroundedAnonymousPublishedReview') },
        rating: {
          oneOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['average', 'count'],
              properties: {
                average: { type: 'number', minimum: 1, maximum: 5 },
                count: { type: 'integer', minimum: 1 },
              },
            },
          ],
        },
        completedJobs: { type: 'integer', minimum: 0 },
        currentlyAvailable: {
          type: 'boolean',
          description: 'Server-derived from the stored availability signal and the current activation online-permission projection.',
        },
      },
    },
    GroundedPublicWorkerProfileEnvelope: {
      type: 'object',
      additionalProperties: false,
      required: ['schema', 'profile'],
      properties: {
        schema: { type: 'string', const: 'togt.grounded-worker-public-profile.v1' },
        profile: schemaRef('GroundedPublicWorkerProfile'),
      },
    },
    PrivateReceivedRating: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'booking_id', 'score', 'comment', 'created_at', 'reviewer_name'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        booking_id: { type: 'string', format: 'uuid' },
        score: { type: 'integer', minimum: 1, maximum: 5 },
        comment: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        reviewer_name: { type: 'string', description: 'First whitespace-delimited name only; avatar and private identity are omitted.' },
      },
    },
    EarningsPeriodTotals: {
      type: 'object',
      additionalProperties: false,
      required: ['today', 'this_week', 'this_month', 'all_time'],
      properties: {
        today: { type: 'number', minimum: 0 },
        this_week: { type: 'number', minimum: 0 },
        this_month: { type: 'number', minimum: 0 },
        all_time: { type: 'number', minimum: 0 },
      },
    },
    WorkerLedgerUnavailableMoney: {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'amount', 'reasonCode'],
      properties: {
        state: { type: 'string', const: 'unavailable' },
        amount: { type: 'null', const: null },
        reasonCode: {
          type: 'string',
          enum: [
            'worker_gross_policy_not_configured',
            'platform_fee_policy_not_configured',
            'worker_net_policy_not_configured',
          ],
        },
      },
    },
    WorkerLedgerMoney: {
      type: 'object',
      additionalProperties: false,
      required: ['currency', 'amount'],
      properties: {
        currency: { type: 'string', const: 'ZAR' },
        amount: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$' },
      },
    },
    WorkerLedgerSignedMoney: {
      type: 'object',
      additionalProperties: false,
      required: ['currency', 'amount'],
      properties: {
        currency: { type: 'string', const: 'ZAR' },
        amount: { type: 'string', pattern: '^-?(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$' },
      },
    },
    WorkerPayableLedgerProject: {
      type: 'object',
      additionalProperties: false,
      required: [
        'ledgerEntryId', 'projectId', 'serviceLabel', 'completedAt', 'ledgerState',
        'latestReasonCode', 'adjustmentCount', 'reconciledPaidJobValue', 'workerGross',
        'platformFee', 'workerNet', 'paymentState', 'payout', 'updatedAt',
      ],
      properties: {
        ledgerEntryId: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
        serviceLabel: { type: 'string' },
        completedAt: { type: 'string', format: 'date-time' },
        ledgerState: { type: 'string', enum: ['recognised', 'reversed'] },
        latestReasonCode: {
          type: 'string',
          enum: [
            'project_reconciled_paid', 'project_reconciled_again', 'payment_refunded',
            'payment_reconciliation_reversed', 'project_disputed', 'project_hold_applied',
            'project_completion_reversed',
          ],
        },
        adjustmentCount: { type: 'integer', minimum: 1 },
        reconciledPaidJobValue: schemaRef('WorkerLedgerMoney'),
        workerGross: schemaRef('WorkerLedgerUnavailableMoney'),
        platformFee: schemaRef('WorkerLedgerUnavailableMoney'),
        workerNet: schemaRef('WorkerLedgerUnavailableMoney'),
        paymentState: { type: 'string', enum: ['awaiting_reconciliation', 'paid_online', 'refunded', 'disputed'] },
        payout: {
          type: 'object',
          additionalProperties: false,
          required: ['supported', 'state', 'reasonCode'],
          properties: {
            supported: { type: 'boolean', const: false },
            state: { type: 'string', const: 'unavailable' },
            reasonCode: { type: 'string', const: 'payout_capability_unavailable' },
          },
        },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
    WorkerPayableLedgerEntry: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'projectId', 'sequence', 'type', 'reasonCode', 'reconciledPaidJobValueDelta', 'occurredAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        projectId: { type: 'string', format: 'uuid' },
        sequence: { type: 'integer', minimum: 1 },
        type: { type: 'string', enum: ['recognition', 'reversal'] },
        reasonCode: {
          type: 'string',
          enum: [
            'project_reconciled_paid', 'project_reconciled_again', 'payment_refunded',
            'payment_reconciliation_reversed', 'project_disputed', 'project_hold_applied',
            'project_completion_reversed',
          ],
        },
        reconciledPaidJobValueDelta: schemaRef('WorkerLedgerSignedMoney'),
        occurredAt: { type: 'string', format: 'date-time' },
      },
    },
    WorkerPayableLedger: {
      type: 'object',
      additionalProperties: false,
      description: 'Append-only evidence for completed Projects whose latest ZAR payment exactly reconciles to the locked completion snapshot. It is paid Project value, not Worker gross/net, balance, beneficiary or payout evidence.',
      required: ['schema', 'definition', 'currency', 'totals', 'projects', 'entries', 'capabilities'],
      properties: {
        schema: { type: 'string', const: 'togt.worker-payable-ledger.v1' },
        definition: { type: 'string', const: 'completed_reconciled_paid_project_value_not_worker_net_v1' },
        currency: { type: 'string', const: 'ZAR' },
        totals: {
          type: 'object',
          additionalProperties: false,
          required: ['reconciledPaidJobValue', 'workerGross', 'platformFee', 'workerNet'],
          properties: {
            reconciledPaidJobValue: {
              type: 'object',
              additionalProperties: false,
              required: ['today', 'thisWeek', 'thisMonth', 'allTime'],
              properties: {
                today: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$' },
                thisWeek: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$' },
                thisMonth: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$' },
                allTime: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)(?:[.][0-9]{1,2})?$' },
              },
            },
            workerGross: schemaRef('WorkerLedgerUnavailableMoney'),
            platformFee: schemaRef('WorkerLedgerUnavailableMoney'),
            workerNet: schemaRef('WorkerLedgerUnavailableMoney'),
          },
        },
        projects: { type: 'array', items: schemaRef('WorkerPayableLedgerProject') },
        entries: { type: 'array', items: schemaRef('WorkerPayableLedgerEntry') },
        capabilities: {
          type: 'object',
          additionalProperties: false,
          required: ['workerGross', 'platformFee', 'workerNet', 'availableBalance', 'payout'],
          properties: {
            workerGross: { type: 'boolean', const: false },
            platformFee: { type: 'boolean', const: false },
            workerNet: { type: 'boolean', const: false },
            availableBalance: { type: 'boolean', const: false },
            payout: { type: 'boolean', const: false },
          },
        },
      },
    },
    WorkerEarningsResponse: {
      type: 'object',
      additionalProperties: false,
      description: 'Worker-only projection. Legacy numeric fields now mean reconciled paid Project value and must never be interpreted as Worker net earnings.',
      required: [
        'today', 'this_week', 'this_month', 'all_time', 'paid', 'pending',
        'job_value', 'daily', 'worker_payable_ledger', 'semantics',
      ],
      properties: {
        today: { type: 'number', minimum: 0 },
        this_week: { type: 'number', minimum: 0 },
        this_month: { type: 'number', minimum: 0 },
        all_time: { type: 'number', minimum: 0 },
        paid: schemaRef('EarningsPeriodTotals'),
        pending: schemaRef('EarningsPeriodTotals'),
        job_value: schemaRef('EarningsPeriodTotals'),
        daily: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: [
              'date', 'booking_count', 'amount', 'paid_booking_count',
              'partially_paid_booking_count', 'pending_booking_count',
              'paid_amount', 'pending_amount', 'job_value',
            ],
            properties: {
              date: { type: 'string', format: 'date' },
              booking_count: { type: 'integer', minimum: 0 },
              amount: { type: 'number', minimum: 0 },
              paid_booking_count: { type: 'integer', minimum: 0 },
              partially_paid_booking_count: { type: 'integer', minimum: 0 },
              pending_booking_count: { type: 'integer', minimum: 0 },
              paid_amount: { type: 'number', minimum: 0 },
              pending_amount: { type: 'number', minimum: 0 },
              job_value: { type: 'number', minimum: 0 },
            },
          },
        },
        worker_payable_ledger: schemaRef('WorkerPayableLedger'),
        semantics: {
          type: 'object',
          additionalProperties: false,
          required: [
            'currency', 'legacy_totals', 'paid', 'pending', 'job_value',
            'ledger_definition', 'worker_gross_supported', 'platform_fee_supported',
            'worker_net_supported', 'available_balance_supported', 'payout_supported',
          ],
          properties: {
            currency: { type: 'string', const: 'ZAR' },
            legacy_totals: { type: 'string', const: 'paid_job_value' },
            paid: { type: 'string', const: 'completed_reconciled_paid_project_value_not_worker_net' },
            pending: { type: 'string', const: 'completed_project_value_without_current_reconciled_paid_evidence' },
            job_value: { type: 'string', const: 'completed_project_locked_or_booking_total' },
            ledger_definition: { type: 'string', const: 'completed_reconciled_paid_project_value_not_worker_net_v1' },
            worker_gross_supported: { type: 'boolean', const: false },
            platform_fee_supported: { type: 'boolean', const: false },
            worker_net_supported: { type: 'boolean', const: false },
            available_balance_supported: { type: 'boolean', const: false },
            payout_supported: { type: 'boolean', const: false },
          },
        },
      },
    },
    QuoteCreateInput: {
      type: 'object',
      additionalProperties: false,
      properties: {
        quote: schemaRef('QuoteDraftInput'),
        submit: {
          type: 'boolean',
          default: false,
          description: 'When true, quote must be complete and is submitted in the same atomic command.',
        },
      },
    },
    QuoteDraftInput: {
      type: 'object',
      additionalProperties: false,
      properties: {
        scope: { type: 'string', minLength: 3, maxLength: 4000 },
        deliverables: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 500 } },
        exclusions: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 500 } },
        assumptions: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 500 } },
        proposedStartAt: { type: 'string', format: 'date-time' },
        proposedEndAt: { type: 'string', format: 'date-time' },
        durationMinutes: { type: 'integer', minimum: 15, maximum: 10080 },
        labourAmount: { oneOf: [{ type: 'number', minimum: 0 }, { type: 'string' }] },
        materialsAmount: { oneOf: [{ type: 'number', minimum: 0 }, { type: 'string' }] },
        validUntil: { type: 'string', format: 'date-time' },
      },
    },
    TrustIncidentInput: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'summary', 'requestedChannel'],
      properties: {
        bookingId: { type: ['string', 'null'], format: 'uuid' },
        category: {
          type: 'string',
          enum: ['immediate_danger', 'injury', 'harassment', 'unsafe_work', 'property_damage', 'payment_or_work', 'account_help', 'other'],
        },
        summary: { type: 'string', minLength: 3, maxLength: 2000 },
        requestedChannel: {
          type: 'string',
          const: 'in_app_record',
          description: 'Only supported channel. operated_sos/togt_dispatch/emergency_dispatch fail closed with 503 and direct emergency fallback instructions.',
        },
      },
    },
    RecurringSeriesProposalInput: {
      type: 'object',
      additionalProperties: false,
      required: ['sourceBookingId', 'schedule', 'substitutionPolicy'],
      properties: {
        sourceBookingId: { type: 'string', format: 'uuid' },
        schedule: {
          type: 'object',
          additionalProperties: false,
          required: ['timezone', 'occurrences'],
          properties: {
            timezone: { type: 'string', const: 'Africa/Johannesburg' },
            occurrences: { type: 'array', minItems: 2, maxItems: 104, items: { type: 'string', format: 'date-time' } },
          },
        },
        substitutionPolicy: { type: 'string', enum: ['no_substitution', 'explicit_approval_each_time'] },
      },
    },
    RecurringSeriesActionInput: {
      oneOf: [
        {
          type: 'object', additionalProperties: false, required: ['action'],
          properties: { action: { type: 'string', enum: ['accept_terms', 'pause', 'request_resume', 'accept_resume', 'request_cancel_series', 'accept_cancel_series'] } },
        },
        {
          type: 'object', additionalProperties: false, required: ['action', 'schedule', 'substitutionPolicy'],
          properties: {
            action: { type: 'string', const: 'propose_terms' },
            schedule: {
              type: 'object',
              additionalProperties: false,
              required: ['timezone', 'occurrences'],
              properties: {
                timezone: { type: 'string', const: 'Africa/Johannesburg' },
                occurrences: { type: 'array', minItems: 2, maxItems: 104, items: { type: 'string', format: 'date-time' } },
              },
            },
            substitutionPolicy: { type: 'string', enum: ['no_substitution', 'explicit_approval_each_time'] },
          },
        },
        {
          type: 'object', additionalProperties: false, required: ['action', 'occurrenceId', 'changeKind'],
          properties: {
            action: { type: 'string', const: 'request_occurrence_change' },
            occurrenceId: { type: 'string', format: 'uuid' },
            changeKind: { type: 'string', enum: ['reschedule', 'cancel'] },
            proposedScheduledAt: { type: 'string', format: 'date-time' },
          },
        },
        {
          type: 'object', additionalProperties: false, required: ['action', 'changeRequestId'],
          properties: {
            action: { type: 'string', enum: ['accept_occurrence_change', 'decline_occurrence_change'] },
            changeRequestId: { type: 'string', format: 'uuid' },
          },
        },
      ],
    },
  });

  spec['x-grounded-capabilities'] = {
    booking_details_share: capabilityExtension('booking_details_share'),
    ai_assisted_intake: capabilityExtension('ai_assisted_intake'),
    explainable_recommendations: capabilityExtension('explainable_recommendations'),
    android_live_updates: capabilityExtension('android_live_updates'),
    contextual_safety_education: capabilityExtension('contextual_safety_education'),
    operated_sos: capabilityExtension('operated_sos'),
  };
}

module.exports = { applyGroundedOpenApi };
