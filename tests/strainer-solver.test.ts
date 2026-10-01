/**
 * Gauntlet 6 — strainer solver + undo + regression (K–O).
 *
 * K/L pin the control rescue fixture (tool necessary, optimal 13-pour path
 * with exactly one catch/release). M pins legacy depths without the tool.
 * N pins 0-1 BFS termination under free placements. O pins move costs.
 */
import { describe, expect, it } from 'vitest';
import {
  type CupConstraint,
  type FloatingIngredientSlot,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  applyPuzzleActionState,
  isPuzzleWonState,
  puzzleActionCost,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applySolution, applySolutionState, solvePuzzle } from '../src/game/logic/solver';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const SB: TeaId = 'sea_buckthorn';
const MO: TeaId = 'milk_oolong';
const L: TeaId = 'lavender';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

// Control rescue fixture (all-normal, 4 colors, 5 vessels, 1 empty).
const RESCUE: TeaId[][] = [
  [K, MO, MO, K],
  [K, M, SB, MO],
  [],
  [MO, SB, SB, K],
  [M, M, SB, M],
];
const RESCUE_N: CupConstraint[] = [N, N, N, N, N];

describe('K. control rescue: tool necessary and optimal', () => {
  it('WITHOUT the tool is unsolvable (non-truncated)', () => {
    const res = solvePuzzle(RESCUE.map((c) => [...c]));
    expect(res.solvable).toBe(false);
    expect(res.truncated).not.toBe(true);
    expect(res.minMoves).toBeUndefined();
    expect(res.visitedStates).toBeGreaterThan(0);
  });

  it('WITH the stand tool solves in 13 pours with one catch/release', () => {
    const res = solvePuzzle(RESCUE.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    });
    expect(res.solvable).toBe(true);
    expect(res.truncated).not.toBe(true);
    expect(res.minMoves).toBe(13);
    expect(res.placementCount).toBe(1);
    expect(res.releaseCount).toBe(1);
    expect(res.strainedPourCount).toBe(1);
    expect(res.totalActions).toBe(14);
    const strained = (res.solution ?? []).filter((s) => s.kind === 'pour' && s.strained);
    expect(strained).toHaveLength(1);
    expect(strained[0]).toMatchObject({ layer: SB, caughtTea: SB });
  });

  it('WITH solution replays to a win with an empty hold', () => {
    const res = solvePuzzle(RESCUE.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    });
    const start = {
      cups: RESCUE.map((c) => [...c]),
      floatingIngredients: [null, null, null, null, null] as FloatingIngredientSlot[],
      strainer: { present: true, attachedCupIndex: null, heldTea: null as TeaId | null },
    };
    const final = applySolutionState(start, res.solution ?? [], RESCUE_N);
    expect(final).not.toBeNull();
    expect(isPuzzleWonState(final!, RESCUE_N)).toBe(true);
    expect(final?.strainer.heldTea).toBeNull();
    // And through TeaSortLogic step-by-step.
    const logic = new TeaSortLogic(RESCUE.map((c) => [...c]), [0, 0, 0, 0, 0], RESCUE_N, undefined, {
      present: true,
      attachedCupIndex: null,
      heldTea: null,
    });
    for (const step of res.solution ?? []) {
      if (step.kind === 'place-strainer') {
        expect(logic.placeStrainer(step.to)).not.toBeNull();
      } else if (step.kind === 'release-strainer') {
        expect(logic.releaseStrainer(step.to)).not.toBeNull();
      } else {
        expect(logic.makeMove(step.from, step.to)).not.toBeNull();
      }
    }
    expect(logic.isWon()).toBe(true);
    expect(logic.strainerState.heldTea).toBeNull();
  });
});

describe('L. solver path shape: place → strained → release', () => {
  it('contains the triple in order with catch metadata consistent', () => {
    const res = solvePuzzle(RESCUE.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    });
    expect(res.solvable).toBe(true);
    const sol = res.solution ?? [];
    const placeIdx = sol.findIndex((s) => s.kind === 'place-strainer');
    const strainedIdx = sol.findIndex((s) => s.kind === 'pour' && s.strained);
    const releaseIdx = sol.findIndex((s) => s.kind === 'release-strainer');
    expect(placeIdx).toBeGreaterThanOrEqual(0);
    expect(strainedIdx).toBeGreaterThan(placeIdx);
    expect(releaseIdx).toBeGreaterThan(strainedIdx);

    const strained = sol[strainedIdx];
    expect(strained.kind).toBe('pour');
    if (strained.kind === 'pour') {
      // caughtTea is the transferred layer itself.
      expect(strained.caughtTea).toBe(strained.layer);
      expect(strained.layer).toBe(SB);
      // Destination receives exactly transferred-1 (one layer stays in the tool).
      let board = {
        cups: RESCUE.map((c) => [...c]),
        floatingIngredients: [null, null, null, null, null] as FloatingIngredientSlot[],
        strainer: { present: true, attachedCupIndex: null, heldTea: null as TeaId | null },
      };
      for (let i = 0; i <= strainedIdx; i++) {
        const step = sol[i]!;
        if (step.kind === 'pour' && i === strainedIdx) {
          const before = {
            cups: board.cups.map((c) => [...c]),
            floatingIngredients: [...board.floatingIngredients],
            strainer: { ...board.strainer },
          };
          const applied = applyPourState(before, step.from, step.to);
          expect(applied).not.toBeNull();
          expect(applied?.transferred).toBe(step.count);
          expect(applied?.received).toBe((step.count as number) - 1);
          expect(applied?.strained).toBe(true);
          expect(applied?.caughtTea).toBe(step.layer);
        }
        const next = applyPuzzleActionState(board, step as never);
        expect(next).not.toBeNull();
        board = next!.state as typeof board;
      }
    }
  });
});

