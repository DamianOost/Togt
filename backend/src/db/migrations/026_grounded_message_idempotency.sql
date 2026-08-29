-- 026_grounded_message_idempotency.sql
--
-- Durable, per-sender/per-Project command receipts for chat. Grounded clients
-- retry ambiguous sends with the same key; a committed message must never be
-- inserted or broadcast twice merely because the first response was lost.

CREATE TABLE IF NOT EXISTS grounded_message_command_receipts (
  actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(255) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  request_hash    CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 499),
  response_body   JSONB NOT NULL CHECK (jsonb_typeof(response_body) = 'object'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_user_id, booking_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_grounded_message_receipts_booking_created
  ON grounded_message_command_receipts(booking_id, created_at DESC);
