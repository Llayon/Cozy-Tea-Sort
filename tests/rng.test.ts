import { describe, expect, it } from 'vitest';
import { createRng } from '../src/game/logic/rng';

describe('seeded RNG', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng('hello');
    const b = createRng('hello');
    expect(Array.from({ length: 10 }, () => a())).toEqual(
      Array.from({ length: 10 }, () => b()),
    );
  });

  it('differs across seeds and stays in [0, 1)', () => {
    const a = createRng('seed-a');
    const b = createRng('seed-b');
    const va = Array.from({ length: 5 }, () => a());
    const vb = Array.from({ length: 5 }, () => b());
    expect(va).not.toEqual(vb);
    for (const v of [...va, ...vb]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('accepts numeric seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(a()).toBe(b());
  });
});
