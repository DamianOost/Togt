-- 016_customer_data_safety.sql
-- Additive privacy hardening fields. Legacy id_number columns are left in
-- place for one release so this migration is rollback-cheap and non-
-- destructive. New code paths must not write raw ID numbers.

ALTER TABLE kyc_verifications
  ADD COLUMN IF NOT EXISTS id_last4 VARCHAR(4);

ALTER TABLE kyc_verifications
  ADD COLUMN IF NOT EXISTS id_blind_index TEXT;

ALTER TABLE kyc_verifications
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT;

ALTER TABLE kyc_verifications
  ADD COLUMN IF NOT EXISTS raw_input_discarded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_kyc_id_blind_index
  ON kyc_verifications(id_blind_index)
  WHERE id_blind_index IS NOT NULL;

ALTER TABLE labourer_profiles
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;
