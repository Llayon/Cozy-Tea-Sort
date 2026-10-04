/**
 * Gauntlet 8 — interaction view/UX regression via pure helpers only
 * (no Pixi Application, no CupView construction; game rules stay in
 * rules.ts, TeaSortView only maps shared anchors + goal halos).
 *
 * Actual TeaSortView transit surface covered here (read from the source —
 * no invented names):
 * - NO (lemonTransit, honeyTransit) boolean-plan helper exists: transit is
 *   the rules metadata pair `floatingIngredientMoved` /
 *   `sinkingIngredientMoved`. `animatePour` evaluates exactly
 *   `floatingIngredientMoved != null` (lemon rides every outflow) and
 *   `sinkingIngredientMoved === 'honey'` (honey relocates only when its
 *   host empties). These tests pin that mapping: lemon-only move →
 *   {true,false}; honey-only move → {false,true}; joint move →
 *   {true,true}; neither → {false,false}.
 * - geometry: `lemonTransitCounts` (sourcePre/targetFinal) + the ONE shared
 *   honey anchor `honeyBottomLocalY` / `honeyBottomLocalPoint`.
 * - suppression flags on CupView: `suppressLemonTransit` /
 *   `suppressHoneyTransit` (layer-specific; joint moves clear both via
 *   both paths). No CupView is constructed here — presence/absence is
 *   asserted via source text (grep-readable, no Pixi).
 *
 * Deliberately NOT imported (do not exist as pure view helpers):
 * - no joint transit-plan helper: the flight pair is the rules signal
 *   above, landing on the shared anchors;
 * - no view-owned ingredient index/boolean: logic slots are the only
 *   ingredient state (asserted below);
 * - no completion helper: the single pour `onMoveComplete` site lives at
 *   the end of the private async `animatePour` (place/release have their
 *   own single sites in `animatePlaceStrainer`/`animateReleaseStrainer`).
 *   Firing it needs a Pixi Application + timers, so no headless completion
 *   test is faked here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  floatingIngredientHostSatisfied,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  honeyBottomLocalPoint,
  honeyBottomLocalY,
  lemonTransitCounts,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const M: TeaId = 'matcha';
const SB: TeaId = 'sea_buckthorn';
const B: TeaId = 'buckwheat';

const VIEW_SOURCE = readFileSync(
  new URL('../src/game/view/TeaSortView.ts', import.meta.url),
  'utf8',
);

type MoveResult = ReturnType<TeaSortLogic['makeMove']>;

/**
 * The exact predicates `animatePour` evaluates (TeaSortView, no gameplay
 * rules duplicated — pure metadata equality checks):
 *   const lemonMoving = floatingIngredientMoved != null;
 *   const honeyMoving = sinkingIngredientMoved === 'honey';
 */
function viewTransitPlan(res: MoveResult): { lemon: boolean; honey: boolean } {
  return {
    lemon: (res?.floatingIngredientMoved ?? null) != null,
    honey: (res?.sinkingIngredientMoved ?? null) === 'honey',
  };
}

