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

// ─── OAuth Config ────────────────────────────────────────────────────────────
const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     || '1526125659494154250';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || 'njb6UmXsbJeKn76NFtyHjTMY7yrGdEHi';

const KICK_CLIENT_ID     = process.env.KICK_CLIENT_ID     || '';
const KICK_CLIENT_SECRET = process.env.KICK_CLIENT_SECRET || '';

// Auto-detect the base URL: prefer explicit env var, then Vercel URL, then production domain, then localhost
const BASE_URL = process.env.BASE_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || (process.env.NODE_ENV === 'production' ? 'https://bigdtv.vip' : null)
  || `http://localhost:${PORT}`;

const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || `${BASE_URL}/auth/discord/callback`;
const KICK_REDIRECT_URI    = process.env.KICK_REDIRECT_URI    || `${BASE_URL}/auth/kick/callback`;

console.log(`BASE_URL: ${BASE_URL}`);
console.log(`Discord redirect: ${DISCORD_REDIRECT_URI}`);

// Admin secret for admin endpoints (set ADMIN_SECRET in .env)
const ADMIN_SECRET = process.env.ADMIN_SECRET || "bigdtv-admin-change-me";

// ─── Middleware ───────────────────────────────────────────────────────────────
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

// ─── JWT Auth Cookie helpers ──────────────────────────────────────────────────
const JWT_SECRET = process.env.SESSION_SECRET || 'bigdtv-dev-secret-change-in-production';
const AUTH_COOKIE = 'auth_token';
const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days
};

function setAuthCookie(res, userId) {
  const token = jwt.sign({ uid: String(userId) }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(AUTH_COOKIE, token, AUTH_COOKIE_OPTS);
}

function getAuthUserId(req) {
  const token = req.cookies?.[AUTH_COOKIE];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload.uid || null;
  } catch { return null; }
}

/**
 * Handles the core logic of OAuth login and linking for both Discord and Kick.
 * Returns { success: true, userId } or { success: false, error: 'already_linked' }
 */
