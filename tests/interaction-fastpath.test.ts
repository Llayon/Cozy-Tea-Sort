/**
 * Gauntlet 8 §69-73, §104 — lemon+honey interaction fast path: kind
 * routing, bounded template attempts (single solver call — the L2 trace
 * rides inside the one production validation), production variety
 * (100 seeds), DIRECT fallbackLevel test with the pinned depth-11 layout,
 * determinism.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState, SinkingIngredientSlot, TeaId } from '../src/game/types';
import { canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeIngredientInteraction,
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  isLemonHoneyInteractionRequest,
  lemonHoneyTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  LEMON_HONEY_DEPTH_ACCEPT,
  LEMON_HONEY_TEMPLATE_ATTEMPTS,
} from '../src/game/logic/lemonHoneyTemplates';

const BW: TeaId = 'buckwheat';
const SB: TeaId = 'sea_buckthorn';
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

const INTERACTION_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: [BW, SB, M, K],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  floatingIngredient: 'lemon',
  sinkingIngredient: 'honey',
};

describe('lemon+honey template-kind routing', () => {
  it('canonical 4c/6v/2e lemon+honey hits the fast path; variants do not', () => {
    expect(isLemonHoneyInteractionRequest(INTERACTION_CHALLENGE)).toBe(true);
    expect(lemonHoneyTemplateKindFor(INTERACTION_CHALLENGE)).toBe('lemon-honey-interaction');
    // Mystery / teapot break the exact G8 topology → null.
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, hasMysteryLayer: true })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, sourceOnlyCount: 1 })).toBe(null);
    // Third specials → null.
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, sinkOnlyCount: 1 })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, tastingCupCount: 1 })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, targetTeaIds: [M, K] })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, hasStrainer: true })).toBe(null);
    // Single-ingredient requests are NOT the interaction → null.
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, sinkingIngredient: undefined })).toBe(
      null,
    );
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, floatingIngredient: undefined })).toBe(
      null,
    );
    expect(
      lemonHoneyTemplateKindFor({
        ...INTERACTION_CHALLENGE,
        floatingIngredient: undefined,
        sinkingIngredient: undefined,
      }),
    ).toBe(null);
    // Wrong vessel counts → null (canonical IS 4c/6v/2e).
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, numColors: 3 })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, numColors: 5 })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, emptyCups: 1 })).toBe(null);
    expect(lemonHoneyTemplateKindFor({ ...INTERACTION_CHALLENGE, emptyCups: 3 })).toBe(null);
  });
});

describe('interaction fast-path structural contract (no 150-scan)', () => {
  it('10 seeds use bounded template attempts with exactly one solver call', () => {
    for (let s = 0; s < 10; s++) {
      const st = createGenerateStats();
      const lvl = generateLevel(INTERACTION_CHALLENGE, `interaction-fp:${s}`, { stats: st });
      expect(st.candidatesTried).toBe(0);
      expect(st.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(st.templateAttempts).toBeLessThanOrEqual(LEMON_HONEY_TEMPLATE_ATTEMPTS);
      // The L2 trace rides inside the single production validation.
      expect(st.solverCalls).toBe(1);
      expect(st.usedFallback).toBe(false);
      expect(validateLevelStructure(lvl, INTERACTION_CHALLENGE).ok).toBe(true);
      expect(lvl.minMoves).toBeGreaterThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.min);
      expect(lvl.minMoves).toBeLessThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.max);
    }
  }, 120000);
});

describe('interaction challenge generator (100 seeds)', () => {
  it('every seed is structure-valid in-band, with >= 14 distinct start keys', () => {
    const keys = new Set<string>();
    for (let s = 0; s < 100; s++) {
      const stats = createGenerateStats();
      const lvl = generateLevel(INTERACTION_CHALLENGE, `interaction-ch:${s}`, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(validateLevelStructure(lvl, INTERACTION_CHALLENGE).ok).toBe(true);
      expect(lvl.minMoves).toBeGreaterThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.min);
      expect(lvl.minMoves).toBeLessThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.max);
      keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
    }
    expect(keys.size).toBeGreaterThanOrEqual(14);
  }, 240000);
});

describe('interaction fallback branch (direct fallbackLevel)', () => {
  it('fallback is the pinned depth-11 L2 layout, solver-validated', () => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(INTERACTION_CHALLENGE, { stats });
    expect(stats.usedFallback).toBe(true);
    expect(validateLevelStructure(lvl, INTERACTION_CHALLENGE).ok).toBe(true);
    expect(lvl.minMoves).toBe(11);
    // WITH lemon+honey: solvable, non-truncated, real depth 11.
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    // L2 trace: cohost + split + both relocations, both goals, win.
    const solution = solved.solution ?? [];
    const trace = analyzeIngredientInteraction(
      lvl.cups,
      lvl.floatingIngredients,
      lvl.sinkingIngredients ?? [],
      solution,
      lvl.cupConstraints,
    );
    expect(trace.lemonMoves).toBeGreaterThanOrEqual(1);
    expect(trace.honeyStays).toBeGreaterThanOrEqual(1);
    expect(trace.honeyMoves).toBeGreaterThanOrEqual(1);
    expect(trace.cohostStates).toBeGreaterThanOrEqual(1);
    expect(trace.splitEvents).toBeGreaterThanOrEqual(1);
    expect(trace.finalLemonOk).toBe(true);
    expect(trace.finalHoneyOk).toBe(true);
    expect(trace.finalLemonHost).not.toBe(trace.finalHoneyHost);
    expect(trace.win).toBe(true);
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
    const lemonHost = (final as PuzzleState).floatingIngredients.findIndex((s) => s === 'lemon');
    const honeyHost: number = ((final as PuzzleState).sinkingIngredients ?? []).findIndex(
      (s: SinkingIngredientSlot) => s === 'honey',
    );
    expect((final as PuzzleState).cups[lemonHost]).toEqual([SB, SB, SB, SB]);
    expect((final as PuzzleState).cups[honeyHost]).toEqual([BW, BW, BW, BW]);
  }, 120000);
});

describe('interaction determinism', () => {
  it('same request + seed reproduces cups/slots/hidden/constraints/minMoves', () => {
    const a = generateLevel(INTERACTION_CHALLENGE, 'interaction-det:7');
    const b = generateLevel(INTERACTION_CHALLENGE, 'interaction-det:7');
    expect(a.cups).toEqual(b.cups);
    expect(a.floatingIngredients).toEqual(b.floatingIngredients);
    expect(a.sinkingIngredients).toEqual(b.sinkingIngredients);
    expect(a.hiddenCounts).toEqual(b.hiddenCounts);
    expect(a.cupConstraints).toEqual(b.cupConstraints);
    expect(a.minMoves).toBe(b.minMoves);
  });
});
