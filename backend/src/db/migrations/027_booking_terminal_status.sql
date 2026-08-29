-- Align the persisted booking lifecycle with the canonical Project contract.
-- `terminated_after_start` is intentionally distinct from pre-start
-- cancellation and must fit the column before any termination command ships.

BEGIN;

-- PostgreSQL records `UPDATE OF status` triggers as column dependencies, so
-- they must be removed while the column type is widened. Their functions stay
-- installed and the triggers are recreated in the same transaction below.
DROP TRIGGER IF EXISTS trg_grounded_no_open_incident_completion ON bookings;
DROP TRIGGER IF EXISTS trg_grounded_block_revoked_fulfilment_start ON bookings;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE bookings
  ALTER COLUMN status TYPE VARCHAR(32);

ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN (
    'pending',
    'accepted',
    'in_progress',
    'completed',
    'cancelled',
    'terminated_after_start'
  ));

CREATE TRIGGER trg_grounded_no_open_incident_completion
BEFORE UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION grounded_enforce_no_open_incident_on_completion();

CREATE TRIGGER trg_grounded_block_revoked_fulfilment_start
BEFORE UPDATE OF status ON bookings
FOR EACH ROW EXECUTE FUNCTION grounded_block_revoked_fulfilment_start();

COMMIT;
