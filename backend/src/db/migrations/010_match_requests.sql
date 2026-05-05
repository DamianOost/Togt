-- Auto-match flow: a customer creates a match_request; the dispatcher pings
-- candidate labourers in priority order via match_attempts; the first to
-- accept produces a real bookings row (matched_booking_id). All other
-- attempts are abandoned. If no labourer accepts before each ping window
-- expires AND the candidate list is exhausted, the match_request expires.

CREATE TABLE IF NOT EXISTS match_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_needed         VARCHAR(100) NOT NULL,
  address              TEXT NOT NULL,
  location_lat         DOUBLE PRECISION NOT NULL,
  location_lng         DOUBLE PRECISION NOT NULL,
  scheduled_at         TIMESTAMPTZ NOT NULL,
  hours_est            NUMERIC(4,1),
  notes                TEXT,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending','matched','expired','cancelled')),
  expire_reason        VARCHAR(40),
  matched_booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
  matched_labourer_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  matched_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_requests_customer ON match_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_status ON match_requests(status);

CREATE TABLE IF NOT EXISTS match_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_request_id  UUID NOT NULL REFERENCES match_requests(id) ON DELETE CASCADE,
  labourer_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'pinged'
                      CHECK (status IN ('pinged','accepted','declined','timeout','cancelled')),
  pinged_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_match_attempts_request ON match_attempts(match_request_id);
CREATE INDEX IF NOT EXISTS idx_match_attempts_labourer ON match_attempts(labourer_id);
CREATE INDEX IF NOT EXISTS idx_match_attempts_status ON match_attempts(status);
