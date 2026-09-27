/**
 * Gauntlet 5 §84 (generator part), §88 — lemon generator matrix
 * (100 seeds × 3 configs), fast-path structure, DIRECT fallbackLevel
 * tests with pinned participating depths, determinism.
 */
import { describe, expect, it } from 'vitest';
import type { FloatingIngredientSlot, TeaId } from '../src/game/types';
import { applyPourState, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  lemonTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { LEMON_TEMPLATE_ATTEMPTS } from '../src/game/logic/lemonTemplates';

const M: TeaId = 'matcha';
const SB: TeaId = 'sea_buckthorn';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';
const L: TeaId = 'lavender';

const LEMON_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [M, SB, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  floatingIngredient: 'lemon',
};
const LEMON_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: [M, SB, K, O, L],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  floatingIngredient: 'lemon',
};
const TEAPOT_LEMON_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [M, SB, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  floatingIngredient: 'lemon',
};

function lemonHostOf(level: { floatingIngredients: FloatingIngredientSlot[] }): number {
  return level.floatingIngredients.findIndex((s) => s === 'lemon');
}

function expectLemonLevel(req: GenerateRequest, seed: string, opts: { mystery: boolean; teapot: boolean }) {
  const stats = createGenerateStats();
  const lvl = generateLevel(req, seed, { stats });
  expect(lvl.cups).toHaveLength(req.numColors + req.emptyCups);
  expect(lvl.floatingIngredients).toHaveLength(lvl.cups.length);
  const host = lemonHostOf(lvl);
  expect(host).toBeGreaterThanOrEqual(0);
  expect((lvl.cups[host] as TeaId[]).length).toBe(4);
  if (opts.teapot) {
    expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    expect(host).not.toBe(0);
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
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated).not.toBe(true);
  expect(solved.minMoves).toBe(lvl.minMoves);
  // Participation: lemon relocates ≥1, finishes on buckthorn, puzzle wins.
  const solution = solved.solution ?? [];
  let board = { cups: lvl.cups.map((c) => [...c]), floatingIngredients: [...lvl.floatingIngredients] };
  const at = (b: typeof board) => b.floatingIngredients.findIndex((s) => s === 'lemon');
  let relocations = 0;
  for (const step of solution) {
    const before = at(board);
    const res = applyPourState(board, step.from, step.to, lvl.cupConstraints);
    expect(res).not.toBeNull();
    board = { cups: res?.state.cups ?? [], floatingIngredients: res?.state.floatingIngredients ?? [] };
    if (at(board) !== before) relocations++;
  }
  expect(relocations).toBeGreaterThanOrEqual(1);
  expect(isPuzzleWonState(board, lvl.cupConstraints)).toBe(true);
  expect(board.cups[at(board)]).toEqual([SB, SB, SB, SB]);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  return { lvl, stats };
}

describe('lemon template-kind routing', () => {
  it('canonical lemon requests hit the fast path; others do not', () => {
    expect(lemonTemplateKindFor(LEMON_CHALLENGE)).toBe('lemon-challenge');
    expect(lemonTemplateKindFor(LEMON_MYSTERY_PEAK)).toBe('lemon-mystery-peak');
    expect(lemonTemplateKindFor(TEAPOT_LEMON_CHALLENGE)).toBe('teapot-lemon-challenge');
    expect(lemonTemplateKindFor({ ...LEMON_CHALLENGE, floatingIngredient: undefined })).toBe(null);
  });
});

describe('lemon challenge generator (100 seeds)', () => {
  it('every seed is deterministic, solver-valid, participating, in-band', () => {
    for (let s = 0; s < 100; s++) {
      expectLemonLevel(LEMON_CHALLENGE, `lemon-ch:${s}`, { mystery: false, teapot: false });
    }
  }, 180000);
});

describe('lemon + mystery peak generator (100 seeds)', () => {
  it('Mystery index != lemon host; solver-valid participating peak band', () => {
    for (let s = 0; s < 100; s++) {
      expectLemonLevel(LEMON_MYSTERY_PEAK, `lemon-peak:${s}`, { mystery: true, teapot: false });
    }
  }, 240000);
});

