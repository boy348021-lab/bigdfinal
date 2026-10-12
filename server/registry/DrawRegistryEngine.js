import { REGISTRY_CONFIG, getCurrentCampaignMonth } from "./config.js";

/**
 * Shared Draw Registry Core Engine
 * Manages player linking, wager eligibility, and atomic multi-site registrations
 */
export class DrawRegistryEngine {
  constructor(dbClient) {
    this.db = dbClient; // pg Client / Supabase client
  }

  /**
   * Ensure campaign and its 3 milestone draws exist for the given campaign month
   */
  async ensureCampaign(campaignMonth = getCurrentCampaignMonth()) {
    if (!this.db) return null;

    // 1. Get or create campaign
    const { data: existingCamp } = await this.db
      .from("campaigns")
      .select("*")
      .eq("id", campaignMonth)
      .maybeSingle();

    if (!existingCamp) {
      const [year, month] = campaignMonth.split("-").map(Number);
      const startsAt = new Date(Date.UTC(year, month - 1, 1, 4, 0, 0)).toISOString();
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endsAt = new Date(Date.UTC(nextYear, nextMonth - 1, 1, 3, 59, 59, 999)).toISOString();

      await this.db.from("campaigns").insert({
        id: campaignMonth,
        name: `Community Milestones ${campaignMonth}`,
        starts_at: startsAt,
        ends_at: endsAt,
        status: "active"
      });
    }

    // 2. Ensure the 3 draws exist
    for (const msId of [1, 2, 3]) {
      const { data: draw } = await this.db
        .from("draws")
        .select("id")
        .eq("campaign_id", campaignMonth)
        .eq("milestone_id", msId)
        .maybeSingle();

      if (!draw) {
        await this.db.from("draws").insert({
          campaign_id: campaignMonth,
          milestone_id: msId,
          target_usd: REGISTRY_CONFIG.COMMUNITY_TARGETS[msId],
          threshold_usd: REGISTRY_CONFIG.MILESTONE_THRESHOLDS[msId],
          status: "open"
        });
      }
    }
  }

  /**
   * Link or update a player's Discord and Yeet identity
   */
  async linkPlayer({ discordId, discordUsername, yeetUserId, yeetUsername, sourceSite = "bigdtv" }) {
    if (!this.db) throw new Error("Database not connected");
    if (!discordId) throw new Error("Discord ID required");

    // Check if Yeet account is already claimed by someone else
    if (yeetUserId) {
      const { data: conflict } = await this.db
        .from("players")
        .select("*")
        .eq("yeet_user_id", yeetUserId)
        .neq("discord_id", discordId)
        .maybeSingle();

      if (conflict) {
        await this.logAudit({
          action: "link_player",
          sourceSite,
          discordId,
          yeetUserId,
          status: "conflict",
          details: { error: "Yeet ID already claimed by another Discord account", conflictDiscord: conflict.discord_id }
        });
        throw new Error("This Yeet account is already linked to another player");
      }
    }

    // Upsert player record
    const { data: player, error } = await this.db
      .from("players")
      .upsert(
        {
          discord_id: discordId,
          discord_username: discordUsername || null,
          yeet_user_id: yeetUserId || null,
          yeet_username: yeetUsername || null,
          registered_via: sourceSite,
          link_status: "verified",
          updated_at: new Date().toISOString()
        },
        { onConflict: "discord_id" }
      )
      .select()
      .single();

    if (error) throw error;

    await this.logAudit({
      action: "link_player",
      sourceSite,
      discordId,
      yeetUserId,
      status: "success",
      details: { yeetUsername, playerId: player.id }
    });

    return player;
  }

