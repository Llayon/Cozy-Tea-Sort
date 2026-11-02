/**
 * G20 production fast path + bounded stress.
 *
 * 200 deterministic production seeds: exactly one flask, F0 shape,
 * standalone, bounded attempts, no fallback on the happy path, L2 clean
 * decant and flask empty at win. Fallback is validated separately.
 */
import { describe, expect, it } from 'vitest';
import {
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  requestedSteepingFlaskCount,
  steepingFlaskTemplateKindFor,
  validateSteepingFlaskRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import { generateRequestForLevelConfig } from '../src/game/logic/productionRequest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  emptyFloatingIngredients,
  isSteepingFlaskConstraint,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  applyPourState,
  isPuzzleWonState,
  isSteepingFlaskReady,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { ALL_STEEPING_FLASK_TEMPLATES } from '../src/game/logic/steepingFlaskTemplates';

const BASE: GenerateRequest = generateRequestForLevelConfig(getLevelConfig(558));

function replayFlask(
  cups: TeaId[][],
  constraints: CupConstraint[],
  flaskIndex: number,
): { commit: boolean; ready: boolean; release: boolean; clean: boolean; partial: boolean; empty: boolean; won: boolean } {
  const solved = solvePuzzle(cups, {
    cupConstraints: constraints,
    floatingIngredients: emptyFloatingIngredients(cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated).not.toBe(true);
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  let commit = false;
  let ready = false;
  let release = false;
  let clean = false;
  let partial = false;
  let empty = false;
  let released = false;
  for (const action of solved.solution ?? []) {
    if (action.kind !== 'pour') continue;
    const before = state.cups[flaskIndex] as TeaId[];
    const wasReady = isSteepingFlaskReady(before, constraints[flaskIndex]);
    if (before.length >= 1 && before.length <= 3) {
      for (let d = 0; d < state.cups.length; d++) {
        if (d === flaskIndex) continue;
        expect(
          pourRejectCodeState(state, flaskIndex, d, constraints),
          `partial flask -> ${d}`,
        ).toBe('source-steeping-not-ready');
      }
    }
    const result = applyPourState(state, action.from, action.to, constraints);
    if (!result) break;
    const after = result.state.cups[flaskIndex] as TeaId[];
    if (before.length === 0 && after.length >= 1 && after.length <= 3 && after.every((t) => t === after[0])) commit = true;
    if (!wasReady && isSteepingFlaskReady(after, constraints[flaskIndex])) ready = true;
    if (action.from === flaskIndex && wasReady) {
      release = true;
      released = true;
      if (after.length === 0) clean = true;
      else if (after.length >= 1 && after.length <= 3) partial = true;
    }
    if (released && after.length === 0) empty = true;
    state = result.state;
  }
  const won = isPuzzleWonState(state, constraints);
  return { commit, ready, release, clean, partial, empty, won };
}

describe('G20 request contract', () => {
  it('recognizes only the exact standalone F0 request', () => {
    expect(requestedSteepingFlaskCount(BASE)).toBe(1);
    expect(steepingFlaskTemplateKindFor(BASE)).toBe('steeping-flask');
    expect(() => validateSteepingFlaskRequest(BASE)).not.toThrow();
  });

  it('rejects 2+, negative and non-integer counts', () => {
    for (const bad of [2, -1, 1.5, 0.5]) {
      expect(() => validateSteepingFlaskRequest({ ...BASE, steepingFlaskCount: bad })).toThrow();
    }
  });

  it('rejects every sibling mechanic/composition', () => {
    const siblings: Partial<GenerateRequest>[] = [
      { sourceOnlyCount: 1 },
      { targetTeaIds: ['lavender'] },
      { sinkOnlyCount: 1 },
      { tastingCupCount: 1 },
      { floatingIngredient: 'lemon' },
      { sinkingIngredient: 'honey' },
      { hasStrainer: true },
      { frozenCupCount: 1 },
      { thermosCupCount: 1 },
      { cinnamonCupCount: 1 },
      { teaBudCount: 1 },
      { blendRecipeId: 'milk-tea' },
      { serveOrderCount: 2 },
      { teaPairCount: 1 },
      { hasMysteryLayer: true },
    ];
    for (const extra of siblings) {
      expect(() => validateSteepingFlaskRequest({ ...BASE, ...extra }), JSON.stringify(extra)).toThrow();
    }
  });
});

describe('G20 production fast path (200 seeds)', () => {
  it('one flask, F0 shape, bounded attempts, no fallback, L2 clean decant', () => {
    const starts = new Set<string>();
    const attemptSamples: number[] = [];
    const solverCallSamples: number[] = [];
    const depths: number[] = [];
    for (let i = 0; i < 200; i++) {
      const stats = createGenerateStats();
      const level = generateLevel(BASE, `g20-stress:${i}`, { stats });
      const flasks = level.cupConstraints.filter(isSteepingFlaskConstraint);
      expect(flasks, `seed ${i} flask count`).toHaveLength(1);
      const flaskIndex = level.cupConstraints.findIndex(isSteepingFlaskConstraint);
      expect(level.cups[flaskIndex]).toEqual([]);
      expect(level.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 0, 4, 4, 4, 4]);
      expect(level.cups.flat()).toHaveLength(16);
      for (const tea of BASE.colors.slice(0, 4)) {
        expect(level.cups.flat().filter((t) => t === tea), `seed ${i} ${tea}`).toHaveLength(4);
      }
      expect(level.cups.filter((c) => c.length === 4).every((c) => new Set(c).size >= 2)).toBe(true);
      expect(stats.usedFallback, `seed ${i} fallback`).toBe(false);
      expect(stats.templateAttempts).toBeLessThanOrEqual(4);
      expect(stats.solverCalls).toBe(stats.templateAttempts);
      attemptSamples.push(stats.templateAttempts);
      solverCallSamples.push(stats.solverCalls);
      depths.push(level.minMoves);
      starts.add(JSON.stringify(level.cups));
      const facts = replayFlask(level.cups, level.cupConstraints, flaskIndex);
      expect(facts.commit, `seed ${i} commit`).toBe(true);
      expect(facts.ready, `seed ${i} ready`).toBe(true);
      expect(facts.release, `seed ${i} release`).toBe(true);
      expect(facts.clean, `seed ${i} clean`).toBe(true);
      expect(facts.partial, `seed ${i} partial`).toBe(false);
      expect(facts.empty, `seed ${i} empty`).toBe(true);
      expect(facts.won, `seed ${i} win`).toBe(true);
    }
    const median = (values: number[]): number => {
      const s = [...values].sort((a, b) => a - b);
      return s[Math.floor(s.length / 2)] as number;
    };
    const p95 = (values: number[]): number => {
      const s = [...values].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)] as number;
    };
    expect(starts.size).toBeGreaterThanOrEqual(14);
    expect(median(attemptSamples)).toBe(1);
    expect(p95(attemptSamples)).toBeLessThanOrEqual(2);
    expect(median(solverCallSamples)).toBe(1);
    expect(p95(solverCallSamples)).toBeLessThanOrEqual(2);
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...depths)).toBeLessThanOrEqual(14);
  }, 180_000);

  it('source gate holds at every replay state with a partial flask', () => {
    const stats = createGenerateStats();
    const level = generateLevel(BASE, 'g20-source-gate:0', { stats });
    const flaskIndex = level.cupConstraints.findIndex(isSteepingFlaskConstraint);
    const solved = solvePuzzle(level.cups, {
      cupConstraints: level.cupConstraints,
      floatingIngredients: emptyFloatingIngredients(level.cups.length),
      maxVisited: 200_000,
      maxDepth: 60,
    });
    let state = {
      cups: level.cups.map((c) => [...c]),
      floatingIngredients: emptyFloatingIngredients(level.cups.length),
    };
    for (const action of solved.solution ?? []) {
      if (action.kind !== 'pour') continue;
      const flask = state.cups[flaskIndex] as TeaId[];
      if (flask.length >= 1 && flask.length <= 3) {
        for (let d = 0; d < state.cups.length; d++) {
          if (d === flaskIndex) continue;
          expect(
            pourRejectCodeState(state, flaskIndex, d, level.cupConstraints),
            `partial flask -> ${d}`,
          ).toBe('source-steeping-not-ready');
        }
      }
      const result = applyPourState(state, action.from, action.to, level.cupConstraints);
      if (!result) break;
      state = result.state;
    }
  });
});

describe('G20 fallback identity', () => {
  it('uses the pinned first bank template with exact depth and clean cycle', () => {
    const stats = createGenerateStats();
    const level = fallbackLevel(BASE, { stats });
    expect(stats.usedFallback).toBe(true);
    const flaskIndex = level.cupConstraints.findIndex(isSteepingFlaskConstraint);
    expect(flaskIndex).toBeGreaterThanOrEqual(0);
    const tpl = ALL_STEEPING_FLASK_TEMPLATES[0] as (typeof ALL_STEEPING_FLASK_TEMPLATES)[number];
    expect(level.minMoves).toBe(tpl.depth);
    const facts = replayFlask(level.cups, level.cupConstraints, flaskIndex);
    expect(facts.commit && facts.ready && facts.release && facts.clean && facts.empty && facts.won).toBe(true);
    expect(facts.partial).toBe(false);
  });
});
