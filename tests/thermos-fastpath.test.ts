/**
 * Gauntlet 10 — thermos fast-path contract (FM–GH, L2 trace inside).
 *
 * Request detection (thermosTemplateKindFor), fail-fast validation,
 * bounded template attempts with a single production solve per attempt
 * (no 150-scan, no cap4 control on the runtime path), fallback branch,
 * determinism, 100-seed variety (≥14 distinct starts), root fairness
 * spot (≥50 seeds, report-only medians + fifth-slot timing), and a legacy
 * routing regression spot (G8/G9 routing untouched).
 */
import { describe, expect, it } from 'vitest';
import {
  THERMOS_CAPACITY,
  isThermosCupConstraint,
  type CupConstraint,
  type PuzzleState,
  type SolverAction,
  type TeaId,
} from '../src/game/types';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  listConstructiveActionsState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeThermosParticipation,
  createGenerateStats,
  fallbackLevel,
  frozenCupTemplateKindFor,
  generateLevel,
  lemonHoneyTemplateKindFor,
  thermosTemplateKindFor,
  validateLevelStructure,
  type GeneratedLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  THERMOS_DEPTH_ACCEPT,
  THERMOS_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/thermosTemplates';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';
const SB: TeaId = 'sea_buckthorn';

const THERMOS_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [M, SB, K, O],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  thermosCupCount: 1,
};

function median(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] as number;
}

function p95(a: number[]): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))] as number;
}

function thermosHostOf(level: GeneratedLevel): number {
  return level.cupConstraints.findIndex((c) => isThermosCupConstraint(c));
}

function expectThermosLevel(req: GenerateRequest, seed: string): { lvl: GeneratedLevel } {
  const lvl = generateLevel(req, seed);
  expect(validateLevelStructure(lvl, req).ok).toBe(true);
  // Exactly one thermos: normal flow, cap5, must-end-empty, no target.
  const hosts = lvl.cupConstraints.filter((c) => isThermosCupConstraint(c));
  expect(hosts).toHaveLength(1);
  const host = thermosHostOf(lvl);
  const hostC = lvl.cupConstraints[host] as CupConstraint;
  expect(hostC.mode).toBe('normal');
  expect(hostC.capacity).toBe(THERMOS_CAPACITY);
  expect(hostC.mustEndEmpty).toBe(true);
  expect(hostC.targetTeaId).toBe(undefined);
  // T3 start: len3, mixed, top-once.
  const hostCup = lvl.cups[host] as TeaId[];
  expect(hostCup).toHaveLength(3);
  expect(new Set(hostCup).size).toBeGreaterThan(1);
  expect(hostCup.filter((t) => t === hostCup[hostCup.length - 1]).length).toBe(1);
  // Authored multiset 4,4,3,3,2,0 with one true empty and 4/color.
  expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
  expect(lvl.cups.filter((c) => c.length === 0)).toHaveLength(1);
  const counts = new Map<string, number>();
  for (const cup of lvl.cups) for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  for (const c of req.colors.slice(0, req.numColors)) expect(counts.get(c)).toBe(4);
  // No sibling special.
  expect(lvl.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
  expect(lvl.cupConstraints.some((c) => c.mode === 'sink-only')).toBe(false);
  expect(lvl.cupConstraints.some((c) => c.targetTeaId !== undefined)).toBe(false);
  expect(lvl.floatingIngredients.every((s) => s === null)).toBe(true);
  expect((lvl.sinkingIngredients ?? []).every((s) => s === null)).toBe(true);
  expect((lvl.iceSlots ?? []).every((s) => s === null)).toBe(true);
  expect(lvl.strainer?.present ?? false).toBe(false);
  expect(lvl.hiddenCounts.every((h) => h === 0)).toBe(true);
  const solved = solvePuzzle(lvl.cups, {
    cupConstraints: lvl.cupConstraints,
    floatingIngredients: lvl.floatingIngredients,
  });
  expect(solved.solvable).toBe(true);
  expect(solved.truncated ?? false).toBe(false);
  expect(solved.minMoves).toBe(lvl.minMoves);
  expect(lvl.minMoves).toBeGreaterThanOrEqual(THERMOS_DEPTH_ACCEPT.min);
  expect(lvl.minMoves).toBeLessThanOrEqual(THERMOS_DEPTH_ACCEPT.max);
  const part = analyzeThermosParticipation(
    lvl.cups,
    host,
    (solved.solution ?? []) as SolverAction[],
    lvl.cupConstraints,
  );
  expect(part.fifthSlotUses).toBeGreaterThanOrEqual(1);
  expect(part.drainsAfterFifth).toBeGreaterThanOrEqual(1);
  expect(part.finalThermosEmpty).toBe(true);
  expect(part.win).toBe(true);
  const fin = applySolutionState(
    { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients },
    solved.solution ?? [],
    lvl.cupConstraints,
  );
  expect(fin).not.toBe(null);
  expect(isPuzzleWonState(fin as PuzzleState, lvl.cupConstraints)).toBe(true);
  expect((fin as PuzzleState).cups[host]).toEqual([]);
  return { lvl };
}

describe('thermos template-kind routing', () => {
  it('canonical thermos requests hit the fast path; others do not', () => {
    expect(thermosTemplateKindFor(THERMOS_CHALLENGE)).toBe('thermos');
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, thermosCupCount: 0 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, thermosCupCount: 2 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, numColors: 3 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, emptyCups: 1 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, hasMysteryLayer: true })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, sourceOnlyCount: 1 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, floatingIngredient: 'lemon' })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, sinkingIngredient: 'honey' })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, hasStrainer: true })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, sinkOnlyCount: 1 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, tastingCupCount: 1 })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, targetTeaIds: [M, K] })).toBe(null);
    expect(thermosTemplateKindFor({ ...THERMOS_CHALLENGE, frozenCupCount: 1 })).toBe(null);
  });

  it('thermosCupCount validation rejects bad combos loudly (FM/FN/GA)', () => {
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, thermosCupCount: 2 }, 'bad:multi')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, hasMysteryLayer: true }, 'bad:mystery')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, sourceOnlyCount: 1 }, 'bad:teapot')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, targetTeaIds: [M, K] }, 'bad:targets')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, sinkOnlyCount: 1 }, 'bad:sink')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, tastingCupCount: 1 }, 'bad:tasting')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, floatingIngredient: 'lemon' }, 'bad:lemon')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, sinkingIngredient: 'honey' }, 'bad:honey')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, hasStrainer: true }, 'bad:strainer')).toThrow();
    expect(() => generateLevel({ ...THERMOS_CHALLENGE, frozenCupCount: 1 }, 'bad:frozen')).toThrow();
  });
});

