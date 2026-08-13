import { randomInt } from 'crypto';

export default class RNGProvider {
  constructor(seed = null) {
    this.seed = seed;
    this._seedState = seed;
  }

  // Secure random integer in [0, max) - uses crypto.randomInt in production
  nextInt(max) {
    if (this._seedState !== null) {
      // Deterministic LCG for testing
      this._seedState = (this._seedState * 1664525 + 1013904223) & 0x7fffffff;
      return this._seedState % max;
    }
    return randomInt(max);
  }

  // Fisher-Yates shuffle - cryptographically secure in production
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
