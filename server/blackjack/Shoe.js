import Card from './Card.js';
import RNGProvider from './RNGProvider.js';

const SUITS = ['♥', '♦', '♣', '♠'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/**
 * Shoe Implementation
 * Multi-deck shoe supporting 1, 2, 4, 6, 8 decks.
 * Enforces penetration cut card, burn card, discard pile, automatic reshuffle.
 * Validates zero card duplication.
 */
export default class Shoe {
  constructor(numDecks = 6, penetrationPct = 0.75, rngSeed = null) {
    if (![1, 2, 4, 6, 8].includes(numDecks)) {
      throw new Error(`Invalid shoe size: ${numDecks}. Must be 1, 2, 4, 6, or 8 decks.`);
    }

    this.numDecks = numDecks;
    this.penetrationPct = penetrationPct;
    this.rng = new RNGProvider(rngSeed);

    this.cards = [];
    this.discardPile = [];
    this.cutCardIndex = 0;
    this.burnCard = null;
    this.needsReshuffle = false;

    this.resetAndShuffle();
  }

  resetAndShuffle() {
    const rawCards = [];
    let globalIndex = 0;

    for (let d = 0; d < this.numDecks; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          globalIndex++;
          const card = new Card(suit, rank, d, globalIndex);
          card.owner = 'shoe';
          rawCards.push(card);
        }
      }
    }

    const expectedCount = 52 * this.numDecks;
    if (rawCards.length !== expectedCount) {
      throw new Error(`Shoe initialization anomaly: ${rawCards.length} cards generated instead of ${expectedCount}`);
    }

    this.cards = this.rng.shuffle(rawCards);
    this.discardPile = [];
    this.cutCardIndex = Math.floor(expectedCount * (1 - this.penetrationPct));

    if (this.cards.length > 0) {
      this.burnCard = this.cards.pop();
      this.burnCard.owner = 'discard';
      this.discardPile.push(this.burnCard);
    }

    this.needsReshuffle = false;
  }

  drawCard(owner = 'player') {
    if (this.cards.length <= this.cutCardIndex) {
      this.needsReshuffle = true;
    }

    if (this.cards.length === 0) {
      this.resetAndShuffle();
    }

    const card = this.cards.pop();
    card.owner = owner;
    return card;
  }

  discard(cards) {
    for (const card of cards) {
      card.owner = 'discard';
      this.discardPile.push(card);
    }
  }

  getRemainingCardsCount() {
    return this.cards.length;
  }

  getTotalCardsCount() {
    return 52 * this.numDecks;
  }
}