  /**
   * Get Pool Status & Player Eligibility across all 3 milestone draws
   */
  async getPoolStatus({ discordId, yeetUsername, campaignMonth = getCurrentCampaignMonth() }) {
    if (!this.db) {
      return { pools: [], userWager: 0, campaignMonth, error: "Database offline" };
    }

    await this.ensureCampaign(campaignMonth);

    // Fetch draws
    const { data: draws } = await this.db
      .from("draws")
      .select("id, milestone_id, target_usd, threshold_usd, status")
      .eq("campaign_id", campaignMonth)
      .order("milestone_id", { ascending: true });

    // Fetch pool counts
    const pools = [];
    for (const draw of draws || []) {
      const { count } = await this.db
        .from("registrations")
        .select("*", { count: "exact", head: true })
        .eq("draw_id", draw.id);

      pools.push({
        milestoneId: draw.milestone_id,
        drawId: draw.id,
        threshold: Number(draw.threshold_usd),
        target: Number(draw.target_usd),
        totalEntries: count || 0,
        status: draw.status,
        userJoined: false,
        userEligible: false,
        registeredVia: null
      });
    }

    let userWager = 0;
    let player = null;

    // Find player by discordId or yeet username
    if (discordId) {
      const { data: p } = await this.db
        .from("players")
        .select("*")
        .eq("discord_id", discordId)
        .maybeSingle();
      if (p) player = p;
    } else if (yeetUsername) {
      const { data: p } = await this.db
        .from("players")
        .select("*")
        .ilike("yeet_username", yeetUsername.trim())
        .maybeSingle();
      if (p) player = p;
    }

    // Check wager snapshot for this campaign month
    const effectiveYeetId = player?.yeet_user_id;
    if (effectiveYeetId) {
      const { data: snapshot } = await this.db
        .from("wager_snapshots")
        .select("monthly_wager, monthly_points, source_codes")
        .eq("campaign_id", campaignMonth)
        .eq("yeet_user_id", effectiveYeetId)
        .maybeSingle();

      if (snapshot) {
        userWager = Number(snapshot.monthly_wager) || 0;
      }
    }

    // Check existing registrations for this player
    if (player) {
      const { data: regs } = await this.db
        .from("registrations")
        .select("draw_id, source_site")
        .eq("player_id", player.id);

      const regMap = new Map((regs || []).map(r => [r.draw_id, r.source_site]));

      for (const pool of pools) {
        pool.userJoined = regMap.has(pool.drawId);
        pool.registeredVia = regMap.get(pool.drawId) || null;
        pool.userEligible = userWager >= pool.threshold;
      }
    }

    return {
      campaignMonth,
      player,
      userWager,
      pools
    };
  }

