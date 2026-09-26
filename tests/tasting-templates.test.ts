/**
 * Gauntlet 4 §55–56 — tasting template-bank validation + canonical diversity.
 *
 * EVERY committed template: instantiate -> constraints -> mystery (peak) ->
 * production solver -> full contract + participation (enters AND exits the
 * bowl, finishes empty). Plus per-kind distinctness and production-seed
 * variety.
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { defaultCupConstraints, type CupConstraint } from '../src/game/types';
import { applyPour, canonicalKey, isWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted, depthInTarget } from '../src/game/logic/difficulty';
import {
  ALL_TASTING_TEMPLATES,
  TASTING_TEMPLATE_BANK,
  TASTING_TEMPLATE_SPECS,
  instantiateTastingTemplate,
  type TastingTemplate,
  type TastingTemplateKind,
} from '../src/game/logic/tastingTemplates';
import {
  generateLevel,
  selectMysteryCup,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { createRng, shuffleInPlace } from '../src/game/logic/rng';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';
const E: TeaId = 'lavender';

const PALETTE_4: TeaId[] = [A, B, C, D];
const PALETTE_5: TeaId[] = [A, B, C, D, E];
const ALT_4: TeaId[] = ['saffron', 'lavender', 'karkade', 'milk_oolong'];

const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

function instantiateForTest(
  tpl: TastingTemplate,
  palette: TeaId[],
  order?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[]; hiddenCounts: number[] } {
  const inst = instantiateTastingTemplate(tpl, palette, order ?? [...palette]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  constraints[inst.tastingSlot] = { ...TASTING };
  const hiddenCounts = inst.cups.map(() => 0);
  const spec = TASTING_TEMPLATE_SPECS[tpl.kind];
  if (spec.hasMysteryLayer) {
    const idx = selectMysteryCup(inst.cups, (cands) => cands[0] ?? null, constraints);
    expect(idx).not.toBe(null);
    hiddenCounts[idx as number] = 1;
  }
  return { cups: inst.cups, constraints, hiddenCounts };
}

function requestFor(kind: TastingTemplateKind, palette: TeaId[]): GenerateRequest {
  const spec = TASTING_TEMPLATE_SPECS[kind];
  return {
    numColors: spec.numColors,
    colors: palette,
    emptyCups: spec.emptyCups,
    hasMysteryLayer: spec.hasMysteryLayer,
    phase: (spec.numColors === 5 ? 'peak' : 'challenge') as 'peak' | 'challenge',
    sourceOnlyCount: spec.sourceOnlyCount,
    tastingCupCount: spec.tastingCupCount,
  };
}

describe('tasting template bank shape', () => {
  it('has 18 templates per kind (54 total, >= 14 target each)', () => {
    expect(TASTING_TEMPLATE_BANK['tasting-challenge']).toHaveLength(18);
    expect(TASTING_TEMPLATE_BANK['tasting-mystery-peak']).toHaveLength(18);
    expect(TASTING_TEMPLATE_BANK['teapot-tasting-challenge']).toHaveLength(18);
    expect(ALL_TASTING_TEMPLATES).toHaveLength(54);
  });

  it('ids unique; depths span the sweet spot per kind', () => {
    const ids = new Set(ALL_TASTING_TEMPLATES.map((t) => t.id));
    expect(ids.size).toBe(54);
    const depths = (kind: TastingTemplateKind) =>
      TASTING_TEMPLATE_BANK[kind].map((t) => t.depth).sort((a, b) => a - b);
    // Challenge banks cover 7–10 (d7 thin by search reality, present).
    for (const d of [7, 8, 9, 10]) {
      expect(depths('tasting-challenge')).toContain(d);
      expect(depths('teapot-tasting-challenge')).toContain(d);
    }
    for (const d of [10, 11, 12, 13, 14]) {
      expect(depths('tasting-mystery-peak')).toContain(d);
    }
    for (const t of ALL_TASTING_TEMPLATES) {
      const phase = t.kind === 'tasting-mystery-peak' ? 'peak' : 'challenge';
      expect(depthInTarget(t.depth, phase)).toBe(true);
    }
  });

  it('tasting sits at the stable last slot; teapot at 0 when present', () => {
    for (const t of ALL_TASTING_TEMPLATES) {
      expect(t.tasting).toBe(t.cups.length - 1);
      expect(t.cups[t.tasting]).toEqual([]);
      if (t.kind === 'teapot-tasting-challenge') {
        expect(t.teapot).toBe(0);
        expect(t.cups[0]?.length).toBe(4);
      } else {
        expect(t.teapot).toBe(null);
      }
    }
  });
});

describe.each([
  ['tasting-challenge', PALETTE_4],
  ['tasting-mystery-peak', PALETTE_5],
  ['teapot-tasting-challenge', PALETTE_4],
] as Array<[TastingTemplateKind, TeaId[]]>)('template validation: %s', (kind, palette) => {
  it('every template instantiates to a solver-valid production level that USES the bowl', () => {
    const req = requestFor(kind, palette);
    for (const tpl of TASTING_TEMPLATE_BANK[kind]) {
      const { cups, constraints, hiddenCounts } = instantiateForTest(tpl, palette);
      expect(cups.length).toBe(req.numColors + req.emptyCups);
      const counts = new Map<string, number>();
      cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      palette.forEach((c) => expect(counts.get(c)).toBe(4));
      const tastingIdx = constraints.findIndex(
        (c) => c.mode === 'normal' && c.capacity === 2 && c.mustEndEmpty === true,
      );
      expect(tastingIdx).toBe(cups.length - 1);
      expect(cups[tastingIdx]).toEqual([]);
      expect(constraints[tastingIdx]?.targetTeaId).toBe(undefined);
      expect(hiddenCounts[tastingIdx]).toBe(0);
      const ordinaryEmpty = constraints.filter(
        (c, i) => c.mode === 'normal' && c.capacity !== 2 && cups[i]?.length === 0,
      ).length;
      expect(ordinaryEmpty).toBeGreaterThanOrEqual(1);
      if (tpl.teapot !== null) {
        const pot = cups[tpl.teapot] as TeaId[];
        expect(pot.length).toBe(4);
        expect(new Set(pot).size).toBeGreaterThanOrEqual(2);
        expect(hiddenCounts[tpl.teapot]).toBe(0);
      }
      expect(isWonState(cups, constraints)).toBe(false);
      const solved = solvePuzzle(cups, { cupConstraints: constraints });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
      expect(depthAccepted(solved.minMoves as number, (req as { phase: 'challenge' | 'peak' }).phase)).toBe(true);
      const level = {
        cups,
        hiddenCounts,
        cupConstraints: constraints,
        seed: `tpl:${tpl.id}`,
        minMoves: solved.minMoves as number,
        visitedStates: solved.visitedStates,
      };
      expect(validateLevelStructure(level, req).ok).toBe(true);
      // Participation (§19/§46): enters AND exits, finishes empty.
      const solution = solved.solution ?? [];
      expect(solution.some((m) => m.to === tastingIdx)).toBe(true);
      const firstIn = solution.findIndex((m) => m.to === tastingIdx);
      expect(solution.slice(firstIn + 1).some((m) => m.from === tastingIdx)).toBe(true);
      let board = cups.map((c) => [...c]);
      for (const step of solution) {
        const res = applyPour(board, step.from, step.to, constraints);
        expect(res).not.toBeNull();
        board = res?.cups ?? board;
      }
      expect(isWonState(board, constraints)).toBe(true);
      expect(board[tastingIdx]).toEqual([]);
    }
  });

  it('recorded depth is palette-isomorphism invariant', () => {
    const pal = kind === 'tasting-mystery-peak' ? PALETTE_5 : PALETTE_4;
    const alt = kind === 'tasting-mystery-peak' ? [...PALETTE_5].reverse() : [...ALT_4];
    void alt;
    for (const tpl of TASTING_TEMPLATE_BANK[kind].slice(0, 6)) {
      const rng = createRng(`tiso:${tpl.id}`);
      const order = [...pal];
      shuffleInPlace(rng, order);
      const { cups, constraints } = instantiateForTest(tpl, pal, order);
      const solved = solvePuzzle(cups, { cupConstraints: constraints });
      expect(solved.solvable).toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  });
});

describe('tasting bank canonical diversity', () => {
  it('each kind has >= 14 distinct canonical topologies', () => {
    for (const kind of Object.keys(TASTING_TEMPLATE_BANK) as TastingTemplateKind[]) {
      const keys = new Set(
        TASTING_TEMPLATE_BANK[kind].map((t) => {
          const constraints: CupConstraint[] = t.cups.map((_, i) => {
            if (i === t.teapot) return { mode: 'source-only' as const };
            if (i === t.tasting) return { ...TASTING };
            return { mode: 'normal' as const };
          });
          return canonicalKey(t.cups as unknown as TeaId[][], constraints);
        }),
      );
      expect(keys.size).toBeGreaterThanOrEqual(14);
    }
  });

  it('100 production seeds per kind yield >= 14 distinct start keys', () => {
    const cases: Array<[TastingTemplateKind, TeaId[]]> = [
      ['tasting-challenge', PALETTE_4],
      ['tasting-mystery-peak', PALETTE_5],
      ['teapot-tasting-challenge', PALETTE_4],
    ];
    for (const [kind, palette] of cases) {
      const req = requestFor(kind, palette);
      const keys = new Set<string>();
      for (let s = 0; s < 100; s++) {
        const lvl = generateLevel(req, `tdiversity:${kind}:${s}`);
        keys.add(canonicalKey(lvl.cups, lvl.cupConstraints));
      }
      expect(keys.size).toBeGreaterThanOrEqual(14);
    }
  }, 120000);
});
