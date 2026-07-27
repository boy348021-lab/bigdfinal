console.log("RUNNING NEW SERVER.JS");
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import session from "express-session";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "crypto";
import fs from "fs";
import { readFile } from "fs/promises";
import { WebSocket } from "ws";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY      = process.env.DEGEN_API_KEY || "e7d0fb2a-20fd-471e-b6a2-f2989ea7ecba";
const KICK_CHANNEL = "bigdgamestv";

// Baseline wagers recorded up to July 15th (from user verification)
const JULY_15_BASELINES = {
  "armedupmused": 7458.45,
  "wisthechad": 1620.75,
  "supermustang": 1038.46,
  "tommytapz": 357.67,
  "ninjazod": 301.68,
  "raneoner": 180.70,
  "jcoolincuz": 105.47,
  "dbigluffy": 69.87,
  "tonykukkur": 49.33,
  "angelvssinner": 48.26,
  "degenbigd": 44.23,
  "tusharju567": 25.00,
  "bellybutton": 22.00,
  "oliviagirl": 18.26,
  "lavrona": 16.14,
  "tycenoxbigd": 11.23,
  "zyrexop": 11.00,
  "roket": 8.33,
  "younis123": 1.10
};


// Leaderboard period: 16 Jul – 31 Jul 2026 (fixed)
// Before is 2026-08-01 (exclusive upper bound so Jul 31 is fully included)
const LB_PERIOD_AFTER  = "2026-07-16";
const LB_PERIOD_BEFORE = "2026-08-01";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl     = process.env.SUPABASE_URL     || process.env.NEXT_PUBLIC_SUPABASE_URL || "https://yqhvptfbzorbgrioqoyc.supabase.co";
const supabaseKey     = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxaHZwdGZiem9yYmdyaW9xb3ljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzkyMTUzNSwiZXhwIjoyMDk5NDk3NTM1fQ.UZgvlsrx6NXtBS5OV2uiOv0nJXEt_ewbRTjqHP6KumI";
const supabase        = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (!supabase) {
  console.warn("⚠️  Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env");
}

// Auto-detect the base URL: prefer explicit env var, then Vercel URL, then production domain, then localhost
const BASE_URL = process.env.BASE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || (process.env.NODE_ENV === 'production' ? 'https://bigdtv.vip' : null)
  || `http://localhost:${PORT}`;

console.log(`BASE_URL: ${BASE_URL}`);

// Admin secret for admin endpoints (set ADMIN_SECRET in .env)
const ADMIN_SECRET = process.env.ADMIN_SECRET || "bigdtv-admin-change-me";

