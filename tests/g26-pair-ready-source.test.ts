/**
 * G26 B — pair-ready source direct witnesses (research only).
 */
import { describe, expect, it } from 'vitest';
import { isPairReadyNow } from '../src/game/logic/g26Research';
import {
  applyPourState,
  canonicalPuzzleKey,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { cupConstraintSignature, type CupConstraint, type TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';

function pairReady(): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, pairReadySource: true };
}
function ordinary(): CupConstraint {
  return { mode: 'normal' };
}
function controlOf(special: CupConstraint): CupConstraint {
  const { pairReadySource: _d, ...rest } = special as CupConstraint & { pairReadySource?: boolean };
  void _d;
  return rest;
}

describe('g26 pair-ready direct witnesses', () => {
  it('run1 locked with source-pair-not-ready, control legal', () => {
    const cups: TeaId[][] = [[A, B, C], []];
    const constraints = [pairReady(), ordinary()];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('source-pair-not-ready');
    const control = [controlOf(pairReady()), ordinary()];
    expect(pourRejectCodeState({ cups }, 0, 1, control)).toBe('ok');
  });

  it('run2 ready uses ordinary transfer semantics', () => {
    const cups: TeaId[][] = [[A, B, B], []];
    const constraints = [pairReady(), ordinary()];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('ok');
    expect(pourCountState({ cups }, 0, 1, constraints)).toBe(2);
    const res = applyPourState({ cups }, 0, 1, constraints);
    expect(res!.transferred).toBe(2);
    expect(res!.layer).toBe(B);
  });

  it('run2 with one free slot moves exactly one (readiness not quantity)', () => {
    const cups: TeaId[][] = [[A, B, B], [A, A, A]];
    const constraints = [pairReady(), ordinary()];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('color-mismatch');
    const cups2: TeaId[][] = [[A, B, B], [B, B, B]];
    expect(pourRejectCodeState({ cups: cups2 }, 0, 1, constraints)).toBe('ok');
    expect(pourCountState({ cups: cups2 }, 0, 1, constraints)).toBe(1);
  });

  it('run3 locked', () => {
    const cups: TeaId[][] = [[A, B, B, B], []];
    expect(pourRejectCodeState({ cups }, 0, 1, [pairReady(), ordinary()])).toBe('source-pair-not-ready');
  });

  it('run4 locked (full homogeneous)', () => {
    const cups: TeaId[][] = [[B, B, B, B], []];
    expect(pourRejectCodeState({ cups }, 0, 1, [pairReady(), ordinary()])).toBe('source-pair-not-ready');
    expect(isPairReadyNow(cups[0] as TeaId[], pairReady())).toBe(false);
  });

  it('readiness derives after receives change run geometry', () => {
    const constraints = [pairReady(), ordinary(), ordinary()];
    // Special [A,B] run1 locked; feed one B from [A,B] (run1) to reach [A,B,B] run2.
    const cups: TeaId[][] = [[A, B], [A, B], []];
    expect(pourRejectCodeState({ cups }, 0, 2, constraints)).toBe('source-pair-not-ready');
    expect(pourRejectCodeState({ cups }, 1, 0, constraints)).toBe('ok');
    const fed = applyPourState({ cups }, 1, 0, constraints);
    expect(fed!.state.cups[0]).toEqual([A, B, B]);
    expect(isPairReadyNow(fed!.state.cups[0] as TeaId[], pairReady())).toBe(true);
    expect(pourRejectCodeState(fed!.state, 0, 2, constraints)).toBe('ok');
  });

  it('empty keeps source-empty precedence over pair gate', () => {
    const cups: TeaId[][] = [[], []];
    expect(pourRejectCodeState({ cups }, 0, 1, [pairReady(), ordinary()])).toBe('source-empty');
  });

  it('undo restores exact layers and derived readiness follows', () => {
    const logic = new TeaSortLogic([[A, B, B], []], [], [pairReady(), ordinary()]);
    expect(logic.canMakeMove(0, 1)).toBe(true);
    logic.makeMove(0, 1);
    expect(logic.toState().cups[0]).toEqual([A]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([A, B, B]);
    expect(isPairReadyNow(logic.toState().cups[0] as TeaId[], pairReady())).toBe(true);
  });

  it('canonical identity distinct, legacy freeze preserved', () => {
    expect(cupConstraintSignature(pairReady())).toContain(':PRS');
    const cups: TeaId[][] = [[A, B, B], []];
    expect(canonicalPuzzleKey({ cups }, [pairReady(), ordinary()])).not.toBe(
      canonicalPuzzleKey({ cups }, [controlOf(pairReady()), ordinary()]),
    );
    // Ordinary boards untouched.
    expect(pourRejectCodeState({ cups: [[A, A], []] }, 0, 1, [ordinary(), ordinary()])).toBe('ok');
  });

  it('malformed pair-ready fails closed', () => {
    const bad: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true, pairReadySource: true };
    expect(pourRejectCodeState({ cups: [[A, B, B], []] }, 0, 1, [bad, ordinary()])).not.toBe('ok');
    const both: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true, pairReadySource: true, bottomDraw: true } as CupConstraint;
    expect(pourRejectCodeState({ cups: [[A, B, B], []] }, 0, 1, [both, ordinary()])).not.toBe('ok');
  });

  it('control divergence: same from->to legal under CONTROL, blocked under FULL', () => {
    const cups: TeaId[][] = [[A, B, C, C], []];
    // Top run is 2? [A,B,C,C] top C run2 -> actually ready. Use run1 case.
    const locked: TeaId[][] = [[A, B, C], []];
    const full = [pairReady(), ordinary()];
    const ctrl = [controlOf(pairReady()), ordinary()];
    expect(pourRejectCodeState({ cups: locked }, 0, 1, full)).toBe('source-pair-not-ready');
    expect(pourRejectCodeState({ cups: locked }, 0, 1, ctrl)).toBe('ok');
    void cups;
  });
});
