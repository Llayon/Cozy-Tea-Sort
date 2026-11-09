/**
 * G27 shared research harness (DEV ONLY).
 * Deterministic deals, FULL/CONTROL solving, causal replay metrics.
 * No production imports beyond rules/solver/types/g27Research.
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
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  G27_GRAPH_A,
  G27_GRAPH_B,
  G27_GRAPH_C,
  G27_PALETTE,
  isTransferEdgeAllowed,
  type G27GraphId,
} from '../../src/game/logic/g27Research.ts';

export type G27Candidate = 'tea-bridge' | 'one-way' | 'two-lane';

export function g27GraphFor(candidate: G27Candidate): G27GraphId {
  if (candidate === 'tea-bridge') return G27_GRAPH_A;
  if (candidate === 'one-way') return G27_GRAPH_B;
  return G27_GRAPH_C;
}

function ordinary(role: string, graph: G27GraphId): CupConstraint {
  return { mode: 'normal', transferGraph: graph, transferRole: role };
}

function bridge(role: string, graph: G27GraphId): CupConstraint {
  return {
    mode: 'normal',
    capacity: STANDARD_CUP_CAPACITY,
    mustEndEmpty: true,
    transferGraph: graph,
    transferRole: role,
  };
}

/** Frozen FULL constraints per candidate (static topology, §21/§58). */
export function g27FullConstraints(candidate: G27Candidate): CupConstraint[] {
  const graph = g27GraphFor(candidate);
  if (candidate === 'two-lane') {
    // 0,1 left-low; 2 left-high; 3,4 right-low; 5 right-high; 6 bridgeA; 7 bridgeB.
    return [
      ordinary('left-low', graph),
      ordinary('left-low', graph),
      ordinary('left-high', graph),
      ordinary('right-low', graph),
      ordinary('right-low', graph),
      ordinary('right-high', graph),
      bridge('bridgeA', graph),
      bridge('bridgeB', graph),
    ];
  }
  // A/B: 0,1,2 left; 3,4,5 right; 6 bridge.
  const side = (i: number): string => (i < 3 ? 'left' : 'right');
  const out: CupConstraint[] = [];
  for (let i = 0; i < 6; i++) out.push(ordinary(side(i), graph));
  out.push(bridge('bridge', graph));
  return out;
}

/** CONTROL strips ONLY routing markers; contents/capacity/finality identical. */
export function g27ControlConstraints(full: readonly CupConstraint[]): CupConstraint[] {
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
 * Deterministic deal (no rejection sampling of solvability, §112-§113).
 * 16 units: 4 each of 4 palette teas. Mixed-cup guard only (no pre-solved
 * cup); unsolvable boards count against solvability.
 * A/B: vessels 0,1 + 3,4 filled; 2,5 + bridge empty.
 * C: vessels 0,1,3,4 (lows) filled; 2,5 + bridges empty.
 */
export function dealG27Board(
  seedStr: string,
  candidate: G27Candidate,
): { cups: TeaId[][]; constraints: CupConstraint[] } {
  const rng = mulberry32(hashSeed(seedStr));
  const pool: TeaId[] = [];
  for (const t of G27_PALETTE) for (let i = 0; i < TEA_UNITS_PER_COLOR; i++) pool.push(t);
  const constraints = g27FullConstraints(candidate);
  for (let attempt = 0; attempt < 50; attempt++) {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j] as TeaId, arr[i] as TeaId];
    }
    const filled: TeaId[][] = [arr.slice(0, 4), arr.slice(4, 8), arr.slice(8, 12), arr.slice(12, 16)];
    if (filled.some((cup) => cup.every((l) => l === cup[0]))) continue;
    if (candidate === 'two-lane') {
      const [a, b, c2, d] = filled as [TeaId[], TeaId[], TeaId[], TeaId[]];
      return { cups: [a, b, [], c2, d, [], [], []], constraints };
    }
    const [a, b, c2, d] = filled as [TeaId[], TeaId[], TeaId[], TeaId[]];
    return { cups: [a, b, [], c2, d, [], []], constraints };
  }
  throw new Error(`dealG27Board: could not deal mixed board for ${seedStr}`);
}

