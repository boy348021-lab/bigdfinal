/**
 * RNGProvider - Centralized Randomness Provider
 * Supports true random, seeded random for deterministic testing, and Fisher-Yates shuffle.
 * Isolates all random generation away from global Math.random().
 */
export default class RNGProvider {
  constructor(seed = null) {
    this.seed = seed;
  }

  // Generate float in range [0, 1)
  nextFloat() {
    if (this.seed !== null) {
      // Linear congruential generator (LCG) for deterministic tests
      this.seed = (this.seed * 9301 + 49297) % 233280;
      return this.seed / 233280;
    }
    return Math.random();
  }

  // Shuffle array using Fisher-Yates algorithm
  shuffle(array) {
    const list = [...array];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.nextFloat() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
}
