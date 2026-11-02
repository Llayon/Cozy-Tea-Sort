/**
 * Gauntlet 20 kernel — steeping flask («Заварочная колба»).
 *
 * Derived source readiness only: no runtime ready state, no new action, no
 * second pour/solver. These tests exercise the static constraint, canonical
 * identity and the single pour-legality truth.
 */
import { describe, expect, it } from 'vitest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  cupConstraintSignature,
  emptyFloatingIngredients,
  isSteepingFlaskConstraint,
  isValidSteepingFlaskConstraint,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  canPourState,
  cupEndStateSatisfied,
  isSteepingFlaskReady,
  pourCountState,
  pourRejectCodeState,
  type PourRejectCode,
} from '../src/game/logic/rules';
import {
  mechanicCompatibility,
  validateSteepingFlaskCombination,
} from '../src/game/logic/mechanicCompatibility';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';

function flask(): CupConstraint {
  return cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
}

function state(cups: TeaId[][], constraints: CupConstraint[]) {
  return { cups, floatingIngredients: emptyFloatingIngredients(cups.length), constraints };
}

function reject(
  cups: TeaId[][],
  constraints: CupConstraint[],
  from: number,
  to: number,
): PourRejectCode {
  return pourRejectCodeState(state(cups, constraints), from, to, constraints);
}

describe('G20 steeping-flask static identity', () => {
  it('valid flask is normal / cap4 / mustEndEmpty / marked / no siblings', () => {
    const f = flask();
    expect(isSteepingFlaskConstraint(f)).toBe(true);
    expect(isValidSteepingFlaskConstraint(f)).toBe(true);
    expect(f).toEqual({ mode: 'normal', capacity: 4, mustEndEmpty: true, steepingFlask: true });
  });

  it('clone copies steepingFlask exactly', () => {
    expect(cloneCupConstraint(flask()).steepingFlask).toBe(true);
    expect(cloneCupConstraint({ mode: 'normal' }).steepingFlask).toBeUndefined();
  });

  it('effective capacity stays 4', () => {
    expect(STEEPING_FLASK_CONSTRAINT.capacity).toBe(4);
  });

  it('canonical suffix is :SF and differs from normal/tasting/thermos', () => {
    expect(cupConstraintSignature(flask())).toBe('N:_:C4:E:SF');
    expect(cupConstraintSignature(flask())).not.toBe(cupConstraintSignature({ mode: 'normal' }));
    expect(cupConstraintSignature(flask())).not.toBe(
      cupConstraintSignature({ mode: 'normal', capacity: 2, mustEndEmpty: true }),
    );
    expect(cupConstraintSignature(flask())).not.toBe(
      cupConstraintSignature({ mode: 'normal', capacity: 5, mustEndEmpty: true }),
    );
  });

  it('absent marker leaves legacy key byte-identical', () => {
    const legacy: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true };
    expect(cupConstraintSignature(legacy)).toBe('N:_:C4:E');
    expect(cupConstraintSignature({ mode: 'normal' })).toBe('N:_');
  });

  it('malformed flask shapes fail closed', () => {
    const malformed: CupConstraint[] = [
      { mode: 'source-only', capacity: 4, mustEndEmpty: true, steepingFlask: true },
      { mode: 'sink-only', capacity: 4, mustEndEmpty: true, steepingFlask: true },
      { mode: 'normal', capacity: 4, steepingFlask: true },
      { mode: 'normal', capacity: 2, mustEndEmpty: true, steepingFlask: true },
      { mode: 'normal', capacity: 4, mustEndEmpty: true, steepingFlask: true, serveOrder: 1 },
      { mode: 'normal', capacity: 4, mustEndEmpty: true, steepingFlask: true, targetTeaId: A },
    ];
    for (const c of malformed) expect(isValidSteepingFlaskConstraint(c)).toBe(false);
  });
});

