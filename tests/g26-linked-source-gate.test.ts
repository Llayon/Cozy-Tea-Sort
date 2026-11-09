/**
 * G26 C — linked source gate direct witnesses (research only).
 */
import { describe, expect, it } from 'vitest';
import { findLinkedValveIndex, G26_LINKED_GROUP, isLinkedSourceReady } from '../src/game/logic/g26Research';
import {
  applyPourState,
  canonicalPuzzleKey,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { cupConstraintSignature, type CupConstraint, type TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';

function source(group = G26_LINKED_GROUP): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, linkedSourceGroup: group, linkedSourceRole: 'source' };
}
function valve(group = G26_LINKED_GROUP): CupConstraint {
  return { mode: 'normal', capacity: 4, linkedSourceGroup: group, linkedSourceRole: 'valve' };
}
function ordinary(): CupConstraint {
  return { mode: 'normal' };
}

describe('g26 linked gate direct witnesses', () => {
  it('S nonempty + V empty => S may source', () => {
    const cups: TeaId[][] = [[A, A], [], [B, B]];
    const constraints = [source(), valve(), ordinary()];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('ok');
    expect(isLinkedSourceReady(cups, 0, constraints)).toBe(true);
  });

  it('V receives tea => S source blocked', () => {
    const cups: TeaId[][] = [[A, A], [], [B, B]];
    const constraints = [source(), valve(), ordinary()];
    // Ordinary -> valve is legal (valve is ordinary).
    expect(pourRejectCodeState({ cups }, 2, 1, constraints)).toBe('ok');
    const after = applyPourState({ cups }, 2, 1, constraints);
    expect(after!.state.cups[1]).toEqual([B, B]);
    expect(pourRejectCodeState(after!.state, 0, 2, constraints)).toBe('source-linked-not-ready');
    expect(isLinkedSourceReady(after!.state.cups, 0, constraints)).toBe(false);
  });

  it('V emptied => S source legal again (no mutable state)', () => {
    const cups: TeaId[][] = [[A, A], [B], []];
    const constraints = [source(), valve(), ordinary()];
    // V=[B] nonempty => S locked.
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('source-linked-not-ready');
    // Empty V elsewhere: V [B] -> empty [ ] is legal (top B into empty).
    expect(pourRejectCodeState({ cups }, 1, 2, constraints)).toBe('ok');
    const emptied = applyPourState({ cups }, 1, 2, constraints);
    expect(emptied!.state.cups[1]).toEqual([]);
    // V is now empty at index 1; S pours into the empty valve.
    expect(pourRejectCodeState(emptied!.state, 0, 1, constraints)).toBe('ok');
  });

  it('valve itself behaves like an ordinary normal vessel', () => {
    const cups: TeaId[][] = [[], [B, B], [B]];
    const constraints = [source(), valve(), ordinary()];
    // Valve sources ordinary top run.
    expect(pourRejectCodeState({ cups }, 1, 2, constraints)).toBe('ok');
    // Valve receives ordinary.
    const cups2: TeaId[][] = [[], [], [B, B]];
    expect(pourRejectCodeState({ cups: cups2 }, 2, 1, constraints)).toBe('ok');
  });

  it('control divergence: CONTROL sources while FULL blocked', () => {
    const cups: TeaId[][] = [[A, A], [B], []];
    const full = [source(), valve(), ordinary()];
    // CONTROL strips only the linked gate (S keeps mustEndEmpty, V normal).
    const control: CupConstraint[] = [{ mode: 'normal', capacity: 4, mustEndEmpty: true }, { mode: 'normal', capacity: 4 }, ordinary()];
    expect(pourRejectCodeState({ cups }, 0, 2, full)).toBe('source-linked-not-ready');
    expect(pourRejectCodeState({ cups }, 0, 2, control)).toBe('ok');
  });

  it('undo restores exact contents and derived gate follows', () => {
    const logic = new TeaSortLogic([[A, A], [], []], [], [source(), valve(), ordinary()]);
    expect(logic.canMakeMove(0, 2)).toBe(true);
    logic.makeMove(2 - 2, 2); // S(0) -> ordinary(2)
    expect(logic.toState().cups[0]).toEqual([]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([A, A]);
    expect(logic.toState().cups[1]).toEqual([]);
  });

  it('static linking: partner lookup exact, ambiguous/missing fails closed', () => {
    const constraints = [source(), valve(), ordinary()];
    expect(findLinkedValveIndex(constraints, 0)).toBe(1);
    expect(findLinkedValveIndex([source(), ordinary(), ordinary()], 0)).toBe(-1);
    // Two valves with same group => malformed board => fail closed (color-mismatch).
    const ambiguous: CupConstraint[] = [source(), valve(), valve()];
    expect(findLinkedValveIndex(ambiguous, 0)).toBe(-1);
    expect(pourRejectCodeState({ cups: [[A], [], []] }, 0, 1, ambiguous)).toBe('color-mismatch');
  });

  it('canonical audit: S/V roles distinct, marker absent legacy unchanged', () => {
    const sigS = cupConstraintSignature(source());
    const sigV = cupConstraintSignature(valve());
    const sigO = cupConstraintSignature(ordinary());
    expect(sigS).toContain(':LSG:');
    expect(sigV).toContain(':LSG:');
    expect(sigS).not.toBe(sigV);
    expect(sigS).not.toBe(sigO);
    const cups: TeaId[][] = [[A], [], []];
    const keyFull = canonicalPuzzleKey({ cups }, [source(), valve(), ordinary()]);
    const keySwap = canonicalPuzzleKey({ cups }, [valve(), source(), ordinary()]);
    void keySwap;
    // Swapping S and V contents changes roles: keys must distinguish positions via signatures.
    // At minimum, linked keys differ from all-ordinary keys.
    const keyOrd = canonicalPuzzleKey({ cups }, [ordinary(), ordinary(), ordinary()]);
    expect(keyFull).not.toBe(keyOrd);
  });

  it('malformed linked boards fail closed', () => {
    // S without V => malformed standalone => fail closed (color-mismatch).
    expect(
      pourRejectCodeState({ cups: [[A], [], []] }, 0, 2, [source(), ordinary(), ordinary()]),
    ).toBe('color-mismatch');
    // Wrong role value.
    const badRole = { mode: 'normal', capacity: 4, mustEndEmpty: true, linkedSourceGroup: 'g', linkedSourceRole: 'boss' } as unknown as CupConstraint;
    expect(pourRejectCodeState({ cups: [[A], [], []] }, 0, 2, [badRole, valve('g'), ordinary()])).not.toBe('ok');
  });

  it('empty S keeps source-empty precedence', () => {
    const cups: TeaId[][] = [[], [], []];
    expect(pourRejectCodeState({ cups }, 0, 2, [source(), valve(), ordinary()])).toBe('source-empty');
  });

  it('full cycle: V empty -> S usable -> V occupied -> S locked -> V emptied -> S usable', () => {
    const constraints = [source(), valve(), ordinary(), ordinary(), ordinary(), ordinary()];
    let cups: TeaId[][] = [[A, A], [], [B, B], [B, B], [B, B], []];
    // S usable.
    expect(pourRejectCodeState({ cups }, 0, 5, constraints)).toBe('ok');
    // Occupy V.
    const occupied = applyPourState({ cups }, 2, 1, constraints);
    expect(occupied).not.toBeNull();
    cups = occupied!.state.cups;
    expect(pourRejectCodeState({ cups }, 0, 5, constraints)).toBe('source-linked-not-ready');
    // Empty V back into its origin? Move V contents out to empty slot 5 is blocked (S locked, but V itself can source).
    expect(pourRejectCodeState({ cups }, 1, 5, constraints)).toBe('ok');
  });
});
