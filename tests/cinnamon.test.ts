/**
 * Gauntlet 11 — cinnamon stick («Палочка корицы») domain matrix (§§55-64 + GI–GJ).
 *
 * Rules: dynamic capacity 2→4 on a standard normal vessel. Active receive
 * m=1 (§55), active full target-full (§56), partial keeps stick (§57),
 * unlock single (§58), multi unlock (§59), post-unlock 3+4 (§60), invalid
 * no-remove (§61), active-not-final incl [A,A]+cin (§62), unlocked 4/4
 * satisfied (§63), empty+active fail-closed (§64), effectiveCupCapacity
 * truth + cupCapacity static untouched, no duplicate location state.
 * Plus request validation (0/1 recognized, >1 and every sibling special
 * rejected loudly) and the §150 legacy minMove regression: representative
 * pre-G11 fallback depths pinned exactly (G11 must not shift them).
 */
import { describe, expect, it } from 'vitest';
import {
  CINNAMON_EFFECTIVE_CAPACITY,
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  cupCapacity,
  defaultCupConstraints,
  effectiveCupCapacity,
  emptyCapacityObstacles,
  emptyFloatingIngredients,
  normalizeCapacityObstacles,
  countCapacityObstacles,
  type CapacityObstacleSlot,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  canPourState,
  cupEndStateSatisfied,
  isConstructiveMoveState,
  isInFinalState,
  isPuzzleWonState,
  isWonState,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  fallbackLevel,
  requestedCinnamonCupCount,
  validateCinnamonRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const D: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };

function stateWith(
  cups: TeaId[][],
  obstacles: CapacityObstacleSlot[],
  cons?: CupConstraint[],
): { cups: TeaId[][]; floatingIngredients: (null)[]; capacityObstacles: CapacityObstacleSlot[] } {
  return {
    cups,
    floatingIngredients: cups.map(() => null),
    capacityObstacles: [...obstacles],
  };
}

describe('A. effective capacity truth + static untouched (no duplicate state)', () => {
  it('CINNAMON_EFFECTIVE_CAPACITY is 2; effective is min(base,2) while active', () => {
    expect(CINNAMON_EFFECTIVE_CAPACITY).toBe(2);
    expect(TEA_UNITS_PER_COLOR).toBe(4);
    expect(STANDARD_CUP_CAPACITY).toBe(4);
    expect(effectiveCupCapacity(N, 'cinnamon')).toBe(2);
    expect(effectiveCupCapacity(N, null)).toBe(4);
    expect(effectiveCupCapacity(N, undefined)).toBe(4);
    expect(effectiveCupCapacity(undefined, 'cinnamon')).toBe(2);
    expect(effectiveCupCapacity(undefined, null)).toBe(4);
  });

  it('cupCapacity stays static (base 4) even while active — never mutated by state', () => {
    expect(cupCapacity(N)).toBe(4);
    expect(cupCapacity(undefined)).toBe(4);
    expect(cupCapacity({ mode: 'normal', capacity: 4 })).toBe(4);
    // Effective is the ONLY dynamic truth; static never depends on PuzzleState.
    expect(cupCapacity(N)).toBe(effectiveCupCapacity(N, null));
    expect(cupCapacity(N)).not.toBe(effectiveCupCapacity(N, 'cinnamon'));
  });

  it('single authoritative obstacle location: aligned array, no cupIndex duplicate', () => {
    expect(emptyCapacityObstacles(3)).toEqual([null, null, null]);
    expect(normalizeCapacityObstacles(undefined, 2)).toEqual([null, null]);
    expect(normalizeCapacityObstacles(['cinnamon', null], 2)).toEqual(['cinnamon', null]);
    expect(countCapacityObstacles({ capacityObstacles: ['cinnamon', null, null] })).toBe(1);
    expect(countCapacityObstacles({ capacityObstacles: [null, null] })).toBe(0);
    const logic = new TeaSortLogic([[A, B], []], [0, 0], [N, N], undefined, undefined, undefined, undefined, [
      'cinnamon',
      null,
    ]);
    expect(logic.capacityObstacles).toEqual(['cinnamon', null]);
    const st = logic.toState() as unknown as Record<string, unknown>;
    expect('cinnamonCupIndex' in st).toBe(false);
    expect('cinnamonHost' in st).toBe(false);
    expect('stickIndex' in st).toBe(false);
    // Cup owns the slot exactly like ice (no second mutable truth).
    expect(logic.cups[0]?.capacityObstacle).toBe('cinnamon');
    expect(logic.cups[1]?.capacityObstacle).toBe(null);
  });

  it('TeaSortLogic Cup keeps the static base capacity while active', () => {
    const logic = new TeaSortLogic([[A, B], []], [0, 0], [N, N], undefined, undefined, undefined, undefined, [
      'cinnamon',
      null,
    ]);
    expect(logic.cups[0]?.capacity).toBe(4);
    expect(logic.cups[0]?.constraint).toEqual(N);
  });
});

