-- 014_webhooks.sql
-- Webhook v1: subscriptions + deliveries with secret-at-rest encryption,
-- per-subscription secret rotation (24h grace), and a transactional-outbox
-- pattern (deliveries inserted in the same tx as the resource mutation
-- via emitEvent in services/events.js).

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_key_id                  UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  url                         TEXT NOT NULL,
  secret_encrypted            TEXT NOT NULL,
  secret_previous_encrypted   TEXT,
  secret_previous_expires_at  TIMESTAMPTZ,
  event_types                 TEXT[] NOT NULL DEFAULT '{}',
  enabled                     BOOLEAN NOT NULL DEFAULT TRUE,
  description                 TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at             TIMESTAMPTZ,
  last_failure_at             TIMESTAMPTZ,
  consecutive_failures        INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT webhook_subscriptions_previous_secret_chk
    CHECK ((secret_previous_encrypted IS NULL) = (secret_previous_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_owner
  ON webhook_subscriptions(owner_user_id) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_event_types
  ON webhook_subscriptions USING GIN (event_types) WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     UUID NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event_id            UUID NOT NULL,
  event_type          TEXT NOT NULL,
  payload             JSONB NOT NULL,
  attempt_count       INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending',
  next_retry_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_http_status    INTEGER,
  last_response_body  TEXT,
  last_error          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  succeeded_at        TIMESTAMPTZ,
  dead_at             TIMESTAMPTZ,
  CONSTRAINT webhook_deliveries_status_chk
    CHECK (status IN ('pending', 'succeeded', 'dead', 'replayed'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_dispatch
  ON webhook_deliveries(next_retry_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_id
  ON webhook_deliveries(event_id);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_subscription
  ON webhook_deliveries(subscription_id, created_at DESC);
