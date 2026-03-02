-- Migration 002: Enhancements
-- Labourer service listings (for advertising their services)
CREATE TABLE IF NOT EXISTS labourer_services (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  labourer_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         VARCHAR(100) NOT NULL,
  description   TEXT,
  skill         VARCHAR(100) NOT NULL,
  rate_per_hour NUMERIC(10,2),
  photos        TEXT[] DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages between customer and labourer on a booking
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Device push tokens for notifications
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    VARCHAR(10) DEFAULT 'expo',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, token)
);

-- Add missing columns to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hours_actual NUMERIC(4,1);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add profile completeness + verification to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_number VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_labourer_services_skill ON labourer_services(skill);
CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
