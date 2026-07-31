/**
 * HandEvaluator - Dynamic Hand Evaluation Engine
 * Evaluates hand totals, Ace soft/hard values, bust status, and natural blackjack status dynamically.
 */
export default class HandEvaluator {
  static evaluate(cards, isSplitHand = false) {
    if (!Array.isArray(cards)) {
      return { score: 0, isBust: false, isBlackjack: false, isSoft: false, isHard: true };
    }

    let score = 0;
    let aces = 0;

    for (const card of cards) {
      const val = card.numericValue || card.value || 0;
      score += val;
      if (card.rank === 'A') {
        aces += 1;
      }
    }

    let softAcesCount = aces;
    while (score > 21 && softAcesCount > 0) {
      score -= 10;
      softAcesCount -= 1;
    }

    const isBust = score > 21;
    const isSoft = softAcesCount > 0 && score <= 21;
    const isHard = !isSoft;
    const isNaturalBlackjack = score === 21 && cards.length === 2 && !isSplitHand;

    return {
      score,
      isBust,
      isBlackjack: isNaturalBlackjack,
      isSoft,
      isHard,
      cardsCount: cards.length
    };
  }
}
