/**
 * G20 view identity / soft rejection copy (pure helpers, no Pixi app).
 */
import { describe, expect, it } from 'vitest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  isSteepingFlaskConstraint,
  type CupConstraint,
} from '../src/game/types';
import {
  CupView,
  STEEPING_FLASK_WIDTH,
  decideSecondTap,
  fullVesselHint,
  steepingFlaskPourHint,
} from '../src/game/view/TeaSortView';
import { canActAsSource } from '../src/game/logic/rules';

const N: CupConstraint = { mode: 'normal' };
const FLASK: CupConstraint = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);

describe('G20 flask view identity', () => {
  it('CupView recognizes only the static flask marker', () => {
    const flask = new CupView(0, FLASK);
    const normal = new CupView(1, N);
    expect(flask.isSteepingFlask).toBe(true);
    expect(flask.isThermos).toBe(false);
    expect(flask.isTastingBowl).toBe(false);
    expect(flask.isPairBowl).toBe(false);
    expect(flask.isTeapot).toBe(false);
    expect(flask.isSinkOnly).toBe(false);
    expect(normal.isSteepingFlask).toBe(false);
    expect(isSteepingFlaskConstraint(FLASK)).toBe(true);
    flask.destroy();
    normal.destroy();
  });

  it('slender body but standard 4-slot readability and >=44px hitbox', () => {
    const flask = new CupView(0, FLASK);
    const normal = new CupView(1, N);
    expect(flask.width).toBe(STEEPING_FLASK_WIDTH);
    expect(flask.width).toBeLessThan(normal.width);
    expect(flask.height).toBe(normal.height);
    expect(flask.slotHeightFor(FLASK)).toBe(29);
    expect(flask.width).toBeGreaterThanOrEqual(44);
    expect(flask.height).toBeGreaterThanOrEqual(44);
    expect(flask.width + 20 * 2).toBeGreaterThanOrEqual(44);
    flask.destroy();
    normal.destroy();
  });

  it('derived cue renderer exists and no ready state lives on the view', () => {
    const proto = CupView.prototype as unknown as Record<string, unknown>;
    expect(typeof proto['drawSteepingFlaskFrame']).toBe('function');
    expect(typeof proto['renderFlask']).toBe('function');
    const view = new CupView(0, FLASK) as unknown as Record<string, unknown>;
    for (const forbidden of ['flaskReady', 'isSteeped', 'steepedTea', 'flaskLocked', 'brewProgress', 'readyTea']) {
      expect(forbidden in view).toBe(false);
    }
    (view as { destroy: () => void }).destroy();
  });

  it('flask is source-capable conceptually; selection is not permanently blocked', () => {
    expect(canActAsSource(FLASK)).toBe(true);
    expect(decideSecondTap(FLASK, false, true)).toBe('switch-source');
  });
});

describe('G20 flask copy', () => {
  it('full hint reports 4/4 and partial rejection copy is gentle', () => {
    expect(fullVesselHint(FLASK)).toBe('Колба заполнена (4/4)! Выберите другой сосуд или пустой стакан.');
    expect(steepingFlaskPourHint('source-steeping-not-ready')).toBe('Сначала наполни колбу до краёв');
    expect(steepingFlaskPourHint('ok')).toBe('');
    expect(steepingFlaskPourHint('color-mismatch')).toBe('');
  });
});
