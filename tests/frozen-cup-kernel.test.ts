/**
 * Gauntlet 9 Phase A — frozen-cup («Замёрзшая чашка») kernel.
 *
 * Focused rule/canonical/solver smoke tests (§§47–56) for the minimal
 * authoritative Ice core: source-frozen block, hot-only inflow, atomic
 * melt + metadata, ordinary-pour identity, full/empty frozen edges,
 * canonical distinctness/permutation/legacy-identity, solver fixture with
 * melt → source-use → win, exact undo. No generator/bank/rollout/UI yet.
 */
import { describe, expect, it } from 'vitest';
import {
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  canPourState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { normalizeIceSlots, type CupConstraint, type IceSlot, type TeaId } from '../src/game/types';

const N: CupConstraint = { mode: 'normal' };
const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const SB: TeaId = 'sea_buckthorn';

const noFloat = (n: number): null[] => Array.from({ length: n }, () => null);

describe('§47 source block', () => {
  it('pour OUT of a frozen cup is source-frozen with zero mutation', () => {
    const st = {
      cups: [[M, K, SB], [M]] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: ['ice', null] as IceSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('source-frozen');
    expect(canPourState(st, 0, 1, [N, N])).toBe(false);
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
    expect(st.cups).toEqual([[M, K, SB], [M]]);
    expect(st.iceSlots).toEqual(['ice', null]);
  });

  it('frozen sink-only malformed source still reports source-sink-only (§30)', () => {
    const st = {
      cups: [[M], []] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: ['ice', null] as IceSlot[],
    };
    const cons: CupConstraint[] = [{ mode: 'sink-only' }, N];
    expect(pourRejectCodeState(st, 0, 1, cons)).toBe('source-sink-only');
  });
});

describe('§48 non-hot inflow', () => {
  it('non-sea_buckthorn into frozen is target-frozen-needs-hot, even into empty', () => {
    const st = {
      cups: [[M, M], [M, K, SB]] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: [null, 'ice'] as IceSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('target-frozen-needs-hot');
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
    expect(st.iceSlots[1]).toBe('ice');
    const stEmpty = {
      cups: [[M, M], []] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: [null, 'ice'] as IceSlot[],
    };
    expect(pourRejectCodeState(stEmpty, 0, 1, [N, N])).toBe('target-frozen-needs-hot');
    expect(applyPourState(stEmpty, 0, 1, [N, N])).toBe(null);
  });
});

describe('§49 melt', () => {
  it('hot inflow melts atomically: tea conserved, ice cleared, metadata set, moves +1', () => {
    const logic = new TeaSortLogic(
      [[M, K, SB], [SB, SB]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      ['ice', null],
    );
    const mv = logic.makeMove(1, 0);
    expect(mv).not.toBe(null);
    expect(mv?.iceMelted).toBe('ice');
    expect(logic.toState().cups).toEqual([[M, K, SB, SB], [SB]]);
    expect(logic.toState().iceSlots).toEqual([null, null]);
    expect(logic.movesCount).toBe(1);
  });
});

describe('§50 ordinary pour identity', () => {
  it('pours not involving ice behave and report exactly as G8', () => {
    const st = { cups: [[M, M], [M]] as TeaId[][], floatingIngredients: noFloat(2) };
    const res = applyPourState(st, 0, 1, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.iceMelted).toBe(undefined);
    expect(res?.transferred).toBe(2);
    expect(res?.state.cups).toEqual([[], [M, M, M]]);
  });
});

describe('§51 full frozen', () => {
  it('hot tea into a 4/4 frozen cup is target-full; ice remains', () => {
    const st = {
      cups: [[SB], [M, K, SB, M]] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: [null, 'ice'] as IceSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('target-full');
    expect(applyPourState(st, 0, 1, [N, N])).toBe(null);
    expect(st.iceSlots[1]).toBe('ice');
  });
});

describe('§52 empty frozen', () => {
  it('full homogeneous hot source into empty frozen stays legal and melts', () => {
    const st = {
      cups: [[SB, SB, SB, SB], []] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: [null, 'ice'] as IceSlot[],
    };
    expect(pourRejectCodeState(st, 0, 1, [N, N])).toBe('ok');
    const res = applyPourState(st, 0, 1, [N, N]);
    expect(res).not.toBe(null);
    expect(res?.iceMelted).toBe('ice');
    expect(res?.state.cups).toEqual([[], [SB, SB, SB, SB]]);
    expect(res?.state.iceSlots[1]).toBe(null);
  });
});

describe('§53 canonical frozen distinctness + permutation', () => {
  it('same board with/without ice keys differently; vessel swap keys identically', () => {
    const cons = [N, N];
    const kf = canonicalPuzzleKey(
      { cups: [[M, K, SB], []] as TeaId[][], floatingIngredients: noFloat(2), iceSlots: ['ice', null] as IceSlot[] },
      cons,
    );
    const kp = canonicalPuzzleKey(
      { cups: [[M, K, SB], []] as TeaId[][], floatingIngredients: noFloat(2) },
      cons,
    );
    expect(kf).not.toBe(kp);
    const a = canonicalPuzzleKey(
      { cups: [[M, K, SB], [M]] as TeaId[][], floatingIngredients: noFloat(2), iceSlots: ['ice', null] as IceSlot[] },
      cons,
    );
    const b = canonicalPuzzleKey(
      { cups: [[M], [M, K, SB]] as TeaId[][], floatingIngredients: noFloat(2), iceSlots: [null, 'ice'] as IceSlot[] },
      cons,
    );
    expect(a).toBe(b);
  });
});

describe('§54 legacy key byte identity', () => {
  it('ice-free boards keep exact historical encodings', () => {
    const cups: TeaId[][] = [[M, K], [], [K, M, M, K]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    const noField = { cups, floatingIngredients: [null, null, null] as (null)[] };
    const explicitNull = {
      cups,
      floatingIngredients: [null, null, null] as (null)[],
      iceSlots: [null, null, null] as IceSlot[],
    };
    expect(canonicalPuzzleKey(noField, cons)).toBe(canonicalKey(cups, cons));
    expect(canonicalPuzzleKey(explicitNull, cons)).toBe(canonicalKey(cups, cons));
    const lemon = {
      cups: [[M, M, M, M], []] as TeaId[][],
      floatingIngredients: ['lemon', null] as ('lemon' | null)[],
    };
    expect(canonicalPuzzleKey(lemon, [N, N])).toBe('N:_:#_|matcha,matcha,matcha,matcha#lemon');
  });
});

describe('§55 solver fixture: melt, then source from the unlocked cup, win', () => {
  const cups: TeaId[][] = [[M, M, SB], [SB, SB, SB], [M, M], []];
  const ice: IceSlot[] = ['ice', null, null, null];
  const cons: CupConstraint[] = [N, N, N, N];

  it('optimal minMoves is exactly 3 with a winning replay', () => {
    const solved = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: cons,
      iceSlots: [...ice],
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(3);
    const fin = applySolutionState(
      { cups, floatingIngredients: cups.map(() => null), iceSlots: [...ice] },
      solved.solution ?? [],
      cons,
    );
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin as { cups: TeaId[][]; floatingIngredients: (null)[] }, cons)).toBe(true);
    expect((fin as { iceSlots: IceSlot[] }).iceSlots.every((s) => s === null)).toBe(true);
  });

  it('replay melts first, then sources from the formerly frozen cup', () => {
    const solved = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: cons,
      iceSlots: [...ice],
    });
    let bc = cups.map((c) => [...c]);
    let bi = [...ice];
    let meltAt: number | null = null;
    let useAt: number | null = null;
    const sol = (solved.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
    for (let i = 0; i < sol.length; i++) {
      const a = sol[i] as { kind: string; from: number; to: number };
      if (a.kind !== 'pour') continue;
      const r = applyPourState({ cups: bc, floatingIngredients: bc.map(() => null), iceSlots: [...bi] }, a.from, a.to, cons);
      expect(r).not.toBe(null);
      if (!r) break;
      if (r.iceMelted === 'ice' && meltAt === null) meltAt = i;
      if (meltAt !== null && a.from === 0 && useAt === null && i > meltAt) useAt = i;
      bc = r.state.cups;
      bi = [...r.state.iceSlots];
    }
    expect(meltAt).toBe(0);
    expect(useAt).not.toBe(null);
  });
});

describe('§56 undo restores ice exactly', () => {
  it('melt then undo returns pre-pour tea, active ice, and move count', () => {
    const logic = new TeaSortLogic(
      [[M, K, SB], [SB, SB]],
      [0, 0],
      [N, N],
      undefined,
      undefined,
      undefined,
      ['ice', null],
    );
    expect(logic.makeMove(1, 0)).not.toBe(null);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[M, K, SB], [SB, SB]]);
    expect(logic.toState().iceSlots).toEqual(['ice', null]);
    expect(logic.movesCount).toBe(0);
  });
});

describe('win requires cleared ice (§38–39) + deadlock sanity (§40)', () => {
  it('tea-sorted board with active ice is not won', () => {
    const st = {
      cups: [[M, M, M, M], [K, K, K, K]] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: ['ice', null] as IceSlot[],
    };
    expect(isPuzzleWonState(st, [N, N])).toBe(false);
  });

  it('frozen with no hot inflow and no other moves is deadlocked; melt available is not', () => {
    const locked = {
      cups: [[M, K, SB], [M, M]] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: ['ice', null] as IceSlot[],
    };
    const open = {
      cups: [[M, K, SB], [SB, SB]] as TeaId[][],
      floatingIngredients: noFloat(2),
      iceSlots: ['ice', null] as IceSlot[],
    };
    expect(isPuzzleDeadlockedState(locked, [N, N])).toBe(true);
    expect(isPuzzleDeadlockedState(open, [N, N])).toBe(false);
  });

  it('legacy normalization synthesizes all-null ice', () => {
    expect(normalizeIceSlots(undefined, 3)).toEqual([null, null, null]);
  });
});
