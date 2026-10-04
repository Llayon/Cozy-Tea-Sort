/**
 * Gauntlet 7 — honey solver (§95–98) + legacy regressions.
 *
 * Hand fixture is mined SMALL (4 vessels, buckwheat + mixed full honey
 * host + 2 empties, depth 3): honey stays once, moves once, finishes
 * under full buckwheat. Legacy depths are pinned literals measured with
 * the current code (no honey). Canonical keys pin G5/G6 strings exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  sinkingIngredientIndex,
  type CupConstraint,
  type FloatingIngredientSlot,
  type SinkingIngredientSlot,
  type TeaId,
} from '../src/game/types';
import {
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  canonicalPuzzleKeyNoHoney,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { applySolution, applySolutionState, solvePuzzle } from '../src/game/logic/solver';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const SB: TeaId = 'sea_buckthorn';
const MO: TeaId = 'milk_oolong';
const L: TeaId = 'lavender';
const BW: TeaId = 'buckwheat';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

// Small hand fixture (tiny for clarity): mixed full honey host + buckwheat.
const HONEY_CUPS: TeaId[][] = [
  [BW, M, M, M],
  [BW, BW, BW, M],
  [],
  [],
];
const HONEY_SLOTS: SinkingIngredientSlot[] = ['honey', null, null, null];
const HONEY_CONS: CupConstraint[] = [N, N, N, N];

// Strainer control rescue fixture (from tests/strainer-solver.test.ts).
const RESCUE: TeaId[][] = [
  [K, MO, MO, K],
  [K, M, SB, MO],
  [],
  [MO, SB, SB, K],
  [M, M, SB, M],
];

describe('honey hand fixture: honey must stay then move', () => {
  it('WITHOUT honey is irrelevant (tea-only solvable)', () => {
    const wo = solvePuzzle(HONEY_CUPS.map((c) => [...c]), { cupConstraints: HONEY_CONS });
    expect(wo.solvable).toBe(true);
    expect(wo.truncated).not.toBe(true);
  });

  it('WITH honey solvable in pinned 3 moves, pour-only, not truncated', () => {
    const res = solvePuzzle(HONEY_CUPS.map((c) => [...c]), {
      cupConstraints: HONEY_CONS,
      sinkingIngredients: [...HONEY_SLOTS],
    });
    expect(res.solvable).toBe(true);
    expect(res.truncated).not.toBe(true);
    expect(res.minMoves).toBe(3);
    expect(res.solution?.length).toBe(3);
    for (const step of res.solution ?? []) {
      expect(step.kind).toBe('pour');
    }
  });

  it('solution replay shows ≥1 stay + ≥1 move, finishes on full buckwheat won', () => {
    const res = solvePuzzle(HONEY_CUPS.map((c) => [...c]), {
      cupConstraints: HONEY_CONS,
      sinkingIngredients: [...HONEY_SLOTS],
    });
    expect(res.solvable).toBe(true);
    const start = {
      cups: HONEY_CUPS.map((c) => [...c]),
      floatingIngredients: HONEY_CUPS.map(() => null) as FloatingIngredientSlot[],
      sinkingIngredients: [...HONEY_SLOTS],
    };
    const final = applySolutionState(start, res.solution ?? [], HONEY_CONS);
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final!, HONEY_CONS)).toBe(true);
    const host = sinkingIngredientIndex(final!, 'honey');
    expect(host).toBeGreaterThanOrEqual(0);
    expect(final?.cups[host]).toEqual([BW, BW, BW, BW]);
    expect(sinkingIngredientHostSatisfied('honey', final?.cups[host] as TeaId[], HONEY_CONS[host])).toBe(true);

    // Count stays (honey index unchanged) vs moves (honey relocates) plus
    // host-stays (outflow from honey host that leaves tea behind).
    let board = {
      cups: HONEY_CUPS.map((c) => [...c]),
      floatingIngredients: HONEY_CUPS.map(() => null) as FloatingIngredientSlot[],
      sinkingIngredients: [...HONEY_SLOTS],
    };
    let stays = 0;
    let moves = 0;
    let hostStays = 0;
    for (const step of res.solution ?? []) {
      if (step.kind !== 'pour') continue;
      const before = sinkingIngredientIndex({ sinkingIngredients: board.sinkingIngredients }, 'honey');
      const applied = applyPourState(board, step.from, step.to, HONEY_CONS);
      expect(applied).not.toBe(null);
      const after = sinkingIngredientIndex(
        { sinkingIngredients: applied?.state.sinkingIngredients ?? [] },
        'honey',
      );
      if (after !== before) {
        moves++;
      } else {
        stays++;
        if (before === step.from) hostStays++;
      }
      // Honey moves exactly when the emptying outflow leaves the source.
      if (applied?.sinkingIngredientMoved != null) {
        expect(applied?.sinkingIngredientMoved).toBe('honey');
      }
      board = {
        cups: applied?.state.cups.map((c) => [...c]) ?? [],
        floatingIngredients: [...(applied?.state.floatingIngredients ?? [])],
        sinkingIngredients: [...(applied?.state.sinkingIngredients ?? [])],
      };
    }
    expect(stays).toBeGreaterThanOrEqual(1);
    expect(moves).toBeGreaterThanOrEqual(1);
    expect(hostStays).toBeGreaterThanOrEqual(1);
  });
});

describe('legacy regressions WITHOUT honey (pinned depths)', () => {
  it('base small board stays minMoves 1', () => {
    const board: TeaId[][] = [[M, M, M], [M], []];
    const res = solvePuzzle(board);
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(1);
    expect(applySolution(board, res.solution ?? [])).not.toBe(null);
  });

  it('teapot board stays minMoves 3 and never pours into the teapot', () => {
    const cups: TeaId[][] = [[K, M, M, M], [M, K, K, K], [], []];
    const cons: CupConstraint[] = [SRC, N, N, N];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
    for (const step of res.solution ?? []) {
      expect(step.to).not.toBe(0);
    }
  });

  it('target board stays minMoves 3', () => {
    const cups: TeaId[][] = [[K, K, K, K], [M, M, M, M], [], []];
    const cons: CupConstraint[] = [
      { mode: 'normal', targetTeaId: M },
      { mode: 'normal', targetTeaId: K },
      N,
      N,
    ];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
  });

  it('sink board stays minMoves 3', () => {
    const cups: TeaId[][] = [[K, M, M, M], [M, K, K, K], [], []];
    const cons: CupConstraint[] = [N, N, N, SNK];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
  });

  it('tasting board stays minMoves 6', () => {
    const cups: TeaId[][] = [[L, M, L, L], [K, K, K, L], [K, M, M, M], [], []];
    const cons: CupConstraint[] = [N, N, N, N, TASTING];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(6);
  });

  it('lemon board stays minMoves 7', () => {
    const cups: TeaId[][] = [
      [M, SB, SB, K],
      [K, M, M, SB],
      [SB, K, K, M],
      [],
      [],
    ];
    const slots: FloatingIngredientSlot[] = [null, 'lemon', null, null, null];
    const cons: CupConstraint[] = [N, N, N, N, N];
    const res = solvePuzzle(cups, { cupConstraints: cons, floatingIngredients: slots });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(7);
  });

  it('strainer rescue: WITHOUT tool unsolvable, WITH tool minMoves 13', () => {
    const plain = solvePuzzle(RESCUE.map((c) => [...c]));
    expect(plain.solvable).toBe(false);
    expect(plain.truncated).not.toBe(true);
    const tooled = solvePuzzle(RESCUE.map((c) => [...c]), {
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    });
    expect(tooled.solvable).toBe(true);
    expect(tooled.truncated).not.toBe(true);
    expect(tooled.minMoves).toBe(13);
    expect(tooled.placementCount).toBe(1);
    expect(tooled.releaseCount).toBe(1);
    expect(tooled.strainedPourCount).toBe(1);
  });
});

describe('canonical key regressions', () => {
  it('G6 strainer attached key pinned exactly', () => {
    const cups: TeaId[][] = [[M, M], []];
    const st = {
      cups,
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      strainer: { present: true, attachedCupIndex: 0, heldTea: null },
    };
    expect(canonicalPuzzleKey(st, [N, N])).toBe('N:_:#_|matcha,matcha#STR');
  });

  it('G6 strainer stand key pinned exactly', () => {
    const cups: TeaId[][] = [[M, M], []];
    const st = {
      cups,
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      strainer: { present: true, attachedCupIndex: null, heldTea: null },
    };
    expect(canonicalPuzzleKey(st, [N, N])).toBe('N:_:|matcha,matcha||STR:STAND:EMPTY');
  });

  it('G5 lemon key pinned exactly', () => {
    const st = {
      cups: [[M, M, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(st, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });

  it('no-honey canonical identity vs pre-honey helper', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, SRC, N];
    const st = { cups, floatingIngredients: [null, null, null] as FloatingIngredientSlot[] };
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalPuzzleKeyNoHoney(st, cons));
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(st)).toBe(canonicalPuzzleKeyNoHoney(st));
    expect(canonicalPuzzleKey(st)).toBe(canonicalKey(cups));
  });
});
