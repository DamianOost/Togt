-- Idempotency keys: Stripe-style. An agent retrying a request after a
-- timeout supplies the same Idempotency-Key UUID; we return the cached
-- response instead of double-creating. 24-hour TTL.
--
-- The body of the first response is stored verbatim so future retries
-- get an identical reply. Status code is also captured so a successful
-- 201 stays a 201 on retry, not a 200.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key            TEXT NOT NULL,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method         TEXT NOT NULL,
  path           TEXT NOT NULL,
  request_hash   TEXT NOT NULL,            -- sha256(body) — guards against same key + different body
  response_status INTEGER NOT NULL,
  response_body  JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

-- For TTL sweeps
CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at);