describe('B. active receive m=1 (§55)', () => {
  it('one free slot in an active cup receives exactly 1 matching layer', () => {
    const cups: TeaId[][] = [[A, A], [A]];
    const obs: CapacityObstacleSlot[] = [null, 'cinnamon'];
    const cons = [N, N];
    const st = stateWith(cups, obs);
    // Source [A,A] top AA, dest [A] active (eff2, 1 free): m=1.
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('ok');
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    expect(pourCountState(st, 0, 1, cons)).toBe(1);
    const res = applyPourState(st, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(1);
    expect(res?.received).toBe(1);
    expect(res?.state.cups[1]).toEqual([A, A]);
    expect(res?.state.capacityObstacles[1]).toBe('cinnamon');
    expect(res?.capacityObstacleRemoved).toBe(undefined);
  });

  it('color mismatch into active still rejected (stick changes no color rules)', () => {
    const st = stateWith([[B], [A]], [null, 'cinnamon']);
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('color-mismatch');
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
  });
});

describe('C. active full target-full (§56)', () => {
  it('2/2 active cup is full: nothing more fits, ice-style no-space rule', () => {
    const st = stateWith([[A], [A, B]], [null, 'cinnamon']);
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('target-full');
    expect(canPourState(st, 0, 1, [N, N])).toBe(false);
    expect(pourCountState(st, 0, 1, [N, N])).toBe(0);
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
    // Obstacle untouched by the rejected pour.
    expect(st.capacityObstacles[1]).toBe('cinnamon');
  });

  it('empty active cup still receives (0/2 is not full)', () => {
    const st = stateWith([[A, A], []], [null, 'cinnamon']);
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('ok');
  });
});

describe('D. partial keeps stick (§57)', () => {
  it('partial outflow leaving tea behind keeps the obstacle', () => {
    const st = stateWith([[ ], [A, B]], [null, 'cinnamon']);
    // Move top B out to empty: m=1, leaves [A].
    const res = applyPourState({ cups: [[], [A, B]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, 'cinnamon'] }, 1, 0, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.state.cups[1]).toEqual([A]);
    expect(res?.state.capacityObstacles[1]).toBe('cinnamon');
    expect(res?.capacityObstacleRemoved).toBe(undefined);
    void st;
  });

  it('TeaSortLogic partial keeps stick with exact undo', () => {
    const logic = new TeaSortLogic(
      [[], [A, B]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      [null, 'cinnamon'],
    );
    const mv = logic.makeMove(1, 0);
    expect(mv).not.toBe(null);
    expect(mv?.capacityObstacleRemoved).toBe(undefined);
    expect(logic.toState().cups[1]).toEqual([A]);
    expect(logic.toState().capacityObstacles).toEqual([null, 'cinnamon']);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[], [A, B]]);
    expect(logic.toState().capacityObstacles).toEqual([null, 'cinnamon']);
  });
});

