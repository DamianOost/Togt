/**
 * HTTP MCP transport, mounted on Express at POST /mcp.
 *
 * Auth: Bearer togt_live_<key> via apiKeyMiddleware. The API key tells us
 * who the caller is (user_id) and what they can do (scopes). A new MCP
 * Server instance + StreamableHTTPServerTransport (stateless) is created
 * per request — keeps things simple and lock-free at this scale.
 *
 * Tools: listTools / callTool from mcp-server/tools.js. Same set the stdio
 * server uses, but scoped to whatever the API key allows.
 */

const express = require('express');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const { apiKeyMiddleware } = require('../src/lib/apiKey');
const { listTools, callTool } = require('./tools');

const router = express.Router();

router.post('/', apiKeyMiddleware({ requiredScope: 'mcp:read_only' }), async (req, res) => {
  const ctx = { userId: req.user.id, scopes: req.apiKey.scopes };

  const server = new Server(
    { name: 'togt-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listTools(ctx),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (mcpReq) => {
    const { name, arguments: args } = mcpReq.params;
    try {
      const result = await callTool(ctx, name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message || String(err) }] };
    }
  });

  // Stateless transport — each HTTP request is a self-contained MCP exchange.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// GET /mcp — convenience: tells callers how to use the endpoint.
router.get('/', (req, res) => {
  res.json({
    name: 'Togt MCP',
    version: '0.1.0',
    transport: 'streamable-http',
    auth: 'Authorization: Bearer togt_live_<your-key>',
    docs: '/.well-known/openapi.json',
    note: 'POST JSON-RPC 2.0 messages here. See https://modelcontextprotocol.io',
  });
});

module.exports = router;
