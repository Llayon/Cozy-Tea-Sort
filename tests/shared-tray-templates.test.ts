/**
 * Gauntlet 16 — template bank validation (§§150-152).
 *
 * All 18: unique IDs, canonical-distinct initials, valid tray pair,
 * exact counts, mixed starts, P33 shape 3,3,4,4,2,0, recorded depth exact,
 * L2 (pressure → release → refill → win). Permutation robustness: reversed
 * role bijection stays L2 in-band. Offline L3/control report per template.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import type { SolverAction } from '../src/game/types';
import { canonicalPuzzleKey } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { analyzeSharedTrayParticipation } from '../src/game/logic/generator';
import { sharedControlReport } from './shared-tray-bank-shared';
import {
  ALL_SHARED_TRAY_TEMPLATES,
  SHARED_TRAY_DEPTH_ACCEPT,
  SHARED_TRAY_DEPTH_SWEET,
  instantiateSharedTrayTemplate,
} from '../src/game/logic/sharedTrayTemplates';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const REVERSED: TeaId[] = [...PALETTE].reverse();

function instantiateIdentity(tplId: string): { cups: TeaId[][]; tray: readonly [number, number] } {
  const tpl = ALL_SHARED_TRAY_TEMPLATES.find((t) => t.id === tplId);
  if (!tpl) throw new Error(`missing template ${tplId}`);
  const inst = instantiateSharedTrayTemplate(tpl, [...PALETTE]);
  return { cups: inst.cups, tray: inst.trayMembers };
}

function consWithTray(tray: readonly [number, number]): CupConstraint[] {
  return Array.from({ length: 6 }, (_, i) =>
    i === tray[0] || i === tray[1]
      ? ({ mode: 'normal', sharedCapacityGroup: 'tea-tray' } as CupConstraint)
      : ({ mode: 'normal' as const } as CupConstraint),
  );
}

describe('bank shape: 18 unique canonical-distinct L2 templates', () => {
  it('18 templates, unique IDs', () => {
    expect(ALL_SHARED_TRAY_TEMPLATES.length).toBe(18);
    expect(new Set(ALL_SHARED_TRAY_TEMPLATES.map((t) => t.id)).size).toBe(18);
  });

  it('all canonical-distinct initials (identity mapping)', () => {
    const keys = ALL_SHARED_TRAY_TEMPLATES.map((t) => {
      const { cups, tray } = instantiateIdentity(t.id);
      return canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, consWithTray(tray));
    });
    expect(new Set(keys).size).toBe(18);
  });

  it('exact counts, valid tray pair, mixed starts, shape 3,3,4,4,2,0', () => {
    for (const t of ALL_SHARED_TRAY_TEMPLATES) {
      const { cups, tray } = instantiateIdentity(t.id);
      expect(tray[0]).not.toBe(tray[1]);
      const lens = cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
      for (const tea of PALETTE) {
        expect(cups.flat().filter((x) => x === tea).length).toBe(4);
      }
      expect(cups.flat().filter((x) => x === 'black_tea' || x === 'milk' || x === 'milk_tea').length).toBe(0);
      for (const cup of cups) {
        if (cup.length > 0) expect(new Set(cup).size).toBeGreaterThanOrEqual(2);
      }
      expect((cups[tray[0]] as TeaId[]).length).toBe(3);
      expect((cups[tray[1]] as TeaId[]).length).toBe(3);
    }
  });
});

describe('recorded depth exact + L2 + win', () => {
  it.each(ALL_SHARED_TRAY_TEMPLATES.map((t) => [t.id] as [string]))('%s validates', (id) => {
    const tpl = ALL_SHARED_TRAY_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(id);
    const { cups, tray } = instantiateIdentity(id);
    const C = consWithTray(tray);
    const r = solvePuzzle(cups, { cupConstraints: C, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(tpl.depth);
    expect(r.minMoves).toBeGreaterThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.min);
    expect(r.minMoves).toBeLessThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.max);
    const part = analyzeSharedTrayParticipation(cups, (r.solution ?? []) as SolverAction[], C);
    expect(part.firstPressureDepth).not.toBe(null);
    expect(part.firstReleaseDepth).not.toBe(null);
    expect(part.firstRefillDepth).not.toBe(null);
    expect((part.firstPressureDepth as number) < (part.firstReleaseDepth as number)).toBe(true);
    expect((part.firstReleaseDepth as number) < (part.firstRefillDepth as number)).toBe(true);
    expect(part.win).toBe(true);
  });
});

describe('sweet band coverage', () => {
  it('majority in sweet 10–12', () => {
    const sweet = ALL_SHARED_TRAY_TEMPLATES.filter(
      (t) => t.depth >= SHARED_TRAY_DEPTH_SWEET.min && t.depth <= SHARED_TRAY_DEPTH_SWEET.max,
    ).length;
    expect(sweet).toBeGreaterThanOrEqual(12);
  });
});

describe('permutation robustness: reversed bijection stays L2 in band', () => {
  it.each(ALL_SHARED_TRAY_TEMPLATES.map((t) => [t.id] as [string]))('%s reversed roles L2', (id) => {
    const tpl = ALL_SHARED_TRAY_TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new Error(id);
    const inst = instantiateSharedTrayTemplate(tpl, REVERSED);
    const C = consWithTray(inst.trayMembers);
    const r = solvePuzzle(inst.cups, { cupConstraints: C, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBeGreaterThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.min);
    expect(r.minMoves).toBeLessThanOrEqual(SHARED_TRAY_DEPTH_ACCEPT.max);
    const part = analyzeSharedTrayParticipation(inst.cups, (r.solution ?? []) as SolverAction[], C);
    expect(part.firstPressureDepth).not.toBe(null);
    expect(part.firstReleaseDepth).not.toBe(null);
    expect(part.firstRefillDepth).not.toBe(null);
    expect((part.firstPressureDepth as number) < (part.firstReleaseDepth as number)).toBe(true);
    expect((part.firstReleaseDepth as number) < (part.firstRefillDepth as number)).toBe(true);
    expect(part.win).toBe(true);
  });
});

describe('L3 + control offline report', () => {
  it('reports plain/shared/delta/overload/L3 per template (prefers >=12 L3, >=8 L3A)', () => {
    let l3a = 0;
    let l3b = 0;
    let strong = 0;
    let union = 0;
    for (const t of ALL_SHARED_TRAY_TEMPLATES) {
      const { cups, tray } = instantiateIdentity(t.id);
      const C = consWithTray(tray);
      const r = solvePuzzle(cups, { cupConstraints: C, returnSolution: true });
      if (!r.solvable || !r.solution || r.minMoves === undefined) continue;
      const rep = sharedControlReport(cups, r.solution, C, r.minMoves);
      if (rep.l3a) l3a++;
      if (rep.l3b) l3b++;
      if (rep.l3a || rep.l3b) union++;
      if (rep.strong) strong++;
    }
    console.log(`shared bank L3A=${l3a}/18 L3B=${l3b}/18 union=${union}/18 strong=${strong}/18`);
    expect(union).toBeGreaterThanOrEqual(12);
    expect(l3a).toBeGreaterThanOrEqual(8);
  });
});