describe('G20 derived readiness', () => {
  it('empty / partial are not ready', () => {
    expect(isSteepingFlaskReady([], flask())).toBe(false);
    expect(isSteepingFlaskReady([A], flask())).toBe(false);
    expect(isSteepingFlaskReady([A, A], flask())).toBe(false);
    expect(isSteepingFlaskReady([A, A, A], flask())).toBe(false);
  });

  it('full homogeneous is ready', () => {
    expect(isSteepingFlaskReady([A, A, A, A], flask())).toBe(true);
  });

  it('full mixed is not ready (fail closed)', () => {
    expect(isSteepingFlaskReady([A, B, A, B], flask())).toBe(false);
  });

  it('marker is required', () => {
    expect(isSteepingFlaskReady([A, A, A, A], { mode: 'normal', capacity: 4, mustEndEmpty: true })).toBe(
      false,
    );
  });

  it('malformed flask constraint never ready', () => {
    expect(
      isSteepingFlaskReady([A, A, A, A], {
        mode: 'normal',
        capacity: 4,
        steepingFlask: true,
      }),
    ).toBe(false);
  });
});

describe('G20 source gate precedence', () => {
  it('empty flask reports source-empty, not steeping-not-ready', () => {
    const c = [flask(), { mode: 'normal' as const }];
    expect(reject([[], []], c, 0, 1)).toBe('source-empty');
  });

  it.each([
    [[A]],
    [[A, A]],
    [[A, A, A]],
  ])('partial flask %j rejects source-steeping-not-ready', (layers) => {
    const c = [flask(), { mode: 'normal' as const }];
    expect(reject([layers as TeaId[], []], c, 0, 1)).toBe('source-steeping-not-ready');
  });

  it('full mixed flask rejects source-steeping-not-ready', () => {
    const c = [flask(), { mode: 'normal' as const }];
    expect(reject([[A, B, A, B], []], c, 0, 1)).toBe('source-steeping-not-ready');
  });

  it('addressing/role precedence is preserved', () => {
    const c = [flask(), { mode: 'normal' as const }, { mode: 'source-only' as const }];
    expect(reject([[A, A], [], []], c, 0, 0)).toBe('same-cup');
    expect(reject([[A, A], [], []], c, -1, 1)).toBe('out-of-range');
    expect(reject([[A, A], [], []], c, 0, 2)).toBe('target-source-only');
    expect(reject([[A, A], [], []], c, 1, 0)).toBe('source-empty');
  });

  it('ready flask sources normally', () => {
    const c = [flask(), { mode: 'normal' as const }];
    expect(reject([[A, A, A, A], []], c, 0, 1)).toBe('ok');
  });
});

describe('G20 ordinary inflow', () => {
  it('normal source may fill an empty flask', () => {
    const c = [{ mode: 'normal' as const }, flask()];
    expect(reject([[A, A, A, A], []], c, 0, 1)).toBe('ok');
    expect(pourCountState(state([[A], []], c), 0, 1, c)).toBe(1);
  });

  it('partial flask receives matching tea under ordinary rules', () => {
    const c = [{ mode: 'normal' as const }, flask()];
    expect(reject([[A], [A, A]], c, 0, 1)).toBe('ok');
  });

  it('wrong color is ordinary color-mismatch (no flask-specific reason)', () => {
    const c = [{ mode: 'normal' as const }, flask()];
    expect(reject([[B], [A, A]], c, 0, 1)).toBe('color-mismatch');
  });
});

