-- Wave 1 address provenance is additive audit evidence. Historical and
-- compatible vc3/agent/MCP writes remain NULL; no source is inferred.

ALTER TABLE match_requests
  ADD COLUMN IF NOT EXISTS coordinate_source VARCHAR(32);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS coordinate_source VARCHAR(32);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'match_requests_coordinate_source_chk'
       AND conrelid = 'match_requests'::regclass
  ) THEN
    ALTER TABLE match_requests
      ADD CONSTRAINT match_requests_coordinate_source_chk CHECK (
        coordinate_source IS NULL
        OR coordinate_source IN (
          'map_pin', 'saved_verified_place', 'provider_geocode',
          'device_gps', 'entered_coordinates'
        )
      );
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'bookings_coordinate_source_chk'
       AND conrelid = 'bookings'::regclass
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_coordinate_source_chk CHECK (
        coordinate_source IS NULL
        OR coordinate_source IN (
          'map_pin', 'saved_verified_place', 'provider_geocode',
          'device_gps', 'entered_coordinates'
        )
      );
  END IF;
END $$;