  /**
   * Register player into a Milestone Draw pool
   * Guaranteed duplicate prevention across BIGDTV & BALLZS
   */
  async registerForDraw({
    discordId,
    milestoneId,
    sourceSite = "bigdtv",
    idempotencyKey = null,
    candidateWager = null,
    candidateYeetUsername = null,
    candidateYeetUserId = null
  }) {
    if (!this.db) throw new Error("Database offline");
    const msId = Number(milestoneId);
    if (![1, 2, 3].includes(msId)) {
      throw new Error("Invalid milestoneId. Must be 1, 2, or 3.");
    }

    const campaignMonth = getCurrentCampaignMonth();
    await this.ensureCampaign(campaignMonth);

    // 1. Get the target draw
    const { data: draw } = await this.db
      .from("draws")
      .select("*")
      .eq("campaign_id", campaignMonth)
      .eq("milestone_id", msId)
      .single();

    if (!draw) throw new Error("Milestone draw not found for current month");
    if (draw.status !== "open") {
      throw new Error(`Draw is currently ${draw.status}. Registrations are closed.`);
    }

    // 2. Fetch player record
    let { data: player } = await this.db
      .from("players")
      .select("*")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (!player) {
      // Auto-create player if candidate info provided
      player = await this.linkPlayer({
        discordId,
        yeetUserId: candidateYeetUserId,
        yeetUsername: candidateYeetUsername,
        sourceSite
      });
    }

    // 3. Determine verified monthly wager
    let finalWager = candidateWager != null ? Number(candidateWager) : 0;
    if (player.yeet_user_id) {
      const { data: snapshot } = await this.db
        .from("wager_snapshots")
        .select("monthly_wager, yeet_username")
        .eq("campaign_id", campaignMonth)
        .eq("yeet_user_id", player.yeet_user_id)
        .maybeSingle();

      if (snapshot) {
        finalWager = Math.max(finalWager, Number(snapshot.monthly_wager) || 0);
      }
    }

    const threshold = Number(draw.threshold_usd);
    if (finalWager < threshold) {
      const remaining = threshold - finalWager;
      await this.logAudit({
        action: "join_pool",
        sourceSite,
        discordId,
        yeetUserId: player.yeet_user_id,
        milestoneId: msId,
        status: "ineligible",
        details: { finalWager, threshold, remaining }
      });
      return {
        success: false,
        code: "WAGER_TOO_LOW",
        error: `Monthly wager ($${finalWager.toFixed(2)}) is below the $${threshold.toLocaleString()} requirement.`,
        currentWager: finalWager,
        threshold,
        remaining
      };
    }

    // 4. ATOMIC INSERT WITH DUPLICATE HANDLING
    const finalYeetId = player.yeet_user_id || 0;
    const finalYeetName = player.yeet_username || candidateYeetUsername || "Unknown";

    const { data: entry, error: insertError } = await this.db
      .from("registrations")
      .insert({
        draw_id: draw.id,
        player_id: player.id,
        yeet_user_id: finalYeetId,
        yeet_username: finalYeetName,
        wager_usd_snapshot: finalWager,
        source_site: sourceSite,
        idempotency_key: idempotencyKey || `${player.id}_${draw.id}`
      })
      .select()
      .maybeSingle();

    if (insertError) {
      // Unique constraint violation check (Code 23505 in Postgres)
      if (insertError.code === "23505" || insertError.message?.includes("duplicate")) {
        // Query who registered them first
        const { data: existing } = await this.db
          .from("registrations")
          .select("source_site, entered_at, id")
          .eq("draw_id", draw.id)
          .eq("player_id", player.id)
          .maybeSingle();

        await this.logAudit({
          action: "join_pool",
          sourceSite,
          discordId,
          yeetUserId: finalYeetId,
          milestoneId: msId,
          status: "already_joined",
          details: { originalSite: existing?.source_site }
        });

        return {
          success: true,
          alreadyRegistered: true,
          registeredVia: existing?.source_site || "other_site",
          enteredAt: existing?.entered_at,
          message: `Already registered for Milestone ${msId} via ${existing?.source_site === sourceSite ? 'this site' : existing?.source_site}!`
        };
      }
      throw insertError;
    }

    // 5. Get updated pool count
    const { count: poolSize } = await this.db
      .from("registrations")
      .select("*", { count: "exact", head: true })
      .eq("draw_id", draw.id);

    await this.logAudit({
      action: "join_pool",
      sourceSite,
      discordId,
      yeetUserId: finalYeetId,
      milestoneId: msId,
      status: "success",
      details: { poolSize, entryId: entry?.id, wager: finalWager }
    });

    return {
      success: true,
      alreadyRegistered: false,
      milestoneId: msId,
      poolSize: poolSize || 1,
      registeredVia: sourceSite,
      yeetUsername: finalYeetName,
      message: `You're in the draw! ${poolSize} player${poolSize > 1 ? 's' : ''} in the pool.`
    };
  }

  /**
   * Audit Logger
   */
  async logAudit({ action, sourceSite, discordId, yeetUserId, milestoneId, status, details }) {
    if (!this.db) return;
    try {
      await this.db.from("audit_log").insert({
        action,
        source_site: sourceSite,
        discord_id: discordId || null,
        yeet_user_id: yeetUserId || null,
        milestone_id: milestoneId || null,
        status,
        details: details || {}
      });
    } catch (e) {
      console.warn("Audit log write error:", e.message);
    }
  }
}
