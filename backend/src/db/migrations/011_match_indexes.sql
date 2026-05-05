-- Reviewer feedback: missing FK indexes + idempotency constraint on attempts.
-- N6: prevent the dispatcher (or any future code) from double-pinging the
--     same labourer on the same match. Failing fast at the schema beats
--     debugging silent duplicate notifications later.
-- S5: index FKs that the matcher writes through; without these, ON DELETE
--     SET NULL/CASCADE on the parent does a sequential scan.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_match_attempts_request_labourer
  ON match_attempts(match_request_id, labourer_id);

CREATE INDEX IF NOT EXISTS idx_match_requests_matched_booking
  ON match_requests(matched_booking_id);

CREATE INDEX IF NOT EXISTS idx_match_requests_matched_labourer
  ON match_requests(matched_labourer_id);
