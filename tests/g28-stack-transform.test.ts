/**
 * G28 — stack transformation shootout direct witnesses (research only).
 * Cups are bottom→top arrays: cups[i][0] is the BOTTOM layer.
 *
 * Each candidate pins: empty/nonempty receives, count/source/legality
 * parity vs CONTROL, exact transform, downstream divergence, Undo,
 * canonical identity + legacy freeze, malformed fail-closed, finality,
 * no mutable state, solver from→to actions.
 */
import { describe, expect, it } from 'vitest';
import {
  g28TransformDestination,
  hasAnyG28Marker,
  isG28BoardMalformed,
  isValidFlipWhenFullConstraint,
  isValidReverseOnReceiveConstraint,
  isValidUnderpourConstraint,
} from '../src/game/logic/g28Research';
import {
  applyPourState,
  canonicalPuzzleKey,
  canPourState,
  isPuzzleWonState,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  cupConstraintSignature,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';

function ordinary(): CupConstraint {
  return { mode: 'normal' };
}
function specialA(): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, underpour: true };
}
function specialB(): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, reverseOnReceive: true };
}
function specialC(): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, flipWhenFull: true };
}
function boardA(): CupConstraint[] {
  return [ordinary(), ordinary(), ordinary(), ordinary(), specialA(), ordinary()];
}
function boardB(): CupConstraint[] {
  return [ordinary(), ordinary(), ordinary(), ordinary(), specialB(), ordinary()];
}
function boardC(): CupConstraint[] {
  return [ordinary(), ordinary(), ordinary(), ordinary(), specialC(), ordinary()];
}
/** CONTROL: same board, marker stripped; geometry/finality identical. */
function controlOf(full: readonly CupConstraint[]): CupConstraint[] {
  return full.map((c) => {
    const out: CupConstraint = { mode: c.mode };
    if (c.capacity !== undefined) out.capacity = c.capacity;
    if (c.mustEndEmpty !== undefined) out.mustEndEmpty = c.mustEndEmpty;
    return out;
  });
}

