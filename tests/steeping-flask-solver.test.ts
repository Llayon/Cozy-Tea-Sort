/**
 * G20 canonical identity + solver/deadlock kernel.
 */
import { describe, expect, it } from 'vitest';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  cupConstraintSignature,
  emptyFloatingIngredients,
  normalizeCupConstraints,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  canonicalPuzzleKey,
  isConstructiveMoveState,
  isPuzzleWonState,
  isSteepingFlaskReady,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';

function flask(): CupConstraint {
  return cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
}

function state(cups: TeaId[][], constraints: CupConstraint[]) {
  return { cups, floatingIngredients: emptyFloatingIngredients(cups.length) };
}

describe('G20 canonical identity', () => {
  it('flask suffix mirrors the static marker only', () => {
    const withFlask = flask();
    const noMarker: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true };
    expect(cupConstraintSignature(withFlask)).toBe('N:_:C4:E:SF');
    expect(cupConstraintSignature(noMarker)).toBe('N:_:C4:E');
    expect(cupConstraintSignature(noMarker)).not.toContain('SF');
    expect(cupConstraintSignature({ mode: 'normal', capacity: 2, mustEndEmpty: true })).toBe('N:_:C2:E');
    expect(cupConstraintSignature({ mode: 'normal', capacity: 5, mustEndEmpty: true })).toBe('N:_:C5:E');
    expect(cupConstraintSignature({ mode: 'normal' })).toBe('N:_');
  });

  it('canonical puzzle key differs from an otherwise identical normal board', () => {
    const cups = [[A, A, A], [B], []];
    const withFlask = [flask(), { mode: 'normal' as const }, { mode: 'normal' as const }];
    const without = [{ mode: 'normal' as const, capacity: 4, mustEndEmpty: true }, { mode: 'normal' as const }, { mode: 'normal' as const }];
    expect(canonicalPuzzleKey(state(cups, withFlask), withFlask)).not.toBe(
      canonicalPuzzleKey(state(cups, without), without),
    );
  });

  it('clone/normalization copy the marker exactly (and false stays false)', () => {
    expect(cloneCupConstraint(flask()).steepingFlask).toBe(true);
    expect(cloneCupConstraint({ mode: 'normal', steepingFlask: false }).steepingFlask).toBe(false);
    const normalized = normalizeCupConstraints([{ mode: 'normal', steepingFlask: false }], 1);
    expect(normalized[0]?.steepingFlask).toBe(false);
    expect('steepingFlask' in cloneCupConstraint({ mode: 'normal' })).toBe(false);
  });

  it('ready state is never encoded into the canonical key', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const partial = canonicalPuzzleKey(state([[A, A], []], c), c);
    const ready = canonicalPuzzleKey(state([[A, A, A, A], []], c), c);
    const empty = canonicalPuzzleKey(state([[], []], c), c);
    const keys = new Set([partial, ready, empty]);
    expect(keys.size).toBe(3);
    expect(partial).toContain('C4:E:SF');
    expect(ready).toContain('C4:E:SF');
    expect(empty).toContain('C4:E:SF');
  });
});

describe('G20 solver/deadlock kernel', () => {
  it('two-move hand fixture: fill ready then clean decant', () => {
    const c = [flask(), { mode: 'normal' as const }, { mode: 'normal' as const }];
    const cups = [[A, A, A], [A], []];
    const solved = solvePuzzle(cups, {
      cupConstraints: c,
      floatingIngredients: emptyFloatingIngredients(cups.length),
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(2);
    let st = state(cups, c);
    let release = false;
    let clean = false;
    for (const action of solved.solution ?? []) {
      if (action.kind !== 'pour') continue;
      const before = st.cups[0] as TeaId[];
      const wasReady = isSteepingFlaskReady(before, c[0]);
      const result = applyPourState(st, action.from, action.to, c);
      expect(result).not.toBeNull();
      if (action.from === 0 && wasReady) {
        release = true;
        if ((result!.state.cups[0] as TeaId[]).length === 0) clean = true;
      }
      st = result!.state;
    }
    expect(release).toBe(true);
    expect(clean).toBe(true);
    expect(isPuzzleWonState(st, c)).toBe(true);
  });

  it('clean decant full flask -> empty ordinary is legal and constructive', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const st = state([[A, A, A, A], []], c);
    expect(pourRejectCodeState(st, 0, 1, c)).toBe('ok');
    expect(pourCountState(st, 0, 1, c)).toBe(4);
    expect(isConstructiveMoveState(st, 0, 1, c)).toBe(true);
  });

  it('partial flask cannot source, but the same move without the marker is legal', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const st = state([[A, A], []], c);
    expect(pourRejectCodeState(st, 0, 1, c)).toBe('source-steeping-not-ready');
    const control = [{ mode: 'normal' as const, capacity: 4, mustEndEmpty: true }, { mode: 'normal' as const }];
    expect(pourRejectCodeState(st, 0, 1, control)).toBe('ok');
    expect(pourCountState(st, 0, 1, control)).toBe(2);
  });

  it('deadlock uses the ordinary action graph (partial flask only source -> deadlocked)', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const st = state([[A, A], []], c);
    let moves = 0;
    for (let from = 0; from < 2; from++) {
      for (let to = 0; to < 2; to++) {
        if (from !== to && pourRejectCodeState(st, from, to, c) === 'ok') moves++;
      }
    }
    expect(moves).toBe(0);
  });

  it('full mixed malformed flask is never ready and cannot source', () => {
    const c = [flask(), { mode: 'normal' as const }];
    const st = state([[A, B, A, B], []], c);
    expect(isSteepingFlaskReady([A, B, A, B], c[0])).toBe(false);
    expect(pourRejectCodeState(st, 0, 1, c)).toBe('source-steeping-not-ready');
  });
});