async function handleOAuthLoginOrLink({ platform, platformId, platformUsername, platformAvatar = null, currentUserId = null, verifiedDegenUsername = null }) {
  if (!supabase) {
    throw new Error("Database not configured");
  }

  const idField = platform === "discord" ? "discord_id" : "kick_id";
  const { data: existingUser, error: findErr } = await supabase
    .from("users")
    .select("*")
    .eq(idField, platformId)
    .maybeSingle();

  if (findErr) {
    console.error(`Error looking up user by ${idField}:`, findErr);
    throw findErr;
  }

  // 1. Enforce DegenCity verification requirement for Kick connections
  if (platform === "kick") {
    let activeDegen = verifiedDegenUsername;

    if (currentUserId) {
      const { data: curUser } = await supabase
        .from("users")
        .select("degencity_username")
        .eq("id", currentUserId)
        .single();
      if (curUser?.degencity_username) {
        activeDegen = curUser.degencity_username;
      }
    } else if (existingUser?.degencity_username) {
      activeDegen = existingUser.degencity_username;
    }

    if (!activeDegen) {
      return { success: false, error: "degencity_required" };
    }
  }

  const updatePayload = {
    last_seen_at: new Date().toISOString(),
  };
  if (platform === "discord") {
    updatePayload.discord_username = platformUsername;
    updatePayload.discord_avatar = platformAvatar;
  } else {
    updatePayload.kick_username = platformUsername;
    if (verifiedDegenUsername) {
      updatePayload.degencity_username = verifiedDegenUsername;
      updatePayload.degencity_verification_status = "verified";
      updatePayload.degencity_link_timestamp = new Date().toISOString();
    }
  }

  // If no user is logged in currently
  if (!currentUserId) {
    if (existingUser) {
      // Existing user logging in: update profile details
      const { error: updateErr } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", existingUser.id);
      if (updateErr) console.error("Error updating user details on login:", updateErr);
      return { success: true, userId: existingUser.id };
    } else {
      // Brand new Kick/Discord signup
      let existingDegenUser = null;
      if (platform === "kick" && verifiedDegenUsername) {
        const { data } = await supabase
          .from("users")
          .select("id")
          .eq("degencity_username", verifiedDegenUsername)
          .maybeSingle();
        existingDegenUser = data;
      }

      if (existingDegenUser) {
        // Associate the Kick account with the existing user record that has this DegenCity username
        const updatePayloadWithKick = {
          ...updatePayload,
          kick_id: platformId,
          kick_username: platformUsername
        };
        const { error: updateErr } = await supabase
          .from("users")
          .update(updatePayloadWithKick)
          .eq("id", existingDegenUser.id);
        if (updateErr) throw updateErr;
        return { success: true, userId: existingDegenUser.id };
      } else {
        // Create a new record containing both
        const insertPayload = {
          [idField]: platformId,
          ...(platform === "discord" ? {
            discord_username: platformUsername,
            discord_avatar: platformAvatar,
          } : {
            kick_username: platformUsername,
            degencity_username: verifiedDegenUsername,
            degencity_verification_status: "verified",
            degencity_link_timestamp: new Date().toISOString()
          })
        };
        const { data: newUser, error: insertErr } = await supabase
          .from("users")
          .insert(insertPayload)
          .select("id")
          .single();
        if (insertErr) {
          console.error("Error inserting new user:", insertErr);
          throw insertErr;
        }
        return { success: true, userId: newUser.id };
      }
    }
  }

  // If a user IS logged in (linking attempt)
  const { data: currentUser, error: curErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", currentUserId)
    .single();

  if (curErr || !currentUser) {
    console.error("Error fetching current user for link:", curErr);
    throw new Error("Current logged in user not found");
  }

  // Already linked to this user
  if (currentUser[idField] === platformId) {
    await supabase.from("users").update(updatePayload).eq("id", currentUserId);
    return { success: true, userId: currentUserId };
  }

  // Find if another user already has this DegenCity username linked
  let existingDegenUser = null;
  if (platform === "kick" && verifiedDegenUsername) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .eq("degencity_username", verifiedDegenUsername.trim().toLowerCase())
      .maybeSingle();
    existingDegenUser = data;
  }

  // Check conflicts for existingUser (platform match)
  if (existingUser && existingUser.id !== currentUserId) {
    const otherIdField = platform === "discord" ? "kick_id" : "discord_id";
    if (currentUser[otherIdField] && existingUser[otherIdField] && currentUser[otherIdField] !== existingUser[otherIdField]) {
      return { success: false, error: "already_linked" };
    }
  }

  // Check conflicts for existingDegenUser (degencity match)
  if (existingDegenUser && existingDegenUser.id !== currentUserId) {
    if (currentUser.discord_id && existingDegenUser.discord_id && currentUser.discord_id !== existingDegenUser.discord_id) {
      return { success: false, error: "already_linked" };
    }
    const incomingKickId = platform === "kick" ? platformId : null;
    const targetKickId = currentUser.kick_id || incomingKickId;
    if (targetKickId && existingDegenUser.kick_id && targetKickId !== existingDegenUser.kick_id) {
      return { success: false, error: "already_linked" };
    }
  }

  const sourcesToDelete = [];
  let mergedPoints = currentUser.points || 0;

  const mergedPayload = {
    last_seen_at: new Date().toISOString(),
    discord_id: currentUser.discord_id,
    discord_username: currentUser.discord_username,
    discord_avatar: currentUser.discord_avatar,
    kick_id: currentUser.kick_id,
    kick_username: currentUser.kick_username,
    degencity_username: currentUser.degencity_username,
    degencity_verification_status: currentUser.degencity_verification_status,
    degencity_link_timestamp: currentUser.degencity_link_timestamp,
  };

  if (platform === "discord") {
    mergedPayload.discord_id = platformId;
    mergedPayload.discord_username = platformUsername;
    mergedPayload.discord_avatar = platformAvatar;
  } else {
    mergedPayload.kick_id = platformId;
    mergedPayload.kick_username = platformUsername;
    if (verifiedDegenUsername) {
      mergedPayload.degencity_username = verifiedDegenUsername;
      mergedPayload.degencity_verification_status = "verified";
      mergedPayload.degencity_link_timestamp = new Date().toISOString();
    }
  }

  // 1) Merge existingUser (matched by platformId)
  if (existingUser && existingUser.id !== currentUserId) {
    const sourceId = existingUser.id;
    sourcesToDelete.push(sourceId);
    mergedPoints += (existingUser.points || 0);

    mergedPayload.discord_id = mergedPayload.discord_id || existingUser.discord_id;
    mergedPayload.discord_username = mergedPayload.discord_username || existingUser.discord_username;
    mergedPayload.discord_avatar = mergedPayload.discord_avatar || existingUser.discord_avatar;
    mergedPayload.kick_id = mergedPayload.kick_id || existingUser.kick_id;
    mergedPayload.kick_username = mergedPayload.kick_username || existingUser.kick_username;
    mergedPayload.degencity_username = mergedPayload.degencity_username || existingUser.degencity_username;
    if (existingUser.degencity_verification_status === "verified") {
      mergedPayload.degencity_verification_status = "verified";
    }
    mergedPayload.degencity_link_timestamp = mergedPayload.degencity_link_timestamp || existingUser.degencity_link_timestamp;

    await Promise.all([
      supabase.from("point_logs").update({ user_id: currentUserId }).eq("user_id", sourceId),
      supabase.from("audit_logs").update({ user_id: currentUserId }).eq("user_id", sourceId),
      supabase.from("wager_transactions").update({ user_id: currentUserId }).eq("user_id", sourceId),
      supabase.from("redemptions").update({ user_id: currentUserId }).eq("user_id", sourceId),
    ]);
  }

  // 2) Merge existingDegenUser (matched by degencity_username)
  if (existingDegenUser && existingDegenUser.id !== currentUserId && (!existingUser || existingDegenUser.id !== existingUser.id)) {
    const sourceId = existingDegenUser.id;
    sourcesToDelete.push(sourceId);
    mergedPoints += (existingDegenUser.points || 0);

    mergedPayload.discord_id = mergedPayload.discord_id || existingDegenUser.discord_id;
    mergedPayload.discord_username = mergedPayload.discord_username || existingDegenUser.discord_username;
    mergedPayload.discord_avatar = mergedPayload.discord_avatar || existingDegenUser.discord_avatar;
    mergedPayload.kick_id = mergedPayload.kick_id || existingDegenUser.kick_id;
    mergedPayload.kick_username = mergedPayload.kick_username || existingDegenUser.kick_username;
    mergedPayload.degencity_username = mergedPayload.degencity_username || existingDegenUser.degencity_username;
    if (existingDegenUser.degencity_verification_status === "verified") {
      mergedPayload.degencity_verification_status = "verified";
    }
    mergedPayload.degencity_link_timestamp = mergedPayload.degencity_link_timestamp || existingDegenUser.degencity_link_timestamp;

    await Promise.all([
      supabase.from("point_logs").update({ user_id: currentUserId }).eq("user_id", sourceId),
      supabase.from("audit_logs").update({ user_id: currentUserId }).eq("user_id", sourceId),
      supabase.from("wager_transactions").update({ user_id: currentUserId }).eq("user_id", sourceId),
      supabase.from("redemptions").update({ user_id: currentUserId }).eq("user_id", sourceId),
    ]);
  }

  mergedPayload.points = mergedPoints;

  // 3) Delete source users first
  for (const sourceId of sourcesToDelete) {
    const { error: deleteErr } = await supabase
      .from("users")
      .delete()
      .eq("id", sourceId);
    if (deleteErr) {
      console.error(`Error deleting source user ${sourceId} during merge:`, deleteErr);
    }
  }

  // 4) Update currentUser
  const { error: updateErr } = await supabase
    .from("users")
    .update(mergedPayload)
    .eq("id", currentUserId);

  if (updateErr) {
    console.error("Error updating user details on link/merge:", updateErr);
    throw updateErr;
  }

  // 5) Write audit log
  if (sourcesToDelete.length > 0) {
    await supabase.from("audit_logs").insert({
      user_id: currentUserId,
      action: "account_merge",
      points_before: currentUser.points,
      points_after: mergedPoints,
      source: "auth_system",
      transaction_reference: `merged_users_${sourcesToDelete.join("_")}`,
      metadata: { merged_source_ids: sourcesToDelete }
    });
  }

  return { success: true, userId: currentUserId };
}

