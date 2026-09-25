/**
 * Gauntlet 3 §55–56 — sink template-bank validation + canonical diversity.
 *
 * EVERY committed template: instantiate -> constraints -> mystery (peak) ->
 * production solver -> full contract. Plus per-kind distinctness and
 * production-seed variety.
 */
import { describe, expect, it } from 'vitest';
import type { TeaId } from '../src/game/types';
import { defaultCupConstraints, type CupConstraint } from '../src/game/types';
import { canonicalKey, isWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted, depthInTarget } from '../src/game/logic/difficulty';
import {
  ALL_SINK_TEMPLATES,
  SINK_TEMPLATE_BANK,
  SINK_TEMPLATE_SPECS,
  instantiateSinkTemplate,
  type SinkTemplate,
  type SinkTemplateKind,
} from '../src/game/logic/sinkTemplates';
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
// A production cycle-2 challenge palette (isomorphism check).
const ALT_4: TeaId[] = ['saffron', 'lavender', 'karkade', 'milk_oolong'];

function instantiateForTest(
  tpl: SinkTemplate,
  palette: TeaId[],
  order?: TeaId[],
): { cups: TeaId[][]; constraints: CupConstraint[]; hiddenCounts: number[] } {
  const inst = instantiateSinkTemplate(tpl, palette, order ?? [...palette]);
  const constraints = defaultCupConstraints(inst.cups.length);
  if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
  constraints[inst.sinkSlot] = { mode: 'sink-only' };
  const hiddenCounts = inst.cups.map(() => 0);
  const spec = SINK_TEMPLATE_SPECS[tpl.kind];
  if (spec.hasMysteryLayer) {
    const idx = selectMysteryCup(inst.cups, (cands) => cands[0] ?? null, constraints);
    expect(idx).not.toBe(null);
    hiddenCounts[idx as number] = 1;
  }
  return { cups: inst.cups, constraints, hiddenCounts };
}

function requestFor(kind: SinkTemplateKind, palette: TeaId[]): GenerateRequest {
  const spec = SINK_TEMPLATE_SPECS[kind];
  return {
    numColors: spec.numColors,
    colors: palette,
    emptyCups: spec.emptyCups,
    hasMysteryLayer: spec.hasMysteryLayer,
    phase: (spec.numColors === 5 ? 'peak' : 'challenge') as 'peak' | 'challenge',
    sourceOnlyCount: spec.sourceOnlyCount,
    sinkOnlyCount: spec.sinkOnlyCount,
  };
}

describe('sink template bank shape', () => {
  it('has 18 templates per kind (54 total, >= 14 target each)', () => {
    expect(SINK_TEMPLATE_BANK['sink-challenge']).toHaveLength(18);
    expect(SINK_TEMPLATE_BANK['sink-mystery-peak']).toHaveLength(18);
    expect(SINK_TEMPLATE_BANK['teapot-sink-challenge']).toHaveLength(18);
    expect(ALL_SINK_TEMPLATES).toHaveLength(54);
  });

  it('depths span the sweet spot per kind (no fake distribution)', () => {
    const depths = (kind: SinkTemplateKind) =>
      SINK_TEMPLATE_BANK[kind].map((t) => t.depth).sort((a, b) => a - b);
    expect(depths('sink-challenge')).toEqual(
      expect.arrayContaining([7, 8, 9, 10]),
    );
    expect(depths('teapot-sink-challenge')).toEqual(
      expect.arrayContaining([7, 8, 9, 10]),
    );
    expect(depths('sink-mystery-peak')).toEqual(
      expect.arrayContaining([10, 11, 12, 13, 14]),
    );
    for (const t of ALL_SINK_TEMPLATES) {
      const phase = t.kind === 'sink-mystery-peak' ? 'peak' : 'challenge';
      expect(depthInTarget(t.depth, phase)).toBe(true);
    }
  });

  it('sink sits at the stable last slot; teapot at 0 when present', () => {
    for (const t of ALL_SINK_TEMPLATES) {
      expect(t.sink).toBe(t.cups.length - 1);
      expect(t.cups[t.sink]).toEqual([]);
      if (t.kind === 'teapot-sink-challenge') {
        expect(t.teapot).toBe(0);
        expect(t.cups[0]?.length).toBe(4);
      } else {
        expect(t.teapot).toBe(null);
      }
    }
  });
});

