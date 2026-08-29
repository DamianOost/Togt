-- 018_grounded_catalogue_quotes.sql
--
-- Phase 2 server-authoritative service catalogue and remote-quote lifecycle.
-- Catalogue content is deliberately not seeded here: publishing a service and
-- activating real worker opt-ins are Operations decisions, not development
-- fixtures. Tests insert synthetic rows into their isolated database.

CREATE TABLE IF NOT EXISTS service_catalogue_versions (
  service_id                  UUID NOT NULL,
  service_version             INTEGER NOT NULL CHECK (service_version > 0),
  schema_version              SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  canonical_key               VARCHAR(80) NOT NULL CHECK (canonical_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  category_key                VARCHAR(80) NOT NULL CHECK (category_key ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  label_en_za                 VARCHAR(120) NOT NULL CHECK (char_length(trim(label_en_za)) > 0),
  description_en_za           TEXT NOT NULL DEFAULT '',
  pricing_mode                VARCHAR(32) NOT NULL CHECK (
                                pricing_mode IN (
                                  'fixed_instant', 'hourly_estimated',
                                  'remote_quote', 'diagnostic_visit'
                                )
                              ),
  fulfilment_mode             VARCHAR(32) NOT NULL CHECK (
                                fulfilment_mode IN (
                                  'fast_match', 'compare_workers',
                                  'receive_quotes', 'book_diagnostic_visit'
                                )
                              ),
  risk_tier                   VARCHAR(20) NOT NULL CHECK (risk_tier IN ('low', 'standard', 'high')),
  required_question_ids       TEXT[] NOT NULL DEFAULT '{}',
  brief_schema                JSONB NOT NULL DEFAULT '{"questions":[]}'::jsonb,
  pricing_rules               JSONB NOT NULL DEFAULT '{}'::jsonb,
  materials_rules             JSONB NOT NULL DEFAULT '{}'::jsonb,
  change_order_rules          JSONB NOT NULL DEFAULT '{}'::jsonb,
  minimum_duration_minutes    INTEGER CHECK (minimum_duration_minutes IS NULL OR minimum_duration_minutes > 0),
  call_out_fee                NUMERIC(12,2) CHECK (call_out_fee IS NULL OR call_out_fee >= 0),
  currency                    VARCHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  cancellation_policy_version VARCHAR(80) NOT NULL,
  recurrence_eligible         BOOLEAN NOT NULL DEFAULT false,
  worker_eligibility          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published                BOOLEAN NOT NULL DEFAULT false,
  published_at                TIMESTAMPTZ,
  retired_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (service_id, service_version),
  UNIQUE (canonical_key, service_version),
  CONSTRAINT service_catalogue_brief_schema_object_chk CHECK (jsonb_typeof(brief_schema) = 'object'),
  CONSTRAINT service_catalogue_rules_object_chk CHECK (
    jsonb_typeof(pricing_rules) = 'object'
    AND jsonb_typeof(materials_rules) = 'object'
    AND jsonb_typeof(change_order_rules) = 'object'
    AND jsonb_typeof(worker_eligibility) = 'object'
  ),
  CONSTRAINT service_catalogue_publish_dates_chk CHECK (
    (is_published = false) OR published_at IS NOT NULL
  ),
  CONSTRAINT service_catalogue_retired_dates_chk CHECK (
    retired_at IS NULL OR published_at IS NOT NULL
  ),
  CONSTRAINT service_catalogue_mode_pair_chk CHECK (
    (pricing_mode = 'remote_quote' AND fulfilment_mode = 'receive_quotes')
    OR (pricing_mode = 'diagnostic_visit' AND fulfilment_mode = 'book_diagnostic_visit')
    OR (pricing_mode IN ('fixed_instant', 'hourly_estimated')
        AND fulfilment_mode IN ('fast_match', 'compare_workers'))
  )
);

CREATE OR REPLACE FUNCTION grounded_catalogue_questions_valid(required_ids TEXT[], schema JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF jsonb_typeof(schema->'questions') IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(schema->'questions') AS q
     WHERE jsonb_typeof(q) <> 'object'
        OR COALESCE(q->>'id', '') !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
  ) THEN
    RETURN false;
  END IF;
  IF (
    SELECT COUNT(*) FROM jsonb_array_elements(schema->'questions')
  ) IS DISTINCT FROM (
    SELECT COUNT(DISTINCT q->>'id') FROM jsonb_array_elements(schema->'questions') AS q
  ) THEN
    RETURN false;
  END IF;
  IF cardinality(required_ids) IS DISTINCT FROM (
    SELECT COUNT(DISTINCT required_id) FROM unnest(required_ids) AS required_id
  ) THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
      FROM unnest(required_ids) AS required_id
     WHERE required_id !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(schema->'questions') AS q
           WHERE q->>'id' = required_id
        )
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'service_catalogue_question_contract_chk'
       AND conrelid = 'service_catalogue_versions'::regclass
  ) THEN
    ALTER TABLE service_catalogue_versions
      ADD CONSTRAINT service_catalogue_question_contract_chk
      CHECK (grounded_catalogue_questions_valid(required_question_ids, brief_schema));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_service_catalogue_one_current_version
  ON service_catalogue_versions(service_id)
  WHERE is_published = true AND retired_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_service_catalogue_public
  ON service_catalogue_versions(category_key, canonical_key, service_version DESC)
  WHERE is_published = true AND retired_at IS NULL;

