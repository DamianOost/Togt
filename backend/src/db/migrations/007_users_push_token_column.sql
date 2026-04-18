-- Schema drift fix: users.push_token was added ad-hoc to the live togt DB
-- but never captured in a migration file. This migration records it so a
-- fresh checkout (or the togt_test DB) ends up with the same shape.
--
-- Context: notifications.js reads users.push_token; /auth/push-token writes
-- it. The separate push_tokens table (from 002_enhancements.sql) is legacy
-- and currently unused by any code path.

ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;
