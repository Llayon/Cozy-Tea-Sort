/**
 * G18 visual contract — structural proof for the mobile presentation fixes.
 *
 * - ONE continuous shared tray (not two planks), exactly six group markers.
 * - Pair bowls vs tasting bowls use different persistent silhouettes/capacity
 *   semantics; pair members can never become numbered serving cups or targets.
 * - Pair accent is derived from current cups every time: reopening the anchor
 *   drops the old commitment (no stale TeaId).
 */
import { describe, expect, it } from 'vitest';
import {
  cupCapacity,
  mustEndEmpty,
  SHARED_CAPACITY_LIMITS,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  isValidPairedTeaMemberConstraint,
  pairedTeaStatus,
  validatePairedTeaConstraints,
} from '../src/game/logic/teaPair';
import { sharedCapacityOccupancy } from '../src/game/logic/sharedCapacity';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  PAIR_BOWL_BODY_H,
  PAIR_MATCH_FLOURISH_MS,
  SHARED_TRAY_PLANK_H,
  TASTING_BOWL_BODY_H,
  pairMatchFlourishTea,
  sharedTrayGeometry,
} from '../src/game/view/TeaSortView';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const P: CupConstraint = { mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };
const TRAY: CupConstraint = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
const N: CupConstraint = { mode: 'normal' };

describe('shared tray is ONE continuous group object', () => {
  it('spans both member cups with exactly six group markers', () => {
    const left = { index: 0, x: 59, y: 252, width: 69, height: 153 };
    const right = { index: 1, x: 160, y: 252, width: 69, height: 153 };
    const geo = sharedTrayGeometry([left, right]);
    expect(geo).not.toBeNull();
    expect(geo?.markerXs).toHaveLength(SHARED_CAPACITY_LIMITS['tea-tray']);
    expect(geo?.memberIndices).toEqual([0, 1]);
    expect(geo?.height).toBe(SHARED_TRAY_PLANK_H);
    // One plank starts before the left cup and ends after the right cup;
    // no gap between the two cup footprints.
    expect(geo!.x).toBeLessThan(left.x);
    expect(geo!.x + geo!.width).toBeGreaterThan(right.x + right.width);
    expect(geo!.width).toBeGreaterThan(right.x + right.width - left.x);
    // Markers strictly increase and sit inside the tray.
    for (let i = 1; i < geo!.markerXs.length; i++) {
      expect(geo!.markerXs[i]).toBeGreaterThan(geo!.markerXs[i - 1] as number);
    }
    for (const x of geo!.markerXs) {
      expect(x).toBeGreaterThan(geo!.x);
      expect(x).toBeLessThan(geo!.x + geo!.width);
    }
  });

  it('fails closed for malformed member counts', () => {
    expect(sharedTrayGeometry([])).toBeNull();
    expect(sharedTrayGeometry([{ index: 0, x: 0, y: 0, width: 10, height: 10 }])).toBeNull();
    expect(
      sharedTrayGeometry([
        { index: 0, x: 0, y: 0, width: 10, height: 10 },
        { index: 1, x: 20, y: 0, width: 10, height: 10 },
        { index: 2, x: 40, y: 0, width: 10, height: 10 },
      ]),
    ).toBeNull();
  });

  it('occupancy derives from both members and frees shared space', () => {
    const logic = new TeaSortLogic(
      [
        [A, A, B],
        [B, B, A],
        [A, A],
        [],
      ],
      [0, 0, 0, 0],
      [TRAY, TRAY, N, N],
    );
    const constraints = logic.toState().cupConstraints;
    expect(sharedCapacityOccupancy(logic.toState(), constraints, 'tea-tray')).toBe(6);
    // Tray -> outside is allowed and reduces group occupancy.
    const move = logic.makeMove(0, 3);
    expect(move).not.toBeNull();
    expect(sharedCapacityOccupancy(logic.toState(), constraints, 'tea-tray')).toBeLessThan(6);
    expect(sharedCapacityOccupancy(logic.toState(), constraints, 'tea-tray')).toBe(
      6 - (move?.move.count ?? 0),
    );
  });
});

describe('tasting vs tea pair persistent identity', () => {
  it('uses different silhouette heights and different end semantics', () => {
    expect(PAIR_BOWL_BODY_H).toBeGreaterThan(TASTING_BOWL_BODY_H);
    expect(cupCapacity(P)).toBe(2);
    expect(cupCapacity(T)).toBe(2);
    expect(mustEndEmpty(P)).toBe(false);
    expect(mustEndEmpty(T)).toBe(true);
  });

  it('pair members can never become numbered serving cups, targets or travel on a tray', () => {
    expect(isValidPairedTeaMemberConstraint(P)).toBe(true);
    expect(isValidPairedTeaMemberConstraint({ ...P, serveOrder: 1 })).toBe(false);
    expect(isValidPairedTeaMemberConstraint({ ...P, targetTeaId: A })).toBe(false);
    expect(isValidPairedTeaMemberConstraint({ ...P, sharedCapacityGroup: 'tea-tray' })).toBe(false);
    expect(validatePairedTeaConstraints([{ ...P, serveOrder: 1 }, P])).not.toEqual([]);
  });

  it('pair accent is derived: committed(X) -> reopen -> uncommitted -> committed(Y) -> matched(Y)', () => {
    const constraints = [P, P, N, N];
    const uncommitted = pairedTeaStatus({ cups: [[A, B], [A, B], [], []] }, constraints);
    expect(uncommitted.kind).toBe('uncommitted');

    const committedX = pairedTeaStatus({ cups: [[A, A], [A, B], [], []] }, constraints);
    expect(committedX).toMatchObject({ kind: 'committed', tea: A });

    const reopened = pairedTeaStatus({ cups: [[], [A, B], [], []] }, constraints);
    expect(reopened.kind).toBe('uncommitted');
    // The old X accent cannot survive: status is a pure function of cups.
    expect(pairMatchFlourishTea(committedX, reopened)).toBeNull();

    const committedY = pairedTeaStatus({ cups: [[], [B, B], [], []] }, constraints);
    expect(committedY).toMatchObject({ kind: 'committed', tea: B });
    expect(pairMatchFlourishTea(committedX, committedY)).toBeNull();

    const matchedY = pairedTeaStatus({ cups: [[B, B], [B, B], [], []] }, constraints);
    expect(matchedY).toMatchObject({ kind: 'matched', tea: B });
    expect(pairMatchFlourishTea(committedY, matchedY)).toBe(B);
    expect(PAIR_MATCH_FLOURISH_MS).toBeGreaterThanOrEqual(300);
    expect(PAIR_MATCH_FLOURISH_MS).toBeLessThanOrEqual(450);
  });
});
