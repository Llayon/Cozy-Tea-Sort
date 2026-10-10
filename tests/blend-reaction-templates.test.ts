/**
 * Gauntlet 13 — blend template bank validation (§§153-155).
 *
 * All 18: unique IDs, canonical-distinct initials, exact counts, no product
 * initially, mixed starts, recorded depth exact, 4 reactions, L2, recipe
 * final, win. Permutation robustness: every emitted production layout
 * (c0/c1 swap) remains L2 in band non-truncated. L3 offline report.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { defaultCupConstraints, emptyFloatingIngredients } from '../src/game/types';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { analyzeBlendParticipation } from '../src/game/logic/generator';
import {
  ALL_BLEND_TEMPLATES,
  BLEND_DEPTH_ACCEPT,
  BLEND_DEPTH_SWEET,
  instantiateBlendTemplate,
} from '../src/game/logic/blendTemplates';
import { MILK_TEA_BLEND_RECIPE, countTeaLayers } from '../src/game/logic/blendRecipe';

const R = MILK_TEA_BLEND_RECIPE;
const CONS6: CupConstraint[] = defaultCupConstraints(6);
// Deterministic production filler pair for bank validation (matcha/sea_buckthorn).
const C0: TeaId = 'matcha';
const C1: TeaId = 'sea_buckthorn';

function instantiate(tplId: string, c0: TeaId = C0, c1: TeaId = C1): TeaId[][] {
  const tpl = ALL_BLEND_TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) throw new Error(`missing template ${tplId}`);
  return instantiateBlendTemplate(tpl, c0, c1).cups;
}

describe('bank shape: 18 unique canonical-distinct L2 templates', () => {
  it('18 templates, unique IDs', () => {
    expect(ALL_BLEND_TEMPLATES.length).toBe(18);
    expect(new Set(ALL_BLEND_TEMPLATES.map((t) => t.id)).size).toBe(18);
  });

  it('all canonical-distinct initials (identity fillers)', () => {
    const keys = ALL_BLEND_TEMPLATES.map((t) => {
      const cups = instantiateBlendTemplate(t, C0, C1).cups;
      return canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, CONS6);
    });
    expect(new Set(keys).size).toBe(18);
  });

  it('exact counts, no product initially, mixed starts, shape 4,4,4,4,0,0', () => {
    for (const t of ALL_BLEND_TEMPLATES) {
      const cups = instantiateBlendTemplate(t, C0, C1).cups;
      const lens = cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 0, 4, 4, 4, 4]);
      expect(countTeaLayers(cups, 'black_tea')).toBe(4);
      expect(countTeaLayers(cups, 'milk')).toBe(4);
      expect(countTeaLayers(cups, 'milk_tea')).toBe(0);
      expect(countTeaLayers(cups, C0)).toBe(4);
      expect(countTeaLayers(cups, C1)).toBe(4);
      for (const cup of cups) {
        if (cup.length === 4) {
          expect(new Set(cup).size).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });
});

describe('recorded depth exact + 4 reactions + L2 + recipe final + win', () => {
  it.each(ALL_BLEND_TEMPLATES.map((t) => [t.id] as [string]))('%s validates', (id) => {
    const tpl = ALL_BLEND_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(id);
    const cups = instantiateBlendTemplate(tpl, C0, C1).cups;
    const r = solvePuzzle(cups, { cupConstraints: CONS6, blendRecipe: R });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(tpl.depth);
    expect(r.minMoves).toBeGreaterThanOrEqual(BLEND_DEPTH_ACCEPT.min);
    expect(r.minMoves).toBeLessThanOrEqual(BLEND_DEPTH_ACCEPT.max);
    const part = analyzeBlendParticipation(cups, (r.solution ?? []) as never, CONS6, R);
    expect(part.reactions).toBe(4);
    expect(part.recipeSatisfied).toBe(true);
    expect(part.win).toBe(true);
    // L2: interleaved + early first reaction.
    expect(part.ordinaryPoursBetweenFirstLastReaction).toBeGreaterThanOrEqual(1);
    expect(part.firstReactionDepth).not.toBe(null);
    expect((part.firstReactionDepth as number) / Math.max(1, r.minMoves as number)).toBeLessThanOrEqual(0.75);
  });
});

describe('sweet band coverage', () => {
  it('majority in sweet 12–14', () => {
    const sweet = ALL_BLEND_TEMPLATES.filter(
      (t) => t.depth >= BLEND_DEPTH_SWEET.min && t.depth <= BLEND_DEPTH_SWEET.max,
    ).length;
    expect(sweet).toBeGreaterThanOrEqual(12);
  });
});

describe('permutation robustness: c0/c1 swap stays L2 in band', () => {
  it.each(ALL_BLEND_TEMPLATES.map((t) => [t.id] as [string]))('%s swapped fillers L2', (id) => {
    const tpl = ALL_BLEND_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(id);
    // Swap order: c0↔c1 roles exchange fillers.
    const cups = instantiateBlendTemplate(tpl, C1, C0).cups;
    const r = solvePuzzle(cups, { cupConstraints: CONS6, blendRecipe: R });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBeGreaterThanOrEqual(BLEND_DEPTH_ACCEPT.min);
    expect(r.minMoves).toBeLessThanOrEqual(BLEND_DEPTH_ACCEPT.max);
    const part = analyzeBlendParticipation(cups, (r.solution ?? []) as never, CONS6, R);
    expect(part.reactions).toBe(4);
    expect(part.recipeSatisfied).toBe(true);
    expect(part.win).toBe(true);
    expect(part.ordinaryPoursBetweenFirstLastReaction).toBeGreaterThanOrEqual(1);
  });
});

describe('L3 offline report', () => {
  it('reports L3A/L3B/overlap/dests/orientation (prefers >=12 L3)', () => {
    let l3a = 0;
    let l3b = 0;
    let overlap = 0;
    const destHist: Record<string, number> = {};
    let atoB = 0;
    let btoA = 0;
    for (const t of ALL_BLEND_TEMPLATES) {
      const cups = instantiateBlendTemplate(t, C0, C1).cups;
      const r = solvePuzzle(cups, { cupConstraints: CONS6, blendRecipe: R });
      if (!r.solvable || !r.solution) continue;
      // Replay for product transfers + dests + orientation.
      let board = cups.map((c) => [...c]);
      let pTrans = 0;
      const dests = new Set<number>();
      for (const a of r.solution) {
        if ((a as { kind: string }).kind !== 'pour') continue;
        const res = applyPourState(
          { cups: board, floatingIngredients: emptyFloatingIngredients(6) },
          (a as { from: number }).from,
          (a as { to: number }).to,
          CONS6, R,
        );
        if (!res) break;
        board = res.state.cups as TeaId[][];
        if (res.reaction) {
          dests.add((a as { to: number }).to);
          if (res.reaction.sourceReactant === 'black_tea') atoB++;
          else btoA++;
        } else if (res.layer === 'milk_tea') pTrans++;
      }
      const hasP4 = board.some((c) => c.length === 4 && c.every((x) => x === 'milk_tea'));
      const isA = pTrans >= 1;
      const isB = dests.size >= 2 && hasP4;
      if (isA) l3a++;
      if (isB) l3b++;
      if (isA && isB) overlap++;
      destHist[String(dests.size)] = (destHist[String(dests.size)] ?? 0) + 1;
    }
    console.log(`blend bank L3A=${l3a}/18 L3B=${l3b}/18 overlap=${overlap} dests=${JSON.stringify(destHist)} black→milk=${atoB} milk→black=${btoA}`);
    expect(l3a + l3b).toBeGreaterThan(0);
    expect(l3a).toBeGreaterThanOrEqual(12);
  });
});