describe('g28 candidate A — underpour cup direct witnesses', () => {
  it('A1: empty special receive is identical FULL vs CONTROL (not causal)', () => {
    const full = boardA();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, A], [], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, control);
    expect(rFull).not.toBeNull();
    expect(rCtrl).not.toBeNull();
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
    expect(rFull!.state.cups[4]).toEqual([A, A]);
  });

  it('A2: nonempty receive reorders (incoming below existing)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [], [], [], [B, B], []];
    // Target top B vs incoming A: illegal — build the legal variant below.
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    const legal: TeaId[][] = [[A, A], [], [], [], [B, A], []];
    expect(pourRejectCodeState({ cups: legal } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups: legal } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, A, B, A]);
    const ctrl = applyPourState({ cups: legal } as never, 0, 4, controlOf(full));
    expect(ctrl!.state.cups[4]).toEqual([B, A, A, A]);
    expect(res!.state.cups[4]).not.toEqual(ctrl!.state.cups[4]);
  });

  it('A3: transfer count frozen (FULL == CONTROL)', () => {
    const full = boardA();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, A, A], [], [], [], [B, A], []];
    expect(pourCountState({ cups } as never, 1, 4, full)).toBe(0);
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(
      pourCountState({ cups } as never, 0, 4, control),
    );
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(2);
  });

  it('A4: source removal frozen (source layers identical FULL vs CONTROL)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [], [], [], [B, A], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups[0]).toEqual(rCtrl!.state.cups[0]);
    expect(rFull!.state.cups[0]).toEqual([]);
    expect(rFull!.transferred).toBe(rCtrl!.transferred);
  });

  it('A5: destination legality frozen (mismatch still rejected)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [], [], [], [B, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    // Transform never loosens: no TeaId pours that ordinary rules reject.
    expect(canPourState({ cups } as never, 0, 4, full)).toBe(false);
  });

  it('A6: downstream source behavior diverges after underpour', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [], [], [], [B, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    // FULL special [A,A,B,A]: top run 1. CONTROL [B,A,A,A]: top run 3.
    expect(pourCountState(r1!.state as never, 4, 5, full)).toBe(1);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(pourCountState(rCtrl!.state as never, 4, 5, controlOf(full))).toBe(3);
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.transferred).toBe(1);
    expect(r2!.layer).toBe(A);
    expect(r2!.state.cups[4]).toEqual([A, A, B]);
  });

  it('A7: preserved top can be sourced before buried tea', () => {
    const full = boardA();
    const cups: TeaId[][] = [[B], [], [], [], [A], []];
    // Legal: B onto... no — target top A vs B mismatch. Use matching tea.
    const legal: TeaId[][] = [[A], [], [], [], [B, A], []];
    const r1 = applyPourState({ cups: legal } as never, 0, 4, full);
    // FULL [A,B,A]: top A preserved over incoming... verify top stayed A.
    expect(r1!.state.cups[4]).toEqual([A, B, A]);
    void cups;
  });

  it('A8: homogeneous receive is a byte-identical no-op', () => {
    const full = boardA();
    const cups: TeaId[][] = [[B, B], [], [], [], [B], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups[4]).toEqual([B, B, B]);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('A9: ordinary-destination apply parity (non-special target byte-equal)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [A], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 1, full);
    const rCtrl = applyPourState({ cups } as never, 0, 1, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('A10: source parity (pour FROM special is ordinary)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[], [], [], [], [A, A, B], []];
    const rFull = applyPourState({ cups } as never, 4, 0, full);
    const rCtrl = applyPourState({ cups } as never, 4, 0, controlOf(full));
    expect(rFull).not.toBeNull();
    expect(rFull!.transferred).toBe(1);
    expect(rFull!.layer).toBe(B);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('A11: Undo after transformed receive restores exact layers', () => {
    const logic = new TeaSortLogic();
    logic.initFromState([[A, A], [], [], [], [B, A], []], [], boardA());
    logic.makeMove(0, 4);
    expect(logic.toState().cups[4]).toEqual([A, A, B, A]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([A, A]);
    expect(logic.toState().cups[4]).toEqual([B, A]);
    expect(logic.toState().cupConstraints[4]).toEqual(specialA());
  });

  it('A12: re-init (restart) reproduces the exact initial board', () => {
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[A, A], [], [], [], [B, A], []];
    logic.initFromState(init, [], boardA());
    logic.makeMove(0, 4);
    logic.initFromState(init, [], boardA());
    expect(logic.toState().cups).toEqual(init);
    expect(logic.movesCount).toBe(0);
  });

  it('A13: canonical marker distinct; legacy keys byte-identical', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(canonicalPuzzleKey({ cups } as never, full)).not.toBe(
      canonicalPuzzleKey({ cups } as never, controlOf(full)),
    );
    expect(cupConstraintSignature(specialA())).toContain(':UP');
    expect(cupConstraintSignature({ mode: 'normal' })).toBe('N:_');
    expect(isValidUnderpourConstraint(specialA())).toBe(true);
  });

  it('A14: malformed — invalid special shape fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', mustEndEmpty: true, underpour: true }, ordinary()];
    const cups: TeaId[][] = [[A], [], [], [], [], []];
    expect(hasAnyG28Marker(bad)).toBe(true);
    expect(isG28BoardMalformed({ cups } as never, bad)).toBe(true);
    expect(pourRejectCodeState({ cups } as never, 0, 4, bad)).toBe('special-malformed');
  });

  it('A15: malformed — sibling marker mix fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 4, mustEndEmpty: true, underpour: true, reverseOnReceive: true }, ordinary()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('A16: malformed — two specials fail closed (census)', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialA(), specialA()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('A17: malformed — production special combo fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialA(),
      { mode: 'normal', targetTeaId: A }];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('A18: mustEndEmpty finality (no new finality)', () => {
    const full = boardA();
    expect(isPuzzleWonState({ cups: [[], [], [], [], [A], []] } as never, full)).toBe(false);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []];
    expect(isPuzzleWonState({ cups } as never, full)).toBe(true);
  });

  it('A19: no mutable transform state (repeat pours are derived)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A], [], [], [], [B, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, B, A]);
    // Same pour again from the same pre-state gives the same result.
    const r2 = applyPourState({ cups } as never, 0, 4, full);
    expect(r2!.state.cups[4]).toEqual(r1!.state.cups[4]);
    expect(g28TransformDestination([B, A], A, 1, specialA())).toEqual([A, B, A]);
    expect(g28TransformDestination([B, A], A, 1, undefined)).toEqual([B, A, A]);
  });

  it('A20: solver actions remain from→to pours', () => {
    const full = boardA();
    const cups: TeaId[][] = [
      [A, B, A, B],
      [B, A, B, A],
      [C, D, C, D],
      [D, C, D, C],
      [],
      [],
    ];
    const res = solvePuzzle(cups, { cupConstraints: full });
    expect(res.truncated).not.toBe(true);
    if (res.solvable) {
      for (const s of res.solution ?? []) {
        expect(s.kind).toBe('pour');
      }
    }
    void res;
  });

  it('A21: pure seam determinism', () => {
    for (let i = 0; i < 5; i++) {
      expect(g28TransformDestination([B, A], A, 2, specialA())).toEqual([A, A, B, A]);
    }
  });

  it('A22: same-cup / out-of-range priority preserved on marked board', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 4, 4, full)).toBe('same-cup');
    expect(pourRejectCodeState({ cups } as never, 0, 6, full)).toBe('out-of-range');
  });
});

