import crypto from "crypto";

/**
 * Shared Draw Registry Configuration & Constants
 */
export const REGISTRY_CONFIG = {
  MILESTONE_THRESHOLDS: {
    1: 3000,   // $3,000 personal monthly wager -> $50,000 community milestone
    2: 5000,   // $5,000 personal monthly wager -> $100,000 community milestone
    3: 10000,  // $10,000 personal monthly wager -> $150,000 community milestone
    4: 10000,  // $10,000 personal monthly wager -> $200,000 community milestone
    5: 10000   // $10,000 personal monthly wager -> $300,000 community milestone
  },
  COMMUNITY_TARGETS: {
    1: 50000,
    2: 100000,
    3: 150000,
    4: 200000,
    5: 300000
  },
  // Site credentials for inter-site authentication
  SITES: {
    bigdtv: {
      keyId: process.env.REGISTRY_BIGD_KEY_ID || "key_bigd_live_01",
      secret: process.env.REGISTRY_BIGD_SECRET || "bigd_internal_secret_change_me"
    },
    ballzs: {
      keyId: process.env.REGISTRY_BALLZS_KEY_ID || "key_ballzs_live_01",
      secret: process.env.REGISTRY_BALLZS_SECRET || "ballzs_partner_secret_change_me"
    }
  }
};

/**
 * Returns current campaign month identifier based on US Eastern Time (ET)
 */
export function getCurrentCampaignMonth() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const map = {};
  parts.forEach(p => (map[p.type] = p.value));
  return `${map.year}-${map.month}`;
}

/**
 * HMAC Signature verification helper for site-to-registry API calls
 */
export function verifyHmacSignature(rawBody, signature, timestamp, siteSecret) {
  if (!signature || !timestamp || !siteSecret) return false;
  
  // 5 minute max clock drift guard
  const now = Math.floor(Date.now() / 1000);
  const reqTime = parseInt(timestamp, 10);
  if (Math.abs(now - reqTime) > 300) {
    return false;
  }

  const payload = `${timestamp}.${typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody)}`;
  const expectedSig = crypto
    .createHmac("sha256", siteSecret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expectedSig, "hex"));
}

/**
 * Generate HMAC Signature for client requests
 */
export function createHmacSignature(body, siteSecret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = typeof body === "string" ? body : JSON.stringify(body);
  const payload = `${timestamp}.${rawBody}`;
  const signature = crypto
    .createHmac("sha256", siteSecret)
    .update(payload)
    .digest("hex");

  return { signature, timestamp };
}