describe('G20 release and derived relock', () => {
  it('clean decant: full flask -> empty ordinary moves 4 and empties flask', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const before = state([[A, A, A, A], []], c);
    expect(pourCountState(before, 0, 1, c)).toBe(4);
    const result = applyPourState(before, 0, 1, c);
    expect(result).not.toBeNull();
    expect(result!.transferred).toBe(4);
    expect(result!.state.cups[0]).toEqual([]);
    expect(result!.state.cups[1]).toEqual([A, A, A, A]);
  });

  it('partial release 4 -> 2 relocks automatically', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const before = state([[A, A, A, A], [A, A]], c);
    expect(pourCountState(before, 0, 1, c)).toBe(2);
    const result = applyPourState(before, 0, 1, c);
    expect(result).not.toBeNull();
    expect(result!.state.cups[0]).toEqual([A, A]);
    expect(result!.state.cups[1]).toEqual([A, A, A, A]);
    expect(isSteepingFlaskReady(result!.state.cups[0] as TeaId[], c[0])).toBe(false);
    expect(
      pourRejectCodeState(result!.state, 0, 1, c),
    ).toBe('source-steeping-not-ready');
  });

  it('one-slot release 4 -> 3 relocks', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const before = state([[A, A, A, A], [A, A, A]], c);
    expect(pourCountState(before, 0, 1, c)).toBe(1);
    const result = applyPourState(before, 0, 1, c)!;
    expect(result.state.cups[0]).toEqual([A, A, A]);
    expect(pourRejectCodeState(result.state, 0, 1, c)).toBe('source-steeping-not-ready');
  });
});

describe('G20 end-state semantics', () => {
  it('empty flask satisfies its own end requirement', () => {
    expect(cupEndStateSatisfied([], flask())).toBe(true);
  });

  it('full homogeneous flask is NOT final', () => {
    expect(cupEndStateSatisfied([A, A, A, A], flask())).toBe(false);
  });

  it('partial/mixed flask is not final', () => {
    expect(cupEndStateSatisfied([A, A], flask())).toBe(false);
    expect(cupEndStateSatisfied([A, B, A, B], flask())).toBe(false);
  });

  it('malformed flask never satisfies victory', () => {
    expect(
      cupEndStateSatisfied([], {
        mode: 'normal',
        capacity: 4,
        steepingFlask: true,
      }),
    ).toBe(false);
  });
});

describe('G20 compatibility policy', () => {
  it('flask is standalone in production', () => {
    expect(
      validateSteepingFlaskCombination({
        steepingFlask: true,
        servingOrder: false,
        mystery: false,
        tastingCount: 0,
        honey: false,
        strainer: false,
        blend: false,
        sharedTray: false,
        teaPair: false,
      }),
    ).toEqual([]);
  });

  it('blend + flask is forbidden; others are research at level / forbid same cup', () => {
    expect(mechanicCompatibility('blend', 'steepingFlask')).toMatchObject({
      sameLevel: 'forbid',
      sameCup: 'forbid',
    });
    expect(mechanicCompatibility('steepingFlask', 'sharedTray')).toMatchObject({
      sameLevel: 'allow',
      sameCup: 'forbid',
    });
    for (const other of ['teaPair', 'servingOrder', 'tasting', 'mystery', 'honey', 'strainer'] as const) {
      expect(mechanicCompatibility('steepingFlask', other)).toMatchObject({
        sameLevel: 'research',
        sameCup: 'forbid',
      });
    }
  });

  it('production validator rejects every sibling composition', () => {
    expect(
      validateSteepingFlaskCombination({
        steepingFlask: true,
        servingOrder: true,
        mystery: false,
        tastingCount: 0,
        honey: false,
        strainer: false,
        blend: false,
        sharedTray: false,
        teaPair: false,
      }),
    ).not.toEqual([]);
    expect(
      validateSteepingFlaskCombination({
        steepingFlask: true,
        servingOrder: false,
        mystery: false,
        tastingCount: 0,
        honey: false,
        strainer: false,
        blend: true,
        sharedTray: false,
        teaPair: false,
      }),
    ).not.toEqual([]);
  });

  it('canActAsSource remains true for a valid flask (it can source when ready)', () => {
    // Indirect: a ready flask pours successfully; a partial one is blocked
    // only by the derived readiness gate, not a permanent role ban.
    const c = [flask(), { mode: 'normal' as const }];
    expect(canPourState(state([[A, A, A, A], []], c), 0, 1, c)).toBe(true);
    expect(canPourState(state([[A, A], []], c), 0, 1, c)).toBe(false);
  });
});