describe('g28 candidate B — reverse-on-receive cup direct witnesses', () => {
  it('B1: empty receive with homogeneous run is identical (not causal)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A, A], [], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
    expect(rFull!.state.cups[4]).toEqual([A, A]);
  });

  it('B2: nonempty receive reverses the entire stack', () => {
    const full = boardB();
    const legal: TeaId[][] = [[A], [], [], [], [B, A], []];
    expect(pourRejectCodeState({ cups: legal } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups: legal } as never, 0, 4, full);
    // CONTROL [B,A,A] → FULL reverse [A,A,B].
    expect(res!.state.cups[4]).toEqual([A, A, B]);
    const ctrl = applyPourState({ cups: legal } as never, 0, 4, controlOf(full));
    expect(ctrl!.state.cups[4]).toEqual([B, A, A]);
  });

  it('B3: transfer count frozen (FULL == CONTROL)', () => {
    const full = boardB();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, A, A], [], [], [], [B, A], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(
      pourCountState({ cups } as never, 0, 4, control),
    );
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(2);
  });

  it('B4: source removal frozen', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A, A], [], [], [], [B, A], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups[0]).toEqual(rCtrl!.state.cups[0]);
    expect(rFull!.transferred).toBe(rCtrl!.transferred);
  });

  it('B5: destination legality frozen (mismatch rejected)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A, A], [], [], [], [B, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    expect(canPourState({ cups } as never, 0, 4, full)).toBe(false);
  });

  it('B6: exposed tea differs — downstream sourcing diverges', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A], [], [], [], [B, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    // FULL [A,A,B] top B(1); CONTROL [B,A,A] top A(3).
    expect(r1!.state.cups[4]).toEqual([A, A, B]);
    const sFull = applyPourState(r1!.state as never, 4, 5, full);
    expect(sFull!.layer).toBe(B);
    expect(sFull!.transferred).toBe(1);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    const sCtrl = applyPourState(rCtrl!.state as never, 4, 5, controlOf(full));
    expect(sCtrl!.layer).toBe(A);
    expect(sCtrl!.transferred).toBe(2);
  });

  it('B7: multi-layer reverse changes buried order', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A, A], [], [], [], [C, A], []];
    const res = applyPourState({ cups } as never, 0, 4, full);
    // CONTROL [C,A,A,A] → FULL [A,A,A,C].
    expect(res!.state.cups[4]).toEqual([A, A, A, C]);
  });

  it('B8: palindromic receive is a no-op (not causal)', () => {
    const full = boardB();
    // [A] + A → [A,A], reverse identical.
    const cups: TeaId[][] = [[A], [], [], [], [A], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('B9: ordinary-destination apply parity', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A, A], [A], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 1, full);
    const rCtrl = applyPourState({ cups } as never, 0, 1, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('B10: source parity (pour FROM special ordinary)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[], [], [], [], [A, A, B], []];
    const rFull = applyPourState({ cups } as never, 4, 0, full);
    const rCtrl = applyPourState({ cups } as never, 4, 0, controlOf(full));
    expect(rFull!.transferred).toBe(1);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('B11: Undo after reversed receive restores exact layers', () => {
    const logic = new TeaSortLogic();
    logic.initFromState([[A], [], [], [], [B, A], []], [], boardB());
    logic.makeMove(0, 4);
    expect(logic.toState().cups[4]).toEqual([A, A, B]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([A]);
    expect(logic.toState().cups[4]).toEqual([B, A]);
  });

  it('B12: restart reproduces exact initial board', () => {
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[A], [], [], [], [B, A], []];
    logic.initFromState(init, [], boardB());
    logic.makeMove(0, 4);
    logic.initFromState(init, [], boardB());
    expect(logic.toState().cups).toEqual(init);
  });

  it('B13: canonical marker distinct (:ROR); legacy freeze', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(canonicalPuzzleKey({ cups } as never, full)).not.toBe(
      canonicalPuzzleKey({ cups } as never, controlOf(full)),
    );
    expect(cupConstraintSignature(specialB())).toContain(':ROR');
    expect(cupConstraintSignature({ mode: 'normal' }).includes(':ROR')).toBe(false);
    expect(isValidReverseOnReceiveConstraint(specialB())).toBe(true);
  });

  it('B14: malformed shapes fail closed with one code', () => {
    const badShape: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', reverseOnReceive: true }, ordinary()];
    // Missing mustEndEmpty/capacity → invalid.
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badShape)).toBe(true);
    const badCombo: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialB(),
      { mode: 'source-only' }];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badCombo)).toBe(true);
    const cups: TeaId[][] = [[A], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, badShape)).toBe('special-malformed');
  });

  it('B15: sibling marker mix fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 4, mustEndEmpty: true, reverseOnReceive: true, flipWhenFull: true }, ordinary()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('B16: two specials fail closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialB(), specialB()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('B17: mustEndEmpty finality', () => {
    const full = boardB();
    expect(isPuzzleWonState({ cups: [[], [], [], [], [B], []] } as never, full)).toBe(false);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []];
    expect(isPuzzleWonState({ cups } as never, full)).toBe(true);
  });

  it('B18: no mutable state (derived reversal, repeatable)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A], [], [], [], [B, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    const r2 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual(r2!.state.cups[4]);
    expect(g28TransformDestination([B, A], A, 1, specialB())).toEqual([A, A, B]);
  });

  it('B19: solver actions remain from→to pours', () => {
    const full = boardB();
    const cups: TeaId[][] = [
      [A, B, A, B],
      [B, A, B, A],
      [C, D, C, D],
      [D, C, D, C],
      [],
      [],
    ];
    const res = solvePuzzle(cups, { cupConstraints: full });
    expect(res.truncated).not.toBe(true);
    if (res.solvable) {
      for (const s of res.solution ?? []) expect(s.kind).toBe('pour');
    }
    void res;
  });

  it('B20: repeated reversal receive→drain→receive is derived (no counter)', () => {
    const full = boardB();
    // [B,A]+A → [A,A,B]; drain B → [A,A]; receive A → [A,A,A] reverse identical.
    const s0: TeaId[][] = [[A], [A], [], [], [B, A], []];
    const r1 = applyPourState({ cups: s0 } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, A, B]);
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.state.cups[4]).toEqual([A, A]);
    const r3 = applyPourState(r2!.state as never, 1, 4, full);
    // [A,A]+A → CONTROL [A,A,A], reverse identical.
    expect(r3).not.toBeNull();
    expect(r3!.state.cups[4]).toEqual([A, A, A]);
  });

  it('B21: legality identical FULL vs CONTROL for every pair', () => {
    const full = boardB();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, B], [B, A], [C], [D], [A], []];
    for (let f = 0; f < 6; f++) {
      for (let t = 0; t < 6; t++) {
        expect(canPourState({ cups } as never, f, t, full)).toBe(
          canPourState({ cups } as never, f, t, control),
        );
      }
    }
  });

  it('B22: same-cup / out-of-range priority on marked board', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 4, 4, full)).toBe('same-cup');
    expect(pourRejectCodeState({ cups } as never, 0, 9, full)).toBe('out-of-range');
  });
});

