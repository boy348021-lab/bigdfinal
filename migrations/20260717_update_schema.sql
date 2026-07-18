-- ============================================================
-- BigDTV Platform Update — Schema Migration 2026-07-17
-- ============================================================

-- ── Update users table ────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS degencity_link_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS degencity_verification_status TEXT DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS kick_id TEXT;

-- Index for kick_id lookups (login flow)
CREATE INDEX IF NOT EXISTS users_kick_id_idx ON users(kick_id);

-- ── Audit Logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action               TEXT NOT NULL,          -- e.g. 'chat_points', 'wager_points', 'redeem', 'refund'
  points_before        INTEGER NOT NULL DEFAULT 0,
  points_after         INTEGER NOT NULL DEFAULT 0,
  source               TEXT,                   -- e.g. 'kick_chat', 'degencity_wager', 'store_redeem'
  transaction_reference TEXT,                  -- external tx ID or internal ref
  metadata             JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

-- ── Wager Transactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wager_transactions (
  id                BIGSERIAL PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id    TEXT UNIQUE NOT NULL,       -- idempotency key from webhook
  provider          TEXT NOT NULL DEFAULT 'degencity',
  wager_amount_usd  NUMERIC(14,6) NOT NULL,
  points_awarded    INTEGER NOT NULL,
  processed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS wager_tx_user_idx ON wager_transactions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS wager_tx_id_idx ON wager_transactions(transaction_id);

-- ── Redemptions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS redemptions (
  id             BIGSERIAL PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id      TEXT NOT NULL,               -- e.g. 'tip_10', 'tip_20'
  reward_label   TEXT NOT NULL,
  points_cost    INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|paid|completed|rejected
  admin_note     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS redemptions_user_idx ON redemptions(user_id);
CREATE INDEX IF NOT EXISTS redemptions_status_idx ON redemptions(status);

-- ── Transactional Point Modification Function ─────────────────────────────────
-- Usage: SELECT modify_points(user_id, delta, action, source, reference);
-- Returns the new balance or raises an exception on insufficient funds (when delta < 0).
CREATE OR REPLACE FUNCTION modify_points(
  p_user_id  UUID,
  p_delta    INTEGER,
  p_action   TEXT,
  p_source   TEXT DEFAULT NULL,
  p_ref      TEXT DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_before INTEGER;
  v_after  INTEGER;
BEGIN
  -- Lock the user row for the duration of the transaction
  SELECT points INTO v_before FROM users WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id;
  END IF;

  v_after := v_before + p_delta;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'Insufficient points: has %, needs %', v_before, ABS(p_delta);
  END IF;

  UPDATE users SET points = v_after WHERE id = p_user_id;

  INSERT INTO audit_logs(user_id, action, points_before, points_after, source, transaction_reference)
  VALUES (p_user_id, p_action, v_before, v_after, p_source, p_ref);

  RETURN v_after;
END;
$$;

-- ── Rejection Refund Function ─────────────────────────────────────────────────
-- Atomically rejects a redemption and refunds the points.
CREATE OR REPLACE FUNCTION reject_redemption(
  p_redemption_id BIGINT,
  p_admin_note    TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_redemption redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption FROM redemptions WHERE id = p_redemption_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Redemption % not found', p_redemption_id;
  END IF;

  IF v_redemption.status IN ('completed', 'rejected') THEN
    RAISE EXCEPTION 'Cannot reject a redemption with status %', v_redemption.status;
  END IF;

  -- Update redemption status
  UPDATE redemptions
    SET status = 'rejected', admin_note = p_admin_note, updated_at = NOW()
  WHERE id = p_redemption_id;

  -- Refund points
  PERFORM modify_points(
    v_redemption.user_id,
    v_redemption.points_cost,
    'refund_rejected_redemption',
    'store_rejection',
    'redemption_' || p_redemption_id::TEXT
  );
END;
$$;

-- ── Keep redemptions.updated_at fresh on update ───────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS redemptions_updated_at ON redemptions;
CREATE TRIGGER redemptions_updated_at
  BEFORE UPDATE ON redemptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
