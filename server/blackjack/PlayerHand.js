import HandEvaluator from './HandEvaluator.js';

export default class PlayerHand {
  constructor(id, bet = 0, isSplitHand = false, isFromSplitAces = false) {
    this.id = id;
    this.cards = [];
    this.bet = bet;
    this.isEnded = false;
    this.outcome = null;       // 'PLAYER_BLACKJACK', 'PLAYER_WIN', 'DEALER_WIN', 'PUSH', 'PLAYER_BUST', 'SURRENDER'
    this.payout = 0;           // total amount returned to player
    this.profit = 0;           // net gain/loss
    this.isSplitHand = isSplitHand;
    this.isFromSplitAces = isFromSplitAces;
    this.isSurrendered = false;
    this.isDoubled = false;
  }

  addCard(card) {
    this.cards.push(card);
  }

  get evaluation() {
    return HandEvaluator.evaluate(this.cards, this.isSplitHand);
  }

  toJSON() {
    const eval_ = this.evaluation;
    return {
      id: this.id,
      cards: this.cards.map(c => c.toJSON()),
      bet: this.bet,
      isEnded: this.isEnded,
      outcome: this.outcome,
      payout: this.payout,
      profit: this.profit,
      isSplitHand: this.isSplitHand,
      isFromSplitAces: this.isFromSplitAces,
      isSurrendered: this.isSurrendered,
      isDoubled: this.isDoubled,
      score: eval_.score,
      isBust: eval_.isBust,
      isBlackjack: eval_.isBlackjack,
      isSoft: eval_.isSoft,
      isHard: eval_.isHard
    };
  }
}
