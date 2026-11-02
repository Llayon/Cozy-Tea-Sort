/** G21 FLASK_TRAY view identity: existing two visual languages, no combo badge. */
import { describe, expect, it } from 'vitest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  type CupConstraint,
} from '../src/game/types';
import { CupView, fullVesselHint, steepingFlaskPourHint } from '../src/game/view/TeaSortView';

const FLASK: CupConstraint = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
const TRAY: CupConstraint = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };

describe('G21 FLASK_TRAY view', () => {
  it('flask keeps its distinct cue and tray keeps its shared identity', () => {
    const flask = new CupView(5, FLASK);
    const tray = new CupView(2, TRAY);
    expect(flask.isSteepingFlask).toBe(true);
    expect(flask.isThermos).toBe(false);
    expect(flask.isTastingBowl).toBe(false);
    expect(tray.constraint.sharedCapacityGroup).toBe('tea-tray');
    expect(tray.isSteepingFlask).toBe(false);
    expect(fullVesselHint(FLASK)).toBe('Колба заполнена (4/4)! Выберите другой сосуд или пустой стакан.');
    expect(steepingFlaskPourHint('source-steeping-not-ready')).toBe('Сначала наполни колбу до краёв');
    flask.destroy();
    tray.destroy();
  });

  it('does not add a combo badge or second input state', () => {
    const source = CupView.prototype as unknown as Record<string, unknown>;
    expect(typeof source['renderFlask']).toBe('function');
    for (const forbidden of ['comboBadge', 'flaskTrayReady', 'comboProgress', 'dualMechanicState']) {
      expect(forbidden in source).toBe(false);
    }
  });
});
