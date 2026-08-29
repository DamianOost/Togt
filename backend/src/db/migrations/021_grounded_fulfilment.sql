-- 021_grounded_fulfilment.sql
--
-- Canonical accepted-to-work-active fulfilment state. This migration is
-- additive and intentionally contains no default operational policy: exact
-- reveal lead-times, PIN limits, no-show grace and proposal expiries must be
-- snapshotted from an approved catalogue/Operations policy per booking.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS current_scope_version INTEGER
    CHECK (current_scope_version IS NULL OR current_scope_version > 0);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS schedule_revision INTEGER NOT NULL DEFAULT 1
    CHECK (schedule_revision > 0);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS route_access_granted_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS start_verified_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS start_verified_by UUID REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS start_device_id_hash CHAR(64);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS fulfilment_access_revoked_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS fulfilment_access_revoked_reason VARCHAR(32)
    CHECK (fulfilment_access_revoked_reason IS NULL OR fulfilment_access_revoked_reason IN (
      'worker_no_show', 'replacement_requested', 'safety_hold', 'assignment_changed'
    ));

CREATE TABLE IF NOT EXISTS grounded_fulfilment_policy_snapshots (
  booking_id                     UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  policy_version                 VARCHAR(80) NOT NULL,
  source                         VARCHAR(32) NOT NULL CHECK (source IN ('catalogue_snapshot', 'operations_override')),
  route_reveal_lead_minutes      INTEGER NOT NULL CHECK (route_reveal_lead_minutes BETWEEN 0 AND 1440),
  arrival_evidence_mode          VARCHAR(32) NOT NULL CHECK (arrival_evidence_mode = 'worker_attestation'),
  no_show_grace_minutes          INTEGER NOT NULL CHECK (no_show_grace_minutes BETWEEN 0 AND 1440),
  start_pin_ttl_minutes          INTEGER NOT NULL CHECK (start_pin_ttl_minutes BETWEEN 15 AND 1440),
  start_pin_max_attempts         INTEGER NOT NULL CHECK (start_pin_max_attempts BETWEEN 3 AND 10),
  reschedule_expiry_minutes      INTEGER NOT NULL CHECK (reschedule_expiry_minutes BETWEEN 15 AND 10080),
  change_order_expiry_minutes    INTEGER NOT NULL CHECK (change_order_expiry_minutes BETWEEN 15 AND 10080),
  snapshotted_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grounded_scope_versions (
  booking_id              UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  version                 INTEGER NOT NULL CHECK (version > 0),
  base_version            INTEGER CHECK (base_version IS NULL OR base_version > 0),
  status                  VARCHAR(20) NOT NULL CHECK (
                            status IN ('proposed', 'confirmed', 'declined', 'superseded')
                          ),
  source                  VARCHAR(32) NOT NULL CHECK (
                            source IN ('accepted_agreement', 'legacy_customer_confirmation',
                                       'participant_proposal', 'approved_change_order')
                          ),
  proposed_by             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_by_role        VARCHAR(20) NOT NULL CHECK (proposed_by_role IN ('customer', 'labourer')),
  scope_snapshot          JSONB NOT NULL,
  customer_confirmed_by   UUID REFERENCES users(id) ON DELETE RESTRICT,
  customer_confirmed_at   TIMESTAMPTZ,
  worker_confirmed_by     UUID REFERENCES users(id) ON DELETE RESTRICT,
  worker_confirmed_at     TIMESTAMPTZ,
  declined_by             UUID REFERENCES users(id) ON DELETE RESTRICT,
  declined_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (booking_id, version),
  FOREIGN KEY (booking_id, base_version)
    REFERENCES grounded_scope_versions(booking_id, version) ON DELETE RESTRICT,
  CONSTRAINT grounded_scope_snapshot_object_chk CHECK (jsonb_typeof(scope_snapshot) = 'object'),
  CONSTRAINT grounded_scope_decision_chk CHECK (
    (status = 'proposed' AND declined_by IS NULL AND declined_at IS NULL)
    OR (status = 'confirmed' AND customer_confirmed_by IS NOT NULL
        AND customer_confirmed_at IS NOT NULL AND worker_confirmed_by IS NOT NULL
        AND worker_confirmed_at IS NOT NULL AND declined_by IS NULL AND declined_at IS NULL)
    OR (status = 'declined' AND declined_by IS NOT NULL AND declined_at IS NOT NULL)
    OR (status = 'superseded' AND declined_by IS NULL AND declined_at IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_scope_one_proposal
  ON grounded_scope_versions(booking_id)
  WHERE status = 'proposed';

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_scope_one_confirmed
  ON grounded_scope_versions(booking_id)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_grounded_scope_history
  ON grounded_scope_versions(booking_id, version DESC);

CREATE TABLE IF NOT EXISTS grounded_start_pin_challenges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  generation            INTEGER NOT NULL CHECK (generation > 0),
  scope_version         INTEGER NOT NULL,
  status                VARCHAR(16) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'consumed', 'locked', 'revoked', 'expired')),
  pin_salt               CHAR(32) NOT NULL,
  pin_hash               CHAR(64) NOT NULL,
  failed_attempts        INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  max_attempts           INTEGER NOT NULL CHECK (max_attempts BETWEEN 3 AND 10),
  customer_revealed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at             TIMESTAMPTZ NOT NULL,
  consumed_at            TIMESTAMPTZ,
  locked_at              TIMESTAMPTZ,
  revoked_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, generation),
  FOREIGN KEY (booking_id, scope_version)
    REFERENCES grounded_scope_versions(booking_id, version) ON DELETE RESTRICT,
  CONSTRAINT grounded_start_pin_dates_chk CHECK (
    expires_at > created_at
    AND (status = 'active' AND consumed_at IS NULL AND locked_at IS NULL AND revoked_at IS NULL
      OR status = 'consumed' AND consumed_at IS NOT NULL
      OR status = 'locked' AND locked_at IS NOT NULL
      OR status = 'revoked' AND revoked_at IS NOT NULL
      OR status = 'expired')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_start_pin_one_active
  ON grounded_start_pin_challenges(booking_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS grounded_start_pin_attempts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id     UUID NOT NULL REFERENCES grounded_start_pin_challenges(id) ON DELETE RESTRICT,
  booking_id       UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  worker_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  device_id_hash   CHAR(64),
  outcome          VARCHAR(16) NOT NULL CHECK (outcome IN ('invalid', 'locked', 'success')),
  attempted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grounded_start_pin_attempt_history
  ON grounded_start_pin_attempts(challenge_id, attempted_at);

CREATE TABLE IF NOT EXISTS grounded_arrival_attestations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  worker_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  evidence_mode  VARCHAR(32) NOT NULL CHECK (evidence_mode = 'worker_attestation'),
  attested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grounded_reschedule_proposals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id            UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  version               INTEGER NOT NULL CHECK (version > 0),
  schedule_revision     INTEGER NOT NULL CHECK (schedule_revision > 0),
  status                VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  proposed_by           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  proposed_by_role      VARCHAR(20) NOT NULL CHECK (proposed_by_role IN ('customer', 'labourer')),
  original_scheduled_at TIMESTAMPTZ NOT NULL,
  proposed_scheduled_at TIMESTAMPTZ NOT NULL,
  reason                TEXT CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 500),
  expires_at            TIMESTAMPTZ NOT NULL,
  decided_by            UUID REFERENCES users(id) ON DELETE RESTRICT,
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, version),
  CONSTRAINT grounded_reschedule_dates_chk CHECK (
    proposed_scheduled_at > created_at AND expires_at > created_at
  ),
  CONSTRAINT grounded_reschedule_decision_chk CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status IN ('accepted', 'declined') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    OR status = 'expired'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_reschedule_one_pending
  ON grounded_reschedule_proposals(booking_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS grounded_change_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id             UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  version                INTEGER NOT NULL CHECK (version > 0),
  base_scope_version     INTEGER NOT NULL,
  legacy_change_order_id UUID NOT NULL UNIQUE REFERENCES change_orders(id) ON DELETE RESTRICT,
  status                 VARCHAR(16) NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'declined', 'expired')),
  proposed_by            UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  description            TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 3 AND 1000),
  added_scope_items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  extra_minutes          INTEGER CHECK (extra_minutes IS NULL OR extra_minutes BETWEEN 15 AND 10080),
  labour_amount          NUMERIC(12,2) NOT NULL CHECK (labour_amount >= 0),
  materials_amount       NUMERIC(12,2) NOT NULL CHECK (materials_amount >= 0),
  additional_amount      NUMERIC(12,2) GENERATED ALWAYS AS (labour_amount + materials_amount) STORED,
  currency               VARCHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  original_total_amount  NUMERIC(12,2) NOT NULL CHECK (original_total_amount >= 0),
  revised_total_amount   NUMERIC(12,2) GENERATED ALWAYS AS (
                           original_total_amount + labour_amount + materials_amount
                         ) STORED,
  expires_at             TIMESTAMPTZ NOT NULL,
  decided_by             UUID REFERENCES users(id) ON DELETE RESTRICT,
  decided_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, version),
  FOREIGN KEY (booking_id, base_scope_version)
    REFERENCES grounded_scope_versions(booking_id, version) ON DELETE RESTRICT,
  CONSTRAINT grounded_change_items_array_chk CHECK (jsonb_typeof(added_scope_items) = 'array'),
  CONSTRAINT grounded_change_amount_chk CHECK (additional_amount > 0),
  CONSTRAINT grounded_change_dates_chk CHECK (expires_at > created_at),
  CONSTRAINT grounded_change_decision_chk CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status IN ('approved', 'declined') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    OR status = 'expired'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_change_one_pending
  ON grounded_change_orders(booking_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS grounded_no_show_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  reported_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  absent_role       VARCHAR(20) NOT NULL CHECK (absent_role IN ('customer', 'labourer')),
  status            VARCHAR(24) NOT NULL DEFAULT 'received'
                      CHECK (status IN ('received', 'replacement_requested', 'resolved', 'dismissed')),
  attestation       TEXT NOT NULL CHECK (char_length(trim(attestation)) BETWEEN 3 AND 1000),
  reported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ,
  UNIQUE (booking_id, absent_role),
  CONSTRAINT grounded_no_show_resolution_chk CHECK (
    (status IN ('received', 'replacement_requested') AND resolved_at IS NULL)
    OR (status IN ('resolved', 'dismissed') AND resolved_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS grounded_replacement_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  no_show_report_id  UUID NOT NULL UNIQUE REFERENCES grounded_no_show_reports(id) ON DELETE RESTRICT,
  requested_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status             VARCHAR(24) NOT NULL DEFAULT 'received'
                       CHECK (status IN ('received', 'under_review', 'fulfilled', 'declined', 'cancelled')),
  original_worker_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ,
  CONSTRAINT grounded_replacement_resolution_chk CHECK (
    (status IN ('received', 'under_review') AND resolved_at IS NULL)
    OR (status IN ('fulfilled', 'declined', 'cancelled') AND resolved_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS grounded_fulfilment_commands (
  actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  command_type    VARCHAR(48) NOT NULL CHECK (command_type IN (
                    'start_route', 'mark_arrived', 'propose_scope', 'confirm_scope',
                    'reveal_start_pin', 'start_work', 'propose_reschedule',
                    'accept_reschedule', 'decline_reschedule', 'propose_change_order',
                    'approve_change_order', 'decline_change_order',
                    'report_no_show', 'request_replacement'
                  )),
  idempotency_key VARCHAR(255) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  request_hash    CHAR(64) NOT NULL,
  response_status SMALLINT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  PRIMARY KEY (actor_user_id, booking_id, command_type, idempotency_key),
  CONSTRAINT grounded_fulfilment_receipt_response_chk CHECK (
    (response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR (response_status BETWEEN 200 AND 499 AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_fulfilment_commands_expiry
  ON grounded_fulfilment_commands(expires_at);

-- Extend the canonical Project event vocabulary while retaining the same
-- ordered aggregate sequence and transactional outbox.
ALTER TABLE grounded_project_events
  DROP CONSTRAINT IF EXISTS grounded_project_events_event_type_check;

ALTER TABLE grounded_project_events
  ADD CONSTRAINT grounded_project_events_event_type_check CHECK (event_type IN (
    'project.created', 'completion.requested', 'completion.confirmed',
    'completion.disputed', 'booking.completed',
    'booking.en_route', 'booking.arrived', 'scope.proposed', 'scope.confirmed',
    'scope.declined', 'start_pin.issued', 'start_pin.invalid', 'start_pin.locked',
    'start_pin.expired',
    'booking.started', 'reschedule.requested', 'reschedule.accepted',
    'reschedule.declined', 'reschedule.expired', 'change_order.requested',
    'change_order.approved', 'change_order.declined', 'change_order.expired',
    'no_show.reported', 'replacement.requested'
  ));

-- Canonical change orders mirror their pending/decided status into the legacy
-- table so the existing completion guard and commercial snapshot stay safe.
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS canonical_grounded_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_change_orders_canonical_grounded
  ON change_orders(canonical_grounded_id)
  WHERE canonical_grounded_id IS NOT NULL;

ALTER TABLE grounded_change_orders
  DROP CONSTRAINT IF EXISTS grounded_change_orders_legacy_change_order_id_fkey;

ALTER TABLE grounded_change_orders
  ADD CONSTRAINT grounded_change_orders_legacy_change_order_id_fkey
  FOREIGN KEY (legacy_change_order_id) REFERENCES change_orders(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION grounded_block_revoked_fulfilment_start()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.fulfilment_access_revoked_at IS NOT NULL
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status = 'in_progress' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'grounded_fulfilment_access_revoked';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grounded_block_revoked_fulfilment_start ON bookings;
CREATE TRIGGER trg_grounded_block_revoked_fulfilment_start
BEFORE UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION grounded_block_revoked_fulfilment_start();

-- No policy, arrival, PIN, scope confirmation, no-show or replacement state is
-- inferred for legacy rows. Unknown combinations stay read-only until an
-- explicit participant action supplies durable evidence.
