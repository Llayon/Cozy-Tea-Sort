/**
 * Gauntlet 6 — catch-one strainer core mechanics (A–J).
 *
 * Pins the single authoritative transition truth in rules.ts + TeaSortLogic:
 * free placement, strained catch (m>=2), capacity gating, constructive
 * classification, canonical keys, deadlock, win (held-null), undo timeline,
 * restart. Solver rescue + regressions live in strainer-solver.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyStrainerState,
  standStrainerState,
  normalizeStrainerState,
  cloneStrainerState,
  isPourAction,
  isPlaceStrainerAction,
  isReleaseStrainerAction,
  type CupConstraint,
  type FloatingIngredientSlot,
  type PuzzleState,
  type TeaId,
} from '../src/game/types';
import {
  applyPlaceStrainerState,
  applyPourState,
  applyPuzzleActionState,
  applyReleaseStrainerState,
  canPlaceStrainerState,
  canReleaseStrainerState,
  canonicalKey,
  canonicalPuzzleKey,
  isConstructiveMoveState,
  isConstructiveReleaseState,
  isProductiveStrainerPlacement,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  isStrainedCatchSource,
  listConstructiveActionsState,
  listLegalActionsState,
  placeStrainerRejectCodeState,
  pourRejectCodeState,
  puzzleActionCost,
  releaseStrainerRejectCodeState,
  unstrainedPourCountState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const SB: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };

const noIng = (n: number): FloatingIngredientSlot[] => Array.from({ length: n }, () => null);

describe('A. placement: free preparation', () => {
  it('stand → valid normal attaches with moves 0', () => {
    const logic = new TeaSortLogic(
      [[M, K], [SB], []],
      [0, 0, 0],
      undefined,
      undefined,
      standStrainerState(),
    );
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    const res = logic.placeStrainer(0);
    expect(res).not.toBeNull();
    expect(logic.strainerState.attachedCupIndex).toBe(0);
    expect(logic.strainerState.heldTea).toBeNull();
    expect(logic.movesCount).toBe(0);
    expect(logic.history).toHaveLength(1);
    // Pure rule agrees.
    const st = { cups: [[M, K], [SB], []], floatingIngredients: noIng(3), strainer: standStrainerState() };
    expect(placeStrainerRejectCodeState(st, 0)).toBe('ok');
    expect(canPlaceStrainerState(st, 0)).toBe(true);
    const next = applyPlaceStrainerState(st, 0);
    expect(next?.strainer).toEqual({ present: true, attachedCupIndex: 0, heldTea: null });
  });

  it('relocation A → B stays free with moves 0', () => {
    const logic = new TeaSortLogic([[M, K], [SB], []], [0, 0, 0], undefined, undefined, standStrainerState());
    expect(logic.placeStrainer(0)).not.toBeNull();
    expect(logic.movesCount).toBe(0);
    const reloc = logic.placeStrainer(1);
    expect(reloc).not.toBeNull();
    expect(logic.strainerState.attachedCupIndex).toBe(1);
    expect(logic.movesCount).toBe(0);
    expect(logic.history).toHaveLength(2);
  });

  it('same-host placement rejected with no history growth', () => {
    const logic = new TeaSortLogic([[M, K], [SB], []], [0, 0, 0], undefined, undefined, standStrainerState());
    expect(logic.placeStrainer(0)).not.toBeNull();
    const beforeLen = logic.history.length;
    expect(logic.placeStrainerRejectCode(0)).toBe('same-host');
    expect(logic.placeStrainer(0)).toBeNull();
    expect(logic.history).toHaveLength(beforeLen);
    expect(logic.movesCount).toBe(0);
    expect(logic.strainerState.attachedCupIndex).toBe(0);
  });

  it('empty host rejected target-empty', () => {
    const st = { cups: [[M, K], []], floatingIngredients: noIng(2), strainer: standStrainerState() };
    expect(placeStrainerRejectCodeState(st, 1)).toBe('target-empty');
    expect(canPlaceStrainerState(st, 1)).toBe(false);
    expect(applyPlaceStrainerState(st, 1)).toBeNull();
  });

  it('sink host rejected target-sink-only; teapot host accepted', () => {
    const sinkSt = { cups: [[M], [SB]], floatingIngredients: noIng(2), strainer: standStrainerState() };
    expect(placeStrainerRejectCodeState(sinkSt, 1, [N, SNK])).toBe('target-sink-only');
    expect(canPlaceStrainerState(sinkSt, 1, [N, SNK])).toBe(false);
    const teapotSt = { cups: [[M], [SB]], floatingIngredients: noIng(2), strainer: standStrainerState() };
    expect(placeStrainerRejectCodeState(teapotSt, 0, [SRC, N])).toBe('ok');
    expect(canPlaceStrainerState(teapotSt, 0, [SRC, N])).toBe(true);
  });

  it('loaded tool placement rejected strainer-loaded', () => {
    const loaded = { cups: [[M], [SB]], floatingIngredients: noIng(2), strainer: { present: true, attachedCupIndex: null, heldTea: M } };
    expect(placeStrainerRejectCodeState(loaded, 0)).toBe('strainer-loaded');
    expect(canPlaceStrainerState(loaded, 0)).toBe(false);
    expect(applyPlaceStrainerState(loaded, 0)).toBeNull();
    // Through logic after a real catch.
    const logic = new TeaSortLogic([[M, K, K], [K], []], [0, 0, 0], undefined, undefined, standStrainerState());
    expect(logic.placeStrainer(0)).not.toBeNull();
    expect(logic.makeMove(0, 2)?.strained).toBe(true);
    expect(logic.strainerState.heldTea).toBe(K);
    expect(logic.placeStrainerRejectCode(1)).toBe('strainer-loaded');
    expect(logic.placeStrainer(1)).toBeNull();
  });

  it('lemon-vessel placement rejected target-floating-occupied-by-tool-conflict', () => {
    const st = { cups: [[M, K], [SB]], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[], strainer: standStrainerState() };
    expect(placeStrainerRejectCodeState(st, 0)).toBe('target-floating-occupied-by-tool-conflict');
    expect(canPlaceStrainerState(st, 0)).toBe(false);
  });
});

describe('B. strained pour: catch-one transfer', () => {
  it('attached AAA-source into empty captures one (pure rules)', () => {
    const st = {
      cups: [[M, K, K, K], []],
      floatingIngredients: noIng(2),
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    expect(isStrainedCatchSource(st, 0)).toBe(true);
    expect(isStrainedCatchSource(st, 1)).toBe(false);
    expect(unstrainedPourCountState(st, 0, 1)).toBe(3);
    expect(pourRejectCodeState(st, 0, 1)).toBe('ok');
    const res = applyPourState(st, 0, 1);
    expect(res).not.toBeNull();
    // Source loses m, dest gains m-1, tool holds one and detaches.
    expect(res?.transferred).toBe(3);
    expect(res?.received).toBe(2);
    expect(res?.strained).toBe(true);
    expect(res?.caughtTea).toBe(K);
    expect(res?.layer).toBe(K);
    expect(res?.state.cups).toEqual([[M], [K, K]]);
    expect(res?.state.strainer).toEqual({ present: true, attachedCupIndex: null, heldTea: K });
  });

  it('logic makeMove counts +1 strained; release into matching dest +1 and clears hold', () => {
    const logic = new TeaSortLogic([[M, K, K, K], []], [0, 0], undefined, undefined, {
      present: true,
      attachedCupIndex: 0,
      heldTea: null,
    });
    const mv = logic.makeMove(0, 1);
    expect(mv?.strained).toBe(true);
    expect(mv?.caughtTea).toBe(K);
    expect(mv?.move.count).toBe(3);
    expect(logic.cups[0]?.layers).toEqual([M]);
    expect(logic.cups[1]?.layers).toEqual([K, K]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: K });
    expect(logic.movesCount).toBe(1);
    // Release back into the matching destination (top K).
    expect(logic.canReleaseStrainer(1)).toBe(true);
    const rel = logic.releaseStrainer(1);
    expect(rel?.layer).toBe(K);
    expect(logic.cups[1]?.layers).toEqual([K, K, K]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    expect(logic.movesCount).toBe(2);
  });
});

describe('C. non-meaningful single-layer pour while attached', () => {
  it('m==1 attached pour rejected strainer-needs-two-layers with zero mutation', () => {
    const st = {
      cups: [[M, K], []],
      floatingIngredients: noIng(2),
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    // Ordinary count would be 1 (top run 1 into empty).
    expect(unstrainedPourCountState(st, 0, 1)).toBe(1);
    expect(pourRejectCodeState(st, 0, 1)).toBe('strainer-needs-two-layers');
    expect(applyPourState(st, 0, 1)).toBeNull();
    const logic = new TeaSortLogic([[M, K], []], [0, 0], undefined, undefined, {
      present: true,
      attachedCupIndex: 0,
      heldTea: null,
    });
    const before = logic.toState();
    expect(logic.makeMove(0, 1)).toBeNull();
    expect(logic.movesCount).toBe(0);
    expect(logic.history).toHaveLength(0);
    expect(logic.toState()).toEqual(before);
    expect(logic.strainerState.attachedCupIndex).toBe(0);
    expect(logic.strainerState.heldTea).toBeNull();
  });
});

describe('D. capacity gates strained pours', () => {
  it('dest free limits m; strained m==1 rejected', () => {
    // Source top run 3 K, dest [M,M,K] top K with exactly 1 free slot.
    const st = {
      cups: [[M, K, K, K], [M, M, K]],
      floatingIngredients: noIng(2),
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    // Ordinary transfer limited 3 → 1 by destination space.
    const ord = { cups: st.cups, floatingIngredients: noIng(2) };
    expect(unstrainedPourCountState(ord, 0, 1)).toBe(1);
    expect(unstrainedPourCountState(st, 0, 1)).toBe(1);
    expect(pourRejectCodeState(st, 0, 1)).toBe('strainer-needs-two-layers');
    expect(applyPourState(st, 0, 1)).toBeNull();
  });
});

describe('E. constructive: strained pours never prune as symmetry', () => {
  it('partial AAA → empty: ordinary pruned, strained constructive', () => {
    const ord = { cups: [[M, M, M], []], floatingIngredients: noIng(2) };
    // Legal (legacy only rejects FULL homogeneous → empty) but pruned.
    expect(pourRejectCodeState(ord, 0, 1)).toBe('ok');
    expect(isConstructiveMoveState(ord, 0, 1)).toBe(false);
    const strained = {
      cups: [[M, M, M], []],
      floatingIngredients: noIng(2),
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    expect(pourRejectCodeState(strained, 0, 1)).toBe('ok');
    expect(isConstructiveMoveState(strained, 0, 1)).toBe(true);
  });

  it('full AAAA → empty same-group stays blocked for both (complete-to-empty)', () => {
    const ord = { cups: [[M, M, M, M], []], floatingIngredients: noIng(2) };
    expect(pourRejectCodeState(ord, 0, 1)).toBe('complete-to-empty');
    expect(isConstructiveMoveState(ord, 0, 1)).toBe(false);
    const strained = {
      cups: [[M, M, M, M], []],
      floatingIngredients: noIng(2),
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    expect(pourRejectCodeState(strained, 0, 1)).toBe('complete-to-empty');
    expect(isConstructiveMoveState(strained, 0, 1)).toBe(false);
  });
});

describe('F. canonical keys with the tool', () => {
  const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];

  it('absent strainer keeps the byte-identical legacy key', () => {
    const cons: CupConstraint[] = [N, SRC, N];
    const legacy = canonicalKey(cups, cons);
    expect(canonicalPuzzleKey({ cups, floatingIngredients: noIng(3) }, cons)).toBe(legacy);
    expect(canonicalPuzzleKey({ cups, floatingIngredients: noIng(3), strainer: emptyStrainerState() }, cons)).toBe(legacy);
    expect(canonicalPuzzleKey({ cups, floatingIngredients: noIng(3) })).toBe(canonicalKey(cups));
  });

  it('lemon-only G5 key is exact', () => {
    const st = { cups: [[M, M, M, M], []], floatingIngredients: ['lemon', null] as FloatingIngredientSlot[] };
    expect(canonicalPuzzleKey(st, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });

  it('stand vs absent differ; attached vs stand differ; loaded vs empty-stand differ', () => {
    const base = { cups, floatingIngredients: noIng(3) };
    const stand = { cups, floatingIngredients: noIng(3), strainer: standStrainerState() };
    const attached = {
      cups,
      floatingIngredients: noIng(3),
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    const loaded = {
      cups,
      floatingIngredients: noIng(3),
      strainer: { present: true, attachedCupIndex: null, heldTea: M },
    };
    expect(canonicalPuzzleKey(stand)).not.toBe(canonicalPuzzleKey(base));
    expect(canonicalPuzzleKey(stand)).toContain('STR:STAND:EMPTY');
    expect(canonicalPuzzleKey(attached)).not.toBe(canonicalPuzzleKey(stand));
    expect(canonicalPuzzleKey(loaded)).not.toBe(canonicalPuzzleKey(stand));
    expect(canonicalPuzzleKey(loaded)).toContain('STR:STAND:HOLD:matcha');
  });

  it('identical-vessel swap with attached tool keys identically; held tea distinguished', () => {
    const a = { cups: [[M], [K]], floatingIngredients: noIng(2), strainer: { present: true, attachedCupIndex: 0, heldTea: null } };
    const b = { cups: [[K], [M]], floatingIngredients: noIng(2), strainer: { present: true, attachedCupIndex: 1, heldTea: null } };
    expect(canonicalPuzzleKey(a)).toBe(canonicalPuzzleKey(b));
    const holdM = { cups, floatingIngredients: noIng(3), strainer: { present: true, attachedCupIndex: null, heldTea: M } };
    const holdK = { cups, floatingIngredients: noIng(3), strainer: { present: true, attachedCupIndex: null, heldTea: K } };
    expect(canonicalPuzzleKey(holdM)).not.toBe(canonicalPuzzleKey(holdK));
  });
});

describe('G. deadlock with the tool', () => {
  it('no constructive pour + no productive placement + no release → deadlocked', () => {
    const st = {
      cups: [[M, M, M, K], [K, K, K, M]],
      floatingIngredients: noIng(2),
      strainer: standStrainerState(),
    };
    expect(listConstructiveActionsState(st)).toEqual([]);
    expect(isPuzzleDeadlockedState(st)).toBe(true);
  });

  it('productive placement exists → not deadlocked', () => {
    const st = {
      cups: [[M, M, M], [K, K, K], []],
      floatingIngredients: noIng(3),
      strainer: standStrainerState(),
    };
    expect(isProductiveStrainerPlacement(st, 0)).toBe(true);
    expect(isPuzzleDeadlockedState(st)).toBe(false);
    expect(listConstructiveActionsState(st).some((a) => a.kind === 'place-strainer')).toBe(true);
  });

  it('loaded tool with a valid release → not deadlocked (release rescues)', () => {
    // Partial stacks → empty are pruned, so no constructive pour exists;
    // the single empty still accepts the held layer.
    const st = {
      cups: [[M, M], [K, K], []],
      floatingIngredients: noIng(3),
      strainer: { present: true, attachedCupIndex: null, heldTea: M },
    };
    expect(listConstructiveActionsState(st).filter((a) => a.kind === 'pour')).toEqual([]);
    expect(isConstructiveReleaseState(st, 2)).toBe(true);
    expect(isPuzzleDeadlockedState(st)).toBe(false);
  });
});

describe('H. win requires an empty hold', () => {
  const won: TeaId[][] = [[M, M, M, M], [K, K, K, K], []];

  it('tea goals met + held non-null → not won', () => {
    const st = {
      cups: won,
      floatingIngredients: noIng(3),
      strainer: { present: true, attachedCupIndex: null, heldTea: M },
    };
    expect(isPuzzleWonState(st)).toBe(false);
  });

  it('tea goals met + held null → won', () => {
    const st = { cups: won, floatingIngredients: noIng(3), strainer: standStrainerState() };
    expect(isPuzzleWonState(st)).toBe(true);
  });

  it('attached-but-empty tool anywhere at win → still won', () => {
    for (const host of [0, 1, 2]) {
      const st: PuzzleState = {
        cups: won.map((c) => [...c]),
        floatingIngredients: noIng(3),
        strainer: { present: true, attachedCupIndex: host, heldTea: null },
      };
      expect(isPuzzleWonState(st)).toBe(true);
    }
  });
});

describe('I. undo timeline with the tool', () => {
  it('stand(0) → place A(0) → strained(1, loaded) → release B(2) unwinds exactly', () => {
    const logic = new TeaSortLogic([[M, K, K], [], [K]], [0, 0, 0], undefined, undefined, standStrainerState());
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    expect(logic.movesCount).toBe(0);

    expect(logic.placeStrainer(0)).not.toBeNull();
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: 0, heldTea: null });
    expect(logic.movesCount).toBe(0);

    const mv = logic.makeMove(0, 1);
    expect(mv?.strained).toBe(true);
    expect(mv?.caughtTea).toBe(K);
    expect(logic.cups.map((c) => [...c.layers])).toEqual([[M], [K], [K]]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: K });
    expect(logic.movesCount).toBe(1);

    expect(logic.releaseStrainer(2)).not.toBeNull();
    expect(logic.cups.map((c) => [...c.layers])).toEqual([[M], [K], [K, K]]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    expect(logic.movesCount).toBe(2);

    // Undo release → loaded, moves 1, destination restored.
    logic.undo();
    expect(logic.cups.map((c) => [...c.layers])).toEqual([[M], [K], [K]]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: K });
    expect(logic.movesCount).toBe(1);

    // Undo strained pour → attached, hold cleared, tea + moves restored.
    logic.undo();
    expect(logic.cups.map((c) => [...c.layers])).toEqual([[M, K, K], [], [K]]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: 0, heldTea: null });
    expect(logic.movesCount).toBe(0);

    // Undo place → stand, moves 0.
    logic.undo();
    expect(logic.cups.map((c) => [...c.layers])).toEqual([[M, K, K], [], [K]]);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    expect(logic.movesCount).toBe(0);
    expect(logic.canUndo).toBe(false);
  });
});

describe('J. restart restores the stand', () => {
  it('initFromState with the initial strainer restores stand-empty moves 0', () => {
    const initCups: TeaId[][] = [[M, K, K], [], [K]];
    const logic = new TeaSortLogic(initCups.map((c) => [...c]), [0, 0, 0], undefined, undefined, standStrainerState());
    expect(logic.placeStrainer(0)).not.toBeNull();
    expect(logic.makeMove(0, 1)).not.toBeNull();
    expect(logic.movesCount).toBe(1);
    expect(logic.strainerState.heldTea).toBe(K);

    logic.initFromState(initCups.map((c) => [...c]), [0, 0, 0], undefined, undefined, standStrainerState());
    expect(logic.cups.map((c) => [...c.layers])).toEqual(initCups);
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    expect(logic.movesCount).toBe(0);
    expect(logic.history).toHaveLength(0);
  });
});

describe('types: strainer helpers', () => {
  it('normalize / clone keep the stand/empty distinction', () => {
    expect(normalizeStrainerState(undefined)).toEqual(emptyStrainerState());
    expect(standStrainerState()).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    const s = { present: true, attachedCupIndex: 1, heldTea: null };
    expect(cloneStrainerState(s)).toEqual(s);
    expect(cloneStrainerState(s)).not.toBe(s);
  });

  it('action guards discriminate the vocabulary', () => {
    expect(isPourAction({ kind: 'pour', from: 0, to: 1 })).toBe(true);
    expect(isPlaceStrainerAction({ kind: 'place-strainer', to: 0 })).toBe(true);
    expect(isReleaseStrainerAction({ kind: 'release-strainer', to: 1 })).toBe(true);
    expect(isPourAction({ kind: 'place-strainer', to: 0 })).toBe(false);
  });

  it('costs: place 0, pour/release 1', () => {
    expect(puzzleActionCost({ kind: 'place-strainer', to: 0 })).toBe(0);
    expect(puzzleActionCost({ kind: 'pour', from: 0, to: 1 })).toBe(1);
    expect(puzzleActionCost({ kind: 'release-strainer', to: 1 })).toBe(1);
  });

  it('action tables stay consistent (legal vs constructive)', () => {
    const st = {
      cups: [[M, M, M], [K, K, K], []],
      floatingIngredients: noIng(3),
      strainer: standStrainerState(),
    };
    const legal = listLegalActionsState(st);
    const constructive = listConstructiveActionsState(st);
    // Free placements are legal; only productive ones are constructive.
    expect(legal.some((a) => a.kind === 'place-strainer')).toBe(true);
    expect(constructive.some((a) => a.kind === 'place-strainer' && a.to === 0)).toBe(true);
    // Replay one constructive action through the unified applier.
    const act = constructive.find((a) => a.kind === 'place-strainer');
    expect(act).toBeDefined();
    expect(applyPuzzleActionState(st, act!)).not.toBeNull();
  });
});
