/**
 * G15 Order+Tasting kernel (§31): serving invariants preserved with a tasting
 * bowl on a SEPARATE vessel. One pour truth, one solver, no combo state.
 * Tasting bowl: normal flow, cap2, mustEndEmpty, starts empty at index 5.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  applyPourState,
  canPourState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import { servedPrefixLength } from '../src/game/logic/servingOrder';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';

const N: CupConstraint = { mode: 'normal' };
const O1: CupConstraint = { mode: 'normal', serveOrder: 1 };
const O2: CupConstraint = { mode: 'normal', serveOrder: 2 };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

function st(cups: TeaId[][]) {
  return { cups, floatingIngredients: cups.map(() => null) };
}
// 6 vessels: 0:O1 1:O2 2,3 ordinary 4 ordinary empty 5 tasting empty.
function cons(): CupConstraint[] { return [O1, O2, N, N, N, T]; }

describe('future ② usable with tasting present (§§18-19)', () => {
  it('② mixed may source normally', () => {
    const cups: TeaId[][] = [[A, A, B], [B, A], [A], [], [], []];
    const c = cons();
    // ② index 1 top A, destination 2 top A → legal ordinary pour.
    expect(canPourState(st(cups), 1, 2, c)).toBe(true);
  });
  it('② may receive partial tea without completing', () => {
    const cups: TeaId[][] = [[A, B], [B, B], [B], [], [], []];
    const c = cons();
    // 2(B) → 1(B,B) gives [B,B,B], incomplete → legal.
    expect(pourRejectCodeState(st(cups), 2, 1, c)).toBe('ok');
    const res = applyPourState(st(cups), 2, 1, c);
    expect(res).not.toBeNull();
    expect(res!.state.cups[1]).toEqual([B, B, B]);
    expect(res!.serveCompleted ?? null).toBeNull();
  });
  it('tasting bowl pours like a normal cup (cap2)', () => {
    const cups: TeaId[][] = [[A, A], [B, B], [A], [B], [], []];
    const c = cons();
    expect(canPourState(st(cups), 0, 5, c)).toBe(true);
    const res = applyPourState(st(cups), 0, 5, c);
    expect(res).not.toBeNull();
    expect((res!.state.cups[5] as TeaId[]).length).toBeLessThanOrEqual(2);
  });
});

describe('early ② completion still rejected with tasting (§§20-22)', () => {
  it('single-layer early completion rejects serve-order, no mutation', () => {
    const cups: TeaId[][] = [[A, B], [B, B, B], [B], [], [], []];
    const c = cons();
    const before = cups.map((x) => [...x]);
    expect(pourRejectCodeState(st(cups), 2, 1, c)).toBe('serve-order');
    expect(applyPourState(st(cups), 2, 1, c)).toBeNull();
    expect(cups).toEqual(before);
  });
  it('m=2 early completion rejects WHOLE action (no m=1 fallback)', () => {
    const cups: TeaId[][] = [[A, A], [B, B], [B, B], [], [], []];
    const c = cons();
    // source 2 top run B,B (m=2) into ② [B,B] would complete → whole reject.
    expect(pourRejectCodeState(st(cups), 2, 1, c)).toBe('serve-order');
    expect(applyPourState(st(cups), 2, 1, c)).toBeNull();
  });
});

describe('SERVE_1 / lock / SERVE_2 / lock with tasting (§§23-26)', () => {
  it('SERVE_1 completes ①, prefix 0→1, metadata 1', () => {
    const cups: TeaId[][] = [[A, A, A], [B, B], [A], [], [], []];
    const c = cons();
    expect(servedPrefixLength(st(cups), c)).toBe(0);
    const res = applyPourState(st(cups), 2, 0, c);
    expect(res).not.toBeNull();
    expect(res!.state.cups[0]).toEqual([A, A, A, A]);
    expect(res!.serveCompleted).toBe(1);
    expect(servedPrefixLength(res!.state, c)).toBe(1);
  });
  it('served ① cannot source (source-served)', () => {
    const cups: TeaId[][] = [[A, A, A, A], [B, B], [C], [], [], []];
    const c = cons();
    expect(servedPrefixLength(st(cups), c)).toBe(1);
    expect(pourRejectCodeState(st(cups), 0, 2, c)).toBe('source-served');
    expect(applyPourState(st(cups), 0, 2, c)).toBeNull();
  });
  it('SERVE_2 after ①, prefix 1→2, then locked', () => {
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B], [B], [], [], []];
    const c = cons();
    expect(servedPrefixLength(st(cups), c)).toBe(1);
    const res = applyPourState(st(cups), 2, 1, c);
    expect(res).not.toBeNull();
    expect(res!.state.cups[1]).toEqual([B, B, B, B]);
    expect(res!.serveCompleted).toBe(2);
    expect(servedPrefixLength(res!.state, c)).toBe(2);
    expect(pourRejectCodeState(res!.state, 1, 2, c)).toBe('source-served');
  });
});

describe('malformed / win with tasting (§§28-29)', () => {
  it('malformed ②-full with ①-incomplete stays repairable (not served)', () => {
    const cups: TeaId[][] = [[A, B], [B, B, B, B], [C], [], [], []];
    const c = cons();
    expect(servedPrefixLength(st(cups), c)).toBe(0);
    expect(pourRejectCodeState(st(cups), 1, 3, c)).not.toBe('source-served');
    // ② (O2 full homogeneous) → ordinary empty: different signature groups,
    // so not a pruned complete-to-empty loop → repairable.
    expect(canPourState(st(cups), 1, 3, c)).toBe(true);
  });
  it('win requires ordinary win AND prefix 2 (tasting must end empty)', () => {
    const c = cons();
    // ①+② full homogeneous but tasting non-empty → not won.
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [], [A]];
    expect(isPuzzleWonState(st(cups), c)).toBe(false);
    const won: TeaId[][] = [[A, A, A, A], [B, B, B, B], [C, C, C, C], [C, C, C, C], [], []];
    expect(isPuzzleWonState(st(won), c)).toBe(true);
  });
  it('double-rule rejection deterministic: served source outranks color detail', () => {
    const cups: TeaId[][] = [[A, A, A, A], [B], [C], [], [], []];
    const c = cons();
    // ① served sourcing into mismatched color → source-served (exactly one reason, no mutation).
    const before = cups.map((x) => [...x]);
    expect(pourRejectCodeState(st(cups), 0, 2, c)).toBe('source-served');
    expect(cups).toEqual(before);
  });
});
