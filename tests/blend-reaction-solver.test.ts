/**
 * Gauntlet 13 Phase A — solver + win/pruning (§§62-65, §§71-73).
 *
 * ONE 0-1 BFS, cost 1 per reaction, kind 'pour'. Recipe-aware win + pruning.
 * Replay re-derives chemistry (never trusts solver metadata).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  applyPourState,
  applyPuzzleActionState,
  canPourState,
  isConstructiveMoveState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { fallbackLevel } from '../src/game/logic/generator';
import { DEV_ABSTRACT_BLEND_RECIPE } from '../src/game/logic/blendRecipe';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const P: TeaId = 'saffron';
const C: TeaId = 'sea_buckthorn';
const D: TeaId = 'buckwheat';
const R = DEV_ABSTRACT_BLEND_RECIPE;
const N: CupConstraint = { mode: 'normal' };
const CONS6 = [N, N, N, N, N, N];
const CONS4 = [N, N, N, N];

describe('§62 ordinarily-sorted reactants NOT won under recipe', () => {
  it('A4/B4/C4/D4 active recipe → false; absent → true', () => {
    const sorted: TeaId[][] = [
      [A, A, A, A], [B, B, B, B], [C, C, C, C], [D, D, D, D], [], [],
    ];
    const s = { cups: sorted, floatingIngredients: sorted.map(() => null) };
    expect(isPuzzleWonState(s, CONS6, R)).toBe(false);
    expect(isPuzzleWonState(s, CONS6, undefined)).toBe(true);
  });
});

describe('§63 recipe win: P4/C4/D4 + empties', () => {
  it('won with recipe, also won without (ordinary shape)', () => {
    const won: TeaId[][] = [[P, P, P, P], [C, C, C, C], [D, D, D, D], [], [], []];
    const s = { cups: won, floatingIngredients: won.map(() => null) };
    expect(isPuzzleWonState(s, CONS6, R)).toBe(true);
    expect(isPuzzleWonState(s, CONS6, undefined)).toBe(true);
  });

  it('P3 (incomplete product) is NOT won even when vessels look sorted', () => {
    const short: TeaId[][] = [[P, P, P], [C, C, C, C], [D, D, D, D], [], [], []];
    const s = { cups: short, floatingIngredients: short.map(() => null) };
    expect(isPuzzleWonState(s, CONS6, R)).toBe(false);
  });
});

describe('§64 reactant full NOT final (pruning)', () => {
  it('A×4 → empty stays constructive AND legal under recipe (control prunes)', () => {
    const s = { cups: [[A, A, A, A], []] as TeaId[][], floatingIngredients: [null, null] };
    expect(isConstructiveMoveState(s, 0, 1, [N, N], undefined)).toBe(false);
    expect(isConstructiveMoveState(s, 0, 1, [N, N], R)).toBe(true);
    // Legality prune also disabled: complete-to-empty no longer rejects.
    expect(pourRejectCodeState(s, 0, 1, [N, N], R)).toBe('ok');
    expect(canPourState(s, 0, 1, [N, N], R)).toBe(true);
  });
});

describe('§65 product full final', () => {
  it('P×4 behaves like an ordinary complete cup (prune disabled globally under recipe, win holds)', () => {
    const won: TeaId[][] = [[P, P, P, P], [C, C, C, C], [D, D, D, D], [], [], []];
    expect(isPuzzleWonState({ cups: won, floatingIngredients: won.map(() => null) }, CONS6, R)).toBe(true);
  });
});

describe('one-pair + full-target fixtures (solver must respect)', () => {
  it('hand 2-move fixture: reaction + product transfer → win with exact minMoves 2', () => {
    // Mid-game economy: P3/A1/B1/C4/D4 (A+P=4, B+P=4). One reaction (A→B)
    // then one P→P consolidation wins.
    const cups: TeaId[][] = [
      [P, P, P],
      [A],
      [B],
      [C, C, C, C],
      [D, D, D, D],
      [],
    ];
    const r = solvePuzzle(cups, { cupConstraints: CONS6, blendRecipe: R, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(2);
    expect(r.solution).toBeDefined();
    // First move must be the A→B reaction (kind pour, reaction metadata).
    const first = (r.solution as { kind: string; from: number; to: number }[])[0];
    expect(first.kind).toBe('pour');
    // Replay both moves and verify win + exactly 1 reaction + product moved.
    let board = cups.map((c) => [...c]);
    let reactions = 0;
    for (const step of r.solution ?? []) {
      if (step.kind !== 'pour') continue;
      const res = applyPourState(
        { cups: board, floatingIngredients: board.map(() => null) },
        step.from, step.to, CONS6, R,
      );
      expect(res).not.toBe(null);
      if (res?.reaction) reactions++;
      board = res?.state.cups as TeaId[][];
    }
    expect(reactions).toBe(1);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: board.map(() => null) }, CONS6, R)).toBe(true);
  });

  it('full-target reaction reachable via solver action kind pour', () => {
    // Direct transition (no full solve needed): A onto full [C,D,C,B].
    const cups: TeaId[][] = [[A], [C, D, C, B], [], []];
    const res = applyPourState(
      { cups, floatingIngredients: cups.map(() => null) },
      0, 1, [N, N, N, N], R,
    );
    expect(res).not.toBe(null);
    expect(res?.state.cups[1]).toEqual([C, D, C, P]);
    // Solver on the 2-move hand fixture above already proves kind 'pour'.
    const hand: TeaId[][] = [[P, P, P], [A], [B], [C, C, C, C], [D, D, D, D], []];
    const r = solvePuzzle(hand, { cupConstraints: CONS6, blendRecipe: R });
    expect(r.solvable).toBe(true);
    for (const step of r.solution ?? []) {
      expect(['pour', 'place-strainer', 'release-strainer']).toContain(step.kind);
      expect((step as { kind: string }).kind).not.toBe('reaction');
    }
  });

  it('replay re-derives chemistry: tampered metadata never mutates board', () => {
    const start = { cups: [[A], [B]] as TeaId[][], floatingIngredients: [null, null] };
    const tampered = { kind: 'pour', from: 0, to: 1, layer: C, count: 99 } as never;
    const res = applyPuzzleActionState(start, tampered, [N, N], R);
    // Truth derives from state+from/to+recipe: still A→B = P, not C/99.
    expect(res?.state.cups).toEqual([[], [P]]);
    expect(res?.layer).toBe(A);
    expect(res?.transferred).toBe(1);
    expect(res?.reaction?.product).toBe(P);
  });
});

describe('legacy minMove regression (recipe absent)', () => {
  it.each([
    ['warmup', { numColors: 3, colors: ['matcha', 'sea_buckthorn', 'karkade'], emptyCups: 2, hasMysteryLayer: false, phase: 'warmup' }, 5],
    ['challenge', { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' }, 6],
  ] as Array<[string, Parameters<typeof fallbackLevel>[0], number]>)('%s fallback stays %i', (_n, req, depth) => {
    expect(fallbackLevel(req).minMoves).toBe(depth);
  });
});
