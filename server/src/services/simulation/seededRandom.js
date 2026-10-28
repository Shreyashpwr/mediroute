/**
 * Deterministic Pseudo-Random Number Generator (PRNG) for MediRoute Simulation Suite.
 * Based on 32-bit MurmurHash3 seed mixer and Mulberry32 core generator.
 *
 * Guarantees strict reproducibility across identical seeds, supporting:
 * - Uniform floating-point generation in [0, 1)
 * - Bounded integer generation in [min, max]
 * - Array sampling and choice
 * - Exponential distribution (Poisson arrival process)
 * - Gaussian / Normal distribution (Box-Muller transform)
 * - Boolean Bernouilli trials
 */

/**
 * Mixes arbitrary string or numeric seed into a 32-bit unsigned integer.
 * @param {string|number} seed
 * @returns {number} 32-bit unsigned integer
 */
export const hashSeed = (seed) => {
  if (typeof seed === 'number' && Number.isInteger(seed)) {
    return (seed >>> 0) || 1;
  }
  const str = String(seed ?? 'mediroute-default-seed-42');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) || 1;
};

/**
 * Creates an isolated, reproducible random number generator instance.
 * @param {string|number} initialSeed
 */
export class SeededRandom {
  constructor(initialSeed = 42) {
    this.initialSeed = initialSeed;
    this.seedInt = hashSeed(initialSeed);
    this.state = this.seedInt;
    this.callCount = 0;
  }

  /**
   * Resets generator back to its initial seed.
   */
  reset() {
    this.state = this.seedInt;
    this.callCount = 0;
  }

  /**
   * Generates next pseudo-random float in [0, 1).
   * Mulberry32 algorithm.
   * @returns {number} Float in [0, 1)
   */
  next() {
    this.callCount++;
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates next float in [min, max).
   * @param {number} min
   * @param {number} max
   */
  uniform(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }

  /**
   * Generates next integer in [min, max] inclusive.
   * @param {number} min
   * @param {number} max
   */
  int(min, max) {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    return low + Math.floor(this.next() * (high - low + 1));
  }

  /**
   * Selects random element from array.
   * @param {Array} arr
   */
  choice(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[this.int(0, arr.length - 1)];
  }

  /**
   * Shuffles an array in place deterministically using Fisher-Yates algorithm.
   * @param {Array} arr
   * @returns {Array} Shuffled array
   */
  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * Generates next value from Exponential distribution with parameter rate (lambda).
   * Used to model Poisson incident arrival inter-arrival intervals:
   *   Inter-arrival time = -ln(1 - U) / lambda
   * @param {number} rate - Arrival rate (events per unit time)
   */
  exponential(rate) {
    if (rate <= 0) return 0;
    // Protect against Math.log(0) by clamping (1 - U) in (0, 1]
    const u = Math.max(1e-10, 1.0 - this.next());
    return -Math.log(u) / rate;
  }

  /**
   * Generates next value from Normal (Gaussian) distribution using Box-Muller transform.
   * @param {number} mean
   * @param {number} stdDev
   */
  gaussian(mean = 0, stdDev = 1) {
    const u1 = Math.max(1e-10, this.next());
    const u2 = this.next();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  /**
   * Generates a boolean outcome with probability p of being true.
   * @param {number} p - Probability in [0, 1]
   */
  boolean(p = 0.5) {
    return this.next() < p;
  }
}

/**
 * Convenience factory function.
 * @param {string|number} seed
 * @returns {SeededRandom}
 */
export const createRng = (seed = 42) => new SeededRandom(seed);

export default {
  hashSeed,
  SeededRandom,
  createRng,
};
