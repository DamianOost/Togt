-- Scoped API keys (Stripe-style: togt_live_<32 random chars>).
-- The full key is shown to the user ONCE on creation. We store only:
--   - sha256 hash for lookup on every request
--   - first 12 chars (prefix) for display in the dashboard
--
-- Scopes are an array of strings. Current scope vocabulary:
--   mcp:full        — full MCP toolset (find_labourers, create_match, etc)
--   mcp:read_only   — only read tools (find_labourers, get_*, list_*)
--   admin:full      — admin tools (admin_stats, force_expire_match)

CREATE TABLE IF NOT EXISTS api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash      TEXT NOT NULL UNIQUE,
  prefix        TEXT NOT NULL,                 -- first 12 chars for display
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
