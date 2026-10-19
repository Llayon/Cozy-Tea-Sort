/**
 * Gauntlet 16 — production stress: 200 deterministic shared-tray seeds
 * through the production generator (§§148-149).
 *
 * Every seed: deterministic 4c/6v/16u P33 profile, one group / two members /
 * limit 6, no second mechanic, no reaction IDs, solver solvable +
 * non-truncated + in-band, pressure → release → refill → win, and a
 * per-move invariant (cup ≤ individual cap, group occupancy ≤ 6) across the
 * full optimal replay. Reports variety, fairness-adjacent timing gaps,
 * and performance (generator + solver).
 */
import { describe, expect, it } from 'vitest';
import type { SolverAction, TeaId } from '../src/game/types';
import { cupCapacity, emptyFloatingIngredients } from '../src/game/types';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeSharedTrayParticipation,
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { SHARED_TRAY_DEPTH_ACCEPT } from '../src/game/logic/sharedTrayTemplates';
import {
  sharedCapacityFree,
  sharedCapacityOccupancy,
} from '../src/game/logic/sharedCapacity';

const REQ: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sharedTrayCount: 1,
};

const N = 200;

describe('200 production seeds: contract + replay invariants', () => {
  it('all seeds deterministic, solvable, in-band, L2, per-move valid', () => {
    const keys = new Set<string>();
    const depths: number[] = [];
    const genMs: number[] = [];
    const solvMs: number[] = [];
    const visited: number[] = [];
    const attempts: number[] = [];
    let fallbacks = 0;
    let cross = 0;
    const gaps: number[] = [];
    for (let i = 0; i < N; i++) {
      const seed = `shared-stress-${i}`;
      const stats = createGenerateStats();
      const t0 = Date.now();
      const lvl = generateLevel(REQ, seed, { stats });
      genMs.push(Date.now() - t0);
      attempts.push(stats.templateAttempts);
      if (stats.usedFallback) fallbacks++;
      // Deterministic: same seed regenerates byte-identical content.
      const again = generateLevel(REQ, seed);
      expect(again.cups).toEqual(lvl.cups);
      expect(again.cupConstraints).toEqual(lvl.cupConstraints);
      expect(again.minMoves).toBe(lvl.minMoves);
      // Shape: P33 profile, one group / two members / limit 6.
      expect(lvl.cups.length).toBe(6);
      expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
      const members = lvl.cupConstraints
        .map((c, idx) => (c?.sharedCapacityGroup === 'tea-tray' ? idx : -1))
        .filter((idx) => idx >= 0);
      expect(members.length).toBe(2);
      for (const m of members) {
        expect(lvl.cupConstraints[m]?.mode).toBe('normal');
        expect(cupCapacity(lvl.cupConstraints[m])).toBe(4);
      }
      // No second mechanic, no reaction IDs.
      const flat = lvl.cups.flat() as TeaId[];
      expect(flat.length).toBe(16);
      expect(flat).not.toContain('black_tea');
      expect(flat).not.toContain('milk');
      expect(flat).not.toContain('milk_tea');
      expect(lvl.cupConstraints.some((c) => c.serveOrder !== undefined)).toBe(false);
      expect(lvl.cupConstraints.some((c) => c.targetTeaId !== undefined)).toBe(false);
      // Solver: solvable, non-truncated, in-band.
      const t1 = Date.now();
      const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints, returnSolution: true });
      solvMs.push(Date.now() - t1);
      visited.push(r.visitedStates);
      expect(r.solvable).toBe(true);
      expect(r.truncated ?? false).toBe(false);
      expect(r.minMoves).toBe(lvl.minMoves);
      expect(r.minMoves).toBeGreaterThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.min);
      expect(r.minMoves).toBeLessThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.max);
      depths.push(r.minMoves as number);
      keys.add(canonicalPuzzleKey(
        { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) },
        lvl.cupConstraints,
      ));
      // L2: pressure → release → refill → win.
      const part = analyzeSharedTrayParticipation(lvl.cups, (r.solution ?? []) as SolverAction[], lvl.cupConstraints);
      expect(part.firstPressureDepth).not.toBe(null);
      expect(part.firstReleaseDepth).not.toBe(null);
      expect(part.firstRefillDepth).not.toBe(null);
      expect(part.win).toBe(true);
      gaps.push((part.firstRefillDepth as number) - (part.firstReleaseDepth as number));
      // Per-move invariant across the optimal replay.
      let board = lvl.cups.map((c) => [...c]);
      const st = () => ({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) });
      for (const a of (r.solution ?? []) as SolverAction[]) {
        if (a.kind !== 'pour') continue;
        const res = applyPourState(st(), a.from, a.to, lvl.cupConstraints);
        expect(res).not.toBe(null);
        if (!res) break;
        board = res.state.cups as TeaId[][];
        for (let ci = 0; ci < board.length; ci++) {
          expect((board[ci] as TeaId[]).length).toBeLessThanOrEqual(cupCapacity(lvl.cupConstraints[ci]));
        }
        expect(sharedCapacityOccupancy(st(), lvl.cupConstraints, 'tea-tray')).toBeLessThanOrEqual(6);
        expect(sharedCapacityFree(st(), lvl.cupConstraints, 'tea-tray')).toBeGreaterThanOrEqual(0);
      }
      expect(isPuzzleWonState(st(), lvl.cupConstraints)).toBe(true);
    }
    const pct = (a: number[], p: number) => {
      const s = [...a].sort((x, y) => x - y);
      return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
    };
    console.log(`shared stress N=${N} variety=${keys.size} fallbacks=${fallbacks}`);
    console.log(`depths min=${Math.min(...depths)} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${Math.max(...depths)}`);
    console.log(`release→refill gap p50=${pct(gaps, 50)} p95=${pct(gaps, 95)}`);
    console.log(`generator ms p50=${pct(genMs, 50)} p90=${pct(genMs, 90)} p95=${pct(genMs, 95)} max=${Math.max(...genMs)}`);
    console.log(`solver ms p50=${pct(solvMs, 50)} p95=${pct(solvMs, 95)} max=${Math.max(...solvMs)} visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)}`);
    console.log(`templateAttempts median=${pct(attempts, 50)} p95=${pct(attempts, 95)} max=${Math.max(...attempts)}`);
    // Variety: color renaming alone does not count (canonical keys include
    // tea identities, so this is a lower bound on strategic distinctness).
    expect(keys.size).toBeGreaterThanOrEqual(14);
    void cross;
  }, 300_000);
});
