-- Track which KYC provider verified the user so we can later re-run POC records
-- through real DHA once we upgrade to a commercial provider (VerifyNow etc.).
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS provider VARCHAR(32) DEFAULT 'poc_structural';

-- Also store parsed fields from the SA ID itself (DOB, sex, citizenship) —
-- useful for audit trails and for matching against user-submitted profile data.
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS parsed_dob DATE;
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS parsed_sex VARCHAR(10);
ALTER TABLE kyc_verifications ADD COLUMN IF NOT EXISTS parsed_is_citizen BOOLEAN;
