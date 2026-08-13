/**
 * PayoutEngine - Calculates exact payouts. Server-authoritative.
 * Frontend NEVER calculates payouts.
 */
export default class PayoutEngine {
  static calculateHandResult(hand, dealerEval, rules) {
    const pEval = hand.evaluation;
    const bet = hand.bet;

    // Surrender
    if (hand.isSurrendered) {
      const returned = Math.floor(bet / 2);
      return { outcome: 'SURRENDER', payout: returned, profit: -(bet - returned) };
    }

    // Player bust
    if (pEval.isBust) {
      return { outcome: 'PLAYER_BUST', payout: 0, profit: -bet };
    }

    // Player blackjack
    if (pEval.isBlackjack) {
      if (dealerEval.isBlackjack) {
        return { outcome: 'PUSH', payout: bet, profit: 0 };
      }
      const winProfit = Math.floor(bet * rules.get('blackjackPays'));
      return { outcome: 'PLAYER_BLACKJACK', payout: bet + winProfit, profit: winProfit };
    }

    // Dealer blackjack (player doesn't have one)
    if (dealerEval.isBlackjack) {
      return { outcome: 'DEALER_BLACKJACK', payout: 0, profit: -bet };
    }

    // Dealer bust
    if (dealerEval.isBust) {
      return { outcome: 'PLAYER_WIN', payout: bet * 2, profit: bet };
    }

    // Compare scores
    if (pEval.score > dealerEval.score) {
      return { outcome: 'PLAYER_WIN', payout: bet * 2, profit: bet };
    } else if (pEval.score < dealerEval.score) {
      return { outcome: 'DEALER_WIN', payout: 0, profit: -bet };
    } else {
      return { outcome: 'PUSH', payout: bet, profit: 0 };
    }
  }

  static calculateInsuranceResult(insuranceBet, dealerEval, rules) {
    if (!insuranceBet || insuranceBet <= 0) {
      return { outcome: null, payout: 0, profit: 0 };
    }
    if (dealerEval.isBlackjack) {
      const winnings = Math.floor(insuranceBet * rules.get('insurancePays'));
      return { outcome: 'INSURANCE_WIN', payout: insuranceBet + winnings, profit: winnings };
    }
    return { outcome: 'INSURANCE_LOSS', payout: 0, profit: -insuranceBet };
  }
}
