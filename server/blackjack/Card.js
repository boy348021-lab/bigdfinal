/**
 * Card Domain Model
 * Encapsulates card properties: Suit, Rank, Numeric Value, Face Value, Unique ID, Visibility, Owner.
 */
export default class Card {
  constructor(suit, rank, deckIndex = 0, cardIndex = 0) {
    this.id = `card_${deckIndex}_${suit}_${rank}_${cardIndex}_${Math.random().toString(36).substr(2, 6)}`;
    this.suit = suit; // '♥', '♦', '♣', '♠'
    this.rank = rank; // '2'-'10', 'J', 'Q', 'K', 'A'
    this.isRed = suit === '♥' || suit === '♦';
    this.numericValue = this.calculateNumericValue(rank);
    this.faceValue = ['J', 'Q', 'K'].includes(rank) ? 10 : (rank === 'A' ? 11 : Number(rank));
    this.imageAsset = `/cards/${rank.toLowerCase()}_${this.getSuitName(suit)}.png`;
    this.visibility = 'face_up'; // 'face_up' | 'face_down'
    this.owner = null; // 'player' | 'dealer' | 'shoe' | 'discard'
  }

  getSuitName(suit) {
    switch (suit) {
      case '♥': return 'hearts';
      case '♦': return 'diamonds';
      case '♣': return 'clubs';
      case '♠': return 'spades';
      default: return 'unknown';
    }
  }

  calculateNumericValue(rank) {
    if (['J', 'Q', 'K'].includes(rank)) return 10;
    if (rank === 'A') return 11;
    return parseInt(rank, 10);
  }

  toJSON() {
    return {
      id: this.id,
      suit: this.suit,
      rank: this.rank,
      isRed: this.isRed,
      value: this.numericValue,
      faceValue: this.faceValue,
      visibility: this.visibility,
      owner: this.owner
    };
  }
}
