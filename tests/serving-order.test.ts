/**
 * Gauntlet 14 Phase A — serving-order dependency kernel (§§57-71).
 *
 * Static `serveOrder` constraints (1, ②) on otherwise-normal cups;
 * derived served prefix; source-served locks; atomic early-completion
 * rejection; prefix-gated win. No dynamic serving state anywhere.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  applyPourState,
  canPourState,
  canonicalKey,
  canonicalPuzzleKey,
  isConstructiveMoveState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import {
  hasServeOrder,
  isServedCupState,
  isServeCupComplete,
  isValidServeCupConstraint,
  orderedServeIndices,
  serveOrderOf,
  servedPrefixLength,
  validateServeOrderConstraints,
} from '../src/game/logic/servingOrder';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';
const D: TeaId = 'lavender';

const N: CupConstraint = { mode: 'normal' };
const O1: CupConstraint = { mode: 'normal', serveOrder: 1 };
const O2: CupConstraint = { mode: 'normal', serveOrder: 2 };

function st(cups: TeaId[][]) {
  return { cups, floatingIngredients: cups.map(() => null) };
}

describe('helpers: orders, validation, prefix (§§6, 10-15)', () => {
  it('serveOrderOf / orderedServeIndices / hasServeOrder', () => {
    expect(serveOrderOf(N)).toBe(undefined);
    expect(serveOrderOf(O1)).toBe(1);
    expect(orderedServeIndices([N, O2, N, O1])).toEqual([3, 1]);
    expect(hasServeOrder([N, N])).toBe(false);
    expect(hasServeOrder([N, O1])).toBe(true);
    expect(hasServeOrder(undefined)).toBe(false);
  });

  it('validateServeOrderConstraints: exactly one 1 + one 2, valid cups', () => {
    expect(validateServeOrderConstraints([N, O1, N, O2, N, N])).toEqual([]);
    expect(validateServeOrderConstraints([N, N]).length).toBe(0);
    expect(validateServeOrderConstraints([O1, O1]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([O1]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([O2]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([O1, { mode: 'normal', serveOrder: 3 }]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([{ mode: 'source-only', serveOrder: 1 }, O2]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([{ mode: 'normal', targetTeaId: A, serveOrder: 1 }, O2]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([{ mode: 'normal', capacity: 2, serveOrder: 1 }, O2]).length).toBeGreaterThan(0);
    expect(validateServeOrderConstraints([{ mode: 'normal', mustEndEmpty: true, serveOrder: 1 }, O2]).length).toBeGreaterThan(0);
  });

  it('isValidServeCupConstraint + isServeCupComplete (empty never complete)', () => {
    expect(isValidServeCupConstraint(N)).toBe(false);
    expect(isValidServeCupConstraint(O1)).toBe(true);
    expect(isServeCupComplete([A, A, A, A], O1)).toBe(true);
    expect(isServeCupComplete([A, A, A, B], O1)).toBe(false);
    expect(isServeCupComplete([A, A, A], O1)).toBe(false);
    expect(isServeCupComplete([], O1)).toBe(false);
    expect(isServeCupComplete([A, A, A, A], N)).toBe(false);
  });

  it('servedPrefixLength: 0/1/2 + malformed ②-full reports 0', () => {
    const cons = [O1, O2];
    expect(servedPrefixLength(st([[A, B], [C, D]]), cons)).toBe(0);
    expect(servedPrefixLength(st([[A, A, A, A], [C, D]]), cons)).toBe(1);
    expect(servedPrefixLength(st([[A, A, A, A], [B, B, B, B]]), cons)).toBe(2);
    expect(servedPrefixLength(st([[A, B], [B, B, B, B]]), cons)).toBe(0);
    expect(servedPrefixLength(st([[], []]), cons)).toBe(0);
  });

  it('isServedCupState: ordinary never served; malformed ② not served', () => {
    const cons = [O1, O2, N];
    expect(isServedCupState(st([[A, A, A, A], [B, B], [C]]), 2, cons)).toBe(false);
    expect(isServedCupState(st([[A, A, A, A], [B, B], [C]]), 0, cons)).toBe(true);
    expect(isServedCupState(st([[A, A, A, A], [B, B], [C]]), 1, cons)).toBe(false);
    expect(isServedCupState(st([[A, B], [B, B, B, B], [C]]), 1, cons)).toBe(false);
  });
});

describe('§57 future source: ② sources normally before ① served', () => {
  it('② [A,B] pours B out legally', () => {
    const s = st([[C, A], [A, B], []]);
    const cons = [O1, O2, N];
    expect(canPourState(s, 1, 2, cons)).toBe(true);
    const res = applyPourState(s, 1, 2, cons);
    expect(res?.state.cups[1]).toEqual([A]);
    expect(res?.state.cups[2]).toEqual([B]);
    expect(res?.serveCompleted ?? null).toBe(null);
  });
});

describe('§58 future receive: ② may fill partially', () => {
  it('② [B,B] + B → [B,B,B] legal', () => {
    const s = st([[C, B], [D, B, B]]);
    const cons = [N, O2];
    expect(canPourState(s, 0, 1, cons)).toBe(true);
    const res = applyPourState(s, 0, 1, cons);
    expect(res?.state.cups[1]).toEqual([D, B, B, B]);
    expect(res?.serveCompleted ?? null).toBe(null);
  });
});

describe('§§59-60 early completion rejected atomically (no partial fallback)', () => {
  it('② [B,B,B] + B → serve-order, no mutation', () => {
    const s = st([[C, A], [B, B, B], [C, B]]);
    const cons = [O1, O2, N];
    expect(pourRejectCodeState(s, 2, 1, cons)).toBe('serve-order');
    expect(canPourState(s, 2, 1, cons)).toBe(false);
    expect(applyPourState(s, 2, 1, cons)).toBe(null);
    expect(s.cups).toEqual([[C, A], [B, B, B], [C, B]]);
  });

  it('② [B,B] + run B,B (m=2) → whole action serve-order, no m=1 fallback', () => {
    const s = st([[C, A], [B, B], [C, B, B]]);
    const cons = [O1, O2, N];
    expect(pourRejectCodeState(s, 2, 1, cons)).toBe('serve-order');
    expect(applyPourState(s, 2, 1, cons)).toBe(null);
    expect(s.cups).toEqual([[C, A], [B, B], [C, B, B]]);
  });
});

describe('§§61-62 SERVE_1 then lock', () => {
  it('① [A,A,A] + A → [A×4], prefix 0→1, metadata 1', () => {
    const s = st([[A], [A, A, A], []]);
    const cons = [N, O1, N];
    expect(servedPrefixLength(s, cons)).toBe(0);
    const res = applyPourState(s, 0, 1, cons);
    expect(res?.state.cups[1]).toEqual([A, A, A, A]);
    expect(servedPrefixLength(res?.state as never, cons)).toBe(1);
    expect(res?.serveCompleted).toBe(1);
  });

  it('pour OUT of served ① → source-served', () => {
    const s = st([[A, A, A, A], []]);
    const cons = [O1, N];
    expect(pourRejectCodeState(s, 0, 1, cons)).toBe('source-served');
    expect(canPourState(s, 0, 1, cons)).toBe(false);
    expect(applyPourState(s, 0, 1, cons)).toBe(null);
  });
});

describe('§§63-65 ② after serve-1, then SERVE_2 + lock', () => {
  it('served ① + incomplete ② sources and receives', () => {
    const s = st([[A, A, A, A], [C, B], []]);
    const cons = [O1, O2, N];
    expect(servedPrefixLength(s, cons)).toBe(1);
    expect(canPourState(s, 1, 2, cons)).toBe(true);
    expect(canPourState(s, 2, 1, cons)).toBe(false);
  });

  it('② [B,B,B] + B after serve-1 → [B×4], prefix 1→2, metadata 2', () => {
    const s = st([[A, A, A, A], [B, B, B], [C, B]]);
    const cons = [O1, O2, N];
    expect(servedPrefixLength(s, cons)).toBe(1);
    const res = applyPourState(s, 2, 1, cons);
    expect(res?.state.cups[1]).toEqual([B, B, B, B]);
    expect(servedPrefixLength(res?.state as never, cons)).toBe(2);
    expect(res?.serveCompleted).toBe(2);
  });

  it('pour OUT of served ② → source-served', () => {
    const s = st([[A, A, A, A], [B, B, B, B], []]);
    const cons = [O1, O2, N];
    expect(servedPrefixLength(s, cons)).toBe(2);
    expect(pourRejectCodeState(s, 1, 2, cons)).toBe('source-served');
  });
});

describe('§§66-67 malformed full ② stays repairable; empty never served', () => {
  it('① mixed + ② [B×4] → prefix 0, ② sources legally', () => {
    const s = st([[A, B], [B, B, B, B], []]);
    const cons = [O1, O2, N];
    expect(servedPrefixLength(s, cons)).toBe(0);
    expect(isServedCupState(s, 1, cons)).toBe(false);
    expect(canPourState(s, 1, 2, cons)).toBe(true);
    expect(isConstructiveMoveState(s, 1, 2, cons)).toBe(true);
  });

  it('① [] is not served', () => {
    expect(isServeCupComplete([], O1)).toBe(false);
    expect(servedPrefixLength(st([[], [B, B, B, B]]), [O1, O2])).toBe(0);
  });
});

describe('§§68-69 win blocked without prefix2; won with prefix2', () => {
  it('① empty + ② full (+ satisfied rest) → NOT WON', () => {
    const cups: TeaId[][] = [[], [B, B, B, B], [A, A, A, A], []];
    const cons = [O1, O2, N, N];
    expect(isPuzzleWonState({ cups, floatingIngredients: [null, null, null, null] }, cons)).toBe(false);
  });

  it('① full + ② empty → NOT WON', () => {
    const cups: TeaId[][] = [[A, A, A, A], [], [], []];
    const cons = [O1, N, O2, N];
    // ② is the ORDERED cup itself, empty (incomplete) → prefix 1 ≠ 2.
    expect(isPuzzleWonState({ cups, floatingIngredients: [null, null, null, null] }, cons)).toBe(false);
  });

  it('① + ② full homogeneous + satisfied rest → WON', () => {
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], []];
    const cons = [O1, O2, N, N];
    expect(isPuzzleWonState({ cups, floatingIngredients: [null, null, null, null] }, cons)).toBe(true);
  });
});

describe('§70 ordinary level: same board without orders is legacy', () => {
  it('early-②-completion pour is legal with plain constraints', () => {
    const s = st([[C, A], [B, B, B], [C, B]]);
    expect(canPourState(s, 2, 1, [N, N, N])).toBe(true);
    const res = applyPourState(s, 2, 1, [N, N, N]);
    expect(res?.state.cups[1]).toEqual([B, B, B, B]);
    expect(res?.serveCompleted ?? null).toBe(null);
  });
});

describe('§71 canonical: legacy stable, O1/O2 distinct groups', () => {
  it('no orders → byte-identical legacy key', () => {
    const cups: TeaId[][] = [[A, B], [], [B, A, A, B]];
    const cons: CupConstraint[] = [N, { mode: 'normal' }, N];
    expect(canonicalPuzzleKey({ cups, floatingIngredients: [null, null, null] }, cons)).toBe(canonicalKey(cups, cons));
  });

  it('O1 ≠ ordinary, O2 ≠ ordinary, O1 ≠ O2', () => {
    const a = canonicalPuzzleKey({ cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null] }, [O1, N]);
    const b = canonicalPuzzleKey({ cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null] }, [N, N]);
    const c = canonicalPuzzleKey({ cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null] }, [O2, N]);
    expect(a).not.toBe(b);
    expect(c).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain(':O1');
    expect(c).toContain(':O2');
    expect(b).not.toContain(':O');
  });

  it('ordinary cups still permute within their group beside ordered cups', () => {
    const cons = [O1, N, N];
    const x = canonicalPuzzleKey({ cups: [[A], [B], [C]] as TeaId[][], floatingIngredients: [null, null, null] }, cons);
    const y = canonicalPuzzleKey({ cups: [[A], [C], [B]] as TeaId[][], floatingIngredients: [null, null, null] }, cons);
    expect(x).toBe(y);
  });
});