describe('teapot + lemon generator (100 seeds)', () => {
  it('teapot at 0, lemon elsewhere, solver-valid participating', () => {
    for (let s = 0; s < 100; s++) {
      expectLemonLevel(TEAPOT_LEMON_CHALLENGE, `teapot-lemon:${s}`, { mystery: false, teapot: true });
    }
  }, 180000);
});

describe('lemon fast-path structural contract (no 150-scan)', () => {
  it.each([
    ['lemon-challenge', LEMON_CHALLENGE],
    ['lemon-mystery-peak', LEMON_MYSTERY_PEAK],
    ['teapot-lemon-challenge', TEAPOT_LEMON_CHALLENGE],
  ])('%s uses bounded template attempts', (_name, req) => {
    for (let s = 0; s < 10; s++) {
      const st = createGenerateStats();
      generateLevel(req, `lemon-fp:${_name}:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(LEMON_TEMPLATE_ATTEMPTS);
      expect(st.solverCalls).toBeGreaterThanOrEqual(1);
      expect(st.solverCalls).toBeLessThanOrEqual(LEMON_TEMPLATE_ATTEMPTS + 4);
      expect(st.usedFallback).toBe(false);
    }
  });
});

describe('lemon fallback branch (direct fallbackLevel)', () => {
  it.each([
    ['lemon-challenge', LEMON_CHALLENGE, 9, { mystery: false, teapot: false }],
    ['lemon-mystery-peak', LEMON_MYSTERY_PEAK, 13, { mystery: true, teapot: false }],
    ['teapot-lemon-challenge', TEAPOT_LEMON_CHALLENGE, 10, { mystery: false, teapot: true }],
  ])('%s fallback is solver-validated with REAL depth %i', (name, req, depth, flags) => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(req, { stats });
    expect(stats.usedFallback).toBe(true);
    expect(stats.candidatesTried).toBe(0);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    expect(lvl.minMoves).toBe(depth);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    // Participation on the fallback branch too.
    const solution = solved.solution ?? [];
    const host = lemonHostOf(lvl);
    expect(solution.some((m) => m.to === host || m.from === host)).toBe(true);
    let board = { cups: lvl.cups.map((c) => [...c]), floatingIngredients: [...lvl.floatingIngredients] };
    const at = (b: typeof board) => b.floatingIngredients.findIndex((s) => s === 'lemon');
    let relocations = 0;
    for (const step of solution) {
      const before = at(board);
      const res = applyPourState(board, step.from, step.to, lvl.cupConstraints);
      expect(res).not.toBeNull();
      board = { cups: res?.state.cups ?? [], floatingIngredients: res?.state.floatingIngredients ?? [] };
      if (at(board) !== before) relocations++;
    }
    expect(relocations).toBeGreaterThanOrEqual(1);
    expect(isPuzzleWonState(board, lvl.cupConstraints)).toBe(true);
    expect(board.cups[at(board)]).toEqual([SB, SB, SB, SB]);
    if (flags.mystery) {
      const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
      expect(midx).not.toBe(host);
    }
    if (flags.teapot) expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    expect(name).toBeDefined();
  });
});

describe('lemon determinism', () => {
  it('same request + seed reproduces cups/slots/hidden/constraints/minMoves', () => {
    for (const req of [LEMON_CHALLENGE, LEMON_MYSTERY_PEAK, TEAPOT_LEMON_CHALLENGE]) {
      const a = generateLevel(req, 'lemon-det:7');
      const b = generateLevel(req, 'lemon-det:7');
      expect(a.cups).toEqual(b.cups);
      expect(a.floatingIngredients).toEqual(b.floatingIngredients);
      expect(a.hiddenCounts).toEqual(b.hiddenCounts);
      expect(a.cupConstraints).toEqual(b.cupConstraints);
      expect(a.minMoves).toBe(b.minMoves);
    }
  });
});
