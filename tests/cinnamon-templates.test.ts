/**
 * Gauntlet 11 — cinnamon template-bank validation (§§103-109, GI–HA).
 *
 * EVERY committed template: instantiate (identity order) → all-normal
 * constraints + active cinnamon on the template host → production solver
 * WITH obstacle (recorded depth exact, in the 9–13 accept band, L2:
 * unlock AND expanded use AND cleared obstacle AND win) → full
 * applySolutionState replay. Plus otherOrder isomorphism invariance,
 * canonical distinctness (cap marker in key), unit counts, the exact
 * 4,4,3,3,2,0 start shape with a mixed len-2 host, host spread
 * 5,0,2,4,1,3, and the depth-band coverage.
 *
 * L3/Strong counts are reported OFFLINE here (plain-control solves inside
 * this test only). Production runtime never solves a plain control — the
 * fast path performs exactly one production solve per attempt (see
 * cinnamon-fastpath: solverCalls 1 happy path).
 */
import { describe, expect, it } from 'vitest';
import {
  defaultCupConstraints,
  emptyCapacityObstacles,
  emptyFloatingIngredients,
  type CapacityObstacleSlot,
  type CupConstraint,
  type PuzzleState,
  type SolverAction,
  type TeaId,
} from '../src/game/types';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { analyzeCinnamonParticipation } from '../src/game/logic/generator';
import {
  ALL_CINNAMON_TEMPLATES,
  CINNAMON_DEPTH_ACCEPT,
  CINNAMON_DEPTH_SWEET,
  CINNAMON_TEMPLATE_BANK,
  instantiateCinnamonTemplate,
  type CinnamonTemplate,
} from '../src/game/logic/cinnamonTemplates';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function instantiateForTest(
  tpl: CinnamonTemplate,
  order?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[]; obstacles: CapacityObstacleSlot[] } {
  const inst = instantiateCinnamonTemplate(tpl, PALETTE, order ?? [...PALETTE]);
  const constraints = defaultCupConstraints(inst.cups.length);
  const obstacles = emptyCapacityObstacles(inst.cups.length);
  obstacles[inst.cinnamonHost] = 'cinnamon';
  return { cups: inst.cups, constraints, obstacles };
}

function cinnamonHostOf(obstacles: CapacityObstacleSlot[]): number {
  return obstacles.findIndex((s) => s === 'cinnamon');
}

describe('bank shape: 18 unique ids, one kind, hosts spread 5,0,2,4,1,3', () => {
  it('exactly 18 templates with unique ids and kind cinnamon', () => {
    expect(ALL_CINNAMON_TEMPLATES).toHaveLength(18);
    const ids = ALL_CINNAMON_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(18);
    for (const t of ALL_CINNAMON_TEMPLATES) {
      expect(t.kind).toBe('cinnamon');
    }
    expect(CINNAMON_TEMPLATE_BANK['cinnamon']).toHaveLength(18);
  });

  it('hosts spread across 5,0,2,4,1,3 (each exactly 3 times)', () => {
    const counts = new Map<number, number>();
    for (const t of ALL_CINNAMON_TEMPLATES) {
      counts.set(t.cinnamonHost, (counts.get(t.cinnamonHost) ?? 0) + 1);
      expect(t.cinnamonHost).toBeGreaterThanOrEqual(0);
      expect(t.cinnamonHost).toBeLessThan(6);
    }
    for (const h of [0, 1, 2, 3, 4, 5]) {
      expect(counts.get(h)).toBe(3);
    }
  });

  it('depths are 9,9,10x4,11x6,12x4,13x2', () => {
    const depths = ALL_CINNAMON_TEMPLATES.map((t) => t.depth).sort((a, b) => a - b);
    expect(depths).toEqual([9, 9, 10, 10, 10, 10, 11, 11, 11, 11, 11, 11, 12, 12, 12, 12, 13, 13]);
  });

  it('every template has the exact 4,4,3,3,2,0 multiset with a mixed len-2 host', () => {
    for (const tpl of ALL_CINNAMON_TEMPLATES) {
      const lens = tpl.cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
      const host = tpl.cups[tpl.cinnamonHost] as string[];
      expect(host).toHaveLength(2);
      expect(host[0]).not.toBe(host[1]);
      expect(new Set(host).size).toBe(2);
    }
  });
});

