/**
 * Small seeded RNG for deterministic puzzle generation.
 *
 * Production seeds can still be random, but every generated level
 * must be reproducible when its seed is known (bug reports, tests,
 * analytics). No external dependency.
 */

export type SeedInput = number | string;

/** FNV-1a 32-bit hash for string seeds. */
export function hashSeedToUint32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function normalizeSeed(seed: SeedInput): number {
  if (typeof seed === 'number') {
    if (!Number.isFinite(seed)) return 0x9e3779b9;
    return (seed | 0) >>> 0;
  }
  return hashSeedToUint32(seed);
}

/** Mulberry32 — compact, deterministic PRNG. */
export function mulberry32(seedUint32: number): () => number {
  let a = seedUint32 >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function createRng(seed: SeedInput): Rng {
  return mulberry32(normalizeSeed(seed));
}

/** Random integer in [min, max). */
export function randomInt(rng: Rng, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo));
}

/** Fisher–Yates shuffle that consumes only the provided rng. */
export function shuffleInPlace<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}

/** Create an opaque production seed, e.g. `level:timestamp:counter`. */
export function makeProductionSeed(level: number): string {
  const rand = Math.floor(Math.random() * 1_000_000_000);
  return `${level}:${Date.now().toString(36)}:${rand.toString(36)}`;
}
