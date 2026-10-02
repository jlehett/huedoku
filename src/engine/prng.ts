/**
 * Seeded pseudo-random numbers for the engine.
 *
 * Algorithm: sfc32 (Chris Doty-Humphrey's Small Fast Counting generator, 32-bit
 * variant) seeded through cyrb128 string hashing. All arithmetic is 32-bit integer
 * math (`Math.imul`, `>>> 0`), so the same seed gives the same sequence in every
 * JavaScript engine. The engine never calls Math.random().
 */

export interface Rng {
  /** Next unsigned 32-bit integer. */
  next(): number;
  /** Float in [0, 1). */
  float(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** In-place Fisher-Yates shuffle, returns the same array. */
  shuffle<T>(arr: T[]): T[];
  /** Pick one element. */
  pick<T>(arr: readonly T[]): T;
  /** Snapshot of the internal state (for forking/debugging). */
  state(): [number, number, number, number];
}

/** cyrb128: hashes a string into four 32-bit seeds. */
export function hashString(str: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function sfc32(a: number, b: number, c: number, d: number): Rng {
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  const next = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  // Warm up so similar seeds diverge.
  for (let i = 0; i < 15; i++) next();
  const rng: Rng = {
    next,
    float: () => next() / 4294967296,
    int: (n: number) => {
      if (n <= 0) return 0;
      // Rejection sampling for an unbiased result.
      const limit = 4294967296 - (4294967296 % n);
      let x = next();
      while (x >= limit) x = next();
      return x % n;
    },
    shuffle<T>(arr: T[]): T[] {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
    pick<T>(arr: readonly T[]): T {
      return arr[rng.int(arr.length)];
    },
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
  return rng;
}

/** Create an Rng from any string or number seed. */
export function rngFrom(seed: string | number): Rng {
  const [a, b, c, d] = hashString(String(seed));
  return sfc32(a, b, c, d);
}
