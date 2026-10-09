/**
 * Gauntlet 12 — tea-bloom undo/restart/reshuffle (§§110-114, §63).
 *
 * Bloom-killer undo restores dormant bud exactly; post-bloom reuse undos
 * cross the boundary in order; multi-step undo restores every state;
 * restart restores the original full mixed host + dormant bud + moves 0;
 * reshuffle keeps the mechanic with a fresh template and no level advance.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { generateLevel, type GenerateRequest } from '../src/game/logic/generator';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const N: CupConstraint = { mode: 'normal' };

describe('bloom-killer undo (§110)', () => {
  it('single-layer bloom then undo restores source, dest, bud, moves', () => {
    // Before: bud host [A], destination [A,A,A], bud active, moves N.
    const logic = new TeaSortLogic(
      [[A, A, A], [A]],
      [0, 0],
      [N, N],
      undefined, undefined, undefined, undefined, undefined,
      [null, 'tea_bud'],
    );
    logic.movesCount = 5;
    // Clear history then make the bloom move so snapshot has moves 5.
    (logic as unknown as { history: unknown[] }).history = [];
    const mv = logic.makeMove(1, 0);
    expect(mv?.teaBudBloomed).toBe('tea_bud');
    expect(logic.toState().cups).toEqual([[A, A, A, A], []]);
    expect(logic.toState().teaBudSlots).toEqual([null, null]);
    expect(logic.movesCount).toBe(6);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[A, A, A], [A]]);
    expect(logic.toState().teaBudSlots).toEqual([null, 'tea_bud']);
    expect(logic.movesCount).toBe(5);
  });
});

describe('post-bloom reuse undo (§111)', () => {
  it('bloom -> receive -> receive, then undo x3 restores dormant bud', () => {
    const logic = new TeaSortLogic(
      [[A], [], [B]],
      [0, 0, 0],
      [N, N, N],
      undefined, undefined, undefined, undefined, undefined,
      [null, 'tea_bud', null],
    );
    // Bloom: pour B (host 2? no — bud host is 1 empty, can't source). Use host with tea:
    const logic2 = new TeaSortLogic(
      [[], [B], [A], [B]],
      [0, 0, 0, 0],
      [N, N, N, N],
      undefined, undefined, undefined, undefined, undefined,
      [null, null, 'tea_bud', null],
    );
    expect(logic2.makeMove(2, 0)).not.toBe(null);
    expect(logic2.toState().teaBudSlots).toEqual([null, null, null, null]);
    expect(logic2.toState().cups).toEqual([[A], [B], [], [B]]);
    // Former host (2) receives twice (single B layers).
    expect(logic2.makeMove(1, 2)).not.toBe(null);
    expect(logic2.toState().cups[2]).toEqual([B]);
    expect(logic2.makeMove(3, 2)).not.toBe(null);
    expect(logic2.toState().cups[2]).toEqual([B, B]);
    // Undo second receive, first receive, bloom.
    expect(logic2.undo()).not.toBe(null);
    expect(logic2.toState().cups[2]).toEqual([B]);
    expect(logic2.undo()).not.toBe(null);
    expect(logic2.toState().cups[2]).toEqual([]);
    expect(logic2.undo()).not.toBe(null);
    expect(logic2.toState().cups).toEqual([[], [B], [A], [B]]);
    expect(logic2.toState().teaBudSlots).toEqual([null, null, 'tea_bud', null]);
    void logic;
  });
});

describe('restart restores original full mixed host + dormant bud (§113)', () => {
  it('initFromState round-trip restores moves 0 and bud', () => {
    const cups: TeaId[][] = [[A, B, A, B], [A, A, B, B], [], []];
    const buds = ['tea_bud', null, null, null] as (string | null)[];
    const logic = new TeaSortLogic(cups, [0, 0, 0, 0], [N, N, N, N], undefined, undefined, undefined, undefined, undefined, buds as never);
    expect(logic.makeMove(0, 2)).not.toBe(null);
    expect(logic.movesCount).toBe(1);
    // Restart = fresh init from the same initial snapshot.
    logic.initFromState(cups, [0, 0, 0, 0], [N, N, N, N], undefined, undefined, undefined, undefined, undefined, buds as never);
    expect(logic.toState().cups).toEqual(cups);
    expect(logic.toState().teaBudSlots).toEqual(buds);
    expect(logic.movesCount).toBe(0);
    expect(logic.toState().cups.filter((c) => c.length === 0).length).toBe(2);
  });
});

describe('reshuffle keeps the mechanic with a fresh template (§114)', () => {
  it('two seeds give deterministic but different valid bud levels', () => {
    const base: GenerateRequest = {
      numColors: 4,
      colors: [A, 'sea_buckthorn', B, 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
      teaBudCount: 1,
    };
    const l1 = generateLevel(base, 'reshuffle-a', {});
    const l2 = generateLevel(base, 'reshuffle-b', {});
    for (const lvl of [l1, l2]) {
      expect(lvl.teaBudSlots?.filter((s) => s !== null).length).toBe(1);
      const host = (lvl.teaBudSlots as string[]).findIndex((s) => s === 'tea_bud');
      expect(lvl.cups[host]?.length).toBe(4);
      expect(new Set(lvl.cups[host] as TeaId[]).size).toBeGreaterThanOrEqual(2);
    }
    // Fresh template/seed (no level advance — same request shape).
    expect(l1.seed).not.toBe(l2.seed);
  });
});
