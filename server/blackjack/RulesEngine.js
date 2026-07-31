/**
 * RulesEngine - Casino Rules & Policy Engine
 * Defines and enforces configurable casino table rules.
 */
export default class RulesEngine {
  constructor(config = {}) {
    this.dealerStandSoft17 = config.dealerStandSoft17 !== undefined ? config.dealerStandSoft17 : true;
    this.doubleDownRule = config.doubleDownRule || 'any_two_cards'; // 'any_two_cards' | '9_10_11'
    this.doubleAfterSplit = config.doubleAfterSplit !== undefined ? config.doubleAfterSplit : true;
    this.maxSplits = config.maxSplits || 4; // Max 4 hands (3 splits)
    this.splitAcesOneCard = config.splitAcesOneCard !== undefined ? config.splitAcesOneCard : true;
    this.insuranceAvailable = config.insuranceAvailable !== undefined ? config.insuranceAvailable : true;
    this.insurancePayoutRatio = config.insurancePayoutRatio || 2.0; // 2:1
    this.blackjackPayoutRatio = config.blackjackPayoutRatio || 1.5; // 3:2
    this.surrenderAllowed = config.surrenderAllowed !== undefined ? config.surrenderAllowed : true;
  }

  canDoubleDown(hand, isSplitHand = false) {
    if (!hand || hand.cards.length !== 2) return false;
    if (isSplitHand && !this.doubleAfterSplit) return false;

    if (this.doubleDownRule === '9_10_11') {
      const score = hand.evaluation.score;
      return score >= 9 && score <= 11;
    }
    return true;
  }

  canSplit(hand, currentSplitCount = 1) {
    if (!hand || hand.cards.length !== 2) return false;
    if (currentSplitCount >= this.maxSplits) return false;

    const card1 = hand.cards[0];
    const card2 = hand.cards[1];

    return card1.rank === card2.rank || card1.numericValue === card2.numericValue;
  }

  canInsure(dealerUpcard) {
    if (!this.insuranceAvailable || !dealerUpcard) return false;
    return dealerUpcard.rank === 'A';
  }

  canSurrender(hand) {
    if (!this.surrenderAllowed || !hand) return false;
    return hand.cards.length === 2 && !hand.isSplitHand;
  }

  shouldDealerHit(dealerEvaluation) {
    const { score, isSoft } = dealerEvaluation;
    if (score < 17) return true;
    if (score === 17 && isSoft && !this.dealerStandSoft17) return true;
    return false;
  }
}