describe.each([
  ['sink-challenge', PALETTE_4],
  ['sink-mystery-peak', PALETTE_5],
  ['teapot-sink-challenge', PALETTE_4],
] as Array<[SinkTemplateKind, TeaId[]]>)('template validation: %s', (kind, palette) => {
  it('every template instantiates to a solver-valid production level', () => {
    const req = requestFor(kind, palette);
    for (const tpl of SINK_TEMPLATE_BANK[kind]) {
      const { cups, constraints, hiddenCounts } = instantiateForTest(tpl, palette);
      // Structural contract.
      expect(cups.length).toBe(req.numColors + req.emptyCups);
      const counts = new Map<string, number>();
      cups.forEach((cup) => cup.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      palette.forEach((c) => expect(counts.get(c)).toBe(4));
      const sinkIdx = constraints.findIndex((c) => c.mode === 'sink-only');
      expect(sinkIdx).toBe(cups.length - 1);
      expect(cups[sinkIdx]).toEqual([]);
      expect(constraints[sinkIdx]?.targetTeaId).toBe(undefined);
      expect(hiddenCounts[sinkIdx]).toBe(0);
      const ordinaryEmpty = constraints.filter(
        (c, i) => c.mode === 'normal' && cups[i]?.length === 0,
      ).length;
      expect(ordinaryEmpty).toBeGreaterThanOrEqual(1);
      if (tpl.teapot !== null) {
        const pot = cups[tpl.teapot] as TeaId[];
        expect(pot.length).toBe(4);
        expect(new Set(pot).size).toBeGreaterThanOrEqual(2);
        expect(hiddenCounts[tpl.teapot]).toBe(0);
      }
      expect(isWonState(cups, constraints)).toBe(false);
      // Production solver verdict.
      const solved = solvePuzzle(cups, { cupConstraints: constraints });
      expect(solved.solvable).toBe(true);
      expect(solved.truncated).not.toBe(true);
      // Recorded depth reproduced exactly (identity instantiation).
      expect(solved.minMoves).toBe(tpl.depth);
      expect(depthAccepted(solved.minMoves as number, (req as { phase: 'challenge' | 'peak' }).phase)).toBe(true);
      // Full structure validator passes.
      const level = {
        cups,
        hiddenCounts,
        cupConstraints: constraints,
        seed: `tpl:${tpl.id}`,
        minMoves: solved.minMoves as number,
        visitedStates: solved.visitedStates,
      };
      expect(validateLevelStructure(level, req).ok).toBe(true);
      // Solution serves the guest and never sources it.
      const solution = solved.solution ?? [];
      expect(solution.some((m) => m.to === sinkIdx)).toBe(true);
      for (const m of solution) expect(m.from).not.toBe(sinkIdx);
    }
  });

  it('recorded depth is palette-isomorphism invariant', () => {
    const alt = kind === 'sink-mystery-peak' ? [...PALETTE_5].reverse() : [...ALT_4];
    const req = requestFor(kind, alt);
    void req;
    for (const tpl of SINK_TEMPLATE_BANK[kind].slice(0, 6)) {
      const rng = createRng(`iso:${tpl.id}`);
      const order = [...(kind === 'sink-mystery-peak' ? PALETTE_5 : PALETTE_4)];
      shuffleInPlace(rng, order);
      const pal = kind === 'sink-mystery-peak' ? PALETTE_5 : PALETTE_4;
      const { cups, constraints } = instantiateForTest(tpl, pal, order);
      const solved = solvePuzzle(cups, { cupConstraints: constraints });
      expect(solved.solvable).toBe(true);
      expect(solved.minMoves).toBe(tpl.depth);
    }
  });
});

describe('sink bank canonical diversity', () => {
  it('each kind has >= 14 distinct canonical topologies', () => {
    for (const kind of Object.keys(SINK_TEMPLATE_BANK) as SinkTemplateKind[]) {
      const keys = new Set(
        SINK_TEMPLATE_BANK[kind].map((t) => {
          const constraints: CupConstraint[] = t.cups.map((_, i) => {
            if (i === t.teapot) return { mode: 'source-only' as const };
            if (i === t.sink) return { mode: 'sink-only' as const };
            return { mode: 'normal' as const };
          });
          return canonicalKey(t.cups as unknown as TeaId[][], constraints);
        }),
      );
      expect(keys.size).toBeGreaterThanOrEqual(14);
    }
  });

  it('100 production seeds per kind yield >= 8 distinct start keys', () => {
    const cases: Array<[SinkTemplateKind, TeaId[]]> = [
      ['sink-challenge', PALETTE_4],
      ['sink-mystery-peak', PALETTE_5],
      ['teapot-sink-challenge', PALETTE_4],
    ];
    for (const [kind, palette] of cases) {
      const req = requestFor(kind, palette);
      const keys = new Set<string>();
      for (let s = 0; s < 100; s++) {
        const lvl = generateLevel(req, `diversity:${kind}:${s}`);
        keys.add(canonicalKey(lvl.cups, lvl.cupConstraints));
      }
      expect(keys.size).toBeGreaterThanOrEqual(8);
    }
  }, 120000);
});
