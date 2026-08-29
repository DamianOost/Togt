-- 017_grounded_project_lifecycle.sql
--
-- Additive Phase 2 Project/Job lifecycle foundation. `bookings.id` remains
-- the canonical Project identity; these tables preserve authoritative phase,
-- bilateral completion, commercial evidence, ordered lifecycle history and
-- idempotent command results without changing legacy payment state.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS operational_phase VARCHAR(32) NOT NULL DEFAULT 'matching';

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS lifecycle_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS phase_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bookings_operational_phase_chk'
       AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_operational_phase_chk CHECK (
        operational_phase IN (
          'matching', 'assigned', 'scheduled', 'en_route', 'arrived',
          'scope_confirmation', 'work_active', 'completion_review',
          'payment_pending', 'closed'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'bookings_lifecycle_revision_chk'
       AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_lifecycle_revision_chk CHECK (lifecycle_revision >= 0);
  END IF;
END $$;

-- Truthful compatibility backfill. Future reads still derive phase from the
-- booking, completion and payment records so a legacy route cannot fabricate
-- progress merely by leaving this projection stale.
UPDATE bookings
   SET operational_phase = CASE status
     WHEN 'pending' THEN 'matching'
     WHEN 'accepted' THEN 'scheduled'
     WHEN 'in_progress' THEN 'work_active'
     WHEN 'completed' THEN 'payment_pending'
     WHEN 'cancelled' THEN 'closed'
     ELSE operational_phase
   END
 WHERE lifecycle_revision = 0
   AND operational_phase = 'matching';

CREATE TABLE IF NOT EXISTS grounded_project_commercial_snapshots (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                 UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  version                    INTEGER NOT NULL CHECK (version > 0),
  booking_revision           BIGINT NOT NULL CHECK (booking_revision >= 0),
  currency                   VARCHAR(3) NOT NULL DEFAULT 'ZAR' CHECK (currency = 'ZAR'),
  agreed_total_amount        NUMERIC(12,2),
  estimated_hours            NUMERIC(6,2),
  service_label              VARCHAR(100) NOT NULL,
  scope_items                JSONB NOT NULL DEFAULT '[]'::jsonb,
  accepted_change_orders     JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_status_at_capture  VARCHAR(24),
  capture_reason             VARCHAR(32) NOT NULL CHECK (capture_reason = 'completion_requested'),
  captured_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, version)
);

CREATE INDEX IF NOT EXISTS idx_grounded_commercial_booking
  ON grounded_project_commercial_snapshots(booking_id, version DESC);

CREATE TABLE IF NOT EXISTS grounded_project_issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  kind           VARCHAR(32) NOT NULL CHECK (kind = 'completion_dispute'),
  status         VARCHAR(24) NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'acknowledged', 'under_review', 'resolved')),
  opened_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason         TEXT NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ,
  UNIQUE (booking_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_grounded_issues_open
  ON grounded_project_issues(booking_id, opened_at DESC)
  WHERE status IN ('open', 'acknowledged', 'under_review');

CREATE TABLE IF NOT EXISTS grounded_project_completions (
  booking_id          UUID PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  status              VARCHAR(24) NOT NULL
                        CHECK (status IN ('requested', 'confirmed', 'disputed', 'timed_out')),
  requested_by        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_id         UUID NOT NULL UNIQUE
                        REFERENCES grounded_project_commercial_snapshots(id) ON DELETE RESTRICT,
  decided_by          UUID REFERENCES users(id) ON DELETE RESTRICT,
  decided_at          TIMESTAMPTZ,
  dispute_issue_id    UUID UNIQUE REFERENCES grounded_project_issues(id) ON DELETE RESTRICT,
  CONSTRAINT grounded_completion_decision_chk CHECK (
    (status = 'requested' AND decided_by IS NULL AND decided_at IS NULL AND dispute_issue_id IS NULL)
    OR
    (status IN ('confirmed', 'timed_out') AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND dispute_issue_id IS NULL)
    OR
    (status = 'disputed' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND dispute_issue_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_completion_status
  ON grounded_project_completions(status, requested_at);

CREATE TABLE IF NOT EXISTS grounded_project_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  aggregate_sequence BIGINT NOT NULL CHECK (aggregate_sequence >= 0),
  schema_version     SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  event_type         VARCHAR(64) NOT NULL CHECK (
                       event_type IN (
                         'project.created', 'completion.requested',
                         'completion.confirmed', 'completion.disputed',
                         'booking.completed'
                       )
                     ),
  actor_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role         VARCHAR(20) NOT NULL CHECK (actor_role IN ('customer', 'labourer', 'system')),
  booking_status     VARCHAR(32) NOT NULL,
  operational_phase VARCHAR(32) NOT NULL,
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, aggregate_sequence)
);

CREATE INDEX IF NOT EXISTS idx_grounded_events_timeline
  ON grounded_project_events(booking_id, aggregate_sequence);

CREATE TABLE IF NOT EXISTS grounded_project_outbox (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL UNIQUE REFERENCES grounded_project_events(id) ON DELETE RESTRICT,
  topic              VARCHAR(64) NOT NULL DEFAULT 'project.lifecycle',
  aggregate_id       UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  aggregate_sequence BIGINT NOT NULL CHECK (aggregate_sequence > 0),
  payload            JSONB NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'dispatched', 'failed', 'suppressed')),
  attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_grounded_outbox_pending
  ON grounded_project_outbox(status, available_at, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS grounded_project_commands (
  actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id      UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  command_type    VARCHAR(48) NOT NULL CHECK (
                    command_type IN (
                      'request_completion', 'confirm_completion', 'dispute_completion'
                    )
                  ),
  idempotency_key VARCHAR(255) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  request_hash    CHAR(64) NOT NULL,
  response_status SMALLINT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (actor_user_id, booking_id, command_type, idempotency_key),
  CONSTRAINT grounded_command_response_chk CHECK (
    (response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR
    (response_status BETWEEN 200 AND 499 AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_commands_retention
  ON grounded_project_commands(created_at);

-- Seed only the factual creation event for existing bookings. No historical
-- acceptance/arrival timestamps are invented and no old event is queued for
-- outbound delivery.
INSERT INTO grounded_project_events (
  booking_id, aggregate_sequence, event_type, actor_user_id, actor_role,
  booking_status, operational_phase, payload, occurred_at
)
SELECT b.id, 0, 'project.created', b.customer_id, 'customer',
       b.status, b.operational_phase,
       jsonb_build_object('projectId', b.id, 'revision', b.lifecycle_revision),
       b.created_at
  FROM bookings b
ON CONFLICT (booking_id, aggregate_sequence) DO NOTHING;

-- Rollback is intentionally non-destructive during rollout: redeploy the
-- compatible backend and leave additive evidence tables/columns in place.
-- A separately reviewed cleanup migration may drop them only after retention,
-- audit and mobile compatibility windows have elapsed.
