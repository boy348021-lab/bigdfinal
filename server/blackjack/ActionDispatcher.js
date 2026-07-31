import Engine from './Engine.js';
import { STATES } from './FSM.js';

/**
 * ActionDispatcher - Action Dispatcher Layer
 * Validates balance, state machine integrity, and user permissions before mutating the Engine.
 */
export default class ActionDispatcher {
  constructor(activeGamesMap, supabase) {
    this.activeGames = activeGamesMap;
    this.supabase = supabase;
  }

  getOrCreateEngine(userId) {
    if (!this.activeGames.has(userId)) {
      this.activeGames.set(userId, new Engine());
    }
    return this.activeGames.get(userId);
  }

  async dispatch(userId, actionType, payload = {}) {
    if (!userId) {
      throw new Error("Unauthorized: Invalid user context");
    }

    const engine = this.getOrCreateEngine(userId);
    let updatedBalance = undefined;

    switch (actionType) {
      case 'DEAL': {
        const bet = Number(payload.bet || 0);

        if (bet > 0 && this.supabase) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: -bet,
            p_action: "blackjack_bet",
            p_source: "blackjack",
            p_ref: `bj_bet_${Date.now()}`
          });
          if (rpcErr) throw new Error("Insufficient point balance to place bet");
          updatedBalance = newBal;
        }

        const snapshot = engine.deal(userId, bet);

        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          const { data: balAfterPay } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: snapshot.totalPayout,
            p_action: "blackjack_payout",
            p_source: "blackjack",
            p_ref: `bj_pay_${Date.now()}`
          });
          if (balAfterPay !== null && balAfterPay !== undefined) {
            updatedBalance = balAfterPay;
          }
        }

        return { snapshot, updatedBalance };
      }

      case 'HIT': {
        if (engine.fsm.isInState(STATES.WAITING_FOR_BET) || engine.fsm.isInState(STATES.ROUND_COMPLETE)) {
          return { snapshot: engine.getSnapshot(), updatedBalance };
        }
        const snapshot = engine.hit();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          const { data: balAfterPay } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: snapshot.totalPayout,
            p_action: "blackjack_payout",
            p_source: "blackjack",
            p_ref: `bj_pay_${Date.now()}`
          });
          if (balAfterPay !== null && balAfterPay !== undefined) {
            updatedBalance = balAfterPay;
          }
        }
        return { snapshot, updatedBalance };
      }

      case 'STAND': {
        if (engine.fsm.isInState(STATES.WAITING_FOR_BET) || engine.fsm.isInState(STATES.ROUND_COMPLETE)) {
          return { snapshot: engine.getSnapshot(), updatedBalance };
        }
        const snapshot = engine.stand();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          const { data: balAfterPay } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: snapshot.totalPayout,
            p_action: "blackjack_payout",
            p_source: "blackjack",
            p_ref: `bj_pay_${Date.now()}`
          });
          if (balAfterPay !== null && balAfterPay !== undefined) {
            updatedBalance = balAfterPay;
          }
        }
        return { snapshot, updatedBalance };
      }

      case 'DOUBLE': {
        if (engine.fsm.isInState(STATES.WAITING_FOR_BET) || engine.fsm.isInState(STATES.ROUND_COMPLETE)) {
          return { snapshot: engine.getSnapshot(), updatedBalance };
        }
        const currentHand = engine.playerHands[engine.activeHandIndex];
        const doubleBet = currentHand ? currentHand.bet : 0;

        if (doubleBet > 0 && this.supabase) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: -doubleBet,
            p_action: "blackjack_double",
            p_source: "blackjack",
            p_ref: `bj_dbl_${Date.now()}`
          });
          if (rpcErr) throw new Error("Insufficient point balance to double down");
          updatedBalance = newBal;
        }

        const snapshot = engine.doubleDown();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          const { data: balAfterPay } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: snapshot.totalPayout,
            p_action: "blackjack_payout",
            p_source: "blackjack",
            p_ref: `bj_pay_${Date.now()}`
          });
          if (balAfterPay !== null && balAfterPay !== undefined) {
            updatedBalance = balAfterPay;
          }
        }
        return { snapshot, updatedBalance };
      }

      case 'SPLIT': {
        if (engine.fsm.isInState(STATES.WAITING_FOR_BET) || engine.fsm.isInState(STATES.ROUND_COMPLETE)) {
          return { snapshot: engine.getSnapshot(), updatedBalance };
        }
        const currentHand = engine.playerHands[engine.activeHandIndex];
        const splitBet = currentHand ? currentHand.bet : 0;

        if (splitBet > 0 && this.supabase) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: -splitBet,
            p_action: "blackjack_split",
            p_source: "blackjack",
            p_ref: `bj_split_${Date.now()}`
          });
          if (rpcErr) throw new Error("Insufficient point balance to split hand");
          updatedBalance = newBal;
        }

        const snapshot = engine.split();
        return { snapshot, updatedBalance };
      }

      case 'INSURANCE_BUY': {
        const insBet = Math.floor(engine.initialBet * 0.5);
        if (insBet > 0 && this.supabase) {
          const { data: newBal, error: rpcErr } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: -insBet,
            p_action: "blackjack_insurance",
            p_source: "blackjack",
            p_ref: `bj_ins_${Date.now()}`
          });
          if (rpcErr) throw new Error("Insufficient balance for insurance");
          updatedBalance = newBal;
        }

        const snapshot = engine.buyInsurance();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          const { data: balAfterPay } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: snapshot.totalPayout,
            p_action: "blackjack_payout",
            p_source: "blackjack",
            p_ref: `bj_pay_${Date.now()}`
          });
          if (balAfterPay !== null && balAfterPay !== undefined) {
            updatedBalance = balAfterPay;
          }
        }
        return { snapshot, updatedBalance };
      }

      case 'INSURANCE_DECLINE': {
        const snapshot = engine.declineInsurance();
        return { snapshot, updatedBalance };
      }

      case 'SURRENDER': {
        const snapshot = engine.surrender();
        if (snapshot.isEnded && snapshot.totalPayout > 0 && this.supabase) {
          const { data: balAfterPay } = await this.supabase.rpc("modify_points", {
            p_user_id: userId,
            p_delta: snapshot.totalPayout,
            p_action: "blackjack_payout",
            p_source: "blackjack",
            p_ref: `bj_pay_${Date.now()}`
          });
          if (balAfterPay !== null && balAfterPay !== undefined) {
            updatedBalance = balAfterPay;
          }
        }
        return { snapshot, updatedBalance };
      }

      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }
}
