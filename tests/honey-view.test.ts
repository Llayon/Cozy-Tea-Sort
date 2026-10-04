/**
 * Gauntlet 7 §79-91 — honey view/UX regression via pure helpers only
 * (no Pixi Application, no CupView construction; game rules stay in
 * rules.ts, TeaSortView only maps the shared bottom anchor + goal halo).
 *
 * Actual TeaSortView honey exports covered here (read from the source —
 * no invented names):
 * - bottom anchor: `honeyBottomLocalY` / `honeyBottomLocalPoint`
 *   (+ aliases `honeyBottomLocalYN`, `getHoneyBottomLocalY`,
 *   `getHoneyBottomLocalPoint`, `honeyBottomPoint`);
 * - geometry constants: `HONEY_BLOB_W/H`, `HONEY_DROP_R`,
 *   `HONEY_SINK_MS`, `HONEY_ARC_MS`;
 * - painters: `drawHoneyBlob`, `drawHoneyDrop` (existence only — calling
 *   them needs a Pixi Graphics, so no drawing assertions here).
 *
 * Deliberately NOT imported (do not exist as pure view helpers):
 * - no honey transit-plan helper: transit is the rules signal
 *   `sinkingIngredientMoved === 'honey'` (partial outflow → null, honey
 *   stays; emptying outflow → 'honey', honey relocates) with landing at
 *   the ONE shared `honeyBottomLocalPoint` anchor;
 * - no honey goal-glow helper: the halo is `sinkingIngredientHostSatisfied`
 *   from rules.ts, which the view only calls;
 * - no honey hint-copy constants: honey reuses generic invalid-move
 *   feedback (unlike the strainer tool hints).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { sinkingIngredientHostSatisfied } from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  HONEY_ARC_MS,
  HONEY_BLOB_H,
  HONEY_BLOB_W,
  HONEY_DROP_R,
  HONEY_SINK_MS,
  drawHoneyBlob,
  drawHoneyDrop,
  getHoneyBottomLocalPoint,
  getHoneyBottomLocalY,
  honeyBottomLocalPoint,
  honeyBottomLocalY,
  honeyBottomLocalYN,
  honeyBottomPoint,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const B: TeaId = 'buckwheat';
const M: TeaId = 'matcha';

describe('honey bottom anchor is the one shared static/transit truth', () => {
  it('standard vs teapot anchors differ (teapot uses its belly geometry)', () => {
    const standard = honeyBottomLocalY(N, 142);
    const teapot = honeyBottomLocalY(SRC, 142);
    expect(standard).toBe(142 - 6 - 10);
    // Teapot mirrors CupView.drawTeapotFrame bellyR = min(24, 18 + 4).
    expect(teapot).toBe(142 - Math.min(24, 18 + 4) + 2);
    expect(teapot).not.toBe(standard);
    // Tasting bowl has its own shallow-body anchor, also distinct.
    expect(honeyBottomLocalY(TASTING, 142)).toBe(142 - 14);
  });

  it('point helper centers x and reuses the y helper (deterministic)', () => {
    const a = honeyBottomLocalPoint(N, 64, 142);
    const b = honeyBottomLocalPoint(N, 64, 142);
    expect(a).toEqual(b);
    expect(a).toEqual({ x: 32, y: honeyBottomLocalY(N, 142) });
    // Teapot point differs in y but shares the centering.
    const t = honeyBottomLocalPoint(SRC, 64, 142);
    expect(t.x).toBe(32);
    expect(t.y).toBe(honeyBottomLocalY(SRC, 142));
    expect(t.y).not.toBe(a.y);
  });

  it('static landing == shared anchor (no second offset truth)', () => {
    // The transit landing IS the static blob anchor: calling the helper
    // twice yields the identical point, and the teapot/standard split is
    // the only variation — there is no separate landing derivation.
    const first = honeyBottomLocalPoint(N, 64, 142);
    const second = getHoneyBottomLocalPoint(N, 64, 142);
    expect(second).toEqual(first);
    expect(honeyBottomPoint(N, 64, 142)).toEqual(first);
    expect(getHoneyBottomLocalY(N, 142)).toBe(honeyBottomLocalY(N, 142));
    expect(honeyBottomLocalYN(N, 142)).toBe(honeyBottomLocalY(N, 142));
  });

  it('honey geometry constants stay restrained (blob + drop + timing)', () => {
    expect(HONEY_BLOB_W).toBe(34);
    expect(HONEY_BLOB_H).toBe(13);
    expect(HONEY_DROP_R).toBe(5);
    expect(HONEY_SINK_MS).toBe(220);
    expect(HONEY_ARC_MS).toBe(300);
    expect(typeof drawHoneyBlob).toBe('function');
    expect(typeof drawHoneyDrop).toBe('function');
  });
});

describe('honey goal halo is rules truth (view only calls it)', () => {
  it('only full homogeneous buckwheat in a plain standard vessel glows', () => {
    expect(sinkingIngredientHostSatisfied('honey', [B, B, B, B], N)).toBe(true);
    expect(sinkingIngredientHostSatisfied('honey', [M, M, M, M], N)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [B, B, B], N)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [B, B, B, M], N)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [B, B, B, B], SRC)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [B, B, B, B], TASTING)).toBe(false);
    expect(
      sinkingIngredientHostSatisfied('honey', [B, B, B, B], { mode: 'normal', targetTeaId: M }),
    ).toBe(false);
  });
});

describe('honey transit signal comes from rules (partial stays, emptying moves)', () => {
  it('partial outflow keeps honey: no transit, static stays at the shared anchor', () => {
    const logic = new TeaSortLogic(
      [[B, B, M, M], []],
      [0, 0],
      [N, N],
      [null, null],
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res).not.toBeNull();
    // Partial outflow: tea leaves but the source stays non-empty, so the
    // rules emit no honey transit (view keeps the static blob).
    expect(res?.sinkingIngredientMoved ?? null).toBe(null);
    expect(logic.sinkingIngredients).toEqual(['honey', null]);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null]);
    // Both ends resolve through the same anchor helper (no second truth).
    expect(honeyBottomLocalPoint(N, 64, 142)).toEqual(getHoneyBottomLocalPoint(N, 64, 142));
  });

  it('emptying outflow moves honey: transit with shared-anchor landing', () => {
    const logic = new TeaSortLogic(
      [[M, M], []],
      [0, 0],
      [N, N],
      [null, null],
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res).not.toBeNull();
    // Emptying outflow: the source empties, so honey relocates — the view
    // arcs exactly one drop from the source anchor to the rim and sinks
    // it to the destination shared anchor.
    expect(res?.sinkingIngredientMoved).toBe('honey');
    expect(logic.sinkingIngredients).toEqual([null, 'honey']);
    expect(logic.toState().sinkingIngredients).toEqual([null, 'honey']);
    const landing = honeyBottomLocalPoint(N, 64, 142);
    expect(landing).toEqual({ x: 32, y: honeyBottomLocalY(N, 142) });
  });
});

describe('no duplicate truth: logic.sinkingIngredients is the only honey state', () => {
  it('stay-then-move round-trips through logic alone (no view fields needed)', () => {
    const logic = new TeaSortLogic(
      [[B, B, M, M], [], []],
      [0, 0, 0],
      [N, N, N],
      [null, null, null],
      undefined,
      ['honey', null, null],
    );
    expect(logic.sinkingIngredients).toEqual(['honey', null, null]);
    expect(logic.toState().sinkingIngredients).toEqual(['honey', null, null]);
    // Stay: partial outflow leaves honey behind.
    expect(logic.makeMove(0, 1)).not.toBeNull();
    expect(logic.sinkingIngredients).toEqual(['honey', null, null]);
    // Move: empty the host into the spare vessel, honey relocates.
    expect(logic.makeMove(0, 2)).not.toBeNull();
    expect(logic.sinkingIngredients).toEqual([null, null, 'honey']);
    expect(logic.toState().sinkingIngredients).toEqual([null, null, 'honey']);
  });
});
