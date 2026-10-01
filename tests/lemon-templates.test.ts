/**
 * Gauntlet 5 §85–87 — lemon template-bank validation, canonical diversity,
 * relocation distribution.
 */
import { describe, expect, it } from 'vitest';
import type { FloatingIngredientSlot, SolverAction, TeaId } from '../src/game/types';
import { defaultCupConstraints, type CupConstraint } from '../src/game/types';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted, depthInTarget } from '../src/game/logic/difficulty';
import {
  ALL_LEMON_TEMPLATES,
  LEMON_TARGET_TEA,
  LEMON_TEMPLATE_BANK,
  LEMON_TEMPLATE_SPECS,
  instantiateLemonTemplate,
  type LemonTemplate,
  type LemonTemplateKind,
} from '../src/game/logic/lemonTemplates';
import {
  generateLevel,
  selectLemonHost,
  selectMysteryCup,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { createRng, shuffleInPlace } from '../src/game/logic/rng';

const M: TeaId = 'matcha';
const SB: TeaId = 'sea_buckthorn';
const K: TeaId = 'karkade';
const L: TeaId = 'lavender';
const O: TeaId = 'milk_oolong';

const PALETTE_4: TeaId[] = [M, SB, K, O];
const PALETTE_5: TeaId[] = [M, SB, K, O, L];
const ALT_4: TeaId[] = ['saffron', SB, 'karkade', 'lavender'];
const N: CupConstraint = { mode: 'normal' };

function instantiateForTest(
  tpl: LemonTemplate,
  palette: TeaId[],
  otherOrder?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[]; slots: (string | null)[]; hiddenCounts: number[] } {
  const others = otherOrder ?? palette.filter((t) => t !== LEMON_TARGET_TEA);
  const inst = instantiateLemonTemplate(tpl, palette, [...others]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  const slots = inst.cups.map(() => null) as (string | null)[];
  slots[inst.lemonHost] = 'lemon';
  const hiddenCounts = inst.cups.map(() => 0);
  const spec = LEMON_TEMPLATE_SPECS[tpl.kind];
  if (spec.hasMysteryLayer) {
    const idx = selectMysteryCup(inst.cups, (cands) => {
      const eligible = cands.filter((c) => c !== inst.lemonHost);
      return eligible[0] ?? null;
    }, constraints);
    expect(idx).not.toBe(null);
    expect(idx).not.toBe(inst.lemonHost);
    hiddenCounts[idx as number] = 1;
  }
  return { cups: inst.cups, constraints, slots, hiddenCounts };
}

function requestFor(kind: LemonTemplateKind, palette: TeaId[]): GenerateRequest {
  const spec = LEMON_TEMPLATE_SPECS[kind];
  return {
    numColors: spec.numColors,
    colors: palette,
    emptyCups: spec.emptyCups,
    hasMysteryLayer: spec.hasMysteryLayer,
    phase: (spec.numColors === 5 ? 'peak' : 'challenge') as 'peak' | 'challenge',
    sourceOnlyCount: spec.sourceOnlyCount,
    floatingIngredient: 'lemon',
  };
}

function countRelocations(
  cups: TeaId[][],
  slots: (string | null)[],
  solution: SolverAction[],
  constraints: readonly CupConstraint[],
): number {
  let board = { cups: cups.map((c) => [...c]), floatingIngredients: [...slots] as (string | null)[] };
  const at = (b: typeof board) => b.floatingIngredients.findIndex((s) => s === 'lemon');
  let n = 0;
  for (const m of solution) {
    if (m.kind !== 'pour') continue;
    const before = at(board);
    const res = applyPourState(
      { cups: board.cups, floatingIngredients: board.floatingIngredients as FloatingIngredientSlot[] },
      m.from,
      m.to,
      constraints,
    );
    expect(res).not.toBe(null);
    board = { cups: res?.state.cups ?? [], floatingIngredients: res?.state.floatingIngredients ?? [] };
    if (at(board) !== before) n++;
  }
  return n;
}

describe('lemon template bank shape', () => {
  it('has 18 templates per kind (54 total, >= 14 target each)', () => {
    expect(LEMON_TEMPLATE_BANK['lemon-challenge']).toHaveLength(18);
    expect(LEMON_TEMPLATE_BANK['lemon-mystery-peak']).toHaveLength(18);
    expect(LEMON_TEMPLATE_BANK['teapot-lemon-challenge']).toHaveLength(18);
    expect(ALL_LEMON_TEMPLATES).toHaveLength(54);
  });

  it('ids unique; c0 roles present; depths span the sweet spot', () => {
    const ids = new Set(ALL_LEMON_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(54);
    for (const t of ALL_LEMON_TEMPLATES) {
      // c0 (lemon target role) must exist somewhere in the cups.
      expect(t.cups.some((cup) => cup.includes('c0'))).toBe(true);
      const phase = t.kind === 'lemon-mystery-peak' ? 'peak' : 'challenge';
      expect(depthInTarget(t.depth, phase)).toBe(true);
    }
    const depths = (kind: LemonTemplateKind) =>
      LEMON_TEMPLATE_BANK[kind].map((t) => t.depth).sort((a, b) => a - b);
    for (const d of [7, 8, 9, 10]) {
      expect(depths('lemon-challenge')).toContain(d);
      expect(depths('teapot-lemon-challenge')).toContain(d);
    }
    for (const d of [11, 12, 13, 14]) {
      expect(depths('lemon-mystery-peak')).toContain(d);
    }
  });

  it('teapot at 0 when present; lemon host in range', () => {
    for (const t of ALL_LEMON_TEMPLATES) {
      if (t.kind === 'teapot-lemon-challenge') expect(t.teapot).toBe(0);
      else expect(t.teapot).toBe(null);
      expect(t.lemonHost).toBeGreaterThanOrEqual(0);
      expect(t.lemonHost).toBeLessThan(t.cups.length);
      expect(t.cups[t.lemonHost]?.length).toBe(4);
    }
  });
});

describe.each([
  ['lemon-challenge', PALETTE_4],
  ['lemon-mystery-peak', PALETTE_5],
  ['teapot-lemon-challenge', PALETTE_4],
] as Array<[LemonTemplateKind, TeaId[]]>)('template validation: %s', (kind, palette) => {
  it('every template instantiates to a solver-valid level with lemon travel', () => {
    const req = requestFor(kind, palette);
    for (const tpl of LEMON_TEMPLATE_BANK[kind]) {
      const { cups, constraints, slots, hiddenCounts } = instantiateForTest(tpl, palette);
      expect(cups.length).toBe(req.numColors + req.emptyCups);
      const counts = new Map<string, number>();
      cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      palette.forEach((c) => expect(counts.get(c)).toBe(4));
      // c0 bound to buckthorn: some cup holds it, host is full mixed.
      const hostCup = cups[tpl.lemonHost] as TeaId[];
      expect(hostCup.length).toBe(4);
      expect(new Set(hostCup).size).toBeGreaterThan(1);
      expect(slots.filter((s) => s === 'lemon')).toHaveLength(1);
      // Mystery distinct from host where applicable.
      if (LEMON_TEMPLATE_SPECS[kind].hasMysteryLayer) {
        const midx = hiddenCounts.findIndex((h) => h > 0);
        expect(midx).not.toBe(tpl.lemonHost);
      }
      if (tpl.teapot !== null) {
        expect(new Set(cups[tpl.teapot] as TeaId[]).size).toBeGreaterThanOrEqual(2);
      }
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: slots as FloatingIngredientSlot[],
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
      expect(depthAccepted(solved.minMoves as number, (req as { phase: 'challenge' | 'peak' }).phase)).toBe(true);
      const level = {
        cups,
        hiddenCounts,
        cupConstraints: constraints,
        floatingIngredients: slots as FloatingIngredientSlot[],
        seed: `tpl:${tpl.id}`,
        minMoves: solved.minMoves as number,
        visitedStates: solved.visitedStates,
      };
      expect(validateLevelStructure(level, req).ok).toBe(true);
      // Participation: ≥1 relocation, final lemon correct, puzzle wins.
      const relocations = countRelocations(cups, slots, solved.solution ?? [], constraints);
      expect(relocations).toBeGreaterThanOrEqual(1);
      const finalIdx = slots.findIndex((s) => s === 'lemon');
      void finalIdx;
      let board = { cups: cups.map((c) => [...c]), floatingIngredients: [...slots] as FloatingIngredientSlot[] };
      for (const step of solved.solution ?? []) {
        if (step.kind !== 'pour') continue;
        const res = applyPourState(board, step.from, step.to, constraints);
        expect(res).not.toBeNull();
        board = { cups: res?.state.cups ?? [], floatingIngredients: res?.state.floatingIngredients ?? [] };
      }
      expect(isPuzzleWonState(board, constraints)).toBe(true);
      const host = board.floatingIngredients.findIndex((s) => s === 'lemon');
      expect(board.cups[host]).toEqual([SB, SB, SB, SB]);
    }
  });

  it('c0 stays mapped to sea_buckthorn under legal renaming; depth invariant', () => {
    const pal = kind === 'lemon-mystery-peak' ? PALETTE_5 : PALETTE_4;
    const alt = kind === 'lemon-mystery-peak' ? [...PALETTE_5].reverse() : [...ALT_4];
    void alt;
    for (const tpl of LEMON_TEMPLATE_BANK[kind].slice(0, 6)) {
      const rng = createRng(`liso:${tpl.id}`);
      const others = pal.filter((t) => t !== LEMON_TARGET_TEA);
      shuffleInPlace(rng, others);
      const { cups, constraints, slots } = instantiateForTest(tpl, pal, others);
      // c0 fixation check: every template c0 role became buckthorn.
      const flatRoles = tpl.cups.flat();
      const flatTeas = cups.flat();
      flatRoles.forEach((role, i) => {
        if (role === 'c0') expect(flatTeas[i]).toBe(SB);
      });
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: slots as FloatingIngredientSlot[],
      });
      expect(solved.solvable).toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  });
});

describe('lemon bank canonical diversity + relocation distribution', () => {
  it('each kind has >= 14 distinct canonical topologies (marker in key)', () => {
    for (const kind of Object.keys(LEMON_TEMPLATE_BANK) as LemonTemplateKind[]) {
      const keys = new Set(
        LEMON_TEMPLATE_BANK[kind].map((t) => {
          const constraints: CupConstraint[] = t.cups.map((_, i) =>
            i === t.teapot ? { mode: 'source-only' as const } : { mode: 'normal' as const },
          );
          const slots = t.cups.map((_, i) => (i === t.lemonHost ? 'lemon' : null)) as (
            | string
            | null
          )[];
          return canonicalPuzzleKey(
            { cups: t.cups as unknown as TeaId[][], floatingIngredients: slots as FloatingIngredientSlot[] },
            constraints,
          );
        }),
      );
      expect(keys.size).toBeGreaterThanOrEqual(14);
    }
  });

  it('relocation distribution: min >= 1 across the bank', () => {
    const minima: number[] = [];
    for (const kind of Object.keys(LEMON_TEMPLATE_BANK) as LemonTemplateKind[]) {
      const pal = kind === 'lemon-mystery-peak' ? PALETTE_5 : PALETTE_4;
      for (const tpl of LEMON_TEMPLATE_BANK[kind]) {
        const { cups, constraints, slots } = instantiateForTest(tpl, pal);
        const solved = solvePuzzle(cups, {
          cupConstraints: constraints,
          floatingIngredients: slots as FloatingIngredientSlot[],
        });
        minima.push(countRelocations(cups, slots, solved.solution ?? [], constraints));
      }
    }
    const sorted = [...minima].sort((a, b) => a - b);
    expect(sorted[0]).toBeGreaterThanOrEqual(1);
    const median = sorted[Math.floor(sorted.length / 2)];
    console.log(`lemon bank relocations: min=${sorted[0]} median=${median} max=${sorted[sorted.length - 1]}`);
  });

  it('100 production seeds per kind yield >= 14 distinct start keys', () => {
    const cases: Array<[LemonTemplateKind, TeaId[]]> = [
      ['lemon-challenge', PALETTE_4],
      ['lemon-mystery-peak', PALETTE_5],
      ['teapot-lemon-challenge', PALETTE_4],
    ];
    for (const [kind, palette] of cases) {
      const req = requestFor(kind, palette);
      const keys = new Set<string>();
      for (let s = 0; s < 100; s++) {
        const lvl = generateLevel(req, `ldiversity:${kind}:${s}`);
        keys.add(canonicalPuzzleKey(lvl, lvl.cupConstraints));
      }
      expect(keys.size).toBeGreaterThanOrEqual(14);
    }
  }, 180000);
});

describe('selectLemonHost unit behavior', () => {
  it('picks full mixed plain vessels, skips specials and excluded', () => {
    const cups: TeaId[][] = [[M, SB, M, SB], [SB, SB, SB, SB], [], []];
    const cons: CupConstraint[] = [N, N, N, N];
    expect(selectLemonHost(cups, cons, (c) => c[0] ?? null)).toBe(0);
    expect(selectLemonHost(cups, cons, (c) => c[0] ?? null, [0])).toBe(null);
    expect(selectLemonHost(cups, [{ mode: 'source-only' }, N, N, N], (c) => c[0] ?? null)).toBe(null);
  });
});
