-- 024_grounded_worker_payable_ledger.sql
--
-- Provider-neutral Phase 3 W10 ledger foundation. Entries preserve only
-- server-authoritative completed-Project payment evidence. The current build
-- has no approved platform-fee, Worker-net, beneficiary or payout contract,
-- so those values are deliberately constrained to unavailable/null instead
-- of being inferred from customer-paid value.

-- Composite evidence identities prevent a ledger entry from combining a
-- valid Project, Worker, completion snapshot or payment that belong to
-- different Projects. Each leading id is already globally unique; these
-- additive indexes make the cross-record ownership relation enforceable by
-- foreign keys as well.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_worker_evidence_identity
  ON bookings(id, labourer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grounded_commercial_snapshot_evidence_identity
  ON grounded_project_commercial_snapshots(id, booking_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_booking_evidence_identity
  ON payments(id, booking_id);

CREATE TABLE IF NOT EXISTS grounded_worker_payable_ledger_entries (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id                       UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  worker_id                        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  completion_snapshot_id           UUID NOT NULL
                                         REFERENCES grounded_project_commercial_snapshots(id)
                                         ON DELETE RESTRICT,
  source_payment_id                UUID REFERENCES payments(id) ON DELETE RESTRICT,
  entry_sequence                   INTEGER NOT NULL CHECK (entry_sequence > 0),
  entry_type                       VARCHAR(24) NOT NULL
                                         CHECK (entry_type IN ('recognition', 'reversal')),
  reason_code                      VARCHAR(48) NOT NULL
                                         CHECK (reason_code IN (
                                           'project_reconciled_paid',
                                           'project_reconciled_again',
                                           'payment_refunded',
                                           'payment_reconciliation_reversed',
                                           'project_disputed',
                                           'project_hold_applied',
                                           'project_completion_reversed'
                                         )),
  currency                         VARCHAR(3) NOT NULL DEFAULT 'ZAR'
                                         CHECK (currency = 'ZAR'),
  reconciled_paid_job_value_delta  NUMERIC(12,2) NOT NULL
                                         CHECK (reconciled_paid_job_value_delta <> 0),
  worker_gross_amount_delta        NUMERIC(12,2),
  platform_fee_amount_delta        NUMERIC(12,2),
  worker_net_amount_delta          NUMERIC(12,2),
  payable_amount_state             VARCHAR(24) NOT NULL DEFAULT 'unavailable'
                                         CHECK (payable_amount_state = 'unavailable'),
  payout_state                     VARCHAR(24) NOT NULL DEFAULT 'unavailable'
                                         CHECK (payout_state = 'unavailable'),
  source_fingerprint               CHAR(64) NOT NULL,
  source_evidence                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, entry_sequence),
  UNIQUE (booking_id, source_fingerprint),
  CONSTRAINT grounded_worker_ledger_unknown_money_chk CHECK (
    worker_gross_amount_delta IS NULL
    AND platform_fee_amount_delta IS NULL
    AND worker_net_amount_delta IS NULL
  ),
  CONSTRAINT grounded_worker_ledger_direction_chk CHECK (
    (entry_type = 'recognition' AND reconciled_paid_job_value_delta > 0)
    OR (entry_type = 'reversal' AND reconciled_paid_job_value_delta < 0)
  ),
  CONSTRAINT grounded_worker_ledger_evidence_chk CHECK (
    jsonb_typeof(source_evidence) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS idx_grounded_worker_ledger_worker_time
  ON grounded_worker_payable_ledger_entries(worker_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_grounded_worker_ledger_booking
  ON grounded_worker_payable_ledger_entries(booking_id, entry_sequence);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'grounded_worker_payable_ledger_entries'::regclass
       AND conname = 'grounded_worker_ledger_booking_worker_fk'
  ) THEN
    ALTER TABLE grounded_worker_payable_ledger_entries
      ADD CONSTRAINT grounded_worker_ledger_booking_worker_fk
      FOREIGN KEY (booking_id, worker_id)
      REFERENCES bookings(id, labourer_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'grounded_worker_payable_ledger_entries'::regclass
       AND conname = 'grounded_worker_ledger_snapshot_booking_fk'
  ) THEN
    ALTER TABLE grounded_worker_payable_ledger_entries
      ADD CONSTRAINT grounded_worker_ledger_snapshot_booking_fk
      FOREIGN KEY (completion_snapshot_id, booking_id)
      REFERENCES grounded_project_commercial_snapshots(id, booking_id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'grounded_worker_payable_ledger_entries'::regclass
       AND conname = 'grounded_worker_ledger_payment_booking_fk'
  ) THEN
    ALTER TABLE grounded_worker_payable_ledger_entries
      ADD CONSTRAINT grounded_worker_ledger_payment_booking_fk
      FOREIGN KEY (source_payment_id, booking_id)
      REFERENCES payments(id, booking_id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION grounded_worker_payable_ledger_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'grounded_worker_payable_ledger_entries is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS grounded_worker_payable_ledger_append_only
  ON grounded_worker_payable_ledger_entries;

CREATE TRIGGER grounded_worker_payable_ledger_append_only
BEFORE UPDATE OR DELETE ON grounded_worker_payable_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION grounded_worker_payable_ledger_reject_mutation();

-- No historical rows are backfilled here. Recognition is posted only when the
-- application rechecks current completion, locked commercial, payment and hold
-- evidence. That keeps legacy "completed" or "paid" flags from being promoted
-- without the complete canonical evidence set.
