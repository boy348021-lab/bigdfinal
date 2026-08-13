import Engine from './Engine.js';

/**
 * ActionDispatcher - Mediates between HTTP routes and the Blackjack Engine.
 * Handles all Supabase balance operations (atomic deductions/payouts).
 * Enforces one active game per user.
 * Preserves game state across browser refreshes.
 */
export default class ActionDispatcher {
  constructor(activeGamesMap, supabase) {
    this.activeGames = activeGamesMap;  // Map<userId, Engine>
    this.supabase = supabase;
  }

  getOrCreateEngine(userId) {
    if (!this.activeGames.has(userId)) {
      this.activeGames.set(userId, new Engine());
    }
    return this.activeGames.get(userId);
  }

  getActiveGame(userId) {
    const engine = this.activeGames.get(userId);
    if (!engine || engine.isEnded) return null;
    return engine;
  }

  async dispatch(userId, actionType, payload = {}) {
    if (!userId) throw new Error('Unauthorized: Invalid user context');

    const isGuest = userId.startsWith('guest');
    const { actionId } = payload;
    let engine = this.activeGames.get(userId);

    if (engine && actionId && engine.processedActions.has(actionId)) {
      console.log(`[Idempotency] Action ${actionId} already processed, returning cached response.`);
      return engine.processedActions.get(actionId);
    }

    let updatedBalance = undefined;
    let snapshot = null;

    switch (actionType) {
      case 'DEAL': {
        const bet = parseInt(payload.bet, 10);
        if (isNaN(bet) || bet < 0) throw new Error('Invalid bet amount');

        // Check for existing active game
        const existing = this.getActiveGame(userId);
        if (existing) {
          throw new Error('Active game already exists. Complete or forfeit the current game first.');
        }

        // Deduct bet atomically BEFORE creating the game
        if (this.supabase && bet > 0 && !isGuest) {
          const idempotencyKey = `bj_bet_${userId}_${Date.now()}`;
          const { data: newBal, error: rpcErr } = await this.supabase.rpc('modify_points', {
            p_user_id: userId,
            p_delta: -bet,
            p_action: 'BLACKJACK_BET',
            p_source: 'blackjack',
            p_ref: idempotencyKey
          });
          if (rpcErr) {
            if (rpcErr.message && rpcErr.message.toLowerCase().includes('insufficient')) {
              throw new Error('Insufficient point balance to place bet');
            }
            throw new Error(`Balance error: ${rpcErr.message}`);
          }
          updatedBalance = newBal;
        }

        // Create engine and deal
        engine = new Engine();
        this.activeGames.set(userId, engine);
        engine.placeBet(userId, bet);
        snapshot = engine.deal();

        // If game ended immediately (blackjack), process payout
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }

        break;
      }

      case 'HIT': {
        engine = this._getActiveEngine(userId);
        snapshot = engine.hit();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }
        if (snapshot.isEnded) this._cleanupGame(userId);
        break;
      }

      case 'STAND': {
        engine = this._getActiveEngine(userId);
        snapshot = engine.stand();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }
        if (snapshot.isEnded) this._cleanupGame(userId);
        break;
      }

      case 'DOUBLE': {
        engine = this._getActiveEngine(userId);
        const curHand = engine.playerHands[engine.activeHandIndex];
        const doubleBet = curHand ? curHand.bet : 0;  // bet BEFORE doubling

        // Deduct additional bet
        if (doubleBet > 0 && this.supabase && !isGuest) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc('modify_points', {
            p_user_id: userId,
            p_delta: -doubleBet,
            p_action: 'BLACKJACK_BET',
            p_source: 'blackjack',
            p_ref: `bj_dbl_${engine.gameId}_${Date.now()}`
          });
          if (rpcErr) throw new Error('Insufficient point balance to double down');
          updatedBalance = newBal;
        }

        snapshot = engine.doubleDown();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }
        if (snapshot.isEnded) this._cleanupGame(userId);
        break;
      }

      case 'SPLIT': {
        engine = this._getActiveEngine(userId);
        const curHand = engine.playerHands[engine.activeHandIndex];
        const splitBet = curHand ? curHand.bet : 0;

        // Deduct bet for the new hand
        if (splitBet > 0 && this.supabase && !isGuest) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc('modify_points', {
            p_user_id: userId,
            p_delta: -splitBet,
            p_action: 'BLACKJACK_BET',
            p_source: 'blackjack',
            p_ref: `bj_split_${engine.gameId}_${Date.now()}`
          });
          if (rpcErr) throw new Error('Insufficient point balance to split');
          updatedBalance = newBal;
        }

        snapshot = engine.split();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }
        if (snapshot.isEnded) this._cleanupGame(userId);
        break;
      }

      case 'INSURANCE_BUY': {
        engine = this._getActiveEngine(userId);
        const insBet = Math.floor(engine.initialBet / 2);

        if (insBet > 0 && this.supabase && !isGuest) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc('modify_points', {
            p_user_id: userId,
            p_delta: -insBet,
            p_action: 'BLACKJACK_INSURANCE',
            p_source: 'blackjack',
            p_ref: `bj_ins_${engine.gameId}_${Date.now()}`
          });
          if (rpcErr) throw new Error('Insufficient balance for insurance');
          updatedBalance = newBal;
        }

        snapshot = engine.buyInsurance();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }
        if (snapshot.isEnded) this._cleanupGame(userId);
        break;
      }

      case 'INSURANCE_DECLINE': {
        engine = this._getActiveEngine(userId);
        snapshot = engine.declineInsurance();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          updatedBalance = await this._creditPayout(userId, snapshot.totalPayout, engine.gameId);
        }
        if (snapshot.isEnded) this._cleanupGame(userId);
        break;
      }

      default:
        throw new Error(`Unknown action: ${actionType}`);
    }

    const response = { snapshot, updatedBalance };
    if (actionId && engine) {
      engine.processedActions.set(actionId, response);
    }
    return response;
  }

  _getActiveEngine(userId) {
    const engine = this.activeGames.get(userId);
    if (!engine) throw new Error('No active game found');
    if (engine.isEnded) {
      this._cleanupGame(userId);
      throw new Error('No active game found');
    }
    return engine;
  }

  async _creditPayout(userId, amount, gameId) {
    if (!this.supabase || amount <= 0 || userId.startsWith('guest')) return undefined;
    const { data: bal } = await this.supabase.rpc('modify_points', {
      p_user_id: userId,
      p_delta: amount,
      p_action: 'BLACKJACK_PAYOUT',
      p_source: 'blackjack',
      p_ref: `bj_pay_${gameId}_${Date.now()}`
    });
    return bal;
  }

  _cleanupGame(userId) {
    // Don't delete immediately — keep for reconnection
    // Just mark as ended. The game map entry will be replaced on next DEAL.
  }
}
