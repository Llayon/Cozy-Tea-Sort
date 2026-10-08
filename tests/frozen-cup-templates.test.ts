/**
 * Gauntlet 9 §83–87, §118 — frozen-cup template-bank validation.
 *
 * EVERY committed template: instantiate (identity order, c0 →
 * sea_buckthorn) → all-normal constraints → ice on the frozen host →
 * production solver WITH ice (recorded depth exact, MELT + later
 * source-use + cleared ice + win = L2, plus deep unlock = L3) → full
 * applySolutionState replay. Plus otherOrder isomorphism invariance,
 * canonical distinctness (ice slots in key), depth-band coverage, and the
 * exact 4,4,4,3,1,0 start shape with one SB-on-top frozen host.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, IceSlot, PuzzleState, TeaId } from '../src/game/types';
import {
  defaultCupConstraints,
  emptyFloatingIngredients,
} from '../src/game/types';
import {
  applySolutionState,
  solvePuzzle,
} from '../src/game/logic/solver';
import {
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../src/game/logic/rules';
import {
  analyzeIceParticipation,
} from '../src/game/logic/generator';
import {
  ALL_FROZEN_CUP_TEMPLATES,
  FROZEN_CUP_DEPTH_ACCEPT,
  FROZEN_CUP_TARGET_TEA,
  FROZEN_CUP_TEMPLATE_BANK,
  instantiateFrozenCupTemplate,
  type FrozenCupTemplate,
} from '../src/game/logic/frozenCupTemplates';

const SB: TeaId = 'sea_buckthorn';
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const O: TeaId = 'milk_oolong';

const PALETTE: TeaId[] = [SB, M, K, O];

function instantiateForTest(
  tpl: FrozenCupTemplate,
  palette: TeaId[] = PALETTE,
  otherOrder?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[]; ice: IceSlot[] } {
  const others = otherOrder ?? palette.filter((t) => t !== FROZEN_CUP_TARGET_TEA);
  const inst = instantiateFrozenCupTemplate(tpl, palette, [...others]);
  const constraints = defaultCupConstraints(inst.cups.length);
  const ice: IceSlot[] = inst.cups.map(() => null);
  ice[inst.frozenHost] = 'ice';
  return { cups: inst.cups, constraints, ice };
}

describe('bank shape: 18 unique ids, one kind', () => {
  it('exactly 18 templates with unique ids', () => {
    expect(ALL_FROZEN_CUP_TEMPLATES).toHaveLength(18);
    const ids = ALL_FROZEN_CUP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(18);
    for (const t of ALL_FROZEN_CUP_TEMPLATES) {
      expect(t.kind).toBe('frozen-cup');
    }
    expect(FROZEN_CUP_TEMPLATE_BANK['frozen-cup']).toHaveLength(18);
  });

  it('every template has the exact 4,4,4,3,1,0 multiset with a valid frozen host', () => {
    for (const tpl of ALL_FROZEN_CUP_TEMPLATES) {
      const lens = tpl.cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 1, 3, 4, 4, 4]);
      const host = tpl.cups[tpl.frozenHost] as string[];
      expect(host).toHaveLength(3);
      expect(host.filter((t) => t === 'c0')).toHaveLength(1);
      expect(host[host.length - 1]).toBe('c0');
      expect(new Set(host).size).toBeGreaterThan(1);
    }
  });
});

describe('every template instantiates to an L2 (melt → source-use → win) level at its recorded depth', () => {
  it.each(ALL_FROZEN_CUP_TEMPLATES.map((t) => [t.id] as [string]))('%s', (id) => {
    const tpl = ALL_FROZEN_CUP_TEMPLATES.find((t) => t.id === id) as FrozenCupTemplate;
    const { cups, constraints, ice } = instantiateForTest(tpl);
    // Correct tea units: 4 per color, c0 → sea_buckthorn.
    const counts = new Map<string, number>();
    cups.flat().forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
    for (const tea of PALETTE) expect(counts.get(tea)).toBe(4);
    const hostIdx = ice.findIndex((s) => s === 'ice');
    expect(hostIdx).toBeGreaterThanOrEqual(0);
    const hostCup = cups[hostIdx] as TeaId[];
    expect(hostCup).toHaveLength(3);
    expect(hostCup[hostCup.length - 1]).toBe(SB);
    expect(hostCup.filter((t) => t === SB)).toHaveLength(1);
    // Exactly one true empty and one singleton beside the host.
    expect(cups.filter((c) => c.length === 0)).toHaveLength(1);
    expect(cups.filter((c) => c.length === 1)).toHaveLength(1);
    const solved = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: emptyFloatingIngredients(cups.length),
      iceSlots: [...ice],
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(tpl.depth);
    expect(solved.minMoves).toBeGreaterThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.min);
    expect(solved.minMoves).toBeLessThanOrEqual(FROZEN_CUP_DEPTH_ACCEPT.max);
    const part = analyzeIceParticipation(
      cups,
      ice,
      hostIdx,
      (solved.solution ?? []) as never[],
      constraints,
    );
    expect(part.melts).toBeGreaterThanOrEqual(1);
    expect(part.sourceUses).toBeGreaterThanOrEqual(1);
    expect(part.finalIceCleared).toBe(true);
    expect(part.win).toBe(true);
    const fin = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length), iceSlots: [...ice] },
      solved.solution ?? [],
      constraints,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as PuzzleState, constraints)).toBe(true);
    expect((fin as PuzzleState).iceSlots.every((s) => s === null)).toBe(true);
  }, 60000);
});

describe('otherOrder isomorphism preserves depth exactly', () => {
  it('a reversed non-melt order keeps every recorded depth', () => {
    const others = PALETTE.filter((t) => t !== FROZEN_CUP_TARGET_TEA);
    const reversed = [...others].reverse();
    for (const tpl of ALL_FROZEN_CUP_TEMPLATES) {
      const { cups, constraints, ice } = instantiateForTest(tpl, PALETTE, reversed);
      const solved = solvePuzzle(cups, {
        maxVisited: 120_000,
        cupConstraints: constraints,
        iceSlots: [...ice],
      });
      expect(solved.solvable).toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  }, 120000);
});

describe('bank canonical diversity + depth spread', () => {
  it('18/18 canonical-distinct starts (ice slots in key)', () => {
    const keys = new Set<string>();
    for (const tpl of ALL_FROZEN_CUP_TEMPLATES) {
      const { cups, constraints, ice } = instantiateForTest(tpl);
      const key = canonicalPuzzleKey(
        { cups, floatingIngredients: emptyFloatingIngredients(cups.length), iceSlots: [...ice] },
        constraints,
      );
      keys.add(key);
    }
    expect(keys.size).toBe(18);
  });

  it('depths span 9–13 with a sweet 10–12 core', () => {
    const depths = ALL_FROZEN_CUP_TEMPLATES.map((t) => t.depth).sort((a, b) => a - b);
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...depths)).toBeLessThanOrEqual(13);
    expect(depths.filter((d) => d >= 10 && d <= 12).length).toBeGreaterThanOrEqual(12);
  });
});
