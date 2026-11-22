/**
 * G30 shared research lib (DEV ONLY, never production).
 *
 * Deterministic board family, target assignment, CONTROL/FULL solving,
 * and TAX/INTEGRATION classifiers.
 */
import {
  STANDARD_CUP_CAPACITY,
  type CupConstraint,
  type PuzzleState,
  type TeaId,
} from '../../src/game/types.ts';
import {
  applyPuzzleActionState,
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle, type SolverResult } from '../../src/game/logic/solver.ts';
import {
  isValidBrewMilestoneContract,
  type BrewMilestoneContract,
} from '../../src/game/logic/brewMilestone.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';

export const G30_PALETTE: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
] as const;

export const G30_MILESTONE_INDEX = 4;
export const G30_ORDINARY_EMPTY_INDEX = 5;

export function g30Constraints(): CupConstraint[] {
  const plain: CupConstraint = { mode: 'normal' };
  return [
    { ...plain },
    { ...plain },
    { ...plain },
    { ...plain },
    { mode: 'normal', capacity: STANDARD_CUP_CAPACITY, mustEndEmpty: true },
    { ...plain },
  ];
}

export function g30Deal(seed: string): TeaId[][] {
  const rng = createRng(seed);
  const pool: TeaId[] = [];
  for (const tea of G30_PALETTE) {
    for (let i = 0; i < 4; i++) pool.push(tea);
  }
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [[], [], [], [], [], []];
  for (let c = 0; c < 4; c++) {
    cups[c] = pool.slice(c * 4, c * 4 + 4);
  }
  cups[4] = [];
  cups[5] = [];
  return cups;
}

export function g30TargetA(index: number): TeaId {
  return G30_PALETTE[index % G30_PALETTE.length] as TeaId;
}

const G30_PAIRS: Array<readonly [TeaId, TeaId]> = (() => {
  const out: Array<readonly [TeaId, TeaId]> = [];
  for (let i = 0; i < G30_PALETTE.length; i++) {
    for (let j = i + 1; j < G30_PALETTE.length; j++) {
      out.push([G30_PALETTE[i] as TeaId, G30_PALETTE[j] as TeaId]);
    }
  }
  return out;
})();

export function g30PairB(index: number): readonly [TeaId, TeaId] {
  return G30_PAIRS[index % G30_PAIRS.length] as readonly [TeaId, TeaId];
}

const G30_ORDERED: Array<readonly [TeaId, TeaId]> = (() => {
  const out: Array<readonly [TeaId, TeaId]> = [];
  for (const a of G30_PALETTE) {
    for (const b of G30_PALETTE) {
      if (a === b) continue;
      out.push([a as TeaId, b as TeaId]);
    }
  }
  return out;
})();

export function g30OrderedC(index: number): readonly [TeaId, TeaId] {
  return G30_ORDERED[index % G30_ORDERED.length] as readonly [TeaId, TeaId];
}

export function g30ContractA(index: number): BrewMilestoneContract {
  return { kind: 'brew-once', vesselIndex: G30_MILESTONE_INDEX, brewTeaId: g30TargetA(index) };
}

export function g30ContractB(index: number): BrewMilestoneContract {
  const [a, b] = g30PairB(index);
  return { kind: 'choice-brew', vesselIndex: G30_MILESTONE_INDEX, allowedTeas: [a, b] };
}

export function g30ContractC(index: number): BrewMilestoneContract {
  const [a, b] = g30OrderedC(index);
  return { kind: 'brew-sequence', vesselIndex: G30_MILESTONE_INDEX, firstTea: a, secondTea: b };
}

export interface G30Solve {
  control: SolverResult;
  full: SolverResult;
  controlMs: number;
  fullMs: number;
}

