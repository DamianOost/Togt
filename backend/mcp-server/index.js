#!/usr/bin/env node
/**
 * Togt MCP server (stdio transport).
 *
 * First Uber-for-labourers in SA with a published MCP server. An AI agent
 * (Claude Desktop, Claude Code, any MCP client) can:
 *   - find labourers by skill + location
 *   - estimate cost before committing
 *   - create / get / cancel a match request
 *   - list bookings
 *
 * Auth model (POC): TOGT_USER_ID env var. The MCP server acts on behalf of
 * that user. For production / multi-customer use, swap to TOGT_API_KEY and
 * look up the user_id from a hashed-api-keys table.
 *
 * Claude Desktop config:
 *   "mcpServers": {
 *     "togt": {
 *       "command": "node",
 *       "args": ["/Users/georgeoosthuyzen/.openclaw/workspace/Togt/backend/mcp-server/index.js"],
 *       "env": {
 *         "TOGT_USER_ID": "<your customer uuid>",
 *         "DATABASE_URL": "postgresql://georgeoosthuyzen@localhost/togt"
 *       }
 *     }
 *   }
 *
 * Run standalone: TOGT_USER_ID=... DATABASE_URL=... node mcp-server/index.js
 */

const path = require('path');

// Load env from backend/.env when running directly (so Claude Desktop config
// only needs TOGT_USER_ID; everything else comes from .env).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const db = require('../src/config/db');
const { listTools, callTool } = require('./tools');

const USER_ID = process.env.TOGT_USER_ID;
if (!USER_ID) {
  console.error('FATAL: TOGT_USER_ID env var not set. The MCP server needs to know which Togt user it acts on behalf of.');
  process.exit(1);
}

async function loadUser() {
  const r = await db.query('SELECT id, name, role, kyc_status FROM users WHERE id = $1', [USER_ID]);
  if (r.rows.length === 0) {
    throw new Error(`Togt user ${USER_ID} not found in database.`);
  }
  return r.rows[0];
}

// Tool catalog now lives in ./tools.js


async function main() {
  const user = await loadUser();
  console.error(`[mcp] starting for user ${user.name} (${user.role})`);

  const server = new Server(
    { name: 'togt-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  // Local stdio runs as the user identified by TOGT_USER_ID with full admin scope.
  const ctx = { userId: USER_ID, scopes: ['admin:full'] };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listTools(ctx) }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      const result = await callTool(ctx, name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: err.message || String(err) }] };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] connected on stdio');
}

main().catch((err) => {
  console.error('[mcp] fatal:', err.stack || err);
  process.exit(1);
});
