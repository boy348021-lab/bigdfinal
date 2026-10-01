-- ============================================================
--  BigDTV — Milestone Random Selection Pool
--  Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ── MILESTONE POOL ENTRIES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_pool_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id    INTEGER     NOT NULL CHECK (milestone_id BETWEEN 1 AND 3),
  yeet_username   TEXT        NOT NULL,
  wager_at_entry  NUMERIC(12,2) NOT NULL,
  entered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  campaign_month  TEXT        NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  drawn           BOOLEAN     NOT NULL DEFAULT false,
  won             BOOLEAN     NOT NULL DEFAULT false,

  -- One entry per user per milestone per campaign month
  UNIQUE(user_id, milestone_id, campaign_month)
);

CREATE INDEX IF NOT EXISTS idx_mpe_milestone ON milestone_pool_entries(milestone_id, campaign_month);
CREATE INDEX IF NOT EXISTS idx_mpe_user      ON milestone_pool_entries(user_id);

-- RLS: all writes via service_role (server-side only)
ALTER TABLE milestone_pool_entries ENABLE ROW LEVEL SECURITY;
