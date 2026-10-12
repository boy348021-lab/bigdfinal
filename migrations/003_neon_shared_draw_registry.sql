-- ==============================================================================
--  SHARED COMMUNITY DRAW REGISTRY (BIGDTV & BALLZS)
--  PostgreSQL / Neon compatible schema
-- ==============================================================================

-- 1. SITES (Registered client sites authorized to issue calls)
CREATE TABLE IF NOT EXISTS sites (
  id            TEXT PRIMARY KEY,              -- 'bigdtv', 'ballzs'
  name          TEXT NOT NULL,
  key_id        TEXT NOT NULL UNIQUE,          -- Public key identifier for HMAC
  secret_hash   TEXT NOT NULL,                 -- SHA-256 hash of secret key
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. PLAYERS (Global identity bridging Discord and verified Yeet account)
CREATE TABLE IF NOT EXISTS players (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id        TEXT UNIQUE,
  discord_username  TEXT,
  yeet_user_id      BIGINT UNIQUE,
  yeet_username     TEXT,
  registered_via    TEXT NOT NULL REFERENCES sites(id),
  link_status       TEXT NOT NULL DEFAULT 'verified' CHECK (link_status IN ('unverified', 'verified', 'revoked')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_players_discord_id ON players(discord_id);
CREATE INDEX IF NOT EXISTS idx_players_yeet_id ON players(yeet_user_id);
CREATE INDEX IF NOT EXISTS idx_players_yeet_name ON players(LOWER(yeet_username));

-- 3. CAMPAIGNS (Calendar month / period windows in US Eastern)
CREATE TABLE IF NOT EXISTS campaigns (
  id            TEXT PRIMARY KEY,              -- e.g. '2026-10'
  name          TEXT NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed', 'locked')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. DRAWS (Milestone thresholds per campaign)
CREATE TABLE IF NOT EXISTS draws (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  milestone_id    INTEGER NOT NULL CHECK (milestone_id BETWEEN 1 AND 3),
  target_usd      NUMERIC(12,2) NOT NULL,       -- $50,000, $100,000, $150,000 community milestone
  threshold_usd   NUMERIC(12,2) NOT NULL,       -- $3,000, $5,000, $10,000 individual wager requirement
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'drawn', 'cancelled')),
  seed_commitment TEXT,                         -- SHA-256 seed published when locked for provably-fair draw
  revealed_seed   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_draws_campaign_ms ON draws(campaign_id, milestone_id);

-- 5. REGISTRATIONS (Actual entries - STRICT DUPLICATE PREVENTION)
CREATE TABLE IF NOT EXISTS registrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id           UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  player_id         UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  yeet_user_id      BIGINT NOT NULL,
  yeet_username     TEXT NOT NULL,
  wager_usd_snapshot NUMERIC(12,2) NOT NULL,    -- Recorded eligible wager volume at entry
  source_site       TEXT NOT NULL REFERENCES sites(id),
  idempotency_key   TEXT,
  entered_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 1 entry per player per milestone draw
  CONSTRAINT uq_registrations_draw_player UNIQUE (draw_id, player_id),
  -- 1 entry per Yeet account per milestone draw (cross-site guarantee)
  CONSTRAINT uq_registrations_draw_yeet UNIQUE (draw_id, yeet_user_id),
  -- Idempotency per site
  CONSTRAINT uq_registrations_site_idemp UNIQUE (source_site, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reg_draw ON registrations(draw_id);
CREATE INDEX IF NOT EXISTS idx_reg_player ON registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_reg_yeet ON registrations(yeet_user_id);

-- 6. WAGER SNAPSHOTS (Synced directly from Yeet API across BIGDTV + BALLZS codes)
CREATE TABLE IF NOT EXISTS wager_snapshots (
  campaign_id       TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  yeet_user_id      BIGINT NOT NULL,
  yeet_username     TEXT,
  is_hidden         BOOLEAN NOT NULL DEFAULT false,
  monthly_wager     NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_points    NUMERIC(14,4) NOT NULL DEFAULT 0,
  source_codes      TEXT NOT NULL DEFAULT '',     -- 'BIGD', 'BALLZS', or 'BIGD + BALLZS'
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, yeet_user_id)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_campaign_user ON wager_snapshots(campaign_id, yeet_user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_name ON wager_snapshots(LOWER(yeet_username));

-- 7. AUDIT LOG (Immutable audit trail of all registration & link requests)
CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  action        TEXT NOT NULL,                  -- 'link_player', 'join_pool', 'sync_wagers', 'lock_draw'
  source_site   TEXT,
  discord_id    TEXT,
  yeet_user_id  BIGINT,
  milestone_id  INTEGER,
  status        TEXT NOT NULL,                  -- 'success', 'already_joined', 'ineligible', 'conflict', 'error'
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_player ON audit_log(yeet_user_id);

-- Default Sites Setup (Insert initial records if not present)
INSERT INTO sites (id, name, key_id, secret_hash)
VALUES
  ('bigdtv', 'BigDGamesTV', 'key_bigd_live_01', encode(digest('bigd_internal_secret_change_me', 'sha256'), 'hex')),
  ('ballzs', 'BigBallzTV',  'key_ballzs_live_01', encode(digest('ballzs_partner_secret_change_me', 'sha256'), 'hex'))
ON CONFLICT (id) DO NOTHING;
