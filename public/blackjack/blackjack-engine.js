/* ============================================================
   BLACKJACK GAME ENGINE (Pure JS Logic & State Management)
   ============================================================ */

(function (exports) {
  const SUITS = ['♥', '♦', '♣', '♠'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

  class BlackjackEngine {
    constructor(numDecks = 6) {
      this.numDecks = numDecks;
      this.shoe = [];
      this.reshuffleThreshold = Math.floor(numDecks * 52 * 0.25); // Reshuffle when 25% cards remaining
      this.initShoe();
    }

    initShoe() {
      const cards = [];
      for (let i = 0; i < this.numDecks; i++) {
        for (const suit of SUITS) {
          for (const rank of RANKS) {
            cards.push({
              suit,
              rank,
              isRed: suit === '♥' || suit === '♦',
              value: this.getRankValue(rank)
            });
          }
        }
      }
      this.shoe = this.shuffle(cards);
    }

    shuffle(deck) {
      const array = [...deck];
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    getRankValue(rank) {
      if (['J', 'Q', 'K'].includes(rank)) return 10;
      if (rank === 'A') return 11;
      return parseInt(rank, 10);
    }

    drawCard() {
      if (this.shoe.length <= this.reshuffleThreshold) {
        this.initShoe();
      }
      return this.shoe.pop();
    }

    calculateScore(cards) {
      let score = 0;
      let aces = 0;

      for (const card of cards) {
        score += card.value;
        if (card.rank === 'A') aces += 1;
      }

      while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
      }

      const isSoft = aces > 0 && score <= 21;
      return { score, isBust: score > 21, isBlackjack: score === 21 && cards.length === 2, isSoft };
    }

    // Dealer turn logic: Dealer must stand on soft 17 or higher
    playDealerTurn(dealerCards, standOnSoft17 = true) {
      const hand = [...dealerCards];
      let state = this.calculateScore(hand);

      while (state.score < 17 || (!standOnSoft17 && state.score === 17 && state.isSoft)) {
        hand.push(this.drawCard());
        state = this.calculateScore(hand);
      }

      return { hand, state };
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BlackjackEngine;
  } else {
    exports.BlackjackEngine = BlackjackEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);
