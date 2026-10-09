/**
 * Gauntlet 12 — tea-bloom production stress (§§143,147-150).
 *
 * 200 production seeds: determinism, topology, L2, band, attempts (median 1,
 * p95 <=2), solverCalls (1 happy path), fallback rare, generator p95
 * structural (attempts-based, never wall-clock), variety, fairness
 * diagnostics.
 */
import { describe, expect, it } from 'vitest';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  listConstructiveActionsState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { emptyFloatingIngredients, type SolverAction } from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import { budRequest, runBudSeed } from './tea-bloom-stress-shared';
import {
  analyzeTeaBloomParticipation,
  createGenerateStats,
  generateLevel,
} from '../src/game/logic/generator';

describe('200 production seeds: validity + L2 + band', () => {
  it('every seed deterministic, in-band, L2, bud cleared, win', () => {
    const depths: number[] = [];
    for (let i = 0; i < 200; i++) {
      const o = runBudSeed(`tea-bloom-stress-${i}`);
      depths.push(o.minMoves);
      expect(o.minMoves).toBeGreaterThanOrEqual(10);
      expect(o.minMoves).toBeLessThanOrEqual(14);
      expect(o.bloomDepth).not.toBe(null);
      expect(o.reuseDepth).not.toBe(null);
      expect((o.reuseDepth as number)).toBeGreaterThan(o.bloomDepth as number);
      expect(o.maxOcc).toBeGreaterThanOrEqual(2);
      expect(o.l3a || o.l3b).toBe(true);
    }
    const inSweet = depths.filter((d) => d >= 11 && d <= 13).length;
    expect(inSweet).toBeGreaterThanOrEqual(120);
  }, 300000);

  it('determinism: same seed gives identical layout and depth', () => {
    const a = runBudSeed('tea-bloom-determinism-7');
    const b = runBudSeed('tea-bloom-determinism-7');
    expect(a).toEqual(b);
  }, 60000);
});

describe('generator boundedness: attempts, solverCalls, fallback', () => {
  it('median 1 attempt, p95 <= 2, 1 solve happy path, fallback rare', () => {
    const attempts: number[] = [];
    const solves: number[] = [];
    let fallbacks = 0;
    for (let i = 0; i < 100; i++) {
      const o = runBudSeed(`tea-bloom-bounded-${i}`);
      attempts.push(o.templateAttempts);
      solves.push(o.solverCalls);
      if (o.usedFallback) fallbacks++;
    }
    const sorted = [...attempts].sort((x, y) => x - y);
    expect(sorted[Math.floor(sorted.length / 2)] as number).toBe(1);
    expect(sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))] as number).toBeLessThanOrEqual(2);
    expect(Math.max(...solves)).toBe(1);
    expect(fallbacks).toBeLessThanOrEqual(3);
  }, 300000);
});

describe('root fairness (50 seeds): constructive/solvable-first/optimal-first/fatal/doom + bloom/reuse timing + L3A/B + control', () => {
  it('healthy opening with bloom/reuse timing, L3 rates and control delta report', () => {
    const constructives: number[] = [];
    const solvables: number[] = [];
    const optimals: number[] = [];
    const fatals: number[] = [];
    const blooms: number[] = [];
    const reuses: number[] = [];
    const deltas: number[] = [];
    let doomSeeds = 0;
    let l3a = 0;
    let l3b = 0;
    let avoids = 0;
    const med = (a: number[]): number => {
      if (a.length === 0) return 0;
      const s = [...a].sort((x, y) => x - y);
      return s[Math.floor(s.length / 2)] as number;
    };
    for (let s = 0; s < 50; s++) {
      const lvl = generateLevel(budRequest(), `tea-bloom-stress-fair:${s}`);
      const constraints = lvl.cupConstraints;
      const buds = lvl.teaBudSlots ?? [];
      const host = buds.findIndex((x) => x === 'tea_bud');
      const state = { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, teaBudSlots: buds };
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
          teaBudSlots: res.state.teaBudSlots,
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
      const solved = solvePuzzle(lvl.cups, {
        cupConstraints: constraints,
        floatingIngredients: lvl.floatingIngredients,
        teaBudSlots: buds,
      });
      const part = analyzeTeaBloomParticipation(lvl.cups, buds, host, (solved.solution ?? []) as SolverAction[], constraints);
      expect(part.blooms).toBeGreaterThanOrEqual(1);
      expect(part.firstReuseDepth).not.toBe(null);
      if (part.firstBloomDepth !== null) blooms.push(part.firstBloomDepth);
      if (part.firstReuseDepth !== null) reuses.push(part.firstReuseDepth);
      if (part.firstPostBloomSourceDepth !== null) l3a++;
      if (part.finalRepurpose) l3b++;
      const plain = solvePuzzle(lvl.cups, { cupConstraints: constraints });
      if (plain.solvable && plain.minMoves !== undefined && plain.solution) {
        deltas.push(lvl.minMoves - plain.minMoves);
        let pc = lvl.cups.map((c) => [...c]);
        let minOcc = pc[host]?.length ?? 0;
        for (const a of plain.solution) {
          if ((a as SolverAction).kind !== 'pour') continue;
          const r2 = applyPuzzleActionState({ cups: pc, floatingIngredients: emptyFloatingIngredients(pc.length) }, a as SolverAction, constraints);
          if (!r2) break;
          pc = r2.state.cups;
          minOcc = Math.min(minOcc, pc[host]?.length ?? 0);
        }
        if (minOcc > 0) avoids++;
      }
    }
    expect(doomSeeds).toBe(0);
    console.log(
      `tea-bloom stress fairness: n=50 constructive med=${med(constructives)} solvableFirst med=${med(solvables)} ` +
        `optimalFirst med=${med(optimals)} fatal med=${med(fatals)} doom=${doomSeeds}/50 ` +
        `firstBloom med=${med(blooms)} firstReuse med=${med(reuses)} L3A=${l3a}/50 L3B=${l3b}/50 ` +
        `delta med=${med(deltas)} avoids=${avoids}/50`,
    );
  }, 400000);
});

describe('variety: canonical-distinct starts across 100 seeds', () => {
  it('>=14 distinct (prefer 18+) — color renames alone do not count', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const lvl = generateLevel(budRequest(), `tea-bloom-variety-${i}`, { stats: createGenerateStats() });
      keys.add(
        canonicalPuzzleKey(
          { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, teaBudSlots: lvl.teaBudSlots },
          lvl.cupConstraints,
        ),
      );
    }
    expect(keys.size).toBeGreaterThanOrEqual(14);
    void emptyFloatingIngredients;
  }, 300000);
});
