/**
 * G29 — compatibility axis shootout direct witnesses (research only).
 * Cups are bottom→top arrays: cups[i][0] is the BOTTOM layer.
 *
 * Each candidate pins (20+ scenarios): empty/same/cross receives, full
 * destination, source behavior, transfer-count parity, Undo, restart,
 * mustEndEmpty finality, canonical identity + legacy freeze, malformed
 * fail-closed, CONTROL difference, no TeaId transformation, no mutable
 * state, legality parity.
 */
import { describe, expect, it } from 'vitest';
import {
  g29CompatibilityOverride,
  hasAnyG29Marker,
  isG29BoardMalformed,
  isValidDifferentTeaBufferConstraint,
  isValidMixedBufferConstraint,
  isValidTwoTeaBufferConstraint,
} from '../src/game/logic/g29Research';
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
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, mixedBuffer: true };
}
function specialB(teaA: TeaId = A, teaB: TeaId = B): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, twoTeaBuffer: { teaA, teaB } };
}
function specialC(): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, differentTeaBuffer: true };
}
function boardA(): CupConstraint[] {
  return [ordinary(), ordinary(), ordinary(), ordinary(), specialA(), ordinary()];
}
function boardB(teaA: TeaId = A, teaB: TeaId = B): CupConstraint[] {
  return [ordinary(), ordinary(), ordinary(), ordinary(), specialB(teaA, teaB), ordinary()];
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

describe('g29 candidate A — mixed buffer direct witnesses', () => {
  it('A1: empty special receives like ordinary empty', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
    expect(rFull!.state.cups[4]).toEqual([A, A]);
  });

  it('A2: same-tea receive into nonempty special is ordinary in both', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A], [], [], [], [B, A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('A3: AA + BB → AABB in FULL while CONTROL rejects (identity)', () => {
    const full = boardA();
    const control = controlOf(full);
    const cups: TeaId[][] = [[B, B], [], [], [], [A, A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, control)).toBe('color-mismatch');
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res).not.toBeNull();
    expect(res!.state.cups[4]).toEqual([A, A, B, B]);
    expect(res!.transferred).toBe(2);
  });

  it('A4: source BB leaves AA exactly (no transformation)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[B, B], [], [], [], [A, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, A, B, B]);
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.transferred).toBe(2);
    expect(r2!.layer).toBe(B);
    expect(r2!.state.cups[4]).toEqual([A, A]);
    expect(r2!.state.cups[5]).toEqual([B, B]);
  });

  it('A5: transfer count frozen (FULL == CONTROL where both allow)', () => {
    const full = boardA();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, A, A], [], [], [], [B, A], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(
      pourCountState({ cups } as never, 0, 4, control),
    );
  });

  it('A6: G29-accepted quantity follows ordinary max-run/free-space rule', () => {
    const full = boardA();
    // Source run 3, free space 3 → all 3 transfer.
    const cups: TeaId[][] = [[B, B, B], [], [], [], [A], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(3);
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, B, B, B]);
    // Free space 1 → only 1 transfers.
    const tight: TeaId[][] = [[B, B, B], [], [], [], [C, C, A], []];
    expect(pourCountState({ cups: tight } as never, 0, 4, full)).toBe(1);
  });

  it('A7: full special stays full-gated (capacity freeze)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[C], [], [], [], [A, A, B, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('target-full');
  });

  it('A8: source behavior from mixed special is ordinary', () => {
    const full = boardA();
    const control = controlOf(full);
    const cups: TeaId[][] = [[], [], [], [], [A, A, B, B], []];
    const rFull = applyPourState({ cups } as never, 4, 0, full);
    const rCtrl = applyPourState({ cups } as never, 4, 0, control);
    expect(rFull!.transferred).toBe(2);
    expect(rFull!.layer).toBe(B);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('A9: ordinary-destination apply parity (non-special target byte-equal)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A, A], [A], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 1, full);
    const rCtrl = applyPourState({ cups } as never, 0, 1, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('A10: Undo after mixed receive restores exact layers', () => {
    const logic = new TeaSortLogic();
    logic.initFromState([[B, B], [], [], [], [A, A], []], [], boardA());
    logic.makeMove(0, 4);
    expect(logic.toState().cups[4]).toEqual([A, A, B, B]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([B, B]);
    expect(logic.toState().cups[4]).toEqual([A, A]);
    expect(logic.toState().cupConstraints[4]).toEqual(specialA());
  });

  it('A11: restart reproduces exact root state', () => {
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[B, B], [], [], [], [A, A], []];
    logic.initFromState(init, [], boardA());
    logic.makeMove(0, 4);
    logic.initFromState(init, [], boardA());
    expect(logic.toState().cups).toEqual(init);
    expect(logic.movesCount).toBe(0);
  });

  it('A12: mustEndEmpty finality (no new finality)', () => {
    const full = boardA();
    expect(isPuzzleWonState({ cups: [[], [], [], [], [A, B], []] } as never, full)).toBe(false);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []];
    expect(isPuzzleWonState({ cups } as never, full)).toBe(true);
  });

  it('A13: canonical marker distinct (:MB); legacy freeze', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(canonicalPuzzleKey({ cups } as never, full)).not.toBe(
      canonicalPuzzleKey({ cups } as never, controlOf(full)),
    );
    expect(cupConstraintSignature(specialA())).toContain(':MB');
    expect(cupConstraintSignature({ mode: 'normal' })).toBe('N:_');
    expect(isValidMixedBufferConstraint(specialA())).toBe(true);
  });

  it('A14: malformed — invalid shape fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', mustEndEmpty: true, mixedBuffer: true }, ordinary()];
    expect(hasAnyG29Marker(bad)).toBe(true);
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
    expect(pourRejectCodeState({ cups: [[A], [], [], [], [], []] } as never, 0, 4, bad)).toBe(
      'special-malformed',
    );
  });

  it('A15: malformed — sibling marker mix fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 4, mustEndEmpty: true, mixedBuffer: true, differentTeaBuffer: true }, ordinary()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('A16: malformed — two specials fail closed (census)', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialA(), specialA()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('A17: malformed — production special combo fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialA(),
      { mode: 'normal', targetTeaId: A }];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('A18: TeaIds preserved exactly through mixed cycle', () => {
    const full = boardA();
    const cups: TeaId[][] = [[B, B], [], [], [], [A, C], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, C, B, B]);
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.state.cups[4]).toEqual([A, C]);
    expect(r2!.state.cups[5]).toEqual([B, B]);
    // Multiset conserved: A,C,B,B across vessels 4+5+0.
    expect([...r2!.state.cups[4], ...r2!.state.cups[5], ...r2!.state.cups[0]].sort()).toEqual(
      [C, A, B, B],
    );
  });

  it('A19: no mutable state (repeat pours are derived)', () => {
    const full = boardA();
    const cups: TeaId[][] = [[B], [], [], [], [A, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    const r2 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual(r2!.state.cups[4]);
    expect(g29CompatibilityOverride(B, [A, A], specialA())).toBe('accept');
    expect(g29CompatibilityOverride(B, [A, A], undefined)).toBe('ordinary');
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
      for (const s of res.solution ?? []) expect(s.kind).toBe('pour');
    }
    void res;
  });

  it('A21: legality identical FULL vs CONTROL for non-special pairs', () => {
    const full = boardA();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, B], [B, A], [C], [D], [A], []];
    for (const [f, t] of [[0, 1], [1, 0], [0, 5], [2, 3], [4, 0], [4, 5]]) {
      expect(canPourState({ cups } as never, f, t, full)).toBe(
        canPourState({ cups } as never, f, t, control),
      );
    }
  });

  it('A22: same-cup / out-of-range priority on marked board', () => {
    const full = boardA();
    const cups: TeaId[][] = [[A], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 4, 4, full)).toBe('same-cup');
    expect(pourRejectCodeState({ cups } as never, 0, 6, full)).toBe('out-of-range');
  });
});

