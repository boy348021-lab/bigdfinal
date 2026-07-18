-- ============================================================
--  BigDTV — Supabase Database Schema
--  Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── USERS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id         TEXT        UNIQUE,
  discord_username   TEXT,
  discord_avatar     TEXT,
  kick_id            TEXT        UNIQUE,
  kick_username      TEXT,
  degencity_username TEXT,
  points             INTEGER     NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata           JSONB       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);
CREATE INDEX IF NOT EXISTS idx_users_kick_id    ON users(kick_id);

-- ── POINT TRANSACTION LOG ───────────────────────────────────
CREATE TABLE IF NOT EXISTS point_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points     INTEGER     NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_point_logs_user_id ON point_logs(user_id);

-- ── STORE ITEMS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  cost        INTEGER     NOT NULL,
  category    TEXT        DEFAULT 'general',
  stock       INTEGER     NOT NULL DEFAULT -1,  -- -1 = unlimited
  image_url   TEXT,
  available   BOOLEAN     NOT NULL DEFAULT true,
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ROW LEVEL SECURITY ──────────────────────────────────────
ALTER TABLE users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_items ENABLE ROW LEVEL SECURITY;

-- Store items: public read
CREATE POLICY "store_items_public_read" ON store_items
  FOR SELECT USING (true);

-- All writes done server-side via service_role key (bypasses RLS)
-- No direct client writes allowed

-- ── HELPER FUNCTION: award points atomically ─────────────────
CREATE OR REPLACE FUNCTION award_points(
  p_user_id UUID,
  p_points  INTEGER,
  p_reason  TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET points = points + p_points,
      last_seen_at = now()
  WHERE id = p_user_id;

  INSERT INTO point_logs (user_id, points, reason)
  VALUES (p_user_id, p_points, p_reason);
END;
$$;
