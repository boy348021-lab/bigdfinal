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
import ActionDispatcher from "./server/blackjack/ActionDispatcher.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY               = process.env.DEGEN_API_KEY || "e7d0fb2a-20fd-471e-b6a2-f2989ea7ecba";
const YEET_API_KEY          = process.env.YEET_API_KEY || "2d820a56cb7d4479b8799f0cb4eea78f";
const YEET_BIGBALLZ_API_KEY = process.env.YEET_BIGBALLZ_API_KEY || process.env.DRTPT_API_KEY || "8e4cf0f57a2941109a4ba73fcc8fe5f4";
const YEET_API_BASE         = "https://api.yeet.com/concierge/public/affiliate/referrals";
const KICK_CHANNEL          = "bigdgamestv";

// ─── IN-MEMORY ZERO-LATENCY CACHE FOR YEET API (<2ms response) ───
const yeetCache = {
  bigd: {
    monthly: { data: null, timestamp: 0, key: '' },
    weekly:  { data: null, timestamp: 0, key: '' },
    allTime: { data: null, timestamp: 0, key: '' }
  },
  bigballz: {
    monthly: { data: null, timestamp: 0, key: '' },
    weekly:  { data: null, timestamp: 0, key: '' },
    allTime: { data: null, timestamp: 0, key: '' }
  }
};
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL for fresh data background sync

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
app.disable("x-powered-by");

// Block only direct sensitive dotfile/config requests
app.use((req, res, next) => {
  if (req.path.startsWith('/.env') || req.path.startsWith('/.git') || req.path === '/package.json') {
    return res.status(404).send("Not found");
  }
  next();
});

// Lightweight safe headers (no frame or cross-origin blocking)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
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

// Optional auth for guest modes
async function optionalAuth(req, res, next) {
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
    if (req.session) {
      req.session.isGuest = true;
    }
    return next();
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
    console.error("Optional authentication error:", err.message);
    next(); // Proceed as guest if token is invalid
  }
}

// ─── Kick Live Status ─────────────────────────────────────────────────────────
let kickCache = { live: false, checkedAt: null, ok: true };
const KICK_CACHE_TTL = 30_000;

function fetchKickViaPython() {
  return new Promise((resolve) => {
    const script = path.join(__dirname, "kick_status.py");
    let pythonBin = "python3";
    if (fs.existsSync("/opt/anaconda3/bin/python3")) {
      pythonBin = "/opt/anaconda3/bin/python3";
    } else if (fs.existsSync("/usr/local/bin/python3")) {
      pythonBin = "/usr/local/bin/python3";
    } else if (fs.existsSync("/usr/bin/python3")) {
      pythonBin = "/usr/bin/python3";
    }
    execFile(pythonBin, [script], { timeout: 12_000, env: process.env }, (err, stdout) => {
      if (err) {
        return resolve({ live: false, ok: false });
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        resolve({ live: false, ok: false });
      }
    });
  });
}

async function getKickLiveStatus() {
  const now = Date.now();
  if (kickCache.checkedAt && (now - kickCache.checkedAt < KICK_CACHE_TTL)) {
    return kickCache;
  }
  
  let isLive = false;
  let success = false;
  const channel = process.env.KICK_CHANNEL || "bigdgamestv";

  // Primary Method: Python scraper helper (bypasses Cloudflare using impersonated TLS)
  const pyResult = await fetchKickViaPython();
  console.log("pyResult in getKickLiveStatus:", pyResult);
  if (pyResult && pyResult.ok) {
    isLive = Boolean(pyResult.live);
    success = true;
  }

  // Fallback Method: Direct fetch if Python helper had an issue
  if (!success) {
    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${channel}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      });
      if (res.ok) {
        const data = await res.json();
        success = true;
        if (data.livestream && data.livestream.is_live !== false) {
          isLive = true;
        } else if (data.playback_url) {
          try {
            const hlsRes = await fetch(data.playback_url, { method: 'HEAD' });
            if (hlsRes.ok && hlsRes.status === 200) {
              isLive = true;
            }
          } catch (hlsErr) {}
        }
      }
    } catch (e) {}
  }

  kickCache = {
    live: isLive,
    channel: channel,
    checkedAt: now,
    ok: success
  };
  return kickCache;
}


app.get("/api/kick-live", async (req, res) => {
  try {
    const status = await getKickLiveStatus();
    res.json(status);
  } catch (err) {
    res.json({ live: false, channel: process.env.KICK_CHANNEL || "bigdgamestv", error: err.message });
  }
});


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

/**
 * Returns current calendar month UTC bounds (1st 00:00:00 UTC to last day 23:59:59 UTC)
 */
function getMonthlyTimeBounds() {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  
  const monthName = startOfMonth.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const periodLabel = `${monthName} ${startOfMonth.getUTCFullYear()} (Live)`;
  const monthKey = `${startOfMonth.getUTCFullYear()}-${String(startOfMonth.getUTCMonth() + 1).padStart(2, '0')}`;

  return {
    startOfMonth: startOfMonth.toISOString(),
    endOfMonth: endOfMonth.toISOString(),
    periodLabel,
    monthKey
  };
}

/**
 * Fetch from Yeet Affiliate API for a specific streamer with in-memory caching (<2ms)
 */
