/**
 * Gauntlet 10 — high thermos («Высокий термос») domain matrix (§§110-122).
 *
 * Rules: receive/source under normal flow, 4→5 with m=1, 5/5 target-full,
 * mustEndEmpty (even homogeneous 4/4 or 5/5 never satisfies), pruning keeps
 * homogeneous-thermos OUT constructive, isThermos vs isTasting pin, and no
 * dynamic thermos state anywhere (identity derives from the constraint).
 *
 * Plus request validation (0/1 recognized, >1 and every sibling special
 * rejected loudly) and the legacy minMove regression: representative
 * pre-G10 fallback depths pinned exactly (G10 must not shift them).
 */
import { describe, expect, it } from 'vitest';
import {
  STANDARD_CUP_CAPACITY,
  THERMOS_CAPACITY,
  THERMOS_CONSTRAINT,
  TEA_UNITS_PER_COLOR,
  cupCapacity,
  cupConstraintSignature,
  isTastingCupConstraint,
  isThermosCupConstraint,
  mustEndEmpty,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  applyPour,
  canActAsSource,
  canPourBetween,
  cupEndStateSatisfied,
  isConstructiveMove,
  isInFinalState,
  isWonState,
  pourRejectCodeBetween,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  countThermosCups,
  fallbackLevel,
  requestedThermosCupCount,
  validateLevelStructure,
  validateThermosRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const D: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TH: CupConstraint = { mode: 'normal', capacity: 5, mustEndEmpty: true };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

describe('A. thermos capacity + identification (no dynamic state)', () => {
  it('capacity 5 is the thermos physical capacity', () => {
    expect(THERMOS_CAPACITY).toBe(5);
    expect(TEA_UNITS_PER_COLOR).toBe(4);
    expect(STANDARD_CUP_CAPACITY).toBe(4);
    expect(THERMOS_CONSTRAINT).toEqual({ mode: 'normal', capacity: 5, mustEndEmpty: true });
    expect(cupCapacity(TH)).toBe(5);
    expect(mustEndEmpty(TH)).toBe(true);
    expect(cupCapacity(undefined)).toBe(4);
    expect(cupCapacity(N)).toBe(4);
  });

  it('isThermos vs isTasting pin: cap5+E is thermos, cap2+E is tasting, never both', () => {
    expect(isThermosCupConstraint(TH)).toBe(true);
    expect(isThermosCupConstraint(THERMOS_CONSTRAINT)).toBe(true);
    expect(isTastingCupConstraint(TH)).toBe(false);
    expect(isTastingCupConstraint(TASTING)).toBe(true);
    expect(isThermosCupConstraint(TASTING)).toBe(false);
    expect(isThermosCupConstraint(N)).toBe(false);
    expect(isThermosCupConstraint(SRC)).toBe(false);
    expect(isThermosCupConstraint(SNK)).toBe(false);
    expect(isThermosCupConstraint({ mode: 'normal', targetTeaId: A })).toBe(false);
    expect(isThermosCupConstraint({ mode: 'source-only', capacity: 5, mustEndEmpty: true })).toBe(false);
    expect(isThermosCupConstraint({ mode: 'sink-only', capacity: 5, mustEndEmpty: true })).toBe(false);
    expect(isThermosCupConstraint({ mode: 'normal', capacity: 5, mustEndEmpty: true, targetTeaId: A })).toBe(false);
    expect(isThermosCupConstraint({ mode: 'normal', capacity: 5 })).toBe(false);
    expect(isThermosCupConstraint(undefined)).toBe(false);
  });

  it('TeaSortLogic Cup exposes the thermos role from the constraint (no parallel booleans)', () => {
    const logic = new TeaSortLogic([[A], []], [0, 0], [TH, N]);
    expect(logic.cups[0]?.isThermos).toBe(true);
    expect(logic.cups[0]?.capacity).toBe(5);
    expect(logic.cups[0]?.isTastingBowl).toBe(false);
    expect(logic.cups[1]?.isThermos).toBe(false);
    expect(logic.cups[1]?.capacity).toBe(4);
  });

  it('no dynamic thermos state: PuzzleState carries no thermos field', () => {
    const logic = new TeaSortLogic([[A], []], [0, 0], [TH, N]);
    const st = logic.toState() as unknown as Record<string, unknown>;
    expect('thermosSlots' in st).toBe(false);
    expect('thermosTea' in st).toBe(false);
    expect('thermosLayers' in st).toBe(false);
    expect(logic.cupConstraints).toEqual([TH, N]);
  });
});

describe('B. receive / source under normal flow', () => {
  it('empty thermos receives a full 4-layer pour (capacity is workspace, not tea pool)', () => {
    expect(canPourBetween([[A, A, A, A], []], 0, 1, [N, TH])).toBe(true);
    const res = applyPour([[A, A, A, A], []], 0, 1, [N, TH]);
    expect(res?.transferred).toBe(4);
    expect(res?.cups[0]).toEqual([]);
    expect(res?.cups[1]).toEqual([A, A, A, A]);
  });

  it('thermos sources back out under normal color rules', () => {
    expect(canPourBetween([[A, A], [A]], 0, 1, [TH, N])).toBe(true);
    expect(canPourBetween([[A, A], [B]], 0, 1, [TH, N])).toBe(false);
    const res = applyPour([[A, A], []], 0, 1, [TH, N]);
    expect(res?.transferred).toBe(2);
    expect(res?.cups[0]).toEqual([]);
    expect(canActAsSource(TH)).toBe(true);
  });

  it('4→5 with m=1: single matching unit completes the fifth slot', () => {
    const cups: TeaId[][] = [[A], [A, A, A, A]];
    const cons: CupConstraint[] = [N, TH];
    expect(pourRejectCodeBetween(cups, 0, 1, cons)).toBe('ok');
    const res = applyPour(cups, 0, 1, cons);
    expect(res?.transferred).toBe(1);
    expect(res?.cups[1]).toEqual([A, A, A, A, A]);
  });

  it('partial top-up: only one unit fits into a 4/5 thermos', () => {
    // Thermos [B,A,A,A] (top A) + source top-group AA: only 1 fits.
    const cups: TeaId[][] = [[A, A], [B, A, A, A]];
    const cons: CupConstraint[] = [N, TH];
    const res = applyPour(cups, 0, 1, cons);
    expect(res?.transferred).toBe(1);
    expect(res?.cups[1]).toEqual([B, A, A, A, A]);
  });

  it('5/5 thermos is target-full; nothing more fits', () => {
    expect(pourRejectCodeBetween([[A], [A, A, A, A, A]], 0, 1, [N, TH])).toBe('target-full');
    expect(canPourBetween([[A], [A, A, A, A, A]], 0, 1, [N, TH])).toBe(false);
    expect(applyPour([[A], [A, A, A, A, A]], 0, 1, [N, TH])).toBe(null);
  });
});

describe('C. win + must-end-empty semantics (homogeneous never satisfies)', () => {
  it('empty thermos satisfied; any non-empty thermos is NOT (even full homogeneous)', () => {
    expect(cupEndStateSatisfied([], TH)).toBe(true);
    expect(cupEndStateSatisfied([A], TH)).toBe(false);
    expect(cupEndStateSatisfied([A, A, A, A], TH)).toBe(false);
    expect(cupEndStateSatisfied([A, A, A, A, A], TH)).toBe(false);
    expect(cupEndStateSatisfied([A, B], TH)).toBe(false);
    expect(isInFinalState([A, A, A, A, A], TH)).toBe(false);
    expect(isInFinalState([A, A, A, A], TH)).toBe(false);
  });

  it('empty thermos + solved rest IS a win; non-empty thermos never wins', () => {
    expect(isWonState([[], [A, A, A, A]], [TH, N])).toBe(true);
    expect(isWonState([[A], [A, A, A, A]], [TH, N])).toBe(false);
    expect(isWonState([[A, A, A, A], [B, B, B, B]], [TH, N])).toBe(false);
    expect(isWonState([[A, A, A, A, A], [B, B, B, B]], [TH, N])).toBe(false);
    expect(isWonState([[], [A, A, A, A], [B, B, B, B]], [TH, N, N])).toBe(true);
  });
});

describe('D. pruning keeps homogeneous-thermos OUT constructive', () => {
  it('full homogeneous thermos -> empty normal stays legal + constructive (must end empty)', () => {
    expect(pourRejectCodeBetween([[A, A, A, A, A], []], 0, 1, [TH, N])).toBe('ok');
    expect(isConstructiveMove([[A, A, A, A, A], []], 0, 1, [TH, N])).toBe(true);
  });

  it('control: full homogeneous NORMAL -> empty normal is still pruned', () => {
    expect(pourRejectCodeBetween([[A, A, A, A], []], 0, 1, [N, N])).toBe('complete-to-empty');
    expect(isConstructiveMove([[A, A, A, A], []], 0, 1, [N, N])).toBe(false);
  });

  it('partial homogeneous thermos -> empty same-signature thermos stays legal but non-constructive', () => {
    expect(canPourBetween([[A, A], []], 0, 1, [TH, TH])).toBe(true);
    expect(isConstructiveMove([[A, A], []], 0, 1, [TH, TH])).toBe(false);
  });
});

describe('E. thermos undo preserves the constraint', () => {
  it('receive into thermos -> undo restores exactly', () => {
    const logic = new TeaSortLogic([[A, A, A, A], []], [0, 0], [N, TH]);
    expect(logic.makeMove(0, 1)?.move.count).toBe(4);
    expect(logic.cups[1]?.layers).toEqual([A, A, A, A]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.cups[0]?.layers).toEqual([A, A, A, A]);
    expect(logic.cups[1]?.layers).toEqual([]);
    expect(logic.movesCount).toBe(0);
    expect(logic.cupConstraints).toEqual([N, TH]);
  });
});

describe('F. request validation (0/1 recognized, >1 and siblings rejected loudly)', () => {
  const base = {
    numColors: 4,
    colors: [A, B, C, D],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
  } as unknown as GenerateRequest;

  it('requestedThermosCupCount / countThermosCups', () => {
    expect(requestedThermosCupCount(base)).toBe(0);
    expect(requestedThermosCupCount({ ...base, thermosCupCount: 1 })).toBe(1);
    expect(countThermosCups([N, TH])).toBe(1);
    expect(countThermosCups([N, N])).toBe(0);
  });

  it('validateThermosRequest fails loudly on unsupported combos', () => {
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 2 })).toThrow(/max 1/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, numColors: 3 })).toThrow(/4 colors/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, emptyCups: 1 })).toThrow(/4 colors/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, hasMysteryLayer: true })).toThrow(/4 colors/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, sourceOnlyCount: 1 })).toThrow(/4 colors/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, targetTeaIds: [A, B] })).toThrow(/targets/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, sinkOnlyCount: 1 })).toThrow(/sink/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, tastingCupCount: 1 })).toThrow(/tasting/);
    expect(() =>
      validateThermosRequest({ ...base, thermosCupCount: 1, floatingIngredient: 'lemon' }),
    ).toThrow(/lemon/);
    expect(() =>
      validateThermosRequest({ ...base, thermosCupCount: 1, sinkingIngredient: 'honey' }),
    ).toThrow(/honey/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, hasStrainer: true })).toThrow(/strainer/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1, frozenCupCount: 1 })).toThrow(/frozen/);
    expect(() => validateThermosRequest({ ...base, thermosCupCount: 1 })).not.toThrow();
    expect(() => validateThermosRequest(base)).not.toThrow();
  });

  it('signature pin: thermos is N:_:C5:E (distinct from normal and tasting)', () => {
    expect(cupConstraintSignature(TH)).toBe('N:_:C5:E');
    expect(cupConstraintSignature(TASTING)).toBe('N:_:C2:E');
    expect(cupConstraintSignature(N)).toBe('N:_');
  });
});

