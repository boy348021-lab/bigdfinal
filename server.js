console.log("RUNNING NEW SERVER.JS");
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import session from "express-session";
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

// Leaderboard period: 16 Jul – 31 Jul 2026 (fixed)
// Before is 2026-08-01 (exclusive upper bound so Jul 31 is fully included)
const LB_PERIOD_AFTER  = "2026-07-16";
const LB_PERIOD_BEFORE = "2026-08-01";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Supabase ────────────────────────────────────────────────────────────────
const supabaseUrl     = process.env.SUPABASE_URL     || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey     = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase        = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

if (!supabase) {
  console.warn("⚠️  Supabase not configured — set SUPABASE_URL + SUPABASE_SERVICE_KEY in .env");
}

// ─── OAuth Config ────────────────────────────────────────────────────────────
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     || "";
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const DISCORD_REDIRECT_URI  = process.env.DISCORD_REDIRECT_URI  || `http://localhost:${PORT}/auth/discord/callback`;

const KICK_CLIENT_ID     = process.env.KICK_CLIENT_ID     || "";
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET || "";
const KICK_REDIRECT_URI  = process.env.KICK_REDIRECT_URI  || `http://localhost:${PORT}/auth/kick/callback`;

// Admin secret for admin endpoints (set ADMIN_SECRET in .env)
const ADMIN_SECRET = process.env.ADMIN_SECRET || "bigdtv-admin-change-me";

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

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

