/**
 * G28 shared research harness (DEV ONLY).
 * Deterministic deals, FULL/CONTROL solving, causal replay metrics.
 * No production imports beyond rules/solver/types/g28Research.
 */
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type PuzzleState,
  type SolverAction,
  type TeaId,
} from '../../src/game/types.ts';
import {
  applyPuzzleActionState,
  canonicalPuzzleKey,
  canPourState,
  topLayerOf,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  G28_PALETTE,
  type G28Candidate,
} from '../../src/game/logic/g28Research.ts';

export function g28SpecialConstraint(candidate: G28Candidate): CupConstraint {
  if (candidate === 'underpour') {
    return { mode: 'normal', capacity: STANDARD_CUP_CAPACITY, mustEndEmpty: true, underpour: true };
  }
  if (candidate === 'reverse-receive') {
    return { mode: 'normal', capacity: STANDARD_CUP_CAPACITY, mustEndEmpty: true, reverseOnReceive: true };
  }
  return { mode: 'normal', capacity: STANDARD_CUP_CAPACITY, mustEndEmpty: true, flipWhenFull: true };
}

/** Frozen FULL constraints: 4 ordinary + special(4) + ordinary empty(5). */
export function g28FullConstraints(candidate: G28Candidate): CupConstraint[] {
  const special = g28SpecialConstraint(candidate);
  return [
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    special,
    { mode: 'normal' },
  ];
}

export const G28_SPECIAL_INDEX = 4;

/** CONTROL strips ONLY the candidate marker; geometry/finality identical. */
export function g28ControlConstraints(full: readonly CupConstraint[]): CupConstraint[] {
  return full.map((c) => {
    const out: CupConstraint = { mode: c.mode };
    if (c.targetTeaId !== undefined) out.targetTeaId = c.targetTeaId;
    if (c.capacity !== undefined) out.capacity = c.capacity;
    if (c.mustEndEmpty !== undefined) out.mustEndEmpty = c.mustEndEmpty;
    if (c.serveOrder !== undefined) out.serveOrder = c.serveOrder;
    if (c.sharedCapacityGroup !== undefined) out.sharedCapacityGroup = c.sharedCapacityGroup;
    if (c.pairedTeaGroup !== undefined) out.pairedTeaGroup = c.pairedTeaGroup;
    if (c.steepingFlask !== undefined) out.steepingFlask = c.steepingFlask;
    return out;
  });
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic deal (no rejection sampling of solvability, §106-§107).
 * 16 units: 4 each of 4 palette teas; vessels 0-3 filled, 4 special empty,
 * 5 ordinary empty. Mixed-cup guard only (no pre-solved cup).
 */
export function dealG28Board(
  seedStr: string,
  candidate: G28Candidate,
): { cups: TeaId[][]; constraints: CupConstraint[] } {
  const rng = mulberry32(hashSeed(seedStr));
  const pool: TeaId[] = [];
  for (const t of G28_PALETTE) for (let i = 0; i < TEA_UNITS_PER_COLOR; i++) pool.push(t);
  const constraints = g28FullConstraints(candidate);
  for (let attempt = 0; attempt < 50; attempt++) {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j] as TeaId, arr[i] as TeaId];
    }
    const filled: TeaId[][] = [arr.slice(0, 4), arr.slice(4, 8), arr.slice(8, 12), arr.slice(12, 16)];
    if (filled.some((cup) => cup.every((l) => l === cup[0]))) continue;
    const [a, b, c2, d] = filled as [TeaId[], TeaId[], TeaId[], TeaId[]];
    return { cups: [a, b, c2, d, [], []], constraints };
  }
  throw new Error(`dealG28Board: could not deal mixed board for ${seedStr}`);
}

export interface G28BoardResult {
  seed: string;
  startKey: string;
  fullSolvable: boolean;
  controlSolvable: boolean;
  fullMoves?: number;
  controlMoves?: number;
  fullVisited: number;
  controlVisited: number;
  fullMs: number;
  controlMs: number;
  fullTruncated: boolean;
  controlTruncated: boolean;
  // Broad transform (FULL replay transform event with downstream use).
  broadCausal: boolean;
  // Strong product metrics.
  strongCausal: boolean;
  canonicalStrong: boolean;
  // Control divergence (same CONTROL sequence under FULL).
  controlDiverges: boolean;
  firstDivergenceStep: number | null;
  strongDivergence: boolean;
  ignored: boolean;
  specialMoves: number;
  specialTouchShare: number;
  transformShare: number;
  totalMoves: number;
  extraMoves: number | null;
  depthCollapse: boolean;
  // A extras.
  underpourEvents: number;
  preservedTopUses: number;
  // B extras.
  reverseEvents: number;
  exposeUses: number;
  reReceives: number;
  // C extras.
  flipEvents: number;
  causalFlips: number;
  secondFlip: boolean;
}

