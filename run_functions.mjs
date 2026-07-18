// Run PL/pgSQL functions via direct pg connection (without splitting on semicolons)
import pg from 'pg';
const { Client } = pg;

const client = new Client({
  host:     'db.yqhvptfbzorbgrioqoyc.supabase.co',
  port:     5432,
  database: 'postgres',
  user:     'postgres',
  password: 'nycvox-1Xabwu-gyhsaj',
  ssl:      { rejectUnauthorized: false }
});

await client.connect();
console.log('Connected!');

const functions = [
`
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
$$
`,
`
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
  UPDATE redemptions
    SET status = 'rejected', admin_note = p_admin_note, updated_at = NOW()
  WHERE id = p_redemption_id;
  PERFORM modify_points(
    v_redemption.user_id,
    v_redemption.points_cost,
    'refund_rejected_redemption',
    'store_rejection',
    'redemption_' || p_redemption_id::TEXT
  );
END;
$$
`,
`
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
`,
`DROP TRIGGER IF EXISTS redemptions_updated_at ON redemptions`,
`
CREATE TRIGGER redemptions_updated_at
  BEFORE UPDATE ON redemptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at()
`
];

for (const fn of functions) {
  try {
    await client.query(fn);
    const preview = fn.trim().split('\n')[0].substring(0, 70);
    console.log('✅', preview);
  } catch (e) {
    const preview = fn.trim().split('\n')[0].substring(0, 70);
    console.error('❌', preview);
    console.error('   ', e.message);
  }
}

await client.end();
console.log('\nFunctions migration done!');
