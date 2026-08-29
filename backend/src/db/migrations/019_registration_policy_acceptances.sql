-- 019_registration_policy_acceptances.sql
-- Server-recorded, versioned acceptance of the two policies required to
-- create an account. Marketing consent is deliberately excluded: it must be
-- optional, channel-specific and independently withdrawable.

CREATE TABLE IF NOT EXISTS registration_policy_acceptances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_kind     VARCHAR(20) NOT NULL CHECK (policy_kind IN ('terms', 'privacy')),
  policy_version  VARCHAR(80) NOT NULL CHECK (
                    char_length(trim(policy_version)) BETWEEN 1 AND 80
                    AND policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
                  ),
  policy_revision VARCHAR(64) NOT NULL CHECK (policy_revision ~ '^[a-f0-9]{64}$'),
  document_url    TEXT NOT NULL CHECK (char_length(trim(document_url)) BETWEEN 8 AND 2048),
  acceptance_source VARCHAR(40) NOT NULL DEFAULT 'registration_api'
                    CHECK (acceptance_source = 'registration_api'),
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (user_id, policy_kind, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_registration_policy_acceptances_user_time
  ON registration_policy_acceptances(user_id, accepted_at DESC);

COMMENT ON TABLE registration_policy_acceptances IS
  'Append-only account-creation terms/privacy evidence. No marketing consent belongs in this table.';
