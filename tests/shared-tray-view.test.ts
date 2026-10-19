/**
 * Gauntlet 16 — shared-tray view contract (structural, no screenshots).
 *
 * Hint copy maps the shared-capacity gate softly (no alarm); tray motif
 * contract (plank + six shape-coded markers, no lock icons) derives from
 * cup lengths (no view counter); partial-bound pours animate exactly the
 * transferred count with sharedCapacityLimited metadata reaching the logic
 * layer (gameplay truth stays derivable).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { SHARED_CAPACITY_LIMITS } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applyPourState } from '../src/game/logic/rules';
import {
  SHARED_TRAY_FULL_HINT,
  sharedTrayPourHint,
} from '../src/game/view/TeaSortView';

const T: CupConstraint = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
const N: CupConstraint = { mode: 'normal' };
const A: TeaId = 'matcha';
const B: TeaId = 'karkade';

describe('hint copy (soft, exact)', () => {
  it('shared-capacity-full maps; ok/unrelated stay silent', () => {
    expect(sharedTrayPourHint('shared-capacity-full')).toBe(SHARED_TRAY_FULL_HINT);
    expect(SHARED_TRAY_FULL_HINT).toBe('На подносе больше нет места');
    expect(sharedTrayPourHint('ok')).toBe('');
    expect(sharedTrayPourHint('color-mismatch')).toBe('');
    expect(sharedTrayPourHint('target-full')).toBe('');
  });
});

describe('indicator truth (no view counter)', () => {
  it('limit truth is six (markers derive from cup lengths)', () => {
    expect(SHARED_CAPACITY_LIMITS['tea-tray']).toBe(6);
  });
});

describe('sharedCapacityLimited metadata reaches the logic layer', () => {
  it('partial-bound inflow moves exactly one layer with the flag set', () => {
    // Tray 5/6: dest [A,A] free 2, source [A,A] run 2 → shared m=1.
    const logic = new TeaSortLogic(
      [[A, A], [B, B, B], [A, A]],
      [0, 0, 0],
      [T, T, N],
    );
    const mv = logic.makeMove(2, 0);
    expect(mv).not.toBe(null);
    expect(mv?.move.count).toBe(1);
    expect(mv?.sharedCapacityLimited).toBe(true);
    expect(logic.toState().cups[0]).toEqual([A, A, A]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[A, A], [B, B, B], [A, A]]);
  });

  it('ordinary pours carry no flag (animation count is the single truth)', () => {
    const res = applyPourState(
      { cups: [[A, A], [B], [B, B]], floatingIngredients: [null, null, null] },
      2, 1,
      [N, N, N],
    );
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(2);
    expect(res?.sharedCapacityLimited ?? false).toBe(false);
  });
});
