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
import { createClerkClient } from "@clerk/backend";
import { Webhook } from "svix";

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

// ─── Clerk & Middleware ────────────────────────────────────────────────────────
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || "";

const clerkClient = createClerkClient({ secretKey: CLERK_SECRET_KEY });

app.use(cors());

// Clerk webhook endpoint (defined before global express.json() to get raw body)
app.post("/api/webhooks/clerk", express.raw({ type: "application/json" }), async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("Missing CLERK_WEBHOOK_SECRET environment variable");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: "Error occurred -- no svix headers" });
  }

  const payload = req.body;
  const body = payload.toString();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err.message);
    return res.status(400).json({ error: err.message });
  }

  const { id } = evt.data;
  const eventType = evt.type;

  console.log(`Clerk webhook received: ${eventType} (User ID: ${id})`);

  try {
    if (eventType === "user.created" || eventType === "user.updated") {
      const email = evt.data.email_addresses?.[0]?.email_address || null;
      const displayName = `${evt.data.first_name || ""} ${evt.data.last_name || ""}`.trim() || evt.data.username || "Guest";
      const avatarUrl = evt.data.image_url || null;

      if (supabase) {
        const { data: existingUser } = await supabase
          .from("users")
          .select("*")
          .eq("clerk_id", id)
          .maybeSingle();

        if (existingUser) {
          await supabase
            .from("users")
            .update({
              email: email,
              display_name: displayName,
              avatar_url: avatarUrl,
              updated_at: new Date().toISOString()
            })
            .eq("clerk_id", id);
        } else {
          await supabase
            .from("users")
            .insert({
              clerk_id: id,
              email: email,
              display_name: displayName,
              avatar_url: avatarUrl,
              auth_provider: 'clerk',
              points: 0,
              created_at: new Date().toISOString(),
              last_login: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });
        }
      }
    } else if (eventType === "user.deleted") {
      if (supabase) {
        await supabase
          .from("users")
          .delete()
          .eq("clerk_id", id);
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Webhook processing failed:", err.message);
    res.status(500).json({ error: "Internal processing error" });
  }
});

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET || "bigdtv-dev-secret-change-in-production"));

// Keep express-session for non-auth legacy requirements if any, but clean up active session dependency
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

