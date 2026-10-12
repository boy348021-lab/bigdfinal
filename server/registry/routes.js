import { verifyHmacSignature, REGISTRY_CONFIG } from "./config.js";

/**
 * Register inter-site and client REST API endpoints for the Shared Draw Registry
 */
export function setupRegistryRoutes(app, registryEngine, options = {}) {
  const { getUserWagerDetails } = options;

  // Middleware: Authenticate incoming partner site calls via HMAC-SHA256
  function authenticateSite(req, res, next) {
    const keyId = req.headers["x-site-key-id"];
    const signature = req.headers["x-site-signature"];
    const timestamp = req.headers["x-site-timestamp"];

    if (!keyId || !signature || !timestamp) {
      return res.status(401).json({ error: "Missing HMAC authentication headers (x-site-key-id, x-site-signature, x-site-timestamp)" });
    }

    // Match site by keyId
    let targetSite = null;
    let siteSecret = null;
    for (const [siteId, conf] of Object.entries(REGISTRY_CONFIG.SITES)) {
      if (conf.keyId === keyId) {
        targetSite = siteId;
        siteSecret = conf.secret;
        break;
      }
    }

    if (!targetSite || !siteSecret) {
      return res.status(401).json({ error: "Invalid x-site-key-id" });
    }

    const isValid = verifyHmacSignature(req.body, signature, timestamp, siteSecret);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid HMAC signature or expired timestamp (>300s)" });
    }

    req.callerSite = targetSite;
    next();
  }

  // ─── 1. INTER-SITE API (BALLZS & PARTNER ACCESS) ──────────────────────────

  /**
   * GET /api/v1/draws/pool-status
   * Public or Partner status query for active milestone draws
   */
  app.get("/api/v1/draws/pool-status", async (req, res) => {
    try {
      const { discordId, yeetUsername } = req.query;
      const status = await registryEngine.getPoolStatus({ discordId, yeetUsername });
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * POST /api/v1/players/link (HMAC Signed)
   * Partner site links a player's Discord ID to verified Yeet account
   */
  app.post("/api/v1/players/link", authenticateSite, async (req, res) => {
    try {
      const { discordId, discordUsername, yeetUserId, yeetUsername } = req.body;
      if (!discordId) return res.status(400).json({ error: "discordId required" });

      const player = await registryEngine.linkPlayer({
        discordId,
        discordUsername,
        yeetUserId: yeetUserId ? Number(yeetUserId) : null,
        yeetUsername,
        sourceSite: req.callerSite
      });

      res.json({ success: true, player });
    } catch (err) {
      const status = err.message.includes("already linked") ? 409 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  /**
   * POST /api/v1/draws/register (HMAC Signed)
   * Partner site enters an authenticated player into milestone draw
   */
  app.post("/api/v1/draws/register", authenticateSite, async (req, res) => {
    try {
      const {
        discordId,
        milestoneId,
        idempotencyKey,
        candidateWager,
        candidateYeetUsername,
        candidateYeetUserId
      } = req.body;

      if (!discordId || !milestoneId) {
        return res.status(400).json({ error: "discordId and milestoneId required" });
      }

      // Live lookup on BIGD & BALLZS wager if candidate details provided
      let computedWager = candidateWager;
      let computedYeetName = candidateYeetUsername;
      let computedYeetId = candidateYeetUserId;

      if (getUserWagerDetails && (candidateYeetUsername || candidateYeetUserId)) {
        const liveInfo = await getUserWagerDetails(candidateYeetUsername || String(candidateYeetUserId));
        if (liveInfo && liveInfo.monthlyWager > 0) {
          computedWager = Math.max(Number(candidateWager) || 0, liveInfo.monthlyWager);
          computedYeetName = computedYeetName || liveInfo.matchedUsername;
          if (liveInfo.player?.userId) computedYeetId = liveInfo.player.userId;
        }
      }

      const result = await registryEngine.registerForDraw({
        discordId,
        milestoneId: Number(milestoneId),
        sourceSite: req.callerSite,
        idempotencyKey,
        candidateWager: computedWager,
        candidateYeetUsername: computedYeetName,
        candidateYeetUserId: computedYeetId
      });

      if (!result.success) {
        return res.status(403).json(result);
      }

      const statusCode = result.alreadyRegistered ? 200 : 201;
      res.status(statusCode).json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
