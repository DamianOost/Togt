-- Migration 004: Pre-Job Scope Checklist + Recurring Bookings + Change Orders + Safety

-- ── Scope confirmation ─────────────────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scope_items JSONB DEFAULT '[]';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scope_confirmed_by_customer BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scope_confirmed_by_labourer BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS scope_confirmed_at TIMESTAMPTZ;

-- ── Recurring bookings ─────────────────────────────────────────────────────
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurrence_pattern VARCHAR(20);
  -- values: weekly | fortnightly | monthly
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS parent_booking_id UUID REFERENCES bookings(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);

-- ── Change orders ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS change_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  requested_by  UUID NOT NULL REFERENCES users(id),
  description   TEXT NOT NULL,
  extra_hours   NUMERIC(4,1),
  extra_amount  NUMERIC(10,2),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined')),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_change_orders_booking ON change_orders(booking_id);

-- ── Safety / SOS events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sos_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  booking_id    UUID REFERENCES bookings(id),
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency contact on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(20);

-- ── Indices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_bookings_parent ON bookings(parent_booking_id);
CREATE INDEX IF NOT EXISTS idx_sos_user ON sos_events(user_id);
