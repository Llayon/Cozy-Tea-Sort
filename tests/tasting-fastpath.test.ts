/**
 * Gauntlet 4 §54, §57 — tasting generator matrix (100 seeds × 3 configs),
 * fast-path structure, DIRECT fallbackLevel tests, determinism.
 */
import { describe, expect, it } from 'vitest';
import { cupCapacity, type TeaId } from '../src/game/types';
import { applyPour, isHomogeneous, isWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  tastingTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { TASTING_TEMPLATE_ATTEMPTS } from '../src/game/logic/tastingTemplates';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';
const E: TeaId = 'lavender';

const TASTING_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [A, B, C, D],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  tastingCupCount: 1,
};
const TASTING_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: [A, B, C, D, E],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  tastingCupCount: 1,
};
const TEAPOT_TASTING_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [A, B, C, D],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  tastingCupCount: 1,
};

function tastingIndexOf(level: { cupConstraints: { mode: string; capacity?: number; mustEndEmpty?: boolean }[] }): number {
  return level.cupConstraints.findIndex(
    (c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true,
  );
}

function expectTastingLevel(req: GenerateRequest, seed: string, opts: { mystery: boolean; teapot: boolean }) {
  const stats = createGenerateStats();
  const lvl = generateLevel(req, seed, { stats });
  expect(lvl.cups).toHaveLength(req.numColors + req.emptyCups);
  const tastingIdx = tastingIndexOf(lvl);
  expect(tastingIdx).toBe(lvl.cups.length - 1);
  expect(lvl.cups[tastingIdx]).toEqual([]);
  expect(cupCapacity(lvl.cupConstraints[tastingIdx])).toBe(2);
  expect(lvl.cupConstraints[tastingIdx]?.mustEndEmpty).toBe(true);
  expect(lvl.cupConstraints[tastingIdx]?.targetTeaId).toBe(undefined);
  expect(lvl.hiddenCounts[tastingIdx]).toBe(0);
  const ordinaryEmpty = lvl.cupConstraints.filter(
    (c, i) => c.mode === 'normal' && c.capacity !== 2 && lvl.cups[i]?.length === 0,
  ).length;
  expect(ordinaryEmpty).toBeGreaterThanOrEqual(1);
  if (opts.teapot) {
    expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    expect((lvl.cups[0] as TeaId[]).length).toBe(4);
  } else {
    expect(lvl.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
  }
  expect(lvl.cupConstraints.some((c) => c.mode === 'sink-only')).toBe(false);
  expect(lvl.cupConstraints.some((c) => c.targetTeaId !== undefined)).toBe(false);
  const hidden = lvl.hiddenCounts.filter((h) => h > 0).length;
  expect(hidden).toBe(opts.mystery ? 1 : 0);
  if (opts.mystery) {
    const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
    expect(midx).not.toBe(tastingIdx);
  }
  // Exact tea units preserved (capacity never shrinks the pool).
  const counts = new Map<string, number>();
  lvl.cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
  req.colors.slice(0, req.numColors).forEach((c) => expect(counts.get(c)).toBe(4));
  expect(isWonState(lvl.cups, lvl.cupConstraints)).toBe(false);
  const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated).not.toBe(true);
  expect(solved.minMoves).toBe(lvl.minMoves);
  // Participation: enters AND exits; finishes empty and won.
  const solution = solved.solution ?? [];
  expect(solution.some((m) => m.to === tastingIdx)).toBe(true);
  const firstIn = solution.findIndex((m) => m.to === tastingIdx);
  expect(solution.slice(firstIn + 1).some((m) => m.from === tastingIdx)).toBe(true);
  let board = lvl.cups.map((c) => [...c]);
  for (const step of solution) {
    const res = applyPour(board, step.from, step.to, lvl.cupConstraints);
    expect(res).not.toBeNull();
    board = res?.cups ?? board;
  }
  expect(isWonState(board, lvl.cupConstraints)).toBe(true);
  expect(board[tastingIdx]).toEqual([]);
  expect(isHomogeneous(board[tastingIdx] ?? [])).toBe(true);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  return { lvl, stats };
}

describe('tasting template-kind routing', () => {
  it('canonical tasting requests hit the fast path; others do not', () => {
    expect(tastingTemplateKindFor(TASTING_CHALLENGE)).toBe('tasting-challenge');
    expect(tastingTemplateKindFor(TASTING_MYSTERY_PEAK)).toBe('tasting-mystery-peak');
    expect(tastingTemplateKindFor(TEAPOT_TASTING_CHALLENGE)).toBe('teapot-tasting-challenge');
    expect(tastingTemplateKindFor({ ...TASTING_CHALLENGE, tastingCupCount: 0 })).toBe(null);
  });
});

describe('tasting challenge generator (100 seeds)', () => {
  it('every seed is deterministic, solver-valid, participating, in-band', () => {
    for (let s = 0; s < 100; s++) {
      expectTastingLevel(TASTING_CHALLENGE, `tasting-ch:${s}`, { mystery: false, teapot: false });
    }
  }, 120000);
});

describe('tasting + mystery peak generator (100 seeds)', () => {
  it('Mystery index != tasting; solver-valid participating peak band', () => {
    for (let s = 0; s < 100; s++) {
      expectTastingLevel(TASTING_MYSTERY_PEAK, `tasting-peak:${s}`, { mystery: true, teapot: false });
    }
  }, 180000);
});

describe('teapot + tasting generator (100 seeds)', () => {
  it('teapot at 0, tasting last, solver-valid participating', () => {
    for (let s = 0; s < 100; s++) {
      expectTastingLevel(TEAPOT_TASTING_CHALLENGE, `teapot-tasting:${s}`, { mystery: false, teapot: true });
    }
  }, 120000);
});

describe('tasting fast-path structural contract (no 150-scan)', () => {
  it.each([
    ['tasting-challenge', TASTING_CHALLENGE],
    ['tasting-mystery-peak', TASTING_MYSTERY_PEAK],
    ['teapot-tasting-challenge', TEAPOT_TASTING_CHALLENGE],
  ])('%s uses bounded template attempts', (_name, req) => {
    for (let s = 0; s < 10; s++) {
      const st = createGenerateStats();
      generateLevel(req, `tasting-fp:${_name}:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(TASTING_TEMPLATE_ATTEMPTS);
      expect(st.solverCalls).toBeGreaterThanOrEqual(1);
      expect(st.solverCalls).toBeLessThanOrEqual(TASTING_TEMPLATE_ATTEMPTS + 4);
      expect(st.usedFallback).toBe(false);
    }
  });
});

describe('tasting fallback branch (direct fallbackLevel)', () => {
  it.each([
    ['tasting-challenge', TASTING_CHALLENGE, 6, { mystery: false, teapot: false }],
    ['tasting-mystery-peak', TASTING_MYSTERY_PEAK, 16, { mystery: true, teapot: false }],
    ['teapot-tasting-challenge', TEAPOT_TASTING_CHALLENGE, 7, { mystery: false, teapot: true }],
  ])('%s fallback is solver-validated with REAL depth %i', (name, req, depth, flags) => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(req, { stats });
    expect(stats.usedFallback).toBe(true);
    expect(stats.candidatesTried).toBe(0);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    expect(lvl.minMoves).toBe(depth);
    const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const tastingIdx = tastingIndexOf(lvl);
    expect(tastingIdx).toBe(lvl.cups.length - 1);
    let board = lvl.cups.map((c) => [...c]);
    for (const step of solved.solution ?? []) {
      const res = applyPour(board, step.from, step.to, lvl.cupConstraints);
      expect(res).not.toBeNull();
      board = res?.cups ?? board;
    }
    expect(isWonState(board, lvl.cupConstraints)).toBe(true);
    expect(board[tastingIdx]).toEqual([]);
    if (flags.mystery) {
      const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
      expect(midx).not.toBe(tastingIdx);
    }
    if (flags.teapot) expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    expect(name).toBeDefined();
  });
});

describe('tasting determinism', () => {
  it('same request + seed reproduces cups/hidden/constraints/minMoves', () => {
    for (const req of [TASTING_CHALLENGE, TASTING_MYSTERY_PEAK, TEAPOT_TASTING_CHALLENGE]) {
      const a = generateLevel(req, 'tasting-det:7');
      const b = generateLevel(req, 'tasting-det:7');
      expect(a.cups).toEqual(b.cups);
      expect(a.hiddenCounts).toEqual(b.hiddenCounts);
      expect(a.cupConstraints).toEqual(b.cupConstraints);
      expect(a.minMoves).toBe(b.minMoves);
    }
  });

  it('different seeds vary topology over the corpus', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const lvl = generateLevel(TASTING_CHALLENGE, `tasting-var:${s}`);
      seen.add(JSON.stringify(lvl.cups));
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
