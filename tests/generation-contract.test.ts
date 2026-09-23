import { describe, expect, it } from 'vitest';
import { TeaId } from '../src/game/types';
import {
  fallbackLevel,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { depthAccepted } from '../src/game/logic/difficulty';
import { solvePuzzle } from '../src/game/logic/solver';

const WARMUP: GenerateRequest = {
  numColors: 3,
  colors: ['matcha', 'sea_buckthorn', 'karkade'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'warmup',
};
const CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
};
const PEAK: GenerateRequest = {
  numColors: 5,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
};
const RELAX: GenerateRequest = {
  numColors: 3,
  colors: ['saffron', 'matcha', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'relax',
};
const WARMUP_MYSTERY: GenerateRequest = { ...WARMUP, hasMysteryLayer: true };

function expectFullContract(level: ReturnType<typeof generateLevel>, req: GenerateRequest) {
  // H: no return path bypasses the structural validator.
  const check = validateLevelStructure(level, req);
  expect(check.reasons).toEqual([]);
  expect(check.ok).toBe(true);
  // G–J: independently re-solved; reported minMoves must be the REAL depth.
  const solved = solvePuzzle(level.cups);
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(level.minMoves);
  // C: hard acceptance band is a real contract, not a preference.
  expect(depthAccepted(level.minMoves, req.phase)).toBe(true);
}

describe('hard acceptance contract (Gauntlet 0.1 §2/§4/§6)', () => {
  it.each([
    ['warmup', WARMUP],
    ['challenge', CHALLENGE],
    ['peak', PEAK],
    ['relax', RELAX],
  ] as Array<[string, GenerateRequest]>)(
    '%s: 40 seeds all satisfy the full production contract',
    (_name, req) => {
      for (let s = 0; s < 40; s++) {
        const level = generateLevel(req, `gauntlet01:${req.phase}:${s}`);
        expectFullContract(level, req);
      }
    },
  );
});

describe('retry exhaustion (D): bounded safe path, still in contract', () => {
  it.each([
    ['warmup', WARMUP],
    ['challenge', CHALLENGE],
    ['peak', PEAK],
    ['relax', RELAX],
  ] as Array<[string, GenerateRequest]>)('%s: maxRetries 1 and 0 stay valid + deterministic', (_name, req) => {
    for (const maxRetries of [1, 0]) {
      const a = generateLevel(req, `gauntlet01:exhaust:${req.phase}`, { maxRetries });
      const b = generateLevel(req, `gauntlet01:exhaust:${req.phase}`, { maxRetries });
      expectFullContract(a, req);
      // Deterministic: same seed -> identical level.
      expect(b.cups).toEqual(a.cups);
      expect(b.hiddenCounts).toEqual(a.hiddenCounts);
      expect(b.minMoves).toBe(a.minMoves);
    }
  });
});

describe('phase-aware fallbacks (E, F + warmup/relax)', () => {
  it('warmup fallback lands in 3–9', () => {
    const l = fallbackLevel(WARMUP);
    expect(l.minMoves).toBeGreaterThanOrEqual(3);
    expect(l.minMoves).toBeLessThanOrEqual(9);
    expectFullContract(l, WARMUP);
  });
  it('challenge fallback lands in 5–13', () => {
    const l = fallbackLevel(CHALLENGE);
    expect(l.minMoves).toBeGreaterThanOrEqual(5);
    expect(l.minMoves).toBeLessThanOrEqual(13);
    expectFullContract(l, CHALLENGE);
  });
  it('peak fallback lands in 8–18', () => {
    const l = fallbackLevel(PEAK);
    expect(l.minMoves).toBeGreaterThanOrEqual(8);
    expect(l.minMoves).toBeLessThanOrEqual(18);
    expectFullContract(l, PEAK);
  });
  it('relax fallback lands in 3–9', () => {
    const l = fallbackLevel(RELAX);
    expect(l.minMoves).toBeGreaterThanOrEqual(3);
    expect(l.minMoves).toBeLessThanOrEqual(9);
    expectFullContract(l, RELAX);
  });
  it('fallbacks are deterministic per request', () => {
    const a = fallbackLevel(PEAK);
    const b = fallbackLevel(PEAK);
    expect(b.cups).toEqual(a.cups);
    expect(b.minMoves).toBe(a.minMoves);
  });
});

describe('mystery fallback invariant (G)', () => {
  it.each([
    ['peak', PEAK],
    ['warmup-with-mystery', WARMUP_MYSTERY],
  ] as Array<[string, GenerateRequest]>)('%s fallback: exactly one compliant hidden cup', (_name, req) => {
    const l = fallbackLevel(req);
    const hidden = l.hiddenCounts
      .map((h, i) => (h > 0 ? i : -1))
      .filter((i) => i >= 0);
    expect(hidden).toHaveLength(1);
    expect(l.hiddenCounts[hidden[0] as number]).toBe(1);
    const cup = l.cups[hidden[0] as number] as TeaId[];
    expect(cup.length).toBeGreaterThanOrEqual(3);
    expect(cup[0]).not.toBe(cup[1]);
    expectFullContract(l, req);
  });

  it('exhausted peak generation keeps a compliant mystery cup', () => {
    const l = generateLevel(PEAK, 'gauntlet01:peak-exhaust', { maxRetries: 0 });
    const hidden = l.hiddenCounts
      .map((h, i) => (h > 0 ? i : -1))
      .filter((i) => i >= 0);
    expect(hidden).toHaveLength(1);
    const cup = l.cups[hidden[0] as number] as TeaId[];
    expect(cup[0]).not.toBe(cup[1]);
    expectFullContract(l, PEAK);
  });
});
