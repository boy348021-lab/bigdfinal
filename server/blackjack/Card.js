export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export default class Card {
  constructor(suit, rank, deckIndex = 0) {
    this.id = `d${deckIndex}_${rank}_${suit}`;  // deterministic, unique per shoe
    this.suit = suit;       // 'spades', 'hearts', 'diamonds', 'clubs'
    this.rank = rank;       // '2'-'10', 'J', 'Q', 'K', 'A'
    this.value = this._calculateValue(rank); // base numeric value
    this.visibility = 'face_up'; // 'face_up' | 'face_down'
  }

  _calculateValue(rank) {
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    if (rank === 'A') return 11;
    return parseInt(rank, 10);
  }

  // Safe serialization - hides card details when face down
  toJSON() {
    if (this.visibility === 'face_down') {
      return { id: this.id, visibility: 'face_down' };
    }
    return {
      id: this.id,
      suit: this.suit,
      rank: this.rank,
      value: this.value,
      visibility: this.visibility
    };
  }

  // Full serialization - always reveals everything (server-side only)
  toFullJSON() {
    return {
      id: this.id,
      suit: this.suit,
      rank: this.rank,
      value: this.value,
      visibility: this.visibility
    };
  }
}
