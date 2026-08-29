-- 022_grounded_worker_profile.sql
--
-- Phase 3 worker activation/readiness and catalogue-bound public offerings.
-- This migration adds evidence containers only. It does not seed services,
-- credentials, payout accounts, provider decisions, or availability claims.

CREATE TABLE IF NOT EXISTS grounded_worker_public_profiles (
  worker_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  public_display_name VARCHAR(80) NOT NULL CHECK (char_length(trim(public_display_name)) BETWEEN 2 AND 80),
  about_experience    TEXT NOT NULL CHECK (char_length(trim(about_experience)) BETWEEN 20 AND 1000),
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grounded_worker_service_offerings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id               UUID NOT NULL,
  service_version          INTEGER NOT NULL CHECK (service_version > 0),
  customer_facing_title    VARCHAR(120) NOT NULL CHECK (char_length(trim(customer_facing_title)) BETWEEN 2 AND 120),
  description              TEXT NOT NULL CHECK (char_length(trim(description)) <= 1500),
  hourly_rate_minor        BIGINT CHECK (hourly_rate_minor IS NULL OR hourly_rate_minor >= 0),
  minimum_duration_minutes INTEGER CHECK (minimum_duration_minutes IS NULL OR minimum_duration_minutes > 0),
  call_out_amount_minor    BIGINT CHECK (call_out_amount_minor IS NULL OR call_out_amount_minor >= 0),
  service_area_label       VARCHAR(160),
  revision                 INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, service_id, service_version),
  FOREIGN KEY (service_id, service_version)
    REFERENCES service_catalogue_versions(service_id, service_version) ON DELETE RESTRICT,
  CONSTRAINT grounded_worker_offering_area_chk CHECK (
    service_area_label IS NULL OR char_length(trim(service_area_label)) BETWEEN 2 AND 160
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_worker_offerings_worker
  ON grounded_worker_service_offerings(worker_id, updated_at DESC);

-- Preserve pre-existing Operations-created opt-ins by giving each an exact,
-- catalogue-version-bound editor row. This is a deterministic schema
-- backfill; it does not create workers or publish/activate any service.
INSERT INTO grounded_worker_service_offerings (
  worker_id, service_id, service_version, customer_facing_title, description,
  minimum_duration_minutes, call_out_amount_minor
)
SELECT o.worker_id, o.service_id, o.service_version,
       c.label_en_za,
       c.description_en_za,
       c.minimum_duration_minutes,
       CASE WHEN c.call_out_fee IS NULL THEN NULL ELSE round(c.call_out_fee * 100)::BIGINT END
  FROM catalogue_worker_opt_ins o
  JOIN service_catalogue_versions c
    ON c.service_id = o.service_id AND c.service_version = o.service_version
ON CONFLICT (worker_id, service_id, service_version) DO NOTHING;

CREATE TABLE IF NOT EXISTS grounded_worker_activation_acknowledgements (
  worker_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledgement_kind   VARCHAR(32) NOT NULL CHECK (
    acknowledgement_kind IN ('foreground_location', 'safety_policy', 'first_job_readiness')
  ),
  policy_version         VARCHAR(80) NOT NULL CHECK (
    char_length(trim(policy_version)) BETWEEN 1 AND 80
    AND policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  acknowledged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revision               INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (worker_id, acknowledgement_kind)
);

CREATE TABLE IF NOT EXISTS grounded_worker_activation_ack_events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acknowledgement_kind   VARCHAR(32) NOT NULL CHECK (
    acknowledgement_kind IN ('foreground_location', 'safety_policy', 'first_job_readiness')
  ),
  policy_version         VARCHAR(80) NOT NULL CHECK (
    char_length(trim(policy_version)) BETWEEN 1 AND 80
    AND policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  acknowledged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grounded_worker_ack_events_worker
  ON grounded_worker_activation_ack_events(worker_id, acknowledged_at DESC);

CREATE TABLE IF NOT EXISTS grounded_worker_activation_state (
  worker_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grounded_worker_profile_command_receipts (
  actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  command_type    VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  resource_id     UUID,
  request_hash    CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_status SMALLINT CHECK (response_status BETWEEN 200 AND 299),
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (actor_user_id, command_type, idempotency_key),
  CONSTRAINT grounded_worker_profile_receipt_response_chk CHECK (
    (response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR (response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_worker_profile_receipts_created
  ON grounded_worker_profile_command_receipts(created_at);