describe('interaction transit plan is the rules metadata pair (no view helper)', () => {
  it('lemon-only move → {true,false}', () => {
    const logic = new TeaSortLogic(
      [[M, SB], [SB]],
      [0, 0],
      [N, N],
      ['lemon', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved ?? null).toBe(null);
    expect(viewTransitPlan(res)).toEqual({ lemon: true, honey: false });
  });

  it('honey-only move → {false,true}', () => {
    const logic = new TeaSortLogic(
      [[M, M], []],
      [0, 0],
      [N, N],
      [null, null],
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved ?? null).toBe(null);
    expect(res?.sinkingIngredientMoved).toBe('honey');
    expect(viewTransitPlan(res)).toEqual({ lemon: false, honey: true });
  });

  it('joint move → {true,true}', () => {
    const logic = new TeaSortLogic(
      [[M, M], []],
      [0, 0],
      [N, N],
      ['lemon', null],
      undefined,
      ['honey', null],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved).toBe('lemon');
    expect(res?.sinkingIngredientMoved).toBe('honey');
    expect(viewTransitPlan(res)).toEqual({ lemon: true, honey: true });
  });

  it('neither → {false,false}', () => {
    const logic = new TeaSortLogic(
      [[M, SB], [SB]],
      [0, 0],
      [N, N],
      [null, null],
    );
    const res = logic.makeMove(0, 1);
    expect(res?.floatingIngredientMoved ?? null).toBe(null);
    expect(res?.sinkingIngredientMoved ?? null).toBe(null);
    expect(viewTransitPlan(res)).toEqual({ lemon: false, honey: false });
  });
});

describe('joint flights reuse the same pure anchors (no second truth)', () => {
  it('lemon flight lands on the shared static surface anchor', () => {
    // Joint pour [M,M]+both → []: transfer 2, post source 0, post target 2.
    expect(lemonTransitCounts(0, 2, 2)).toEqual({ sourcePre: 2, targetFinal: 2 });
  });

  it('honey landing is the static blob anchor', () => {
    expect(honeyBottomLocalPoint(N, 64, 142)).toEqual({
      x: 32,
      y: honeyBottomLocalY(N, 142),
    });
  });
});

describe('interaction goal halos are rules truth (view only calls them)', () => {
  it('lemon glows only on full homogeneous sea_buckthorn; honey only on full buckwheat', () => {
    expect(floatingIngredientHostSatisfied('lemon', [SB, SB, SB, SB], N)).toBe(true);
    expect(floatingIngredientHostSatisfied('lemon', [B, B, B, B], N)).toBe(false);
    expect(sinkingIngredientHostSatisfied('honey', [B, B, B, B], N)).toBe(true);
    expect(sinkingIngredientHostSatisfied('honey', [SB, SB, SB, SB], N)).toBe(false);
  });
});

describe('no duplicate truth: logic slots are the only ingredient state', () => {
  it('view source owns no ingredient index/boolean (suppression flags only)', () => {
    // Exact field names from the source: per-layer transit suppression,
    // owned by the pour flow and cleared on landing / reset / undo.
    expect(VIEW_SOURCE).toContain('suppressLemonTransit');
    expect(VIEW_SOURCE).toContain('suppressHoneyTransit');
    // No view-owned ingredient position truth may ever appear here.
    for (const invented of [
      'viewHoneyCupIndex',
      'viewLemonCupIndex',
      'honeyCupIndex',
      'lemonCupIndex',
      'hasHoney',
      'hasLemon',
    ]) {
      expect(VIEW_SOURCE).not.toContain(invented);
    }
  });

  it('cohost→split→joint round-trips through logic alone (no view fields needed)', () => {
    // Split leg: mixed cohost pours partially — lemon rides, honey stays.
    const split = new TeaSortLogic(
      [[B, B, M, M], [], []],
      [0, 0, 0],
      [N, N, N],
      ['lemon', null, null],
      undefined,
      ['honey', null, null],
    );
    expect(split.floatingIngredients).toEqual(['lemon', null, null]);
    expect(split.sinkingIngredients).toEqual(['honey', null, null]);
    const r1 = split.makeMove(0, 1);
    expect(viewTransitPlan(r1)).toEqual({ lemon: true, honey: false });
    expect(split.floatingIngredients).toEqual([null, 'lemon', null]);
    expect(split.sinkingIngredients).toEqual(['honey', null, null]);
    expect(split.toState().floatingIngredients).toEqual([null, 'lemon', null]);
    expect(split.toState().sinkingIngredients).toEqual(['honey', null, null]);
    // Joint leg: cohost empties — both relocate together, cohost preserved.
    const joint = new TeaSortLogic(
      [[M, M], []],
      [0, 0],
      [N, N],
      ['lemon', null],
      undefined,
      ['honey', null],
    );
    const r2 = joint.makeMove(0, 1);
    expect(viewTransitPlan(r2)).toEqual({ lemon: true, honey: true });
    expect(joint.floatingIngredients).toEqual([null, 'lemon']);
    expect(joint.sinkingIngredients).toEqual([null, 'honey']);
    expect(joint.toState().floatingIngredients).toEqual([null, 'lemon']);
    expect(joint.toState().sinkingIngredients).toEqual([null, 'honey']);
    // View-less logic state keys suffice: everything the view renders
    // (cups + both slot rows) is already here.
    expect(Object.keys(joint.toState())).toEqual(
      expect.arrayContaining(['cups', 'floatingIngredients', 'sinkingIngredients']),
    );
  });
});
