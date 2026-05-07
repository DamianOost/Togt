/**
 * /.well-known/agents.json
 *
 * Lightweight pointer file for AI agents. Tells an agent what interaction
 * modalities are available so it can pick the most appropriate (REST OpenAPI,
 * MCP, A2A) without trial-and-error probing.
 */

module.exports = {
  schema_version: '0.1',
  service: {
    name: 'Togt',
    description: 'Uber-for-day-labourers, South Africa.',
    contact: 'damianoost@gmail.com',
  },
  interfaces: [
    {
      type: 'rest+openapi',
      openapi_url: '/.well-known/openapi.json',
      auth: 'bearer',
    },
    {
      type: 'mcp',
      url: '/mcp',
      transport: 'http',
      auth: 'bearer',
      tools: [
        'find_labourers',
        'estimate_booking_cost',
        'create_match_request',
        'get_match_request',
        'cancel_match_request',
        'list_my_bookings',
        'get_booking',
        'marketplace_stats',
        'create_webhook_subscription',
        'list_webhook_subscriptions',
        'delete_webhook_subscription',
        'rotate_webhook_secret',
        'replay_webhook_delivery',
      ],
      status: 'available',
    },
  ],
  capabilities: {
    idempotency: true,
    error_format: 'rfc-9457',
    webhooks: true,
    rate_limited: true,
  },
  webhooks: {
    signature_header: 'X-Togt-Signature',
    signature_format: 't=<unix_seconds>,v1=<hmac_sha256_hex>[,v1=<hmac_sha256_hex>]',
    signature_format_note: 'Multi-v1 entries appear during the 24h secret-rotation grace window. Verify any matching v1 — if any matches, the signature is valid.',
    event_id_header: 'X-Togt-Event-Id',
    event_type_header: 'X-Togt-Event-Type',
    delivery_attempt_header: 'X-Togt-Delivery-Attempt',
    retry_policy: {
      schedule_seconds: [30, 120, 600, 3600],
      after_schedule_continues_at_seconds: 3600,
      dead_after_seconds: 86400,
    },
    rotation_supported: true,
    grace_window_hours: 24,
    event_types: [
      'booking.created',
      'booking.accepted',
      'booking.matched',
      'booking.in_progress',
      'booking.completed',
      'booking.cancelled',
      'match_request.created',
      'match_request.matched',
      'match_request.expired',
      'match_request.cancelled',
      'payment.succeeded',
      'payment.failed',
    ],
    envelope_schema: '/.well-known/openapi.json#/components/schemas/WebhookEventEnvelope',
  },
};