// ─── JWT & OAuth Configuration ────────────────────────────────────────────────
const JWT_SECRET = process.env.SESSION_SECRET || "bigdtv-dev-secret-change-in-production";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${BASE_URL}/auth/discord/callback`;

const KICK_CLIENT_ID = process.env.KICK_CLIENT_ID || "";
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET || "";
const KICK_REDIRECT_URI = process.env.KICK_REDIRECT_URI || `${BASE_URL}/auth/kick/callback`;

app.use(cors());

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET || "bigdtv-dev-secret-change-in-production"));

app.use(session({
  secret:            process.env.SESSION_SECRET || "bigdtv-dev-secret-change-in-production",
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000   // 7 days
  }
}));

app.use(express.static(path.join(__dirname, "public")));

// PKCE Helper Functions (for Kick OAuth2)
function base64url(buffer) {
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function generatePkceChallenge(verifier) {
  const hash = createHash('sha256').update(verifier).digest();
  return base64url(hash);
}

// JWT verification middleware
async function requireAuth(req, res, next) {
  let token = null;

  // Check Authorization header first
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Fallback to cookie
  if (!token && req.cookies && req.cookies.bigdtv_token) {
    token = req.cookies.bigdtv_token;
  }

  // Fallback to query param for OAuth redirects
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: "No authentication token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = { sub: decoded.userId, ...decoded };

    if (supabase && decoded.userId) {
      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("id", decoded.userId)
        .maybeSingle();

      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (err) {
    console.error("Authentication error:", err.message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Alias for backwards compatibility
const requireClerkAuth = requireAuth;

// ─── Kick Live Status ─────────────────────────────────────────────────────────
let kickCache = { live: false, checkedAt: null };
const KICK_CACHE_TTL = 45_000;

function fetchKickViaPython() {
  return new Promise((resolve) => {
    const script = path.join(__dirname, "kick_status.py");
    execFile("python3", [script], { timeout: 12_000 }, (err, stdout) => {
      if (err) {
        console.error("Kick Python helper error:", err.message);
        return resolve({ live: false, ok: false });
      }
      try { resolve(JSON.parse(stdout)); }
      catch (e) { resolve({ live: false, ok: false }); }
    });
  });
}

function etDateStringToUTC(dateStr, timeStr = "00:00:00") {
  // Parse YYYY-MM-DD + HH:MM:SS as Eastern Time and return the correct UTC Date.
  // Strategy: construct a UTC timestamp, ask what ET time that corresponds to,
  // then compute the ET→UTC offset and apply it correctly.
  const [datePart] = dateStr.split("T");
  const [timePart] = timeStr ? [timeStr] : ["00:00:00"];
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s] = timePart.split(":").map(Number);

  // Start with a naive UTC timestamp (will be off by the ET offset)
  const naive = new Date(Date.UTC(y, mo - 1, d, h, mi, s));

  // Find what ET clock time this naive UTC maps to
  const etStr = naive.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
  const match = etStr.match(/(\d+)\/(\d+)\/(\d+),\s*(\d+):(\d+):(\d+)/);
  if (!match) return naive;

  // Build what the ET clock said as a UTC reference point
  const etAsUTC = new Date(Date.UTC(
    Number(match[3]),
    Number(match[1]) - 1,
    Number(match[2]),
    Number(match[4]) === 24 ? 0 : Number(match[4]),
    Number(match[5]),
    Number(match[6])
  ));

  // The offset is: naive_UTC - ET_as_UTC = the true UTC offset for this moment
  const offsetMs = naive.getTime() - etAsUTC.getTime();

  // Correct UTC = naive + offset (shift naive UTC so that ET interpretation gives desired time)
  return new Date(naive.getTime() + offsetMs);
}

// ─── Leaderboard — 15-Day and Lifetime ────────────────────────────────────────
function parseToISODate(dateStr) {
  if (!dateStr) return "";
  // Check if format is DD/MM/YYYY
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      const day = parts[0].padStart(2, "0");
      const month = parts[1].padStart(2, "0");
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  // Fallback to standard parsing
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  } catch (err) {}
  return dateStr;
}

app.get("/api/leaderboard", async (req, res) => {
  const { after, before } = req.query;

  const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // ─── LEADERBOARD B: 15-Day (Biweekly) Leaderboard ───────────────────────────
  if (req.query.period === "biweekly") {
    try {
      const afterStr = after || "";
      const isoAfter = parseToISODate(afterStr);
      const dateParts = isoAfter.split("-");
      const targetMonth = dateParts.length >= 2 ? `${dateParts[0]}-${dateParts[1]}` : new Date().toISOString().slice(0, 7);

      // Check for manual override data from degencity_leaderboard_override.json
      const overridePath = path.join(__dirname, "degencity_leaderboard_override.json");
      if (fs.existsSync(overridePath)) {
        try {
          const overrideContent = fs.readFileSync(overridePath, "utf8");
          const overrideData = JSON.parse(overrideContent);
          if (Array.isArray(overrideData) && overrideData.length > 0) {
            const formatted = overrideData.map(u => ({
              user_id: u.user_id || 1,
              username: u.username,
              wager_data: [
                {
                  month: targetMonth,
                  total_wager_usd: Number(u.wager) || 0
                }
              ],
              _currentWager: Number(u.wager) || 0
            })).sort((a, b) => b.wager_data[0].total_wager_usd - a.wager_data[0].total_wager_usd);

            res.set("Cache-Control", "no-store");
            return res.json({ data: formatted });
          }
        } catch (err) {
          console.error("Failed to parse degencity_leaderboard_override.json:", err);
        }
      }

      // Determine baseline date dynamically (day before start date)
      let userBaselines = {};
      if (isoAfter && /^\d{4}-\d{2}-\d{2}$/.test(isoAfter)) {
        try {
          const startDate = new Date(isoAfter + "T00:00:00Z");
          startDate.setUTCDate(startDate.getUTCDate() - 1);
          const baselineDateStr = startDate.toISOString().slice(0, 10);
          
          const baselinesPath = path.join(__dirname, "baselines.json");
          if (fs.existsSync(baselinesPath)) {
            const baselinesContent = fs.readFileSync(baselinesPath, "utf8");
            const baselinesObj = JSON.parse(baselinesContent);
            userBaselines = baselinesObj[baselineDateStr] || {};
          }
        } catch (err) {
          console.error("Error loading baseline from baselines.json:", err);
        }
      }


      // Fetch current data from DegenCity API with robust fallback on error/timeout
      let rawList = [];
      try {
        let url = "https://api.degencity.com/api/v1/partner/affiliates/leaderboard";
        const params = new URLSearchParams();
        if (after) params.append("after", after);
        if (before) params.append("before", before);
        if (params.toString()) url += "?" + params.toString();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout
        
        const response = await fetch(url, {
          method:  "GET",
          headers: { 
            "x-api-key": API_KEY, 
            "Accept": "application/json",
            "User-Agent": USER_AGENT
          },
          signal:  controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
          
          // Cache successful response to degencity_leaderboard_fallback.json
          try {
            const fallbackPath = path.join(__dirname, "degencity_leaderboard_fallback.json");
            fs.writeFileSync(fallbackPath, JSON.stringify(data, null, 2));
          } catch (writeErr) {
            console.error("Failed to write to local fallback JSON:", writeErr);
          }
        } else {
          throw new Error(`HTTP Error: ${response.status}`);
        }
      } catch (fetchErr) {
        console.warn("DegenCity API fetch failed, loading from local JSON fallback:", fetchErr.message);
        try {
          const fallbackPath = path.join(__dirname, "degencity_leaderboard_fallback.json");
          if (fs.existsSync(fallbackPath)) {
            const fallbackContent = fs.readFileSync(fallbackPath, "utf8");
            const data = JSON.parse(fallbackContent);
            rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
          } else {
            console.error("Local fallback JSON does not exist at:", fallbackPath);
          }
        } catch (readErr) {
          console.error("Failed to read local fallback JSON:", readErr);
        }
      }

      const formatted = rawList.map(u => {
        const uname = u.username || "";
        const unameKey = uname.toLowerCase();

        const monthObj = (u.wager_data || []).find(m => m.month === targetMonth);
        const currentWager = monthObj ? (Number(monthObj.total_wager_usd) || 0) : 0;

        // Subtracted net wager: Current MTD - July 15 Baseline
        const baseWager = Number(userBaselines[unameKey] || 0);
        const netWager = Math.max(0, currentWager - baseWager);

        return {
          user_id: u.user_id || 1,
          username: uname,
          wager_data: [
            {
              month: targetMonth,
              total_wager_usd: netWager
            }
          ],
          _currentWager: currentWager
        };
      }).sort((a, b) => (b.wager_data[0].total_wager_usd - a.wager_data[0].total_wager_usd) || (b._currentWager - a._currentWager));

      res.set("Cache-Control", "no-store");
      return res.json({ data: formatted });
    } catch (err) {
      console.error("Biweekly leaderboard calculation error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  // ─── LEADERBOARD A: Lifetime Leaderboard (Direct Proxy to DegenCity API) ─────────────
  try {
    let url = "https://api.degencity.com/api/v1/partner/affiliates/leaderboard";
    const params = new URLSearchParams();
    if (after)  params.append("after",  after);
    if (before) params.append("before", before);
    if (params.toString()) url += "?" + params.toString();

    const response = await fetch(url, {
      method:  "GET",
      headers: { 
        "x-api-key": API_KEY, 
        "Accept": "application/json",
        "User-Agent": USER_AGENT
      }
    });
    const data = await response.json();
    res.set("Cache-Control", "no-store");
    res.status(response.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Store Items ──────────────────────────────────────────────────────────────
const STORE_REWARDS = [
  {
    id:          "tip_10",
    label:       "$10 Tip",
    description: "Redeem your coins for a $10 Tip sent directly to BigDGamesTV on Kick.",
    points_cost: 10000,
    emoji:       "💵"
  },
  {
    id:          "tip_20",
    label:       "$20 Tip",
    description: "Redeem your coins for a $20 Tip sent directly to BigDGamesTV on Kick.",
    points_cost: 17500,
    emoji:       "💰"
  }
];

app.get("/api/store-items", (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ rewards: STORE_REWARDS });
});

// ─── Points API ───────────────────────────────────────────────────────────────
app.get("/api/points/:userId", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  const { data, error } = await supabase
    .from("users")
    .select("points, kick_username")
    .eq("id", req.params.userId)
    .single();
  if (error) return res.status(404).json({ error: "User not found" });
  res.json(data);
});

// Heartbeat endpoint removed

// ─── Wager Webhook ─────────────────────────────────────────────────────────────
// Expected payload: { transaction_id, degencity_username, wager_amount_usd, provider? }
// 10 points per $1 wagered. Idempotent — duplicate transaction_ids are silently skipped.
app.post("/api/webhooks/wager", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });

  const { transaction_id, degencity_username, wager_amount_usd, provider = "degencity" } = req.body;

  if (!transaction_id || !degencity_username || wager_amount_usd == null) {
    return res.status(400).json({ error: "Missing required fields: transaction_id, degencity_username, wager_amount_usd" });
  }
  if (isNaN(wager_amount_usd) || Number(wager_amount_usd) <= 0) {
    return res.status(400).json({ error: "Invalid wager_amount_usd" });
  }

  const amount = Number(wager_amount_usd);
  const points = Math.floor(amount * 10);

  try {
    // 1) Look up user by degencity_username
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("degencity_username", degencity_username.trim().toLowerCase())
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: `No user found for DegenCity username: ${degencity_username}` });
    }

    // 2) Check for duplicate transaction (idempotency)
    const { data: existing } = await supabase
      .from("wager_transactions")
      .select("id")
      .eq("transaction_id", transaction_id)
      .single();

    if (existing) {
      return res.status(200).json({ ok: true, duplicate: true, message: "Transaction already processed" });
    }

    // 3) Award points transactionally
    const { data: newBalance, error: rpcErr } = await supabase.rpc("modify_points", {
      p_user_id: user.id,
      p_delta:   points,
      p_action:  "wager_points",
      p_source:  "degencity_wager",
      p_ref:     transaction_id
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // 4) Log the wager transaction
    await supabase.from("wager_transactions").insert({
      user_id:          user.id,
      transaction_id,
      provider,
      wager_amount_usd: amount,
      points_awarded:   points
    });

    console.log(`💸 Wager: ${degencity_username} wagered $${amount} → +${points} points (tx: ${transaction_id})`);
    res.json({ ok: true, points_awarded: points, new_balance: newBalance });

  } catch (err) {
    console.error("Wager webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Store Redemption ─────────────────────────────────────────────────────────
app.post("/api/store/redeem", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(404).json({ error: "User profile not found. Please log in first." });

  // Mandatory validation: Kick & DegenCity connections required
  if (!req.user.kick_username) {
    return res.status(400).json({ error: "Kick account connection required before redeeming rewards. Please connect Kick on the Store page." });
  }
  if (!req.user.degencity_username) {
    return res.status(400).json({ error: "DegenCity username verification required before redeeming rewards. Please verify code BIGD on Code Check page." });
  }

  const { reward_id } = req.body;
  const userId        = req.user.id;

  const reward = STORE_REWARDS.find(r => r.id === reward_id);
  if (!reward) return res.status(400).json({ error: "Invalid reward_id" });

  try {
    // Deduct points atomically — throws if insufficient
    const { data: newBalance, error: rpcErr } = await supabase.rpc("modify_points", {
      p_user_id: userId,
      p_delta:   -reward.points_cost,
      p_action:  "store_redeem",
      p_source:  "store",
      p_ref:     `${reward_id}_${Date.now()}`
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // Create redemption record
    const { data: redemption } = await supabase
      .from("redemptions")
      .insert({
        user_id:     userId,
        reward_id,
        reward_label: reward.label,
        points_cost: reward.points_cost,
        status:      "pending"
      })
      .select("id, status, created_at")
      .single();

    console.log(`🛒 Redemption: user ${userId} redeemed ${reward.label} (${reward.points_cost} pts)`);
    res.json({ ok: true, redemption, new_balance: newBalance });

  } catch (err) {
    const msg = err.message || "";
    if (msg.toLowerCase().includes("insufficient")) {
      return res.status(402).json({ error: "Insufficient points balance" });
    }
    console.error("Redeem error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── User Redemption History ──────────────────────────────────────────────────
app.get("/api/store/redemptions", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(404).json({ error: "User profile not found. Please sync first." });
  const { data, error } = await supabase
    .from("redemptions")
    .select("id, reward_id, reward_label, points_cost, status, admin_note, created_at, updated_at")
    .eq("user_id", req.user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ redemptions: data || [] });
});

// ─── CASINO: BLACKJACK MODULE ─────────────────────────────────────────────────
const activeBlackjackGames = new Map();

const SUITS_LIST = ['♥', '♦', '♣', '♠'];
const RANKS_LIST = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createBlackjackShoe(numDecks = 6) {
  const cards = [];
  for (let i = 0; i < numDecks; i++) {
    for (const suit of SUITS_LIST) {
      for (const rank of RANKS_LIST) {
        cards.push({
          suit,
          rank,
          isRed: suit === '♥' || suit === '♦',
          value: ['J', 'Q', 'K'].includes(rank) ? 10 : (rank === 'A' ? 11 : parseInt(rank, 10))
        });
      }
    }
  }
  // Fisher-Yates Shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function calcHandScore(cards) {
  let score = 0;
  let aces = 0;
  for (const c of cards) {
    score += c.value;
    if (c.rank === 'A') aces++;
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return {
    score,
    isBust: score > 21,
    isBlackjack: score === 21 && cards.length === 2,
    isSoft: aces > 0 && score <= 21
  };
}

async function saveBlackjackHistory(userId, handState) {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("blackjack_history")
      .insert({
        user_id: userId,
        bet_amount: handState.bet,
        payout: handState.payout,
        outcome: handState.outcome,
        player_score: handState.playerScore,
        dealer_score: handState.dealerScore,
        player_cards: handState.playerCards,
        dealer_cards: handState.dealerCards,
        created_at: new Date().toISOString()
      });

    if (error && (error.message.includes("relation") || error.code === "42P01")) {
      // Fallback: log to points_ledger if blackjack_history table is not created yet
      await supabase.from("points_ledger").insert({
        user_id: userId,
        delta: handState.payout - handState.bet,
        action: "blackjack_hand",
        source: "blackjack",
        ref_id: `${handState.outcome}_bet${handState.bet}_pay${handState.payout}`,
        created_at: new Date().toISOString()
      }).catch(() => {});
    }
  } catch (e) {
    console.warn("Could not save blackjack history:", e.message);
  }
}

app.post("/api/casino/blackjack/deal", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const bet = parseInt(req.body.bet, 10);
  if (isNaN(bet) || bet < 0) {
    return res.status(400).json({ error: "Invalid bet amount" });
  }

  const userId = req.user.id;

  try {
    let newBalance = req.user.points || 0;

    // Deduct bet atomically if bet > 0
    if (bet > 0) {
      const { data: balData, error: rpcErr } = await supabase.rpc("modify_points", {
        p_user_id: userId,
        p_delta: -bet,
        p_action: "blackjack_bet",
        p_source: "blackjack",
        p_ref: `bj_bet_${Date.now()}`
      });

      if (rpcErr) {
        if (rpcErr.message.toLowerCase().includes("insufficient")) {
          return res.status(402).json({ error: "Insufficient BigD Coins balance" });
        }
        throw new Error(rpcErr.message);
      }
      newBalance = balData;
    }

    // Get or create shoe for user session
    let shoe = createBlackjackShoe(6);

    const playerCards = [shoe.pop(), shoe.pop()];
    const dealerCards = [shoe.pop(), shoe.pop()];

    const playerCalc = calcHandScore(playerCards);
    const dealerCalc = calcHandScore(dealerCards);

    let isEnded = false;
    let outcome = null;
    let payout = 0;

    if (playerCalc.isBlackjack) {
      isEnded = true;
      if (dealerCalc.isBlackjack) {
        outcome = 'push';
        payout = bet; // Return bet
      } else {
        outcome = 'blackjack';
        payout = Math.floor(bet * 2.5); // 3:2 payout (bet + 1.5x)
      }
    }

    let updatedBalance = newBalance;

    if (isEnded && payout > 0) {
      const { data: balAfterPayout } = await supabase.rpc("modify_points", {
        p_user_id: userId,
        p_delta: payout,
        p_action: "blackjack_payout",
        p_source: "blackjack",
        p_ref: `bj_pay_${Date.now()}`
      });
      if (balAfterPayout !== null && balAfterPayout !== undefined) {
        updatedBalance = balAfterPayout;
      }
    }

    const handState = {
      handId: `bj_${Date.now()}`,
      bet,
      playerCards,
      dealerCards,
      playerScore: playerCalc.score,
      dealerScore: dealerCalc.score,
      dealerVisibleScore: calcHandScore([dealerCards[0]]).score,
      isEnded,
      outcome,
      payout,
      shoe
    };

    if (isEnded) {
      activeBlackjackGames.delete(userId);
      saveBlackjackHistory(userId, handState);
    } else {
      activeBlackjackGames.set(userId, handState);
    }

    res.json({
      ok: true,
      new_balance: updatedBalance,
      handState: {
        ...handState,
        shoe: undefined
      }
    });

  } catch (err) {
    console.error("Blackjack deal error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/casino/blackjack/action", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const userId = req.user.id;
  const game = activeBlackjackGames.get(userId);

  if (!game || game.isEnded) {
    return res.status(400).json({ error: "No active hand found. Please deal a new hand." });
  }

  const { action } = req.body;
  let updatedBalance = undefined;

  try {
    if (action === 'hit') {
      game.playerCards.push(game.shoe.pop());
      const pCalc = calcHandScore(game.playerCards);
      game.playerScore = pCalc.score;

      if (pCalc.isBust) {
        game.isEnded = true;
        game.outcome = 'bust';
        game.payout = 0;
        activeBlackjackGames.delete(userId);
      }
    } else if (action === 'stand' || action === 'double') {
      if (action === 'double') {
        // Deduct extra bet
        const { data: newBal, error: rpcErr } = await supabase.rpc("modify_points", {
          p_user_id: userId,
          p_delta: -game.bet,
          p_action: "blackjack_double",
          p_source: "blackjack",
          p_ref: `bj_dbl_${Date.now()}`
        });

        if (rpcErr) {
          return res.status(402).json({ error: "Insufficient balance to double down" });
        }
        updatedBalance = newBal;
        game.bet *= 2;
        game.playerCards.push(game.shoe.pop());
        game.playerScore = calcHandScore(game.playerCards).score;
      }

      // Dealer Turn (Stand on Soft 17)
      if (game.playerScore <= 21) {
        let dCalc = calcHandScore(game.dealerCards);
        while (dCalc.score < 17 || (dCalc.score === 17 && dCalc.isSoft)) {
          game.dealerCards.push(game.shoe.pop());
          dCalc = calcHandScore(game.dealerCards);
        }
        game.dealerScore = dCalc.score;

        game.isEnded = true;

        if (dCalc.isBust) {
          game.outcome = 'win';
          game.payout = game.bet * 2;
        } else if (game.playerScore > game.dealerScore) {
          game.outcome = 'win';
          game.payout = game.bet * 2;
        } else if (game.playerScore < game.dealerScore) {
          game.outcome = 'loss';
          game.payout = 0;
        } else {
          game.outcome = 'push';
          game.payout = game.bet;
        }
      } else {
        game.isEnded = true;
        game.outcome = 'bust';
        game.payout = 0;
      }

      if (game.payout > 0) {
        const { data: balAfterPay } = await supabase.rpc("modify_points", {
          p_user_id: userId,
          p_delta: game.payout,
          p_action: "blackjack_payout",
          p_source: "blackjack",
          p_ref: `bj_pay_${Date.now()}`
        });
        if (balAfterPay !== null && balAfterPay !== undefined) {
          updatedBalance = balAfterPay;
        }
      }

      activeBlackjackGames.delete(userId);
      saveBlackjackHistory(userId, game);
    } else if (game.isEnded) {
      activeBlackjackGames.delete(userId);
      saveBlackjackHistory(userId, game);
    }

    res.json({
      ok: true,
      new_balance: updatedBalance,
      handState: {
        ...game,
        shoe: undefined
      }
    });

  } catch (err) {
    console.error("Blackjack action error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Admin — Redemptions ──────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const key = req.headers["x-admin-secret"] || req.query.admin_secret;
  if (key !== ADMIN_SECRET) return res.status(403).json({ error: "Forbidden" });
  next();
}

app.get("/api/admin/redemptions", requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  const { data, error } = await supabase
    .from("redemptions")
    .select("id, user_id, reward_id, reward_label, points_cost, status, admin_note, created_at, updated_at")
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ redemptions: data || [] });
});

// Admin update redemption status
app.post("/api/admin/redemptions/:id", requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });

  const redemptionId = Number(req.params.id);
  const { status, admin_note } = req.body;
  const validStatuses = ["approved", "paid", "completed", "rejected"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
  }

  try {
    if (status === "rejected") {
      // Use the transactional rejection function (refunds points)
      const { error: rpcErr } = await supabase.rpc("reject_redemption", {
        p_redemption_id: redemptionId,
        p_admin_note:    admin_note || null
      });
      if (rpcErr) throw new Error(rpcErr.message);
    } else {
      const { error: upErr } = await supabase
        .from("redemptions")
        .update({ status, admin_note: admin_note || null })
        .eq("id", redemptionId);
      if (upErr) throw new Error(upErr.message);
    }
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /auth/discord (Redirect to Discord OAuth2) ───────────────────────────
app.get("/auth/discord", (req, res) => {
  const state = randomBytes(16).toString('hex');
  if (req.session) req.session.oauth_state = state;

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state: state
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

// ─── GET /auth/discord/callback ───────────────────────────────────────────────
app.get("/auth/discord/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.redirect("/verify.html?error=discord_denied");
  }

  if (req.session && req.session.oauth_state && state !== req.session.oauth_state) {
    return res.redirect("/verify.html?error=state_mismatch");
  }
  if (req.session) delete req.session.oauth_state;

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BigDTV-OAuth/1.0'
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: DISCORD_REDIRECT_URI
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Discord token exchange failed:", tokenRes.status, errText);
      return res.redirect("/verify.html?error=discord_failed");
    }

    const tokenData = await tokenRes.json();

    // Fetch Discord user profile
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'User-Agent': 'BigDTV-OAuth/1.0'
      }
    });

    if (!userRes.ok) {
      const errText = await userRes.text();
      console.error("Discord user fetch failed:", userRes.status, errText);
      return res.redirect("/verify.html?error=discord_failed");
    }

    const discordUser = await userRes.json();
    const discordId = discordUser.id;
    const discordUsername = discordUser.username;
    const discordAvatar = discordUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`;

    if (!supabase) {
      return res.redirect("/verify.html?error=database_unavailable");
    }

    // Look up or create user by discord_id
    let { data: dbUser } = await supabase
      .from("users")
      .select("*")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (dbUser) {
      // Update existing user
      const { data: updatedUser } = await supabase
        .from("users")
        .update({
          discord_username: discordUsername,
          discord_avatar: discordAvatar,
          display_name: discordUser.global_name || discordUsername,
          avatar_url: discordAvatar,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", dbUser.id)
        .select()
        .single();

      dbUser = updatedUser || dbUser;
      console.log(`Discord login: returning user ${discordUsername} (${discordId})`);
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          discord_id: discordId,
          discord_username: discordUsername,
          discord_avatar: discordAvatar,
          display_name: discordUser.global_name || discordUsername,
          avatar_url: discordAvatar,
          auth_provider: 'discord',
          points: 0,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        console.error("Create user error:", createError.message);
        return res.redirect("/verify.html?error=discord_failed");
      }
      dbUser = newUser;
      console.log(`Discord login: created new user ${discordUsername} (${discordId})`);
    }

    // Sync discord linked account
    const { data: existingLink } = await supabase
      .from("linked_accounts")
      .select("*")
      .eq("user_id", dbUser.id)
      .eq("provider", "discord")
      .maybeSingle();

    if (existingLink) {
      await supabase
        .from("linked_accounts")
        .update({
          provider_user_id: discordId,
          username: discordUsername,
          display_name: discordUser.global_name || discordUsername,
          avatar_url: discordAvatar,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingLink.id);
    } else {
      await supabase
        .from("linked_accounts")
        .insert({
          user_id: dbUser.id,
          provider: "discord",
          provider_user_id: discordId,
          username: discordUsername,
          display_name: discordUser.global_name || discordUsername,
          avatar_url: discordAvatar,
          linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }

    // Issue long-lived 365-day JWT
    const jwtPayload = {
      userId: dbUser.id,
      discordId: discordId,
      discordUsername: discordUsername
    };
    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: '365d' });

    // Set persistent 365-day cookie
    res.cookie('bigdtv_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.redirect(`/verify.html?token=${encodeURIComponent(token)}&success=discord`);

  } catch (err) {
    console.error("Discord OAuth callback error:", err.message, err.cause || "");
    res.redirect("/verify.html?error=discord_failed");
  }
});

