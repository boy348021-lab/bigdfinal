import dotenv from "dotenv";
dotenv.config();

const BASE = process.env.BASE_URL || "http://localhost:3005";

async function runRewardEligibilityTests() {
  console.log("===============================================================");
  console.log(" 🧪 TEST SUITE: Reward Eligibility & Currency Decoupling Audit");
  console.log("===============================================================\n");

  const { createClient } = await import("@supabase/supabase-js");
  const jwt = (await import("jsonwebtoken")).default;
  const supabaseUrl = process.env.SUPABASE_URL || "https://bcfghijkyzwm.supabase.co";
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Missing Supabase credentials in .env");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const JWT_SECRET = process.env.SESSION_SECRET || "bigdtv-dev-secret-change-in-production";

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = "") {
    if (condition) {
      console.log(`  ✅ PASS: ${title} ${extra}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${title} ${extra}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // SCENARIO 1: User with 45,000 BigD Coins and $0 Slots Wager
    // -------------------------------------------------------------
    console.log("\n--- SCENARIO 1: 45,000 Coins + $0 Live Slots Wager ---");
    const user1DiscordId = `test_coin_rich_${Date.now()}`;
    const { data: user1, error: u1Err } = await supabase
      .from("users")
      .insert({
        discord_id: user1DiscordId,
        discord_username: "CoinRichZeroWager",
        points: 45000
      })
      .select()
      .single();

    if (u1Err) throw u1Err;

    const token1 = jwt.sign({ userId: user1.id, username: user1.discord_username }, JWT_SECRET, { expiresIn: '1h' });

    // Check /api/rewards/weekly progression
    const resProg1 = await fetch(`${BASE}/api/rewards/weekly`, {
      headers: { Authorization: `Bearer ${token1}` }
    });
    const dataProg1 = await resProg1.json();

    assert("Progression shows 0 weekly slots wager", dataProg1.user_progression?.weekly_slots_wager === 0);
    assert("Progression shows 45,000 points balance", dataProg1.user_progression?.points_balance === 45000);
    assert("Progression current_tier is null (locked)", dataProg1.user_progression?.current_tier === null);

    // Attempt to claim Tier 1 ($5 Cash - requires $250 slots wager)
    const resClaim1 = await fetch(`${BASE}/api/rewards/weekly/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token1}`
      },
      body: JSON.stringify({ tier: 1 })
    });
    const dataClaim1 = await resClaim1.json();

    assert("Claim blocked with 403 Forbidden", resClaim1.status === 403);
    assert("Error message clearly specifies insufficient slots wager", dataClaim1.error && dataClaim1.error.includes("Insufficient slots wager"));

    // Verify user1 coin balance is still 45,000 (untouched)
    const { data: u1After } = await supabase.from("users").select("points").eq("id", user1.id).single();
    assert("User coin balance remained 45,000 after blocked claim", u1After?.points === 45000);

    // -------------------------------------------------------------
    // SCENARIO 2: User with 0 BigD Coins and $300 Slots Wager
    // -------------------------------------------------------------
    console.log("\n--- SCENARIO 2: 0 Coins + $300 Live Slots Wager ---");
    const user2DiscordId = `test_wager_qual_${Date.now()}`;
    const { data: user2, error: u2Err } = await supabase
      .from("users")
      .insert({
        discord_id: user2DiscordId,
        discord_username: "ZeroCoinsQualWager",
        points: 0
      })
      .select()
      .single();

    if (u2Err) throw u2Err;

    // Inject $300 Slots Wager for current week
    await supabase.from("wager_transactions").insert({
      user_id: user2.id,
      transaction_id: `tx_wager_300_${Date.now()}`,
      provider: "SLOTS",
      wager_amount_usd: 300.00,
      points_awarded: 3000,
      processed_at: new Date().toISOString()
    });

    const token2 = jwt.sign({ userId: user2.id, username: user2.discord_username }, JWT_SECRET, { expiresIn: '1h' });

    // Attempt to claim Tier 1 ($250 threshold)
    const resClaim2 = await fetch(`${BASE}/api/rewards/weekly/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token2}`
      },
      body: JSON.stringify({ tier: 1 })
    });
    const dataClaim2 = await resClaim2.json();

    assert("Tier 1 Claim succeeds with 200 OK", resClaim2.status === 200 && dataClaim2.success === true);
    assert("Cash value is $5", dataClaim2.cash_value === 5);

    // Verify 0 coins were deducted
    const { data: u2After } = await supabase.from("users").select("points").eq("id", user2.id).single();
    assert("User coin balance was not deducted on free wager claim", u2After?.points === 0);

    // -------------------------------------------------------------
    // SCENARIO 3: User with 45,000 Coins + $300 Slots Wager (0 Coins Deducted on Claim)
    // -------------------------------------------------------------
    console.log("\n--- SCENARIO 3: 45,000 Coins + $300 Live Slots Wager ---");
    const user3DiscordId = `test_both_${Date.now()}`;
    const { data: user3, error: u3Err } = await supabase
      .from("users")
      .insert({
        discord_id: user3DiscordId,
        discord_username: "BothCoinsAndWager",
        kick_username: "both_tester_kick",
        degencity_username: "both_tester_yeet",
        points: 45000
      })
      .select()
      .single();

    if (u3Err) throw u3Err;

    // Inject $300 Slots Wager
    await supabase.from("wager_transactions").insert({
      user_id: user3.id,
      transaction_id: `tx_both_300_${Date.now()}`,
      provider: "SLOTS",
      wager_amount_usd: 300.00,
      points_awarded: 3000,
      processed_at: new Date().toISOString()
    });

    const token3 = jwt.sign({ userId: user3.id, username: user3.discord_username }, JWT_SECRET, { expiresIn: '1h' });

    // Claim Tier 1
    const resClaim3 = await fetch(`${BASE}/api/rewards/weekly/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token3}`
      },
      body: JSON.stringify({ tier: 1 })
    });
    const dataClaim3 = await resClaim3.json();

    assert("Tier 1 Claim succeeds for eligible wagerer", resClaim3.status === 200 && dataClaim3.success === true);

    // Verify user3 still has exactly 45,000 points (0 coins deducted on weekly wager claim)
    const { data: u3After } = await supabase.from("users").select("points").eq("id", user3.id).single();
    assert("User coin balance strictly preserved at 45,000 (0 deducted)", u3After?.points === 45000);

    // -------------------------------------------------------------
    // SCENARIO 4: Double Claim Blocked
    // -------------------------------------------------------------
    console.log("\n--- SCENARIO 4: Double Claim Prevention ---");
    const resDoubleClaim = await fetch(`${BASE}/api/rewards/weekly/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token3}`
      },
      body: JSON.stringify({ tier: 1 })
    });
    const dataDoubleClaim = await resDoubleClaim.json();

    assert("Double claim is blocked with 400 Bad Request", resDoubleClaim.status === 400);
    assert("Error message states already redeemed", dataDoubleClaim.error && dataDoubleClaim.error.includes("already redeemed"));

    // -------------------------------------------------------------
    // SCENARIO 5: Higher Tier Insufficient Wager Blocked
    // -------------------------------------------------------------
    console.log("\n--- SCENARIO 5: Higher Tier ($1,000 Wager) with $300 Wager Blocked ---");
    const resClaimTier2 = await fetch(`${BASE}/api/rewards/weekly/claim`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token3}`
      },
      body: JSON.stringify({ tier: 2 })
    });
    assert("Tier 2 claim is blocked with 403 Forbidden", resClaimTier2.status === 403);

    // -------------------------------------------------------------
    // SCENARIO 6: Store Points Redemption Isolation
    // -------------------------------------------------------------
    console.log("\n--- SCENARIO 6: Store Points Redemption ($10 Tip) Isolation ---");
    const resStore = await fetch(`${BASE}/api/store/redeem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token3}`
      },
      body: JSON.stringify({ reward_id: "tip_10" })
    });
    const dataStore = await resStore.json();

    assert("Store Tip Redemption succeeds (deducting 10,000 points)", resStore.status === 200 && dataStore.ok === true);
    assert("New points balance returned is 35,000", dataStore.new_balance === 35000);

    // Check DB balance
    const { data: u3StoreAfter } = await supabase.from("users").select("points").eq("id", user3.id).single();
    assert("DB points balance is exactly 35,000", u3StoreAfter?.points === 35000);

    // Weekly wager progression remains completely unaffected
    const resProg3After = await fetch(`${BASE}/api/rewards/weekly`, {
      headers: { Authorization: `Bearer ${token3}` }
    });
    const dataProg3After = await resProg3After.json();
    assert("Weekly slots wager remains $300 after store redemption", dataProg3After.user_progression?.weekly_slots_wager === 300);

    // Cleanup test records
    await supabase.from("redemptions").delete().in("user_id", [user1.id, user2.id, user3.id]);
    await supabase.from("wager_transactions").delete().in("user_id", [user1.id, user2.id, user3.id]);
    await supabase.from("users").delete().in("id", [user1.id, user2.id, user3.id]);

  } catch (err) {
    console.error("Test execution error:", err);
    failed++;
  }

  console.log("\n===============================================================");
  console.log(` 🏁 RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log("===============================================================\n");

  if (failed > 0) process.exit(1);
}

runRewardEligibilityTests();
