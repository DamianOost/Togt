-- 020_grounded_trust_relationships.sql
--
-- Phase 3 trust, relationship, recurrence and safety/support foundation.
-- This migration is additive. It deliberately does not manufacture an
-- operated SOS service, support acknowledgement, recurring booking, worker
-- substitution, price, or cancellation outcome. Those states require an
-- explicit actor and durable evidence.

CREATE TABLE IF NOT EXISTS grounded_favourites (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  worker_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  status            VARCHAR(16) NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'removed', 'blocked')),
  revision          BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at        TIMESTAMPTZ,
  UNIQUE (customer_id, worker_id),
  CONSTRAINT grounded_favourite_distinct_users_chk CHECK (customer_id <> worker_id),
  CONSTRAINT grounded_favourite_status_dates_chk CHECK (
    (status = 'active' AND removed_at IS NULL)
    OR (status IN ('removed', 'blocked') AND removed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_favourites_customer_active
  ON grounded_favourites(customer_id, created_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS grounded_relationship_blocks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  blocked_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  reason_code       VARCHAR(40) NOT NULL CHECK (
                      reason_code IN (
                        'safety_concern', 'harassment', 'inappropriate_contact',
                        'work_dispute', 'do_not_match', 'other'
                      )
                    ),
  status            VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status = 'active'),
  revision          BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_user_id, blocked_user_id),
  CONSTRAINT grounded_block_distinct_users_chk CHECK (blocker_user_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_grounded_blocks_bilateral
  ON grounded_relationship_blocks(blocker_user_id, blocked_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_grounded_blocks_reverse
  ON grounded_relationship_blocks(blocked_user_id, blocker_user_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS grounded_rebook_drafts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id                 UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  preferred_worker_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_booking_id           UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  source_service_label        VARCHAR(100) NOT NULL,
  source_scope_snapshot       JSONB NOT NULL,
  editable_scope              JSONB NOT NULL,
  broad_area_label            VARCHAR(160),
  requested_starts_at         TIMESTAMPTZ,
  status                      VARCHAR(16) NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft', 'blocked', 'abandoned')),
  revision                    BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  price_reconfirmation        BOOLEAN NOT NULL DEFAULT TRUE CHECK (price_reconfirmation = TRUE),
  location_reconfirmation     BOOLEAN NOT NULL DEFAULT TRUE CHECK (location_reconfirmation = TRUE),
  schedule_reconfirmation     BOOLEAN NOT NULL DEFAULT TRUE CHECK (schedule_reconfirmation = TRUE),
  availability_reconfirmation BOOLEAN NOT NULL DEFAULT TRUE CHECK (availability_reconfirmation = TRUE),
  substitution_policy         VARCHAR(32) NOT NULL DEFAULT 'none'
                                CHECK (substitution_policy = 'none'),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grounded_rebook_scope_objects_chk CHECK (
    jsonb_typeof(source_scope_snapshot) = 'object'
    AND jsonb_typeof(editable_scope) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_rebook_customer
  ON grounded_rebook_drafts(customer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS grounded_recurring_series (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  worker_id                UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_booking_id        UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  status                   VARCHAR(32) NOT NULL DEFAULT 'awaiting_acceptance' CHECK (
                             status IN (
                               'awaiting_acceptance', 'terms_change_pending',
                               'active', 'paused', 'resume_requested',
                               'cancellation_requested', 'cancelled', 'blocked'
                             )
                           ),
  revision                 BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  current_terms_revision   INTEGER CHECK (current_terms_revision IS NULL OR current_terms_revision > 0),
  proposed_terms_revision  INTEGER CHECK (proposed_terms_revision IS NULL OR proposed_terms_revision > 0),
  proposed_by              UUID REFERENCES users(id) ON DELETE RESTRICT,
  paused_by                UUID REFERENCES users(id) ON DELETE RESTRICT,
  resume_requested_by      UUID REFERENCES users(id) ON DELETE RESTRICT,
  cancellation_requested_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at             TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  blocked_at               TIMESTAMPTZ,
  CONSTRAINT grounded_series_distinct_users_chk CHECK (customer_id <> worker_id),
  CONSTRAINT grounded_series_proposal_chk CHECK (
    (status IN ('awaiting_acceptance', 'terms_change_pending')
      AND proposed_terms_revision IS NOT NULL AND proposed_by IS NOT NULL)
    OR (status NOT IN ('awaiting_acceptance', 'terms_change_pending'))
  ),
  CONSTRAINT grounded_series_terminal_dates_chk CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_series_customer
  ON grounded_recurring_series(customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_grounded_series_worker
  ON grounded_recurring_series(worker_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS grounded_recurring_terms (
  series_id                    UUID NOT NULL REFERENCES grounded_recurring_series(id) ON DELETE RESTRICT,
  terms_revision               INTEGER NOT NULL CHECK (terms_revision > 0),
  service_snapshot             JSONB NOT NULL,
  schedule_snapshot            JSONB NOT NULL,
  commercial_snapshot          JSONB NOT NULL,
  substitution_policy          VARCHAR(40) NOT NULL CHECK (
                                 substitution_policy IN (
                                   'no_substitution', 'explicit_approval_each_time'
                                 )
                               ),
  cancellation_policy_version  VARCHAR(80) NOT NULL,
  terms_hash                   CHAR(64) NOT NULL,
  proposed_by                  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, terms_revision),
  CONSTRAINT grounded_recurring_terms_objects_chk CHECK (
    jsonb_typeof(service_snapshot) = 'object'
    AND jsonb_typeof(schedule_snapshot) = 'object'
    AND jsonb_typeof(commercial_snapshot) = 'object'
  )
);

CREATE TABLE IF NOT EXISTS grounded_recurring_acceptances (
  series_id       UUID NOT NULL,
  terms_revision  INTEGER NOT NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  terms_hash      CHAR(64) NOT NULL,
  accepted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, terms_revision, user_id),
  FOREIGN KEY (series_id, terms_revision)
    REFERENCES grounded_recurring_terms(series_id, terms_revision) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS grounded_recurring_occurrences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id        UUID NOT NULL,
  terms_revision   INTEGER NOT NULL,
  sequence_number  INTEGER NOT NULL CHECK (sequence_number > 0),
  scheduled_at     TIMESTAMPTZ NOT NULL,
  status           VARCHAR(24) NOT NULL DEFAULT 'proposed' CHECK (
                     status IN (
                       'proposed', 'planned', 'held', 'change_pending',
                       'cancelled', 'completed', 'superseded'
                     )
                   ),
  booking_id       UUID UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (series_id, terms_revision, sequence_number),
  FOREIGN KEY (series_id, terms_revision)
    REFERENCES grounded_recurring_terms(series_id, terms_revision) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_grounded_occurrences_series
  ON grounded_recurring_occurrences(series_id, terms_revision, scheduled_at);

CREATE TABLE IF NOT EXISTS grounded_recurring_occurrence_changes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id             UUID NOT NULL REFERENCES grounded_recurring_series(id) ON DELETE RESTRICT,
  occurrence_id         UUID NOT NULL REFERENCES grounded_recurring_occurrences(id) ON DELETE RESTRICT,
  change_kind           VARCHAR(16) NOT NULL CHECK (change_kind IN ('reschedule', 'cancel')),
  proposed_scheduled_at TIMESTAMPTZ,
  status                VARCHAR(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'accepted', 'declined')),
  requested_by          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_by            UUID REFERENCES users(id) ON DELETE RESTRICT,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at            TIMESTAMPTZ,
  CONSTRAINT grounded_occurrence_change_schedule_chk CHECK (
    (change_kind = 'reschedule' AND proposed_scheduled_at IS NOT NULL)
    OR (change_kind = 'cancel' AND proposed_scheduled_at IS NULL)
  ),
  CONSTRAINT grounded_occurrence_change_decision_chk CHECK (
    (status = 'pending' AND decided_by IS NULL AND decided_at IS NULL)
    OR (status IN ('accepted', 'declined') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_occurrence_one_pending_change
  ON grounded_recurring_occurrence_changes(occurrence_id)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS grounded_support_incidents (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  booking_id                    UUID REFERENCES bookings(id) ON DELETE RESTRICT,
  case_kind                     VARCHAR(16) NOT NULL CHECK (case_kind IN ('safety', 'support')),
  category                      VARCHAR(40) NOT NULL CHECK (
                                  category IN (
                                    'immediate_danger', 'injury', 'harassment',
                                    'unsafe_work', 'property_damage', 'payment_or_work',
                                    'account_help', 'other'
                                  )
                                ),
  summary                       TEXT NOT NULL CHECK (char_length(trim(summary)) BETWEEN 3 AND 2000),
  intake_channel                VARCHAR(24) NOT NULL DEFAULT 'in_app_record'
                                  CHECK (intake_channel = 'in_app_record'),
  state                         VARCHAR(16) NOT NULL DEFAULT 'received' CHECK (
                                  state IN ('received', 'acknowledged', 'escalated', 'resolved', 'failed')
                                ),
  revision                      BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  operations_alerted            BOOLEAN NOT NULL DEFAULT FALSE CHECK (operations_alerted = FALSE),
  emergency_services_dispatched BOOLEAN NOT NULL DEFAULT FALSE CHECK (emergency_services_dispatched = FALSE),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at               TIMESTAMPTZ,
  escalated_at                  TIMESTAMPTZ,
  resolved_at                   TIMESTAMPTZ,
  failed_at                     TIMESTAMPTZ,
  CONSTRAINT grounded_incident_state_dates_chk CHECK (
    (state = 'received' AND acknowledged_at IS NULL AND escalated_at IS NULL
      AND resolved_at IS NULL AND failed_at IS NULL)
    OR (state = 'acknowledged' AND acknowledged_at IS NOT NULL
      AND escalated_at IS NULL AND resolved_at IS NULL AND failed_at IS NULL)
    OR (state = 'escalated' AND acknowledged_at IS NOT NULL
      AND escalated_at IS NOT NULL AND resolved_at IS NULL AND failed_at IS NULL)
    OR (state = 'resolved' AND acknowledged_at IS NOT NULL
      AND resolved_at IS NOT NULL AND failed_at IS NULL)
    OR (state = 'failed' AND failed_at IS NOT NULL AND resolved_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_incidents_reporter
  ON grounded_support_incidents(reporter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grounded_incidents_open_booking
  ON grounded_support_incidents(booking_id, state)
  WHERE booking_id IS NOT NULL AND state IN ('received', 'acknowledged', 'escalated');

CREATE TABLE IF NOT EXISTS grounded_trust_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type     VARCHAR(32) NOT NULL CHECK (
                       aggregate_type IN (
                         'favourite', 'relationship_block', 'rebook_draft',
                         'recurring_series', 'safety_incident', 'support_case'
                       )
                     ),
  aggregate_id       UUID NOT NULL,
  aggregate_sequence BIGINT NOT NULL CHECK (aggregate_sequence > 0),
  schema_version     SMALLINT NOT NULL DEFAULT 1 CHECK (schema_version > 0),
  event_type         VARCHAR(80) NOT NULL,
  actor_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_role         VARCHAR(20) NOT NULL CHECK (actor_role IN ('customer', 'labourer', 'system')),
  payload            JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (aggregate_type, aggregate_id, aggregate_sequence),
  CONSTRAINT grounded_trust_event_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_grounded_trust_events_timeline
  ON grounded_trust_events(aggregate_type, aggregate_id, aggregate_sequence);

CREATE TABLE IF NOT EXISTS grounded_trust_outbox (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL UNIQUE REFERENCES grounded_trust_events(id) ON DELETE RESTRICT,
  topic              VARCHAR(64) NOT NULL DEFAULT 'trust.lifecycle',
  aggregate_type     VARCHAR(32) NOT NULL,
  aggregate_id       UUID NOT NULL,
  aggregate_sequence BIGINT NOT NULL CHECK (aggregate_sequence > 0),
  payload            JSONB NOT NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'dispatched', 'failed', 'suppressed')),
  attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_at      TIMESTAMPTZ,
  CONSTRAINT grounded_trust_outbox_payload_chk CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_grounded_trust_outbox_pending
  ON grounded_trust_outbox(status, available_at, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS grounded_trust_command_receipts (
  actor_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  command_type    VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(255) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 255),
  resource_id     UUID,
  request_hash    CHAR(64) NOT NULL,
  response_status SMALLINT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  PRIMARY KEY (actor_user_id, command_type, idempotency_key),
  CONSTRAINT grounded_trust_receipt_response_chk CHECK (
    (response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
    OR (response_status BETWEEN 200 AND 499 AND response_body IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_trust_receipts_retention
  ON grounded_trust_command_receipts(created_at);

-- One canonical, symmetric block predicate. Callers never need to infer which
-- party created the record.
CREATE OR REPLACE FUNCTION grounded_relationship_pair_blocked(user_a UUID, user_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM grounded_relationship_blocks b
     WHERE b.status = 'active'
       AND (
         (b.blocker_user_id = user_a AND b.blocked_user_id = user_b)
         OR (b.blocker_user_id = user_b AND b.blocked_user_id = user_a)
       )
  );
$$;

-- Relationship eligibility is deliberately fail-closed. Legacy completion
-- or a merely attempted payment is insufficient evidence.
CREATE OR REPLACE FUNCTION grounded_relationship_eligible(
  target_booking_id UUID,
  target_customer_id UUID,
  target_worker_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM bookings b
      JOIN grounded_project_completions c
        ON c.booking_id = b.id AND c.status = 'confirmed'
     WHERE b.id = target_booking_id
       AND b.customer_id = target_customer_id
       AND b.labourer_id = target_worker_id
       AND b.status = 'completed'
       AND (
         SELECT p.status
           FROM payments p
          WHERE p.booking_id = b.id
          ORDER BY p.created_at DESC, p.id DESC
          LIMIT 1
       ) = 'paid'
       AND NOT grounded_relationship_pair_blocked(target_customer_id, target_worker_id)
       AND NOT EXISTS (
         SELECT 1 FROM grounded_project_issues i
          WHERE i.booking_id = b.id
            AND i.status IN ('open', 'acknowledged', 'under_review')
       )
       AND NOT EXISTS (
         SELECT 1 FROM grounded_support_incidents si
          WHERE si.booking_id = b.id
            AND si.state IN ('received', 'acknowledged', 'escalated')
       )
       AND NOT EXISTS (
         SELECT 1 FROM sos_events legacy_sos
          WHERE legacy_sos.booking_id = b.id
       )
  );
$$;

-- Database-level safety net for all current and future route implementations.
-- It prevents a blocked pair from becoming a booking, receiving a match ping,
-- or exchanging a new chat message even if an older route forgets the check.
CREATE OR REPLACE FUNCTION grounded_enforce_unblocked_booking_pair()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF grounded_relationship_pair_blocked(NEW.customer_id, NEW.labourer_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'grounded_relationship_block_active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grounded_unblocked_booking_pair ON bookings;
CREATE TRIGGER trg_grounded_unblocked_booking_pair
BEFORE INSERT OR UPDATE OF customer_id, labourer_id ON bookings
FOR EACH ROW EXECUTE FUNCTION grounded_enforce_unblocked_booking_pair();

CREATE OR REPLACE FUNCTION grounded_enforce_unblocked_match_attempt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  match_customer UUID;
BEGIN
  SELECT customer_id INTO match_customer
    FROM match_requests
   WHERE id = NEW.match_request_id;
  IF match_customer IS NOT NULL
     AND grounded_relationship_pair_blocked(match_customer, NEW.labourer_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'grounded_relationship_block_active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grounded_unblocked_match_attempt ON match_attempts;
CREATE TRIGGER trg_grounded_unblocked_match_attempt
BEFORE INSERT ON match_attempts
FOR EACH ROW EXECUTE FUNCTION grounded_enforce_unblocked_match_attempt();

CREATE OR REPLACE FUNCTION grounded_enforce_unblocked_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  booking_customer UUID;
  booking_worker UUID;
BEGIN
  SELECT customer_id, labourer_id
    INTO booking_customer, booking_worker
    FROM bookings
   WHERE id = NEW.booking_id;
  IF booking_customer IS NOT NULL
     AND grounded_relationship_pair_blocked(booking_customer, booking_worker) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'grounded_relationship_block_active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grounded_unblocked_message ON messages;
CREATE TRIGGER trg_grounded_unblocked_message
BEFORE INSERT ON messages
FOR EACH ROW EXECUTE FUNCTION grounded_enforce_unblocked_message();

-- An open Phase 3 safety record blocks every completion path, including old
-- compatibility routes. No route may close fulfilment over an unresolved case.
CREATE OR REPLACE FUNCTION grounded_enforce_no_open_incident_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND EXISTS (
       SELECT 1 FROM grounded_support_incidents si
        WHERE si.booking_id = NEW.id
          AND si.state IN ('received', 'acknowledged', 'escalated')
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'grounded_open_safety_incident';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grounded_no_open_incident_completion ON bookings;
CREATE TRIGGER trg_grounded_no_open_incident_completion
BEFORE UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION grounded_enforce_no_open_incident_on_completion();

-- Canonical incident state progression. Even a future operations client must
-- follow received -> acknowledged -> escalated/resolved, or an explicit fail.
CREATE OR REPLACE FUNCTION grounded_validate_incident_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.state = 'received' AND NEW.state IN ('acknowledged', 'failed'))
    OR (OLD.state = 'acknowledged' AND NEW.state IN ('escalated', 'resolved', 'failed'))
    OR (OLD.state = 'escalated' AND NEW.state IN ('resolved', 'failed'))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'grounded_incident_transition_invalid';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grounded_incident_transition ON grounded_support_incidents;
CREATE TRIGGER trg_grounded_incident_transition
BEFORE UPDATE OF state ON grounded_support_incidents
FOR EACH ROW EXECUTE FUNCTION grounded_validate_incident_transition();

-- No catalogue, relationship, series, incident, acknowledgement or response
-- fixture is seeded. Operational enablement remains a separate release gate.
