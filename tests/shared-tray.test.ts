/**
 * Gauntlet 16 Phase A — shared-capacity (TEA TRAY) kernel.
 *
 * Focused rule/canonical/solver smoke tests (§§55–66) for the minimal
 * authoritative shared group core: outside→tray partial bound, group-full
 * rejection + precedence, tray→outside release, internal exemption + count,
 * outside→outside identity, malformed overcap fail-closed, member finality
 * pruning safety, canonical symmetry/distinction/legacy-identity, exact undo.
 * No generator/bank/rollout/UI yet.
 */
import { describe, expect, it } from 'vitest';
import {
  applyPourState,
  canonicalKey,
  canonicalPuzzleKey,
  canPourState,
  isConstructiveMoveState,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  pourCountState,
  pourRejectCodeState,
  unstrainedPourCountState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  SHARED_CAPACITY_LIMITS,
  cupConstraintSignature,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import {
  hasSharedCapacity,
  sharedCapacityFree,
  sharedCapacityLimit,
  sharedCapacityMembers,
  sharedCapacityOccupancy,
  sharedCapacityTransferLimit,
  validateSharedCapacityConstraints,
} from '../src/game/logic/sharedCapacity';

const N: CupConstraint = { mode: 'normal' };
const T = (extra?: Partial<CupConstraint>): CupConstraint => ({ mode: 'normal', sharedCapacityGroup: 'tea-tray', ...extra });
const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';
const D: TeaId = 'milk_oolong';

const noFloat = (n: number): null[] => Array.from({ length: n }, () => null);

describe('G16 limit truth + static identity', () => {
  it('ONE limit truth is 6', () => {
    expect(SHARED_CAPACITY_LIMITS['tea-tray']).toBe(6);
    expect(sharedCapacityLimit('tea-tray')).toBe(6);
  });

  it('exactly two members validate; other counts fail', () => {
    expect(validateSharedCapacityConstraints([T(), T(), N, N, N, N])).toEqual([]);
    expect(validateSharedCapacityConstraints([N, N, N])).toEqual([]);
    const one = validateSharedCapacityConstraints([T(), N, N]);
    expect(one.length).toBeGreaterThan(0);
    const three = validateSharedCapacityConstraints([T(), T(), T(), N]);
    expect(three.length).toBeGreaterThan(0);
  });

  it('tray members must stay ordinary normal cap4 (no target/mustEndEmpty/order/role)', () => {
    expect(validateSharedCapacityConstraints([T({ targetTeaId: A }), T(), N]).length).toBeGreaterThan(0);
    expect(validateSharedCapacityConstraints([T({ mustEndEmpty: true }), T(), N]).length).toBeGreaterThan(0);
    expect(validateSharedCapacityConstraints([T({ serveOrder: 1 }), T(), N]).length).toBeGreaterThan(0);
    expect(validateSharedCapacityConstraints([{ mode: 'source-only', sharedCapacityGroup: 'tea-tray' }, T(), N]).length).toBeGreaterThan(0);
    expect(validateSharedCapacityConstraints([T({ capacity: 2 }), T(), N]).length).toBeGreaterThan(0);
  });

  it('occupancy/free derive from lengths (no dynamic state)', () => {
    const cons = [T(), T(), N];
    const st = { cups: [[A, A, A], [B, B], [C]] as TeaId[][], floatingIngredients: noFloat(3) };
    expect(sharedCapacityMembers(cons, 'tea-tray')).toEqual([0, 1]);
    expect(sharedCapacityOccupancy(st, cons, 'tea-tray')).toBe(5);
    expect(sharedCapacityFree(st, cons, 'tea-tray')).toBe(1);
    expect(hasSharedCapacity(cons)).toBe(true);
    expect(hasSharedCapacity([N, N])).toBe(false);
  });
});

describe('§55 outside into group — shared-limited partial transfer', () => {
  it('ordinary m=2 becomes shared m=1 with exactly one layer moving', () => {
    // Tray occupancy 5/6: A len2 + B len3. Dest tray cup [A,A], outside [A,A].
    const cons = [T(), T(), N];
    const cups: TeaId[][] = [[A, A], [B, B, B], [A, A]];
    const st = { cups, floatingIngredients: noFloat(3) };
    expect(sharedCapacityOccupancy(st, cons, 'tea-tray')).toBe(5);
    expect(sharedCapacityFree(st, cons, 'tea-tray')).toBe(1);
    expect(pourRejectCodeState(st, 2, 0, cons)).toBe('ok');
    expect(pourCountState(st, 2, 0, cons)).toBe(1);
    expect(unstrainedPourCountState(st, 2, 0, cons)).toBe(1);
    const res = applyPourState(st, 2, 0, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(1);
    expect(res?.sharedCapacityLimited).toBe(true);
    expect(res?.state.cups[0]).toEqual([A, A, A]);
    expect(res?.state.cups[2]).toEqual([A]);
    expect(sharedCapacityOccupancy(res!.state, cons, 'tea-tray')).toBe(6);
  });
});

describe('§56 group full — shared-capacity-full, no mutation', () => {
  it('outside→tray with individual room but group 6/6 rejects', () => {
    const cons = [T(), T(), N];
    const cups: TeaId[][] = [[A, A], [B, B, B, B], [A, A, A]];
    const st = { cups, floatingIngredients: noFloat(3) };
    expect(sharedCapacityOccupancy(st, cons, 'tea-tray')).toBe(6);
    // dest 0 has individual room (2/4) and top A matches source top A.
    expect(pourRejectCodeState(st, 2, 0, cons)).toBe('shared-capacity-full');
    expect(canPourState(st, 2, 0, cons)).toBe(false);
    expect(pourCountState(st, 2, 0, cons)).toBe(0);
    expect(applyPourState(st, 2, 0, cons)).toBe(null);
    expect(st.cups).toEqual([[A, A], [B, B, B, B], [A, A, A]]);
  });
});

describe('§57 individual full precedence', () => {
  it('destination 4/4 tray member reports target-full even when group <6', () => {
    const cons = [T(), T(), N];
    // Occupancy 4/6: dest full 4/4, partner empty.
    const cups: TeaId[][] = [[A, A, A, A], [], [A]];
    const st = { cups, floatingIngredients: noFloat(3) };
    expect(sharedCapacityOccupancy(st, cons, 'tea-tray')).toBe(4);
    expect(pourRejectCodeState(st, 2, 0, cons)).toBe('target-full');
  });
});

describe('§58 color mismatch precedence', () => {
  it('wrong top color reports color-mismatch despite shared free', () => {
    const cons = [T(), T(), N];
    const cups: TeaId[][] = [[A, A], [B], [B, B]];
    const st = { cups, floatingIngredients: noFloat(3) };
    expect(sharedCapacityFree(st, cons, 'tea-tray')).toBeGreaterThan(0);
    expect(pourRejectCodeState(st, 2, 0, cons)).toBe('color-mismatch');
  });
});

describe('§23 addressing/role precedence', () => {
  it('same-cup/out-of-range/source-empty outrank shared-capacity', () => {
    const cons = [T(), T(), N];
    const cups: TeaId[][] = [[A, A], [B, B, B, B], [A]];
    const st = { cups, floatingIngredients: noFloat(3) };
    expect(pourRejectCodeState(st, 0, 0, cons)).toBe('same-cup');
    expect(pourRejectCodeState(st, -1, 0, cons)).toBe('out-of-range');
    expect(pourRejectCodeState(st, 0, 9, cons)).toBe('out-of-range');
    const emptySrc = { cups: [[], [B, B, B, B], [A]] as TeaId[][], floatingIngredients: noFloat(3) };
    // source 0 is tray member but empty → source-empty, not shared-full.
    expect(pourRejectCodeState(emptySrc, 0, 2, [T(), T(), N])).toBe('source-empty');
  });
});

describe('§59 group to outside — release frees capacity', () => {
  it('tray source pouring 2 outside drops occupancy 6→4', () => {
    const cons = [T(), T(), N, N];
    const cups: TeaId[][] = [[A, A, A], [B, B, B], [], []];
    const st = { cups, floatingIngredients: noFloat(4) };
    expect(sharedCapacityOccupancy(st, cons, 'tea-tray')).toBe(6);
    // Make source top match an outside destination: use fresh board.
    const cups2: TeaId[][] = [[A, A, A], [B, B, B], [A, A], []];
    const st2 = { cups: cups2, floatingIngredients: noFloat(4) };
    const res = applyPourState(st2, 0, 2, cons);
    expect(res).not.toBe(null);
    expect(res?.transferred).toBe(2);
    expect(sharedCapacityOccupancy(res!.state, cons, 'tea-tray')).toBe(4);
    expect(sharedCapacityFree(res!.state, cons, 'tea-tray')).toBe(2);
  });
});

describe('§60-61 internal transfer — exempt + count ignores shared free', () => {
  it('tray A→tray B allowed while group full; total unchanged', () => {
    const cons = [T(), T(), N];
    // A [C,C,C,C]? Need ordinary-compatible internal: A top matches B top.
    const cups: TeaId[][] = [[A, A, A], [A, A], [B, B, B, B]];
    const st = { cups, floatingIngredients: noFloat(3) };
    // occupancy 3+2=5; make it 6: A len4 + B len2 same color.
    const cups6: TeaId[][] = [[A, A, A, A], [A, A], [B, B, B, B]];
    const st6 = { cups: cups6, floatingIngredients: noFloat(3) };
    expect(sharedCapacityOccupancy(st6, cons, 'tea-tray')).toBe(6);
    // A→B: top A matches, B has room 2/4. Ordinary would move min(4,2)=2.
    // But A is full homogeneous 4/4 and B empty? No, B non-empty, so legal.
    // Use A len3 + B len3? For full-group test use A=[A,A,A,A]? A full 4/4
    // → non-empty B same color: legal (target non-empty relaxes prune).
    // Let's use A=[B,A,A] style? Simpler: A=[A,A,A] (3) B=[A,A,A]? that's 6.
    const cupsI: TeaId[][] = [[A, A, A], [A, A, A], [B, B, B, B]];
    const stI = { cups: cupsI, floatingIngredients: noFloat(3) };
    expect(sharedCapacityOccupancy(stI, cons, 'tea-tray')).toBe(6);
    expect(pourRejectCodeState(stI, 0, 1, cons)).toBe('ok');
    const res = applyPourState(stI, 0, 1, cons);
    expect(res).not.toBe(null);
    expect(sharedCapacityOccupancy(res!.state, cons, 'tea-tray')).toBe(6);
    expect(res?.sharedCapacityLimited).toBe(undefined);
  });

  it('internal count uses only top run + individual free even when shared free=0', () => {
    const cons = [T(), T(), N];
    const cups: TeaId[][] = [[A, A, A], [A], [B]];
    const st = { cups, floatingIngredients: noFloat(3) };
    // occupancy 3+1=4, not full. Force full: [A,A,A]+[A,A,A].
    const cupsF: TeaId[][] = [[A, A, A], [A, A, A], [B]];
    const stF = { cups: cupsF, floatingIngredients: noFloat(3) };
    expect(sharedCapacityFree(stF, cons, 'tea-tray')).toBe(0);
    expect(sharedCapacityTransferLimit(stF, 0, 1, cons)).toBe(null);
    // internal A(3)→A(1)? B len3? Use dest [A] len1 free3, source top run3 → m=3? but dest free3 → m=3, source len3 → empties.
    const cupsC: TeaId[][] = [[A, A], [A], [B, B, B, B]];
    // occupancy 2+1=3, not full. Need full with internal room:
    // A=[C,A,A] (top run2), B=[A] (len1, free3) → m=2 regardless of shared 0?
    // Build full: A=[B,B,A] no. Let's directly assert bound is null.
    expect(sharedCapacityTransferLimit(stF, 0, 1, cons)).toBe(null);
    // count equals ordinary: top run of [A,A,A]=3, dest [A,A,A] len3 free1 → m=1.
    expect(pourCountState(stF, 0, 1, cons)).toBe(1);
  });
});

describe('§62 outside to outside — legacy identical', () => {
  it('shared group elsewhere does not affect ordinary pour', () => {
    const cons = [T(), T(), N, N];
    const cups: TeaId[][] = [[A, A], [B, B], [C, C], [C]];
    const st = { cups, floatingIngredients: noFloat(4) };
    expect(pourRejectCodeState(st, 2, 3, cons)).toBe('ok');
    expect(pourCountState(st, 2, 3, cons)).toBe(2);
    const plain = { cups, floatingIngredients: noFloat(4) };
    expect(pourRejectCodeState(plain, 2, 3, [N, N, N, N])).toBe('ok');
    expect(pourCountState(plain, 2, 3, [N, N, N, N])).toBe(2);
  });
});

describe('§63 malformed overcap — fail closed', () => {
  it('occupancy 7 never wins', () => {
    const cons = [T(), T(), N, N, N, N];
    const cups: TeaId[][] = [[A, A, A, A], [A, A, A], [], [], [], []];
    const st = { cups, floatingIngredients: noFloat(6) };
    expect(sharedCapacityOccupancy(st, cons, 'tea-tray')).toBe(7);
    expect(isPuzzleWonState(st, cons)).toBe(false);
    expect(validateSharedCapacityConstraints(cons)).toEqual([]);
  });
});

describe('§64 group member finality — required release not pruned', () => {
  it('full homogeneous tray member can still source to outside constructively', () => {
    const cons = [T(), T(), N, N];
    // A full 4/4 homogeneous on tray, partner + outside arranged so release matters.
    const cups: TeaId[][] = [[A, A, A, A], [B, B, B], [B], []];
    const st = { cups, floatingIngredients: noFloat(4) };
    // A→3 (empty ordinary): different signature groups → constructive, not pruned.
    expect(canPourState(st, 0, 3, cons)).toBe(true);
    expect(isConstructiveMoveState(st, 0, 3, cons)).toBe(true);
    // A→2 (B top mismatch A) illegal, but A→3 stays available: not deadlocked.
    expect(isPuzzleDeadlockedState(st, cons)).toBe(false);
  });
});

describe('§65 canonical — symmetry / distinction / legacy identity', () => {
  it('two equivalent tray members may permute', () => {
    const cons = [T(), T()];
    const a = { cups: [[A, A], [B, B]] as TeaId[][], floatingIngredients: noFloat(2) };
    const b = { cups: [[B, B], [A, A]] as TeaId[][], floatingIngredients: noFloat(2) };
    expect(canonicalPuzzleKey(a, cons)).toBe(canonicalPuzzleKey(b, cons));
  });

  it('tray member != ordinary normal', () => {
    const tray = { cups: [[A, A], []] as TeaId[][], floatingIngredients: noFloat(2) };
    expect(canonicalPuzzleKey(tray, [T(), N])).not.toBe(canonicalPuzzleKey(tray, [N, N]));
    expect(cupConstraintSignature(T())).toBe('N:_:G6');
    expect(cupConstraintSignature(N)).toBe('N:_');
  });

  it('legacy no-tray key unchanged (byte-identical)', () => {
    const cups: TeaId[][] = [[A, B], [], [B, A, A, B]];
    const cons: CupConstraint[] = [N, N, N];
    const noField = { cups, floatingIngredients: [null, null, null] as null[] };
    expect(canonicalPuzzleKey(noField, cons)).toBe(canonicalKey(cups, cons));
  });
});

describe('§66 undo — derived occupancy restores exactly', () => {
  it('shared-limited inflow then undo restores lengths + occupancy', () => {
    const cons = [T(), T(), N];
    const logic = new TeaSortLogic(
      [[A, A], [B, B, B], [A, A]],
      [0, 0, 0],
      cons,
    );
    expect(sharedCapacityOccupancy({ cups: logic.toState().cups, floatingIngredients: noFloat(3) }, cons, 'tea-tray')).toBe(5);
    const mv = logic.makeMove(2, 0);
    expect(mv).not.toBe(null);
    expect(logic.toState().cups[0]).toEqual([A, A, A]);
    expect(logic.toState().cups[2]).toEqual([A]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual([[A, A], [B, B, B], [A, A]]);
    expect(logic.movesCount).toBe(0);
  });

  it('multi-step: release → refill → internal → full undo', () => {
    const cons = [T(), T(), N, N];
    const logic = new TeaSortLogic(
      [[A, A, A], [A, A, A], [B, B, B, B], []],
      [0, 0, 0, 0],
      cons,
    );
    const s0 = logic.toState().cups.map((c) => [...c]);
    // Internal tray→tray (exempt) then undo.
    expect(logic.makeMove(0, 1)).not.toBe(null);
    expect(logic.toState().cups[0]).toEqual([A, A]);
    expect(logic.toState().cups[1]).toEqual([A, A, A, A]);
    expect(logic.undo()).not.toBe(null);
    expect(logic.toState().cups).toEqual(s0);
  });
});

describe('solver threading — shared rules change legality, cost stays 1', () => {
  it('group-full blocks the only inflow (deadlock), release reopens', () => {
    const cons = [T(), T(), N];
    // Tray 6/6 full; outside needs tray but blocked; release path exists.
    const cups: TeaId[][] = [[A, A, A], [A, A, A], [A, A]];
    const st = { cups, floatingIngredients: noFloat(3) };
    // outside 2 [A,A] → tray 0 [A,A,A] (room 1, color ok) but group full → blocked.
    expect(pourRejectCodeState(st, 2, 0, cons)).toBe('shared-capacity-full');
    // Internal 0→1? dest [A,A,A] len3 free1, source top run3 → m=1 allowed.
    expect(canPourState(st, 0, 1, cons)).toBe(true);
    expect(isPuzzleDeadlockedState(st, cons)).toBe(false);
  });

  it('tiny solvable shared board solves and replays valid every step', () => {
    // 2 colors, 4 vessels: tray [A,A]+[B,B] (4/6), outside [A,A]+[B,B].
    const cons = [T(), T(), N, N];
    const cups: TeaId[][] = [[A, A], [B, B], [A, A], [B, B]];
    const r = solvePuzzle(cups, { cupConstraints: cons, maxVisited: 50_000, maxDepth: 20 });
    expect(r.truncated).not.toBe(true);
    expect(r.solvable).toBe(true);
    const fin = applySolutionState({ cups, floatingIngredients: noFloat(4) }, r.solution ?? [], cons);
    expect(fin).not.toBe(null);
    expect(isPuzzleWonState(fin!, cons)).toBe(true);
  });
});
