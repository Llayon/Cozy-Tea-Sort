/**
 * Gauntlet 7 §67, §101 — honey generator fast path: kind routing,
 * bounded template attempts (single solver call — honey needs no
 * without-proof), production variety (100 seeds × 3 configs), DIRECT
 * fallbackLevel tests with pinned participating depths, determinism.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState, SinkingIngredientSlot, TeaId } from '../src/game/types';
import { canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeHoneyParticipation,
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  honeyTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  HONEY_TARGET_TEA,
  HONEY_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/honeyTemplates';

const BW: TeaId = 'buckwheat';
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';
const L: TeaId = 'lavender';

const HONEY_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [BW, M, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sinkingIngredient: 'honey',
};
const HONEY_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: [BW, M, K, O, L],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  sinkingIngredient: 'honey',
};
const TEAPOT_HONEY_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [BW, M, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  sinkingIngredient: 'honey',
};

function honeyHostOf(level: { sinkingIngredients?: SinkingIngredientSlot[] }): number {
  return (level.sinkingIngredients ?? []).findIndex((s) => s === 'honey');
}

function expectHoneyLevel(req: GenerateRequest, seed: string, opts: { mystery: boolean; teapot: boolean }) {
  expect(req.colors).toContain(HONEY_TARGET_TEA);
  const stats = createGenerateStats();
  const lvl = generateLevel(req, seed, { stats });
  expect(lvl.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(lvl.sinkingIngredients).toHaveLength(lvl.cups.length);
  const host = honeyHostOf(lvl);
  expect(host).toBeGreaterThanOrEqual(0);
  expect((lvl.cups[host] as TeaId[]).length).toBe(4);
  expect(new Set(lvl.cups[host]).size).toBeGreaterThan(1);
  if (opts.teapot) {
    expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    expect(host).toBe(0);
  } else {
    expect(lvl.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
  }
  expect(lvl.cupConstraints.some((c) => c.mode === 'sink-only')).toBe(false);
  expect(lvl.cupConstraints.some((c) => c.targetTeaId !== undefined)).toBe(false);
  const hidden = lvl.hiddenCounts.filter((h) => h > 0).length;
  expect(hidden).toBe(opts.mystery ? 1 : 0);
  if (opts.mystery) {
    const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
    expect(midx).not.toBe(host);
  }
  const counts = new Map<string, number>();
  lvl.cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  req.colors.slice(0, req.numColors).forEach((c) => expect(counts.get(c)).toBe(4));
  const solved = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    floatingIngredients: lvl.floatingIngredients,
    sinkingIngredients: lvl.sinkingIngredients,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated).not.toBe(true);
  expect(solved.minMoves).toBe(lvl.minMoves);
  // Participation: stay >= 1 AND move >= 1, finishes on buckwheat, puzzle wins.
  const solution = solved.solution ?? [];
  const part = analyzeHoneyParticipation(
    lvl.cups,
    lvl.sinkingIngredients ?? [],
    solution,
    lvl.cupConstraints,
  );
  expect(part.stays).toBeGreaterThanOrEqual(1);
  expect(part.moves).toBeGreaterThanOrEqual(1);
  const final = applySolutionState(
    {
      cups: lvl.cups,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
    },
    solution,
    lvl.cupConstraints,
  );
  expect(final).not.toBe(null);
  expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
  const finalHost = (final as PuzzleState).sinkingIngredients.findIndex((s) => s === 'honey');
  expect((final as PuzzleState).cups[finalHost]).toEqual([BW, BW, BW, BW]);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  return { lvl, stats };
}

describe('honey template-kind routing', () => {
  it('canonical honey requests hit the fast path; others do not', () => {
    expect(honeyTemplateKindFor(HONEY_CHALLENGE)).toBe('honey-challenge');
    expect(honeyTemplateKindFor(HONEY_MYSTERY_PEAK)).toBe('honey-mystery-peak');
    expect(honeyTemplateKindFor(TEAPOT_HONEY_CHALLENGE)).toBe('teapot-honey-challenge');
    // No honey → null.
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, sinkingIngredient: undefined })).toBe(null);
    // Wrong color counts / empties → null (canonical IS 2-empty).
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, numColors: 3 })).toBe(null);
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, emptyCups: 1 })).toBe(null);
    expect(honeyTemplateKindFor({ ...HONEY_MYSTERY_PEAK, sourceOnlyCount: 1 })).toBe(null);
    // Forbidden honey combos → null.
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, floatingIngredient: 'lemon' })).toBe(null);
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, hasStrainer: true })).toBe(null);
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, sinkOnlyCount: 1 })).toBe(null);
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, tastingCupCount: 1 })).toBe(null);
    expect(honeyTemplateKindFor({ ...HONEY_CHALLENGE, targetTeaIds: [M, K] })).toBe(null);
  });
});

describe('honey fast-path structural contract (no 150-scan)', () => {
  it.each([
    ['honey-challenge', HONEY_CHALLENGE],
    ['honey-mystery-peak', HONEY_MYSTERY_PEAK],
    ['teapot-honey-challenge', TEAPOT_HONEY_CHALLENGE],
  ])('%s uses bounded template attempts with a single solver call', (_name, req) => {
    for (let s = 0; s < 10; s++) {
      const st = createGenerateStats();
      generateLevel(req, `honey-fp:${_name}:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(HONEY_TEMPLATE_ATTEMPTS);
      // Honey needs no without-proof: exactly one production solve.
      expect(st.solverCalls).toBe(1);
      expect(st.usedFallback).toBe(false);
    }
  }, 120000);
});

describe('honey challenge generator (100 seeds)', () => {
  it('every seed is solver-valid, participating, with >= 14 distinct start keys', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const { lvl } = expectHoneyLevel(HONEY_CHALLENGE, `honey-ch:${s}`, { mystery: false, teapot: false });
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
    }
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 240000);
});

describe('honey + mystery peak generator (100 seeds)', () => {
  it('Mystery index != honey host; solver-valid participating peak band; >= 14 distinct keys', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const { lvl } = expectHoneyLevel(HONEY_MYSTERY_PEAK, `honey-peak:${s}`, { mystery: true, teapot: false });
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
    }
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 240000);
});

describe('teapot + honey generator (100 seeds)', () => {
  it('honey inside teapot 0, solver-valid participating; >= 14 distinct keys', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const { lvl } = expectHoneyLevel(TEAPOT_HONEY_CHALLENGE, `teapot-honey:${s}`, {
        mystery: false,
        teapot: true,
      });
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
    }
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 240000);
});

describe('honey fallback branch (direct fallbackLevel)', () => {
  it.each([
    ['honey-challenge', HONEY_CHALLENGE, 12, { mystery: false, teapot: false }],
    ['honey-mystery-peak', HONEY_MYSTERY_PEAK, 16, { mystery: true, teapot: false }],
    ['teapot-honey-challenge', TEAPOT_HONEY_CHALLENGE, 12, { mystery: false, teapot: true }],
  ])('%s fallback is solver-validated with REAL depth %i', (name, req, depth, flags) => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(req as GenerateRequest, { stats });
    expect(stats.usedFallback).toBe(true);
    expect(stats.candidatesTried).toBe(0);
    expect(validateLevelStructure(lvl, req as GenerateRequest).ok).toBe(true);
    expect(lvl.minMoves).toBe(depth);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    // Participation on the fallback branch too.
    const solution = solved.solution ?? [];
    const part = analyzeHoneyParticipation(
      lvl.cups,
      lvl.sinkingIngredients ?? [],
      solution,
      lvl.cupConstraints,
    );
    expect(part.stays).toBeGreaterThanOrEqual(1);
    expect(part.moves).toBeGreaterThanOrEqual(1);
    const final = applySolutionState(
      {
        cups: lvl.cups,
        floatingIngredients: lvl.floatingIngredients,
        sinkingIngredients: lvl.sinkingIngredients,
      },
      solution,
      lvl.cupConstraints,
    );
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
    expect((final as PuzzleState).cups[
      (final as PuzzleState).sinkingIngredients.findIndex((s) => s === 'honey')
    ]).toEqual([BW, BW, BW, BW]);
    const host = honeyHostOf(lvl);
    if (flags.mystery) {
      const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
      expect(midx).not.toBe(host);
    }
    if (flags.teapot) {
      expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
      expect(host).toBe(0);
    }
    expect(name).toBeDefined();
  }, 120000);
});

describe('honey determinism', () => {
  it('same request + seed reproduces cups/slots/hidden/constraints/minMoves', () => {
    for (const req of [HONEY_CHALLENGE, HONEY_MYSTERY_PEAK, TEAPOT_HONEY_CHALLENGE]) {
      const a = generateLevel(req, 'honey-det:7');
      const b = generateLevel(req, 'honey-det:7');
      expect(a.cups).toEqual(b.cups);
      expect(a.sinkingIngredients).toEqual(b.sinkingIngredients);
      expect(a.hiddenCounts).toEqual(b.hiddenCounts);
      expect(a.cupConstraints).toEqual(b.cupConstraints);
      expect(a.minMoves).toBe(b.minMoves);
    }
  });
});
