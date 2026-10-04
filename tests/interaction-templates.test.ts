/**
 * Gauntlet 8 §60-63 — lemon+honey interaction template-bank validation.
 *
 * EVERY committed template: instantiate (identity c2/c3 order, c0 fixed to
 * buckwheat, c1 fixed to sea_buckthorn) → plain constraints → production
 * solver WITH both ingredients (recorded depth, L2 interaction trace:
 * cohost + SPLIT + lemon/honey relocations + both final goals) →
 * analyzeIngredientInteraction + full applySolutionState replay proving the
 * distinct final hosts (lemon on sea_buckthorn, honey on buckwheat).
 * Plus c2/c3-swap isomorphism invariance (depth holds exactly), canonical
 * distinctness (both ingredient slots in the key), and L3 coverage
 * (JOINT MOVE events — reported ids for the record).
 */
import { describe, expect, it } from 'vitest';
import type {
  CupConstraint,
  FloatingIngredientSlot,
  PuzzleState,
  SinkingIngredientSlot,
  TeaId,
} from '../src/game/types';
import {
  defaultCupConstraints,
  emptyFloatingIngredients,
  emptySinkingIngredients,
} from '../src/game/types';
import {
  canonicalPuzzleKey,
  floatingIngredientHostSatisfied,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeIngredientInteraction,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  ALL_LEMON_HONEY_TEMPLATES,
  LEMON_HONEY_DEPTH_ACCEPT,
  LEMON_HONEY_DEPTH_SWEET,
  LEMON_HONEY_TARGET_TEAS,
  LEMON_HONEY_TEMPLATE_BANK,
  instantiateLemonHoneyTemplate,
  type LemonHoneyTemplate,
} from '../src/game/logic/lemonHoneyTemplates';

const BW: TeaId = 'buckwheat';
const SB: TeaId = 'sea_buckthorn';
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';

/** Canonical 4-color palette: c0 → buckwheat, c1 → sea_buckthorn. */
const PALETTE: TeaId[] = [BW, SB, M, K];

function instantiateForTest(
  tpl: LemonHoneyTemplate,
  palette: TeaId[],
  c2c3Order?: [TeaId, TeaId],
): {
  cups: TeaId[][];
  constraints: CupConstraint[];
  floating: FloatingIngredientSlot[];
  sinking: SinkingIngredientSlot[];
} {
  const others = palette.filter(
    (t) => t !== LEMON_HONEY_TARGET_TEAS.honey && t !== LEMON_HONEY_TARGET_TEAS.lemon,
  );
  const order: [TeaId, TeaId] = c2c3Order ?? [others[0] as TeaId, others[1] as TeaId];
  const inst = instantiateLemonHoneyTemplate(tpl, palette, order);
  const constraints = defaultCupConstraints(inst.cups.length);
  const floating = emptyFloatingIngredients(inst.cups.length);
  floating[inst.lemonHost] = 'lemon';
  const sinking = emptySinkingIngredients(inst.cups.length);
  sinking[inst.honeyHost] = 'honey';
  return { cups: inst.cups, constraints, floating, sinking };
}

function requestFor(palette: TeaId[]): GenerateRequest {
  return {
    numColors: 4,
    colors: palette,
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
    floatingIngredient: 'lemon',
    sinkingIngredient: 'honey',
  };
}

