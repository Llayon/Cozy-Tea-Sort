/**
 * Gauntlet 9 §98–107 — frozen-cup view/UX regression via pure helpers only
 * (no Pixi Application, no CupView construction; game rules stay in
 * rules.ts, TeaSortView only maps the shared surface anchor + melt
 * flourish + rejection copy).
 *
 * Actual TeaSortView ice exports covered here (read from the source — no
 * invented names):
 * - surface anchor: `iceCenterLocalY` (shared static/melt truth);
 * - geometry constants: `ICE_SLAB_HALF_W/H`, `ICE_MELT_MS`;
 * - painter: `drawIceSlab` (existence only — calling it needs a Pixi
 *   Graphics, so no drawing assertions here);
 * - rejection copy: `FROZEN_SOURCE_HINT`, `FROZEN_NEEDS_HOT_HINT`,
 *   `frozenPourHint` (maps the authoritative `pourRejectCodeState` codes).
 *
 * Deliberately NOT imported (do not exist as pure view helpers):
 * - no ice transit-plan helper: the flourish is the rules signal
 *   `iceMelted === 'ice'` (ordinary pour → undefined, static stays;
 *   melt pour → 'ice', slab fades in place) landing at the ONE shared
 *   `iceCenterLocalY` anchor;
 * - no view-owned ice location: the static slab reads `Cup.ice` from
 *   logic (proven below through `TeaSortLogic` alone).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  FROZEN_NEEDS_HOT_HINT,
  FROZEN_SOURCE_HINT,
  ICE_MELT_MS,
  ICE_SLAB_HALF_W,
  ICE_SLAB_H,
  drawIceSlab,
  frozenPourHint,
  iceCenterLocalY,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const SB: TeaId = 'sea_buckthorn';

describe('ice surface anchor is the one shared static/flourish truth', () => {
  it('3-layer standard cup anchors the slab at the embedded surface point', () => {
    // lemonSurfaceLocalY(3) = (142-6) - 3*29 = 49; ice rides 2px embedded.
    expect(iceCenterLocalY(3, N, 142)).toBe(47);
    expect(iceCenterLocalY(4, N, 142)).toBe(142 - 6 - 4 * 29 - 2);
    expect(iceCenterLocalY(0, N, 142)).not.toBe(iceCenterLocalY(3, N, 142));
  });

  it('ice geometry constants stay restrained (slab + flourish timing)', () => {
    expect(ICE_SLAB_HALF_W).toBe(22);
    expect(ICE_SLAB_H).toBe(10);
    // Melt flourish total extra: ~250–400ms (§101).
    expect(ICE_MELT_MS).toBeGreaterThanOrEqual(250);
    expect(ICE_MELT_MS).toBeLessThanOrEqual(400);
    expect(typeof drawIceSlab).toBe('function');
  });
});

describe('frozen rejection copy maps the authoritative codes', () => {
  it('exact product copy, no duplication of legality', () => {
    expect(FROZEN_SOURCE_HINT).toBe('Сначала растопи лёд облепиховым чаем.');
    expect(FROZEN_NEEDS_HOT_HINT).toBe('Сюда можно долить только облепиховый — он растопит лёд.');
    expect(frozenPourHint('source-frozen')).toBe(FROZEN_SOURCE_HINT);
    expect(frozenPourHint('target-frozen-needs-hot')).toBe(FROZEN_NEEDS_HOT_HINT);
    expect(frozenPourHint('ok')).toBe('');
    expect(frozenPourHint('color-mismatch')).toBe('');
  });
});

describe('melt signal comes from rules (ordinary stays, melt flourishes)', () => {
  it('ordinary pour: no melt signal, static ice untouched', () => {
    const logic = new TeaSortLogic(
      [[M, M], [M, K, SB]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      [null, 'ice'],
    );
    // Color mismatch (M onto SB top) — rejected, nothing mutates.
    expect(logic.makeMove(0, 1)).toBe(null);
    expect(logic.toState().iceSlots).toEqual([null, 'ice']);
  });

  it('melt pour: single metadata flag, logic ice cleared for the static layer', () => {
    const logic = new TeaSortLogic(
      [[SB, SB], [M, K, SB]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      [null, 'ice'],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.iceMelted).toBe('ice');
    // The static slab reads Cup.ice: cleared exactly once, in the same
    // atomic transition — the flourish transit can never double it.
    expect(logic.toState().iceSlots).toEqual([null, null]);
    expect(logic.cups[1]?.layers).toEqual([M, K, SB, SB]);
  });
});

describe('no duplicate truth: logic.iceSlots is the only ice state', () => {
  it('freeze → melt → undo round-trips through logic alone (no view fields needed)', () => {
    const logic = new TeaSortLogic(
      [[SB, SB], [M, K, SB]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      [null, 'ice'],
    );
    expect(logic.iceSlots).toEqual([null, 'ice']);
    expect(logic.makeMove(0, 1)?.iceMelted).toBe('ice');
    expect(logic.iceSlots).toEqual([null, null]);
    logic.undo();
    expect(logic.iceSlots).toEqual([null, 'ice']);
    expect(logic.toState().cups).toEqual([[SB, SB], [M, K, SB]]);
  });
});
