-- 023_durable_match_dispatch.sql
--
-- Replace Fast Match's process-memory ownership with database-visible work
-- scheduling.  Both match advancement and offer delivery use expiring leases:
-- a crashed process may cause a duplicate delivery after the lease expires,
-- but it cannot strand the request or create a second logical offer.
--
-- This migration is additive. Existing attempts receive the legacy 30-second
-- response window and existing pending matches become immediately recoverable.

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS dispatch_next_at TIMESTAMPTZ;

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS dispatch_lease_id UUID;

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS dispatch_lease_expires_at TIMESTAMPTZ;

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS dispatch_claim_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS dispatch_last_error TEXT;

UPDATE match_requests
   SET dispatch_next_at = LEAST(expires_at, clock_timestamp())
 WHERE dispatch_next_at IS NULL;

ALTER TABLE match_requests
  ALTER COLUMN dispatch_next_at SET DEFAULT clock_timestamp();

ALTER TABLE match_requests
  ALTER COLUMN dispatch_next_at SET NOT NULL;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS offer_expires_at TIMESTAMPTZ;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS dispatch_next_at TIMESTAMPTZ;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS dispatch_lease_id UUID;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS dispatch_lease_expires_at TIMESTAMPTZ;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS dispatch_attempt_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

ALTER TABLE match_attempts
  ADD COLUMN IF NOT EXISTS dispatch_last_error TEXT;

UPDATE match_attempts
   SET offer_expires_at = pinged_at + INTERVAL '30 seconds'
 WHERE offer_expires_at IS NULL;

UPDATE match_attempts
   SET dispatch_next_at = pinged_at
 WHERE dispatch_next_at IS NULL;

ALTER TABLE match_attempts
  ALTER COLUMN offer_expires_at SET DEFAULT (clock_timestamp() + INTERVAL '30 seconds');

ALTER TABLE match_attempts
  ALTER COLUMN offer_expires_at SET NOT NULL;

ALTER TABLE match_attempts
  ALTER COLUMN dispatch_next_at SET DEFAULT clock_timestamp();

ALTER TABLE match_attempts
  ALTER COLUMN dispatch_next_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'match_requests_dispatch_claim_count_chk'
       AND conrelid = 'match_requests'::regclass
  ) THEN
    ALTER TABLE match_requests
      ADD CONSTRAINT match_requests_dispatch_claim_count_chk
      CHECK (dispatch_claim_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'match_attempts_dispatch_attempt_count_chk'
       AND conrelid = 'match_attempts'::regclass
  ) THEN
    ALTER TABLE match_attempts
      ADD CONSTRAINT match_attempts_dispatch_attempt_count_chk
      CHECK (dispatch_attempt_count >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'match_attempts_offer_deadline_chk'
       AND conrelid = 'match_attempts'::regclass
  ) THEN
    ALTER TABLE match_attempts
      ADD CONSTRAINT match_attempts_offer_deadline_chk
      CHECK (offer_expires_at >= pinged_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_requests_dispatch_due
  ON match_requests(dispatch_next_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_match_attempts_dispatch_due
  ON match_attempts(dispatch_next_at, pinged_at)
  WHERE status = 'pinged' AND dispatched_at IS NULL;