describe('thermos fast-path structural contract (no 150-scan, no cap4 runtime solve)', () => {
  it('uses bounded template attempts with a single solver call on the happy path', () => {
    const attempts: number[] = [];
    const calls: number[] = [];
    for (let s = 0; s < 20; s++) {
      const st = createGenerateStats();
      generateLevel(THERMOS_CHALLENGE, `thermos-fp:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);
      // Happy path is exactly one production solve (L2 trace inside finalize).
      expect(st.solverCalls).toBe(1);
      expect(st.usedFallback).toBe(false);
      attempts.push(st.templateAttempts);
      calls.push(st.solverCalls);
    }
    expect(median(attempts)).toBe(1);
    expect(p95(attempts)).toBeLessThanOrEqual(2);
    expect(Math.max(...attempts)).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);
    expect(calls.every((c) => c === 1)).toBe(true);
  }, 180000);
});

describe('thermos generator (100 seeds)', () => {
  it('every seed is deterministic, solver-valid, L2, in-band, with >= 14 distinct start keys', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const { lvl } = expectThermosLevel(THERMOS_CHALLENGE, `thermos-ch:${s}`);
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
      const again = generateLevel(THERMOS_CHALLENGE, `thermos-ch:${s}`);
      expect(again.cups).toEqual(lvl.cups);
      expect(again.cupConstraints).toEqual(lvl.cupConstraints);
      expect(again.minMoves).toBe(lvl.minMoves);
    }
    console.log(`thermos variety: ${keys.size}/100 distinct starts`);
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 300000);
});

describe('thermos fallback branch (direct fallbackLevel)', () => {
  it('pinned fallback is solver-validated with its REAL recorded depth 11 and L2 trace', () => {
    const st = createGenerateStats();
    const lvl = fallbackLevel(THERMOS_CHALLENGE, { stats: st });
    expect(st.usedFallback).toBe(true);
    expect(validateLevelStructure(lvl, THERMOS_CHALLENGE).ok).toBe(true);
    expect(lvl.minMoves).toBe(11);
    const solved = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const host = thermosHostOf(lvl);
    expect(host).toBeGreaterThanOrEqual(0);
    const part = analyzeThermosParticipation(
      lvl.cups,
      host,
      (solved.solution ?? []) as SolverAction[],
      lvl.cupConstraints,
    );
    expect(part.fifthSlotUses).toBeGreaterThanOrEqual(1);
    expect(part.drainsAfterFifth).toBeGreaterThanOrEqual(1);
    expect(part.finalThermosEmpty).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as PuzzleState, lvl.cupConstraints)).toBe(true);
  }, 120000);
});

describe('thermos root fairness spot (50 seeds, report-only medians)', () => {
  it('never dooms the blind first move; fifth-slot timing reported', () => {
    const constructives: number[] = [];
    const solvables: number[] = [];
    const optimals: number[] = [];
    const fatals: number[] = [];
    const ratios: number[] = [];
    const fifths: number[] = [];
    const drains: number[] = [];
    let doomSeeds = 0;
    for (let s = 0; s < 50; s++) {
      const lvl = generateLevel(THERMOS_CHALLENGE, `thermos-fair:${s}`);
      const constraints = lvl.cupConstraints;
      const state = { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients };
      const constructive = listConstructiveActionsState(state, constraints);
      constructives.push(constructive.length);
      let sv = 0;
      let op = 0;
      let fa = 0;
      for (const action of constructive) {
        const res = applyPuzzleActionState(state, action, constraints);
        if (!res) continue;
        const child = solvePuzzle(res.state.cups, {
          cupConstraints: constraints,
          floatingIngredients: res.state.floatingIngredients,
        });
        const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
        if (ok) {
          sv++;
          if (child.minMoves === (lvl.minMoves as number) - puzzleActionCost(action)) op++;
        } else if (!child.truncated) {
          fa++;
        }
      }
      solvables.push(sv);
      optimals.push(op);
      fatals.push(fa);
      ratios.push(constructive.length > 0 ? fa / constructive.length : 0);
      if (sv === 0) doomSeeds++;
      expect(sv).toBeGreaterThanOrEqual(1);
      const solved = solvePuzzle(lvl.cups, { cupConstraints: constraints });
      const host = thermosHostOf(lvl);
      const part = analyzeThermosParticipation(
        lvl.cups,
        host,
        (solved.solution ?? []) as SolverAction[],
        constraints,
      );
      if (part.firstFifthSlotDepth !== null) fifths.push(part.firstFifthSlotDepth);
      if (part.firstDrainAfterFifthDepth !== null) drains.push(part.firstDrainAfterFifthDepth);
    }
    expect(doomSeeds / 50).toBeLessThan(0.5);
    console.log(
      `thermos fairness: n=50 ` +
        `constructive med=${median(constructives)} solvableFirst med=${median(solvables)} ` +
        `optimalFirst med=${median(optimals)} fatal med=${median(fatals)} ` +
        `fatalRatio med=${median(ratios).toFixed(3)} doomRate=${(doomSeeds / 50).toFixed(3)} ` +
        `firstFifth med=${median(fifths)} firstDrain med=${median(drains)}`,
    );
  }, 300000);
});

describe('legacy routing regression (G8/G9 untouched)', () => {
  it('lemon+honey still routes to interaction and frozen still routes to frozen, never thermos', () => {
    const interaction: GenerateRequest = {
      numColors: 4,
      colors: ['buckwheat', 'sea_buckthorn', 'matcha', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      floatingIngredient: 'lemon',
      sinkingIngredient: 'honey',
      targetTeaIds: [],
    };
    expect(lemonHoneyTemplateKindFor(interaction)).toBe('lemon-honey-interaction');
    expect(thermosTemplateKindFor(interaction)).toBe(null);
    const frozen: GenerateRequest = {
      numColors: 4,
      colors: ['sea_buckthorn', 'matcha', 'karkade', 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      frozenCupCount: 1,
    };
    expect(frozenCupTemplateKindFor(frozen)).toBe('frozen-cup');
    expect(thermosTemplateKindFor(frozen)).toBe(null);
    expect(thermosTemplateKindFor(THERMOS_CHALLENGE)).toBe('thermos');
    expect(frozenCupTemplateKindFor(THERMOS_CHALLENGE)).toBe(null);
  });
});