async function fetchYeetReferralsForStreamer(apiKey, streamerCode, { startDate = null, endDate = null, sortBy = 'volume', limit = 100, cacheKey = 'monthly' } = {}) {
  const now = Date.now();
  const cacheBucket = streamerCode === 'BIGBALLZ' ? yeetCache.bigballz : yeetCache.bigd;
  const cached = cacheBucket ? cacheBucket[cacheKey] : null;

  // Return cached result immediately if fresh (< 2ms response time)
  if (cached && cached.data && (now - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  if (!apiKey) {
    return cached && cached.data ? cached.data : [];
  }

  try {
    const params = new URLSearchParams({
      limit: String(limit),
      sortBy: sortBy
    });
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout guard

    const response = await fetch(`${YEET_API_BASE}?${params.toString()}`, {
      method: 'GET',
      headers: {
        'x-yeet-api-key': apiKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Yeet API (${streamerCode}) returned HTTP ${response.status} for ${cacheKey}`);
      return cached && cached.data ? cached.data : [];
    }

    const rawData = await response.json();
    if (Array.isArray(rawData)) {
      if (cacheBucket) {
        cacheBucket[cacheKey] = {
          data: rawData,
          timestamp: now,
          key: `${startDate}_${endDate}_${sortBy}`
        };
      }
      return rawData;
    }
  } catch (err) {
    console.error(`Yeet API fetch error (${streamerCode} / ${cacheKey}):`, err.message);
  }

  return cached && cached.data ? cached.data : [];
}

/**
 * Fetch and combine live referrals across both streamer codes (BIGD + BIGBALLZ)
 */
async function fetchCombinedYeetReferrals({ startDate = null, endDate = null, sortBy = 'volume', limit = 100, cacheKey = 'monthly' } = {}) {
  const [bigdRaw, bigballzRaw] = await Promise.all([
    fetchYeetReferralsForStreamer(YEET_API_KEY, 'BIGD', { startDate, endDate, sortBy, limit, cacheKey }),
    fetchYeetReferralsForStreamer(YEET_BIGBALLZ_API_KEY, 'BIGBALLZ', { startDate, endDate, sortBy, limit, cacheKey })
  ]);

  const playerMap = new Map();

  function processReferral(p, sourceCode) {
    if (!p) return;
    const vol = Number(p.volume) || 0;
    const points = Number(p.leaderboardPoints) || 0;
    const isHidden = Boolean(p.isHidden);
    // Group by normalized username if available, else by unique userId + sourceCode
    const normUser = (p.username && !isHidden && p.username.trim()) ? p.username.trim().toLowerCase() : null;
    const key = normUser ? normUser : `id_${p.userId}_${sourceCode}`;

    if (playerMap.has(key)) {
      const existing = playerMap.get(key);
      existing.volume += vol;
      existing.leaderboardPoints += points;
      existing.casinoPoints += (Number(p.casinoPoints) || 0);
      existing.sportsbookPoints += (Number(p.sportsbookPoints) || 0);
      existing.highestMultiplier = Math.max(existing.highestMultiplier, Number(p.highestMultiplier) || 0);
      if (!existing.sourceCode.includes(sourceCode)) {
        existing.sourceCode = `${existing.sourceCode} + ${sourceCode}`;
      }
    } else {
      playerMap.set(key, {
        userId: p.userId,
        username: isHidden ? "🔒 Hidden User" : (p.username || `Player_${p.userId}`),
        isHidden: isHidden,
        sourceCode: sourceCode,
        volume: vol,
        leaderboardPoints: points,
        casinoPoints: Number(p.casinoPoints) || 0,
        sportsbookPoints: Number(p.sportsbookPoints) || 0,
        highestMultiplier: Number(p.highestMultiplier) || 0,
        tier: p.tier || "Unranked",
        tierImage: p.tierImage || null
      });
    }
  }

  (bigdRaw || []).forEach(p => processReferral(p, 'BIGD'));
  (bigballzRaw || []).forEach(p => processReferral(p, 'BIGBALLZ'));

  return Array.from(playerMap.values());
}

// ==============================================================================
// 🚨 PROTECTED CODE SECTION – LEADERBOARD MODULE (UPDATED WITH YEET API)
// ==============================================================================
app.get("/api/leaderboard", async (req, res) => {
  const { after, before, period, partner } = req.query;
  const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const isDegenArchive = partner === "degencity" || (after && after.startsWith("2026-08") && partner !== "yeet");

  // Helper to load fallback dataset from file
  function getFallbackLeaderboard() {
    try {
      const fallbackPath = path.join(__dirname, "degencity_leaderboard_fallback.json");
      if (fs.existsSync(fallbackPath)) {
        const fallbackContent = fs.readFileSync(fallbackPath, "utf8");
        const data = JSON.parse(fallbackContent);
        return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      }
    } catch (readErr) {
      console.error("Local fallback JSON read error:", readErr);
    }
    return [];
  }

  // ─── 1. HISTORICAL DEGENCITY PARTNER ARCHIVE ───
  if (isDegenArchive) {
    let rawList = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const afterParam = after || (period === "biweekly" || period === "monthly" ? "2026-08-01T00:00:00.000Z" : "2026-06-01T00:00:00.000Z");
      let apiUrl = `https://api.degencity.com/api/v1/partner/affiliates/leaderboard?after=${encodeURIComponent(afterParam)}`;
      if (before) apiUrl += `&before=${encodeURIComponent(before)}`;
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { 
          "x-api-key": API_KEY || "", 
          "Accept": "application/json",
          "User-Agent": USER_AGENT
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (response.ok) {
        const json = await response.json();
        rawList = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
      }
    } catch (e) {}

    if (!rawList || rawList.length === 0) {
      rawList = getFallbackLeaderboard();
    }

    if (period === "biweekly" || period === "monthly") {
      const targetMonth = "2026-08";
      const formatted = rawList.map(u => {
        const uname = u.username || "";
        const monthObj = (u.wager_data || []).find(m => m.month === targetMonth);
        const currentWager = monthObj ? (Number(monthObj.total_wager_usd) || 0) : 0;
        return {
          user_id: u.user_id || 1,
          username: uname,
          wager_data: [
            {
              month: targetMonth,
              total_wager_usd: currentWager
            }
          ],
          _currentWager: currentWager
        };
      }).filter(u => u._currentWager > 0).sort((a, b) => b._currentWager - a._currentWager);

      res.set("Cache-Control", "no-store");
      return res.json({ data: formatted, partner: "degencity", period: "August 2026 (Archive)" });
    }

    // Lifetime DegenCity: if after/before are specified, filter months
    let lifetimeList = rawList;
    if (after || before) {
      const afterMonth = after ? after.slice(0, 7) : null;
      const beforeMonth = before ? before.slice(0, 7) : null;
      lifetimeList = rawList.map(u => {
        const filteredWagers = (u.wager_data || []).filter(w => {
          if (afterMonth && w.month < afterMonth) return false;
          if (beforeMonth && w.month >= beforeMonth) return false;
          return true;
        });
        return {
          ...u,
          wager_data: filteredWagers
        };
      }).filter(u => (u.wager_data || []).length > 0);
    }

    res.set("Cache-Control", "no-store");
    return res.json({ data: lifetimeList, partner: "degencity", period: "All-Time DegenCity Archive" });
  }

  // ─── 2. ACTIVE YEET AFFILIATE API & COMBINED LEADERBOARD ($3,000 POOL) ───
  try {
    const codeFilter = String(req.query.code || 'all').toLowerCase();
    const COMBINED_PRIZE_POOL = [1000, 500, 350, 250, 200, 175, 150, 125, 125, 125];
    const monthBounds = getMonthlyTimeBounds();
    const weekBounds = getWeeklyTimeBounds();

    let queryStartDate = monthBounds.startOfMonth;
    let queryEndDate = monthBounds.endOfMonth;
    let cacheKey = 'monthly';
    let displayPeriod = monthBounds.periodLabel;

    if (period === 'weekly') {
      queryStartDate = weekBounds.startOfWeek;
      queryEndDate = weekBounds.endOfWeek;
      cacheKey = 'weekly';
      displayPeriod = `Week ${weekBounds.weekId} (Live)`;
    } else if (period === 'all' || period === 'lifetime') {
      queryStartDate = null;
      queryEndDate = null;
      cacheKey = 'allTime';
      displayPeriod = 'All-Time Yeet Totals';
    }

    // 1. Fetch live combined referrals across both streamers (<2ms cached)
    let rawYeetReferrals = await fetchCombinedYeetReferrals({
      startDate: queryStartDate,
      endDate: queryEndDate,
      sortBy: 'volume',
      limit: 100,
      cacheKey
    });

    // 2. Map & format player data
    let yeetWagers = (rawYeetReferrals || []).map((p) => {
      const vol = Number(p.volume) || 0;
      const points = Number(p.leaderboardPoints) || 0;
      const isHidden = Boolean(p.isHidden);

      return {
        user_id: p.userId,
        username: p.username,
        is_hidden: isHidden,
        source_code: p.sourceCode || "BIGD",
        volume: vol,
        leaderboard_points: points,
        casino_points: Number(p.casinoPoints) || 0,
        sportsbook_points: Number(p.sportsbookPoints) || 0,
        highest_multiplier: Number(p.highestMultiplier) || 0,
        tier: p.tier || "Unranked",
        tier_image: p.tierImage || null,
        wager_data: [{ month: monthBounds.monthKey, total_wager_usd: Number(vol.toFixed(2)) }]
      };
    }).sort((a, b) => b.volume - a.volume);

    // Filter by code if explicitly specified
    if (codeFilter === 'bigd') {
      yeetWagers = yeetWagers.filter(u => u.source_code.includes('BIGD'));
    } else if (codeFilter === 'bigballz') {
      yeetWagers = yeetWagers.filter(u => u.source_code.includes('BIGBALLZ'));
    }

    const latestTimestamp = Math.max(
      yeetCache.bigd[cacheKey]?.timestamp || 0,
      yeetCache.bigballz[cacheKey]?.timestamp || 0
    );

    res.set("Cache-Control", "public, max-age=30");
    return res.json({
      data: yeetWagers,
      partner: "yeet",
      period: displayPeriod,
      prize_pool: 3000,
      prize_distribution: COMBINED_PRIZE_POOL,
      codes_supported: ["BIGD", "BIGBALLZ"],
      active_filter: codeFilter,
      cached_at: latestTimestamp ? new Date(latestTimestamp).toISOString() : new Date().toISOString()
    });
  } catch (err) {
    console.error("Yeet leaderboard error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─── API: Previous Partnered Sites & Weighted Accrued Totals (Phase 11) ────────
app.get("/api/partners/history", (req, res) => {
  res.json({
    success: true,
    current_partner: {
      name: "Yeet Casino",
      code: "BIGD",
      status: "active",
      season: "September 2026",
      url: "https://yeet.com",
      combined_with: "BigBallz",
      prize_pool: "$3,000"
    },
    previous_partners: [
      {
        id: "degencity",
        name: "DegenCity",
        status: "Archived Partner",
        period: "June 2026 – August 2026",
        weighted_total_wager: 102968.05,
        currency: "USD",
        referred_players: 42,
        milestones_smashed: [
          { target: "$50,000", reward: "10 Bonus Buys (2x $40 + 8x $20)", status: "Unlocked & Completed on Stream" }
        ],
        description: "Official community wagering campaign during Summer 2026. The community smashed the $50,000 milestone live on stream and achieved a record $102,968.05 weighted community wager."
      }
    ]
  });
});

// ─── API: Referral Tracking & Friend Attribution (Phase 10) ───────────────────
app.get("/api/referrals", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  try {
    const userId = req.user.id;
    const referralCode = req.user.kick_username || req.user.degencity_username || `ref_${String(userId).slice(0, 6)}`;
    const referralLink = `${req.protocol}://${req.get('host')}/verify.html?ref=${encodeURIComponent(referralCode)}`;

    // Query referred users from database (with sensitive data masked for privacy)
    let referredFriends = [];
    const { data: refUsers } = await supabase
      .from("users")
      .select("id, created_at, degencity_username, kick_username, points_balance")
      .eq("referred_by", userId);

    if (refUsers && refUsers.length > 0) {
      referredFriends = refUsers.map(u => {
        const rawName = u.degencity_username || u.kick_username || "Player";
        const maskedName = rawName.length > 3
          ? rawName.slice(0, 2) + "*".repeat(Math.min(5, rawName.length - 3)) + rawName.slice(-1)
          : rawName.slice(0, 1) + "**";
        return {
          id: u.id,
          username_masked: maskedName,
          joined_date: u.created_at,
          verified: Boolean(u.degencity_username),
          status: Boolean(u.degencity_username) ? "Verified with Code BIGD" : "Pending Code Verification",
          commission_coins: Math.round((u.points_balance || 0) * 0.05)
        };
      });
    }

    const totalFriends = referredFriends.length;
    const verifiedFriends = referredFriends.filter(f => f.verified).length;
    const totalBonusCoins = referredFriends.reduce((s, f) => s + f.commission_coins, 0);

    res.json({
      success: true,
      referral_code: referralCode,
      referral_link: referralLink,
      partner_code: "BIGD",
      total_referred: totalFriends,
      verified_referred: verifiedFriends,
      bonus_coins_earned: totalBonusCoins,
      referred_friends: referredFriends
    });

  } catch (err) {
    console.error("Referral tracking error:", err);
    res.status(500).json({ error: err.message });
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

// ─── Community Challenges Configuration & API (Phases 13, 14, 15, 18) ────────
const COMMUNITY_CHALLENGES = [
  {
    id: "sweet_bonanza",
    title: "Sweet Bonanza 2500",
    prize: "$20 CASH",
    desc: "First person to hit the 1000x Bomb on Yeet using code BIGD wins $20 Cash! Min bet $0.20. No bonus buys.",
    img: "/challenges/sweet-bonanza-challenge.jpg",
    status: "active",
    reused: true,
    campaign: "yeet"
  },
  {
    id: "out_of_woods",
    title: "Out of the Woods",
    prize: "$20 CASH",
    desc: "First person to hit 1000x on Yeet using code BIGD wins $20 Cash! Min bet $0.25. No bonus buys.",
    img: "/challenges/out-of-the-woods-challenge.jpg",
    status: "active",
    reused: true,
    campaign: "yeet"
  },
  {
    id: "big_bass",
    title: "Big Bass Reel Repeat",
    prize: "$10 CASH",
    desc: "First person to hit 300x on Yeet with code BIGD wins $10 Cash! Spin in, Reel Repeat & cash out big.",
    img: "/challenges/bigbass.png",
    status: "active",
    reused: true,
    campaign: "yeet"
  },
  {
    id: "sixsixsix",
    title: "SixSixSix",
    prize: "$25 CASH",
    desc: "First person to hit 500x on Yeet using code BIGD wins $25 Cash! Min bet $0.10 USD. Spin into darkness.",
    img: "/challenges/sixsixsix.png",
    status: "active",
    reused: true,
    campaign: "yeet"
  },
  {
    id: "fruit_party",
    title: "Fruit Party",
    prize: "$25 CASH",
    desc: "First person to hit 300x won $25 Cash! Completed during Summer Campaign. Claimed on Discord.",
    img: "/challenges/fruit-party-completed.png",
    status: "completed",
    claimed_by: "Community Winner",
    claimed_date: "August 2026",
    campaign: "degencity_archive"
  },
  {
    id: "leprechaun",
    title: "Le Prechaun Challenge",
    prize: "$60 CASH",
    desc: "First person to hit 5 Scatter wins $60 Cash. Archived from active rotation.",
    img: "/challenges/le-prechaun-challenge.jpg",
    status: "archived",
    archived_reason: "Removed from active rotation",
    campaign: "archive"
  }
];

app.get("/api/challenges", (req, res) => {
  const statusFilter = req.query.status;
  let list = COMMUNITY_CHALLENGES;
  if (statusFilter && statusFilter !== "all") {
    list = list.filter(c => c.status === statusFilter);
  }
  res.json({ success: true, challenges: list });
});

// ─── Wager-to-Points Synchronization Helper ────────────────────────────
// Automatically converts Yeet wagers into wallet points ($1 wagered = 10 BigD Coins)
async function syncWagerPointsForUser(userId) {
  if (!supabase || !userId) return 0;
  try {
    const { data: user, error: uErr } = await supabase
      .from("users")
      .select("id, degencity_username, kick_username, discord_username, metadata, points, points_balance")
      .eq("id", userId)
      .single();

    if (uErr || !user) return 0;

    const possibleNames = [
      user.degencity_username,
      user.kick_username,
      user.discord_username,
      user.degencity_username?.replace(/[^a-z0-9]/gi, ''),
      user.kick_username?.replace(/[^a-z0-9]/gi, '')
    ].filter(Boolean).map(n => n.toLowerCase().trim());

    // Fetch live referrals from Yeet across both codes
    const [monthlyYeet, allTimeYeet] = await Promise.all([
      fetchCombinedYeetReferrals({ cacheKey: 'monthly' }),
      fetchCombinedYeetReferrals({ cacheKey: 'allTime' })
    ]);

    const findMatch = (list) =>
      (list || []).find(p => p.username && possibleNames.includes(p.username.toLowerCase().trim()));

    const matchMonthly = findMatch(monthlyYeet);
    const matchAllTime = findMatch(allTimeYeet);

    const totalWagerUsd = Math.max(
      Number(matchMonthly?.volume) || 0,
      Number(matchAllTime?.volume) || 0
    );

    const totalWagerPoints = Math.floor(totalWagerUsd * 10);

    // Subtract redeemed points from Supabase redemptions table
    let redeemedPoints = 0;
    try {
      const { data: redemptions } = await supabase
        .from("redemptions")
        .select("points_cost")
        .eq("user_id", userId)
        .neq("status", "rejected");

      if (redemptions) {
        redeemedPoints = redemptions.reduce((sum, r) => sum + (Number(r.points_cost) || 0), 0);
      }
    } catch (rErr) {}

    // Calculate net blackjack gain/loss from audit_logs
    const userMeta = user.metadata || {};
    let blackjackNet = 0;
    try {
      const { data: bjLogs } = await supabase
        .from("audit_logs")
        .select("points_before, points_after")
        .eq("user_id", userId)
        .eq("source", "blackjack");

      if (bjLogs && bjLogs.length > 0) {
        blackjackNet = bjLogs.reduce((sum, log) => sum + ((log.points_after || 0) - (log.points_before || 0)), 0);
      }
    } catch (bjErr) {
      console.error("Error fetching blackjack audit logs:", bjErr.message);
    }

    const currentBal = Number(user.points_balance || user.points || 0);
    const calculatedTarget = Math.max(0, totalWagerPoints - redeemedPoints + blackjackNet);
    // Use maximum of calculated target and existing balance so we never wipe earned coins
    const targetBalance = Math.max(currentBal, calculatedTarget);

    if (currentBal !== targetBalance || userMeta.yeet_wager_points !== totalWagerPoints) {
      const updatedMeta = { 
        ...userMeta, 
        yeet_wager_usd: totalWagerUsd,
        yeet_wager_points: totalWagerPoints,
        redeemed_points: redeemedPoints,
        blackjack_net: blackjackNet,
        last_synced_at: new Date().toISOString()
      };

      await supabase
        .from("users")
        .update({ 
          points: targetBalance, 
          points_balance: targetBalance,
          metadata: updatedMeta, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", user.id);

      console.log(`💸 Yeet Wager Sync: User ${user.id} -> $${totalWagerUsd.toFixed(2)} wagered = ${totalWagerPoints} pts earned - ${redeemedPoints} redeemed + ${blackjackNet} blackjack net = ${targetBalance} wallet balance.`);
      return targetBalance;
    }

    return targetBalance;
  } catch (err) {
    console.error("syncWagerPointsForUser error:", err.message);
    return 0;
  }
}


// ─── Points API ───────────────────────────────────────────────────────────────
app.get("/api/points/:userId", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  await syncWagerPointsForUser(req.params.userId);
  const { data, error } = await supabase
    .from("users")
    .select("points, kick_username")
    .eq("id", req.params.userId)
    .single();
  if (error) return res.status(404).json({ error: "User not found" });
  res.json(data);
});

// Heartbeat endpoint removed

// ─── WAGER REWARDS & COIN MULTIPLIERS (PHASES 4, 5, 6, 7) ──────────────────────
const REWARD_MULTIPLIERS = {
  SLOTS: 10,           // $1 wagered on slots = 10 coins
  HOUSE_LIVE: 0.25     // $1 spent on house/live games = 0.25 coins
};

// Configurable Weekly Reward Tiers
const WEEKLY_REWARD_TIERS = [
  { tier: 1, name: "Bronze Grinder",    wager_threshold: 250,   reward_coins: 2500,  cash_value: 5,   badge: "🥉 Tier 1" },
  { tier: 2, name: "Silver Roller",     wager_threshold: 1000,  reward_coins: 10000, cash_value: 10,  badge: "🥈 Tier 2" },
  { tier: 3, name: "Gold High Roller",  wager_threshold: 1500,  reward_coins: 15000, cash_value: 15,  badge: "🥇 Tier 3" },
  { tier: 4, name: "Platinum Whale",    wager_threshold: 2500,  reward_coins: 25000, cash_value: 20,  badge: "💎 Tier 4" },
  { tier: 5, name: "Diamond Legend",    wager_threshold: 5000,  reward_coins: 50000, cash_value: 30,  badge: "👑 Tier 5" },
  { tier: 6, name: "Apex Master",       wager_threshold: 10000, reward_coins: 100000, cash_value: 40, badge: "🔥 Tier 6" }
];

/**
 * Calculate coin conversion for slots and house/live wagers (Phase 5)
 */
function calculateCoinConversion(slotsWager = 0, houseLiveWager = 0) {
  const sWager = Math.max(0, Number(slotsWager) || 0);
  const hlWager = Math.max(0, Number(houseLiveWager) || 0);
  const slotCoins = Number((sWager * REWARD_MULTIPLIERS.SLOTS).toFixed(4));
  const houseLiveCoins = Number((hlWager * REWARD_MULTIPLIERS.HOUSE_LIVE).toFixed(4));
  const totalWager = Number((sWager + hlWager).toFixed(2));
  const totalCoins = Number((slotCoins + houseLiveCoins).toFixed(4));

  return {
    slots_wager: sWager,
    slots_multiplier: REWARD_MULTIPLIERS.SLOTS,
    slot_coins: slotCoins,
    house_live_wager: hlWager,
    house_live_multiplier: REWARD_MULTIPLIERS.HOUSE_LIVE,
    house_live_coins: houseLiveCoins,
    total_wager: totalWager,
    total_coins: totalCoins
  };
}

/**
 * Returns current week UTC bounds and week identifier (Phase 7)
 */
function getWeeklyTimeBounds() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday is start of week
  const startOfWeek = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), diff, 0, 0, 0, 0));
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);

  const msRemaining = Math.max(0, endOfWeek.getTime() - now.getTime());
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((msRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60));

  const weekNumber = Math.ceil((((startOfWeek - new Date(Date.UTC(startOfWeek.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
  const weekId = `${startOfWeek.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

  return {
    weekId,
    startOfWeek: startOfWeek.toISOString(),
    endOfWeek: endOfWeek.toISOString(),
    msRemaining,
    countdown: `${daysRemaining}d ${hoursRemaining}h ${minutesRemaining}m`,
    daysRemaining
  };
}

// ─── API: Weekly Rewards & User Progression (Phase 4, 6, 7) ───────────────────
app.get("/api/rewards/weekly", async (req, res) => {
  const weekInfo = getWeeklyTimeBounds();
  const authHeader = req.headers.authorization;
  let targetUser = null;

  if (authHeader && authHeader.startsWith("Bearer ") && supabase) {
    try {
      const token = authHeader.split(" ")[1];
      const { data: session } = await supabase
        .from("sessions")
        .select("user_id, users(*)")
        .eq("token", token)
        .gt("expires_at", new Date().toISOString())
        .single();
      if (session?.users) targetUser = session.users;
    } catch (e) {}
  }

  let userProgression = null;
  let recentLedger = [];

  if (targetUser && supabase) {
    try {
      // 1. Fetch lifetime transactions for user
      const { data: allTx } = await supabase
        .from("wager_transactions")
        .select("*")
        .eq("user_id", targetUser.id)
        .order("processed_at", { ascending: false });

      const txList = allTx || [];
      let lifetimeWager = txList.reduce((sum, tx) => sum + (Number(tx.wager_amount_usd) || 0), 0);

      // 2. Filter for current week transactions
      const startMs = new Date(weekInfo.startOfWeek).getTime();
      const endMs = new Date(weekInfo.endOfWeek).getTime();
      const weekTx = txList.filter(tx => {
        const txMs = new Date(tx.processed_at).getTime();
        return txMs >= startMs && txMs <= endMs;
      });

      let weeklySlotsWager = 0;
      let weeklyHouseLiveWager = 0;
      let weeklyCoinsEarned = 0;

      weekTx.forEach(tx => {
        const amt = Number(tx.wager_amount_usd) || 0;
        const wType = String(tx.provider || '').toLowerCase();
        if (wType.includes('house') || wType.includes('live')) {
          weeklyHouseLiveWager += amt;
          weeklyCoinsEarned += Number((amt * REWARD_MULTIPLIERS.HOUSE_LIVE).toFixed(4));
        } else {
          weeklySlotsWager += amt;
          weeklyCoinsEarned += Number((amt * REWARD_MULTIPLIERS.SLOTS).toFixed(4));
        }
      });

      let weeklyTotalWager = Number((weeklySlotsWager + weeklyHouseLiveWager).toFixed(2));

      // 2b. Check Live Yeet API Referrals for accurate current user stats
      try {
        // Build a normalized set of possible names to match against
        const possibleNames = [
          targetUser.degencity_username,
          targetUser.kick_username,
          targetUser.discord_username,
          // Also try stripping common suffixes/prefixes
          targetUser.degencity_username?.replace(/[^a-z0-9]/gi, ''),
          targetUser.kick_username?.replace(/[^a-z0-9]/gi, '')
        ].filter(Boolean).map(n => n.toLowerCase().trim());

        const [weeklyYeet, monthlyYeet, allTimeYeet] = await Promise.all([
          fetchCombinedYeetReferrals({ startDate: weekInfo.startOfWeek, endDate: weekInfo.endOfWeek, cacheKey: 'weekly' }),
          fetchCombinedYeetReferrals({ cacheKey: 'monthly' }),
          fetchCombinedYeetReferrals({ cacheKey: 'allTime' })
        ]);

        // Normalize Yeet usernames for matching
        const findYeetMatch = (list) =>
          (list || []).find(p => p.username && possibleNames.includes(p.username.toLowerCase().trim()));

        const userWeeklyYeet  = findYeetMatch(weeklyYeet);
        const userMonthlyYeet = findYeetMatch(monthlyYeet);
        const userAllTimeYeet = findYeetMatch(allTimeYeet);

        // Yeet API is authoritative — use highest recorded volume
        const bestWeeklyVolume = Math.max(
          Number(userWeeklyYeet?.volume) || 0,
          Number(userMonthlyYeet?.volume) || 0
        );

        if (bestWeeklyVolume > weeklyTotalWager) {
          weeklyTotalWager = Number(bestWeeklyVolume.toFixed(2));
          weeklySlotsWager = weeklyTotalWager;
        }

        const bestLifetime = Math.max(
          Number(userAllTimeYeet?.volume) || 0,
          Number(userMonthlyYeet?.volume) || 0,
          weeklyTotalWager
        );
        if (bestLifetime > lifetimeWager) {
          lifetimeWager = Number(bestLifetime.toFixed(2));
        }
      } catch (yeetSyncErr) {
        console.warn("Live Yeet user sync note:", yeetSyncErr.message);
      }

      // 3. Find current and next reward tier
      let currentTier = null;
      let nextTier = WEEKLY_REWARD_TIERS[0];
      for (let i = 0; i < WEEKLY_REWARD_TIERS.length; i++) {
        const tier = WEEKLY_REWARD_TIERS[i];
        if (weeklyTotalWager >= tier.wager_threshold) {
          currentTier = tier;
          nextTier = WEEKLY_REWARD_TIERS[i + 1] || null;
        }
      }

      const prevThreshold = currentTier ? currentTier.wager_threshold : 0;
      const nextThreshold = nextTier ? nextTier.wager_threshold : WEEKLY_REWARD_TIERS[WEEKLY_REWARD_TIERS.length - 1].wager_threshold;
      const span = Math.max(1, nextThreshold - prevThreshold);
      const progressInTier = Math.max(0, weeklyTotalWager - prevThreshold);
      const tierProgressPct = nextTier
        ? Math.min(100, Math.max(0, Math.round((progressInTier / span) * 100)))
        : 100;

      const remainingForNext = nextTier
        ? Math.max(0, Number((nextTier.wager_threshold - weeklyTotalWager).toFixed(2)))
        : 0;

      let claimedTiers = [];
      try {
        const { data: claims } = await supabase
          .from("redemptions")
          .select("reward_id")
          .eq("user_id", targetUser.id)
          .like("reward_id", `weekly_tier_%_${weekInfo.weekId}`);

        if (claims) {
          claimedTiers = claims.map(c => {
            const m = String(c.reward_id).match(/weekly_tier_(\d+)_/);
            return m ? parseInt(m[1], 10) : null;
          }).filter(Boolean);
        }
      } catch (cErr) {}

      userProgression = {
        user_id: targetUser.id,
        username: targetUser.degencity_username || targetUser.kick_username || targetUser.discord_username || "Verified Player",
        discord_username: targetUser.discord_username,
        kick_username: targetUser.kick_username,
        yeet_username: targetUser.degencity_username,
        points_balance: targetUser.points_balance || 0,
        lifetime_wager: Number(lifetimeWager.toFixed(2)),
        weekly_wager: weeklyTotalWager,
        weekly_slots_wager: Number(weeklySlotsWager.toFixed(2)),
        weekly_house_live_wager: Number(weeklyHouseLiveWager.toFixed(2)),
        weekly_coins_earned: weeklyCoinsEarned,
        current_tier: currentTier,
        next_tier: nextTier,
        tier_progress_pct: tierProgressPct,
        wager_remaining_for_next_tier: remainingForNext,
        claimed_tiers: claimedTiers
      };

      recentLedger = txList.slice(0, 15).map(tx => {
        const amt = Number(tx.wager_amount_usd) || 0;
        const wType = String(tx.provider || 'SLOTS').toUpperCase();
        const isHouse = wType.includes('HOUSE') || wType.includes('LIVE');
        const multiplier = isHouse ? REWARD_MULTIPLIERS.HOUSE_LIVE : REWARD_MULTIPLIERS.SLOTS;
        const coins = tx.points_awarded || Number((amt * multiplier).toFixed(4));
        return {
          id: tx.id || tx.transaction_id,
          transaction_id: tx.transaction_id,
          timestamp: tx.processed_at,
          wager_type: isHouse ? "HOUSE / LIVE" : "SLOTS",
          wager_amount_usd: amt,
          multiplier: multiplier,
          coins_earned: coins,
          week_id: weekInfo.weekId
        };
      });

    } catch (dbErr) {
      console.error("Weekly rewards DB calculation error:", dbErr);
    }
  }

  res.json({
    success: true,
    week_info: weekInfo,
    multipliers: REWARD_MULTIPLIERS,
    reward_tiers: WEEKLY_REWARD_TIERS,
    user_progression: userProgression,
    recent_ledger: recentLedger
  });
});

// ─── POST /api/rewards/weekly/claim (Claim weekly tier reward — 1 per tier per week) ───
app.post("/api/rewards/weekly/claim", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });
  if (!req.user) return res.status(401).json({ error: "Please log in first." });

  const { tier } = req.body;
  const tierNum = parseInt(tier, 10);
  const targetTier = WEEKLY_REWARD_TIERS.find(t => t.tier === tierNum);
  if (!targetTier) return res.status(400).json({ error: "Invalid tier specified" });

  const weekInfo = getWeeklyTimeBounds();
  const rewardId = `weekly_tier_${tierNum}_${weekInfo.weekId}`;
  const userId = req.user.id;

  try {
    // Check if already claimed this week
    const { data: existing } = await supabase
      .from("redemptions")
      .select("id, created_at, status")
      .eq("user_id", userId)
      .eq("reward_id", rewardId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: `Tier ${tierNum} ($${targetTier.cash_value} Cash) already redeemed this week (${weekInfo.weekId}).` });
    }

    // Insert claim record into redemptions ledger
    const { data: record, error: insErr } = await supabase
      .from("redemptions")
      .insert({
        user_id: userId,
        reward_id: rewardId,
        reward_label: `Weekly Tier ${tierNum}: $${targetTier.cash_value} Cash (${weekInfo.weekId})`,
        points_cost: 0,
        status: "pending"
      })
      .select()
      .single();

    if (insErr) throw insErr;

    console.log(`🎁 Weekly Tier Claim: User ${userId} claimed Tier ${tierNum} ($${targetTier.cash_value}) for ${weekInfo.weekId}`);

    return res.json({
      success: true,
      tier: tierNum,
      cash_value: targetTier.cash_value,
      reward_id: rewardId,
      week_id: weekInfo.weekId,
      status: "redeemed"
    });
  } catch (err) {
    console.error("Weekly tier claim error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Real-Time Coin Conversion Calculator (Phase 5) ──────────────────────
app.post("/api/rewards/calculate", (req, res) => {
  const { slots_wager = 0, house_live_wager = 0 } = req.body;
  const result = calculateCoinConversion(slots_wager, house_live_wager);
  res.json({ success: true, calculation: result });
});

// ─── Wager Webhook (Auditable Multiplier Support) (Phase 6) ───────────────────
app.post("/api/webhooks/wager", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Database not configured" });

  const {
    transaction_id,
    degencity_username,
    wager_amount_usd,
    game_type = "slots", // 'slots' | 'house' | 'live'
    provider = "yeet"
  } = req.body;

  if (!transaction_id || !degencity_username || wager_amount_usd == null) {
    return res.status(400).json({ error: "Missing required fields: transaction_id, degencity_username, wager_amount_usd" });
  }
  if (isNaN(wager_amount_usd) || Number(wager_amount_usd) <= 0) {
    return res.status(400).json({ error: "Invalid wager_amount_usd" });
  }

  const amount = Number(wager_amount_usd);
  const isHouseLive = String(game_type).toLowerCase().includes("house") || String(game_type).toLowerCase().includes("live");
  const multiplier = isHouseLive ? REWARD_MULTIPLIERS.HOUSE_LIVE : REWARD_MULTIPLIERS.SLOTS;
  const points = Math.max(1, Math.round(amount * multiplier));

  try {
    // 1) Look up user by username (supports Yeet / DegenCity)
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("id, points_balance")
      .or(`degencity_username.ilike.${degencity_username.trim()},kick_username.ilike.${degencity_username.trim()}`)
      .single();

    if (userErr || !user) {
      return res.status(404).json({ error: `No user found for casino username: ${degencity_username}` });
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
      p_source:  `${provider}_wager_${isHouseLive ? 'houselive' : 'slots'}`,
      p_ref:     transaction_id
    });
    if (rpcErr) throw new Error(rpcErr.message);

    // 4) Log the wager transaction with auditable ledger data
    await supabase.from("wager_transactions").insert({
      user_id:          user.id,
      transaction_id,
      provider:         isHouseLive ? `${provider}_house` : `${provider}_slots`,
      wager_amount_usd: amount,
      points_awarded:   points
    });

    console.log(`💸 Wager (${isHouseLive ? 'House/Live' : 'Slots'}): ${degencity_username} wagered $${amount} × ${multiplier} → +${points} coins (tx: ${transaction_id})`);
    res.json({ ok: true, points_awarded: points, multiplier, game_type: isHouseLive ? "HOUSE/LIVE" : "SLOTS", new_balance: newBalance });

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

// ─── CASINO: ENTERPRISE BLACKJACK SUBSYSTEM ──────────────────────────────────
const activeBlackjackGames = new Map(); // Map<userId, Engine>
const actionDispatcher = new ActionDispatcher(activeBlackjackGames, supabase);

function getBlackjackUserId(req) {
  if (req.user && req.user.id) return req.user.id;
  const guestHeader = req.headers['x-guest-id'] || req.cookies?.bj_guest_id || req.sessionID || 'session';
  return `guest_${guestHeader}`;
}

// GET /api/casino/blackjack/state (Fetch active round snapshot)
app.get("/api/casino/blackjack/state", optionalAuth, (req, res) => {
  const userId = getBlackjackUserId(req);
  const engine = activeBlackjackGames.get(userId);
  if (!engine) return res.json({ active: false });
  res.json({ active: true, snapshot: engine.getSnapshot() });
});

// POST /api/casino/blackjack/deal (Place bet & deal initial round)
app.post("/api/casino/blackjack/deal", optionalAuth, async (req, res) => {
  const userId = getBlackjackUserId(req);
  const isGuest = userId.startsWith('guest');
  if (!supabase && !isGuest) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const bet = parseInt(req.body.bet, 10);

    const sessionProfit = req.session.blackjackProfit || 0;
    if (sessionProfit >= 10000) {
      return res.status(400).json({ error: "Session profit limit of 10,000 points reached. Please cash out or start a new session." });
    }
    if (bet > 5000) {
      return res.status(400).json({ error: "Maximum bet is 5,000 points." });
    }

    const { snapshot, updatedBalance } = await actionDispatcher.dispatch(userId, 'DEAL', { bet });
    if (snapshot.isEnded) {
      req.session.blackjackProfit = (req.session.blackjackProfit || 0) + snapshot.totalProfit;
    }
    res.json({ ok: true, new_balance: updatedBalance, handState: snapshot });
  } catch (err) {
    if (err.message.toLowerCase().includes("insufficient")) {
      return res.status(402).json({ error: "Insufficient point balance" });
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /api/casino/blackjack/insurance (Buy or Decline Insurance)
app.post("/api/casino/blackjack/insurance", optionalAuth, async (req, res) => {
  const userId = getBlackjackUserId(req);
  const isGuest = userId.startsWith('guest');
  if (!supabase && !isGuest) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const actionType = req.body.buyInsurance ? 'INSURANCE_BUY' : 'INSURANCE_DECLINE';
    const { snapshot, updatedBalance } = await actionDispatcher.dispatch(userId, actionType);
    if (snapshot.isEnded) {
      req.session.blackjackProfit = (req.session.blackjackProfit || 0) + snapshot.totalProfit;
    }
    res.json({ ok: true, new_balance: updatedBalance, handState: snapshot });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/casino/blackjack/action (Dispatch HIT, STAND, DOUBLE, SPLIT, SURRENDER)
app.post("/api/casino/blackjack/action", optionalAuth, async (req, res) => {
  const userId = getBlackjackUserId(req);
  const isGuest = userId.startsWith('guest');
  if (!supabase && !isGuest) {
    return res.status(503).json({ error: "Database not configured" });
  }

  try {
    const rawAction = (req.body.action || '').toUpperCase();
    const actionMap = {
      'HIT': 'HIT',
      'STAND': 'STAND',
      'DOUBLE': 'DOUBLE',
      'SPLIT': 'SPLIT',
      'SURRENDER': 'SURRENDER'
    };
    const targetAction = actionMap[rawAction];
    if (!targetAction) return res.status(400).json({ error: `Invalid action '${req.body.action}'` });

    const { snapshot, updatedBalance } = await actionDispatcher.dispatch(userId, targetAction);
    if (snapshot.isEnded) {
      req.session.blackjackProfit = (req.session.blackjackProfit || 0) + snapshot.totalProfit;
    }
    res.json({ ok: true, new_balance: updatedBalance, handState: snapshot });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/casino/blackjack/history (Get completed game logs and stats)
app.get("/api/casino/blackjack/history", optionalAuth, async (req, res) => {
  const userId = getBlackjackUserId(req);
  const isGuest = userId.startsWith('guest');
  if (!supabase && !isGuest) {
    return res.status(503).json({ error: "Database not configured" });
  }

  if (isGuest) {
    return res.json({ ok: true, history: [], stats: { gamesPlayed: 0, wins: 0, losses: 0, pushes: 0, totalWagered: 0, totalWon: 0, netPoints: 0 } });
  }

  try {
    const { data: logs, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('user_id', userId)
      .in('action', ['BLACKJACK_BET', 'BLACKJACK_PAYOUT', 'BLACKJACK_INSURANCE', 'BLACKJACK_DOUBLE', 'BLACKJACK_SPLIT'])
      .order('created_at', { ascending: false })
      .limit(500); // Fetching 500 to ensure we can group into at least 100 games

    if (error) throw error;

    const gameMap = {};
    for (const log of (logs || [])) {
      if (!log.transaction_reference) continue;
      
      // Extract gameId from transaction_reference (e.g. bj_bet_bj_userId_timestamp_timestamp)
      // Assuming prefix is always two parts like "bj_bet_" or "bj_payout_"
      const refParts = log.transaction_reference.split('_');
      let gameId = log.transaction_reference;
      if (refParts.length >= 3) {
        // Strip the first two parts (e.g., bj_bet)
        gameId = refParts.slice(2).join('_');
      }

      if (!gameMap[gameId]) {
        gameMap[gameId] = { gameId, date: log.created_at, bet: 0, payout: 0, net: 0, actions: [] };
      }
      
      const g = gameMap[gameId];
      g.actions.push(log);
      
      const actionName = log.action.toUpperCase();
      if (['BLACKJACK_BET', 'BLACKJACK_INSURANCE', 'BLACKJACK_DOUBLE', 'BLACKJACK_SPLIT'].includes(actionName)) {
        // Bets are usually recorded as negative points, we sum absolute value
        g.bet += Math.abs(log.points_change || 0);
      } else if (actionName === 'BLACKJACK_PAYOUT') {
        g.payout += Math.abs(log.points_change || 0);
      }
    }

    const historyList = Object.values(gameMap)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 100);

    let wins = 0;
    let losses = 0;
    let pushes = 0;
    let totalWagered = 0;
    let totalWon = 0;

    for (const g of historyList) {
      g.net = g.payout - g.bet;
      if (g.net > 0) wins++;
      else if (g.net < 0) losses++;
      else pushes++;
      
      totalWagered += g.bet;
      totalWon += g.payout;
    }

    const stats = {
      gamesPlayed: historyList.length,
      wins,
      losses,
      pushes,
      totalWagered,
      totalWon,
      netPoints: totalWon - totalWagered
    };

    res.json({ ok: true, history: historyList, stats });
  } catch (err) {
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

  // Automatically sync wager-to-points for user ($1 wagered = 10 points credited to wallet)
  if (req.user && req.user.id) {
    const freshPoints = await syncWagerPointsForUser(req.user.id);
    if (freshPoints !== undefined && freshPoints !== null) {
      req.user.points = freshPoints;
    }
  }

  const userMeta = req.user.metadata || {};

  res.json({
    loggedIn:          true,
    token:             req.cookies.bigdtv_token || (req.headers.authorization ? req.headers.authorization.split(' ')[1] : null),
    userId:            req.user.id,
    clerkId:           req.user.clerk_id || null,
    email:             req.user.email,
    displayName:       req.user.display_name,
    avatarUrl:         req.user.avatar_url,
    points:            req.user.points ?? 0,
    augustWagerUsd:    userMeta.august_wager_usd ?? 0,
    augustWagerPoints: userMeta.august_wager_points ?? 0,
    redeemedPoints:    userMeta.redeemed_points ?? 0,
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




  const { degencity_username } = req.body;
  if (!degencity_username) return res.status(400).json({ error: "Username required" });

  const degenUsername = degencity_username.trim().toLowerCase();

  try {
    // 1) Verify the Yeet username exists in the live referrals list
    const [monthlyYeet, allTimeYeet] = await Promise.all([
      fetchCombinedYeetReferrals({ cacheKey: 'monthly' }),
      fetchCombinedYeetReferrals({ cacheKey: 'allTime' })
    ]);

    const combinedList = [...(monthlyYeet || []), ...(allTimeYeet || [])];
    const match = combinedList.find(u => (u.username || "").trim().toLowerCase() === degenUsername);

    if (!match) {
      return res.status(422).json({
        error: `Yeet username "${degencity_username}" was not found in the referrals list. Make sure you registered on Yeet using code BIGD or BIGBALLZ.`
      });
    }

    // 2) Check if another user has already linked this Yeet username
    if (supabase) {
      const { data: duplicateUser } = await supabase
        .from("users")
        .select("id")
        .eq("degencity_username", degenUsername)
        .neq("id", req.user.id)
        .maybeSingle();

      if (duplicateUser) {
        return res.status(422).json({ error: "This Yeet account is already linked to another player." });
      }

      // 3) Update Yeet username in users table
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

      // Update linked_accounts table for Yeet as well
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

      // Immediately convert wagers to points ($1 = 10 pts) and credit user wallet
      const newPoints = await syncWagerPointsForUser(req.user.id);

      return res.json({ success: true, degencity_username: degenUsername, verified: true, points: newPoints });
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
    // Points are wager-only. Kick chat awards disabled.
    return;
  },
};

// ─── Stream Watch Time Heartbeat Endpoint (Disabled — wager-only points) ─────
app.post("/api/stream-heartbeat", requireAuth, async (req, res) => {
  // Points are wager-only. Watch time awards disabled.
  res.json({ success: true, awarded: false, message: "Watch points disabled; points are wager-only" });
});



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