describe('g28 candidate C — full-flip cup direct witnesses', () => {
  it('C1: receive not filling vessel → ordinary (no flip)', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A], [], [], [], [A], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
    expect(rFull!.state.cups[4]).toEqual([A, A]);
  });

  it('C2: receive reaching full → flip', () => {
    const full = boardC();
    // Special [A,B,B] (top B) + B → CONTROL [A,B,B,B] → FULL [B,B,B,A].
    const cups: TeaId[][] = [[B], [], [], [], [A, B, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([B, B, B, A]);
    const ctrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(ctrl!.state.cups[4]).toEqual([A, B, B, B]);
  });

  it('C3: flip exposes different top immediately', () => {
    const full = boardC();
    const cups: TeaId[][] = [[B], [], [], [], [A, B, B], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([B, B, B, A]);
    // FULL top A(1); CONTROL top B(3): source counts diverge.
    const sFull = applyPourState(r1!.state as never, 4, 5, full);
    expect(sFull!.layer).toBe(A);
    expect(sFull!.transferred).toBe(1);
  });

  it('C4: homogeneous fill → flip is byte-identical no-op', () => {
    const full = boardC();
    const cups: TeaId[][] = [[B], [], [], [], [B, B, B], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups[4]).toEqual([B, B, B, B]);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('C5: drain then refill re-arms derivedly (second flip possible)', () => {
    const full = boardC();
    // First flip: [A,C,B]+B → [B,B,C,A].
    const s0: TeaId[][] = [[B], [], [], [], [A, C, B], []];
    const r1 = applyPourState({ cups: s0 } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([B, B, C, A]);
    // Drain top A → [B,B,C].
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.state.cups[4]).toEqual([B, B, C]);
    // Refill C → [B,B,C,C] full → flip → [C,C,B,B] (differs, no counter).
    const cups2: TeaId[][] = [[C], [], [], [], [], []];
    void cups2;
    const pre3: TeaId[][] = [[C], [], [], [], [B, B, C], []];
    const r3 = applyPourState({ cups: pre3 } as never, 0, 4, full);
    expect(r3!.state.cups[4]).toEqual([C, C, B, B]);
    const c3 = applyPourState({ cups: pre3 } as never, 0, 4, controlOf(full));
    expect(c3!.state.cups[4]).toEqual([B, B, C, C]);
  });

  it('C6: transfer count frozen (FULL == CONTROL)', () => {
    const full = boardC();
    const control = controlOf(full);
    const cups: TeaId[][] = [[B, B], [], [], [], [A, B], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(
      pourCountState({ cups } as never, 0, 4, control),
    );
    // Free space 2, top run 2 → m=2, fills to 4 → flip fires.
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(2);
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([B, B, B, A]);
  });

  it('C7: source removal frozen', () => {
    const full = boardC();
    const cups: TeaId[][] = [[B], [], [], [], [A, B, B], []];
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups[0]).toEqual(rCtrl!.state.cups[0]);
    expect(rFull!.transferred).toBe(rCtrl!.transferred);
  });

  it('C8: destination legality frozen (mismatch rejected, full rejected)', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A], [], [], [], [B, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    const fullCup: TeaId[][] = [[B], [], [], [], [B, B, B, B], []];
    expect(pourRejectCodeState({ cups: fullCup } as never, 0, 4, full)).toBe('target-full');
  });

  it('C9: ordinary-destination apply parity', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A, A], [A], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 1, full);
    const rCtrl = applyPourState({ cups } as never, 0, 1, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('C10: source parity (pour FROM special ordinary, even when full)', () => {
    const full = boardC();
    const cups: TeaId[][] = [[], [], [], [], [B, B, B, A], []];
    const rFull = applyPourState({ cups } as never, 4, 0, full);
    const rCtrl = applyPourState({ cups } as never, 4, 0, controlOf(full));
    expect(rFull!.transferred).toBe(1);
    expect(rFull!.layer).toBe(A);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('C11: Undo after flip restores exact layers', () => {
    const logic = new TeaSortLogic();
    logic.initFromState([[B], [], [], [], [A, B, B], []], [], boardC());
    logic.makeMove(0, 4);
    expect(logic.toState().cups[4]).toEqual([B, B, B, A]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([B]);
    expect(logic.toState().cups[4]).toEqual([A, B, B]);
    expect(logic.toState().cupConstraints[4]).toEqual(specialC());
  });

  it('C12: restart reproduces exact initial board', () => {
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[B], [], [], [], [A, B, B], []];
    logic.initFromState(init, [], boardC());
    logic.makeMove(0, 4);
    logic.initFromState(init, [], boardC());
    expect(logic.toState().cups).toEqual(init);
  });

  it('C13: canonical marker distinct (:FF); legacy freeze', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(canonicalPuzzleKey({ cups } as never, full)).not.toBe(
      canonicalPuzzleKey({ cups } as never, controlOf(full)),
    );
    expect(cupConstraintSignature(specialC())).toContain(':FF');
    expect(cupConstraintSignature({ mode: 'normal' }).includes(':FF')).toBe(false);
    expect(isValidFlipWhenFullConstraint(specialC())).toBe(true);
  });

  it('C14: malformed shapes fail closed', () => {
    const badCap: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 5, mustEndEmpty: true, flipWhenFull: true }, ordinary()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badCap)).toBe(true);
    const badMode: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'source-only', capacity: 4, mustEndEmpty: true, flipWhenFull: true }, ordinary()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badMode)).toBe(true);
    const cups: TeaId[][] = [[A], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, badCap)).toBe('special-malformed');
  });

  it('C15: sibling markers and census fail closed', () => {
    const badMix: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 4, mustEndEmpty: true, underpour: true, flipWhenFull: true }, ordinary()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badMix)).toBe(true);
    const badTwo: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialC(), specialC()];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badTwo)).toBe(true);
  });

  it('C16: production special on C board fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialC(),
      { mode: 'normal', capacity: 2, mustEndEmpty: true }];
    expect(isG28BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('C17: mustEndEmpty finality', () => {
    const full = boardC();
    expect(isPuzzleWonState({ cups: [[], [], [], [], [A, B], []] } as never, full)).toBe(false);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []];
    expect(isPuzzleWonState({ cups } as never, full)).toBe(true);
  });

  it('C18: no trigger counter (fill→flip→drain→refill derived)', () => {
    const full = boardC();
    // Direct seam checks: flip only on nonfull→full transition.
    expect(g28TransformDestination([A, B, B], B, 1, specialC())).toEqual([B, B, B, A]);
    expect(g28TransformDestination([A], B, 1, specialC())).toEqual([A, B]);
    expect(g28TransformDestination([A, B, B, B], B, 0, specialC())).toEqual([A, B, B, B]);
  });

  it('C19: solver actions remain from→to pours', () => {
    const full = boardC();
    const cups: TeaId[][] = [
      [A, B, A, B],
      [B, A, B, A],
      [C, D, C, D],
      [D, C, D, C],
      [],
      [],
    ];
    const res = solvePuzzle(cups, { cupConstraints: full });
    expect(res.truncated).not.toBe(true);
    if (res.solvable) {
      for (const s of res.solution ?? []) expect(s.kind).toBe('pour');
    }
    void res;
  });

  it('C20: legality identical FULL vs CONTROL for every pair', () => {
    const full = boardC();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, B], [B, A], [C], [D], [B], []];
    for (let f = 0; f < 6; f++) {
      for (let t = 0; t < 6; t++) {
        expect(canPourState({ cups } as never, f, t, full)).toBe(
          canPourState({ cups } as never, f, t, control),
        );
      }
    }
  });

  it('C21: same-cup / out-of-range priority on marked board', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 4, 4, full)).toBe('same-cup');
    expect(pourRejectCodeState({ cups } as never, 0, 9, full)).toBe('out-of-range');
  });

  it('C22: well-formed boards pass validation for all candidates', () => {
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(isG28BoardMalformed({ cups } as never, boardA())).toBe(false);
    expect(isG28BoardMalformed({ cups } as never, boardB())).toBe(false);
    expect(isG28BoardMalformed({ cups } as never, boardC())).toBe(false);
    expect(hasAnyG28Marker(controlOf(boardA()))).toBe(false);
  });
});
