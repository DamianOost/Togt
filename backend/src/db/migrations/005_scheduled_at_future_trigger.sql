-- Backstop: reject past scheduled_at at the DB layer so any future writer
-- (admin tool, direct SQL, migration bug) cannot bypass the application check.
-- Only BEFORE INSERT — a booking that was valid at creation may legitimately
-- remain "past" as real time marches on (e.g. during in_progress / completed).

CREATE OR REPLACE FUNCTION enforce_scheduled_at_future()
RETURNS trigger AS $$
BEGIN
  IF NEW.scheduled_at <= NOW() THEN
    RAISE EXCEPTION 'scheduled_at must be in the future (got %)', NEW.scheduled_at
      USING ERRCODE = '22007';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_scheduled_at_future ON bookings;
CREATE TRIGGER bookings_scheduled_at_future
  BEFORE INSERT ON bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_scheduled_at_future();