// ─── Auth guard middleware ────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Not authenticated" });
  next();
}
function requireKick(req, res, next) {
  if (!req.session.kickUsername) return res.status(403).json({ error: "Kick account required to earn points" });
  next();
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

app.get("/api/kick-live", async (req, res) => {
  if (kickCache.checkedAt && Date.now() - kickCache.checkedAt < KICK_CACHE_TTL) {
    res.set("Cache-Control", "no-store");
    return res.json({ channel: "BigDgamesTV", live: kickCache.live, checkedAt: new Date(kickCache.checkedAt).toISOString() });
  }
  const result = await fetchKickViaPython();
  kickCache = { live: result.live, checkedAt: Date.now() };
  res.set("Cache-Control", "no-store");
  res.json({ channel: "BigDgamesTV", live: result.live, checkedAt: new Date().toISOString() });
});

// ─── Leaderboard — LOCKED to 2026-07-16 → 2026-07-31 ────────────────────────
app.get("/api/leaderboard", async (req, res) => {
  const { after, before } = req.query;

  // ─── LEADERBOARD B: 15-Day (Biweekly) Leaderboard (Database-driven) ────────────────
  if (after === '2026-07-16' && supabase) {
    try {
      // Query local wager transactions strictly within the date range
      const { data: txs, error } = await supabase
        .from("wager_transactions")
        .select(`
          wager_amount_usd,
          points_awarded,
          processed_at,
          users!inner (
            degencity_username,
            kick_username
          )
        `)
        .gte("processed_at", "2026-07-16T00:00:00.000Z")
        .lte("processed_at", "2026-07-31T23:59:59.999Z");

      if (!error && txs && txs.length > 0) {
        // Group in memory to aggregate totals for each user
        const playerMap = new Map();
        for (const tx of txs) {
          const username = tx.users?.degencity_username || tx.users?.kick_username || "Unknown";
          if (!playerMap.has(username)) {
            playerMap.set(username, { username, total_wager: 0, total_points: 0 });
          }
          const entry = playerMap.get(username);
          entry.total_wager += Number(tx.wager_amount_usd || 0);
          entry.total_points += Number(tx.points_awarded || 0);
        }

        const players = Array.from(playerMap.values())
          .sort((a, b) => b.total_wager - a.total_wager);

        const formatted = players.map(p => ({
          user_id: 1,
          username: p.username,
          wager_data: [
            {
              month: "2026-07",
              total_wager_usd: p.total_wager
            }
          ]
        }));

        res.set("Cache-Control", "no-store");
        return res.json({ data: formatted });
      }
    } catch (err) {
      console.error("Biweekly leaderboard DB error, falling back to proxy:", err);
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
      headers: { "x-api-key": API_KEY, "Accept": "application/json" }
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
    .select("points, kick_username, discord_username")
    .eq("id", req.params.userId)
    .single();
  if (error) return res.status(404).json({ error: "User not found" });
  res.json(data);
});

// ─── Activity Heartbeat (for multi-tab prevention + idle detection) ───────────
// Clients hit this every 60s if they are on-site and logged in with Kick.
const heartbeatMap = new Map(); // userId → { lastSeen, kickUsername }

app.post("/api/heartbeat", requireAuth, requireKick, (req, res) => {
  const userId      = req.session.userId;
  const kickUsername = req.session.kickUsername;
  heartbeatMap.set(userId, { lastSeen: Date.now(), kickUsername });
  res.json({ ok: true });
});

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

  const { reward_id } = req.body;
  const userId        = req.session.userId;

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

    req.session.points = newBalance;
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
  const { data, error } = await supabase
    .from("redemptions")
    .select("id, reward_id, reward_label, points_cost, status, admin_note, created_at, updated_at")
    .eq("user_id", req.session.userId)
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
app.get("/auth/me", async (req, res) => {
  if (!req.session.userId) return res.json({ loggedIn: false });

  let dbUser = null;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("users")
        .select("discord_username, discord_avatar, kick_username, kick_id, degencity_username, degencity_verification_status, points")
        .eq("id", req.session.userId)
        .single();
      if (!error && data) {
        dbUser = data;
      }
    } catch (e) {
      console.error("Error fetching user in /auth/me:", e);
    }
  }

  const user = dbUser || {};

  res.json({
    loggedIn:             true,
    userId:               req.session.userId,
    discordUsername:      user.discord_username         || req.session.discordUsername  || null,
    discordAvatar:        user.discord_avatar           || req.session.discordAvatar    || null,
    kickUsername:         user.kick_username            || req.session.kickUsername     || null,
    kickId:               user.kick_id                  || req.session.kickId           || null,
    degencityUsername:    user.degencity_username       || req.session.degencityUsername || null,
    degencityVerified:    (user.degencity_verification_status === "verified") || req.session.degencityVerified || false,
    points:               user.points !== undefined ? user.points : (req.session.points || 0),
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ─── Auth — Discord ───────────────────────────────────────────────────────────
app.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(503).send("Discord OAuth not configured. Please set DISCORD_CLIENT_ID in .env");
  }
  const state  = randomBytes(16).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id:     DISCORD_CLIENT_ID,
    redirect_uri:  DISCORD_REDIRECT_URI,
    response_type: "code",
    scope:         "identify",
    state,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    return res.redirect("/account.html?error=discord_denied");
  }
  if (state !== req.session.oauthState) {
    return res.redirect("/account.html?error=state_mismatch");
  }
  delete req.session.oauthState;

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access token from Discord");

    const profileRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();

    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
      : null;

    let userId   = req.session.userId || null;
    let dbPoints = 0;
    let dbKickId = null;
    let dbKickUsername = null;
    let dbDegenUsername = null;
    let dbDegenVerified = false;

    if (supabase) {
      const { data: existing } = await supabase
        .from("users")
        .select("id, points, kick_id, kick_username, degencity_username, degencity_verification_status")
        .eq("discord_id", profile.id)
        .single();

      if (existing) {
        userId   = existing.id;
        dbPoints = existing.points;
        dbKickId = existing.kick_id || null;
        dbKickUsername = existing.kick_username || null;
        dbDegenUsername = existing.degencity_username || null;
        dbDegenVerified = existing.degencity_verification_status === "verified";
        await supabase
          .from("users")
          .update({ discord_username: profile.username, discord_avatar: avatar, last_seen_at: new Date().toISOString() })
          .eq("id", userId);
      } else {
        if (userId) {
          await supabase
            .from("users")
            .update({ discord_id: profile.id, discord_username: profile.username, discord_avatar: avatar })
            .eq("id", userId);
        } else {
          const { data: newUser } = await supabase
            .from("users")
            .insert({ discord_id: profile.id, discord_username: profile.username, discord_avatar: avatar })
            .select("id, points")
            .single();
          if (newUser) { userId = newUser.id; dbPoints = newUser.points; }
        }
      }
    }

    req.session.userId            = userId;
    req.session.discordUsername   = profile.username;
    req.session.discordAvatar     = avatar;
    req.session.points            = dbPoints;
    req.session.kickId            = dbKickId || req.session.kickId || null;
    req.session.kickUsername      = dbKickUsername || req.session.kickUsername || null;
    req.session.degencityUsername = dbDegenUsername || req.session.degencityUsername || null;
    req.session.degencityVerified = dbDegenVerified || req.session.degencityVerified || false;

    res.redirect("/account.html?success=discord");
  } catch (err) {
    console.error("Discord callback error:", err);
    res.redirect("/account.html?error=discord_failed");
  }
});

// ─── Auth — Kick (PKCE OAuth 2.1) ────────────────────────────────────────────
function sha256base64url(str) {
  return createHash("sha256").update(str).digest("base64url");
}

