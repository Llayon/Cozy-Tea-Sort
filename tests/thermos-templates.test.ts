/**
 * Gauntlet 10 — thermos template-bank validation (§§110-122).
 *
 * EVERY committed template: instantiate (identity order) → normal
 * constraints + cap5/mustEndEmpty on the thermos host → production solver
 * (recorded depth exact, in the 9–13 accept band, L2: fifth-slot use AND
 * later drain AND final empty AND win) → full applySolutionState replay.
 * Plus otherOrder isomorphism invariance, canonical distinctness, unit
 * counts, the T3 profile (len3, mixed, top-once), the exact 4,4,3,3,2,0
 * start shape, and the depth-band coverage.
 *
 * L3/Strong counts are reported OFFLINE here (cap4 control solves inside
 * this test only). Production runtime never solves a cap4 control — the
 * fast path performs exactly one production solve per attempt (see
 * thermos-fastpath: solverCalls 1 happy path).
 */
import { describe, expect, it } from 'vitest';
import {
  THERMOS_CAPACITY,
  defaultCupConstraints,
  emptyFloatingIngredients,
  isThermosCupConstraint,
  type CupConstraint,
  type PuzzleState,
  type SolverAction,
  type TeaId,
} from '../src/game/types';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { analyzeThermosParticipation } from '../src/game/logic/generator';
import {
  ALL_THERMOS_TEMPLATES,
  THERMOS_DEPTH_ACCEPT,
  THERMOS_DEPTH_SWEET,
  THERMOS_TEMPLATE_BANK,
  instantiateThermosTemplate,
  type ThermosTemplate,
} from '../src/game/logic/thermosTemplates';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function instantiateForTest(
  tpl: ThermosTemplate,
  order?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[] } {
  const inst = instantiateThermosTemplate(tpl, PALETTE, order ?? [...PALETTE]);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.thermosSlot] = { mode: 'normal', capacity: THERMOS_CAPACITY, mustEndEmpty: true };
  return { cups: inst.cups, constraints };
}

function thermosHostOf(constraints: CupConstraint[]): number {
  return constraints.findIndex((c) => isThermosCupConstraint(c));
}

describe('bank shape: 18 unique ids, one kind, stable T3 host', () => {
  it('exactly 18 templates with unique ids', () => {
    expect(ALL_THERMOS_TEMPLATES).toHaveLength(18);
    const ids = ALL_THERMOS_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(18);
    for (const t of ALL_THERMOS_TEMPLATES) {
      expect(t.kind).toBe('thermos');
      expect(t.thermosIndex).toBe(5);
    }
    expect(THERMOS_TEMPLATE_BANK['thermos']).toHaveLength(18);
  });

  it('every template has the exact 4,4,3,2,0,+T3 shape with a mixed top-once thermos', () => {
    for (const tpl of ALL_THERMOS_TEMPLATES) {
      const lens = tpl.cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
      const host = tpl.cups[tpl.thermosIndex] as string[];
      expect(host).toHaveLength(3);
      expect(new Set(host).size).toBeGreaterThan(1);
      const top = host[host.length - 1] as string;
      expect(host.filter((t) => t === top)).toHaveLength(1);
    }
  });
});