export function g30SolveBoard(
  cups: TeaId[][],
  contract: BrewMilestoneContract,
  maxVisited = 200_000,
  maxDepth = 60,
): G30Solve {
  const constraints = g30Constraints();
  const t0 = performance.now();
  const control = solvePuzzle(cups, { cupConstraints: constraints, maxVisited, maxDepth });
  const controlMs = performance.now() - t0;
  const t1 = performance.now();
  const full = solvePuzzle(cups, {
    cupConstraints: constraints,
    maxVisited,
    maxDepth,
    brewContract: contract,
  });
  const fullMs = performance.now() - t1;
  return { control, full, controlMs, fullMs };
}

export interface G30Trace {
  actions: Array<{ from: number; to: number }>;
  stages: number[];
  states: TeaId[][][];
  firstMilestoneIdx: number | null;
  secondMilestoneIdx: number | null;
  milestoneRatio: number | null;
  secondRatio: number | null;
  postWork: number;
  interStageWork: number;
  specialTouches: number;
  specialShare: number;
  roundtrip: boolean;
  incidental: boolean;
  taxOnly: boolean;
  integrated: boolean;
  replan: boolean;
  sequenceRitual: boolean;
  delta: number | null;
}

function isTouch(from: number, to: number, m: number): boolean {
  return from === m || to === m;
}

