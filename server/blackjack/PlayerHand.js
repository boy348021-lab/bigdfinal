import HandEvaluator from './HandEvaluator.js';

/**
 * PlayerHand Domain Model
 * Represents a single player hand (original or split).
 */
export default class PlayerHand {
  constructor(id, bet = 0, isSplitHand = false) {
    this.id = id;
    this.cards = [];
    this.bet = bet;
    this.isEnded = false;
    this.outcome = null;
    this.payout = 0;
    this.profit = 0;
    this.isSplitHand = isSplitHand;
    this.isSurrendered = false;
    this.isDoubled = false;
    this.canDouble = true;
    this.canSplit = false;
  }

  addCard(card) {
    this.cards.push(card);
  }

  get evaluation() {
    return HandEvaluator.evaluate(this.cards, this.isSplitHand);
  }

  toJSON() {
    const evalData = this.evaluation;
    return {
      id: this.id,
      cards: this.cards.map(c => c.toJSON()),
      bet: this.bet,
      isEnded: this.isEnded,
      outcome: this.outcome,
      payout: this.payout,
      profit: this.profit,
      isSplitHand: this.isSplitHand,
      isSurrendered: this.isSurrendered,
      isDoubled: this.isDoubled,
      score: evalData.score,
      isBust: evalData.isBust,
      isBlackjack: evalData.isBlackjack,
      isSoft: evalData.isSoft,
      isHard: evalData.isHard
    };
  }
}
