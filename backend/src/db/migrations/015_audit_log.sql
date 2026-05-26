-- 015_audit_log.sql
-- Audit log primitive — captures every privileged action so the
-- marketplace is auditable by agents and operators alike.
--
-- This is the SECOND downstream consumer of the agent-native plumbing
-- (the FIRST was webhooks). Webhooks are about outbound notification;
-- audit_log is about inward observability — every MCP tool call, every
-- mutating route, every webhook delivery attempt, with enough context
-- for a later audit_log_query MCP tool to answer "what did agent X do
-- and what was the outcome?"
--
-- Per Memo 2 of the 2026-05-05 introspection memos:
--   "The marketplace won't trust me if it can't audit me."
--
-- Design notes:
--   - actor_type is the discriminator for which of (actor_user_id,
--     api_key_id) is meaningful. Both can be null for 'system' events
--     (e.g. dispatcher delivery attempts triggered by setInterval).
--   - resource_type/resource_id are optional — auth events and read-only
--     queries don't always have a resource. Indexed so resource-history
--     lookup ("what happened to booking X?") is cheap.
--   - metadata JSONB is the open extension point. Routes can stuff
--     request body summaries, MCP can stuff tool args/results, the
--     dispatcher can stuff retry counts. Keep PII out — sanitise at
--     write time, not at query time.
--   - error_code is only set when the action failed. Partial index makes
--     "show me recent failures" cheap without scanning the whole table.
--   - ON DELETE SET NULL preserves audit rows when users/api_keys are
--     deleted — the whole point of audit log is that it survives.
--
-- Retention: not enforced by this migration. A future maintenance sweep
-- will trim rows older than the org's retention policy (TBD with Damian).

CREATE TABLE IF NOT EXISTS audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_type        TEXT NOT NULL,
  actor_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  api_key_id        UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,
  resource_type     TEXT,
  resource_id       UUID,
  request_id        UUID,
  ip                INET,
  status_code       INTEGER,
  latency_ms        INTEGER,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_code        TEXT,
  CONSTRAINT audit_log_actor_type_chk
    CHECK (actor_type IN ('user', 'api_key', 'system')),
  CONSTRAINT audit_log_actor_consistency_chk
    CHECK (
      (actor_type = 'user'    AND actor_user_id IS NOT NULL) OR
      (actor_type = 'api_key' AND api_key_id    IS NOT NULL) OR
      (actor_type = 'system')
    )
);

-- Agent timeline: "show me what api_key X did, newest first".
-- Heavily used by the audit_log_query MCP tool. Partial index excludes
-- system events from this index since they don't have an api_key_id.
CREATE INDEX IF NOT EXISTS idx_audit_log_api_key_time
  ON audit_log(api_key_id, occurred_at DESC)
  WHERE api_key_id IS NOT NULL;

-- User timeline: "show me what user X did via any auth method".
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_time
  ON audit_log(actor_user_id, occurred_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- Resource history: "what happened to booking 123?" — composite covers
-- the common (resource_type, resource_id) probe + occurred_at sort.
CREATE INDEX IF NOT EXISTS idx_audit_log_resource_time
  ON audit_log(resource_type, resource_id, occurred_at DESC)
  WHERE resource_id IS NOT NULL;

-- Action analytics: "how often is create_match_request called per hour?"
CREATE INDEX IF NOT EXISTS idx_audit_log_action_time
  ON audit_log(action, occurred_at DESC);

-- Recent failures scan: cheap "show me errors in the last hour" without
-- touching the bulk of (successful) rows. Partial on error_code.
CREATE INDEX IF NOT EXISTS idx_audit_log_errors
  ON audit_log(occurred_at DESC)
  WHERE error_code IS NOT NULL;

-- Ad-hoc JSONB queries on metadata (rare, but useful for incident
-- response). GIN is the right choice for jsonb @> containment.
CREATE INDEX IF NOT EXISTS idx_audit_log_metadata
  ON audit_log USING GIN (metadata);
