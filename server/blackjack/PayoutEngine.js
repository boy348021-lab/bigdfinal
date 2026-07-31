/**
 * PayoutEngine - Independent Payout Calculator
 * Calculates accurate payouts based on hand results, dealer score, and rule multipliers.
 */
export default class PayoutEngine {
  static calculateHandPayout(hand, dealerEvaluation, rules) {
    const pEval = hand.evaluation;
    const dEval = dealerEvaluation;
    const bet = hand.bet;

    if (hand.isSurrendered) {
      return { outcome: 'surrender', payout: Math.floor(bet * 0.5), profit: -Math.floor(bet * 0.5) };
    }

    if (pEval.isBust) {
      return { outcome: 'bust', payout: 0, profit: -bet };
    }

    if (pEval.isBlackjack) {
      if (dEval.isBlackjack) {
        return { outcome: 'push', payout: bet, profit: 0 };
      }
      const winProfit = Math.floor(bet * rules.blackjackPayoutRatio);
      return { outcome: 'blackjack', payout: bet + winProfit, profit: winProfit };
    }

    if (dEval.isBlackjack) {
      return { outcome: 'loss', payout: 0, profit: -bet };
    }

    if (dEval.isBust) {
      return { outcome: 'win', payout: bet * 2, profit: bet };
    }

    if (pEval.score > dEval.score) {
      return { outcome: 'win', payout: bet * 2, profit: bet };
    } else if (pEval.score < dEval.score) {
      return { outcome: 'loss', payout: 0, profit: -bet };
    } else {
      return { outcome: 'push', payout: bet, profit: 0 };
    }
  }

  static calculateInsurancePayout(insuranceBet, dealerEvaluation, rules) {
    if (!insuranceBet || insuranceBet <= 0) return { payout: 0, profit: 0 };
    if (dealerEvaluation.isBlackjack) {
      const winProfit = Math.floor(insuranceBet * rules.insurancePayoutRatio);
      return { outcome: 'insurance_win', payout: insuranceBet + winProfit, profit: winProfit };
    }
    return { outcome: 'insurance_loss', payout: 0, profit: -insuranceBet };
  }
}
