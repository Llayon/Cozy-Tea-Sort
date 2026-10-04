/**
 * Gauntlet 7 §62–63, §100 — sinking-honey template-bank validation.
 *
 * EVERY committed template: instantiate (identity order, c0 → buckwheat) →
 * constraints → production solver WITH honey (recorded depth, stay + move
 * participation) + WITHOUT honey (absent — still solvable: honey is an
 * additional goal, NOT a rescue) → analyzeHoneyParticipation + full
 * applySolutionState replay proving the final honey host. Plus palette
 * isomorphism invariance, canonical distinctness (honey slots in key),
 * and depth-span coverage per kind.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState, SinkingIngredientSlot, TeaId } from '../src/game/types';
import {
  defaultCupConstraints,
  emptyFloatingIngredients,
  type CupConstraint,
} from '../src/game/types';
import {
  canonicalPuzzleKey,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeHoneyParticipation,
  selectMysteryCup,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  ALL_HONEY_TEMPLATES,
  HONEY_DEPTH_ACCEPT,
  HONEY_DEPTH_SWEET,
  HONEY_TARGET_TEA,
  HONEY_TEMPLATE_BANK,
  HONEY_TEMPLATE_SPECS,
  instantiateHoneyTemplate,
  type HoneyTemplate,
  type HoneyTemplateKind,
} from '../src/game/logic/honeyTemplates';

const BW: TeaId = 'buckwheat';
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';
const L: TeaId = 'lavender';

const PALETTE_4: TeaId[] = [BW, M, K, O];
const PALETTE_5: TeaId[] = [BW, M, K, O, L];

function paletteFor(kind: HoneyTemplateKind): TeaId[] {
  return kind === 'honey-mystery-peak' ? PALETTE_5 : PALETTE_4;
}

function instantiateForTest(
  tpl: HoneyTemplate,
  palette: TeaId[],
  otherOrder?: TeaId[],
): {
  cups: TeaId[][];
  constraints: CupConstraint[];
  sinkSlots: SinkingIngredientSlot[];
  hiddenCounts: number[];
} {
  const others = otherOrder ?? palette.filter((t) => t !== HONEY_TARGET_TEA);
  const inst = instantiateHoneyTemplate(tpl, palette, [...others]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  const sinkSlots = inst.cups.map(() => null) as SinkingIngredientSlot[];
  sinkSlots[inst.honeyHost] = 'honey';
  const hiddenCounts = inst.cups.map(() => 0);
  if (HONEY_TEMPLATE_SPECS[tpl.kind].hasMysteryLayer) {
    const idx = selectMysteryCup(
      inst.cups,
      (cands) => {
        const eligible = cands.filter((c) => c !== inst.honeyHost);
        return eligible[0] ?? null;
      },
      constraints,
    );
    expect(idx).not.toBe(null);
    expect(idx).not.toBe(inst.honeyHost);
    hiddenCounts[idx as number] = 1;
  }
  return { cups: inst.cups, constraints, sinkSlots, hiddenCounts };
}

function requestFor(kind: HoneyTemplateKind, palette: TeaId[]): GenerateRequest {
  const spec = HONEY_TEMPLATE_SPECS[kind];
  return {
    numColors: spec.numColors,
    colors: palette,
    emptyCups: spec.emptyCups,
    hasMysteryLayer: spec.hasMysteryLayer,
    phase: (spec.numColors === 5 ? 'peak' : 'challenge') as 'peak' | 'challenge',
    sourceOnlyCount: spec.sourceOnlyCount,
    sinkingIngredient: 'honey',
  };
}

describe('honey template bank shape', () => {
  it('has 18 templates per kind (54 total)', () => {
    expect(HONEY_TEMPLATE_BANK['honey-challenge']).toHaveLength(18);
    expect(HONEY_TEMPLATE_BANK['honey-mystery-peak']).toHaveLength(18);
    expect(HONEY_TEMPLATE_BANK['teapot-honey-challenge']).toHaveLength(18);
    expect(ALL_HONEY_TEMPLATES).toHaveLength(54);
  });

  it('ids unique; kinds correct', () => {
    const ids = new Set(ALL_HONEY_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(54);
    for (const kind of Object.keys(HONEY_TEMPLATE_BANK) as HoneyTemplateKind[]) {
      for (const tpl of HONEY_TEMPLATE_BANK[kind]) {
        expect(tpl.kind).toBe(kind);
        expect(tpl.id.startsWith(`${kind}-`)).toBe(true);
      }
    }
  });

  it('every template matches its tight topology contract', () => {
    for (const kind of Object.keys(HONEY_TEMPLATE_BANK) as HoneyTemplateKind[]) {
      const spec = HONEY_TEMPLATE_SPECS[kind];
      for (const tpl of HONEY_TEMPLATE_BANK[kind]) {
        // Cups length matches spec (6 plain/teapot, 7 peak).
        expect(tpl.cups.length).toBe(spec.numColors + spec.emptyCups);
        if (kind === 'honey-mystery-peak') expect(tpl.cups.length).toBe(7);
        else expect(tpl.cups.length).toBe(6);
        // Exactly 2 empties (loose G7 topology).
        expect(tpl.cups.filter((c) => c.length === 0)).toHaveLength(2);
        // Tea units 4/color over the role set.
        const roleCounts = new Map<string, number>();
        tpl.cups.forEach((cup) => cup.forEach((r) => roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1)));
        const roles = kind === 'honey-mystery-peak' ? ['c0', 'c1', 'c2', 'c3', 'c4'] : ['c0', 'c1', 'c2', 'c3'];
        for (const r of roles) expect(roleCounts.get(r)).toBe(4);
        // Teapot slot 0 (full mixed) only for the teapot kind, hosting honey.
        if (kind === 'teapot-honey-challenge') {
          expect(tpl.teapot).toBe(0);
          expect(tpl.honeyHost).toBe(0);
          expect(tpl.cups[0]?.length).toBe(4);
          expect(new Set(tpl.cups[0]).size).toBeGreaterThan(1);
        } else {
          expect(tpl.teapot).toBe(null);
          // Plain/mystery honey host is a filled mixed cup.
          const host = tpl.cups[tpl.honeyHost];
          expect(host?.length).toBe(4);
          expect(new Set(host).size).toBeGreaterThan(1);
        }
      }
    }
  });

  it('recorded depths sit in the accept bands (mostly sweet)', () => {
    for (const kind of Object.keys(HONEY_TEMPLATE_BANK) as HoneyTemplateKind[]) {
      for (const tpl of HONEY_TEMPLATE_BANK[kind]) {
        const accept = HONEY_DEPTH_ACCEPT[kind];
        expect(tpl.depth).toBeGreaterThanOrEqual(accept.min);
        expect(tpl.depth).toBeLessThanOrEqual(accept.max);
      }
      const sweet = HONEY_DEPTH_SWEET[kind];
      const inSweet = HONEY_TEMPLATE_BANK[kind].filter(
        (t) => t.depth >= sweet.min && t.depth <= sweet.max,
      ).length;
      expect(inSweet).toBeGreaterThanOrEqual(14);
    }
  });

  it('depth spans cover the sweet bands per kind', () => {
    const depths = (kind: HoneyTemplateKind) =>
      HONEY_TEMPLATE_BANK[kind].map((t) => t.depth).sort((a, b) => a - b);
    const plain = depths('honey-challenge');
    expect(Math.min(...plain)).toBeLessThanOrEqual(11);
    expect(Math.max(...plain)).toBeGreaterThanOrEqual(13);
    const peak = depths('honey-mystery-peak');
    expect(Math.min(...peak)).toBeLessThanOrEqual(15);
    expect(Math.max(...peak)).toBeGreaterThanOrEqual(17);
    const teapot = depths('teapot-honey-challenge');
    expect(Math.min(...teapot)).toBeLessThanOrEqual(11);
    expect(Math.max(...teapot)).toBeGreaterThanOrEqual(13);
  });
});

describe.each([
  ['honey-challenge', PALETTE_4],
  ['honey-mystery-peak', PALETTE_5],
  ['teapot-honey-challenge', PALETTE_4],
] as Array<[HoneyTemplateKind, TeaId[]]>)('template validation: %s', (kind, palette) => {
  it('every template instantiates to a participating level with recorded depth', () => {
    const req = requestFor(kind, palette);
    const accept = HONEY_DEPTH_ACCEPT[kind];
    const sweet = HONEY_DEPTH_SWEET[kind];
    let sweetCount = 0;
    for (const tpl of HONEY_TEMPLATE_BANK[kind]) {
      const { cups, constraints, sinkSlots, hiddenCounts } = instantiateForTest(tpl, palette);
      // Structural contract.
      expect(cups.length).toBe(req.numColors + req.emptyCups);
      expect(cups.filter((c) => c.length === 0)).toHaveLength(2);
      const counts = new Map<string, number>();
      cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      palette.forEach((c) => expect(counts.get(c)).toBe(4));
      expect(sinkSlots.filter((s) => s === 'honey')).toHaveLength(1);
      if (kind === 'teapot-honey-challenge') {
        expect(constraints[0]?.mode).toBe('source-only');
        expect(sinkSlots[0]).toBe('honey');
        expect((cups[0] as TeaId[]).length).toBe(4);
      } else {
        expect(constraints.some((c) => c.mode === 'source-only')).toBe(false);
        const host = sinkSlots.findIndex((s) => s === 'honey');
        expect((cups[host] as TeaId[]).length).toBe(4);
        expect(new Set(cups[host]).size).toBeGreaterThan(1);
      }
      // WITH honey: solvable, non-truncated, recorded depth, in-band.
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: emptyFloatingIngredients(cups.length),
        sinkingIngredients: sinkSlots,
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
      expect(solved.minMoves as number).toBeGreaterThanOrEqual(accept.min);
      expect(solved.minMoves as number).toBeLessThanOrEqual(accept.max);
      if ((solved.minMoves as number) >= sweet.min && (solved.minMoves as number) <= sweet.max) {
        sweetCount++;
      }
      // WITHOUT honey (absent): still solvable — honey is a goal, NOT a rescue.
      const wo = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: emptyFloatingIngredients(cups.length),
      });
      expect(wo.solvable).toBe(true);
      expect(wo.truncated).not.toBe(true);
      // Full structure validator passes (production gate shape).
      const level = {
        cups,
        hiddenCounts,
        cupConstraints: constraints,
        floatingIngredients: emptyFloatingIngredients(cups.length),
        sinkingIngredients: sinkSlots,
        seed: `tpl:${tpl.id}`,
        minMoves: solved.minMoves as number,
        visitedStates: solved.visitedStates,
      };
      expect(validateLevelStructure(level, req).ok).toBe(true);
      // Participation: stay >= 1 AND move >= 1 on the optimal path.
      const solution = solved.solution ?? [];
      const part = analyzeHoneyParticipation(cups, sinkSlots, solution, constraints);
      expect(part.stays).toBeGreaterThanOrEqual(1);
      expect(part.moves).toBeGreaterThanOrEqual(1);
      // Full replay wins with honey under full homogeneous buckwheat.
      const final = applySolutionState(
        {
          cups,
          floatingIngredients: emptyFloatingIngredients(cups.length),
          sinkingIngredients: sinkSlots,
        },
        solution,
        constraints,
      );
      expect(final).not.toBe(null);
      expect(isPuzzleWonState(final as PuzzleState, constraints)).toBe(true);
      const honeyIdx = (final as PuzzleState).sinkingIngredients.findIndex((s) => s === 'honey');
      expect(honeyIdx).toBeGreaterThanOrEqual(0);
      expect((final as PuzzleState).cups[honeyIdx]).toEqual([BW, BW, BW, BW]);
      expect(
        sinkingIngredientHostSatisfied(
          'honey',
          (final as PuzzleState).cups[honeyIdx] as TeaId[],
          constraints[honeyIdx],
        ),
      ).toBe(true);
    }
    // Mostly sweet: the committed bank lives in the sweet band.
    expect(sweetCount).toBeGreaterThanOrEqual(14);
  }, 180000);

  it('alternate otherOrder permutation preserves depth exactly (non-target isomorphism)', () => {
    const pal = paletteFor(kind);
    const others = pal.filter((t) => t !== HONEY_TARGET_TEA);
    const permuted = [...others].reverse();
    expect(permuted).not.toEqual(others);
    for (const tpl of HONEY_TEMPLATE_BANK[kind]) {
      const { cups, constraints, sinkSlots } = instantiateForTest(tpl, pal, permuted);
      // c0 fixation check: every template c0 role became buckwheat.
      const flatRoles = tpl.cups.flat();
      const flatTeas = cups.flat();
      flatRoles.forEach((role, i) => {
        if (role === 'c0') expect(flatTeas[i]).toBe(BW);
      });
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: emptyFloatingIngredients(cups.length),
        sinkingIngredients: sinkSlots,
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  }, 180000);
});

describe('honey bank canonical diversity (honey slots in key)', () => {
  it('each kind has 18 distinct canonical start keys with honey state', () => {
    for (const kind of Object.keys(HONEY_TEMPLATE_BANK) as HoneyTemplateKind[]) {
      const palette = paletteFor(kind);
      const keys = new Set(
        HONEY_TEMPLATE_BANK[kind].map((tpl) => {
          const { cups, constraints, sinkSlots } = instantiateForTest(tpl, palette);
          return canonicalPuzzleKey(
            {
              cups,
              floatingIngredients: emptyFloatingIngredients(cups.length),
              sinkingIngredients: sinkSlots,
            },
            constraints,
          );
        }),
      );
      expect(keys.size).toBe(18);
    }
  });
});