// ─── Session Restore Middleware ──────────────────────────────────────────────
app.use(async (req, res, next) => {
  const userId = getAuthUserId(req);
  if (userId && supabase) {
    try {
      const { data: user, error } = await supabase
        .from("users")
        .select("id, points, kick_id, kick_username, discord_id, discord_username, discord_avatar, degencity_username, degencity_verification_status")
        .eq("id", userId)
        .single();
      if (!error && user) {
        req.session.userId = user.id;
        req.session.kickUsername = user.kick_username;
        req.session.kickId = user.kick_id;
        req.session.discordUsername = user.discord_username;
        req.session.discordAvatar = user.discord_avatar;
        req.session.degencityUsername = user.degencity_username;
        req.session.degencityVerified = user.degencity_verification_status === "verified";
        req.session.points = user.points;
        req.user = user;
      } else {
        res.clearCookie(AUTH_COOKIE);
      }
    } catch (e) {
      console.error("Session restore error:", e);
    }
  }
  next();
});

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
app.get("/auth/me", (req, res) => {
  const tempDegen = req.cookies?.verified_degencity_username || null;
  if (!req.user) {
    return res.json({ loggedIn: false, tempDegencityUsername: tempDegen });
  }
  res.json({
    loggedIn:             true,
    userId:               req.user.id,
    discordUsername:      req.user.discord_username         || null,
    discordAvatar:        req.user.discord_avatar           || null,
    kickUsername:         req.user.kick_username            || null,
    kickId:               req.user.kick_id                  || null,
    degencityUsername:    req.user.degencity_username       || null,
    degencityVerified:    req.user.degencity_verification_status === 'verified',
    points:               req.user.points ?? 0,
    tempDegencityUsername: tempDegen,
  });
});