app.get("/auth/kick", (req, res) => {
  if (!KICK_CLIENT_ID) {
    return res.status(503).send("Kick OAuth not configured. Please set KICK_CLIENT_ID in .env");
  }
  const state        = randomBytes(16).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = sha256base64url(codeVerifier);

  req.session.oauthState    = state;
  req.session.codeVerifier  = codeVerifier;

  const params = new URLSearchParams({
    client_id:             KICK_CLIENT_ID,
    redirect_uri:          KICK_REDIRECT_URI,
    response_type:         "code",
    scope:                 "user:read",
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: "S256",
  });
  res.redirect(`https://id.kick.com/oauth/authorize?${params}`);
});

app.get("/auth/kick/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) return res.redirect("/account.html?error=kick_denied");
  if (state !== req.session.oauthState) return res.redirect("/account.html?error=state_mismatch");

  const codeVerifier = req.session.codeVerifier;
  delete req.session.oauthState;
  delete req.session.codeVerifier;

  try {
    const tokenRes = await fetch("https://id.kick.com/oauth/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({
        client_id:     KICK_CLIENT_ID,
        client_secret: KICK_CLIENT_SECRET,
        grant_type:    "authorization_code",
        code,
        redirect_uri:  KICK_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) throw new Error("No access token from Kick");

    const profileRes = await fetch("https://api.kick.com/public/v1/users", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profileData = await profileRes.json();
    const profile     = profileData.data?.[0] || profileData;

    const kickId       = String(profile.user_id || profile.id || "");
    const kickUsername = profile.name || profile.username || profile.slug || "";

    // Register in point tracker memory map
    if (kickUsername) {
      chatActivityTracker.registerUser(kickUsername);
    }

    let userId   = req.session.userId || null;
    let dbPoints = 0;
    let dbDegenUsername = null;
    let dbDegenVerified = false;

    if (supabase) {
      const { data: existing } = await supabase
        .from("users")
        .select("id, points, discord_username, discord_avatar, degencity_username, degencity_verification_status")
        .eq("kick_id", kickId)
        .single();

      if (existing) {
        userId             = existing.id;
        dbPoints           = existing.points;
        dbDegenUsername    = existing.degencity_username;
        dbDegenVerified    = existing.degencity_verification_status === "verified";
        req.session.discordUsername = existing.discord_username || null;
        req.session.discordAvatar   = existing.discord_avatar || null;
        await supabase
          .from("users")
          .update({ kick_username: kickUsername, last_seen_at: new Date().toISOString() })
          .eq("id", userId);
      } else {
        if (userId) {
          await supabase
            .from("users")
            .update({ kick_id: kickId, kick_username: kickUsername })
            .eq("id", userId);
        } else {
          const { data: newUser } = await supabase
            .from("users")
            .insert({ kick_id: kickId, kick_username: kickUsername })
            .select("id, points")
            .single();
          if (newUser) { userId = newUser.id; dbPoints = newUser.points; }
        }
      }

      // Register user ID in the memory map so points can be awarded
      if (kickUsername && userId) {
        chatActivityTracker.registerUser(kickUsername, userId);
      }
    }

    req.session.userId              = userId;
    req.session.kickUsername        = kickUsername;
    req.session.kickId              = kickId;
    req.session.points              = dbPoints;
    req.session.degencityUsername   = dbDegenUsername;
    req.session.degencityVerified   = dbDegenVerified;

    res.redirect("/account.html?success=kick");
  } catch (err) {
    console.error("Kick callback error:", err);
    res.redirect("/account.html?error=kick_failed");
  }
});

// ─── Link DegenCity Username (with verification against leaderboard) ──────────
app.post("/auth/link-degencity", requireAuth, requireKick, async (req, res) => {
  const { degencity_username } = req.body;
  if (!degencity_username) return res.status(400).json({ error: "Username required" });

  const kickUsername   = (req.session.kickUsername || "").trim().toLowerCase();
  const degenUsername  = degencity_username.trim().toLowerCase();

  // STRICT OWNERSHIP VERIFICATION Check: entered DegenCity username must match logged-in Kick username
  if (degenUsername !== kickUsername) {
    return res.status(422).json({
      error: "This DegenCity account does not belong to the authenticated Kick account."
    });
  }

  try {
    // Verify the DegenCity username exists in the leaderboard
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

    if (supabase) {
      await supabase
        .from("users")
        .update({
          degencity_username:            degenUsername,
          degencity_link_timestamp:      new Date().toISOString(),
          degencity_verification_status: "verified"
        })
        .eq("id", req.session.userId);
    }

    req.session.degencityUsername = degenUsername;
    req.session.degencityVerified = true;

    res.json({ success: true, degencity_username: degenUsername, verified: true });
  } catch (err) {
    console.error("link-degencity error:", err.message);
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
