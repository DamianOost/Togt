-- 025_double_blind_ratings.sql
--
-- Preserve the existing ratings identity while adding the publication state
-- required by C13. New submissions are sealed until both Project
-- participants submit or the fixed window closes. Existing ratings remain
-- published for backwards compatibility.

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(16);

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS publish_after TIMESTAMPTZ;

ALTER TABLE ratings
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

UPDATE ratings
   SET publication_status = 'published',
       publish_after = COALESCE(publish_after, created_at),
       published_at = COALESCE(published_at, created_at)
 WHERE publication_status IS NULL;

UPDATE ratings
   SET publish_after = created_at
 WHERE publish_after IS NULL;

UPDATE ratings
   SET published_at = created_at
 WHERE publication_status = 'published'
   AND published_at IS NULL;

ALTER TABLE ratings
  ALTER COLUMN publication_status SET DEFAULT 'sealed';

ALTER TABLE ratings
  ALTER COLUMN publication_status SET NOT NULL;

ALTER TABLE ratings
  ALTER COLUMN publish_after SET DEFAULT (NOW() + INTERVAL '14 days');

ALTER TABLE ratings
  ALTER COLUMN publish_after SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ratings_publication_state_chk'
       AND conrelid = 'ratings'::regclass
  ) THEN
    ALTER TABLE ratings
      ADD CONSTRAINT ratings_publication_state_chk CHECK (
        (publication_status = 'sealed' AND published_at IS NULL)
        OR (publication_status = 'published' AND published_at IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ratings_publication_due
  ON ratings(publish_after)
  WHERE publication_status = 'sealed';

CREATE INDEX IF NOT EXISTS idx_ratings_published_reviewee
  ON ratings(reviewee_id, created_at DESC)
  WHERE publication_status = 'published';
