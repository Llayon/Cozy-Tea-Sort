import { describe, expect, it } from 'vitest';
import {
  ALL_TARGET_TEMPLATES,
  TARGET_TEMPLATE_SPECS,
  instantiateTargetTemplate,
  type TargetTemplate,
  type TargetTemplateKind,
} from '../src/game/logic/targetTemplates';
import {
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import { depthAccepted } from '../src/game/logic/difficulty';
import { canonicalKey } from '../src/game/logic/rules';
import type { CupConstraint, TeaId } from '../src/game/types';

/**
 * Gauntlet 2.1 §33: every committed template instantiates to a valid,
 * solvable, in-band level with its discovered depth reproduced exactly
 * (role bijections are full puzzle isomorphisms).
 */

const KIND_PALETTES: Record<TargetTemplateKind, TeaId[]> = {
  'target-challenge': ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  'target-mystery-peak': ['saffron', 'buckwheat', 'matcha', 'karkade', 'lavender'],
  'teapot-target-challenge': ['saffron', 'lavender', 'karkade', 'milk_oolong'],
};

const KIND_TARGETS: Record<TargetTemplateKind, [TeaId, TeaId]> = {
  'target-challenge': ['lavender', 'karkade'],
  'target-mystery-peak': ['lavender', 'karkade'],
  'teapot-target-challenge': ['lavender', 'karkade'],
};

function requestFor(tpl: TargetTemplate): GenerateRequest {
  const spec = TARGET_TEMPLATE_SPECS[tpl.kind];
  return {
    numColors: spec.numColors,
    colors: [...KIND_PALETTES[tpl.kind]],
    emptyCups: spec.emptyCups,
    hasMysteryLayer: spec.hasMysteryLayer,
    phase: spec.hasMysteryLayer ? 'peak' : 'challenge',
    ...(spec.sourceOnlyCount > 0 ? { sourceOnlyCount: spec.sourceOnlyCount } : {}),
    targetTeaIds: [...KIND_TARGETS[tpl.kind]],
  };
}

describe('target template bank validation (§33)', () => {
  it('bank holds 14 audited templates per canonical config', () => {
    for (const kind of Object.keys(TARGET_TEMPLATE_SPECS) as TargetTemplateKind[]) {
      const bank = ALL_TARGET_TEMPLATES.filter((t) => t.kind === kind);
      expect(bank.length).toBe(14);
      const ids = new Set(bank.map((t) => t.id));
      expect(ids.size).toBe(14);
    }
    expect(ALL_TARGET_TEMPLATES.length).toBe(42);
  });

  it('every role appears exactly 4 times per template (count-preserving bijection)', () => {
    for (const tpl of ALL_TARGET_TEMPLATES) {
      const counts = new Map<string, number>();
      for (const cup of tpl.cups) for (const r of cup) counts.set(r, (counts.get(r) ?? 0) + 1);
      const expected = tpl.kind === 'target-mystery-peak'
        ? ['t0', 't1', 'o0', 'o1', 'o2']
        : ['t0', 't1', 'o0', 'o1'];
      for (const r of expected) expect(counts.get(r), `${tpl.id} role ${r}`).toBe(4);
      const totalCups =
        TARGET_TEMPLATE_SPECS[tpl.kind].numColors + TARGET_TEMPLATE_SPECS[tpl.kind].emptyCups;
      expect(tpl.cups.length, `${tpl.id} cup count`).toBe(totalCups);
    }
  });

  it.each(
    ALL_TARGET_TEMPLATES.map((t) => [t.id, t] as [string, TargetTemplate]),
  )('template %s instantiates valid + solves at its recorded depth', (_id, tpl) => {
    const req = requestFor(tpl);
    const [t0, t1] = KIND_TARGETS[tpl.kind];
    const others = KIND_PALETTES[tpl.kind].filter((c) => c !== t0 && c !== t1);
    // Identity instantiation (no seeded permutation) must reproduce depth.
    const inst = instantiateTargetTemplate(tpl, [t0, t1], others);
    const constraints: CupConstraint[] = inst.cups.map(() => ({ mode: 'normal' as const }));
    if (inst.teapotSlot !== null) constraints[inst.teapotSlot] = { mode: 'source-only' };
    for (const [idx, tea] of inst.targetTeaBySlot) {
      constraints[idx] = { mode: 'normal', targetTeaId: tea };
    }
    const hiddenCounts = inst.cups.map(() => 0);
    if (req.hasMysteryLayer) {
      // Deterministic first-eligible pick (mirrors runtime selection).
      let hid = -1;
      inst.cups.forEach((cup, i) => {
        const c = constraints[i] as CupConstraint;
        if (hid === -1 && c.mode === 'normal' && c.targetTeaId === undefined && cup.length >= 3 && cup[0] !== cup[1]) {
          hid = i;
        }
      });
      expect(hid, `${tpl.id} mystery eligibility`).toBeGreaterThanOrEqual(0);
      hiddenCounts[hid] = 1;
    }
    const solved = solvePuzzle(inst.cups, { cupConstraints: constraints });
    expect(solved.solvable, `${tpl.id} solvable`).toBe(true);
    expect(solved.truncated ?? false, `${tpl.id} truncated`).toBe(false);
    expect(solved.minMoves, `${tpl.id} recorded depth`).toBe(tpl.depth);
    expect(depthAccepted(solved.minMoves as number, req.phase)).toBe(true);
    const level = {
      cups: inst.cups,
      hiddenCounts,
      cupConstraints: constraints,
      seed: `bank-audit:${tpl.id}`,
      minMoves: solved.minMoves as number,
      visitedStates: solved.visitedStates,
    };
    const check = validateLevelStructure(level, req);
    expect(check.reasons, `${tpl.id} structure`).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('bank templates are canonically distinct within each kind', () => {
    for (const kind of Object.keys(TARGET_TEMPLATE_SPECS) as TargetTemplateKind[]) {
      const keys = new Set<string>();
      const [t0, t1] = KIND_TARGETS[kind];
      const others = KIND_PALETTES[kind].filter((c) => c !== t0 && c !== t1);
      for (const tpl of ALL_TARGET_TEMPLATES.filter((t) => t.kind === kind)) {
        const inst = instantiateTargetTemplate(tpl, [t0, t1], others);
        const cons: CupConstraint[] = inst.cups.map(() => ({ mode: 'normal' as const }));
        if (inst.teapotSlot !== null) cons[inst.teapotSlot] = { mode: 'source-only' };
        for (const [idx, tea] of inst.targetTeaBySlot) cons[idx] = { mode: 'normal', targetTeaId: tea };
        keys.add(canonicalKey(inst.cups, cons));
      }
      expect(keys.size, `${kind} distinct canonical layouts`).toBe(14);
    }
  });
});