CREATE TABLE IF NOT EXISTS catalogue_worker_opt_ins (
  worker_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL,
  service_version INTEGER NOT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  opted_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ,
  PRIMARY KEY (worker_id, service_id, service_version),
  FOREIGN KEY (service_id, service_version)
    REFERENCES service_catalogue_versions(service_id, service_version) ON DELETE RESTRICT,
  CONSTRAINT catalogue_worker_opt_in_dates_chk CHECK (
    (status = 'active' AND deactivated_at IS NULL)
    OR (status = 'inactive' AND deactivated_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_catalogue_worker_active
  ON catalogue_worker_opt_ins(service_id, service_version, worker_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS grounded_quote_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_version           INTEGER NOT NULL DEFAULT 1 CHECK (request_version > 0),
  service_id                UUID NOT NULL,
  service_version           INTEGER NOT NULL,
  status                    VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (
                              status IN (
                                'open', 'receiving', 'selected',
                                'expired', 'cancelled', 'no_quotes'
                              )
                            ),
  service_snapshot          JSONB NOT NULL,
  brief_snapshot            JSONB NOT NULL,
  broad_area_label          VARCHAR(160) NOT NULL CHECK (char_length(trim(broad_area_label)) > 0),
  private_location_snapshot JSONB NOT NULL,
  schedule_snapshot         JSONB NOT NULL,
  questions_deadline_at     TIMESTAMPTZ,
  quotes_close_at           TIMESTAMPTZ NOT NULL,
  selected_at               TIMESTAMPTZ,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (service_id, service_version)
    REFERENCES service_catalogue_versions(service_id, service_version) ON DELETE RESTRICT,
  CONSTRAINT grounded_quote_request_snapshots_chk CHECK (
    jsonb_typeof(service_snapshot) = 'object'
    AND jsonb_typeof(brief_snapshot) = 'object'
    AND jsonb_typeof(private_location_snapshot) = 'object'
    AND jsonb_typeof(schedule_snapshot) = 'object'
  ),
  CONSTRAINT grounded_quote_request_deadlines_chk CHECK (
    quotes_close_at > created_at
    AND (questions_deadline_at IS NULL OR questions_deadline_at <= quotes_close_at)
  ),
  CONSTRAINT grounded_quote_request_terminal_dates_chk CHECK (
    (status = 'selected' AND selected_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND selected_at IS NULL)
    OR (status NOT IN ('selected', 'cancelled') AND selected_at IS NULL AND cancelled_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_quote_requests_customer
  ON grounded_quote_requests(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grounded_quote_requests_inbox
  ON grounded_quote_requests(service_id, service_version, quotes_close_at, created_at)
  WHERE status IN ('open', 'receiving');

CREATE TABLE IF NOT EXISTS grounded_quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id  UUID NOT NULL REFERENCES grounded_quote_requests(id) ON DELETE RESTRICT,
  worker_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status            VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (
                      status IN (
                        'draft', 'submitted', 'accepted', 'declined',
                        'expired', 'withdrawn', 'lost'
                      )
                    ),
  current_version   INTEGER NOT NULL DEFAULT 1 CHECK (current_version > 0),
  submitted_at      TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  declined_at       TIMESTAMPTZ,
  expired_at        TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  lost_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quote_request_id, worker_id),
  CONSTRAINT grounded_quote_state_dates_chk CHECK (
    (status = 'draft' AND submitted_at IS NULL AND accepted_at IS NULL AND declined_at IS NULL
      AND expired_at IS NULL AND withdrawn_at IS NULL AND lost_at IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND accepted_at IS NULL AND declined_at IS NULL
      AND expired_at IS NULL AND withdrawn_at IS NULL AND lost_at IS NULL)
    OR (status = 'accepted' AND submitted_at IS NOT NULL AND accepted_at IS NOT NULL)
    OR (status = 'declined' AND submitted_at IS NOT NULL AND declined_at IS NOT NULL)
    OR (status = 'expired' AND submitted_at IS NOT NULL AND expired_at IS NOT NULL)
    OR (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
    OR (status = 'lost' AND lost_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_quotes_request
  ON grounded_quotes(quote_request_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_grounded_quotes_worker
  ON grounded_quotes(worker_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS grounded_quote_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_request_id UUID NOT NULL REFERENCES grounded_quote_requests(id) ON DELETE RESTRICT,
  quote_id          UUID REFERENCES grounded_quotes(id) ON DELETE RESTRICT,
  event_type        VARCHAR(40) NOT NULL CHECK (
                      event_type IN (
                        'request.created', 'request.cancelled',
                        'quote.drafted', 'quote.submitted', 'quote.edited',
                        'quote.withdrawn', 'quote.declined', 'quote.accepted',
                        'quote.lost', 'request.selected'
                      )
                    ),
  actor_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role        VARCHAR(20) NOT NULL CHECK (actor_role IN ('customer', 'labourer', 'system')),
  request_version  INTEGER NOT NULL CHECK (request_version > 0),
  request_status   VARCHAR(20) NOT NULL,
  quote_version    INTEGER CHECK (quote_version IS NULL OR quote_version > 0),
  quote_status     VARCHAR(20),
  payload          JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grounded_quote_event_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_grounded_quote_events_timeline
  ON grounded_quote_events(quote_request_id, occurred_at, id);

CREATE TABLE IF NOT EXISTS grounded_quote_versions (
  quote_id               UUID NOT NULL REFERENCES grounded_quotes(id) ON DELETE RESTRICT,
  version                INTEGER NOT NULL CHECK (version > 0),
  scope                  TEXT CHECK (scope IS NULL OR char_length(trim(scope)) BETWEEN 3 AND 4000),
  deliverables           JSONB NOT NULL DEFAULT '[]'::jsonb,
  exclusions             JSONB NOT NULL DEFAULT '[]'::jsonb,
  assumptions            JSONB NOT NULL DEFAULT '[]'::jsonb,
  proposed_start_at      TIMESTAMPTZ,
  proposed_end_at        TIMESTAMPTZ,
  duration_minutes       INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 15 AND 10080),
  labour_amount          NUMERIC(12,2) CHECK (labour_amount IS NULL OR labour_amount >= 0),
  materials_amount       NUMERIC(12,2) CHECK (materials_amount IS NULL OR materials_amount >= 0),
  customer_total_amount  NUMERIC(12,2) GENERATED ALWAYS AS (labour_amount + materials_amount) STORED,
  currency               VARCHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  platform_fee_snapshot  JSONB NOT NULL DEFAULT '{"state":"not_configured","amount":null}'::jsonb,
  worker_net_snapshot    JSONB NOT NULL DEFAULT '{"state":"not_available","amount":null}'::jsonb,
  valid_until            TIMESTAMPTZ,
  authored_as            VARCHAR(16) NOT NULL CHECK (authored_as IN ('draft', 'submitted')),
  content_hash           CHAR(64) NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (quote_id, version),
  CONSTRAINT grounded_quote_arrays_chk CHECK (
    jsonb_typeof(deliverables) = 'array'
    AND jsonb_typeof(exclusions) = 'array'
    AND jsonb_typeof(assumptions) = 'array'
  ),
  CONSTRAINT grounded_quote_complete_when_submitted_chk CHECK (
    authored_as = 'draft'
    OR (
      scope IS NOT NULL
      AND jsonb_array_length(deliverables) > 0
      AND proposed_start_at IS NOT NULL
      AND proposed_end_at IS NOT NULL
      AND proposed_end_at > proposed_start_at
      AND duration_minutes IS NOT NULL
      AND labour_amount IS NOT NULL
      AND materials_amount IS NOT NULL
      AND customer_total_amount > 0
      AND valid_until IS NOT NULL
      AND valid_until > created_at
    )
  ),
  CONSTRAINT grounded_quote_financial_snapshots_chk CHECK (
    jsonb_typeof(platform_fee_snapshot) = 'object'
    AND jsonb_typeof(worker_net_snapshot) = 'object'
  )
);

ALTER TABLE grounded_quote_requests
  ADD COLUMN IF NOT EXISTS selected_quote_id UUID REFERENCES grounded_quotes(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_quote_request_selected_quote
  ON grounded_quote_requests(selected_quote_id)
  WHERE selected_quote_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS grounded_booking_agreement_snapshots (
  booking_id          UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  quote_request_id    UUID NOT NULL UNIQUE REFERENCES grounded_quote_requests(id) ON DELETE RESTRICT,
  quote_id            UUID NOT NULL UNIQUE REFERENCES grounded_quotes(id) ON DELETE RESTRICT,
  quote_version       INTEGER NOT NULL CHECK (quote_version > 0),
  service_id          UUID NOT NULL,
  service_version     INTEGER NOT NULL,
  service_snapshot    JSONB NOT NULL,
  scope_snapshot      JSONB NOT NULL,
  commercial_snapshot JSONB NOT NULL,
  schedule_snapshot   JSONB NOT NULL,
  accepted_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accepted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (quote_id, quote_version)
    REFERENCES grounded_quote_versions(quote_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (service_id, service_version)
    REFERENCES service_catalogue_versions(service_id, service_version) ON DELETE RESTRICT,
  CONSTRAINT grounded_booking_agreement_snapshots_chk CHECK (
    jsonb_typeof(service_snapshot) = 'object'
    AND jsonb_typeof(scope_snapshot) = 'object'
    AND jsonb_typeof(commercial_snapshot) = 'object'
    AND jsonb_typeof(schedule_snapshot) = 'object'
  )
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accepted_quote_id UUID REFERENCES grounded_quotes(id) ON DELETE RESTRICT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS accepted_quote_version INTEGER CHECK (accepted_quote_version IS NULL OR accepted_quote_version > 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_accepted_quote
  ON bookings(accepted_quote_id)
  WHERE accepted_quote_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS grounded_quote_command_receipts (
  actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_type    VARCHAR(40) NOT NULL CHECK (
                    command_type IN (
                      'create_request', 'cancel_request', 'create_quote',
                      'edit_quote', 'submit_quote', 'withdraw_quote',
                      'decline_quote', 'accept_quote'
                    )
                  ),
  idempotency_key VARCHAR(255) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  request_hash    CHAR(64) NOT NULL,
  response_status SMALLINT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (actor_user_id, command_type, idempotency_key),
  CONSTRAINT grounded_quote_receipt_response_chk CHECK (
    (response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR (response_status BETWEEN 200 AND 499 AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_quote_receipts_retention
  ON grounded_quote_command_receipts(created_at);

ALTER TABLE grounded_quote_command_receipts
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours');

CREATE INDEX IF NOT EXISTS idx_grounded_quote_receipts_expiry
  ON grounded_quote_command_receipts(expires_at);

-- No production service, availability or worker data is manufactured here.
-- Rollback during the compatibility window is code-only and preserves these
-- additive snapshots and audit evidence.
