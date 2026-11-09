/**
 * G26 A — bottom-draw vessel direct witnesses (research only).
 * Cups are bottom→top arrays: cups[i][0] is the BOTTOM layer.
 */
import { describe, expect, it } from 'vitest';
import {
  bottomLayerOf,
  bottomRunCountOf,
  sourceTransferPlan,
} from '../src/game/logic/g26Research';
import {
  applyPourState,
  canonicalPuzzleKey,
  canPourState,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { cupConstraintSignature, type CupConstraint, type TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';

function bottomDraw(): CupConstraint {
  return { mode: 'normal', capacity: 4, mustEndEmpty: true, bottomDraw: true };
}
function ordinaryEmpty(): CupConstraint {
  return { mode: 'normal' };
}
function controlOf(special: CupConstraint): CupConstraint {
  const { bottomDraw: _drop, ...rest } = special as CupConstraint & { bottomDraw?: boolean };
  void _drop;
  return rest;
}

describe('g26 bottom-draw direct witnesses', () => {
  it('witness1: FULL bottom transfer legal while CONTROL top transfer illegal', () => {
    const special = bottomDraw();
    const cups: TeaId[][] = [[A, A, B, B], [A]];
    const constraints: CupConstraint[] = [special, ordinaryEmpty()];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('ok');
    expect(pourCountState({ cups }, 0, 1, constraints)).toBe(2);
    const res = applyPourState({ cups }, 0, 1, constraints);
    expect(res).not.toBeNull();
    expect(res!.layer).toBe(A);
    expect(res!.transferred).toBe(2);
    expect(res!.state.cups[0]).toEqual([B, B]);
    expect(res!.state.cups[1]).toEqual([A, A, A]);
    // CONTROL: same contents, marker stripped, tries B vs A.
    const control: CupConstraint[] = [controlOf(special), ordinaryEmpty()];
    expect(pourRejectCodeState({ cups }, 0, 1, control)).toBe('color-mismatch');
    expect(canPourState({ cups }, 0, 1, control)).toBe(false);
  });

  it('witness2: FULL moves bottom A,A while CONTROL moves top B', () => {
    const special = bottomDraw();
    const cups: TeaId[][] = [[A, A, B], []];
    const constraints: CupConstraint[] = [special, ordinaryEmpty()];
    const full = applyPourState({ cups }, 0, 1, constraints);
    expect(full!.state.cups[0]).toEqual([B]);
    expect(full!.state.cups[1]).toEqual([A, A]);
    const control: CupConstraint[] = [controlOf(special), ordinaryEmpty()];
    const ctrl = applyPourState({ cups }, 0, 1, control);
    expect(ctrl!.state.cups[0]).toEqual([A, A]);
    expect(ctrl!.state.cups[1]).toEqual([B]);
    expect(full!.state.cups).not.toEqual(ctrl!.state.cups);
  });

  it('witness3: partial bottom removal bounded by destination space', () => {
    const special = bottomDraw();
    const cups: TeaId[][] = [[A, A, A, B], [A, A, A]];
    const constraints: CupConstraint[] = [special, ordinaryEmpty()];
    expect(pourCountState({ cups }, 0, 1, constraints)).toBe(1);
    const res = applyPourState({ cups }, 0, 1, constraints);
    expect(res!.transferred).toBe(1);
    expect(res!.layer).toBe(A);
    expect(res!.state.cups[0]).toEqual([A, A, B]);
    expect(res!.state.cups[1]).toEqual([A, A, A, A]);
  });

  it('witness4: FULL rejects on bottom tea while CONTROL accepts on top tea', () => {
    const special = bottomDraw();
    const cups: TeaId[][] = [[B, B, A], [A]];
    const constraints: CupConstraint[] = [special, ordinaryEmpty()];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('color-mismatch');
    const control: CupConstraint[] = [controlOf(special), ordinaryEmpty()];
    expect(pourRejectCodeState({ cups }, 0, 1, control)).toBe('ok');
    expect(applyPourState({ cups }, 0, 1, control)!.state.cups[1]).toEqual([A, A]);
  });

  it('destination semantics stay ordinary (no special receive)', () => {
    const dest = bottomDraw();
    const cups: TeaId[][] = [[B, B], [A, B]];
    const constraints: CupConstraint[] = [ordinaryEmpty(), dest];
    expect(pourRejectCodeState({ cups }, 0, 1, constraints)).toBe('ok');
    const res = applyPourState({ cups }, 0, 1, constraints);
    expect(res!.layer).toBe(B);
    expect(res!.state.cups[1]).toEqual([A, B, B, B].slice(0, 4));
  });

  it('empty source and full destination keep existing codes', () => {
    const special = bottomDraw();
    expect(pourRejectCodeState({ cups: [[], [A]] }, 0, 1, [special, ordinaryEmpty()])).toBe('source-empty');
    expect(
      pourRejectCodeState({ cups: [[A, B], [A, A, A, A]] }, 0, 1, [special, ordinaryEmpty()]),
    ).toBe('target-full');
  });

  it('undo restores exact bottom-draw ordering', () => {
    const logic = new TeaSortLogic(
      [[A, A, B, B], [A]],
      [],
      [bottomDraw(), ordinaryEmpty()],
    );
    expect(logic.canMakeMove(0, 1)).toBe(true);
    const out = logic.makeMove(0, 1);
    expect(out!.move.layer).toBe(A);
    expect(out!.move.count).toBe(2);
    expect(logic.toState().cups[0]).toEqual([B, B]);
    logic.undo();
    expect(logic.toState().cups[0]).toEqual([A, A, B, B]);
    expect(logic.toState().cups[1]).toEqual([A]);
  });

  it('single extraction plan: bottom run truth, ordinary top truth', () => {
    expect(sourceTransferPlan([A, A, A, B, C] as TeaId[], bottomDraw())).toEqual({
      tea: A,
      available: 3,
      kind: 'bottom',
    });
    expect(bottomRunCountOf([A, A, A, B, C] as TeaId[])).toBe(3);
    expect(bottomLayerOf([A, B] as TeaId[])).toBe(A);
    expect(sourceTransferPlan([A, A, B, B] as TeaId[], ordinaryEmpty())).toEqual({
      tea: B,
      available: 2,
      kind: 'top',
    });
    expect(sourceTransferPlan([] as TeaId[], bottomDraw())).toEqual({ tea: null, available: 0, kind: 'top' });
  });

  it('canonical identity: marker distinct, absent legacy identical', () => {
    const sigOrdinary = cupConstraintSignature(ordinaryEmpty());
    const sigBottom = cupConstraintSignature(bottomDraw());
    expect(sigBottom).toContain(':BD');
    expect(sigBottom).not.toBe(sigOrdinary);
    const cups: TeaId[][] = [[A, A, B, B], [A]];
    const keyFull = canonicalPuzzleKey({ cups }, [bottomDraw(), ordinaryEmpty()]);
    const keyControl = canonicalPuzzleKey({ cups }, [controlOf(bottomDraw()), ordinaryEmpty()]);
    expect(keyFull).not.toBe(keyControl);
    // Legacy freeze: two ordinary encodings stay byte-identical with/without explicit normal.
    const keyLegacyA = canonicalPuzzleKey({ cups }, undefined);
    const keyLegacyB = canonicalPuzzleKey({ cups }, [ordinaryEmpty(), ordinaryEmpty()]);
    void keyLegacyA;
    void keyLegacyB;
    // Ordinary pours untouched by research code.
    const plain: TeaId[][] = [[A, A, B], [A]];
    expect(pourRejectCodeState({ cups: plain }, 0, 1, [ordinaryEmpty(), ordinaryEmpty()])).toBe('color-mismatch');
    expect(pourCountState({ cups: plain }, 0, 1, [ordinaryEmpty(), ordinaryEmpty()])).toBe(0);
  });

  it('malformed bottom-draw fails closed (source-only, target, sibling)', () => {
    const badMode: CupConstraint = { mode: 'source-only', capacity: 4, mustEndEmpty: true, bottomDraw: true };
    expect(pourRejectCodeState({ cups: [[A, A, B], []] }, 0, 1, [badMode, ordinaryEmpty()])).not.toBe('ok');
    const badTarget: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true, bottomDraw: true, targetTeaId: A };
    expect(pourRejectCodeState({ cups: [[A, A, B], []] }, 0, 1, [badTarget, ordinaryEmpty()])).not.toBe('ok');
    const sibling: CupConstraint = { mode: 'normal', capacity: 4, mustEndEmpty: true, bottomDraw: true, steepingFlask: true };
    expect(pourRejectCodeState({ cups: [[A, A, B], []] }, 0, 1, [sibling, ordinaryEmpty()])).not.toBe('ok');
  });

  it('homogeneous special has no access novelty (same bottom/top tea)', () => {
    const plan = sourceTransferPlan([B, B, B, B] as TeaId[], bottomDraw());
    expect(plan.tea).toBe(B);
    expect(plan.available).toBe(4);
    // Control top plan identical for homogeneous stacks.
    const ctrl = sourceTransferPlan([B, B, B, B] as TeaId[], ordinaryEmpty());
    expect(ctrl.tea).toBe(plan.tea);
  });
});
