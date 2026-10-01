/**
 * Gauntlet 6 §56–57 — catch-one strainer template-bank validation.
 *
 * EVERY committed template: instantiate (identity order) -> constraints ->
 * production solver WITH the stand (rescued, recorded depth) + WITHOUT the
 * tool (absent, non-truncated unsolvable) -> stepwise replay proving
 * place + strained catch + release -> applySolutionState final win.
 * Plus palette-isomorphism invariance, canonical distinctness (stand in
 * key), and depth-span coverage per kind.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState, TeaId } from '../src/game/types';
import {
  defaultCupConstraints,
  emptyFloatingIngredients,
  standStrainerState,
  type CupConstraint,
} from '../src/game/types';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  selectMysteryCup,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  ALL_STRAINER_TEMPLATES,
  STRAINER_DEPTH_ACCEPT,
  STRAINER_DEPTH_SWEET,
  STRAINER_TEMPLATE_BANK,
  STRAINER_TEMPLATE_SPECS,
  instantiateStrainerTemplate,
  resolveStrainerRoleTeas,
  type StrainerTemplate,
  type StrainerTemplateKind,
} from '../src/game/logic/strainerTemplates';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';
const E: TeaId = 'lavender';

const PALETTE_4: TeaId[] = [A, B, C, D];
const PALETTE_5: TeaId[] = [A, B, C, D, E];

function paletteFor(kind: StrainerTemplateKind): TeaId[] {
  return kind === 'strainer-mystery-peak' ? PALETTE_5 : PALETTE_4;
}

function instantiateForTest(
  tpl: StrainerTemplate,
  palette: TeaId[],
  order?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[]; hiddenCounts: number[]; teapotSlot: number | null } {
  const inst = instantiateStrainerTemplate(tpl, palette, order ?? [...palette]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  const hiddenCounts = inst.cups.map(() => 0);
  if (STRAINER_TEMPLATE_SPECS[tpl.kind].hasMysteryLayer) {
    const idx = selectMysteryCup(inst.cups, (cands) => cands[0] ?? null, constraints);
    expect(idx).not.toBe(null);
    hiddenCounts[idx as number] = 1;
  }
  return { cups: inst.cups, constraints, hiddenCounts, teapotSlot: inst.teapotSlot };
}

function requestFor(kind: StrainerTemplateKind, palette: TeaId[]): GenerateRequest {
  const spec = STRAINER_TEMPLATE_SPECS[kind];
  return {
    numColors: spec.numColors,
    colors: palette,
    emptyCups: spec.emptyCups,
    hasMysteryLayer: spec.hasMysteryLayer,
    phase: (spec.numColors === 5 ? 'peak' : 'challenge') as 'peak' | 'challenge',
    sourceOnlyCount: spec.sourceOnlyCount,
    hasStrainer: true,
  };
}

describe('strainer template bank shape', () => {
  it('has 18 templates per kind (54 total)', () => {
    expect(STRAINER_TEMPLATE_BANK['strainer-challenge']).toHaveLength(18);
    expect(STRAINER_TEMPLATE_BANK['strainer-mystery-peak']).toHaveLength(18);
    expect(STRAINER_TEMPLATE_BANK['teapot-strainer-challenge']).toHaveLength(18);
    expect(ALL_STRAINER_TEMPLATES).toHaveLength(54);
  });

  it('ids unique; kinds correct; expectedCatches is 1', () => {
    const ids = new Set(ALL_STRAINER_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(54);
    for (const kind of Object.keys(STRAINER_TEMPLATE_BANK) as StrainerTemplateKind[]) {
      for (const tpl of STRAINER_TEMPLATE_BANK[kind]) {
        expect(tpl.kind).toBe(kind);
        expect(tpl.id.startsWith(`${kind}-`)).toBe(true);
        expect(tpl.expectedCatches).toBe(1);
      }
    }
  });

  it('role resolution is a palette bijection (identity + reverse)', () => {
    const pal = PALETTE_4;
    const identity = resolveStrainerRoleTeas(pal, [...pal]);
    expect([...identity.values()]).toEqual(pal);
    const reversed = resolveStrainerRoleTeas(pal, [...pal].reverse());
    expect([...reversed.values()]).toEqual([...pal].reverse());
    expect(new Set(reversed.values()).size).toBe(pal.length);
  });

  it('every template matches its tight topology contract', () => {
    for (const kind of Object.keys(STRAINER_TEMPLATE_BANK) as StrainerTemplateKind[]) {
      const spec = STRAINER_TEMPLATE_SPECS[kind];
      const palette = paletteFor(kind);
      for (const tpl of STRAINER_TEMPLATE_BANK[kind]) {
        // Cups length matches spec (5 plain/teapot, 6 peak).
        expect(tpl.cups.length).toBe(spec.numColors + spec.emptyCups);
        if (kind === 'strainer-mystery-peak') expect(tpl.cups.length).toBe(6);
        else expect(tpl.cups.length).toBe(5);
        // Exactly one [] (one empty start).
        expect(tpl.cups.filter((c) => c.length === 0)).toHaveLength(1);
        // Tea units 4/color over the palette (role counts are uniform).
        const roleCounts = new Map<string, number>();
        tpl.cups.forEach((cup) => cup.forEach((r) => roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1)));
        const roles = kind === 'strainer-mystery-peak' ? ['c0', 'c1', 'c2', 'c3', 'c4'] : ['c0', 'c1', 'c2', 'c3'];
        for (const r of roles) expect(roleCounts.get(r)).toBe(4);
        void palette;
        // Teapot null except teapot-kind slot 0.
        if (kind === 'teapot-strainer-challenge') {
          expect(tpl.teapot).toBe(0);
          expect(tpl.cups[0]?.length).toBe(4);
        } else {
          expect(tpl.teapot).toBe(null);
        }
      }
    }
  });

  it('depth coverage spans the sweet band per kind', () => {
    const depths = (kind: StrainerTemplateKind) =>
      STRAINER_TEMPLATE_BANK[kind].map((t) => t.depth).sort((a, b) => a - b);
    for (const d of [12, 13, 14, 15]) {
      expect(depths('strainer-challenge')).toContain(d);
    }
    for (const d of [14, 15, 16, 17, 18]) {
      expect(depths('strainer-mystery-peak')).toContain(d);
    }
    for (const d of [11, 12, 13, 14]) {
      expect(depths('teapot-strainer-challenge')).toContain(d);
    }
    // Recorded depths sit inside the strainer accept bands (mostly sweet).
    for (const kind of Object.keys(STRAINER_TEMPLATE_BANK) as StrainerTemplateKind[]) {
      for (const tpl of STRAINER_TEMPLATE_BANK[kind]) {
        const accept = STRAINER_DEPTH_ACCEPT[kind];
        expect(tpl.depth).toBeGreaterThanOrEqual(accept.min);
        expect(tpl.depth).toBeLessThanOrEqual(accept.max);
      }
      const sweet = STRAINER_DEPTH_SWEET[kind];
      const inSweet = STRAINER_TEMPLATE_BANK[kind].filter(
        (t) => t.depth >= sweet.min && t.depth <= sweet.max,
      ).length;
      expect(inSweet).toBeGreaterThanOrEqual(14);
    }
  });
});

describe.each([
  ['strainer-challenge', PALETTE_4],
  ['strainer-mystery-peak', PALETTE_5],
  ['teapot-strainer-challenge', PALETTE_4],
] as Array<[StrainerTemplateKind, TeaId[]]>)('template validation: %s', (kind, palette) => {
  it('every template instantiates to a rescued level with recorded depth', () => {
    const req = requestFor(kind, palette);
    const accept = STRAINER_DEPTH_ACCEPT[kind];
    const sweet = STRAINER_DEPTH_SWEET[kind];
    let sweetCount = 0;
    for (const tpl of STRAINER_TEMPLATE_BANK[kind]) {
      const { cups, constraints, hiddenCounts, teapotSlot } = instantiateForTest(tpl, palette);
      // Structural contract.
      expect(cups.length).toBe(req.numColors + req.emptyCups);
      expect(cups.filter((c) => c.length === 0)).toHaveLength(1);
      const counts = new Map<string, number>();
      cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      palette.forEach((c) => expect(counts.get(c)).toBe(4));
      if (kind === 'teapot-strainer-challenge') {
        expect(teapotSlot).toBe(0);
        expect(constraints[0]?.mode).toBe('source-only');
        expect((cups[0] as TeaId[]).length).toBe(4);
      } else {
        expect(teapotSlot).toBe(null);
      }
      // WITH stand: solvable, non-truncated, recorded depth, in-band.
      const stand = standStrainerState();
      const slots = emptyFloatingIngredients(cups.length);
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: slots,
        strainer: stand,
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
      expect(solved.minMoves as number).toBeGreaterThanOrEqual(accept.min);
      expect(solved.minMoves as number).toBeLessThanOrEqual(accept.max);
      if ((solved.minMoves as number) >= sweet.min && (solved.minMoves as number) <= sweet.max) {
        sweetCount++;
      }
      // WITHOUT (absent): non-truncated unsolvable (rescue, never decor).
      const wo = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: slots,
      });
      expect(wo.solvable).toBe(false);
      expect(wo.truncated).not.toBe(true);
      // Full structure validator passes (production gate shape).
      const level = {
        cups,
        hiddenCounts,
        cupConstraints: constraints,
        floatingIngredients: slots,
        strainer: stand,
        seed: `tpl:${tpl.id}`,
        minMoves: solved.minMoves as number,
        visitedStates: solved.visitedStates,
      };
      expect(validateLevelStructure(level, req).ok).toBe(true);
      // Optimal path: free placement + meaningful catch + release, final win.
      const solution = solved.solution ?? [];
      expect(solution.some((a) => a.kind === 'place-strainer')).toBe(true);
      expect(solution.some((a) => a.kind === 'release-strainer')).toBe(true);
      let rcups = cups.map((c) => [...c]);
      let rslots = [...slots];
      let rstrainer = standStrainerState();
      let sawCatch = false;
      let sawRelease = false;
      for (const a of solution) {
        const res = applyPuzzleActionState(
          { cups: rcups, floatingIngredients: rslots, strainer: rstrainer },
          a,
          constraints,
        );
        expect(res).not.toBe(null);
        if (a.kind === 'pour' && res?.strained === true) {
          expect(res.transferred as number).toBeGreaterThanOrEqual(2);
          expect(res.received).toBe((res.transferred as number) - 1);
          expect(res.caughtTea).toBeDefined();
          expect(res.layer).toBe(res.caughtTea);
          sawCatch = true;
        }
        if (a.kind === 'release-strainer') sawRelease = true;
        rcups = res?.state.cups ?? rcups;
        rslots = res?.state.floatingIngredients ?? rslots;
        rstrainer = res?.state.strainer ?? rstrainer;
      }
      expect(sawCatch).toBe(true);
      expect(sawRelease).toBe(true);
      expect(rstrainer.heldTea).toBe(null);
      expect(
        isPuzzleWonState({ cups: rcups, floatingIngredients: rslots, strainer: rstrainer }, constraints),
      ).toBe(true);
      // applySolutionState replay wins with the tool held null.
      const final = applySolutionState(
        { cups, floatingIngredients: slots, strainer: stand },
        solution,
        constraints,
      );
      expect(final).not.toBe(null);
      expect(isPuzzleWonState(final as PuzzleState, constraints)).toBe(true);
      expect((final as { strainer: { heldTea: TeaId | null } }).strainer.heldTea).toBe(null);
    }
    // Mostly sweet: the committed bank lives in the sweet band.
    expect(sweetCount).toBeGreaterThanOrEqual(14);
  }, 180000);

  it('alternate palette permutation preserves depth (color isomorphism)', () => {
    const pal = paletteFor(kind);
    // Full reversal is a bijection: tea counts preserved, depth exact.
    // (Plain/teapot allow any full permutation; the tool has no target tea.)
    const reversed = [...pal].reverse();
    for (const tpl of STRAINER_TEMPLATE_BANK[kind]) {
      const { cups, constraints } = instantiateForTest(tpl, pal, reversed);
      const solved = solvePuzzle(cups, {
        cupConstraints: constraints,
        floatingIngredients: emptyFloatingIngredients(cups.length),
        strainer: standStrainerState(),
      });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  }, 180000);
});

describe('strainer bank canonical diversity (stand in key)', () => {
  it('each kind has 18 distinct canonical start keys with stand state', () => {
    for (const kind of Object.keys(STRAINER_TEMPLATE_BANK) as StrainerTemplateKind[]) {
      const palette = paletteFor(kind);
      const keys = new Set(
        STRAINER_TEMPLATE_BANK[kind].map((tpl) => {
          const { cups, constraints } = instantiateForTest(tpl, palette);
          return canonicalPuzzleKey(
            {
              cups,
              floatingIngredients: emptyFloatingIngredients(cups.length),
              strainer: standStrainerState(),
            },
            constraints,
          );
        }),
      );
      expect(keys.size).toBe(18);
    }
  });
});