// ─── GET /auth/kick (Redirect to Kick OAuth2 or Username Form) ────────────────
app.get("/auth/kick", requireAuth, (req, res) => {
  const kickClientPlaceholder = !KICK_CLIENT_ID || KICK_CLIENT_ID.startsWith("YOUR_");

  if (kickClientPlaceholder) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connect Kick Channel — BigDTV</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>
          body { background: #080810; color: #f0e8ff; font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #14143a; padding: 36px 28px; border-radius: 14px; border: 1px solid rgba(83, 250, 93, 0.4); text-align: center; max-width: 420px; width: 100%; box-shadow: 0 0 40px rgba(136, 0, 255, 0.25); }
          h2 { font-size: 1.5rem; color: #53fa5d; margin-top: 0; margin-bottom: 10px; }
          p { font-size: 0.9rem; color: #a099c0; margin-bottom: 24px; line-height: 1.5; }
          input { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 14px; color: #fff; width: 100%; font-size: 1rem; text-align: center; outline: none; box-sizing: border-box; margin-bottom: 20px; font-weight: bold; }
          input:focus { border-color: #53fa5d; box-shadow: 0 0 15px rgba(83, 250, 93, 0.3); }
          button { background: #53fa5d; color: #000; border: none; padding: 14px 28px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 1rem; text-transform: uppercase; width: 100%; transition: all 0.2s; }
          button:hover { background: #6eff78; transform: translateY(-1px); box-shadow: 0 0 20px rgba(83, 250, 93, 0.5); }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Connect Kick Account</h2>
          <p>Enter your exact Kick username to link your Kick channel and start earning chat activity points.</p>
          <form action="/auth/kick/callback" method="GET">
            <input type="hidden" name="token" value="${req.query.token || ''}" />
            <input type="text" name="code" placeholder="Your Kick Username..." required />
            <button type="submit">Verify & Link Kick</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  // Real PKCE Kick OAuth with signed JWT state token
  const verifier = randomBytes(32).toString('hex');
  const challenge = generatePkceChallenge(verifier);
  const stateToken = jwt.sign({ userId: req.user.id, verifier }, JWT_SECRET, { expiresIn: '15m' });

  const params = new URLSearchParams({
    client_id: KICK_CLIENT_ID,
    redirect_uri: KICK_REDIRECT_URI,
    response_type: 'code',
    scope: 'user.read',
    state: stateToken,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  res.redirect(`https://id.kick.com/oauth/authorize?${params.toString()}`);
});

// ─── GET /auth/kick/callback ─────────────────────────────────────────────────
app.get("/auth/kick/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const kickClientPlaceholder = !KICK_CLIENT_ID || KICK_CLIENT_ID.startsWith("YOUR_");

  let targetUserId = null;

  // Try to authenticate via header/cookie/query token first
  let token = req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : null;
  if (!token && req.cookies && req.cookies.bigdtv_token) token = req.cookies.bigdtv_token;
  if (!token && req.query && req.query.token) token = req.query.token;

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      targetUserId = decoded.userId;
    } catch (e) {}
  }

  // If state token is passed, verify state JWT to recover user ID and verifier
  let verifier = null;
  if (state && state !== 'mock_state') {
    try {
      const decodedState = jwt.verify(state, JWT_SECRET);
      if (decodedState && decodedState.userId) {
        targetUserId = decodedState.userId;
        verifier = decodedState.verifier;
      }
    } catch (e) {
      console.warn("Kick OAuth state decode warning:", e.message);
    }
  }

  // If user cancelled or if error parameter returned from Kick
  if (error || !code) {
    // If client ID is placeholder or OAuth failed/cancelled, present clean input page
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Connect Kick Channel — BigDTV</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <style>
          body { background: #080810; color: #f0e8ff; font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #14143a; padding: 36px 28px; border-radius: 14px; border: 1px solid rgba(83, 250, 93, 0.4); text-align: center; max-width: 420px; width: 100%; box-shadow: 0 0 40px rgba(136, 0, 255, 0.25); }
          h2 { font-size: 1.5rem; color: #53fa5d; margin-top: 0; margin-bottom: 10px; }
          p { font-size: 0.9rem; color: #a099c0; margin-bottom: 24px; line-height: 1.5; }
          input { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 14px; color: #fff; width: 100%; font-size: 1rem; text-align: center; outline: none; box-sizing: border-box; margin-bottom: 20px; font-weight: bold; }
          input:focus { border-color: #53fa5d; box-shadow: 0 0 15px rgba(83, 250, 93, 0.3); }
          button { background: #53fa5d; color: #000; border: none; padding: 14px 28px; border-radius: 8px; font-weight: 800; cursor: pointer; font-size: 1rem; text-transform: uppercase; width: 100%; transition: all 0.2s; }
          button:hover { background: #6eff78; transform: translateY(-1px); box-shadow: 0 0 20px rgba(83, 250, 93, 0.5); }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Connect Kick Channel</h2>
          <p>Enter your Kick username to link your Kick channel and unlock chat rewards.</p>
          <form action="/auth/kick/callback" method="GET">
            <input type="hidden" name="token" value="${token || ''}" />
            <input type="text" name="code" placeholder="Your Kick Username..." required />
            <button type="submit">Verify & Link Kick</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  if (!targetUserId) {
    return res.redirect("/verify.html?error=kick_failed");
  }

  let kickUsername = "";
  let kickUserId = "";

  if (kickClientPlaceholder || !state || state === 'mock_state' || !verifier) {
    // Input code is the username
    kickUsername = code.trim();
    kickUserId = `kick_${Math.floor(Math.random() * 100000000)}`;
  } else {
    // Real PKCE token exchange & API call
    try {
      const tokenRes = await fetch('https://id.kick.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: KICK_CLIENT_ID,
          client_secret: KICK_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: KICK_REDIRECT_URI,
          code_verifier: verifier
        })
      });

      if (!tokenRes.ok) {
        console.error("Kick token exchange failed:", await tokenRes.text());
        // Fallback to code as username if token exchange rejected
        kickUsername = code.trim();
        kickUserId = `kick_${Math.floor(Math.random() * 100000000)}`;
      } else {
        const tokenData = await tokenRes.json();

        // Get user profile
        const userRes = await fetch('https://api.kick.com/public/v1/users', {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        if (!userRes.ok) {
          console.error("Kick user profile fetch failed:", await userRes.text());
          kickUsername = code.trim();
          kickUserId = `kick_${Math.floor(Math.random() * 100000000)}`;
        } else {
          const kickData = await userRes.json();
          kickUsername = kickData.username;
          kickUserId = kickData.id;
        }
      }
    } catch (err) {
      console.error("Kick callback error:", err.message);
      kickUsername = code.trim();
      kickUserId = `kick_${Math.floor(Math.random() * 100000000)}`;
    }
  }

  // Link user's Kick account in Supabase
  try {
    if (!supabase) return res.redirect("/verify.html?error=database_unavailable");

    // Get target user profile from Supabase
    let { data: targetUser } = await supabase
      .from("users")
      .select("*")
      .eq("id", targetUserId)
      .maybeSingle();

    if (!targetUser) {
      const { data: newUser } = await supabase
        .from("users")
        .upsert({
          id: targetUserId,
          kick_username: kickUsername.toLowerCase(),
          kick_id: kickUserId,
          updated_at: new Date().toISOString()
        })
        .select()
        .maybeSingle();
      targetUser = newUser;
    }

    // Check if duplicate Kick username exists
    const { data: duplicateUser } = await supabase
      .from("users")
      .select("id")
      .eq("kick_username", kickUsername.toLowerCase())
      .neq("id", targetUserId)
      .maybeSingle();

    if (duplicateUser) {
      return res.redirect("/verify.html?error=kick_already_linked");
    }

    // Unregister old username from tracker
    if (targetUser && targetUser.kick_username) {
      chatActivityTracker.unregisterUser(targetUser.kick_username);
    }

    // Update users table
    const { data: updatedUser } = await supabase
      .from("users")
      .update({
        kick_username: kickUsername.toLowerCase(),
        kick_id: kickUserId,
        updated_at: new Date().toISOString()
      })
      .eq("id", targetUserId)
      .select()
      .maybeSingle();

    // Register user in tracker
    if (updatedUser && updatedUser.kick_username) {
      chatActivityTracker.registerUser(updatedUser.kick_username, updatedUser.id);
    }

    // Update linked_accounts table
    const { data: existingLink } = await supabase
      .from("linked_accounts")
      .select("*")
      .eq("user_id", targetUserId)
      .eq("provider", "kick")
      .maybeSingle();

    if (existingLink) {
      await supabase
        .from("linked_accounts")
        .update({
          provider_user_id: kickUserId,
          username: kickUsername,
          updated_at: new Date().toISOString()
        })
        .eq("id", existingLink.id);
    } else {
      await supabase
        .from("linked_accounts")
        .insert({
          user_id: targetUserId,
          provider: "kick",
          provider_user_id: kickUserId,
          username: kickUsername,
          linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
    }

    return res.redirect("/verify.html?success=kick&step=3");
  } catch (err) {
    console.error("Kick link database error:", err.stack || err.message);
    return res.redirect("/verify.html?error=kick_failed");
  }
});

// ─── GET /auth/me (Read-only Supabase profile details) ───────────────────────
app.get("/auth/me", requireClerkAuth, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User profile not found. Please login first." });
  }

  // Fetch linked accounts
  let linkedAccounts = [];
  if (supabase) {
    const { data } = await supabase
      .from("linked_accounts")
      .select("*")
      .eq("user_id", req.user.id);
    linkedAccounts = data || [];
  }

  res.json({
    loggedIn:          true,
    token:             req.cookies.bigdtv_token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null),
    userId:            req.user.id,
    clerkId:           req.user.clerk_id || null,
    email:             req.user.email,
    displayName:       req.user.display_name,
    avatarUrl:         req.user.avatar_url,
    points:            req.user.points ?? 0,
    degencityUsername: req.user.degencity_username || null,
    kickUsername:      req.user.kick_username || null,
    linkedAccounts:    linkedAccounts
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
app.post("/auth/logout", (req, res) => {
  res.clearCookie('bigdtv_token', { path: '/' });
  res.clearCookie("verified_degencity_username", { path: '/' });
  if (req.session) {
    req.session.destroy((err) => {
      if (err) console.error("Session destroy error:", err);
    });
  }
  res.json({ success: true });
});

// ─── PATCH /profile ───────────────────────────────────────────────────────────
app.patch("/profile", requireClerkAuth, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User profile not found. Please sync first." });
  }
  const { display_name, avatar_url } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (display_name !== undefined) updates.display_name = display_name;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  try {
    if (supabase) {
      const { data: user, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", req.user.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, user });
    } else {
      return res.status(500).json({ error: "Database connection unavailable" });
    }
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /profile/degencity ─────────────────────────────────────────────────
app.patch("/profile/degencity", requireClerkAuth, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User profile not found. Please sync first." });
  }

  // 1) Enforce Kick username is linked first
  if (!req.user.kick_username) {
    return res.status(400).json({ error: "Please link your Kick account first before linking DegenCity." });
  }

  // 2) Enforce permanent account linking (one-to-one)
  if (req.user.degencity_username) {
    return res.status(400).json({ error: "Your account is already permanently linked to a DegenCity username." });
  }

  const { degencity_username } = req.body;
  if (!degencity_username) return res.status(400).json({ error: "Username required" });

  const degenUsername = degencity_username.trim().toLowerCase();

  try {
    // 1) Verify the DegenCity username exists in the leaderboard
    const lbRes = await fetch("https://api.degencity.com/api/v1/partner/affiliates/leaderboard", {
      headers: { "x-api-key": API_KEY, "Accept": "application/json" }
    });
    if (!lbRes.ok) throw new Error("Could not reach DegenCity API");

    const lbData = await lbRes.json();
    const users  = lbData.data || [];
    const match  = users.find(u => (u.username || "").toLowerCase() === degenUsername);

    if (!match) {
      return res.status(422).json({
        error: `DegenCity username "${degencity_username}" was not found in the affiliates list. Make sure you registered on DegenCity using code BIGD.`
      });
    }

    // 2) Check if another user has already linked this DegenCity username
    if (supabase) {
      const { data: duplicateUser } = await supabase
        .from("users")
        .select("id")
        .eq("degencity_username", degenUsername)
        .neq("id", req.user.id)
        .maybeSingle();

      if (duplicateUser) {
        return res.status(422).json({ error: "This DegenCity account is already linked to another player." });
      }

      // 3) Update DegenCity username in users table
      const { data: updatedUser, error: updateError } = await supabase
        .from("users")
        .update({
          degencity_username: degenUsername,
          degencity_verification_status: "verified",
          degencity_link_timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", req.user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update linked_accounts table for DegenCity as well
      const { data: existingLink } = await supabase
        .from("linked_accounts")
        .select("*")
        .eq("user_id", req.user.id)
        .eq("provider", "degencity")
        .maybeSingle();

      if (existingLink) {
        await supabase
          .from("linked_accounts")
          .update({
            provider_user_id: degenUsername,
            username: degenUsername,
            updated_at: new Date().toISOString()
          })
          .eq("id", existingLink.id);
      } else {
        await supabase
          .from("linked_accounts")
          .insert({
            user_id: req.user.id,
            provider: "degencity",
            provider_user_id: degenUsername,
            username: degenUsername,
            linked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }

      return res.json({ success: true, degencity_username: degenUsername, verified: true });
    } else {
      return res.status(500).json({ error: "Database connection unavailable" });
    }
  } catch (err) {
    console.error("link-degencity error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /profile/kick ──────────────────────────────────────────────────────
app.patch("/profile/kick", requireClerkAuth, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User profile not found. Please sync first." });
  }

  // Enforce permanent account linking (one-to-one)
  if (req.user.kick_username) {
    return res.status(400).json({ error: "Your account is already permanently linked to a Kick username." });
  }

  const { kick_username } = req.body;
  if (!kick_username) return res.status(400).json({ error: "kick_username is required" });

  const cleanedUname = kick_username.trim();

  try {
    if (supabase) {
      // Check if this Kick username is already linked to another user
      if (cleanedUname) {
        const { data: duplicateUser } = await supabase
          .from("users")
          .select("id")
          .eq("kick_username", cleanedUname.toLowerCase())
          .neq("id", req.user.id)
          .maybeSingle();

        if (duplicateUser) {
          return res.status(422).json({ error: "This Kick account is already linked to another player." });
        }
      }

      // Fetch user's old Kick username from DB to unregister
      const { data: oldUser } = await supabase
        .from("users")
        .select("kick_username")
        .eq("id", req.user.id)
        .single();

      if (oldUser && oldUser.kick_username) {
        chatActivityTracker.unregisterUser(oldUser.kick_username);
      }

      const { data: user, error: upErr } = await supabase
        .from("users")
        .update({ 
          kick_username: cleanedUname ? cleanedUname.toLowerCase() : null,
          updated_at: new Date().toISOString()
        })
        .eq("id", req.user.id)
        .select()
        .single();

      if (upErr) throw new Error(upErr.message);

      // Register new Kick username immediately for active chat rewards
      if (user && user.kick_username) {
        chatActivityTracker.registerUser(user.kick_username, user.id);
      }

      // Update linked_accounts table for Kick as well
      if (cleanedUname) {
        const { data: existingLink } = await supabase
          .from("linked_accounts")
          .select("*")
          .eq("user_id", req.user.id)
          .eq("provider", "kick")
          .maybeSingle();

        if (existingLink) {
          await supabase
            .from("linked_accounts")
            .update({
              provider_user_id: cleanedUname.toLowerCase(),
              username: cleanedUname,
              updated_at: new Date().toISOString()
            })
            .eq("id", existingLink.id);
        } else {
          await supabase
            .from("linked_accounts")
            .insert({
              user_id: req.user.id,
              provider: "kick",
              provider_user_id: cleanedUname.toLowerCase(),
              username: cleanedUname,
              linked_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      } else {
        await supabase
          .from("linked_accounts")
          .delete()
          .eq("user_id", req.user.id)
          .eq("provider", "kick");
      }

      return res.json({ success: true, kick_username: cleanedUname });
    } else {
      return res.status(500).json({ error: "Database connection unavailable" });
    }
  } catch (err) {
    console.error("Update Kick username error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Kick Chat Activity Point Tracker ────────────────────────────────────────
const POINTS_PER_INTERVAL   = 10;
const INTERVAL_MS           = 5 * 60 * 1000;   // 5 minutes
const ACTIVE_WINDOW_MS      = 7.5 * 60 * 1000; // message must be within 7.5m to count

const chatActivityTracker = {
  // map of kickUsername (lowercase) → last message timestamp
  activityMap:    new Map(),
  // map of kickUsername (lowercase) → DB userId
  userIdMap:      new Map(),

  registerUser(kickUsername, userId) {
    const key = kickUsername.toLowerCase();
    if (userId) this.userIdMap.set(key, userId);
  },

  unregisterUser(kickUsername) {
    if (!kickUsername) return;
    const key = kickUsername.toLowerCase();
    this.userIdMap.delete(key);
    this.activityMap.delete(key);
  },

  recordMessage(kickUsername) {
    const key = kickUsername.toLowerCase();
    this.activityMap.set(key, Date.now());
  },

  async awardInterval() {
    if (!supabase) return;
    const now      = Date.now();
    const cutoff   = now - ACTIVE_WINDOW_MS;
    let awardCount = 0;

    for (const [username, lastSeen] of this.activityMap.entries()) {
      if (lastSeen < cutoff) continue;     // inactive in chat
      const userId = this.userIdMap.get(username);
      if (!userId) continue;               // not a registered Kick-OAuth user

      try {
        await supabase.rpc("modify_points", {
          p_user_id: userId,
          p_delta:   POINTS_PER_INTERVAL,
          p_action:  "chat_points",
          p_source:  "kick_chat",
          p_ref:     `chat_${username}_${Math.floor(now / INTERVAL_MS)}`
        });
        awardCount++;
      } catch (e) {
        console.error("Point award failed for", username, e.message);
      }
    }
    if (awardCount > 0) console.log(`🏆 Awarded ${POINTS_PER_INTERVAL} pts to ${awardCount} active chatters`);
  },
};

// ─── Kick WebSocket Chat Listener ─────────────────────────────────────────────
const KICK_PUSHER_APP_KEY = process.env.KICK_PUSHER_APP_KEY || "32cbd69e4b950bf97679";
let kickWs                = null;
let kickChatroomId        = process.env.KICK_CHATROOM_ID || null;

async function fetchKickChatroomId(slug) {
  if (process.env.KICK_CHATROOM_ID) return process.env.KICK_CHATROOM_ID;
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.chatroom?.id || null;
  } catch { return null; }
}

function connectKickChat() {
  if (!kickChatroomId) return;

  const wsUrl = `wss://ws-us2.pusher.com/app/${KICK_PUSHER_APP_KEY}?protocol=7&client=js&version=7.6.0&flash=false`;
  kickWs      = new WebSocket(wsUrl);

  kickWs.on("open", () => {
    console.log(`✅ Kick chat WebSocket connected for chatroom ${kickChatroomId}`);
    kickWs.send(JSON.stringify({
      event: "pusher:subscribe",
      data:  { auth: "", channel: `chatrooms.${kickChatroomId}.v2` }
    }));
  });

  kickWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.event === "pusher:ping") {
        kickWs.send(JSON.stringify({ event: "pusher:pong", data: {} }));
        return;
      }

      if (msg.event === "App\\Events\\ChatMessageEvent") {
        const payload = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
        const sender  = payload?.sender?.username || payload?.sender?.slug;
        if (sender && chatActivityTracker.userIdMap.has(sender.toLowerCase())) {
          chatActivityTracker.recordMessage(sender);
          console.log(`💬 Kick chat activity recorded for ${sender}`);
        }
      }
    } catch { /* ignore malformed */ }
  });

  kickWs.on("close", () => {
    console.warn("⚠️  Kick chat WebSocket closed, reconnecting in 15s...");
    setTimeout(connectKickChat, 15_000);
  });

  kickWs.on("error", (err) => {
    console.error("Kick WebSocket error:", err.message);
    kickWs.terminate();
  });
}

async function startKickChatListener() {
  kickChatroomId = await fetchKickChatroomId(KICK_CHANNEL);
  if (kickChatroomId) {
    console.log(`✅ Kick chatroom ID: ${kickChatroomId}`);
    connectKickChat();
  } else {
    console.warn(`⚠️  Kick chatroom auto-lookup blocked by Cloudflare for '${KICK_CHANNEL}'. (Set KICK_CHATROOM_ID in .env or use chat simulator)`);
  }
}

// Award points every 5 minutes
setInterval(() => chatActivityTracker.awardInterval(), INTERVAL_MS);

// ─── POST /api/test/record-chat (For local testing of chat points) ────────────
app.post("/api/test/record-chat", requireAuth, (req, res) => {
  const { kick_username } = req.body;
  const username = kick_username || (req.user ? req.user.kick_username : null);

  if (!username) {
    return res.status(400).json({ error: "Kick username required" });
  }

  chatActivityTracker.recordMessage(username);
  console.log(`[TEST] Recorded chat activity for Kick user: ${username}`);
  res.json({
    success: true,
    message: `Recorded chat activity for ${username}. Points will be awarded at next 5m interval.`
  });
});

// ─── Load All Kick-Linked Users Into Memory on Startup ───────────────────────
async function loadRegisteredUsers() {
  if (!supabase) return;
  try {
    const { data: users } = await supabase
      .from("users")
      .select("id, kick_username")
      .not("kick_username", "is", null);

    if (users) {
      for (const u of users) {
        chatActivityTracker.registerUser(u.kick_username, u.id);
      }
      console.log(`✅ Loaded ${users.length} registered Kick users into activity tracker`);
    }
  } catch (e) {
    console.warn("Could not preload Kick users:", e.message);
  }
}

// ─── Fallback → index.html ────────────────────────────────────────────────────
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log("================================");
  console.log(" BigDTV Server Running");
  console.log("================================");
  console.log(`http://localhost:${PORT}`);

  await loadRegisteredUsers();
  startKickChatListener();
});
