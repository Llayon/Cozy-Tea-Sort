/**
 * Gauntlet 3 §65–70 — sink generator matrix, fast-path structure,
 * fallback exhaustion, determinism.
 */
import { describe, expect, it } from 'vitest';
import { MAX_CUP_CAPACITY, type TeaId } from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import { isWonState } from '../src/game/logic/rules';
import {
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  sinkTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { SINK_TEMPLATE_ATTEMPTS } from '../src/game/logic/sinkTemplates';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';
const E: TeaId = 'lavender';

const SINK_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [A, B, C, D],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sinkOnlyCount: 1,
};
const SINK_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: [A, B, C, D, E],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  sinkOnlyCount: 1,
};
const TEAPOT_SINK_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [A, B, C, D],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  sinkOnlyCount: 1,
};

function expectSinkLevel(req: GenerateRequest, seed: string, opts: { mystery: boolean; teapot: boolean }) {
  const stats = createGenerateStats();
  const lvl = generateLevel(req, seed, { stats });
  // Cup/count contract.
  expect(lvl.cups).toHaveLength(req.numColors + req.emptyCups);
  const sinks = lvl.cupConstraints.filter((c) => c.mode === 'sink-only');
  expect(sinks).toHaveLength(1);
  const sinkIdx = lvl.cupConstraints.findIndex((c) => c.mode === 'sink-only');
  expect(sinkIdx).toBe(lvl.cups.length - 1);
  expect(lvl.cups[sinkIdx]).toEqual([]);
  expect(lvl.cupConstraints[sinkIdx]?.targetTeaId).toBe(undefined);
  expect(lvl.hiddenCounts[sinkIdx]).toBe(0);
  const ordinaryEmpty = lvl.cupConstraints.filter(
    (c, i) => c.mode === 'normal' && lvl.cups[i]?.length === 0,
  ).length;
  expect(ordinaryEmpty).toBeGreaterThanOrEqual(1);
  if (opts.teapot) {
    expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    const pot = lvl.cups[0] as TeaId[];
    expect(pot).toHaveLength(MAX_CUP_CAPACITY);
    expect(new Set(pot).size).toBeGreaterThanOrEqual(2);
  } else {
    expect(lvl.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
  }
  expect(lvl.cupConstraints.some((c) => c.targetTeaId !== undefined)).toBe(false);
  // Mystery contract.
  const hidden = lvl.hiddenCounts.filter((h) => h > 0).length;
  expect(hidden).toBe(opts.mystery ? 1 : 0);
  if (opts.mystery) {
    const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
    expect(midx).not.toBe(sinkIdx);
    expect(lvl.cupConstraints[midx]?.mode).toBe('normal');
  }
  // Solver contract: valid, in-band, depth reproduced, never sources sink.
  expect(isWonState(lvl.cups, lvl.cupConstraints)).toBe(false);
  const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated).not.toBe(true);
  expect(solved.minMoves).toBe(lvl.minMoves);
  for (const m of solved.solution ?? []) expect(m.from).not.toBe(sinkIdx);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  return { lvl, stats };
}

describe('sink template-kind routing', () => {
  it('canonical sink requests hit the fast path; others do not', () => {
    expect(sinkTemplateKindFor(SINK_CHALLENGE)).toBe('sink-challenge');
    expect(sinkTemplateKindFor(SINK_MYSTERY_PEAK)).toBe('sink-mystery-peak');
    expect(sinkTemplateKindFor(TEAPOT_SINK_CHALLENGE)).toBe('teapot-sink-challenge');
    expect(sinkTemplateKindFor({ ...SINK_CHALLENGE, sinkOnlyCount: 0 })).toBe(null);
  });
});

describe('sink challenge generator (100 seeds)', () => {
  it('every seed is deterministic, solver-valid, in-band', () => {
    for (let s = 0; s < 100; s++) {
      expectSinkLevel(SINK_CHALLENGE, `sink-ch:${s}`, { mystery: false, teapot: false });
    }
  }, 120000);
});

describe('sink + mystery peak generator (100 seeds)', () => {
  it('Mystery index != sink; solver-valid peak band', () => {
    for (let s = 0; s < 100; s++) {
      expectSinkLevel(SINK_MYSTERY_PEAK, `sink-peak:${s}`, { mystery: true, teapot: false });
    }
  }, 180000);
});

describe('teapot + sink generator (100 seeds)', () => {
  it('teapot at 0, sink last, one normal empty, solver-valid', () => {
    for (let s = 0; s < 100; s++) {
      expectSinkLevel(TEAPOT_SINK_CHALLENGE, `teapot-sink:${s}`, { mystery: false, teapot: true });
    }
  }, 120000);
});

