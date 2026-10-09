/**
 * Gauntlet 12 — tea-bloom template bank validation (§§97-100, §144).
 *
 * All 18: unique IDs, canonical-distinct, correct tea counts (4 each),
 * full mixed host (len 4, >=2 TeaIds, standard normal), recorded depth
 * exact (production solver re-solves to the same minMoves), L2
 * (bloom + meaningful reuse + cleared + win), in acceptance band.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { canonicalPuzzleKey } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { emptyFloatingIngredients } from '../src/game/types';
import {
  ALL_TEA_BLOOM_TEMPLATES,
  TEA_BLOOM_DEPTH_ACCEPT,
  TEA_BLOOM_DEPTH_SWEET,
  instantiateTeaBloomTemplate,
} from '../src/game/logic/teaBloomTemplates';
import { analyzeTeaBloomParticipation } from '../src/game/logic/generator';
import { applyPourState } from '../src/game/logic/rules';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const N: CupConstraint = { mode: 'normal' };
const CONS: CupConstraint[] = [N, N, N, N, N, N];

describe('bank shape: 18 unique canonical-distinct templates', () => {
  it('has exactly 18 templates with unique IDs', () => {
    expect(ALL_TEA_BLOOM_TEMPLATES.length).toBe(18);
    const ids = ALL_TEA_BLOOM_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(18);
    expect(ids.every((id) => id.startsWith('tea-bloom-'))).toBe(true);
  });

  it('all canonical-distinct (bud-aware keys)', () => {
    const keys = ALL_TEA_BLOOM_TEMPLATES.map((t) => {
      const inst = instantiateTeaBloomTemplate(t, PALETTE, [...PALETTE]);
      const buds = [null, null, null, null, null, null] as (string | null)[];
      buds[inst.teaBudHost] = 'tea_bud';
      return canonicalPuzzleKey(
        { cups: inst.cups, floatingIngredients: emptyFloatingIngredients(6), teaBudSlots: buds as never },
        CONS,
      );
    });
    expect(new Set(keys).size).toBe(18);
  });

  it('correct tea counts: 4 units each TeaId, topology 4,4,4,4,0,0', () => {
    for (const t of ALL_TEA_BLOOM_TEMPLATES) {
      const inst = instantiateTeaBloomTemplate(t, PALETTE, [...PALETTE]);
      const counts = new Map<string, number>();
      for (const cup of inst.cups) for (const tea of cup) counts.set(tea, (counts.get(tea) ?? 0) + 1);
      for (const c of PALETTE) expect(counts.get(c)).toBe(4);
      const lens = inst.cups.map((c) => c.length).sort((a, b) => a - b);
      expect(lens).toEqual([0, 0, 4, 4, 4, 4]);
    }
  });

  it('every host is full mixed (len 4, >=2 TeaIds)', () => {
    for (const t of ALL_TEA_BLOOM_TEMPLATES) {
      const inst = instantiateTeaBloomTemplate(t, PALETTE, [...PALETTE]);
      const host = inst.cups[t.teaBudHost] as TeaId[];
      expect(host.length).toBe(4);
      expect(new Set(host).size).toBeGreaterThanOrEqual(2);
    }
  });

  it('depths inside acceptance band (sweet band holds majority)', () => {
    for (const t of ALL_TEA_BLOOM_TEMPLATES) {
      expect(t.depth).toBeGreaterThanOrEqual(TEA_BLOOM_DEPTH_ACCEPT.min);
      expect(t.depth).toBeLessThanOrEqual(TEA_BLOOM_DEPTH_ACCEPT.max);
    }
    const sweet = ALL_TEA_BLOOM_TEMPLATES.filter(
      (t) => t.depth >= TEA_BLOOM_DEPTH_SWEET.min && t.depth <= TEA_BLOOM_DEPTH_SWEET.max,
    );
    expect(sweet.length).toBeGreaterThanOrEqual(12);
  });
});

describe('bank offline L3 + route influence (no runtime control solves in production)', () => {
  it('reports L3A/L3B composition, control delta and CONTROL_AVOIDS over the bank', () => {
    let l3a = 0;
    let l3b = 0;
    let avoids = 0;
    const deltas: number[] = [];
    for (const t of ALL_TEA_BLOOM_TEMPLATES) {
      const inst = instantiateTeaBloomTemplate(t, PALETTE, [...PALETTE]);
      const buds = [null, null, null, null, null, null] as (string | null)[];
      buds[inst.teaBudHost] = 'tea_bud';
      const r = solvePuzzle(inst.cups, { cupConstraints: CONS, teaBudSlots: buds as never });
      expect(r.solvable).toBe(true);
      const part = analyzeTeaBloomParticipation(inst.cups, buds as never, inst.teaBudHost, r.solution ?? [], CONS);
      if (part.firstPostBloomSourceDepth !== null) l3a++;
      if (part.finalRepurpose) l3b++;
      const plain = solvePuzzle(inst.cups, { cupConstraints: CONS });
      expect(plain.solvable).toBe(true);
      deltas.push((r.minMoves as number) - (plain.minMoves as number));
      let pc = inst.cups.map((c) => [...c]);
      let minOcc = pc[inst.teaBudHost]?.length ?? 0;
      for (const a of plain.solution ?? []) {
        if ((a as { kind: string }).kind !== 'pour') continue;
        const res = applyPourState({ cups: pc, floatingIngredients: emptyFloatingIngredients(6) }, (a as { from: number }).from, (a as { to: number }).to, CONS);
        if (!res) break;
        pc = res.state.cups as typeof pc;
        minOcc = Math.min(minOcc, pc[inst.teaBudHost]?.length ?? 0);
      }
      if (minOcc > 0) avoids++;
    }
    console.log(`tea-bloom bank offline: n=18 L3A=${l3a} L3B=${l3b} overlap=${l3a + l3b - 18} avoids=${avoids}/18 deltas=[${deltas.join(',')}]`);
    expect(l3a + l3b).toBeGreaterThanOrEqual(18);
    expect(l3a).toBeGreaterThanOrEqual(1);
    expect(l3b).toBeGreaterThanOrEqual(1);
    expect(avoids).toBeGreaterThanOrEqual(6);
  }, 120000);
});

describe('bank L2: recorded depth exact, bloom + reuse + cleared + win', () => {
  it.each(ALL_TEA_BLOOM_TEMPLATES.map((t) => [t.id, t] as [string, typeof t]))(
    '%s solves to recorded depth with L2 trace',
    (_id, t) => {
      const inst = instantiateTeaBloomTemplate(t, PALETTE, [...PALETTE]);
      const buds = [null, null, null, null, null, null] as (string | null)[];
      buds[inst.teaBudHost] = 'tea_bud';
      const r = solvePuzzle(inst.cups, {
        cupConstraints: CONS,
        teaBudSlots: buds as never,
      });
      expect(r.solvable).toBe(true);
      expect(r.truncated ?? false).toBe(false);
      expect(r.minMoves).toBe(t.depth);
      expect(r.solution).toBeDefined();
      const part = analyzeTeaBloomParticipation(inst.cups, buds as never, inst.teaBudHost, r.solution ?? [], CONS);
      expect(part.blooms).toBeGreaterThanOrEqual(1);
      expect(part.firstReuseDepth).not.toBe(null);
      expect(part.finalBudCleared).toBe(true);
      expect(part.win).toBe(true);
    },
    30000,
  );
});