export interface G27BoardResult {
  seed: string;
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
  causal: boolean;
  canonicalCausal: boolean;
  controlDiverges: boolean;
  firstDivergenceStep: number | null;
  forbiddenControlEdges: number;
  ignored: boolean;
  bridgeMoves: number;
  bridgeMoveShare: number;
  totalMoves: number;
  extraMoves: number | null;
  routeReplan: boolean;
  crossingEvents: number;
  crossingUnits: number;
  laneAUsed: boolean;
  laneBUsed: boolean;
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

function sideOfRole(role: string | undefined, candidate: G27Candidate): 'left' | 'right' | 'bridge' | null {
  if (role === undefined) return null;
  if (candidate === 'two-lane') {
    if (role === 'left-low' || role === 'left-high') return 'left';
    if (role === 'right-low' || role === 'right-high') return 'right';
    return 'bridge';
  }
  if (role === 'left') return 'left';
  if (role === 'right') return 'right';
  return 'bridge';
}

function isBridgeRole(role: string | undefined): boolean {
  return role === 'bridge' || role === 'bridgeA' || role === 'bridgeB';
}

function applyAction(board: PuzzleState, action: SolverAction, constraints: readonly CupConstraint[]): PuzzleState | null {
  const res = applyPuzzleActionState(board, action as never, constraints);
  return res ? res.state : null;
}

export function analyzeG27Board(seed: string, candidate: G27Candidate): G27BoardResult {
  const { cups, constraints } = dealG27Board(seed, candidate);
  const control = g27ControlConstraints(constraints);
  void hasAnyG27Marker;
  const t0 = Date.now();
  const full = solvePuzzle(cups, { cupConstraints: constraints });
  const fullMs = Date.now() - t0;
  const t1 = Date.now();
  const ctrl = solvePuzzle(cups, { cupConstraints: control });
  const controlMs = Date.now() - t1;

  const base: G27BoardResult = {
    seed,
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
    causal: false,
    canonicalCausal: false,
    controlDiverges: false,
    firstDivergenceStep: null,
    forbiddenControlEdges: 0,
    ignored: true,
    bridgeMoves: 0,
    bridgeMoveShare: 0,
    totalMoves: full.solution?.length ?? 0,
    extraMoves: full.solvable && ctrl.solvable ? (full.minMoves as number) - (ctrl.minMoves as number) : null,
    routeReplan: false,
    crossingEvents: 0,
    crossingUnits: 0,
    laneAUsed: false,
    laneBUsed: false,
  };
  if (!full.solvable || !full.solution) return base;

  // Replay FULL optimal under FULL: bridge usage, provenance-tagged crossings.
  // Bridge stacks hold {tea, originSide} entries; exits to the opposite side count.
  const roles = constraints.map((c) => c.transferRole);
  const bridgeStacks = new Map<number, Array<{ tea: TeaId; origin: string }>>();
  let board = boardFrom(cups);
  let bridgeMoves = 0;
  let crossingEvents = 0;
  let crossingUnits = 0;
  const fullNonBridge: string[] = [];

  for (const action of full.solution) {
    if (action.kind !== 'pour') {
      const next = applyAction(board, action, constraints);
      if (!next) break;
      board = next;
      continue;
    }
    const from = (action as { from: number }).from;
    const to = (action as { to: number }).to;
    const preCups = board.cups.map((c) => [...c]) as TeaId[][];
    const srcLayers = preCups[from] as TeaId[];
    const fromRole = roles[from];
    const toRole = roles[to];
    const touchesBridge = isBridgeRole(fromRole) || isBridgeRole(toRole);
    if (touchesBridge) bridgeMoves++;
    else fullNonBridge.push(`${from}->${to}`);

    if (candidate === 'two-lane') {
      if (fromRole === 'bridgeA' || toRole === 'bridgeA') base.laneAUsed = true;
      if (fromRole === 'bridgeB' || toRole === 'bridgeB') base.laneBUsed = true;
    } else {
      if (touchesBridge) {
        base.laneAUsed = true;
      }
    }

    // Provenance tracking for bridge exits.
    const fromSide = sideOfRole(fromRole, candidate);
    const toSide = sideOfRole(toRole, candidate);
    if (!isBridgeRole(fromRole) && isBridgeRole(toRole)) {
      // Inflow: tag arriving units with the source side.
      const m = (action as { count: number }).count;
      const stack = bridgeStacks.get(to) ?? [];
      const top = srcLayers[srcLayers.length - 1] as TeaId;
      for (let i = 0; i < m; i++) stack.push({ tea: top, origin: fromSide ?? '?' });
      bridgeStacks.set(to, stack);
    } else if (isBridgeRole(fromRole) && !isBridgeRole(toRole)) {
      const m = (action as { count: number }).count;
      const stack = bridgeStacks.get(from) ?? [];
      let crossed = 0;
      for (let i = 0; i < m; i++) {
        const unit = stack.pop();
        if (unit && unit.origin !== toSide && (unit.origin === 'left' || unit.origin === 'right')) crossed++;
      }
      bridgeStacks.set(from, stack);
      if (crossed > 0) {
        crossingEvents++;
        crossingUnits += crossed;
      }
    } else if (isBridgeRole(fromRole) && isBridgeRole(toRole)) {
      // Bridge-to-bridge (only possible in C if allowed — it is not; move
      // provenance conservatively without counting a crossing).
      const m = (action as { count: number }).count;
      const srcStack = bridgeStacks.get(from) ?? [];
      const dstStack = bridgeStacks.get(to) ?? [];
      const moved = srcStack.splice(srcStack.length - m, m);
      bridgeStacks.set(from, srcStack);
      bridgeStacks.set(to, [...dstStack, ...moved]);
    }

    const next = applyAction(board, action, constraints);
    if (!next) break;
    board = next;
  }

  base.bridgeMoves = bridgeMoves;
  base.totalMoves = full.solution.length;
  base.bridgeMoveShare = full.solution.length > 0 ? bridgeMoves / full.solution.length : 0;
  base.ignored = bridgeMoves === 0;
  base.crossingEvents = crossingEvents;
  base.crossingUnits = crossingUnits;
  base.causal = crossingEvents > 0;
  base.canonicalCausal = base.causal;

  // CONTROL divergence: replay optimal CONTROL solution, checking each
  // CONTROL edge against the FULL static graph (§33/§43).
  if (ctrl.solvable && ctrl.solution) {
    let forbidden = 0;
    let first: number | null = null;
    const ctrlNonBridge: string[] = [];
    for (let step = 0; step < ctrl.solution.length; step++) {
      const action = ctrl.solution[step] as SolverAction;
      if (action.kind !== 'pour') continue;
      const from = (action as { from: number }).from;
      const to = (action as { to: number }).to;
      const allowed = isTransferEdgeAllowed(constraints[from], constraints[to]);
      if (!allowed) {
        forbidden++;
        if (first === null) first = step;
      } else if (!isBridgeRole(roles[from]) && !isBridgeRole(roles[to])) {
        ctrlNonBridge.push(`${from}->${to}`);
      }
    }
    base.forbiddenControlEdges = forbidden;
    base.controlDiverges = forbidden > 0;
    base.firstDivergenceStep = first;
    // ROUTE_REPLAN: FULL changes at least one non-bridge move vs CONTROL.
    if (base.causal) {
      const a = [...fullNonBridge].sort().join(',');
      const b = [...ctrlNonBridge].sort().join(',');
      base.routeReplan = a !== b;
    }
  } else {
    // CONTROL unsolvable: divergence vacuously false; replan from FULL only.
    base.forbiddenControlEdges = 0;
  }

  // One-way specific: provenance replay already counts LEFT->BRIDGE->RIGHT
  // crossings; RIGHT->LEFT transport is structurally impossible (no edge),
  // so any causal event here is a genuine one-way crossing.
  void pourRejectCodeState;
  void applyPourState;
  return base;
}

export interface G27Summary {
  n: number;
  solvability: number;
  causalRate: number;
  causalPerSolved: number;
  canonicalCausal: number;
  controlDivergenceRate: number;
  ignoredRate: number;
  routeReplanRate: number;
  routeReplanPerCausal: number;
  visitedP50: number;
  visitedP95: number;
  solverMsP50: number;
  solverMsP95: number;
  stateMultP50: number;
  stateMultP95: number;
  stateMultMax: number;
  truncation: number;
  bridgeShareP50: number;
  bridgeShareP90: number;
  bridgeShareP95: number;
  extraMovesP50: number | null;
  taxOnlyRate: number | null;
  crossingHist: { zero: number; one: number; two: number; threePlus: number };
  multiLaneRate?: number;
}

function quant(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

export function summarize(results: G27BoardResult[]): G27Summary {
  const n = results.length;
  const solved = results.filter((r) => r.fullSolvable);
  const causal = results.filter((r) => r.causal);
  const ignored = solved.filter((r) => r.ignored);
  const diverged = results.filter((r) => r.controlDiverges);
  const replan = results.filter((r) => r.routeReplan);
  const fullVisited = solved.map((r) => r.fullVisited).sort((a, b) => a - b);
  const fullMs = solved.map((r) => r.fullMs).sort((a, b) => a - b);
  const mults = solved.map((r) => r.fullVisited / Math.max(1, r.controlVisited)).sort((a, b) => a - b);
  const shares = solved.map((r) => r.bridgeMoveShare).sort((a, b) => a - b);
  const extras = solved
    .filter((r) => r.extraMoves !== null && r.extraMoves !== undefined)
    .map((r) => r.extraMoves as number)
    .sort((a, b) => a - b);
  // Tax-only: causal boards where extraMoves == 2 * forbiddenCrossings and no replan.
  const causalBoards = results.filter((r) => r.causal);
  const taxOnly = causalBoards.filter(
    (r) => !r.routeReplan && r.extraMoves !== null && r.extraMoves === 2 * r.forbiddenControlEdges,
  );
  const crossingHist = { zero: 0, one: 0, two: 0, threePlus: 0 };
  for (const r of solved) {
    if (r.crossingEvents === 0) crossingHist.zero++;
    else if (r.crossingEvents === 1) crossingHist.one++;
    else if (r.crossingEvents === 2) crossingHist.two++;
    else crossingHist.threePlus++;
  }
  return {
    n,
    solvability: solved.length / Math.max(1, n),
    causalRate: causal.length / Math.max(1, n),
    causalPerSolved: causal.length / Math.max(1, solved.length),
    canonicalCausal: new Set(
      causal.map((r) => r.seed),
    ).size,
    controlDivergenceRate: diverged.length / Math.max(1, solved.length),
    ignoredRate: ignored.length / Math.max(1, solved.length),
    routeReplanRate: replan.length / Math.max(1, n),
    routeReplanPerCausal: replan.length / Math.max(1, causal.length),
    visitedP50: quant(fullVisited, 0.5),
    visitedP95: quant(fullVisited, 0.95),
    solverMsP50: quant(fullMs, 0.5),
    solverMsP95: quant(fullMs, 0.95),
    stateMultP50: quant(mults, 0.5),
    stateMultP95: quant(mults, 0.95),
    stateMultMax: mults.length > 0 ? mults[mults.length - 1] as number : 0,
    truncation: results.filter((r) => r.fullTruncated).length,
    bridgeShareP50: quant(shares, 0.5),
    bridgeShareP90: quant(shares, 0.9),
    bridgeShareP95: quant(shares, 0.95),
    extraMovesP50: extras.length > 0 ? quant(extras, 0.5) : null,
    taxOnlyRate: causalBoards.length > 0 ? taxOnly.length / causalBoards.length : null,
    crossingHist,
  };
}
