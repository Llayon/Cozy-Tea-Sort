/**
 * Gauntlet 14 Phase A — solver fixtures + control + legacy regressions.
 *
 * Hand fixture with ORDER_PRESSURE → SERVE_1 → SERVE_2 → WIN (exact
 * minMoves); early-order/control/source-lock fixtures; fallback
 * determinism (serving absent); G13/G13.1 blend regression pins.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import {
  applyPourState,
  isConstructiveMoveState,
  isPuzzleWonState,
  listConstructiveActionsState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import { fallbackLevel, type GenerateRequest } from '../src/game/logic/generator';
import { servedPrefixLength } from '../src/game/logic/servingOrder';
import {
  DEV_ABSTRACT_BLEND_RECIPE,
  MILK_TEA_BLEND_RECIPE,
} from '../src/game/logic/blendRecipe';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };
const O1: CupConstraint = { mode: 'normal', serveOrder: 1 };
const O2: CupConstraint = { mode: 'normal', serveOrder: 2 };
const CONS4 = [O1, N, O2, N];

// Hand fixture (§135): ① [A,A,A] + [A] · ② [B,B,B] + [B].
// At start, [B]→② would complete ② early (blocked = pressure);
// optimal plays SERVE_1 then SERVE_2, minMoves exactly 2.
const HAND: TeaId[][] = [[A, A, A], [A], [B, B, B], [B]];

function st4(cups: TeaId[][]) {
  return { cups, floatingIngredients: [null, null, null, null] };
}

describe('hand fixture: pressure → SERVE_1 → SERVE_2 → win, minMoves 2', () => {
  it('initial state carries ORDER_PRESSURE (② completion blocked)', () => {
    expect(servedPrefixLength(st4(HAND), CONS4)).toBe(0);
    expect(pourRejectCodeState(st4(HAND), 3, 2, CONS4)).toBe('serve-order');
  });

  it('ordered solve: minMoves 2, prefixes 0→1→2, win', () => {
    const r = solvePuzzle(HAND, { cupConstraints: CONS4, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.truncated ?? false).toBe(false);
    expect(r.minMoves).toBe(2);
    expect(r.solution).toBeDefined();
    let board = HAND.map((c) => [...c]);
    const prefixes = [0];
    for (const step of r.solution ?? []) {
      if (step.kind !== 'pour') continue;
      const res = applyPourState(
        { cups: board, floatingIngredients: emptyFloatingIngredients(4) },
        step.from, step.to, CONS4,
      );
      expect(res).not.toBe(null);
      board = res?.state.cups as TeaId[][];
      prefixes.push(servedPrefixLength({ cups: board, floatingIngredients: emptyFloatingIngredients(4) }, CONS4));
    }
    expect(prefixes).toEqual([0, 1, 2]);
    expect(isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(4) }, CONS4)).toBe(true);
  });
});

describe('direct early-order fixture (§136)', () => {
  it('ordered: serve-order; plain constraints: legal completion', () => {
    const cups: TeaId[][] = [[C, A], [B, B, B], [C, B]];
    const s = { cups, floatingIngredients: [null, null, null] };
    expect(pourRejectCodeState(s, 2, 1, [O1, O2, N])).toBe('serve-order');
    const res = applyPourState(s, 2, 1, [N, N, N]);
    expect(res?.state.cups[1]).toEqual([B, B, B, B]);
  });
});

describe('source-lock fixture (§137)', () => {
  it('served ① exposes no source actions; solver wins without touching it', () => {
    const s = { cups: [[A, A, A, A], [B], [B, B, B]] as TeaId[][], floatingIngredients: [null, null, null] };
    const cons = [O1, O2, N];
    expect(servedPrefixLength(s, cons)).toBe(1);
    const fromServed = listConstructiveActionsState(s, cons).filter((a) => a.kind === 'pour' && a.from === 0);
    expect(fromServed).toEqual([]);
    const r = solvePuzzle(s.cups, { cupConstraints: cons, returnSolution: true });
    expect(r.solvable).toBe(true);
    expect(r.minMoves).toBe(1);
    for (const step of r.solution ?? []) {
      if (step.kind === 'pour') expect(step.from).not.toBe(0);
    }
  });
});

describe('control fixture (§138)', () => {
  it('same board, no orders: plain solve + completion order recorded', () => {
    const plain = solvePuzzle(HAND, { cupConstraints: [N, N, N, N], returnSolution: true });
    const ordered = solvePuzzle(HAND, { cupConstraints: CONS4, returnSolution: true });
    expect(plain.solvable).toBe(true);
    expect(ordered.solvable).toBe(true);
    const plainMoves = plain.minMoves as number;
    const orderedMoves = ordered.minMoves as number;
    // Replay plain optimal; first full-homogeneous times of the physical
    // hosts 0 and 2 (null = never completes there in this optimal path —
    // plain consolidation may land in the other cups; also diagnostic).
    let board = HAND.map((c) => [...c]);
    let first0: number | null = null;
    let first2: number | null = null;
    (plain.solution ?? []).forEach((step, i) => {
      if (step.kind !== 'pour') return;
      const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(4) }, step.from, step.to, [N, N, N, N]);
      if (!res) return;
      board = res.state.cups as TeaId[][];
      const full = (cup: TeaId[]) => cup.length === 4 && cup.every((t) => t === cup[0]);
      if (first0 === null && full(board[0] as TeaId[])) first0 = i;
      if (first2 === null && full(board[2] as TeaId[])) first2 = i;
    });
    const reverses = first2 !== null && (first0 === null || first2 < first0);
    console.log(`control: plain=${plainMoves} ordered=${orderedMoves} host0@${first0} host2@${first2} reverses=${reverses}`);
    expect(plainMoves).toBeGreaterThan(0);
  });
});

describe('legacy fallback determinism (serving absent)', () => {
  it.each([
    ['warmup-3c', { numColors: 3, colors: ['matcha', 'sea_buckthorn', 'karkade'], emptyCups: 2, hasMysteryLayer: false, phase: 'warmup' }],
    ['challenge-4c', { numColors: 4, colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'], emptyCups: 2, hasMysteryLayer: false, phase: 'challenge' }],
  ] as Array<[string, GenerateRequest]>)('%s fallback depth stable', (_name, req) => {
    const a = fallbackLevel(req).minMoves;
    const b = fallbackLevel(req).minMoves;
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});

describe('G13/G13.1 freeze regression (§140)', () => {
  it('blend kernel untouched: abstract A/B still react with one-pair semantics', () => {
    const R = DEV_ABSTRACT_BLEND_RECIPE;
    const s = {
      cups: [['sea_buckthorn', 'matcha'], ['buckwheat', 'karkade']] as TeaId[][],
      floatingIngredients: [null, null],
    };
    const res = applyPourState(s, 0, 1, [N, N], R);
    expect(res?.state.cups[1]).toEqual(['buckwheat', 'saffron']);
    expect(res?.reaction?.product).toBe('saffron');
    expect(res?.transferred).toBe(1);
  });

  it('blend production recipe still resolves; G13.1 pruning intact', () => {
    expect(MILK_TEA_BLEND_RECIPE.targetProductCount).toBe(4);
    // G13.1: full homogeneous reactant relocates legally but non-constructively.
    const s = {
      cups: [['matcha', 'matcha', 'matcha', 'matcha'], []] as TeaId[][],
      floatingIngredients: [null, null],
    };
    expect(pourRejectCodeState(s, 0, 1, [N, N], DEV_ABSTRACT_BLEND_RECIPE)).toBe('ok');
    expect(isConstructiveMoveState(s, 0, 1, [N, N], DEV_ABSTRACT_BLEND_RECIPE)).toBe(false);
  });
});
