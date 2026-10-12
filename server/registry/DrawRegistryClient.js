import crypto from "crypto";

/**
 * Shared Draw Registry Client SDK
 * Ready for drop-in use in Next.js / TypeScript / React projects
 */
export class DrawRegistryClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || "http://localhost:3000").replace(/\/$/, "");
    this.keyId = options.keyId || process.env.REGISTRY_BALLZS_KEY_ID || "key_ballzs_live_01";
    this.secret = options.secret || process.env.REGISTRY_BALLZS_SECRET || "ballzs_partner_secret_change_me";
  }

  /**
   * Helper: Generate HMAC-SHA256 signature for outgoing requests
   */
  _sign(body) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const rawBody = typeof body === "string" ? body : JSON.stringify(body || {});
    const payload = `${timestamp}.${rawBody}`;
    const signature = crypto
      .createHmac("sha256", this.secret)
      .update(payload)
      .digest("hex");

    return {
      "Content-Type": "application/json",
      "x-site-key-id": this.keyId,
      "x-site-signature": signature,
      "x-site-timestamp": timestamp
    };
  }

  /**
   * Fetch current milestone pool statuses, sizes, and user eligibility
   */
  async getPoolStatus(params = {}) {
    const search = new URLSearchParams();
    if (params.discordId) search.append("discordId", params.discordId);
    if (params.yeetUsername) search.append("yeetUsername", params.yeetUsername);

    const res = await fetch(`${this.baseUrl}/api/v1/draws/pool-status?${search.toString()}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch pool status: ${res.statusText}`);
    }
    return await res.json();
  }

  /**
   * Register a player for a milestone draw pool
   */
  async registerForDraw({ discordId, milestoneId, idempotencyKey, candidateWager, candidateYeetUsername, candidateYeetUserId }) {
    const body = {
      discordId,
      milestoneId,
      idempotencyKey,
      candidateWager,
      candidateYeetUsername,
      candidateYeetUserId
    };

    const res = await fetch(`${this.baseUrl}/api/v1/draws/register`, {
      method: "POST",
      headers: this._sign(body),
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok && res.status !== 403) {
      throw new Error(data.error || `Registration failed: ${res.statusText}`);
    }
    return data;
  }

  /**
   * Link a player's Discord ID with verified Yeet account
   */
  async linkPlayer({ discordId, discordUsername, yeetUserId, yeetUsername }) {
    const body = { discordId, discordUsername, yeetUserId, yeetUsername };

    const res = await fetch(`${this.baseUrl}/api/v1/players/link`, {
      method: "POST",
      headers: this._sign(body),
      body: JSON.stringify(body)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `Link player failed: ${res.statusText}`);
    }
    return data;
  }
}
