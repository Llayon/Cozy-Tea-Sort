/**
 * Gauntlet 12 — tea-bloom solver identity (§§36-41, §139-142).
 *
 * ONE existing 0-1 BFS, no new action type, bloom inside normal POUR cost 1.
 * Visited identity includes active bud state. Hand fixture proves L2 + L3
 * with exact minMoves; plain control recorded. Legacy minMoves unchanged.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { applyPourState, canonicalPuzzleKey, isConstructiveMoveState, isPuzzleWonState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { analyzeTeaBloomParticipation, fallbackLevel, type GenerateRequest } from '../src/game/logic/generator';
import { emptyFloatingIngredients } from '../src/game/types';

const N: CupConstraint = { mode: 'normal' };
const CONS6: CupConstraint[] = [N, N, N, N, N, N];

describe('hand fixture: full mixed bud host → partial unload → bloom → reuse → win', () => {
  // Deterministic compact fixture from the robust bank (depth 10, gap 5).
  // cups (concrete palette matcha/sea_buckthorn/karkade/milk_oolong via c0..c3
  // identity on tea-bloom-10-501374): host 0 mixed [c0,c1,c1,c0].
  it('optimal replay blooms then reuses with exact minMoves 10', () => {
    const cups: TeaId[][] = [
      ['matcha', 'sea_buckthorn', 'sea_buckthorn', 'matcha'],
      ['karkade', 'milk_oolong', 'milk_oolong', 'karkade'],
      ['matcha', 'sea_buckthorn', 'sea_buckthorn', 'matcha'],
      ['milk_oolong', 'milk_oolong', 'karkade', 'karkade'],
      [],
      [],
    ];
    const buds = ['tea_bud', null, null, null, null, null] as (string | null)[];
    const r = solvePuzzle(cups, { cupConstraints: CONS6, teaBudSlots: buds as never });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(10);
    expect(r.solution).toBeDefined();
    const part = analyzeTeaBloomParticipation(cups, buds as never, 0, r.solution ?? [], CONS6);
    expect(part.blooms).toBeGreaterThanOrEqual(1);
    expect(part.firstBloomDepth).not.toBe(null);
    expect(part.firstReuseDepth).not.toBe(null);
    expect((part.firstReuseDepth as number)).toBeGreaterThan(part.firstBloomDepth as number);
    expect(part.finalBudCleared).toBe(true);
    expect(part.win).toBe(true);
    // L3: workspace cycle and/or final repurpose.
    expect(part.firstPostBloomSourceDepth !== null || part.finalRepurpose).toBe(true);
  });

  it('plain control on the same board: record delta + host occupancy', () => {
    const cups: TeaId[][] = [
      ['matcha', 'sea_buckthorn', 'sea_buckthorn', 'matcha'],
      ['karkade', 'milk_oolong', 'milk_oolong', 'karkade'],
      ['matcha', 'sea_buckthorn', 'sea_buckthorn', 'matcha'],
      ['milk_oolong', 'milk_oolong', 'karkade', 'karkade'],
      [],
      [],
    ];
    const buds = ['tea_bud', null, null, null, null, null] as (string | null)[];
    const bud = solvePuzzle(cups, { cupConstraints: CONS6, teaBudSlots: buds as never });
    const plain = solvePuzzle(cups, { cupConstraints: CONS6 });
    expect(plain.solvable).toBe(true);
    expect(bud.solvable).toBe(true);
    const delta = (bud.minMoves as number) - (plain.minMoves as number);
    expect(delta).toBeGreaterThanOrEqual(0);
    expect(delta).toBeLessThanOrEqual(2);
    // Replay plain optimal, track would-be host occupancy.
    let pc = cups.map((c) => [...c]);
    let minOcc = pc[0]?.length ?? 0;
    for (const a of plain.solution ?? []) {
      if ((a as { kind: string }).kind !== 'pour') continue;
      const res = applyPourState({ cups: pc, floatingIngredients: emptyFloatingIngredients(6) }, (a as { from: number }).from, (a as { to: number }).to, CONS6);
      if (!res) break;
      pc = res.state.cups as TeaId[][];
      minOcc = Math.min(minOcc, pc[0]?.length ?? 0);
    }
    // Diagnostic only (route-influence signal, not a solver rule).
    expect(minOcc).toBeGreaterThanOrEqual(0);
    void delta;
  });
});

describe('solver identity: same tea before/after bloom are distinct states', () => {
  it('bud-aware canonical keys separate pre/post bloom with identical tea', () => {
    const cups: TeaId[][] = [['matcha', 'karkade'], []];
    const before = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as never },
      [N, N],
    );
    const after = canonicalPuzzleKey(
      { cups, floatingIngredients: [null, null], teaBudSlots: [null, null] as never },
      [N, N],
    );
    expect(before).not.toBe(after);
  });

  it('deadlock search treats bud-clearing moves as constructive', () => {
    // [A,A]+bud -> [] must be constructive even though partial
    // homogeneous->empty is ordinarily pruned.
    expect(
      isConstructiveMoveState(
        { cups: [['matcha', 'matcha'], []] as TeaId[][], floatingIngredients: [null, null], teaBudSlots: ['tea_bud', null] as never },
        0, 1, [N, N],
      ),
    ).toBe(true);
  });

  it('bloom occurs inside normal POUR cost 1 (no new action type)', () => {
    // [A]+bud -> [A,A,A] completes 4/4: bloom + win in one pour.
    const cups: TeaId[][] = [['matcha'], ['matcha', 'matcha', 'matcha']];
    const buds = ['tea_bud', null] as (string | null)[];
    const r = solvePuzzle(cups, { cupConstraints: [N, N], teaBudSlots: buds as never });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(1);
    const res = applyPourState(
      { cups, floatingIngredients: [null, null], teaBudSlots: buds as never },
      0, 1, [N, N],
    );
    expect(res?.teaBudBloomed).toBe('tea_bud');
    expect(isPuzzleWonState(res?.state as never, [N, N])).toBe(true);
  });
});

describe('legacy minMove regression: pre-G12 fallback depths unchanged', () => {
  it.each([
    ['warmup', { numColors: 3, colors: ['matcha', 'sea_buckthorn', 'karkade'], emptyCups: 2, hasMysteryLayer: false, phase: 'warmup' }, 5],
    ['challenge', { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' }, 6],
    ['teapot', { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1 }, 7],
    ['cinnamon', { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', cinnamonCupCount: 1 }, 11],
  ] as Array<[string, GenerateRequest, number]>)('%s fallback stays at exact depth %i', (_name, req, depth) => {
    const lvl = fallbackLevel(req);
    expect(lvl.minMoves).toBe(depth);
  });
});