describe('every template instantiates to an L2 level at its recorded depth', () => {
  it.each(ALL_CINNAMON_TEMPLATES.map((t) => [t.id] as [string]))('%s', (id) => {
    const tpl = ALL_CINNAMON_TEMPLATES.find((t) => t.id === id) as CinnamonTemplate;
    const { cups, constraints, obstacles } = instantiateForTest(tpl);
    // Correct tea units: 4 per color.
    const counts = new Map<string, number>();
    cups.flat().forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    for (const tea of PALETTE) expect(counts.get(tea)).toBe(4);
    // Exactly one true empty normal vessel beside the host.
    expect(cups.filter((c) => c.length === 0)).toHaveLength(1);
    const host = cinnamonHostOf(obstacles);
    expect(host).toBe(tpl.cinnamonHost);
    const hostCup = cups[host] as TeaId[];
    expect(hostCup).toHaveLength(2);
    expect(hostCup[0]).not.toBe(hostCup[1]);
    expect(constraints[host]?.mode).toBe('normal');
    expect(constraints[host]?.targetTeaId).toBe(undefined);
    const solved = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: emptyFloatingIngredients(cups.length),
      capacityObstacles: [...obstacles],
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(tpl.depth);
    expect(solved.minMoves).toBeGreaterThanOrEqual(CINNAMON_DEPTH_ACCEPT.min);
    expect(solved.minMoves).toBeLessThanOrEqual(CINNAMON_DEPTH_ACCEPT.max);
    const part = analyzeCinnamonParticipation(
      cups,
      [...obstacles],
      host,
      (solved.solution ?? []) as SolverAction[],
      constraints,
    );
    expect(part.unlocks).toBeGreaterThanOrEqual(1);
    expect(part.firstExpandedUseDepth).not.toBe(null);
    expect(part.expandedUses).toBeGreaterThanOrEqual(1);
    expect(part.maxPostUnlockOccupancy).toBeGreaterThanOrEqual(3);
    expect(part.finalObstacleCleared).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...obstacles] },
      solved.solution ?? [],
      constraints,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as PuzzleState, constraints)).toBe(true);
    expect((fin as PuzzleState).capacityObstacles.every((s) => s === null)).toBe(true);
  }, 60000);
});

describe('otherOrder isomorphism preserves depth exactly', () => {
  it('a reversed role order keeps every recorded depth', () => {
    const reversed = [...PALETTE].reverse();
    for (const tpl of ALL_CINNAMON_TEMPLATES) {
      const { cups, constraints, obstacles } = instantiateForTest(tpl, reversed);
      const solved = solvePuzzle(cups, {
        maxVisited: 120_000,
        cupConstraints: constraints,
        capacityObstacles: [...obstacles],
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated ?? false).toBe(false);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  }, 180000);
});

describe('bank canonical diversity + depth spread', () => {
  it('18/18 canonical-distinct starts (cap marker in key)', () => {
    const keys = new Set<string>();
    for (const tpl of ALL_CINNAMON_TEMPLATES) {
      const { cups, constraints, obstacles } = instantiateForTest(tpl);
      const key = canonicalPuzzleKey(
        { cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...obstacles] },
        constraints,
      );
      expect(key).toContain('#cap:cinnamon');
      keys.add(key);
    }
    expect(keys.size).toBe(18);
  });

  it('depths span 9–13 with a sweet 10–12 core', () => {
    const depths = ALL_CINNAMON_TEMPLATES.map((t) => t.depth).sort((a, b) => a - b);
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(CINNAMON_DEPTH_ACCEPT.min);
    expect(Math.max(...depths)).toBeLessThanOrEqual(CINNAMON_DEPTH_ACCEPT.max);
    expect(depths.filter((d) => d >= CINNAMON_DEPTH_SWEET.min && d <= CINNAMON_DEPTH_SWEET.max).length)
      .toBeGreaterThanOrEqual(12);
    expect(depths).toContain(9);
    expect(depths).toContain(13);
  });
});

describe('offline L3 report (plain control; NEVER on the runtime path)', () => {
  it('reports L3 (L3A-or-L3B) and Strong counts; bank is 18/18 L3B, 0 L3A', () => {
    let l3 = 0;
    let l3a = 0;
    let l3b = 0;
    let overlap = 0;
    const deltas: number[] = [];
    for (const tpl of ALL_CINNAMON_TEMPLATES) {
      const { cups, constraints, obstacles } = instantiateForTest(tpl);
      const solved = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints, capacityObstacles: [...obstacles] });
      expect(solved.solvable).toBe(true);
      const host = cinnamonHostOf(obstacles);
      const part = analyzeCinnamonParticipation(
        cups,
        [...obstacles],
        host,
        (solved.solution ?? []) as SolverAction[],
        constraints,
      );
      const isB = part.finalRepurpose === true;
      const isA = part.expandedDrains >= 1;
      if (isA || isB) l3++;
      if (isA) l3a++;
      if (isB) l3b++;
      if (isA && isB) overlap++;
      // Plain-control delta (offline truth only).
      const plain = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints });
      expect(plain.truncated ?? false).toBe(false);
      if (plain.solvable) {
        deltas.push((plain.minMoves as number) - (solved.minMoves as number));
      } else {
        deltas.push(99);
      }
    }
    console.log(`cinnamon offline L3: ${l3}/18 L3A=${l3a} L3B=${l3b} overlap=${overlap} deltas=[${deltas.join(',')}]`);
    // Bank is L3B by nature (§105 targets apply only if available naturally);
    // buffer-cycle L3A never occurs in optimal play — do NOT require L3A.
    expect(l3).toBeGreaterThanOrEqual(12);
    expect(l3b).toBeGreaterThanOrEqual(6);
    expect(l3).toBe(18);
    expect(l3b).toBe(18);
    expect(l3a).toBe(0);
    expect(overlap).toBe(0);
  }, 240000);
});