export function g30AnalyzeTrace(
  cups: TeaId[][],
  contract: BrewMilestoneContract,
  full: SolverResult,
  control: SolverResult,
): G30Trace | null {
  const empty: G30Trace = {
    actions: [],
    stages: [],
    states: [],
    firstMilestoneIdx: null,
    secondMilestoneIdx: null,
    milestoneRatio: null,
    secondRatio: null,
    postWork: 0,
    interStageWork: 0,
    specialTouches: 0,
    specialShare: 0,
    roundtrip: false,
    incidental: false,
    taxOnly: false,
    integrated: false,
    replan: false,
    sequenceRitual: false,
    delta: null,
  };
  if (!full.solvable || !full.solution || full.minMoves === undefined) return null;
  if (!control.solvable || !control.solution || control.minMoves === undefined) {
    return { ...empty, delta: null };
  }
  const constraints = g30Constraints();
  const m = G30_MILESTONE_INDEX;
  // Replay FULL with stage tracking.
  let state: PuzzleState = {
    cups: cups.map((c) => [...c]),
    floatingIngredients: cups.map(() => null),
    sinkingIngredients: cups.map(() => null),
    strainer: { present: false, attachedCupIndex: null, heldTea: null },
    iceSlots: cups.map(() => null),
    capacityObstacles: cups.map(() => null),
    teaBudSlots: cups.map(() => null),
    brewMilestone: { stage: 0 },
  };
  const actions: Array<{ from: number; to: number }> = [];
  const stages: number[] = [0];
  const states: TeaId[][][] = [state.cups.map((c) => [...c])];
  for (const s of full.solution) {
    if (s.kind !== 'pour') continue;
    actions.push({ from: (s as { from: number }).from, to: (s as { to: number }).to });
    const res = applyPuzzleActionState(state, s, constraints, undefined, contract);
    if (!res) return { ...empty, actions, stages, states };
    state = res.state;
    stages.push(state.brewMilestone?.stage ?? 0);
    states.push(state.cups.map((c) => [...c]));
  }
  const n = actions.length;
  let first: number | null = null;
  let second: number | null = null;
  for (let i = 0; i < stages.length; i++) {
    if (first === null && (stages[i] as number) >= 1) first = i;
    if (second === null && (stages[i] as number) >= 2) second = i;
  }
  // firstMilestoneIdx = move index (0-based) that caused stage change; stages[0]=initial.
  const firstMoveIdx = first !== null && first > 0 ? first - 1 : null;
  const secondMoveIdx = second !== null && second > 0 ? second - 1 : null;
  const milestoneRatio = firstMoveIdx !== null && n > 0 ? (firstMoveIdx + 1) / n : null;
  const secondRatio = secondMoveIdx !== null && n > 0 ? (secondMoveIdx + 1) / n : null;
  const doneIdx = contract.kind === 'brew-sequence' ? secondMoveIdx : firstMoveIdx;
  let postWork = 0;
  if (doneIdx !== null) {
    for (let i = doneIdx + 1; i < n; i++) {
      const a = actions[i] as { from: number; to: number };
      if (!isTouch(a.from, a.to, m)) postWork++;
    }
  }
  let interStageWork = 0;
  if (contract.kind === 'brew-sequence' && firstMoveIdx !== null && secondMoveIdx !== null) {
    for (let i = firstMoveIdx + 1; i <= secondMoveIdx; i++) {
      const a = actions[i] as { from: number; to: number };
      // moves strictly between stage1 completion and stage2 trigger:
      // stage indices: first+1 .. second inclusive? secondMove triggers stage2.
      // Count non-touching moves with index > firstMove and < =secondMove?
      // We count moves after first trigger up to and including second trigger
      // that don't touch m, excluding the second trigger itself if it touches.
      if (i === secondMoveIdx) continue;
      if (!isTouch(a.from, a.to, m)) interStageWork++;
    }
    // Sequence ritual: back-to-back with no unrelated work.
    const totalBetween = secondMoveIdx - firstMoveIdx - 1;
    // If all between-moves touch m (drain A) then ritual.
    let nonTouchBetween = 0;
    for (let i = firstMoveIdx + 1; i < secondMoveIdx; i++) {
      const a = actions[i] as { from: number; to: number };
      if (!isTouch(a.from, a.to, m)) nonTouchBetween++;
    }
    void totalBetween;
    if (nonTouchBetween <= 1) {
      // Mark ritual candidate; final classification uses threshold + REPLAN.
      // Store temporarily in sequenceRitual.
    }
  }
  let specialTouches = 0;
  for (const a of actions) {
    if (isTouch(a.from, a.to, m)) specialTouches++;
  }
  const specialShare = n > 0 ? specialTouches / n : 0;
  // Roundtrip heuristic: trigger source held full homogeneous run before trigger.
  let roundtrip = false;
  if (firstMoveIdx !== null) {
    const trig = actions[firstMoveIdx] as { from: number; to: number };
    if (trig && trig.to === m) {
      const before = states[firstMoveIdx] as TeaId[][];
      const src = before[trig.from] as TeaId[];
      if (src.length === 4 && src.every((l) => l === src[0])) {
        // Source was full homogeneous; check drain restores same tea in ordinary.
        const trigTea = src[0] as TeaId;
        // Find drain moves from m after trigger.
        const afterStates = states.slice(firstMoveIdx + 1);
        // If m later empties and trigTea ends full homogeneous in some ordinary vessel
        // with no split (single destination gets all 4), flag roundtrip.
        const finalCups = states[states.length - 1] as TeaId[][];
        const ordinaryFull = finalCups.some(
          (c, idx) => idx !== m && c.length === 4 && c.every((l) => l === trigTea),
        );
        // And no non-touch work between trigger and first drain-out?
        // Conservative: if postWork small and ordinaryFull, likely ritual.
        if (ordinaryFull && postWork <= 2) roundtrip = true;
        void afterStates;
      }
    }
  }
  // Incidental (B + also A): CONTROL optimal replay triggers milestone.
  let incidental = false;
  if (control.solution) {
    let cstate: PuzzleState = {
      cups: cups.map((c) => [...c]),
      floatingIngredients: cups.map(() => null),
      sinkingIngredients: cups.map(() => null),
      strainer: { present: false, attachedCupIndex: null, heldTea: null },
      iceSlots: cups.map(() => null),
      capacityObstacles: cups.map(() => null),
      teaBudSlots: cups.map(() => null),
      brewMilestone: { stage: 0 },
    };
    for (const s of control.solution) {
      if (s.kind !== 'pour') continue;
      const res = applyPuzzleActionState(cstate, s, constraints, undefined, contract);
      if (!res) break;
      cstate = res.state;
      const st = cstate.brewMilestone?.stage ?? 0;
      const need = contract.kind === 'brew-sequence' ? 2 : 1;
      if (st >= need) {
        incidental = true;
        break;
      }
    }
  }
  // TAX_ONLY conservative: F_filt == C_filt (m-touch removed) AND excursion contiguous.
  const filtF = actions.filter((a) => !isTouch(a.from, a.to, m));
  const controlActions = (control.solution ?? [])
    .filter((s) => s.kind === 'pour')
    .map((s) => ({ from: (s as { from: number }).from, to: (s as { to: number }).to }));
  const filtC = controlActions.filter((a) => !isTouch(a.from, a.to, m));
  const filtEqual =
    filtF.length === filtC.length &&
    filtF.every((a, i) => a.from === (filtC[i] as { from: number }).from && a.to === (filtC[i] as { to: number }).to);
  // Contiguity of m-touches in FULL.
  let contiguous = true;
  if (specialTouches > 0) {
    const idxs: number[] = [];
    actions.forEach((a, i) => {
      if (isTouch(a.from, a.to, m)) idxs.push(i);
    });
    const firstT = idxs[0] as number;
    const lastT = idxs[idxs.length - 1] as number;
    // Nearly contiguous: allow at most 1 non-touch gap inside excursion.
    let gaps = 0;
    for (let i = firstT; i <= lastT; i++) {
      const a = actions[i] as { from: number; to: number };
      if (!isTouch(a.from, a.to, m)) gaps++;
    }
    contiguous = gaps <= 1;
  }
  const taxOnly = filtEqual && contiguous && firstMoveIdx !== null;
  // INTEGRATED (§61 all four).
  const beforeCleanup =
    doneIdx !== null && doneIdx <= n - 2; // at least one drain + win after (m must end empty)
  const diverged = !filtEqual;
  const reintegrated = !roundtrip && doneIdx !== null; // trigger tea leaves m (must, since m ends empty) and not pure roundtrip
  const integrated =
    beforeCleanup && postWork >= 2 && reintegrated && diverged && firstMoveIdx !== null;
  const replan = !filtEqual && firstMoveIdx !== null;
  let sequenceRitual = false;
  if (contract.kind === 'brew-sequence' && firstMoveIdx !== null && secondMoveIdx !== null) {
    let nonTouchBetween = 0;
    for (let i = firstMoveIdx + 1; i < secondMoveIdx; i++) {
      const a = actions[i] as { from: number; to: number };
      if (!isTouch(a.from, a.to, m)) nonTouchBetween++;
    }
    sequenceRitual = nonTouchBetween <= 1;
  }
  const delta =
    full.minMoves !== undefined && control.minMoves !== undefined
      ? full.minMoves - control.minMoves
      : null;
  return {
    actions,
    stages,
    states,
    firstMilestoneIdx: firstMoveIdx,
    secondMilestoneIdx: secondMoveIdx,
    milestoneRatio,
    secondRatio,
    postWork,
    interStageWork,
    specialTouches,
    specialShare,
    roundtrip,
    incidental,
    taxOnly,
    integrated,
    replan,
    sequenceRitual,
    delta,
  };
}

export function g30IsValidResearchBoard(
  cups: TeaId[][],
  contract: BrewMilestoneContract,
): boolean {
  const constraints = g30Constraints();
  if (!isValidBrewMilestoneContract(contract, constraints)) return false;
  // Root shape 4,4,4,4,0,0 and tea counts 4x each.
  if (cups.length !== 6) return false;
  for (let i = 0; i < 4; i++) {
    if ((cups[i] as TeaId[]).length !== 4) return false;
  }
  if ((cups[4] as TeaId[]).length !== 0) return false;
  if ((cups[5] as TeaId[]).length !== 0) return false;
  const counts = new Map<TeaId, number>();
  for (const cup of cups) {
    for (const t of cup) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  for (const t of G30_PALETTE) {
    if ((counts.get(t) ?? 0) !== 4) return false;
  }
  // No other mechanics: research boards use plain constraints only.
  void constraints;
  return true;
}
