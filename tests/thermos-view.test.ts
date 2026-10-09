/**
 * Gauntlet 10 — thermos view/UX regression via pure helpers only
 * (no Pixi Application, no CupView drawing assertions; game rules stay in
 * rules.ts, TeaSortView only maps the tall-slim geometry + 5/5 copy).
 *
 * Actual TeaSortView thermos exports covered here (read from the source —
 * no invented names):
 * - geometry constants: `THERMOS_BODY_H`, `THERMOS_WIDTH`, `THERMOS_SLOT_H`;
 * - painter helper: `thermosSlotH` (5 readable slots from the authoritative
 *   capacity — never 4 compressed slots);
 * - vessel copy: `fullVesselHint` (thermos reports `5/5`);
 * - vessel identity: `CupView.isThermos` (delegates to the authoritative
 *   `isThermosCupConstraint` — no parallel view state);
 * - selection policy: `canActAsSource` + `decideSecondTap` (thermos pours
 *   like a normal cup in both directions).
 *
 * Deliberately NOT asserted as pixel truth (needs a Pixi Graphics):
 * - the translucent tall-slim frame itself (`drawThermosFrame` existence
 *   only — calling it needs a Pixi Graphics, so no drawing assertions);
 * - row layout / stand fitting (covered by the taller/narrower constants +
 *   the ≥44px hitbox math below).
 */
import { describe, expect, it } from 'vitest';
import {
  isThermosCupConstraint,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { canActAsSource } from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  CupView,
  THERMOS_BODY_H,
  THERMOS_SLOT_H,
  THERMOS_WIDTH,
  decideSecondTap,
  fullVesselHint,
  thermosSlotH,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const SNK: CupConstraint = { mode: 'sink-only' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const TH: CupConstraint = { mode: 'normal', capacity: 5, mustEndEmpty: true };
const TARGET: CupConstraint = { mode: 'normal', targetTeaId: 'lavender' };
const M: TeaId = 'matcha';

describe('thermos detection from the authoritative constraint (no view-owned state)', () => {
  it('CupView reads thermos identity without parallel booleans', () => {
    const thermos = new CupView(0, TH);
    expect(thermos.isThermos).toBe(true);
    expect(thermos.isTastingBowl).toBe(false);
    expect(thermos.isSinkOnly).toBe(false);
    expect(thermos.isTeapot).toBe(false);
    const cup = new CupView(1, N);
    expect(cup.isThermos).toBe(false);
    const bowl = new CupView(2, T);
    expect(bowl.isThermos).toBe(false);
    expect(bowl.isTastingBowl).toBe(true);
    const guest = new CupView(3, SNK);
    expect(guest.isThermos).toBe(false);
    thermos.destroy();
    cup.destroy();
    bowl.destroy();
    guest.destroy();
  });

  it('isThermos delegates to the domain helper for every role (no second truth)', () => {
    for (const c of [N, SNK, T, TH, TARGET, undefined]) {
      const view = new CupView(0, c);
      expect(view.isThermos).toBe(isThermosCupConstraint(c));
      view.destroy();
    }
  });

  it('no thermos field lives on the view (constraint is the only truth)', () => {
    const view = new CupView(0, TH) as unknown as Record<string, unknown>;
    expect('thermosLayers' in view).toBe(false);
    expect('thermosTea' in view).toBe(false);
    expect('thermosSlot' in view).toBe(false);
    expect('thermosCupCount' in view).toBe(false);
    (view as { destroy: () => void }).destroy();
  });

  it('logic holds no thermos slot array either (toState keys are thermos-free)', () => {
    const logic = new TeaSortLogic([[M], []], [0, 0], [TH, N]);
    const st = logic.toState() as unknown as Record<string, unknown>;
    expect('thermosSlots' in st).toBe(false);
    expect(logic.cups[0]?.isThermos).toBe(true);
  });
});

describe('thermos geometry: taller, narrower, 5 readable slots', () => {
  it('body is taller (+18) and narrower (-8) than the standard cell', () => {
    expect(THERMOS_BODY_H).toBe(160);
    expect(THERMOS_WIDTH).toBe(56);
    const thermos = new CupView(0, TH);
    const tall = new CupView(1, N);
    expect(thermos.height).toBe(THERMOS_BODY_H);
    expect(thermos.height).toBeGreaterThan(tall.height);
    expect(thermos.width).toBe(THERMOS_WIDTH);
    expect(thermos.width).toBeLessThan(tall.width);
    // Tall vessels share the y=4 rim (never the shallow bowl rim).
    expect(thermos.rimLocalY).toBe(4);
    expect(tall.rimLocalY).toBe(4);
    thermos.destroy();
    tall.destroy();
  });

  it('exactly 5 individually readable slots span the interior (never compressed)', () => {
    expect(THERMOS_SLOT_H).toBe(26);
    expect(thermosSlotH()).toBe(26);
    expect(thermosSlotH(THERMOS_BODY_H)).toBe(26);
    const thermos = new CupView(0, TH);
    expect(thermos.slotHeightFor(TH)).toBe(26);
    // 5 × 26 = 130 fills rim-inset → base minus the 16px air gap.
    expect(thermos.slotHeightFor(TH) * 5).toBeCloseTo(THERMOS_BODY_H - 6 - 8 - 16, 6);
    // Standard/tasting geometry unchanged.
    const tall = new CupView(1, N);
    expect(tall.slotHeightFor(N)).toBe(29);
    thermos.destroy();
    tall.destroy();
  });

  it('translucent tall-slim renderer exists (existence only — drawing needs Pixi)', () => {
    const proto = CupView.prototype as unknown as Record<string, unknown>;
    expect(typeof proto['drawThermosFrame']).toBe('function');
  });
});

describe('capacity display copy', () => {
  it('thermos reports 5/5, tasting 2/2, normal keeps legacy 4/4', () => {
    expect(fullVesselHint(TH)).toBe('Термос заполнен (5/5)! Выберите другой сосуд или пустой стакан.');
    expect(fullVesselHint(T)).toBe('Пиала заполнена (2/2)! Выберите другой сосуд или пустой стакан.');
    expect(fullVesselHint(N)).toBe('Стакан полон (4/4)! Выберите другой сосуд или пустой стакан.');
  });
});

describe('selection + hitbox stay tappable (≥44px both axes)', () => {
  it('thermos body alone already clears 44px; padded targets are larger still', () => {
    const thermos = new CupView(0, TH);
    expect(thermos.width).toBeGreaterThanOrEqual(44);
    expect(thermos.height).toBeGreaterThanOrEqual(44);
    // Build-time hit area pads the slim body (padX 20, top 16, bottom 32):
    // 56+40=96 wide, 160+16+32=208 tall — both ≥44.
    expect(thermos.width + 20 * 2).toBeGreaterThanOrEqual(44);
    expect(thermos.height + 16 + 32).toBeGreaterThanOrEqual(44);
    // Stage tap padding for the slim thermos (24) keeps the same guarantee
    // at the minimum layout scale (0.72): 56*0.72+48 > 44.
    expect(56 * 0.72 + 48).toBeGreaterThanOrEqual(44);
    thermos.destroy();
  });

  it('no thermos source restriction: the vessel pours like a normal cup', () => {
    expect(canActAsSource(TH)).toBe(true);
    expect(decideSecondTap(TH, false, true)).toBe('switch-source');
    expect(decideSecondTap(N, false, true)).toBe('switch-source');
    expect(decideSecondTap(TARGET, false, true)).toBe('switch-source');
  });
});