function boardFrom(cups: TeaId[][]): PuzzleState {
  return {
    cups: cups.map((c) => [...c]),
    floatingIngredients: cups.map(() => null),
    sinkingIngredients: cups.map(() => null),
    strainer: { present: false, attachedCupIndex: null, heldTea: null },
    iceSlots: cups.map(() => null),
    capacityObstacles: cups.map(() => null),
    teaBudSlots: cups.map(() => null),
  };
}

function applyAction(board: PuzzleState, action: SolverAction, constraints: readonly CupConstraint[]): PuzzleState | null {
  const res = applyPuzzleActionState(board, action as never, constraints);
  return res ? res.state : null;
}

function sameLayers(a: readonly TeaId[], b: readonly TeaId[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function analyzeG28Board(seed: string, candidate: G28Candidate): G28BoardResult {
  const { cups, constraints } = dealG28Board(seed, candidate);
  const control = g28ControlConstraints(constraints);
  const special = G28_SPECIAL_INDEX;
  const startKey = canonicalPuzzleKey(boardFrom(cups), constraints);

  const t0 = Date.now();
  const full = solvePuzzle(cups, { cupConstraints: constraints });
  const fullMs = Date.now() - t0;
  const t1 = Date.now();
  const ctrl = solvePuzzle(cups, { cupConstraints: control });
  const controlMs = Date.now() - t1;

  const base: G28BoardResult = {
    seed,
    startKey,
    fullSolvable: full.solvable,
    controlSolvable: ctrl.solvable,
    fullMoves: full.minMoves,
    controlMoves: ctrl.minMoves,
    fullVisited: full.visitedStates ?? 0,
    controlVisited: ctrl.visitedStates ?? 0,
    fullMs,
    controlMs,
    fullTruncated: full.truncated === true,
    controlTruncated: ctrl.truncated === true,
    broadCausal: false,
    strongCausal: false,
    canonicalStrong: false,
    controlDiverges: false,
    firstDivergenceStep: null,
    strongDivergence: false,
    ignored: true,
    specialMoves: 0,
    specialTouchShare: 0,
    transformShare: 0,
    totalMoves: full.solution?.length ?? 0,
    extraMoves: full.solvable && ctrl.solvable ? (full.minMoves as number) - (ctrl.minMoves as number) : null,
    depthCollapse: full.solvable && ctrl.solvable
      ? (full.minMoves as number) <= 0.7 * (ctrl.minMoves as number)
      : false,
    underpourEvents: 0,
    preservedTopUses: 0,
    reverseEvents: 0,
    exposeUses: 0,
    reReceives: 0,
    flipEvents: 0,
    causalFlips: 0,
    secondFlip: false,
  };
  if (!full.solvable || !full.solution) return base;

  // Replay FULL optimal, tracking transform events + downstream use.
  interface PendingEvent {
    index: number;
    fullTop: TeaId | null;
    controlTop: TeaId | null;
    used: boolean;
  }
  const pending: PendingEvent[] = [];
  let board = boardFrom(cups);
  let specialMoves = 0;
  let transformMoves = 0;
  let receives = 0;
  let underpourEvents = 0;
  let reverseEvents = 0;
  let flipEvents = 0;

  const markUsed = (tea: TeaId | null): void => {
    if (tea === null) return;
    for (const p of pending) {
      if (!p.used && p.fullTop === tea && p.fullTop !== p.controlTop) p.used = true;
    }
  };

  for (let step = 0; step < full.solution.length; step++) {
    const action = full.solution[step] as SolverAction;
    if (action.kind !== 'pour') {
      const next = applyAction(board, action, constraints);
      if (!next) break;
      board = next;
      continue;
    }
    const from = (action as { from: number }).from;
    const to = (action as { to: number }).to;
    const count = (action as { count: number }).count;
    const preCups = board.cups.map((c) => [...c]) as TeaId[][];
    const srcTop = topLayerOf(preCups[from] as TeaId[]);
    if (from === special || to === special) specialMoves++;

    if (to === special) {
      receives++;
      const existing = [...(preCups[special] as TeaId[])];
      const controlNext = [...existing, ...new Array<TeaId>(count).fill(srcTop as TeaId)];
      const next = applyAction(board, action, constraints);
      if (!next) break;
      // Event iff the authoritative transition disagrees with CONTROL
      // about the destination order (same count, same source removal).
      const fullNextActual = [...(next.cups[special] as TeaId[])];
      if (!sameLayers(fullNextActual, controlNext)) {
        transformMoves++;
        const fullTop = fullNextActual.length > 0 ? (fullNextActual[fullNextActual.length - 1] as TeaId) : null;
        const controlTop = controlNext.length > 0 ? (controlNext[controlNext.length - 1] as TeaId) : null;
        if (candidate === 'underpour') underpourEvents++;
        if (candidate === 'reverse-receive') reverseEvents++;
        if (candidate === 'full-flip') flipEvents++;
        // Strong-event candidacy: FULL top differs from CONTROL top.
        if (fullTop !== controlTop) {
          pending.push({ index: step, fullTop, controlTop, used: false });
        }
      }
      if (receives > 1 && existing.length > 0) base.reReceives++;
      board = next;
      continue;
    }
    // Downstream use: sourcing the exposed top from special.
    if (from === special) markUsed(srcTop);

    const next = applyAction(board, action, constraints);
    if (!next) break;
    board = next;
  }

  const usedEvents = pending.filter((p) => p.used).length;
  base.specialMoves = specialMoves;
  base.totalMoves = full.solution.length;
  base.specialTouchShare = full.solution.length > 0 ? specialMoves / full.solution.length : 0;
  base.transformShare = full.solution.length > 0 ? transformMoves / full.solution.length : 0;
  base.underpourEvents = underpourEvents;
  base.reverseEvents = reverseEvents;
  base.flipEvents = flipEvents;
  if (candidate === 'underpour') {
    base.preservedTopUses = usedEvents;
    base.broadCausal = underpourEvents > 0 && usedEvents > 0;
    base.strongCausal = usedEvents > 0;
  } else if (candidate === 'reverse-receive') {
    base.exposeUses = usedEvents;
    base.broadCausal = reverseEvents > 0 && usedEvents > 0;
    base.strongCausal = usedEvents > 0;
  } else {
    base.causalFlips = usedEvents;
    base.secondFlip = usedEvents >= 2;
    base.broadCausal = flipEvents > 0 && usedEvents > 0;
    base.strongCausal = usedEvents > 0;
  }
  base.canonicalStrong = base.strongCausal;
  base.ignored = !base.strongCausal;

  // Control divergence: same CONTROL sequence on both boards.
  if (ctrl.solvable && ctrl.solution) {
    let fullBoard = boardFrom(cups);
    let ctrlBoard = boardFrom(cups);
    let first: number | null = null;
    let strong = false;
    for (let step = 0; step < ctrl.solution.length; step++) {
      const action = ctrl.solution[step] as SolverAction;
      if (action.kind !== 'pour') {
        const nf = applyAction(fullBoard, action, constraints);
        const nc = applyAction(ctrlBoard, action, control);
        if (!nf || !nc) {
          if (first === null) first = step;
          strong = true;
          break;
        }
        fullBoard = nf;
        ctrlBoard = nc;
        continue;
      }
      const from = (action as { from: number }).from;
      const to = (action as { to: number }).to;
      const nf = applyAction(fullBoard, action, constraints);
      const nc = applyAction(ctrlBoard, action, control);
      if (!nf || !nc) {
        if (first === null) first = step;
        strong = true;
        break;
      }
      fullBoard = nf;
      ctrlBoard = nc;
      if (!sameLayers(fullBoard.cups.flat() as TeaId[], ctrlBoard.cups.flat() as TeaId[])) {
        if (first === null) first = step;
        // Look ahead: later CONTROL action illegal/different under FULL?
        for (let k = step + 1; k < ctrl.solution.length; k++) {
          const later = ctrl.solution[k] as SolverAction;
          if (later.kind !== 'pour') break;
          const lf = (later as { from: number }).from;
          const lt = (later as { to: number }).to;
          const probe: PuzzleState = {
            ...fullBoard,
            cups: fullBoard.cups.map((c) => [...c]),
          };
          const legalFull = canPourState(probe, lf, lt, constraints);
          const legalCtrl = canPourState(
            { ...ctrlBoard, cups: ctrlBoard.cups.map((c) => [...c]) },
            lf,
            lt,
            control,
          );
          void legalCtrl;
          const fullTop = topLayerOf(fullBoard.cups[lf] as TeaId[]);
          const ctrlTop = topLayerOf(ctrlBoard.cups[lf] as TeaId[]);
          if (!legalFull || fullTop !== ctrlTop) {
            strong = true;
            break;
          }
        }
        break;
      }
    }
    base.controlDiverges = first !== null;
    base.firstDivergenceStep = first;
    base.strongDivergence = strong;
  }
  return base;
}

export interface G28Summary {
  n: number;
  solvability: number;
  broadRate: number;
  strongRate: number;
  strongPerSolved: number;
  canonicalStrong: number;
  canonicalStarts: number;
  controlDivergenceRate: number;
  strongDivergenceRate: number;
  ignoredRate: number;
  specialTouchP50: number;
  specialTouchP90: number;
  specialTouchP95: number;
  transformShareP50: number;
  extraMovesP50: number | null;
  depthCollapseRate: number;
  visitedP50: number;
  visitedP95: number;
  solverMsP50: number;
  solverMsP95: number;
  stateMultP50: number;
  stateMultP95: number;
  stateMultMax: number;
  truncation: number;
}

function quant(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

export function summarize(results: G28BoardResult[]): G28Summary {
  const n = results.length;
  const solved = results.filter((r) => r.fullSolvable);
  const broad = results.filter((r) => r.broadCausal);
  const strong = results.filter((r) => r.strongCausal);
  const ignored = solved.filter((r) => r.ignored);
  const diverged = results.filter((r) => r.controlDiverges);
  const strongDiv = results.filter((r) => r.strongDivergence);
  const touches = solved.map((r) => r.specialTouchShare).sort((a, b) => a - b);
  const tshares = solved.map((r) => r.transformShare).sort((a, b) => a - b);
  const fullVisited = solved.map((r) => r.fullVisited).sort((a, b) => a - b);
  const fullMs = solved.map((r) => r.fullMs).sort((a, b) => a - b);
  const mults = solved.map((r) => r.fullVisited / Math.max(1, r.controlVisited)).sort((a, b) => a - b);
  const extras = solved
    .filter((r) => r.extraMoves !== null && r.extraMoves !== undefined)
    .map((r) => r.extraMoves as number)
    .sort((a, b) => a - b);
  return {
    n,
    solvability: solved.length / Math.max(1, n),
    broadRate: broad.length / Math.max(1, n),
    strongRate: strong.length / Math.max(1, n),
    strongPerSolved: strong.length / Math.max(1, solved.length),
    canonicalStrong: new Set(strong.map((r) => r.startKey)).size,
    canonicalStarts: new Set(results.map((r) => r.startKey)).size,
    controlDivergenceRate: diverged.length / Math.max(1, n),
    strongDivergenceRate: strongDiv.length / Math.max(1, n),
    ignoredRate: ignored.length / Math.max(1, solved.length),
    specialTouchP50: quant(touches, 0.5),
    specialTouchP90: quant(touches, 0.9),
    specialTouchP95: quant(touches, 0.95),
    transformShareP50: quant(tshares, 0.5),
    extraMovesP50: extras.length > 0 ? quant(extras, 0.5) : null,
    depthCollapseRate: solved.filter((r) => r.depthCollapse).length / Math.max(1, solved.length),
    visitedP50: quant(fullVisited, 0.5),
    visitedP95: quant(fullVisited, 0.95),
    solverMsP50: quant(fullMs, 0.5),
    solverMsP95: quant(fullMs, 0.95),
    stateMultP50: quant(mults, 0.5),
    stateMultP95: quant(mults, 0.95),
    stateMultMax: mults.length > 0 ? mults[mults.length - 1] as number : 0,
    truncation: results.filter((r) => r.fullTruncated).length,
  };
}