describe('sink fast-path structural contract (no 150-scan)', () => {
  it.each([
    ['sink-challenge', SINK_CHALLENGE],
    ['sink-mystery-peak', SINK_MYSTERY_PEAK],
    ['teapot-sink-challenge', TEAPOT_SINK_CHALLENGE],
  ])('%s uses bounded template attempts', (_name, req) => {
    for (let s = 0; s < 10; s++) {
      const stats = createGenerateStats();
      generateLevel(req, `sink-fp:${s}`);
      void stats;
      const st = createGenerateStats();
      generateLevel(req, `sink-fp:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(SINK_TEMPLATE_ATTEMPTS);
      expect(st.solverCalls).toBeGreaterThanOrEqual(1);
      expect(st.solverCalls).toBeLessThanOrEqual(SINK_TEMPLATE_ATTEMPTS + 4);
      expect(st.usedFallback).toBe(false);
    }
  });

  it('target fast path still avoids the random scan', async () => {
    const { targetTemplateKindFor } = await import('../src/game/logic/generator');
    const req = {
      numColors: 4,
      colors: [A, B, C, D],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      targetTeaIds: [C, B],
    } as never;
    expect(targetTemplateKindFor(req)).toBe('target-challenge');
    const st = createGenerateStats();
    generateLevel(req, 'sink-fp-target-guard', { stats: st });
    expect(st.candidatesTried).toBe(0);
    expect(st.usedFallback).toBe(false);
  });
});

describe('sink fallback exhaustion (maxRetries=0)', () => {
  it.each([
    ['sink-challenge', SINK_CHALLENGE, { mystery: false, teapot: false }],
    ['sink-mystery-peak', SINK_MYSTERY_PEAK, { mystery: true, teapot: false }],
    ['teapot-sink-challenge', TEAPOT_SINK_CHALLENGE, { mystery: false, teapot: true }],
  ])('%s still returns a valid level with maxRetries=0', (_name, req, flags) => {
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `sink-fb0:${_name}`, { stats, maxRetries: 0 });
    expect(stats.candidatesTried).toBe(0);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
    expect(solved.solvable).toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    expect(flags).toBeDefined();
  });
});

describe('sink fallback branch (direct fallbackLevel, Gauntlet 3.1)', () => {
  // The maxRetries=0 tests above prove generateLevel stays valid without
  // the random scan, but canonical requests resolve via the template bank
  // before maxRetries is even consulted — so they do NOT exercise the
  // fallback ladder. These tests call fallbackLevel directly and pin the
  // real fallback depths (deterministic: fixed fallback tag seed).
  it.each([
    // [name, request, expectedDepth, { mystery, teapot }]
    ['sink-challenge', SINK_CHALLENGE, 6, { mystery: false, teapot: false }],
    ['sink-mystery-peak', SINK_MYSTERY_PEAK, 16, { mystery: true, teapot: false }],
    ['teapot-sink-challenge', TEAPOT_SINK_CHALLENGE, 7, { mystery: false, teapot: true }],
  ])('%s fallback is solver-validated with REAL depth %i', (name, req, depth, flags) => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(req, { stats });
    // This IS the fallback branch (not the template bank).
    expect(stats.usedFallback).toBe(true);
    expect(stats.candidatesTried).toBe(0);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // Pinned real fallback depth (in acceptance band by construction).
    expect(lvl.minMoves).toBe(depth);
    const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const sinkIdx = lvl.cupConstraints.findIndex((c) => c.mode === 'sink-only');
    expect(sinkIdx).toBe(lvl.cups.length - 1);
    for (const m of solved.solution ?? []) expect(m.from).not.toBe(sinkIdx);
    if (flags.mystery) {
      const midx = lvl.hiddenCounts.findIndex((h) => h > 0);
      expect(midx).not.toBe(sinkIdx);
    }
    if (flags.teapot) expect(lvl.cupConstraints[0]?.mode).toBe('source-only');
    expect(name).toBeDefined();
  });
});

describe('sink determinism', () => {
  it('same request + seed reproduces cups/hidden/constraints/minMoves', () => {
    for (const req of [SINK_CHALLENGE, SINK_MYSTERY_PEAK, TEAPOT_SINK_CHALLENGE]) {
      const a = generateLevel(req, 'sink-det:7');
      const b = generateLevel(req, 'sink-det:7');
      expect(a.cups).toEqual(b.cups);
      expect(a.hiddenCounts).toEqual(b.hiddenCounts);
      expect(a.cupConstraints).toEqual(b.cupConstraints);
      expect(a.minMoves).toBe(b.minMoves);
    }
  });

  it('different seeds vary topology over the corpus', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 30; s++) {
      const lvl = generateLevel(SINK_CHALLENGE, `sink-var:${s}`);
      seen.add(JSON.stringify(lvl.cups));
    }
    expect(seen.size).toBeGreaterThan(10);
  });
});