describe('g29 candidate B — two-tea buffer direct witnesses', () => {
  it('B1: empty special accepts any TeaId (ordinary empty rule)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[C], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([C]);
  });

  it('B2: A receives B (pair cross-color accepted)', () => {
    const full = boardB();
    const control = controlOf(full);
    const cups: TeaId[][] = [[B], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, control)).toBe('color-mismatch');
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, B]);
  });

  it('B3: B receives A (pair is bidirectional)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([B, A]);
  });

  it('B4: A does NOT receive C (off-pair stays ordinary)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[C], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    expect(applyPourState({ cups } as never, 0, 4, full)).toBeNull();
  });

  it('B5: C does NOT gain pair privilege (first tea outside pair)', () => {
    const full = boardB();
    // Special holds C (outside pair); incoming A must follow ordinary rules.
    const cups: TeaId[][] = [[A], [], [], [], [C], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    // But C onto C is ordinary.
    const same: TeaId[][] = [[C], [], [], [], [C], []];
    expect(pourRejectCodeState({ cups: same } as never, 0, 4, full)).toBe('ok');
  });

  it('B6: same-tea receives remain ordinary (not candidate events)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const rFull = applyPourState({ cups } as never, 0, 4, full);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('B7: strong cycle — pair receive, drain, lower tea remains and is used', () => {
    const full = boardB();
    const cups: TeaId[][] = [[B, B], [], [], [], [A, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, A, B, B]);
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.transferred).toBe(2);
    expect(r2!.state.cups[4]).toEqual([A, A]);
    // Lower tea A later sourced (both layers; special empties).
    const r3 = applyPourState(r2!.state as never, 4, 0, full);
    expect(r3!.layer).toBe(A);
    expect(r3!.transferred).toBe(2);
    expect(r3!.state.cups[4]).toEqual([]);
    expect(r3!.state.cups[0]).toEqual([A, A]);
  });

  it('B8: pair static after drain/refill (no runtime selection)', () => {
    const full = boardB();
    // Drain pair tea, refill with the other member: still governed.
    const s0: TeaId[][] = [[B], [A], [], [], [A], []];
    const r1 = applyPourState({ cups: s0 } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, B]);
    const r2 = applyPourState(r1!.state as never, 4, 5, full);
    expect(r2!.state.cups[4]).toEqual([A]);
    // C still rejected after refill cycle.
    const s3: TeaId[][] = [[C], [], [], [], [A], []];
    expect(canPourState({ cups: s3 } as never, 0, 4, full)).toBe(false);
  });

  it('B9: transfer count frozen (FULL == CONTROL where both allow)', () => {
    const full = boardB();
    const control = controlOf(full);
    // Same-top receive into special: both allow, same count.
    const cups: TeaId[][] = [[A, A], [], [], [], [B, A], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(
      pourCountState({ cups } as never, 0, 4, control),
    );
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(2);
  });

  it('B10: pair-accepted quantity follows ordinary max-run/free-space', () => {
    const full = boardB();
    const cups: TeaId[][] = [[B, B, B], [], [], [], [A], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(3);
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, B, B, B]);
  });

  it('B11: source parity (FROM special ordinary)', () => {
    const full = boardB();
    const control = controlOf(full);
    const cups: TeaId[][] = [[], [], [], [], [A, B, B], []];
    const rFull = applyPourState({ cups } as never, 4, 0, full);
    const rCtrl = applyPourState({ cups } as never, 4, 0, control);
    expect(rFull!.transferred).toBe(2);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('B12: ordinary-destination apply parity', () => {
    const full = boardB();
    const cups: TeaId[][] = [[A, A], [A], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 1, full);
    const rCtrl = applyPourState({ cups } as never, 0, 1, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('B13: Undo after pair receive restores exact layers', () => {
    const logic = new TeaSortLogic();
    logic.initFromState([[B], [], [], [], [A], []], [], boardB());
    logic.makeMove(0, 4);
    expect(logic.toState().cups[4]).toEqual([A, B]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([B]);
    expect(logic.toState().cups[4]).toEqual([A]);
  });

  it('B14: restart reproduces exact root state', () => {
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[B], [], [], [], [A], []];
    logic.initFromState(init, [], boardB());
    logic.makeMove(0, 4);
    logic.initFromState(init, [], boardB());
    expect(logic.toState().cups).toEqual(init);
  });

  it('B15: canonical pair unordered (A/B == B/A), distinct otherwise', () => {
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    const ab = boardB(A, B);
    const ba = boardB(B, A);
    expect(canonicalPuzzleKey({ cups } as never, ab)).toBe(
      canonicalPuzzleKey({ cups } as never, ba),
    );
    expect(canonicalPuzzleKey({ cups } as never, ab)).not.toBe(
      canonicalPuzzleKey({ cups } as never, controlOf(ab)),
    );
    expect(cupConstraintSignature(specialB())).toContain(':2TB:');
    const other = boardB(A, C);
    expect(canonicalPuzzleKey({ cups } as never, ab)).not.toBe(
      canonicalPuzzleKey({ cups } as never, other),
    );
  });

  it('B16: malformed — equal pair members fail closed', () => {
    const bad: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true, twoTeaBuffer: { teaA: A, teaB: A } };
    const constraints: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), bad, ordinary()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, constraints)).toBe(true);
    expect(pourRejectCodeState({ cups: [[A], [], [], [], [A], []] } as never, 0, 4, constraints)).toBe(
      'special-malformed',
    );
  });

  it('B17: malformed — sibling mix and census fail closed', () => {
    const badMix: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 4, mustEndEmpty: true, mixedBuffer: true, twoTeaBuffer: { teaA: A, teaB: B } }, ordinary()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badMix)).toBe(true);
    const badTwo: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialB(), specialB()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badTwo)).toBe(true);
  });

  it('B18: malformed — production special on B board fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialB(),
      { mode: 'source-only' }];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('B19: mustEndEmpty finality', () => {
    const full = boardB();
    expect(isPuzzleWonState({ cups: [[], [], [], [], [A, B], []] } as never, full)).toBe(false);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []];
    expect(isPuzzleWonState({ cups } as never, full)).toBe(true);
  });

  it('B20: no mutable pair (static across drain/refill, repeatable)', () => {
    const full = boardB();
    const cups: TeaId[][] = [[B], [], [], [], [A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    const r2 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual(r2!.state.cups[4]);
    expect(g29CompatibilityOverride(B, [A], specialB())).toBe('accept');
    expect(g29CompatibilityOverride(C, [A], specialB())).toBe('ordinary');
    expect(g29CompatibilityOverride(A, [C], specialB())).toBe('ordinary');
  });

  it('B21: solver actions remain from→to pours', () => {
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

  it('B22: legality identical FULL vs CONTROL for non-special pairs', () => {
    const full = boardB();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, B], [B, A], [C], [D], [A], []];
    for (const [f, t] of [[0, 1], [1, 0], [0, 5], [2, 3], [4, 0], [4, 5]]) {
      expect(canPourState({ cups } as never, f, t, full)).toBe(
        canPourState({ cups } as never, f, t, control),
      );
    }
  });
});

