/**
 * Gauntlet 8 — lemon + honey solver interaction.
 *
 * Small hand fixture (2 colors buckwheat/sea_buckthorn, 4 vessels,
 * mixed hosts) mined with the current solver: depth 7, pour-only,
 * cohost + split + later honey move, both goals + win.
 * Plus legacy regressions (pinned depths), G5/G6/G7 canonical pins,
 * and a combined lemon+honey key pin + invariance.
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
  floatingIngredientHostSatisfied,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../src/game/logic/rules';
import { applySolution, applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { analyzeIngredientInteraction } from '../src/game/logic/generator';

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

// Small hand fixture: 2 colors (buckwheat + sea_buckthorn), 4 vessels,
// distinct mixed-full hosts (lemon on 1, honey on 0). Mined seed 5.
const INTER_CUPS: TeaId[][] = [
  [SB, BW, SB, BW],
  [BW, BW, SB, SB],
  [],
  [],
];
const INTER_FLOAT: FloatingIngredientSlot[] = [null, 'lemon', null, null];
const INTER_SINK: SinkingIngredientSlot[] = ['honey', null, null, null];
const INTER_CONS: CupConstraint[] = [N, N, N, N];

// Strainer control rescue fixture (from tests/strainer-solver.test.ts).
const RESCUE: TeaId[][] = [
  [K, MO, MO, K],
  [K, M, SB, MO],
  [],
  [MO, SB, SB, K],
  [M, M, SB, M],
];

// Honey control fixture (from tests/honey-solver.test.ts).
const HONEY_CUPS: TeaId[][] = [
  [BW, M, M, M],
  [BW, BW, BW, M],
  [],
  [],
];
const HONEY_SLOTS: SinkingIngredientSlot[] = ['honey', null, null, null];
const HONEY_CONS: CupConstraint[] = [N, N, N, N];

describe('interaction hand fixture: cohost + split + later honey move', () => {
  it('solves in pinned 7 pour-only moves, not truncated', () => {
    const res = solvePuzzle(INTER_CUPS.map((c) => [...c]), {
      cupConstraints: INTER_CONS,
      floatingIngredients: [...INTER_FLOAT],
      sinkingIngredients: [...INTER_SINK],
    });
    expect(res.solvable).toBe(true);
    expect(res.truncated).not.toBe(true);
    expect(res.minMoves).toBe(7);
    expect(res.solution?.length).toBe(7);
    for (const step of res.solution ?? []) {
      expect(step.kind).toBe('pour');
    }
  });

  it('solution replays via applySolutionState to cohost + split + honey move + both goals + win', () => {
    const res = solvePuzzle(INTER_CUPS.map((c) => [...c]), {
      cupConstraints: INTER_CONS,
      floatingIngredients: [...INTER_FLOAT],
      sinkingIngredients: [...INTER_SINK],
    });
    expect(res.solvable).toBe(true);
    const start = {
      cups: INTER_CUPS.map((c) => [...c]),
      floatingIngredients: [...INTER_FLOAT] as FloatingIngredientSlot[],
      sinkingIngredients: [...INTER_SINK] as SinkingIngredientSlot[],
    };
    const final = applySolutionState(start, res.solution ?? [], INTER_CONS);
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final!, INTER_CONS)).toBe(true);
    // Both goals: lemon on full sea_buckthorn, honey under full buckwheat.
    const lemonHost = final!.floatingIngredients.findIndex((s) => s === 'lemon');
    const honeyHost = sinkingIngredientIndex(final!, 'honey');
    expect(lemonHost).toBeGreaterThanOrEqual(0);
    expect(honeyHost).toBeGreaterThanOrEqual(0);
    expect(final?.cups[lemonHost]).toEqual([SB, SB, SB, SB]);
    expect(final?.cups[honeyHost]).toEqual([BW, BW, BW, BW]);
    expect(floatingIngredientHostSatisfied('lemon', final?.cups[lemonHost] as TeaId[], INTER_CONS[lemonHost])).toBe(
      true,
    );
    expect(sinkingIngredientHostSatisfied('honey', final?.cups[honeyHost] as TeaId[], INTER_CONS[honeyHost])).toBe(
      true,
    );
    // Interaction trace: at least one cohost state, one split, later honey move.
    const trace = analyzeIngredientInteraction(
      INTER_CUPS.map((c) => [...c]),
      [...INTER_FLOAT],
      [...INTER_SINK],
      res.solution ?? [],
      INTER_CONS,
    );
    expect(trace.cohostStates).toBeGreaterThanOrEqual(1);
    expect(trace.splitEvents).toBeGreaterThanOrEqual(1);
    expect(trace.honeyMoves).toBeGreaterThanOrEqual(1);
    expect(trace.finalLemonOk).toBe(true);
    expect(trace.finalHoneyOk).toBe(true);
    expect(trace.win).toBe(true);
    // Manual replay proves both layers move (lemon + honey relocations seen).
    let board = {
      cups: INTER_CUPS.map((c) => [...c]),
      floatingIngredients: [...INTER_FLOAT] as FloatingIngredientSlot[],
      sinkingIngredients: [...INTER_SINK] as SinkingIngredientSlot[],
    };
    let lemonMoves = 0;
    let honeyMoves = 0;
    for (const step of res.solution ?? []) {
      if (step.kind !== 'pour') continue;
      const applied = applyPourState(board, step.from, step.to, INTER_CONS);
      expect(applied).not.toBe(null);
      if (applied?.floatingIngredientMoved === 'lemon') lemonMoves++;
      if (applied?.sinkingIngredientMoved === 'honey') honeyMoves++;
      board = {
        cups: applied?.state.cups.map((c) => [...c]) ?? [],
        floatingIngredients: [...(applied?.state.floatingIngredients ?? [])],
        sinkingIngredients: [...(applied?.state.sinkingIngredients ?? [])],
      };
    }
    expect(lemonMoves).toBeGreaterThanOrEqual(1);
    expect(honeyMoves).toBeGreaterThanOrEqual(1);
  });
});

describe('legacy regressions WITHOUT interaction (pinned depths)', () => {
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

  it('honey board stays minMoves 3', () => {
    const res = solvePuzzle(HONEY_CUPS.map((c) => [...c]), {
      cupConstraints: HONEY_CONS,
      sinkingIngredients: [...HONEY_SLOTS],
    });
    expect(res.solvable).toBe(true);
    expect(res.truncated).not.toBe(true);
    expect(res.minMoves).toBe(3);
    for (const step of res.solution ?? []) {
      expect(step.kind).toBe('pour');
    }
  });
});

describe('canonical key regressions', () => {
  it('G5 lemon key pinned exactly', () => {
    const st = {
      cups: [[M, M, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(st, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });

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

  it('G7 honey key pinned exactly', () => {
    const st = {
      cups: [[BW, BW, BW, BW], []] as TeaId[][],
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(st, [N, N])).toBe(
      'N:_:#sink:_|buckwheat,buckwheat,buckwheat,buckwheat#sink:honey',
    );
  });

  it('no-honey identity vs pre-honey helper', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, SRC, N];
    const st = { cups, floatingIngredients: [null, null, null] as FloatingIngredientSlot[] };
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalPuzzleKeyNoHoney(st, cons));
    expect(canonicalPuzzleKey(st, cons)).toBe(canonicalKey(cups, cons));
  });
});

describe('combined lemon+honey key', () => {
  it('pins one exact cohost key literal', () => {
    const st = {
      cups: [[M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(st, [N, N])).toBe(
      'N:_:#_#sink:_|matcha,matcha#lemon#sink:honey',
    );
  });

  it('permutation-invariant: swapped cohost gives same key; different honey host differs', () => {
    const a = {
      cups: [[M, M], [K, K]] as TeaId[][],
      floatingIngredients: ['lemon', null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const b = {
      cups: [[K, K], [M, M]] as TeaId[][],
      floatingIngredients: [null, 'lemon'] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(a, [N, N])).toBe(canonicalPuzzleKey(b, [N, N]));
    const c = {
      cups: [[M, M], [K, K]] as TeaId[][],
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      sinkingIngredients: ['honey', null] as SinkingIngredientSlot[],
    };
    const d = {
      cups: [[M, M], [K, K]] as TeaId[][],
      floatingIngredients: [null, null] as FloatingIngredientSlot[],
      sinkingIngredients: [null, 'honey'] as SinkingIngredientSlot[],
    };
    expect(canonicalPuzzleKey(c, [N, N])).not.toBe(canonicalPuzzleKey(d, [N, N]));
  });
});
