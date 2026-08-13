/**
 * RulesEngine - Central configuration for all Blackjack table rules.
 * All game logic references this single config. No hardcoded values elsewhere.
 */

export const DEFAULT_RULES = {
  numDecks: 6,
  dealerStandsSoft17: true,
  blackjackPays: 1.5,        // 3:2
  insurancePays: 2,           // 2:1
  maxSplitDepth: 3,           // max 3 splits = 4 total hands
  doubleAfterSplit: true,
  splitAcesReceiveOneCard: true,
  splitAcesCannotHit: true,
  surrenderAllowed: false,
  insuranceAvailable: true,
  doubleDownOn: 'any',        // 'any' | '9_10_11' | '10_11'
  minBet: 0,
  maxBet: 5000
};

export default class RulesEngine {
  constructor(overrides = {}) {
    this.config = { ...DEFAULT_RULES, ...overrides };
  }

  get(key) {
    return this.config[key];
  }

  canHit(hand) {
    if (!hand || hand.isEnded) return false;
    if (hand.isFromSplitAces && this.config.splitAcesCannotHit) return false;
    const eval_ = hand.evaluation;
    return !eval_.isBust && eval_.score < 21;
  }

  canStand(hand) {
    if (!hand || hand.isEnded) return false;
    return true;
  }

  canDouble(hand, isSplitHand = false) {
    if (!hand || hand.isEnded) return false;
    if (hand.cards.length !== 2) return false;
    if (isSplitHand && !this.config.doubleAfterSplit) return false;
    if (hand.isFromSplitAces) return false;  // can't double split aces

    if (this.config.doubleDownOn === '9_10_11') {
      const score = hand.evaluation.score;
      return score >= 9 && score <= 11;
    }
    if (this.config.doubleDownOn === '10_11') {
      const score = hand.evaluation.score;
      return score >= 10 && score <= 11;
    }
    return true; // 'any'
  }

  canSplit(hand, currentHandCount = 1) {
    if (!hand || hand.isEnded) return false;
    if (hand.cards.length !== 2) return false;
    if (currentHandCount > this.config.maxSplitDepth) return false;

    const c1 = hand.cards[0];
    const c2 = hand.cards[1];
    // Cards can be split if they have the same rank OR same value (e.g., K and Q both = 10)
    return c1.rank === c2.rank || c1.value === c2.value;
  }

  canInsure(dealerUpcard) {
    if (!this.config.insuranceAvailable || !dealerUpcard) return false;
    return dealerUpcard.rank === 'A';
  }

  canSurrender(hand) {
    if (!this.config.surrenderAllowed) return false;
    if (!hand || hand.isEnded) return false;
    if (hand.cards.length !== 2) return false;
    if (hand.isSplitHand) return false;
    return true;
  }

  shouldDealerHit(dealerEval) {
    const { score, isSoft } = dealerEval;
    if (score < 17) return true;
    if (score === 17 && isSoft && !this.config.dealerStandsSoft17) return true;
    return false;
  }

  validateBet(amount) {
    if (typeof amount !== 'number' || !Number.isInteger(amount)) {
      return { valid: false, reason: 'Bet must be an integer' };
    }
    if (amount < this.config.minBet) {
      return { valid: false, reason: `Minimum bet is ${this.config.minBet}` };
    }
    if (amount > this.config.maxBet) {
      return { valid: false, reason: `Maximum bet is ${this.config.maxBet}` };
    }
    return { valid: true };
  }
}
