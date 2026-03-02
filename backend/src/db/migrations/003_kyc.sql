-- KYC Verifications table
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id_number     VARCHAR(20),
  status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','verified','failed')),
  smile_job_id  TEXT,
  verified_name TEXT,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Add kyc_status column to users (safe — does nothing if already exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'unverified';
-- kyc_status values: unverified | pending | verified | failed

CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_verifications(user_id);
