/**
 * HandEvaluator - Dynamic hand evaluation with proper ace handling.
 * Aces start at 11 and are reduced to 1 as needed to avoid busting.
 */
export default class HandEvaluator {
  static evaluate(cards, isSplitHand = false) {
    if (!Array.isArray(cards) || cards.length === 0) {
      return { score: 0, isSoft: false, isHard: true, isBust: false, isBlackjack: false, cardCount: 0 };
    }

    let score = 0;
    let aceCount = 0;

    for (const card of cards) {
      const val = card.value || 0;
      score += val;
      if (card.rank === 'A') aceCount++;
    }

    // Reduce aces from 11 to 1 as needed
    let acesCountedAsEleven = aceCount;
    while (score > 21 && acesCountedAsEleven > 0) {
      score -= 10;
      acesCountedAsEleven--;
    }

    const isBust = score > 21;
    const isSoft = acesCountedAsEleven > 0 && !isBust;
    const isHard = !isSoft;

    // Natural blackjack: exactly 2 cards, score 21, NOT from a split
    const isBlackjack = (score === 21 && cards.length === 2 && !isSplitHand);

    return { score, isSoft, isHard, isBust, isBlackjack, cardCount: cards.length };
  }
}
