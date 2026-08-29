const spec = require('../src/openapi');

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);

function operations() {
  return Object.entries(spec.paths).flatMap(([path, pathItem]) => (
    Object.entries(pathItem)
      .filter(([method]) => METHODS.has(method))
      .map(([method, operation]) => ({ path, method, operation }))
  ));
}

function parameterRefs(operation) {
  return (operation.parameters || []).map((parameter) => parameter.$ref).filter(Boolean);
}

function successResponses(operation) {
  return Object.entries(operation.responses || {})
    .filter(([status]) => /^2\d\d$/.test(status))
    .map(([, response]) => response);
}

function resolveLocalRef(ref) {
  return ref.slice(2).split('/').reduce((value, part) => value?.[part], spec);
}

describe('Grounded Momentum OpenAPI contract', () => {
  test('documents the implemented canonical route groups', () => {
    const requiredPaths = [
      '/auth/registration-policy',
      '/api/capabilities',
      '/api/projects',
      '/api/projects/{id}',
      '/api/projects/{id}/completion-requests',
      '/api/projects/{id}/completion-confirmations',
      '/api/projects/{id}/disputes',
      '/api/projects/{id}/fulfilment',
      '/api/projects/{id}/en-route',
      '/api/projects/{id}/arrivals',
      '/api/projects/{id}/scope-proposals',
      '/api/projects/{id}/scope-confirmations',
      '/api/projects/{id}/start-pin-reveals',
      '/api/projects/{id}/start',
      '/api/projects/{id}/reschedule-proposals',
      '/api/projects/{id}/reschedule-proposals/{proposalId}/accept',
      '/api/projects/{id}/reschedule-proposals/{proposalId}/decline',
      '/api/projects/{id}/change-orders',
      '/api/projects/{id}/change-orders/{changeOrderId}/approve',
      '/api/projects/{id}/change-orders/{changeOrderId}/decline',
      '/api/projects/{id}/no-show-reports',
      '/api/projects/{id}/replacement-requests',
      '/api/catalogue/services',
      '/api/catalogue/services/{id}',
      '/api/quote-requests',
      '/api/quote-requests/{id}',
      '/api/quote-requests/{id}/quotes',
      '/api/quote-requests/{id}/cancel',
      '/api/quotes/{id}',
      '/api/quotes/{id}/submit',
      '/api/quotes/{id}/withdraw',
      '/api/quotes/{id}/decline',
      '/api/quotes/{id}/accept',
      '/api/safety/incidents',
      '/api/safety/incidents/{id}',
      '/api/support/cases',
      '/api/support/cases/{id}',
      '/api/operations/safety-incidents/{id}/acknowledge',
      '/api/operations/safety-incidents/{id}/escalate',
      '/api/operations/safety-incidents/{id}/resolve',
      '/api/favourites',
      '/api/favourites/{workerId}',
      '/api/blocks',
      '/api/bookings/{id}/share-trip',
      '/api/bookings/{id}/relationship-eligibility',
      '/api/bookings/{id}/rebook-drafts',
      '/api/rebook-drafts',
      '/api/rebook-drafts/{id}',
      '/api/recurring-series',
      '/api/recurring-series/{id}',
      '/api/trust/fairness',
      '/api/ratings/booking/{id}/mine',
      '/api/ratings',
      '/api/ratings/labourer/{id}',
      '/api/labourers/{id}/grounded-profile',
      '/api/ratings/user/{userId}',
      '/api/earnings',
      '/api/worker/activation',
      '/api/worker/activation/acknowledgements/{kind}',
      '/api/worker/profile',
      '/api/worker/offerings',
      '/api/worker/offerings/{id}',
      '/api/intent/extract',
      '/api/recommendations/quote-requests/{requestId}/workers/{workerId}/explanation',
      '/api/projects/{projectId}/live-status',
    ];

    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(requiredPaths));
  });

  test('registration advertises the exact current consent envelope and public no-store policy read', () => {
    const policy = spec.paths['/auth/registration-policy'].get;
    const register = spec.paths['/auth/register'].post;
    const body = register.requestBody.content['application/json'].schema;

    expect(policy.security).toEqual([]);
    expect(policy.responses['200'].headers['Cache-Control'].schema.const).toBe('no-store');
    expect(body.required).toContain('policyConsent');
    expect(body.properties.policyConsent.$ref).toBe('#/components/schemas/RegistrationPolicyConsent');
    expect(spec.components.schemas.RegistrationPolicyConsent).toMatchObject({
      additionalProperties: false,
      required: ['revision', 'termsAccepted', 'privacyAccepted'],
    });
    expect(register.responses).toEqual(expect.objectContaining({
      409: expect.any(Object),
      428: expect.any(Object),
      503: expect.any(Object),
    }));
  });

  test('refresh rotation documents the concurrent-loser response without legacy 3.0 nullable keywords', () => {
    const refresh = spec.paths['/auth/refresh'].post;
    const conflict = refresh.responses['409'].content['application/json'].schema;
    const nullableLocations = [];
    const visit = (value, location = '#') => {
      if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${location}/${index}`));
      if (!value || typeof value !== 'object') return;
      if (Object.prototype.hasOwnProperty.call(value, 'nullable')) nullableLocations.push(location);
      Object.entries(value).forEach(([key, item]) => visit(item, `${location}/${key}`));
    };
    visit(spec);

    expect(conflict).toMatchObject({
      required: ['error', 'retryable'],
      properties: {
        error: { const: 'refresh_rotation_already_completed' },
        retryable: { const: false },
      },
    });
    expect(nullableLocations).toEqual([]);
  });

  test('all operationIds are present and unique', () => {
    const ids = operations().map(({ operation, path, method }) => {
      expect(operation.operationId).toEqual(expect.any(String));
      expect(operation.operationId).not.toBe('');
      return operation.operationId;
    });

    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all local component references resolve', () => {
    const refs = [];
    const visit = (value) => {
      if (Array.isArray(value)) return value.forEach(visit);
      if (!value || typeof value !== 'object') return;
      if (typeof value.$ref === 'string' && value.$ref.startsWith('#/')) refs.push(value.$ref);
      Object.values(value).forEach(visit);
    };
    visit(spec);

    for (const ref of refs) {
      expect(resolveLocalRef(ref)).toBeDefined();
    }
  });

  test('Project and fulfilment commands require idempotency plus Project revision and return revision metadata', () => {
    const commandPaths = [
      '/api/projects/{id}/completion-requests',
      '/api/projects/{id}/completion-confirmations',
      '/api/projects/{id}/disputes',
      '/api/projects/{id}/en-route',
      '/api/projects/{id}/arrivals',
      '/api/projects/{id}/scope-proposals',
      '/api/projects/{id}/scope-confirmations',
      '/api/projects/{id}/start-pin-reveals',
      '/api/projects/{id}/start',
      '/api/projects/{id}/reschedule-proposals',
      '/api/projects/{id}/reschedule-proposals/{proposalId}/accept',
      '/api/projects/{id}/reschedule-proposals/{proposalId}/decline',
      '/api/projects/{id}/change-orders',
      '/api/projects/{id}/change-orders/{changeOrderId}/approve',
      '/api/projects/{id}/change-orders/{changeOrderId}/decline',
      '/api/projects/{id}/no-show-reports',
      '/api/projects/{id}/replacement-requests',
    ];

    for (const path of commandPaths) {
      const operation = spec.paths[path].post;
      const idempotencyParameter = [
        '/api/projects/{id}/completion-requests',
        '/api/projects/{id}/completion-confirmations',
        '/api/projects/{id}/disputes',
      ].includes(path)
        ? '#/components/parameters/RequiredIdempotencyKey'
        : '#/components/parameters/RequiredPrintableIdempotencyKey';
      expect(parameterRefs(operation)).toEqual(expect.arrayContaining([
        idempotencyParameter,
        '#/components/parameters/IfMatchProjectRevision',
      ]));
      expect(operation.responses['412']).toBeDefined();
      expect(operation.responses['428']).toBeDefined();
      for (const response of successResponses(operation)) {
        expect(response.headers.ETag).toBeDefined();
        expect(response.headers['Idempotent-Replay']).toBeDefined();
      }
    }
  });

  test('quote commands require idempotency but do not invent If-Match/ETag semantics', () => {
    const commands = [
      ['/api/quote-requests', 'post'],
      ['/api/quote-requests/{id}/quotes', 'post'],
      ['/api/quote-requests/{id}/cancel', 'post'],
      ['/api/quotes/{id}', 'put'],
      ['/api/quotes/{id}/submit', 'post'],
      ['/api/quotes/{id}/withdraw', 'post'],
      ['/api/quotes/{id}/decline', 'post'],
      ['/api/quotes/{id}/accept', 'post'],
    ];

    for (const [path, method] of commands) {
      const operation = spec.paths[path][method];
      expect(parameterRefs(operation)).toContain('#/components/parameters/RequiredIdempotencyKey');
      expect(parameterRefs(operation)).not.toContain('#/components/parameters/IfMatchPositiveRevision');
      expect(parameterRefs(operation)).not.toContain('#/components/parameters/IfMatchProjectRevision');
      for (const response of successResponses(operation)) {
        expect(response.headers?.ETag).toBeUndefined();
      }
    }
  });

  test('revisioned trust and Worker mutations require positive If-Match and advertise ETag/replay headers', () => {
    const commands = [
      ['/api/rebook-drafts/{id}', 'patch', 'IfMatchPositiveRevision'],
      ['/api/recurring-series/{id}', 'patch', 'IfMatchPositiveRevision'],
      ['/api/worker/activation/acknowledgements/{kind}', 'put', 'IfMatchAcknowledgementRevision'],
      ['/api/worker/profile', 'patch', 'IfMatchPositiveRevision'],
      ['/api/worker/offerings', 'post', 'IfMatchCatalogueVersion'],
      ['/api/worker/offerings/{id}', 'patch', 'IfMatchPositiveRevision'],
    ];

    for (const [path, method, ifMatchParameter] of commands) {
      const operation = spec.paths[path][method];
      expect(parameterRefs(operation)).toEqual(expect.arrayContaining([
        '#/components/parameters/RequiredIdempotencyKey',
        `#/components/parameters/${ifMatchParameter}`,
      ]));
      expect(operation.responses['412']).toBeDefined();
      expect(operation.responses['428']).toBeDefined();
      for (const response of successResponses(operation)) {
        expect(response.headers.ETag).toBeDefined();
        expect(response.headers['Idempotent-Replay']).toBeDefined();
      }
    }
  });

  test('safe booking sharing is participant-only, static and incapable of public/live disclosure', () => {
    const operation = spec.paths['/api/bookings/{id}/share-trip'].post;
    const response = resolveLocalRef(operation.responses['200'].content['application/json'].schema.$ref);
    const unavailable = resolveLocalRef(operation.responses['503'].content['application/json'].schema.$ref);

    expect(operation['x-capability']).toEqual({ name: 'booking_details_share', available: true });
    expect(response.required).toEqual(expect.arrayContaining([
      'bookingDetailsShare', 'preview', 'shareText', 'live_tracking', 'public_link',
    ]));
    expect(response.properties.bookingDetailsShare.properties).toMatchObject({
      available: { const: true },
      mode: { const: 'non_live_no_address' },
    });
    expect(response.properties.preview.required).toEqual([
      'projectReference', 'serviceLabel', 'broadAreaLabel', 'scheduleLabel', 'statusLabel',
    ]);
    expect(response.properties.live_tracking.const).toBe(false);
    expect(response.properties.public_link).toMatchObject({ type: 'null', const: null });
    expect(unavailable.properties.capability.type).toBe('string');
    expect(operation.responses['401']).toBeDefined();
    expect(operation.responses['403']).toBeDefined();
    expect(operation.responses['404']).toBeDefined();
  });

  test('Trust fairness stays two-sided evidence-only with no composite restriction claim', () => {
    const operation = spec.paths['/api/trust/fairness'].get;
    const schema = resolveLocalRef(operation.responses['200'].content['application/json'].schema.$ref);
    const evidence = resolveLocalRef(schema.properties.fairness.properties.evidence.items.$ref);
    const restriction = schema.properties.fairness.properties.restriction;

    expect(schema.properties.schema.const).toBe('togt.trust.v1');
    expect(schema.description).toMatch(/no composite score/i);
    expect(schema.properties.fairness.properties.evidence).toMatchObject({ minItems: 4, maxItems: 4 });
    expect(evidence.properties.id.enum).toEqual([
      'completed-projects', 'participant-ratings', 'actor-cancellations', 'no-show-records',
    ]);
    expect(restriction.properties.status.const).toBe('none');
    expect(restriction.properties.reasonCode).toMatchObject({ type: 'null', const: null });
    expect(restriction.properties.humanReview.properties).toMatchObject({
      available: { const: true },
      channel: { const: 'in_app_record' },
    });
    expect(operation.responses['401']).toBeDefined();
  });

  test('double-blind rating reads/submission document exact states, privacy and replay semantics', () => {
    const own = spec.paths['/api/ratings/booking/{id}/mine'].get;
    const submit = spec.paths['/api/ratings'].post;
    const publicList = spec.paths['/api/ratings/labourer/{id}'].get;
    const privateHistory = spec.paths['/api/ratings/user/{userId}'].get;
    const envelope = resolveLocalRef(own.responses['200'].content['application/json'].schema.$ref);
    const rating = resolveLocalRef(envelope.properties.rating.$ref);

    expect(rating.properties.state.enum).toEqual([
      'not_open', 'open', 'window_closed', 'sealed', 'published',
    ]);
    expect(rating.description).toMatch(/sealed score is never exposed/i);
    expect(parameterRefs(submit)).toEqual(['#/components/parameters/RequiredRatingIdempotencyKey']);
    expect(submit.description).toMatch(/different valid key/i);
    expect(submit.responses['200'].headers['Idempotent-Replay']).toBeDefined();
    expect(submit.responses['201'].headers?.['Idempotent-Replay']).toBeUndefined();
    expect(submit.responses['409']).toBeDefined();
    expect(submit.responses['422']).toBeDefined();
    expect(publicList.security).toEqual([]);
    expect(publicList.description).toMatch(/sealed ratings are excluded/i);
    expect(publicList.description).toMatch(/no avatar/i);
    expect(publicList.responses['404']).toBeDefined();
    expect(spec.components.schemas.DoubleBlindRatingInput.properties.comment.description).toMatch(/phone numbers/i);
    expect(spec.components.schemas.PublishedRating.properties.reviewer_avatar).toBeUndefined();
    expect(spec.components.schemas.PrivateReceivedRating.properties.reviewer_avatar).toBeUndefined();
    expect(privateHistory.responses['403']).toBeDefined();
  });

  test('Grounded Worker profile documents authenticated eligible-only anonymous public evidence', () => {
    const operation = spec.paths['/api/labourers/{id}/grounded-profile'].get;
    const envelope = resolveLocalRef(
      operation.responses['200'].content['application/json'].schema.$ref
    );
    const profile = resolveLocalRef(envelope.properties.profile.$ref);
    const offering = resolveLocalRef(profile.properties.offerings.items.$ref);
    const review = resolveLocalRef(profile.properties.reviews.items.$ref);
    const serializedContract = JSON.stringify({ operation, envelope, profile, offering, review });

    expect(operation.security).toBeUndefined();
    expect(operation.description).toMatch(/authenticated customer and labourer/i);
    expect(operation.description).toMatch(/active offerings that are currently eligible/i);
    expect(operation.description).toMatch(/published anonymous reviews/i);
    expect(operation.responses).toEqual(expect.objectContaining({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      404: expect.any(Object),
    }));
    expect(envelope).toMatchObject({
      additionalProperties: false,
      required: ['schema', 'profile'],
      properties: { schema: { const: 'togt.grounded-worker-public-profile.v1' } },
    });
    expect(profile.required).toEqual(expect.arrayContaining([
      'publicBadges', 'offerings', 'reviews', 'completedJobs', 'currentlyAvailable',
    ]));
    expect(profile.description).toMatch(/contact-bearing legacy display\/about\/bio text is quarantined/i);
    expect(offering.description).toMatch(/passed the current canonical catalogue/i);
    expect(offering.description).toMatch(/contact-bearing legacy offerings/i);
    expect(review.description).toMatch(/no reviewer name, avatar, account identifier/i);
    expect(review.additionalProperties).toBe(false);
    expect(review.properties).not.toHaveProperty('reviewer_name');
    expect(review.properties).not.toHaveProperty('reviewerId');
    expect(review.properties).not.toHaveProperty('reviewerAvatar');
    for (const privateName of [
      'eligibility', 'credentialEvidence', 'fixedWorkerNet', 'activation',
      'email', 'phone', 'coordinates', 'current_lat', 'current_lng',
    ]) {
      expect(serializedContract).not.toContain(`\"${privateName}\"`);
    }
  });

  test('recurring series exposes requester roles only in their corresponding pending state', () => {
    const schema = spec.components.schemas.RecurringSeries;
    const pending = schema.properties.pendingRequests;
    const conditions = JSON.stringify(schema.allOf);

    expect(schema.required).toContain('pendingRequests');
    expect(schema.properties.status.enum).toEqual(expect.arrayContaining([
      'resume_requested', 'cancellation_requested', 'active', 'cancelled', 'blocked',
    ]));
    expect(pending).toMatchObject({
      additionalProperties: false,
      required: ['resumeRequestedByRole', 'cancellationRequestedByRole'],
    });
    expect(pending.properties.resumeRequestedByRole.enum).toEqual(['customer', 'worker', null]);
    expect(pending.properties.cancellationRequestedByRole.enum).toEqual(['customer', 'worker', null]);
    expect(conditions).toContain('resume_requested');
    expect(conditions).toContain('cancellation_requested');
    expect(conditions).toContain('"type":"null"');
  });

  test('Worker earnings documents append-only paid-Project evidence with every payout claim disabled', () => {
    const operation = spec.paths['/api/earnings'].get;
    const response = resolveLocalRef(operation.responses['200'].content['application/json'].schema.$ref);
    const ledger = resolveLocalRef(response.properties.worker_payable_ledger.$ref);
    const capabilities = ledger.properties.capabilities.properties;
    const semantics = response.properties.semantics.properties;

    expect(operation.description).toMatch(/not Worker gross\/net/i);
    expect(parameterRefs(operation)).toEqual([]);
    expect(operation.responses['200'].headers['Cache-Control'].schema.const).toBe('private, no-store');
    expect(operation.responses['200'].headers.ETag).toBeUndefined();
    expect(ledger.properties.schema.const).toBe('togt.worker-payable-ledger.v1');
    expect(ledger.properties.definition.const).toBe('completed_reconciled_paid_project_value_not_worker_net_v1');
    expect(ledger.description).toMatch(/not Worker gross\/net, balance, beneficiary or payout/i);
    for (const name of ['workerGross', 'platformFee', 'workerNet', 'availableBalance', 'payout']) {
      expect(capabilities[name].const).toBe(false);
    }
    expect(semantics.worker_gross_supported.const).toBe(false);
    expect(semantics.platform_fee_supported.const).toBe(false);
    expect(semantics.worker_net_supported.const).toBe(false);
    expect(semantics.available_balance_supported.const).toBe(false);
    expect(semantics.payout_supported.const).toBe(false);
    expect(operation.responses['401']).toBeDefined();
    expect(operation.responses['403']).toBeDefined();
  });

  test('durable matcher remains an internal scheduling change with no public schema expansion', () => {
    const match = spec.components.schemas.MatchRequest;
    const attempt = spec.paths['/api/match/{id}'].get.responses['200']
      .content['application/json'].schema.properties.attempts.items;
    const privateDispatchFields = [
      'dispatch_next_at', 'dispatch_lease_id', 'dispatch_lease_expires_at',
      'dispatch_claim_count', 'dispatch_attempt_count', 'dispatch_last_error',
      'offer_expires_at', 'dispatched_at',
    ];

    for (const field of privateDispatchFields) {
      expect(match.properties[field]).toBeUndefined();
      expect(attempt.properties[field]).toBeUndefined();
    }
    expect(spec.paths['/api/match'].post.operationId).toBe('create_match_request');
    expect(spec.paths['/api/match/{id}/accept'].post.operationId).toBe('accept_match');
  });

  test('public catalogue is unauthenticated and explicitly excludes Worker availability', () => {
    const list = spec.paths['/api/catalogue/services'].get;
    const detail = spec.paths['/api/catalogue/services/{id}'].get;

    expect(list.security).toEqual([]);
    expect(detail.security).toEqual([]);
    expect(list.description).toContain('availability as not_included');
    expect(spec.components.schemas.CatalogueService.description).toContain('not part of this resource');
  });

  test('feature-gated intelligence and operated safety remain truthfully disabled', () => {
    const gated = [
      ['/api/intent/extract', 'post', 'ai_assisted_intake'],
      ['/api/recommendations/quote-requests/{requestId}/workers/{workerId}/explanation', 'get', 'explainable_recommendations'],
      ['/api/projects/{projectId}/live-status', 'get', 'android_live_updates'],
      ['/api/operations/safety-incidents/{id}/acknowledge', 'post', 'operated_sos'],
      ['/api/operations/safety-incidents/{id}/escalate', 'post', 'operated_sos'],
      ['/api/operations/safety-incidents/{id}/resolve', 'post', 'operated_sos'],
    ];

    for (const [path, method, capability] of gated) {
      const operation = spec.paths[path][method];
      expect(operation['x-capability']).toMatchObject({ name: capability, available: false });
      expect(operation.responses['503']).toBeDefined();
    }

    expect(spec.components.schemas.WorkerServicesProfile.properties.capabilities.description)
      .toContain('payoutAccount');
    expect(spec.paths['/api/worker/payouts']).toBeUndefined();
    expect(spec.paths['/api/worker/payout-account']).toBeUndefined();
    expect(spec.paths['/api/operations/payouts/{id}/retry-or-hold']).toBeUndefined();
  });

  test('live-status and Project reads advertise their implemented ETags', () => {
    expect(spec.paths['/api/projects/{id}'].get.responses['200'].headers.ETag).toBeDefined();
    expect(spec.paths['/api/projects/{id}/fulfilment'].get.responses['200'].headers.ETag).toBeDefined();
    expect(spec.paths['/api/projects/{projectId}/live-status'].get.responses['200'].headers.ETag).toBeDefined();
  });
});
