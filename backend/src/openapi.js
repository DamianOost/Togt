/**
 * OpenAPI 3.1 specification for the Togt API.
 *
 * Served at:
 *   - /.well-known/openapi.json   (RFC 5785 well-known location, agent discoverable)
 *   - /openapi.json               (convenience alias)
 *
 * Hand-curated rather than auto-generated so that:
 *   - operationIds are agent-meaningful (find_labourers not postLaboureresList)
 *   - error response examples reference RFC 9457 problem+json types
 *   - enum values are exhaustive
 *   - descriptions explain *why* an operation exists, not just *what* it does
 */

const TYPE_BASE = process.env.API_PUBLIC_BASE_URL || 'https://api.togt.co.za';
const PUBLIC_HOST = process.env.API_PUBLIC_HOST || 'http://localhost:3002';

const problemJsonSchema = {
  type: 'object',
  description: 'RFC 9457 problem+json error envelope.',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string', format: 'uri', description: 'Stable URI identifying the error class. Pattern-match on this, not on title.' },
    title: { type: 'string', description: 'Short human-readable summary.' },
    status: { type: 'integer', description: 'HTTP status code, repeated for client convenience.' },
    detail: { type: 'string', description: 'Specifics of THIS occurrence — values, constraints, hints.' },
    instance: { type: 'string', description: 'Path of the request that produced the error.' },
    extensions: { type: 'object', additionalProperties: true, description: 'Domain-specific machine-readable fields.' },
    error: { type: 'string', description: 'Backwards-compat: same as title.' },
  },
};

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Togt API',
    version: '1.0.0',
    summary: 'Uber-for-day-labourers — South Africa.',
    description: [
      'Two-sided marketplace API. Customers create match requests; the dispatcher pings nearby',
      'verified labourers in priority order; the first to accept is bound to a booking.',
      '',
      '## Conventions for agent integrations',
      '- All errors are RFC 9457 problem+json with stable `type` URIs at `' + TYPE_BASE + '/errors/<slug>`.',
      '- Mutating endpoints accept an `Idempotency-Key` header (UUID v4 recommended). Retries with the same key + body return the cached response with `Idempotent-Replay: true`.',
      '- Cancellation of an already-cancelled booking is a no-op (terminal-state idempotence).',
      '- Auth: Bearer JWT issued by `/auth/login` or `/auth/register`. Tokens rotate on refresh.',
      '- For agent integrations, prefer the MCP server at `/mcp` — it wraps these endpoints with stable tool semantics.',
    ].join('\n'),
    contact: { name: 'Damian Oosthuyzen', email: 'damianoost@gmail.com' },
    license: { name: 'Proprietary' },
  },
  servers: [
    { url: PUBLIC_HOST, description: 'Local / dev' },
    { url: 'https://api.togt.co.za', description: 'Production (TBD)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        description: 'UUID v4. Same key + same body returns the cached response (24h TTL).',
        schema: { type: 'string', minLength: 8, maxLength: 255 },
      },
    },
    schemas: {
      Problem: problemJsonSchema,
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['customer', 'labourer'] },
          avatar_url: { type: 'string', nullable: true },
          kyc_status: { type: 'string', enum: ['unverified', 'pending', 'verified', 'failed'] },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      AuthTokens: {
        type: 'object',
        required: ['user', 'accessToken', 'refreshToken'],
        properties: {
          user: { $ref: '#/components/schemas/User' },
          accessToken: { type: 'string', description: 'JWT, 15-minute TTL.' },
          refreshToken: { type: 'string', description: 'JWT, 7-day TTL, rotates on use.' },
        },
      },
      LabourerCandidate: {
        type: 'object',
        properties: {
          user_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          hourly_rate: { type: 'number' },
          rating_avg: { type: 'number' },
          current_lat: { type: 'number' },
          current_lng: { type: 'number' },
          distance_km: { type: 'number' },
        },
      },
      MatchRequest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          customer_id: { type: 'string', format: 'uuid' },
          skill_needed: { type: 'string' },
          address: { type: 'string' },
          location_lat: { type: 'number' },
          location_lng: { type: 'number' },
          scheduled_at: { type: 'string', format: 'date-time' },
          hours_est: { type: 'number', nullable: true },
          notes: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['pending', 'matched', 'expired', 'cancelled'] },
          expire_reason: { type: 'string', nullable: true, description: 'no_candidates | all_declined | all_timeout | server_restart | error' },
          matched_booking_id: { type: 'string', format: 'uuid', nullable: true },
          matched_labourer_id: { type: 'string', format: 'uuid', nullable: true },
          matched_at: { type: 'string', format: 'date-time', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
          expires_at: { type: 'string', format: 'date-time' },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          customer_id: { type: 'string', format: 'uuid' },
          labourer_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'] },
          skill_needed: { type: 'string' },
          address: { type: 'string' },
          location_lat: { type: 'number' },
          location_lng: { type: 'number' },
          scheduled_at: { type: 'string', format: 'date-time' },
          hours_est: { type: 'number', nullable: true },
          total_amount: { type: 'string', nullable: true, description: 'Decimal as string (NUMERIC(10,2)).' },
          notes: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
    },
    responses: {
      Problem400: { description: 'Bad request', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Problem401: { description: 'Unauthorized', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Problem403: { description: 'Forbidden', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Problem404: { description: 'Not found', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Problem409: { description: 'Conflict', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Problem422: { description: 'Unprocessable entity', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
      Problem429: { description: 'Rate limited. Retry after Retry-After seconds.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        operationId: 'health_check',
        summary: 'Liveness probe',
        security: [],
        responses: {
          '200': {
            description: 'Service is up.',
            content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ok'] } } } } },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        operationId: 'register_user',
        summary: 'Register a new customer or labourer.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'phone', 'password', 'role'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  phone: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                  role: { type: 'string', enum: ['customer', 'labourer'] },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          '400': { $ref: '#/components/responses/Problem400' },
          '409': { $ref: '#/components/responses/Problem409' },
          '429': { $ref: '#/components/responses/Problem429' },
        },
      },
    },
    '/auth/login': {
      post: {
        operationId: 'login',
        summary: 'Exchange email + password for an access + refresh token pair.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          '400': { $ref: '#/components/responses/Problem400' },
          '401': { $ref: '#/components/responses/Problem401' },
          '429': { $ref: '#/components/responses/Problem429' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        operationId: 'refresh_tokens',
        summary: 'Rotate access + refresh token. Old refresh token is revoked.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthTokens' } } } },
          '401': { $ref: '#/components/responses/Problem401' },
        },
      },
    },
    '/auth/logout': {
      post: {
        operationId: 'logout',
        summary: 'Revoke the supplied refresh token AND clear push_token. Requires bearer auth.',
        requestBody: { required: false, content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          '401': { $ref: '#/components/responses/Problem401' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        operationId: 'forgot_password',
        summary: 'Send a 6-digit reset code to the user\'s email if it exists. Always returns 200 (no account leak).',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: {
          '200': { description: 'OK regardless of whether the email exists.', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          '400': { $ref: '#/components/responses/Problem400' },
          '429': { $ref: '#/components/responses/Problem429' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        operationId: 'reset_password',
        summary: 'Verify the 6-digit code from forgot-password and set a new password. Revokes all sessions.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'code', 'new_password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  code: { type: 'string', pattern: '^\\d{6}$' },
                  new_password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
          '400': { $ref: '#/components/responses/Problem400' },
          '429': { $ref: '#/components/responses/Problem429' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        operationId: 'get_current_user',
        summary: 'Return the authenticated user (incl. kyc_status).',
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/User' } } } } } },
          '401': { $ref: '#/components/responses/Problem401' },
        },
      },
    },
    '/api/match': {
      post: {
        operationId: 'create_match_request',
        summary: 'Customer requests an auto-match. Dispatcher pings candidate labourers in priority order.',
        description: 'The first eligible labourer to accept produces a real bookings row. If all decline or time out, the match expires.',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['skill_needed', 'address', 'location_lat', 'location_lng', 'scheduled_at'],
                properties: {
                  skill_needed: { type: 'string', description: 'Free-text skill, e.g. "Plumbing", "Electrical".' },
                  address: { type: 'string' },
                  location_lat: { type: 'number' },
                  location_lng: { type: 'number' },
                  scheduled_at: { type: 'string', format: 'date-time', description: 'Must be in the future.' },
                  hours_est: { type: 'number' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Match created and dispatching.', content: { 'application/json': { schema: { type: 'object', properties: { match: { $ref: '#/components/schemas/MatchRequest' } } } } } },
          '400': { $ref: '#/components/responses/Problem400' },
          '401': { $ref: '#/components/responses/Problem401' },
          '403': { $ref: '#/components/responses/Problem403' },
          '422': { $ref: '#/components/responses/Problem422' },
          '429': { $ref: '#/components/responses/Problem429' },
        },
      },
    },
    '/api/match/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: {
        operationId: 'get_match_request',
        summary: 'Read a match request and its attempts. Customer or any pinged labourer can read.',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    match: { $ref: '#/components/schemas/MatchRequest' },
                    attempts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, labourer_id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['pinged', 'accepted', 'declined', 'timeout', 'cancelled'] }, pinged_at: { type: 'string', format: 'date-time' }, responded_at: { type: 'string', format: 'date-time', nullable: true } } } },
                  },
                },
              },
            },
          },
          '403': { $ref: '#/components/responses/Problem403' },
          '404': { $ref: '#/components/responses/Problem404' },
        },
      },
    },
    '/api/match/{id}/accept': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        operationId: 'accept_match',
        summary: 'Labourer accepts an active ping. Creates a real bookings row atomically. Other competing attempts are cancelled.',
        responses: {
          '200': { description: 'Booking created.', content: { 'application/json': { schema: { type: 'object', properties: { booking: { $ref: '#/components/schemas/Booking' } } } } } },
          '403': { $ref: '#/components/responses/Problem403' },
          '409': { $ref: '#/components/responses/Problem409' },
        },
      },
    },
    '/api/match/{id}/decline': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        operationId: 'decline_match',
        summary: 'Labourer declines an active ping. Dispatcher cascades to next candidate.',
        responses: {
          '200': { description: 'Decline recorded.' },
          '404': { $ref: '#/components/responses/Problem404' },
        },
      },
    },
    '/api/match/{id}/cancel': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      post: {
        operationId: 'cancel_match',
        summary: 'Customer cancels a pending match. Returns 409 already_matched if a labourer accepted before the cancel landed.',
        responses: {
          '200': { description: 'Cancelled.' },
          '404': { $ref: '#/components/responses/Problem404' },
          '409': { description: 'Already matched — cancel the booking instead.', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } },
        },
      },
    },
    '/api/kyc/verify-id': {
      post: {
        operationId: 'verify_id',
        summary: 'Verify an SA ID number. Structural pre-check, then VerifyNow real DHA call when configured.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idNumber', 'firstName', 'lastName'],
                properties: {
                  idNumber: { type: 'string', pattern: '^\\d{13}$' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Verified.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    verified: { type: 'boolean' },
                    provider: { type: 'string', enum: ['poc_structural', 'verifynow'] },
                    poc_mode: { type: 'boolean' },
                    name: { type: 'string' },
                    dob: { type: 'string', format: 'date' },
                    parsed_is_male: { type: 'boolean' },
                    parsed_is_citizen: { type: 'boolean' },
                    vendor: { type: 'object', nullable: true, properties: { request_id: { type: 'string' }, smart_card: { type: 'boolean' }, on_hanis: { type: 'boolean' }, on_npr: { type: 'boolean' }, marital_status: { type: 'string' } } },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Validation failed (id_invalid_format, id_invalid_checksum, id_underage, id_not_in_npr).',
            content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } },
          },
        },
      },
    },
  },
  'x-error-types': [
    { type: 'scheduled_at_in_past', status: 400, description: 'Booking scheduled_at is at or before now.' },
    { type: 'scheduled_at_invalid', status: 400, description: 'scheduled_at is not a valid ISO-8601 datetime.' },
    { type: 'id_invalid_format', status: 400, description: 'SA ID number must be 13 digits.' },
    { type: 'id_invalid_checksum', status: 400, description: 'SA ID Luhn mod-10 checksum failed.' },
    { type: 'id_underage', status: 400, description: 'SA ID parsed DOB places user under 18.' },
    { type: 'id_not_in_npr', status: 400, description: 'VerifyNow says the SA ID is not in the National Population Register.' },
    { type: 'idempotency_key_invalid', status: 400, description: 'Idempotency-Key length must be 8-255 chars.' },
    { type: 'idempotency_key_reused', status: 422, description: 'Same Idempotency-Key was previously used with a different request body.' },
    { type: 'already_matched', status: 409, description: 'Match already produced a booking; cancel the booking instead.' },
    { type: 'attempt_not_active', status: 409, description: 'Labourer tried to accept an attempt that was already cancelled or timed out.' },
    { type: 'refresh_token_reuse', status: 401, description: 'Replay detection — supplied refresh token was already revoked. All sessions terminated.' },
  ],
};

module.exports = spec;