describe('G. legacy minMove regression (G10 must not shift pre-G10 depths)', () => {
  it.each([
    ['warmup', { numColors: 3, colors: [A, D, B], emptyCups: 2, hasMysteryLayer: false, phase: 'warmup' }, 5],
    ['challenge', { numColors: 4, colors: [A, D, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' }, 6],
    ['peak', { numColors: 5, colors: [A, D, B, 'milk_oolong', C], emptyCups: 2, hasMysteryLayer: true, phase: 'peak' }, 16],
    ['relax', { numColors: 3, colors: ['saffron', A, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'relax' }, 5],
    ['teapot', { numColors: 4, colors: [A, D, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sourceOnlyCount: 1 }, 7],
    ['targets', { numColors: 4, colors: ['saffron', C, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', targetTeaIds: [C, B] }, 10],
    ['sink', { numColors: 4, colors: [A, D, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sinkOnlyCount: 1 }, 6],
    ['tasting', { numColors: 4, colors: [A, D, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', tastingCupCount: 1 }, 9],
    ['lemon', { numColors: 4, colors: [D, A, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', floatingIngredient: 'lemon' }, 9],
    ['strainer', { numColors: 4, colors: [A, D, B, 'milk_oolong'], emptyCups: 1, hasMysteryLayer: false, phase: 'challenge', hasStrainer: true }, 13],
    ['honey', { numColors: 4, colors: ['buckwheat', A, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', sinkingIngredient: 'honey' }, 12],
    ['lemon+honey', { numColors: 4, colors: ['buckwheat', D, A, B], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', floatingIngredient: 'lemon', sinkingIngredient: 'honey' }, 11],
    ['frozen', { numColors: 4, colors: [D, A, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', frozenCupCount: 1 }, 11],
  ] as Array<[string, GenerateRequest, number]>)('%s fallback stays at exact depth %i', (_name, req, depth) => {
    const lvl = fallbackLevel(req);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    expect(lvl.minMoves).toBe(depth);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
      strainer: lvl.strainer,
      iceSlots: lvl.iceSlots,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
  });
});