// Reusable Clerk verification middleware
async function requireClerkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: "No authentication token provided" });
  }
  const token = authHeader.split(' ')[1];

  // Support Mock Mode JWTs
  if (token.startsWith('mock_jwt_')) {
    try {
      const payloadStr = Buffer.from(token.replace('mock_jwt_', ''), 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      req.auth = { sub: payload.id };

      if (supabase) {
        const { data: user } = await supabase
          .from("users")
          .select("*")
          .eq("clerk_id", payload.id)
          .maybeSingle();

        if (user) {
          req.user = user;
        }
      }
      return next();
    } catch (err) {
      console.error("Mock authentication error:", err.message);
      return res.status(401).json({ error: "Invalid mock token" });
    }
  }

  try {
    const verified = await clerkClient.verifyToken(token);
    req.auth = verified;

    if (supabase) {
      const { data: user } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_id", verified.sub)
        .maybeSingle();

      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (err) {
    console.error("Clerk authentication error:", err.message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

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
app.post("/api/store/redeem", requireClerkAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(404).json({ error: "User profile not found. Please sync first." });

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
app.get("/api/store/redemptions", requireClerkAuth, async (req, res) => {
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

// ─── Auth — Session Info ──────────────────────────────────────────────────────
// ─── GET Clerk Publishable Key config ─────────────────────────────────────────
app.get("/api/auth/config", (req, res) => {
  res.json({ publishableKey: CLERK_PUBLISHABLE_KEY });
});

// ─── POST /auth/sync (Verify Clerk JWT & sync Supabase profile/linked_accounts) 
app.post("/auth/sync", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No authentication token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    let clerkUserId, email, displayName, avatarUrl;
    let discordUserId, discordUsername, discordAvatar;

    if (token.startsWith('mock_jwt_')) {
      const payloadStr = Buffer.from(token.replace('mock_jwt_', ''), 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      
      clerkUserId = payload.id;
      email = payload.email;
      displayName = payload.displayName;
      avatarUrl = payload.avatarUrl;
      
      discordUserId = payload.discordId;
      discordUsername = payload.username;
      discordAvatar = payload.avatarUrl;
    } else {
      const verified = await clerkClient.verifyToken(token);
      clerkUserId = verified.sub;

      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      email = clerkUser.emailAddresses?.[0]?.emailAddress || null;
      displayName = `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim() || clerkUser.username || "Guest";
      avatarUrl = clerkUser.imageUrl || null;

      const discordAccount = clerkUser.externalAccounts?.find(acc => acc.provider === 'oauth_discord' || acc.provider === 'discord');
      discordUserId = discordAccount?.providerUserId || null;
      discordUsername = discordAccount?.username || null;
      discordAvatar = discordAccount?.avatarUrl || null;
    }

    if (!supabase) {
      return res.status(500).json({ error: "Database unavailable" });
    }

    // Step 1: Look up existing user by clerk_id
    let { data: dbUser } = await supabase
      .from("users")
      .select("*")
      .eq("clerk_id", clerkUserId)
      .maybeSingle();

    // Step 2: If not found, look up by discord_id for migration/preventing duplicates
    if (!dbUser && discordUserId) {
      const { data: legacyUser } = await supabase
        .from("users")
        .select("*")
        .eq("discord_id", discordUserId)
        .maybeSingle();

      if (legacyUser) {
        // Link clerk_id to legacy user
        const { data: updatedLegacy } = await supabase
          .from("users")
          .update({
            clerk_id: clerkUserId,
            email: email,
            display_name: displayName,
            avatar_url: avatarUrl,
            last_login: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", legacyUser.id)
          .select()
          .single();

        dbUser = updatedLegacy;
        console.log(`Migrated legacy user ${discordUsername} (${discordUserId}) to Clerk ${clerkUserId}`);
      }
    }

    // Step 3: If still not found, create a new user
    if (!dbUser) {
      const { data: newUser, error: createError } = await supabase
        .from("users")
        .insert({
          clerk_id: clerkUserId,
          email: email,
          display_name: displayName,
          avatar_url: avatarUrl,
          auth_provider: 'clerk',
          points: 0,
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;
      dbUser = newUser;
      console.log(`Created new Clerk user: ${clerkUserId} (${displayName})`);
    } else {
      // Update existing user profile
      const { data: updatedUser } = await supabase
        .from("users")
        .update({
          display_name: displayName,
          avatar_url: avatarUrl,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("clerk_id", clerkUserId)
        .select()
        .single();

      dbUser = updatedUser;
    }

    // Step 4: Sync Discord linked account in linked_accounts table
    if (discordUserId) {
      // Check if linked account exists
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
            provider_user_id: discordUserId,
            username: discordUsername,
            display_name: displayName,
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
            provider_user_id: discordUserId,
            username: discordUsername,
            display_name: displayName,
            avatar_url: discordAvatar,
            linked_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    }

    res.json({ success: true, user: dbUser });
  } catch (err) {
    console.error("Clerk sync error:", err.message);
    res.status(500).json({ error: "Failed to synchronize session: " + err.message });
  }
});

// ─── GET /auth/me (Read-only Supabase profile details) ───────────────────────
app.get("/auth/me", requireClerkAuth, async (req, res) => {
  if (!req.user) {
    return res.status(404).json({ error: "User profile not found. Please sync first." });
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
    userId:            req.user.id,
    clerkId:           req.user.clerk_id,
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
  res.clearCookie("verified_degencity_username", { path: '/' });
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

  const { kick_username } = req.body;
  if (kick_username === undefined) return res.status(400).json({ error: "kick_username required" });

  const cleanedUname = kick_username ? kick_username.trim() : null;

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
const KICK_PUSHER_APP_KEY = "eb1d5f283081a78b932c";
let kickWs                = null;
let kickChatroomId        = null;

async function fetchKickChatroomId(slug) {
  try {
    const res  = await fetch(`https://kick.com/api/v2/channels/${slug}`);
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
    console.log("✅ Kick chat WebSocket connected");
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
        // Only record if this sender is a registered Kick-OAuth user
        if (sender && chatActivityTracker.userIdMap.has(sender.toLowerCase())) {
          chatActivityTracker.recordMessage(sender);
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
    console.warn(`⚠️  Could not fetch Kick chatroom ID for '${KICK_CHANNEL}'. Chat listener inactive.`);
  }
}

// Award points every 5 minutes
setInterval(() => chatActivityTracker.awardInterval(), INTERVAL_MS);

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
