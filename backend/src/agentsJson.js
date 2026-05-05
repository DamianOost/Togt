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
      ],
      status: 'planned',
    },
  ],
  capabilities: {
    idempotency: true,
    error_format: 'rfc-9457',
    webhooks: false,
    rate_limited: true,
  },
};
