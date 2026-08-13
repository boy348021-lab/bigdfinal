import Card, { SUITS, RANKS } from './Card.js';

export default class Shoe {
  constructor(numDecks = 6, penetrationPct = 0.75, rng) {
    this.numDecks = numDecks;
    this.penetrationPct = penetrationPct;
    this.rng = rng;
    this.cards = [];
    this.dealtCardIds = new Set();  // track uniqueness
    this.burnCards = [];
    this.needsReshuffle = false;
    this._buildAndShuffle();
  }

  _buildAndShuffle() {
    const allCards = [];
    for (let d = 0; d < this.numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          allCards.push(new Card(suit, rank, d));
        }
      }
    }

    const expected = this.numDecks * 52;
    if (allCards.length !== expected) {
      throw new Error(`Shoe build error: expected ${expected} cards, got ${allCards.length}`);
    }

    // Verify all IDs are unique
    const idSet = new Set(allCards.map(c => c.id));
    if (idSet.size !== allCards.length) {
      throw new Error('Shoe build error: duplicate card IDs detected');
    }

    this.cards = this.rng.shuffle(allCards);
    this.dealtCardIds.clear();
    this.needsReshuffle = false;

    // Burn first card
    if (this.cards.length > 0) {
      this.burnCards.push(this.cards.pop());
    }
  }

  drawCard() {
    if (this.cards.length === 0) {
      this._buildAndShuffle();
    }

    const card = this.cards.pop();

    // Safety: ensure no card is dealt twice from the same shoe
    if (this.dealtCardIds.has(card.id)) {
      throw new Error(`CRITICAL: Duplicate card dealt: ${card.id}`);
    }
    this.dealtCardIds.add(card.id);

    // Check if we've passed the cut card
    const cutPoint = Math.floor(this.numDecks * 52 * (1 - this.penetrationPct));
    if (this.cards.length <= cutPoint) {
      this.needsReshuffle = true;
    }

    return card;
  }

  getRemainingCount() {
    return this.cards.length;
  }

  reshuffle() {
    this._buildAndShuffle();
  }
}
