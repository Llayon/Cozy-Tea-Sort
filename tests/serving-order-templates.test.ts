/**
 * Gauntlet 14 — template bank validation (§§143-144).
 *
 * All 18: unique IDs, canonical-distinct initials, valid O1/O2, exact
 * counts, mixed starts, recorded depth exact, L2 (pressure → serve1 →
 * serve2 → win), prefix 2, win. Permutation robustness: reversed role
 * bijection stays L2 in-band. Offline L3/control report per template.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import type { SolverAction } from '../src/game/types';
import { canonicalPuzzleKey } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeServingOrderParticipation,
} from '../src/game/logic/generator';
import { controlReport } from './serving-order-bank-shared';
import {
  ALL_SERVING_ORDER_TEMPLATES,
  SERVING_ORDER_DEPTH_ACCEPT,
  SERVING_ORDER_DEPTH_SWEET,
  instantiateServingOrderTemplate,
} from '../src/game/logic/servingOrderTemplates';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const REVERSED: TeaId[] = [...PALETTE].reverse();

function instantiateIdentity(tplId: string): { cups: TeaId[][]; h1: number; h2: number } {
  const tpl = ALL_SERVING_ORDER_TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) throw new Error(`missing template ${tplId}`);
  const inst = instantiateServingOrderTemplate(tpl, [...PALETTE]);
  return { cups: inst.cups, h1: inst.serve1Index, h2: inst.serve2Index };
}

function consWithHosts(h1: number, h2: number): CupConstraint[] {
  return Array.from({ length: 6 }, (_, i) => (
    i === h1 ? { mode: 'normal', serveOrder: 1 }
    : i === h2 ? { mode: 'normal', serveOrder: 2 }
    : { mode: 'normal' as const }
  )) as CupConstraint[];
}

describe('bank shape: 18 unique canonical-distinct L2 templates', () => {
  it('18 templates, unique IDs', () => {
    expect(ALL_SERVING_ORDER_TEMPLATES.length).toBe(18);
    expect(new Set(ALL_SERVING_ORDER_TEMPLATES.map((t) => t.id)).size).toBe(18);
  });

  it('all canonical-distinct initials (identity mapping)', () => {
    const keys = ALL_SERVING_ORDER_TEMPLATES.map((t) => {
      const { cups, h1, h2 } = instantiateIdentity(t.id);
      return canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, consWithHosts(h1, h2));
    });
    expect(new Set(keys).size).toBe(18);
  });

  it('exact counts, valid O1/O2, mixed starts, shape 4,4,4,4,0,0', () => {
    for (const t of ALL_SERVING_ORDER_TEMPLATES) {
      const { cups, h1, h2 } = instantiateIdentity(t.id);
      expect(h1).not.toBe(h2);
      const lens = cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 0, 4, 4, 4, 4]);
      for (const tea of PALETTE) {
        expect(cups.flat().filter((x) => x === tea).length).toBe(4);
      }
      expect(cups.flat().filter((x) => x === 'black_tea' || x === 'milk' || x === 'milk_tea').length).toBe(0);
      for (const cup of cups) {
        if (cup.length === 4) expect(new Set(cup).size).toBeGreaterThanOrEqual(2);
      }
      expect(cups[h1 as number]?.length).toBe(4);
      expect(cups[h2 as number]?.length).toBe(4);
    }
  });
});

describe('recorded depth exact + L2 + prefix2 + win', () => {
  it.each(ALL_SERVING_ORDER_TEMPLATES.map((t) => [t.id] as [string]))('%s validates', (id) => {
    const tpl = ALL_SERVING_ORDER_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(id);
    const { cups, h1, h2 } = instantiateIdentity(id);
    const C = consWithHosts(h1, h2);
    const r = solvePuzzle(cups, { cupConstraints: C, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(tpl.depth);
    expect(r.minMoves).toBeGreaterThanOrEqual(SERVING_ORDER_DEPTH_ACCEPT.min);
    expect(r.minMoves).toBeLessThanOrEqual(SERVING_ORDER_DEPTH_ACCEPT.max);
    const part = analyzeServingOrderParticipation(cups, (r.solution ?? []) as SolverAction[], C);
    expect(part.serve1Depth).not.toBe(null);
    expect(part.serve2Depth).not.toBe(null);
    expect(part.firstPressureDepth).not.toBe(null);
    expect((part.firstPressureDepth as number) < (part.serve1Depth as number)).toBe(true);
    expect((part.serve1Depth as number) < (part.serve2Depth as number)).toBe(true);
    expect(part.servedPrefixFinal).toBe(2);
    expect(part.win).toBe(true);
  });
});

describe('sweet band coverage', () => {
  it('majority in sweet 11–13', () => {
    const sweet = ALL_SERVING_ORDER_TEMPLATES.filter(
      (t) => t.depth >= SERVING_ORDER_DEPTH_SWEET.min && t.depth <= SERVING_ORDER_DEPTH_SWEET.max,
    ).length;
    expect(sweet).toBeGreaterThanOrEqual(12);
  });
});

describe('permutation robustness: reversed bijection stays L2 in band', () => {
  it.each(ALL_SERVING_ORDER_TEMPLATES.map((t) => [t.id] as [string]))('%s reversed roles L2', (id) => {
    const tpl = ALL_SERVING_ORDER_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(id);
    const inst = instantiateServingOrderTemplate(tpl, REVERSED);
    const C = consWithHosts(inst.serve1Index, inst.serve2Index);
    const r = solvePuzzle(inst.cups, { cupConstraints: C, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBeGreaterThanOrEqual(SERVING_ORDER_DEPTH_ACCEPT.min);
    expect(r.minMoves).toBeLessThanOrEqual(SERVING_ORDER_DEPTH_ACCEPT.max);
    const part = analyzeServingOrderParticipation(inst.cups, (r.solution ?? []) as SolverAction[], C);
    expect(part.serve1Depth).not.toBe(null);
    expect(part.serve2Depth).not.toBe(null);
    expect(part.firstPressureDepth).not.toBe(null);
    expect((part.firstPressureDepth as number) < (part.serve1Depth as number)).toBe(true);
    expect(part.servedPrefixFinal).toBe(2);
    expect(part.win).toBe(true);
  });
});

describe('L3 + control offline report', () => {
  it('reports plain/ordered/delta/reverses/L3 per template (prefers >=10 L3)', () => {
    let l3a = 0;
    let l3b = 0;
    let strong = 0;
    let union = 0;
    for (const t of ALL_SERVING_ORDER_TEMPLATES) {
      const { cups, h1, h2 } = instantiateIdentity(t.id);
      const C = consWithHosts(h1, h2);
      const r = solvePuzzle(cups, { cupConstraints: C, returnSolution: true });
      if (!r.solvable || !r.solution || r.minMoves === undefined) continue;
      const rep = controlReport(cups, r.solution, C, h1, h2, r.minMoves);
      if (rep.l3a) l3a++;
      if (rep.l3b) l3b++;
      if (rep.l3a || rep.l3b) union++;
      if (rep.strong) strong++;
    }
    console.log(`serving bank L3A=${l3a}/18 L3B=${l3b}/18 union=${union}/18 strong=${strong}/18`);
    expect(union).toBeGreaterThanOrEqual(10);
  });
});