describe('every template instantiates to an L2 level at its recorded depth', () => {
  it.each(ALL_THERMOS_TEMPLATES.map((t) => [t.id] as [string]))('%s', (id) => {
    const tpl = ALL_THERMOS_TEMPLATES.find((t) => t.id === id) as ThermosTemplate;
    const { cups, constraints } = instantiateForTest(tpl);
    // Correct tea units: 4 per color.
    const counts = new Map<string, number>();
    cups.flat().forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    for (const tea of PALETTE) expect(counts.get(tea)).toBe(4);
    // Exactly one true empty normal vessel beside the thermos.
    expect(cups.filter((c) => c.length === 0)).toHaveLength(1);
    const host = thermosHostOf(constraints);
    expect(host).toBe(5);
    const hostCup = cups[host] as TeaId[];
    expect(hostCup).toHaveLength(3);
    expect(new Set(hostCup).size).toBeGreaterThan(1);
    expect(hostCup.filter((t) => t === hostCup[hostCup.length - 1]).length).toBe(1);
    expect(constraints[host]?.targetTeaId).toBe(undefined);
    const solved = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: emptyFloatingIngredients(cups.length),
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(tpl.depth);
    expect(solved.minMoves).toBeGreaterThanOrEqual(THERMOS_DEPTH_ACCEPT.min);
    expect(solved.minMoves).toBeLessThanOrEqual(THERMOS_DEPTH_ACCEPT.max);
    const part = analyzeThermosParticipation(
      cups,
      host,
      (solved.solution ?? []) as SolverAction[],
      constraints,
    );
    expect(part.fifthSlotUses).toBeGreaterThanOrEqual(1);
    expect(part.drainsAfterFifth).toBeGreaterThanOrEqual(1);
    expect(part.finalThermosEmpty).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
      solved.solution ?? [],
      constraints,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as PuzzleState, constraints)).toBe(true);
    expect((fin as PuzzleState).cups[host]).toEqual([]);
  }, 60000);
});

describe('otherOrder isomorphism preserves depth exactly', () => {
  it('a reversed role order keeps every recorded depth', () => {
    const reversed = [...PALETTE].reverse();
    for (const tpl of ALL_THERMOS_TEMPLATES) {
      const { cups, constraints } = instantiateForTest(tpl, reversed);
      const solved = solvePuzzle(cups, {
        maxVisited: 120_000,
        cupConstraints: constraints,
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated ?? false).toBe(false);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  }, 180000);
});

describe('bank canonical diversity + depth spread', () => {
  it('18/18 canonical-distinct starts', () => {
    const keys = new Set<string>();
    for (const tpl of ALL_THERMOS_TEMPLATES) {
      const { cups, constraints } = instantiateForTest(tpl);
      const key = canonicalPuzzleKey(
        { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
        constraints,
      );
      expect(key).toContain('C5:E');
      keys.add(key);
    }
    expect(keys.size).toBe(18);
  });

  it('depths span 9–13 with a sweet 10–12 core', () => {
    const depths = ALL_THERMOS_TEMPLATES.map((t) => t.depth).sort((a, b) => a - b);
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(THERMOS_DEPTH_ACCEPT.min);
    expect(Math.max(...depths)).toBeLessThanOrEqual(THERMOS_DEPTH_ACCEPT.max);
    expect(depths.filter((d) => d >= THERMOS_DEPTH_SWEET.min && d <= THERMOS_DEPTH_SWEET.max).length)
      .toBeGreaterThanOrEqual(12);
    expect(depths).toContain(9);
    expect(depths).toContain(13);
  });
});

describe('offline L3/Strong report (cap4 control; NEVER on the runtime path)', () => {
  it('reports L3 (strictly longer under cap4) and Strong counts; bank is 17/18 L3', () => {
    let l3 = 0;
    let strong = 0;
    const deltas: number[] = [];
    for (const tpl of ALL_THERMOS_TEMPLATES) {
      const { cups, constraints } = instantiateForTest(tpl);
      const solved = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints });
      expect(solved.solvable).toBe(true);
      const host = thermosHostOf(constraints);
      const cons4 = constraints.map((c, i) =>
        i === host ? { mode: 'normal' as const, capacity: 4, mustEndEmpty: true } : c,
      );
      const rc = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: cons4 });
      expect(rc.truncated ?? false).toBe(false);
      if (!rc.solvable) {
        l3++;
        strong++;
      } else if ((rc.minMoves as number) > (solved.minMoves as number)) {
        l3++;
        deltas.push((rc.minMoves as number) - (solved.minMoves as number));
        if ((rc.minMoves as number) >= (solved.minMoves as number) + 2) strong++;
      } else {
        deltas.push((rc.minMoves as number) - (solved.minMoves as number));
      }
    }
    console.log(`thermos offline L3: ${l3}/18 strong=${strong} deltas=[${deltas.join(',')}]`);
    expect(l3).toBe(17);
    expect(strong).toBe(0);
  }, 240000);
});
