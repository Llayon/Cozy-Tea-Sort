/**
 * Gauntlet 10 — 200-seed thermos production stress corpus + variety,
 * fairness and perf reporting.
 *
 * 200 seeds verify the full shared gate (deterministic 4c6v16u shape,
 * cap5/mustEndEmpty T3 mixed thermos, solver-valid non-truncated in-band
 * depth, L2 fifth→drain→empty→win). Variety (≥14 distinct starts, prefer
 * 18), fairness (50 seeds: constructive/solvable-first/optimal-first /
 * fatal/doom + fifth timing) and perf percentiles ride on the same
 * production path. No 5k mining in CI — exhaustive bank mining lives
 * offline in scripts/dev/thermos-search.ts + thermos-curate.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  isThermosCupConstraint,
  type SolverAction,
  type TeaId,
} from '../src/game/types';
import {
  analyzeThermosParticipation,
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { THERMOS_TEMPLATE_ATTEMPTS } from '../src/game/logic/thermosTemplates';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  listConstructiveActionsState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { checkThermosStressSeed, heartbeat } from './thermos-stress-shared';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'] as TeaId[],
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

function percentile(a: number[], p: number): number {
  if (a.length === 0) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

describe('thermos challenge stress (200 seeds: gate + variety + perf)', () => {
  it('every production level is solver-valid L2, fast-path, with variety and perf report', async () => {
    const keys = new Set<string>();
    const genMs: number[] = [];
    const solverMs: number[] = [];
    const visited: number[] = [];
    const attempts: number[] = [];
    const calls: number[] = [];
    let fallbacks = 0;
    for (let s = 0; s < 200; s++) {
      const seed = `thermos-ch:${s}`;
      const stats = createGenerateStats();
      const t0 = Date.now();
      const level = generateLevel(REQ, seed, { stats });
      genMs.push(Date.now() - t0);
      expect(stats.usedFallback).toBe(false);
      expect(stats.candidatesTried).toBe(0);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);
      expect(stats.solverCalls).toBeGreaterThanOrEqual(1);
      expect(stats.solverCalls).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);
      if (stats.usedFallback) fallbacks++;
      attempts.push(stats.templateAttempts);
      calls.push(stats.solverCalls);
      expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
      expect(level.cupConstraints.some((c) => c.mode === 'source-only')).toBe(false);
      checkThermosStressSeed(level, REQ, seed);
      keys.add(canonicalPuzzleKey(level, level.cupConstraints));
      const t1 = Date.now();
      const solved = solvePuzzle(level.cups, {
        cupConstraints: level.cupConstraints,
        floatingIngredients: level.floatingIngredients,
      });
      solverMs.push(Date.now() - t1);
      visited.push(solved.visitedStates);
      expect(solved.minMoves).toBe(level.minMoves);
      if (s % 25 === 0) await heartbeat();
    }
    console.log(`thermos variety: ${keys.size}/200 distinct starts (need >= 14, prefer 18)`);
    expect(keys.size).toBeGreaterThanOrEqual(14);
    console.log(
      `thermos perf: n=200 ` +
        `gen p50=${median(genMs)} p90=${percentile(genMs, 90)} p95=${percentile(genMs, 95)} max=${Math.max(...genMs)} ` +
        `solver p50=${median(solverMs)} p95=${percentile(solverMs, 95)} max=${Math.max(...solverMs)} ` +
        `visited p50=${median(visited)} p95=${percentile(visited, 95)} max=${Math.max(...visited)} ` +
        `attempts p50=${median(attempts)} p95=${percentile(attempts, 95)} max=${Math.max(...attempts)} ` +
        `solverCalls p50=${median(calls)} max=${Math.max(...calls)} fallbackRate=${(fallbacks / 200).toFixed(3)}`,
    );
    expect(fallbacks).toBe(0);
    expect(Math.max(...attempts)).toBeLessThanOrEqual(THERMOS_TEMPLATE_ATTEMPTS);
  }, 400000);
});

describe('thermos root fairness (50 seeds)', () => {
  it('constructive/solvable-first/optimal-first/fatal/doom healthy with fifth timing', async () => {
    const constructives: number[] = [];
    const solvables: number[] = [];
    const optimals: number[] = [];
    const fatals: number[] = [];
    const fifths: number[] = [];
    const drains: number[] = [];
    let doomSeeds = 0;
    for (let s = 0; s < 50; s++) {
      const lvl = generateLevel(REQ, `thermos-stress-fair:${s}`);
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
      if (sv === 0) doomSeeds++;
      expect(sv).toBeGreaterThanOrEqual(1);
      const solved = solvePuzzle(lvl.cups, { cupConstraints: constraints });
      const host = constraints.findIndex((c) => isThermosCupConstraint(c));
      const part = analyzeThermosParticipation(
        lvl.cups,
        host,
        (solved.solution ?? []) as SolverAction[],
        constraints,
      );
      expect(part.fifthSlotUses).toBeGreaterThanOrEqual(1);
      if (part.firstFifthSlotDepth !== null) fifths.push(part.firstFifthSlotDepth);
      if (part.firstDrainAfterFifthDepth !== null) drains.push(part.firstDrainAfterFifthDepth);
      if (s % 25 === 0) await heartbeat();
    }
    expect(doomSeeds).toBe(0);
    console.log(
      `thermos stress fairness: n=50 ` +
        `constructive med=${median(constructives)} solvableFirst med=${median(solvables)} ` +
        `optimalFirst med=${median(optimals)} fatal med=${median(fatals)} doom=${doomSeeds}/50 ` +
        `firstFifth med=${median(fifths)} firstDrain med=${median(drains)}`,
    );
  }, 300000);
});