describe('M. legacy regressions: depths unchanged without the tool', () => {
  it('base 1-move puzzle stays minMoves 1', () => {
    const board: TeaId[][] = [[M, M, M], [M], []];
    const res = solvePuzzle(board);
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(1);
    expect(applySolution(board, res.solution ?? [])).not.toBeNull();
  });

  it('teapot hand fixture stays minMoves 3 and never pours into the teapot', () => {
    const cups: TeaId[][] = [[K, M, M, M], [M, K, K, K], [], []];
    const cons: CupConstraint[] = [SRC, N, N, N];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
    for (const step of res.solution ?? []) {
      expect(step.to).not.toBe(0);
    }
  });

  it('target swap stays minMoves 3', () => {
    const cups: TeaId[][] = [[K, K, K, K], [M, M, M, M], [], []];
    const cons: CupConstraint[] = [{ mode: 'normal', targetTeaId: M }, { mode: 'normal', targetTeaId: K }, N, N];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
  });

  it('sink serve stays minMoves 3', () => {
    const cups: TeaId[][] = [[K, M, M, M], [M, K, K, K], [], []];
    const cons: CupConstraint[] = [N, N, N, SNK];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
  });

  it('tasting buffer stays minMoves 6', () => {
    const cups: TeaId[][] = [[L, M, L, L], [K, K, K, L], [K, M, M, M], [], []];
    const cons: CupConstraint[] = [N, N, N, N, TASTING];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(6);
  });

  it('lemon travel stays minMoves 7', () => {
    const cups: TeaId[][] = [[M, SB, SB, K], [K, M, M, SB], [SB, K, K, M], [], []];
    const slots: FloatingIngredientSlot[] = [null, 'lemon', null, null, null];
    const cons: CupConstraint[] = [N, N, N, N, N];
    const res = solvePuzzle(cups, { cupConstraints: cons, floatingIngredients: slots });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(7);
  });
});

describe('N. 0-1 deque terminates under free placements', () => {
  it('small strainer puzzle with a visit budget solves optimally with bounded search', () => {
    const cups: TeaId[][] = [[M, K, K, K], [K, M, M, M], [], []];
    const res = solvePuzzle(cups.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
      maxVisited: 500,
    });
    // Free A→B→A placements must not loop forever: bounded, non-truncated,
    // optimal pure-pour solution (the tool is unnecessary here).
    expect(res.truncated).not.toBe(true);
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
    expect(res.visitedStates).toBeLessThan(500);
    expect(res.visitedStates).toBeLessThan(100);
    expect(res.placementCount).toBe(0);
    expect(res.strainedPourCount).toBe(0);
  });

  it('rescue optimality implies stale-cost skipping (documented)', () => {
    // The 0-1 BFS skips stale higher-cost deque entries via the dist-map
    // cost check; the rescue fixture pins optimality (13) with hundreds of
    // visited states, which only holds when stale entries never win.
    const res = solvePuzzle(RESCUE.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    });
    expect(res.minMoves).toBe(13);
    expect(res.visitedStates).toBeLessThan(1000);
  });
});

describe('O. costs: minMoves counts pours + releases only', () => {
  it('puzzleActionCost: place 0, pour/release 1', () => {
    expect(puzzleActionCost({ kind: 'place-strainer', to: 0 })).toBe(0);
    expect(puzzleActionCost({ kind: 'pour', from: 0, to: 1 })).toBe(1);
    expect(puzzleActionCost({ kind: 'release-strainer', to: 1 })).toBe(1);
  });

  it('rescue minMoves equals pours + releases (placements free)', () => {
    const res = solvePuzzle(RESCUE.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    });
    expect(res.solvable).toBe(true);
    const sol = res.solution ?? [];
    const pours = sol.filter((s) => s.kind === 'pour').length;
    const releases = sol.filter((s) => s.kind === 'release-strainer').length;
    const placements = sol.filter((s) => s.kind === 'place-strainer').length;
    expect(res.minMoves).toBe(pours + releases);
    expect(res.totalActions).toBe((res.minMoves as number) + placements);
    expect(placements).toBe(1);
    expect(releases).toBe(1);
  });
});
