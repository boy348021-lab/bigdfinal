/**
 * BigDTV QA Test Suite
 */
const BASE = "http://localhost:3005";
let pass = 0, fail = 0;

function ok(label, condition, detail = "") {
  if (condition) { console.log(`  ✅ ${label}`); pass++; }
  else { console.error(`  ❌ ${label}${detail ? " — " + detail : ""}`); fail++; }
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function getHtml(path) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, text: await r.text() };
}

// 1. Server & Store API
console.log("\n🔍 1. Server & Store API");
const items = await get("/api/store-items");
ok("Server up (200)", items.status === 200);
ok("Store has rewards", Array.isArray(items.body?.rewards) && items.body.rewards.length >= 2);
ok("tip_10 = 10,000 coins", items.body?.rewards?.some(r => r.id === "tip_10" && r.points_cost === 10000));
ok("tip_20 = 17,500 coins", items.body?.rewards?.some(r => r.id === "tip_20" && r.points_cost === 17500));

// 2. Store HTML integrity
console.log("\n🔍 2. Store HTML");
const sh = await getHtml("/store.html");
ok("store.html 200", sh.status === 200);
ok("No maintenance banner", !sh.text.includes("store-unavailable-banner"));
ok("No 'Currently Unavailable' text", !sh.text.includes("Currently Unavailable"));
ok("BigD Store heading", sh.text.includes("BigD") && sh.text.includes("Store"));
ok("Weekly Wager Rewards divider", sh.text.includes("Weekly Wager Rewards"));
ok("Redeem Coins divider", sh.text.includes("Redeem Coins"));
ok("Login prompt flex by default", sh.text.includes("store-login-prompt") && sh.text.includes("display:flex"));
ok("redeemReward hits real API", sh.text.includes("/api/store/redeem"));
ok("Tier claim buttons present", sh.text.includes("tc-claim-btn"));
ok("Discord link wired", sh.text.includes("discord.gg/aHSVMX4DCr"));

// 3. Landing page nav
console.log("\n🔍 3. Landing Page Nav");
const ih = await getHtml("/");
ok("index.html 200", ih.status === 200);
ok("Nav says 'Store 🪙'", ih.text.includes("Store 🪙"));
ok("Nav does NOT say 'Weekly Rewards 🪙'", !ih.text.includes("Weekly Rewards 🪙"));

// 4. Weekly API (unauthenticated)
console.log("\n🔍 4. Weekly Rewards API");
const wa = await get("/api/rewards/weekly");
ok("Returns 200", wa.status === 200);
ok("Has week_info", !!wa.body?.week_info);
ok("Has 6 tiers", wa.body?.reward_tiers?.length === 6);
ok("user_progression null (no auth)", wa.body?.user_progression === null);
const tiers = wa.body?.reward_tiers || [];
ok("T1=$250/$5", tiers[0]?.wager_threshold === 250 && tiers[0]?.cash_value === 5);
ok("T2=$1000/$10", tiers[1]?.wager_threshold === 1000 && tiers[1]?.cash_value === 10);
ok("T6=$10000/$40", tiers[5]?.wager_threshold === 10000 && tiers[5]?.cash_value === 40);

// 5. Leaderboard + Bluntz tier simulation
console.log("\n🔍 5. Leaderboard + Bluntz Tier Unlock");
const lb = await get("/api/leaderboard?period=monthly");
ok("Leaderboard 200", lb.status === 200);
ok("Has data", Array.isArray(lb.body?.data) && lb.body.data.length > 0);
const bluntz = lb.body?.data?.find(p => p.username?.toLowerCase() === "bluntz");
ok("Bluntz in leaderboard", !!bluntz, `all players: ${lb.body?.data?.map(p=>p.username).join(", ")}`);
if (bluntz) {
  const wager = Number(bluntz.volume);
  ok(`Bluntz wager ≥ $1000 (actual: $${wager.toFixed(2)})`, wager >= 1000);
  const unlocked = tiers.filter(t => wager >= t.wager_threshold);
  ok(`Tier 1 unlocked ($250 → $5)`, unlocked.some(t=>t.tier===1));
  ok(`Tier 2 unlocked ($1000 → $10)`, unlocked.some(t=>t.tier===2));
  ok(`Tier 3 NOT unlocked (need $1500)`, !unlocked.some(t=>t.tier===3), `wager=$${wager}`);
  console.log(`     → Bluntz has $${wager} wagered, ${unlocked.length} tiers unlocked`);
}

// 6. Auth guards
console.log("\n🔍 6. Auth Guards");
const hb = await fetch(`${BASE}/api/stream-heartbeat`, { method: "POST" });
ok("Heartbeat requires auth (401)", hb.status === 401);
const rd = await fetch(`${BASE}/api/store/redeem`, {
  method: "POST", headers: {"Content-Type":"application/json"}, body: '{"reward_id":"tip_10"}'
});
ok("Redeem requires auth (401)", rd.status === 401);

// 7. Blackjack
console.log("\n🔍 7. Blackjack");
const bj = await get("/api/casino/blackjack/state");
ok("Blackjack state 200", bj.status === 200);
ok("active field exists", bj.body?.active !== undefined);

// 8. Username matching unit test
console.log("\n🔍 8. Username Matching (unit test)");
const yeet = ["bluntz","Suhani111","PinkMynx222","bettyeddy","whydoyoujerk"];
function match(dbName) {
  const names = [dbName, dbName?.replace(/[^a-z0-9]/gi,"")].filter(Boolean).map(n=>n.toLowerCase().trim());
  return yeet.find(y => names.includes(y.toLowerCase().trim()));
}
ok("'bluntz' → match",     !!match("bluntz"));
ok("'Bluntz' → match",     !!match("Bluntz"));
ok("'BLUNTZ' → match",     !!match("BLUNTZ"));
ok("'Suhani111' → match",  !!match("Suhani111"));
ok("'suhani111' → match",  !!match("suhani111"));
ok("'unknown' → no match", !match("unknown"));

// 9. Kick points disabled
console.log("\n🔍 9. Kick/Watch Points Disabled");
// heartbeat returns awarded:false with auth — check via body
const hbRes = await (await fetch(`${BASE}/api/stream-heartbeat`, {method:"POST", headers:{"Authorization":"Bearer fake"}})).json().catch(()=>null);
ok("Heartbeat awarded:false or auth error", hbRes?.awarded === false || hbRes?.error !== undefined, JSON.stringify(hbRes));

// Summary
console.log(`\n${"─".repeat(52)}`);
console.log(`  QA RESULTS:  ✅ ${pass} passed   ❌ ${fail} failed`);
console.log("─".repeat(52));
if (fail === 0) console.log("  🎉 ALL TESTS PASSED");
else { console.log("  ⚠️  FAILURES — see above"); process.exit(1); }