describe('lemon+honey template bank shape', () => {
  it('has exactly 18 templates of kind lemon-honey-interaction', () => {
    expect(LEMON_HONEY_TEMPLATE_BANK['lemon-honey-interaction']).toHaveLength(18);
    expect(ALL_LEMON_HONEY_TEMPLATES).toHaveLength(18);
  });

  it('ids unique; kinds correct', () => {
    const ids = new Set(ALL_LEMON_HONEY_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(18);
    for (const tpl of ALL_LEMON_HONEY_TEMPLATES) {
      expect(tpl.kind).toBe('lemon-honey-interaction');
    }
  });

  it('every template matches the 4c/6v/2e interaction topology contract', () => {
    for (const tpl of ALL_LEMON_HONEY_TEMPLATES) {
      // 6 vessels with exactly 2 empties.
      expect(tpl.cups.length).toBe(6);
      expect(tpl.cups.filter((c) => c.length === 0)).toHaveLength(2);
      // Tea units 4/color over the role set c0..c3.
      const roleCounts = new Map<string, number>();
      tpl.cups.forEach((cup) => cup.forEach((r) => roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1)));
      for (const r of ['c0', 'c1', 'c2', 'c3']) expect(roleCounts.get(r)).toBe(4);
      // Target roles present (never permuted away at instantiation).
      const flat = tpl.cups.flat();
      expect(flat).toContain('c0');
      expect(flat).toContain('c1');
      // Hosts in range, distinct, mixed-full vessels.
      expect(tpl.lemonHost).toBeGreaterThanOrEqual(0);
      expect(tpl.lemonHost).toBeLessThan(6);
      expect(tpl.honeyHost).toBeGreaterThanOrEqual(0);
      expect(tpl.honeyHost).toBeLessThan(6);
      expect(tpl.honeyHost).not.toBe(tpl.lemonHost);
      const lemonCup = tpl.cups[tpl.lemonHost] as string[];
      const honeyCup = tpl.cups[tpl.honeyHost] as string[];
      expect(lemonCup.length).toBe(4);
      expect(new Set(lemonCup).size).toBeGreaterThan(1);
      expect(honeyCup.length).toBe(4);
      expect(new Set(honeyCup).size).toBeGreaterThan(1);
      // Recorded depth sits in the accept band.
      expect(tpl.depth).toBeGreaterThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.min);
      expect(tpl.depth).toBeLessThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.max);
    }
  });
});