app.post("/auth/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.clearCookie("verified_degencity_username", { path: '/' });
  req.session.destroy(() => res.json({ success: true }));
});

// ─── Auth — Discord ───────────────────────────────────────────────────────────
const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge:   10 * 60 * 1000, // 10 minutes — enough to complete OAuth
};

app.get("/auth/discord", (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(503).send("Discord OAuth not configured. Please set DISCORD_CLIENT_ID in .env");
  }

  const { degencity_username } = req.query;
  if (degencity_username) {
    res.cookie('verified_degencity_username', degencity_username.trim().toLowerCase(), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 1000, // 1 hour
      path:     '/',
    });
  }

  const state = randomBytes(16).toString("hex");
  // Store state in a cookie so it survives the redirect regardless of serverless instance
  res.cookie("discord_oauth_state", state, OAUTH_COOKIE_OPTS);

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
  // Verify state from cookie (not session — session breaks across serverless instances)
  const savedState = req.cookies.discord_oauth_state;
  res.clearCookie("discord_oauth_state");
  if (!savedState || state !== savedState) {
    return res.redirect("/account.html?error=state_mismatch");
  }

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

    const currentUserId = getAuthUserId(req) || req.session.userId || null;
    const result = await handleOAuthLoginOrLink({
      platform: "discord",
      platformId: profile.id,
      platformUsername: profile.username,
      platformAvatar: avatar,
      currentUserId
    });

    if (!result.success) {
      if (result.error === "already_linked") {
        return res.redirect("/account.html?error=discord_already_linked");
      }
      return res.redirect("/account.html?error=discord_failed");
    }

    setAuthCookie(res, result.userId);
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

  const { degencity_username } = req.query;
  if (degencity_username) {
    res.cookie('verified_degencity_username', degencity_username.trim().toLowerCase(), {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 1000, // 1 hour
      path:     '/',
    });
  }

  const state        = randomBytes(16).toString("hex");
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = sha256base64url(codeVerifier);

  // Store state + PKCE verifier in cookies (survive serverless instance change)
  res.cookie("kick_oauth_state",   state,        OAUTH_COOKIE_OPTS);
  res.cookie("kick_code_verifier", codeVerifier, OAUTH_COOKIE_OPTS);

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
  // Verify state from cookie
  const savedKickState = req.cookies.kick_oauth_state;
  const codeVerifier   = req.cookies.kick_code_verifier;
  res.clearCookie("kick_oauth_state");
  res.clearCookie("kick_code_verifier");
  if (!savedKickState || state !== savedKickState) return res.redirect("/account.html?error=state_mismatch");

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

    const currentUserId = getAuthUserId(req) || req.session.userId || null;
    if (!currentUserId) {
      return res.redirect("/account.html?error=discord_required");
    }

    // Verify current user has Discord linked
    if (supabase) {
      const { data: curUser } = await supabase
        .from("users")
        .select("discord_id")
        .eq("id", currentUserId)
        .single();
      if (!curUser || !curUser.discord_id) {
        return res.redirect("/account.html?error=discord_required");
      }
    }

    const verifiedDegenUsername = req.cookies.verified_degencity_username || null;
    if (!verifiedDegenUsername) {
      return res.redirect("/account.html?error=degencity_required");
    }

    const result = await handleOAuthLoginOrLink({
      platform: "kick",
      platformId: kickId,
      platformUsername: kickUsername,
      currentUserId,
      verifiedDegenUsername
    });

    if (!result.success) {
      if (result.error === "already_linked") {
        return res.redirect("/account.html?error=kick_already_linked");
      }
      if (result.error === "degencity_required") {
        return res.redirect("/account.html?error=degencity_required");
      }
      return res.redirect("/account.html?error=kick_failed");
    }

    // Clear temp DegenCity cookie now that it is permanently saved to DB
    res.clearCookie("verified_degencity_username", { path: '/' });

    // Register user ID in the memory map so points can be awarded
    if (kickUsername && result.userId) {
      chatActivityTracker.registerUser(kickUsername, result.userId);
    }

    setAuthCookie(res, result.userId);
    res.redirect("/account.html?success=kick");
  } catch (err) {
    console.error("Kick callback error:", err);
    res.redirect("/account.html?error=kick_failed");
  }
});

// ─── Link DegenCity Username (with verification against leaderboard) ──────────
app.post("/auth/link-degencity", async (req, res) => {
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

    // DB checks and linking are fully automated on the Kick connect callback,
    // so here we only verify the affiliate and set the temporary cookie.

    // Set/refresh secure temporary cookie
    const DEGEN_COOKIE = 'verified_degencity_username';
    res.cookie(DEGEN_COOKIE, degenUsername, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 1000, // 1 hour
      path:     '/',
    });

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