describe('E. unlock single (§58)', () => {
  it('single-layer active host empties in one pour and removes atomically', () => {
    const st = stateWith([[], [A]], [null, 'cinnamon']);
    const res = applyPourState(
      { cups: [[], [A]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, 'cinnamon'] },
      1,
      0,
      [N, N],
    );
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(1);
    expect(res?.state.cups[1]).toEqual([]);
    expect(res?.state.capacityObstacles[1]).toBe(null);
    expect(res?.capacityObstacleRemoved).toBe('cinnamon');
  });

  it('TeaSortLogic single unlock reports metadata and restores on undo', () => {
    const logic = new TeaSortLogic(
      [[], [A]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      [null, 'cinnamon'],
    );
    const mv = logic.makeMove(1, 0);
    expect(mv?.capacityObstacleRemoved).toBe('cinnamon');
    expect(logic.toState().capacityObstacles).toEqual([null, null]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().capacityObstacles).toEqual([null, 'cinnamon']);
    expect(logic.toState().cups).toEqual([[], [A]]);
    expect(logic.movesCount).toBe(0);
  });
});

describe('F. multi unlock (§59)', () => {
  it('mixed len-2 host unlocks in two pours: partial keeps, empty removes', () => {
    const cons = [N, N, N];
    let st = { cups: [[], [], [A, B]] as TeaId[][], floatingIngredients: [null, null, null], capacityObstacles: [null, null, 'cinnamon'] as CapacityObstacleSlot[] };
    const r1 = applyPourState(st, 2, 0, cons);
    expect(r1).not.toBe(null);
    expect(r1?.state.cups[2]).toEqual([A]);
    expect(r1?.state.capacityObstacles[2]).toBe('cinnamon');
    expect(r1?.capacityObstacleRemoved).toBe(undefined);
    st = { cups: r1?.state.cups as TeaId[][], floatingIngredients: [null, null, null], capacityObstacles: [...(r1?.state.capacityObstacles as CapacityObstacleSlot[])] };
    const r2 = applyPourState(st, 2, 1, cons);
    expect(r2).not.toBe(null);
    expect(r2?.state.cups[2]).toEqual([]);
    expect(r2?.state.capacityObstacles[2]).toBe(null);
    expect(r2?.capacityObstacleRemoved).toBe('cinnamon');
  });
});

describe('G. post-unlock 3+4 (§60)', () => {
  it('unlocked vessel holds 3 and 4 layers (expanded workspace)', () => {
    // Unlock first via two empties: 2->0 (B), then 2->1 (A, removes).
    const logic = new TeaSortLogic(
      [[], [], [A, B]],
      [0, 0, 0],
      [N, N, N],
      undefined,
      undefined,
      undefined,
      undefined,
      [null, null, 'cinnamon'],
    );
    expect(logic.makeMove(2, 0)).not.toBe(null);
    expect(logic.toState().capacityObstacles[2]).toBe('cinnamon');
    expect(logic.toState().cups[2]).toEqual([A]);
    expect(logic.makeMove(2, 1)).not.toBe(null);
    expect(logic.toState().capacityObstacles[2]).toBe(null);
    // Now unlocked empty host receives 3 and then a 4th.
    expect(logic.toState().cups[2]).toEqual([]);
    // Refill path: use fresh logic with unlocked host.
    const logic2 = new TeaSortLogic(
      [[A, A, A], [A], []],
      [0, 0, 0],
      [N, N, N],
    );
    expect(logic2.makeMove(0, 2)).not.toBe(null);
    expect(logic2.cups[2]?.layers).toEqual([A, A, A]);
    expect(logic2.makeMove(1, 2)).not.toBe(null);
    expect(logic2.cups[2]?.layers).toEqual([A, A, A, A]);
  });
});

describe('H. invalid no-remove (§61)', () => {
  it('illegal pours leave the obstacle untouched with zero mutation', () => {
    const cups: TeaId[][] = [[B], [A, B]];
    const obs: CapacityObstacleSlot[] = [null, 'cinnamon'];
    const beforeCups = cups.map((c) => [...c]);
    const beforeObs = [...obs];
    // Active full (2/2) outranks color: use a non-full active host for mismatch.
    // [[C],[A]] active at 1 holds 1/2, so C onto A is a pure color-mismatch.
    const st = stateWith([[C], [A]], [null, 'cinnamon']);
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('color-mismatch');
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
    expect(st.cups).toEqual([[C], [A]]);
    expect(st.capacityObstacles).toEqual([null, 'cinnamon']);
    // Same-cup and out-of-range also no-remove.
    expect(applyPourState(st, 1, 1, [N, N])).toBe(null);
    expect(applyPourState(st, 5, 0, [N, N, N])).toBe(null);
    expect(cups).toEqual(beforeCups);
    expect(obs).toEqual(beforeObs);
  });

  it('receiving never removes (only emptying source unlocks)', () => {
    const st = stateWith([[A], [A]], [null, 'cinnamon']);
    const res = applyPourState(
      { cups: [[A], [A]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, 'cinnamon'] },
      0,
      1,
      [N, N],
    );
    expect(res).not.toBe(null);
    expect(res?.state.capacityObstacles).toEqual([null, 'cinnamon']);
    expect(res?.capacityObstacleRemoved).toBe(undefined);
  });
});

describe('I. active-not-final incl [A,A]+cin (§62)', () => {
  it('non-empty active vessel is NEVER final — even homogeneous full-to-effective', () => {
    expect(isInFinalState([A, A], N, 'cinnamon')).toBe(false);
    expect(isInFinalState([A, B], N, 'cinnamon')).toBe(false);
    expect(isInFinalState([A], N, 'cinnamon')).toBe(false);
    expect(isInFinalState([A, A, A, A], N, 'cinnamon')).toBe(false);
    // Control: same stacks without obstacle follow ordinary semantics.
    expect(isInFinalState([A, A, A, A], N, null)).toBe(true);
    expect(isInFinalState([A, A, A, A], N, undefined)).toBe(true);
    expect(isInFinalState([A, A], N, null)).toBe(false);
  });

  it('active homogeneous-thermos-style full stack still needs unlocking to win', () => {
    const st = stateWith([[A, A, A, A], [A, A]], [null, 'cinnamon']);
    expect(isPuzzleWonState(st, [N, N])).toBe(false);
    expect(isWonState([[A, A, A, A], [A, A]], [N, N])).toBe(false);
  });
});

describe('J. unlocked 4/4 satisfied (§63)', () => {
  it('unlocked 4/4 homogeneous satisfies; active never does', () => {
    expect(cupEndStateSatisfied([A, A, A, A], N)).toBe(true);
    expect(isInFinalState([A, A, A, A], N, null)).toBe(true);
    expect(isInFinalState([A, A, A, A], N, 'cinnamon')).toBe(false);
    expect(isWonState([[], [A, A, A, A]], [N, N])).toBe(true);
  });
});

describe('K. empty+active fail-closed (§64)', () => {
  it('empty vessel with active obstacle is never a win (malformed, fail-closed)', () => {
    const st = stateWith([[], [A, A, A, A]], ['cinnamon', null]);
    // Tea alone would be won, but the active obstacle blocks victory.
    expect(isWonState([[], [A, A, A, A]], [N, N])).toBe(true);
    expect(isPuzzleWonState(st, [N, N])).toBe(false);
    // Empty+active is not final either.
    expect(isInFinalState([], N, 'cinnamon')).toBe(false);
  });
});

describe('L. win requires cleared + pruning (active never final/never pruned)', () => {
  it('tea-sorted board with active obstacle is not won; cleared is', () => {
    const active = stateWith(
      [[A, A, A, A], [B, B, B, B]],
      ['cinnamon', null],
    );
    expect(isPuzzleWonState(active, [N, N])).toBe(false);
    const cleared = stateWith(
      [[A, A, A, A], [B, B, B, B]],
      [null, null],
    );
    expect(isPuzzleWonState(cleared, [N, N])).toBe(true);
  });

  it('any pour touching an active obstacle is never pruned (unlock is progress)', () => {
    const cons = [N, N];
    // Homogeneous full normal -> empty normal is pruned (control).
    expect(isConstructiveMoveState(stateWith([[A, A, A, A], []], [null, null]), 0, 1, cons)).toBe(false);
    // Same tea but source active: emptying removes the obstacle — constructive.
    expect(isConstructiveMoveState(stateWith([[A, A], []], ['cinnamon', null]), 0, 1, cons)).toBe(true);
    // Receiving into active also constructive (decorated contents change):
    // [A] onto active [A] (1/2, matching) is legal and never pruned.
    expect(isConstructiveMoveState(stateWith([[A], [A]], [null, 'cinnamon']), 0, 1, cons)).toBe(true);
  });
});

describe('M. request validation (0/1 recognized, >1 and siblings rejected loudly)', () => {
  const base = {
    numColors: 4,
    colors: [A, B, C, D],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
  } as unknown as GenerateRequest;

  it('requestedCinnamonCupCount normalization', () => {
    expect(requestedCinnamonCupCount(base)).toBe(0);
    expect(requestedCinnamonCupCount({ ...base, cinnamonCupCount: 1 })).toBe(1);
    expect(requestedCinnamonCupCount({ ...base, cinnamonCupCount: 2 })).toBe(2);
  });

  it('validateCinnamonRequest fails loudly on unsupported combos', () => {
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 2 })).toThrow(/max 1/);
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, numColors: 3 })).toThrow(/4 colors/);
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, emptyCups: 1 })).toThrow(/4 colors/);
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, hasMysteryLayer: true })).toThrow(
      /4 colors/,
    );
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, sourceOnlyCount: 1 })).toThrow(
      /4 colors/,
    );
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, targetTeaIds: [A, B] })).toThrow(
      /targets/,
    );
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, sinkOnlyCount: 1 })).toThrow(/sink/);
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, tastingCupCount: 1 })).toThrow(
      /tasting/,
    );
    expect(() =>
      validateCinnamonRequest({ ...base, cinnamonCupCount: 1, floatingIngredient: 'lemon' }),
    ).toThrow(/lemon/);
    expect(() =>
      validateCinnamonRequest({ ...base, cinnamonCupCount: 1, sinkingIngredient: 'honey' }),
    ).toThrow(/honey/);
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, hasStrainer: true })).toThrow(
      /strainer/,
    );
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, frozenCupCount: 1 })).toThrow(
      /frozen/,
    );
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1, thermosCupCount: 1 })).toThrow(
      /thermos/,
    );
    expect(() => validateCinnamonRequest({ ...base, cinnamonCupCount: 1 })).not.toThrow();
    expect(() => validateCinnamonRequest(base)).not.toThrow();
  });
});

describe('N. §150 legacy minMove regression (G11 must not shift pre-G11 depths)', () => {
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
    ['thermos', { numColors: 4, colors: [A, D, B, 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge', thermosCupCount: 1 }, 11],
  ] as Array<[string, GenerateRequest, number]>)('%s fallback stays at exact depth %i', (_name, req, depth) => {
    const lvl = fallbackLevel(req);
    expect(lvl.minMoves).toBe(depth);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
      strainer: lvl.strainer,
      iceSlots: lvl.iceSlots,
      capacityObstacles: lvl.capacityObstacles,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
  });

  it('default constraints carry no obstacle (legacy boards unaffected)', () => {
    expect(defaultCupConstraints(2)).toEqual([{ mode: 'normal' }, { mode: 'normal' }]);
    expect(emptyCapacityObstacles(2)).toEqual([null, null]);
  });
});