describe('g29 candidate C — different-tea buffer direct witnesses', () => {
  it('C1: empty special accepts any TeaId', () => {
    const full = boardC();
    const cups: TeaId[][] = [[C], [], [], [], [], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([C]);
  });

  it('C2: A receives B (different accepted)', () => {
    const full = boardC();
    const control = controlOf(full);
    const cups: TeaId[][] = [[B], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, control)).toBe('color-mismatch');
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, B]);
  });

  it('C3: A rejects A (same-color blocked where CONTROL accepts)', () => {
    const full = boardC();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A], [], [], [], [A], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, control)).toBe('ok');
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
    expect(applyPourState({ cups } as never, 0, 4, full)).toBeNull();
  });

  it('C4: after A←B, B accepts A (alternation derives from new top)', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A], [], [], [], [A, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('ok');
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, B, A]);
  });

  it('C5: after A←B, B rejects B (top-following block)', () => {
    const full = boardC();
    const cups: TeaId[][] = [[B], [], [], [], [A, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('color-mismatch');
  });

  it('C6: after drain, rule derives from new top (no stored alternation)', () => {
    const full = boardC();
    // [A,B,A] drain A → [A,B]: A now rejected, B... top is B; A accepted.
    const cups: TeaId[][] = [[A], [], [], [], [A, B, A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1).toBeNull(); // top A vs A: blocked
    const drain: TeaId[][] = [[], [], [], [], [A, B, A], []];
    const r2 = applyPourState({ cups: drain } as never, 4, 5, full);
    expect(r2!.state.cups[4]).toEqual([A, B]);
    // New top B: A accepted, B rejected — derived, not stored.
    const sA: TeaId[][] = [[A], [], [], [], [A, B], []];
    expect(pourRejectCodeState({ cups: sA } as never, 0, 4, full)).toBe('ok');
    const sB: TeaId[][] = [[B], [], [], [], [A, B], []];
    expect(pourRejectCodeState({ cups: sB } as never, 0, 4, full)).toBe('color-mismatch');
  });

  it('C7: downstream divergence — different top sourced', () => {
    const full = boardC();
    const cups: TeaId[][] = [[B], [], [], [], [A], []];
    const r1 = applyPourState({ cups } as never, 0, 4, full);
    expect(r1!.state.cups[4]).toEqual([A, B]);
    const sFull = applyPourState(r1!.state as never, 4, 5, full);
    expect(sFull!.layer).toBe(B);
    const rCtrl = applyPourState({ cups } as never, 0, 4, controlOf(full));
    expect(rCtrl).toBeNull(); // CONTROL cannot even receive here
  });

  it('C8: transfer count frozen (FULL == CONTROL where both allow)', () => {
    const full = boardC();
    const control = controlOf(full);
    // Empty special: both allow with identical count.
    const cups: TeaId[][] = [[B, B], [], [], [], [], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(
      pourCountState({ cups } as never, 0, 4, control),
    );
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(2);
    // Nonempty special: FULL and CONTROL are mutually exclusive by design
    // (different-only vs same-only) — pinned in C2/C3 instead.
  });

  it('C9: accepted quantity follows ordinary max-run/free-space', () => {
    const full = boardC();
    const cups: TeaId[][] = [[B, B, B], [], [], [], [A], []];
    expect(pourCountState({ cups } as never, 0, 4, full)).toBe(3);
    const res = applyPourState({ cups } as never, 0, 4, full);
    expect(res!.state.cups[4]).toEqual([A, B, B, B]);
  });

  it('C10: full special stays full-gated', () => {
    const full = boardC();
    const cups: TeaId[][] = [[D], [], [], [], [A, B, A, B], []];
    expect(pourRejectCodeState({ cups } as never, 0, 4, full)).toBe('target-full');
  });

  it('C11: source parity (FROM special ordinary)', () => {
    const full = boardC();
    const control = controlOf(full);
    const cups: TeaId[][] = [[], [], [], [], [A, B, B], []];
    const rFull = applyPourState({ cups } as never, 4, 0, full);
    const rCtrl = applyPourState({ cups } as never, 4, 0, control);
    expect(rFull!.transferred).toBe(2);
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('C12: ordinary-destination apply parity', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A, A], [A], [], [], [], []];
    const rFull = applyPourState({ cups } as never, 0, 1, full);
    const rCtrl = applyPourState({ cups } as never, 0, 1, controlOf(full));
    expect(rFull!.state.cups).toEqual(rCtrl!.state.cups);
  });

  it('C13: Undo after different receive restores exact layers', () => {
    const logic = new TeaSortLogic();
    logic.initFromState([[B], [], [], [], [A], []], [], boardC());
    logic.makeMove(0, 4);
    expect(logic.toState().cups[4]).toEqual([A, B]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([B]);
    expect(logic.toState().cups[4]).toEqual([A]);
  });

  it('C14: restart reproduces exact root state', () => {
    const logic = new TeaSortLogic();
    const init: TeaId[][] = [[B], [], [], [], [A], []];
    logic.initFromState(init, [], boardC());
    logic.makeMove(0, 4);
    logic.initFromState(init, [], boardC());
    expect(logic.toState().cups).toEqual(init);
  });

  it('C15: canonical marker distinct (:DTB); legacy freeze', () => {
    const full = boardC();
    const cups: TeaId[][] = [[A], [], [], [], [B], []];
    expect(canonicalPuzzleKey({ cups } as never, full)).not.toBe(
      canonicalPuzzleKey({ cups } as never, controlOf(full)),
    );
    expect(cupConstraintSignature(specialC())).toContain(':DTB');
    expect(cupConstraintSignature({ mode: 'normal' }).includes(':DTB')).toBe(false);
    expect(isValidDifferentTeaBufferConstraint(specialC())).toBe(true);
  });

  it('C16: malformed shapes fail closed', () => {
    const badCap: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 5, mustEndEmpty: true, differentTeaBuffer: true }, ordinary()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badCap)).toBe(true);
    const badMode: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'sink-only', capacity: 4, mustEndEmpty: true, differentTeaBuffer: true }, ordinary()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badMode)).toBe(true);
    expect(pourRejectCodeState({ cups: [[A], [], [], [], [A], []] } as never, 0, 4, badCap)).toBe(
      'special-malformed',
    );
  });

  it('C17: sibling markers and census fail closed', () => {
    const badMix: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(),
      { mode: 'normal', capacity: 4, mustEndEmpty: true, mixedBuffer: true, differentTeaBuffer: true }, ordinary()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badMix)).toBe(true);
    const badTwo: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialC(), specialC()];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, badTwo)).toBe(true);
  });

  it('C18: production special on C board fails closed', () => {
    const bad: CupConstraint[] = [ordinary(), ordinary(), ordinary(), ordinary(), specialC(),
      { mode: 'normal', capacity: 2, mustEndEmpty: true }];
    expect(isG29BoardMalformed({ cups: [[A], [], [], [], [], []] } as never, bad)).toBe(true);
  });

  it('C19: mustEndEmpty finality', () => {
    const full = boardC();
    expect(isPuzzleWonState({ cups: [[], [], [], [], [A, B], []] } as never, full)).toBe(false);
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], []];
    expect(isPuzzleWonState({ cups } as never, full)).toBe(true);
  });

  it('C20: no stored alternation (derived rule, repeatable)', () => {
    const full = boardC();
    expect(g28CompatCheck(full)).toBe(true);
    function g28CompatCheck(f: CupConstraint[]): boolean {
      void f;
      return (
        g29CompatibilityOverride(B, [A], specialC()) === 'accept' &&
        g29CompatibilityOverride(A, [A], specialC()) === 'reject' &&
        g29CompatibilityOverride(A, [], specialC()) === 'ordinary' &&
        g29CompatibilityOverride(B, [A], undefined) === 'ordinary'
      );
    }
  });

  it('C21: solver actions remain from→to pours', () => {
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

  it('C22: legality identical FULL vs CONTROL except special destination', () => {
    const full = boardC();
    const control = controlOf(full);
    const cups: TeaId[][] = [[A, B], [B, A], [C], [D], [A], []];
    for (const [f, t] of [[0, 1], [1, 0], [0, 5], [2, 3], [4, 0], [4, 5]]) {
      expect(canPourState({ cups } as never, f, t, full)).toBe(
        canPourState({ cups } as never, f, t, control),
      );
    }
    // The special destination itself differs exactly where the contract says:
    // source top B vs special top A → FULL accepts, CONTROL rejects.
    expect(canPourState({ cups } as never, 0, 4, full)).toBe(true);
    expect(canPourState({ cups } as never, 0, 4, control)).toBe(false);
  });
});
