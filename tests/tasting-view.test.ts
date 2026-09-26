/**
 * Gauntlet 4 §59 — view/UX regression tests via pure helpers (no brittle
 * Pixi drawing assertions; game rules stay out of drawing tests).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint } from '../src/game/types';
import { canActAsSource } from '../src/game/logic/rules';
import {
  CupView,
  TASTING_BOWL_BODY_H,
  decideSecondTap,
  fullVesselHint,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const TARGET: CupConstraint = { mode: 'normal', targetTeaId: 'lavender' };

describe('tasting detection from the authoritative constraint', () => {
  it('CupView reads bowl identity without parallel booleans', () => {
    const bowl = new CupView(0, T);
    expect(bowl.isTastingBowl).toBe(true);
    expect(bowl.isSinkOnly).toBe(false);
    expect(bowl.isTeapot).toBe(false);
    const cup = new CupView(1, N);
    expect(cup.isTastingBowl).toBe(false);
    const guest = new CupView(2, SNK);
    expect(guest.isTastingBowl).toBe(false);
    bowl.destroy();
    cup.destroy();
    guest.destroy();
  });
});

describe('capacity display copy', () => {
  it('tasting reports 2/2, normal reports legacy 4/4', () => {
    expect(fullVesselHint(T)).toBe('Пиала заполнена (2/2)! Выберите другой сосуд или пустой стакан.');
    expect(fullVesselHint(N)).toBe('Стакан полон (4/4)! Выберите другой сосуд или пустой стакан.');
    expect(fullVesselHint(SRC)).toBe('Стакан полон (4/4)! Выберите другой сосуд или пустой стакан.');
  });
});

describe('tasting visual geometry uses 2 logical liquid slots', () => {
  it('bowl rim sits below the tall rim; slot height divides the bowl interior', () => {
    const bowl = new CupView(0, T);
    const tall = new CupView(1, N);
    // Tall rim at y=4; bowl rim well below (shallow, bottom-aligned).
    expect(tall.rimLocalY).toBe(4);
    expect(bowl.rimLocalY).toBe(tall.height - TASTING_BOWL_BODY_H);
    expect(bowl.rimLocalY).toBeGreaterThan(60);
    // Exactly 2 slots spanning rim-inset → base (never a fixed /4 divisor).
    const slotH = bowl.slotHeightFor(T);
    expect(slotH * 2).toBeCloseTo(tall.height - 6 - (bowl.rimLocalY + 4), 6);
    expect(tall.slotHeightFor(N)).toBe(29);
    bowl.destroy();
    tall.destroy();
  });
});

describe('source-selection policy with tasting', () => {
  it('no tasting source restriction exists: bowl may source when non-empty', () => {
    expect(canActAsSource(T)).toBe(true);
  });

  it('guest still may NOT be selected as source (repeat tap refuses)', () => {
    expect(canActAsSource(SNK)).toBe(false);
    expect(decideSecondTap(SNK, false, true)).toBe('reject-sink-source');
  });

  it('tasting repeat tap switches source like a normal cup', () => {
    expect(decideSecondTap(T, false, true)).toBe('switch-source');
    expect(decideSecondTap(N, false, true)).toBe('switch-source');
  });

  it('target selection behavior unchanged', () => {
    expect(canActAsSource(TARGET)).toBe(true);
    expect(decideSecondTap(TARGET, false, true)).toBe('switch-source');
  });
});