describe('template validation: lemon-honey-interaction', () => {
  it('every template instantiates to an L2 level with recorded depth', () => {
    const req = requestFor(PALETTE);
    let sweetCount = 0;
    for (const tpl of ALL_LEMON_HONEY_TEMPLATES) {
      const { cups, constraints, floating, sinking } = instantiateForTest(tpl, PALETTE);
      // Structural contract: 4c/6v/2e, 4 units per tea.
      expect(cups.length).toBe(6);
      expect(cups.filter((c) => c.length === 0)).toHaveLength(2);
      const counts = new Map<string, number>();
      cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      PALETTE.forEach((c) => expect(counts.get(c)).toBe(4));
      expect(floating.filter((s) => s === 'lemon')).toHaveLength(1);
      expect(sinking.filter((s) => s === 'honey')).toHaveLength(1);
      // WITH lemon+honey: solvable, non-truncated, recorded depth, in-band.
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: floating,
        sinkingIngredients: sinking,
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
      expect(solved.minMoves as number).toBeGreaterThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.min);
      expect(solved.minMoves as number).toBeLessThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.max);
      if (
        (solved.minMoves as number) >= LEMON_HONEY_DEPTH_SWEET.min &&
        (solved.minMoves as number) <= LEMON_HONEY_DEPTH_SWEET.max
      ) {
        sweetCount++;
      }
      // Full structure validator passes (production gate shape).
      const level = {
        cups,
        hiddenCounts: cups.map(() => 0),
        cupConstraints: constraints,
        floatingIngredients: floating,
        sinkingIngredients: sinking,
        seed: `tpl:${tpl.id}`,
        minMoves: solved.minMoves as number,
        visitedStates: solved.visitedStates,
      };
      expect(validateLevelStructure(level, req).ok).toBe(true);
      // L2 interaction trace: cohost + split + both relocations.
      const solution = solved.solution ?? [];
      const trace = analyzeIngredientInteraction(cups, floating, sinking, solution, constraints);
      expect(trace.cohostStates).toBeGreaterThanOrEqual(1);
      expect(trace.splitEvents).toBeGreaterThanOrEqual(1);
      expect(trace.lemonMoves).toBeGreaterThanOrEqual(1);
      expect(trace.honeyStays).toBeGreaterThanOrEqual(1);
      expect(trace.honeyMoves).toBeGreaterThanOrEqual(1);
      // Full replay wins with both goals on distinct final hosts.
      const final = applySolutionState(
        { cups, floatingIngredients: floating, sinkingIngredients: sinking },
        solution,
        constraints,
      );
      expect(final).not.toBe(null);
      expect(isPuzzleWonState(final as PuzzleState, constraints)).toBe(true);
      expect(trace.finalLemonOk).toBe(true);
      expect(trace.finalHoneyOk).toBe(true);
      expect(trace.finalLemonHost).toBeGreaterThanOrEqual(0);
      expect(trace.finalHoneyHost).toBeGreaterThanOrEqual(0);
      expect(trace.finalLemonHost).not.toBe(trace.finalHoneyHost);
      expect(trace.win).toBe(true);
      expect((final as PuzzleState).cups[trace.finalLemonHost]).toEqual([SB, SB, SB, SB]);
      expect((final as PuzzleState).cups[trace.finalHoneyHost]).toEqual([BW, BW, BW, BW]);
      expect(
        floatingIngredientHostSatisfied(
          'lemon',
          (final as PuzzleState).cups[trace.finalLemonHost] as TeaId[],
          constraints[trace.finalLemonHost],
        ),
      ).toBe(true);
      expect(
        sinkingIngredientHostSatisfied(
          'honey',
          (final as PuzzleState).cups[trace.finalHoneyHost] as TeaId[],
          constraints[trace.finalHoneyHost],
        ),
      ).toBe(true);
    }
    // Mostly sweet: the committed bank lives in the 10–14 sweet band.
    expect(sweetCount).toBeGreaterThanOrEqual(14);
  }, 180000);

  it('swapped c2/c3 order preserves depth exactly (non-target isomorphism)', () => {
    const others = PALETTE.filter((t) => t !== BW && t !== SB);
    const swapped: [TeaId, TeaId] = [others[1] as TeaId, others[0] as TeaId];
    expect(swapped).not.toEqual([others[0], others[1]]);
    for (const tpl of ALL_LEMON_HONEY_TEMPLATES) {
      const { cups, constraints, floating, sinking } = instantiateForTest(tpl, PALETTE, swapped);
      // Target fixation: c0 roles became buckwheat, c1 roles sea_buckthorn.
      const flatRoles = tpl.cups.flat();
      const flatTeas = cups.flat();
      flatRoles.forEach((role, i) => {
        if (role === 'c0') expect(flatTeas[i]).toBe(BW);
        if (role === 'c1') expect(flatTeas[i]).toBe(SB);
      });
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: floating,
        sinkingIngredients: sinking,
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  }, 180000);
});

describe('interaction bank canonical diversity (both slots in key)', () => {
  it('has 18 distinct canonical start keys with lemon+honey state', () => {
    const keys = new Set(
      ALL_LEMON_HONEY_TEMPLATES.map((tpl) => {
        const { cups, constraints, floating, sinking } = instantiateForTest(tpl, PALETTE);
        return canonicalPuzzleKey(
          { cups, floatingIngredients: floating, sinkingIngredients: sinking },
          constraints,
        );
      }),
    );
    expect(keys.size).toBe(18);
  });
});

describe('interaction bank L3 coverage (joint moves)', () => {
  it('at least 6 templates contain a JOINT MOVE event; ids printed for the record', () => {
    const l3ids: string[] = [];
    for (const tpl of ALL_LEMON_HONEY_TEMPLATES) {
      const { cups, constraints, floating, sinking } = instantiateForTest(tpl, PALETTE);
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: floating,
        sinkingIngredients: sinking,
      });
      expect(solved.solvable).toBe(true);
      const trace = analyzeIngredientInteraction(
        cups,
        floating,
        sinking,
        solved.solution ?? [],
        constraints,
      );
      if (trace.jointMoveEvents >= 1) l3ids.push(tpl.id);
    }
    console.log(`[interaction-templates] L3 templates (jointMove>=1): ${l3ids.join(', ')}`);
    expect(l3ids.length).toBeGreaterThanOrEqual(6);
  }, 180000);
});
