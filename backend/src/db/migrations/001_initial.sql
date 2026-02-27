-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (customers and labourers)
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) UNIQUE NOT NULL,
  phone         VARCHAR(20) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'labourer')),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Labourer-specific profile details
CREATE TABLE IF NOT EXISTS labourer_profiles (
  user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  skills        TEXT[] NOT NULL DEFAULT '{}',
  hourly_rate   NUMERIC(10,2) NOT NULL DEFAULT 0,
  bio           TEXT,
  id_number     VARCHAR(20),
  is_available  BOOLEAN DEFAULT false,
  current_lat   DOUBLE PRECISION,
  current_lng   DOUBLE PRECISION,
  rating_avg    NUMERIC(3,2) DEFAULT 0,
  rating_count  INTEGER DEFAULT 0
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES users(id),
  labourer_id   UUID NOT NULL REFERENCES users(id),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','in_progress','completed','cancelled')),
  skill_needed  VARCHAR(100) NOT NULL,
  address       TEXT NOT NULL,
  location_lat  DOUBLE PRECISION NOT NULL,
  location_lng  DOUBLE PRECISION NOT NULL,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  hours_est     NUMERIC(4,1),
  total_amount  NUMERIC(10,2),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        UUID NOT NULL REFERENCES bookings(id),
  amount            NUMERIC(10,2) NOT NULL,
  currency          VARCHAR(5) DEFAULT 'ZAR',
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','paid','failed','refunded')),
  peach_checkout_id TEXT,
  peach_result_code TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Ratings
CREATE TABLE IF NOT EXISTS ratings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(id),
  reviewer_id  UUID NOT NULL REFERENCES users(id),
  reviewee_id  UUID NOT NULL REFERENCES users(id),
  score        SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(booking_id, reviewer_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_labourer_profiles_available ON labourer_profiles(is_available);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_labourer ON bookings(labourer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_ratings_reviewee ON ratings(reviewee_id);
