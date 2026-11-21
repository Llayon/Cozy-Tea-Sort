/**
 * G29 shared research harness (DEV ONLY).
 * Deterministic deals, FULL/CONTROL solving, causal replay metrics.
 * No production imports beyond rules/solver/types/g29Research.
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
  pourRejectCodeState,
  topLayerOf,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  G29_PAIRS,
  G29_PALETTE,
  type G29Candidate,
} from '../../src/game/logic/g29Research.ts';

export const G29_SPECIAL_INDEX = 4;

/** Static pair for a B board: PAIRS[seedIndex % 6] (balanced rotation, §32). */
export function g29PairForSeed(seedIndex: number): readonly [TeaId, TeaId] {
  return G29_PAIRS[((seedIndex % 6) + 6) % 6] as readonly [TeaId, TeaId];
}

export function g29FullConstraints(candidate: G29Candidate, seedIndex = 0): CupConstraint[] {
  const special: CupConstraint = {
    mode: 'normal',
    capacity: STANDARD_CUP_CAPACITY,
    mustEndEmpty: true,
  };
  if (candidate === 'mixed-buffer') special.mixedBuffer = true;
  else if (candidate === 'two-tea-buffer') {
    const [teaA, teaB] = g29PairForSeed(seedIndex);
    special.twoTeaBuffer = { teaA, teaB };
  } else special.differentTeaBuffer = true;
  return [
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    { mode: 'normal' },
    special,
    { mode: 'normal' },
  ];
}

/** CONTROL strips ONLY the candidate marker; geometry/finality identical. */
export function g29ControlConstraints(full: readonly CupConstraint[]): CupConstraint[] {
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
 * Deterministic deal (no filtering/resampling, §116-§117).
 * 16 units: 4 each of 4 palette teas; vessels 0-3 filled, 4 special empty,
 * 5 ordinary empty. Mixed-cup guard only (no pre-solved cup).
 */
export function dealG29Board(
  seedStr: string,
  candidate: G29Candidate,
  seedIndex = 0,
): { cups: TeaId[][]; constraints: CupConstraint[] } {
  const rng = mulberry32(hashSeed(seedStr));
  const pool: TeaId[] = [];
  for (const t of G29_PALETTE) for (let i = 0; i < TEA_UNITS_PER_COLOR; i++) pool.push(t);
  const constraints = g29FullConstraints(candidate, seedIndex);
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
  throw new Error(`dealG29Board: could not deal mixed board for ${seedStr}`);
}

export interface G29BoardResult {
  seed: string;
  pairIndex: number | null;
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
  // Mixed receives into nonempty special (cross-color, CONTROL would reject).
  mixedReceives: number;
  // Broad: >=1 mixed receive into nonempty special.
  broadMixed: boolean;
  // Strong: mixed receive + later drain of the added run with lower tea remaining.
  strongCausal: boolean;
  canonicalStrong: boolean;
  strongEvents: number;
  multiStage: boolean;
  bufferReplan: boolean;
  replanEvents: number;
  holdGapFirst: number | null;
  maxRunsSpecial: number;
  maxDistinctSpecial: number;
  distinctThroughSpecial: number;
  mixedCycles: number;
  multiRunCycles: number;
  ignored: boolean;
  specialMoves: number;
  specialTouchShare: number;
  totalMoves: number;
  extraMoves: number | null;
  depthCollapse: boolean;
  extremeShortcut: boolean;
  controlDiverges: boolean;
  firstRejectStep: number | null;
  // B extras.
  pairMixEvents: number;
  ordinarySpecialReceives: number;
  offPairReceives: number;
  // C extras.
  differentReceives: number;
  sameColorBlocks: number;
  blockPressureStates: number;
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

function countRuns(layers: readonly TeaId[]): number {
  if (layers.length === 0) return 0;
  let runs = 1;
  for (let i = 1; i < layers.length; i++) {
    if (layers[i] !== layers[i - 1]) runs++;
  }
  return runs;
}

export function analyzeG29Board(seed: string, candidate: G29Candidate, seedIndex = 0): G29BoardResult {
  const { cups, constraints } = dealG29Board(seed, candidate, seedIndex);
  const control = g29ControlConstraints(constraints);
  const special = G29_SPECIAL_INDEX;
  const pair = candidate === 'two-tea-buffer'
    ? (constraints[special] as CupConstraint).twoTeaBuffer as { teaA: TeaId; teaB: TeaId }
    : null;
  const startKey = canonicalPuzzleKey(boardFrom(cups), constraints);

  const t0 = Date.now();
  const full = solvePuzzle(cups, { cupConstraints: constraints });
  const fullMs = Date.now() - t0;
  const t1 = Date.now();
  const ctrl = solvePuzzle(cups, { cupConstraints: control });
  const controlMs = Date.now() - t1;

  const base: G29BoardResult = {
    seed,
    pairIndex: candidate === 'two-tea-buffer' ? ((seedIndex % 6) + 6) % 6 : null,
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
    mixedReceives: 0,
    broadMixed: false,
    strongCausal: false,
    canonicalStrong: false,
    strongEvents: 0,
    multiStage: false,
    bufferReplan: false,
    replanEvents: 0,
    holdGapFirst: null,
    maxRunsSpecial: 0,
    maxDistinctSpecial: 0,
    distinctThroughSpecial: 0,
    mixedCycles: 0,
    multiRunCycles: 0,
    ignored: true,
    specialMoves: 0,
    specialTouchShare: 0,
    totalMoves: full.solution?.length ?? 0,
    extraMoves: full.solvable && ctrl.solvable ? (full.minMoves as number) - (ctrl.minMoves as number) : null,
    depthCollapse: full.solvable && ctrl.solvable
      ? (full.minMoves as number) <= 0.7 * (ctrl.minMoves as number)
      : false,
    extremeShortcut: full.solvable && ctrl.solvable
      ? (full.minMoves as number) <= 0.6 * (ctrl.minMoves as number)
      : false,
    controlDiverges: false,
    firstRejectStep: null,
    pairMixEvents: 0,
    ordinarySpecialReceives: 0,
    offPairReceives: 0,
    differentReceives: 0,
    sameColorBlocks: 0,
    blockPressureStates: 0,
  };
  if (!full.solvable || !full.solution) return base;

  interface PendingMixed {
    step: number;
    tea: TeaId;
    used: boolean;
    replan: boolean;
    holdGap: number | null;
  }
  const pending: PendingMixed[] = [];
  let board = boardFrom(cups);
  let specialMoves = 0;
  let mixedReceives = 0;
  let pairMixEvents = 0;
  let ordinarySpecialReceives = 0;
  let offPairReceives = 0;
  let differentReceives = 0;
  const throughSpecial = new Set<TeaId>();
  let inCycle = false;
  let cycleTeas = new Set<TeaId>();
  let cycleMaxRuns = 0;
  let cycleReceives = 0;
  let cycles = 0;
  let multiRunCycles = 0;
  let strongEvents = 0;
  let replanEvents = 0;
  let multiStage = false;
  let firstHoldGap: number | null = null;

  const noteSpecialState = (): void => {
    const layers = board.cups[special] as TeaId[];
    const runs = countRuns(layers);
    if (runs > base.maxRunsSpecial) base.maxRunsSpecial = runs;
    const distinct = new Set(layers).size;
    if (distinct > base.maxDistinctSpecial) base.maxDistinctSpecial = distinct;
    if (inCycle) {
      for (const t of layers) cycleTeas.add(t);
      if (runs > cycleMaxRuns) cycleMaxRuns = runs;
    }
  };

  const closeCycleIfEmpty = (): void => {
    if (inCycle && (board.cups[special] as TeaId[]).length === 0) {
      inCycle = false;
      cycles++;
      if (cycleMaxRuns >= 3) multiRunCycles++;
      cycleTeas = new Set<TeaId>();
      cycleMaxRuns = 0;
      cycleReceives = 0;
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
    const preCups = board.cups.map((c) => [...c]) as TeaId[][];
    const srcTop = topLayerOf(preCups[from] as TeaId[]) as TeaId;
    if (from === special || to === special) specialMoves++;

    if (to === special) {
      const pre = [...(preCups[special] as TeaId[])];
      const preTop = pre.length > 0 ? (pre[pre.length - 1] as TeaId) : null;
      throughSpecial.add(srcTop);
      if (preTop === null) {
        ordinarySpecialReceives++;
      } else if (srcTop === preTop) {
        ordinarySpecialReceives++;
      } else {
        // Cross-color receive into nonempty special: candidate event
        // (CONTROL would reject by ordinary color mismatch).
        mixedReceives++;
        if (candidate === 'two-tea-buffer') {
          const inPair = (t: TeaId): boolean => t === (pair as { teaA: TeaId }).teaA || t === (pair as { teaB: TeaId }).teaB;
          if (inPair(preTop) && inPair(srcTop)) pairMixEvents++;
          else offPairReceives++;
        }
        if (candidate === 'different-tea-buffer') differentReceives++;
        if (!inCycle) {
          inCycle = true;
          cycleTeas = new Set<TeaId>();
          cycleMaxRuns = 0;
          cycleReceives = 0;
        }
        cycleReceives++;
        pending.push({ step, tea: srcTop, used: false, replan: false, holdGap: null });
      }
    }

    // Drain detection: sourcing the pending mixed run from special.
    if (from === special) {
      for (const p of pending) {
        if (p.used || p.tea !== srcTop) continue;
        p.used = true;
        p.holdGap = step - p.step - 1;
        if (firstHoldGap === null) firstHoldGap = p.holdGap;
        // BUFFER_REPLAN: a non-special move strictly between receive and drain.
        for (let k = p.step + 1; k < step; k++) {
          const mid = full.solution[k] as SolverAction;
          if (mid.kind !== 'pour') continue;
          const mf = (mid as { from: number }).from;
          const mt = (mid as { to: number }).to;
          if (mf !== special && mt !== special) {
            p.replan = true;
            break;
          }
        }
        break;
      }
    }

    const next = applyAction(board, action, constraints);
    if (!next) break;
    board = next;
    noteSpecialState();

    // Strong-event confirmation: after a drain of the mixed run, a lower
    // (different) TeaId must remain in special.
    if (from === special) {
      for (const p of pending) {
        if (!p.used || (p as { confirmed?: boolean }).confirmed) continue;
        if (p.tea !== srcTop) continue;
        (p as { confirmed?: boolean }).confirmed = true;
        const remaining = [...(board.cups[special] as TeaId[])];
        if (remaining.length > 0 && remaining.some((t) => t !== p.tea)) {
          strongEvents++;
          if (p.replan) replanEvents++;
          if (p.holdGap !== null && firstHoldGap === null) firstHoldGap = p.holdGap;
        } else {
          // Drain emptied the mixed content or left only same tea:
          // revoke (not a proven mixed-storage use).
          p.used = false;
        }
      }
    }
    closeCycleIfEmpty();
  }
  if (inCycle) {
    cycles++;
    if (cycleMaxRuns >= 3) multiRunCycles++;
  }

  // Multi-stage (§99): after a strong drain, a remaining lower tea is later used.
  const strongSteps: number[] = [];
  {
    // Re-derive: strong events confirmed above; find later use of lower teas.
    // Approximate via replay scan: for each confirmed event, check a later
    // FROM-special pour whose layer differs from the event tea.
    const confirmed = pending.filter((p) => p.used);
    if (confirmed.length > 0) {
      const firstDrainStep = ((): number | null => {
        for (let step = 0; step < full.solution.length; step++) {
          const a = full.solution[step] as SolverAction;
          if (a.kind !== 'pour') continue;
          if ((a as { from: number }).from !== special) continue;
          const layer = (a as { layer: TeaId }).layer;
          if (confirmed.some((p) => p.tea === layer)) return step;
        }
        return null;
      })();
      if (firstDrainStep !== null) {
        const eventTeas = new Set(confirmed.map((p) => p.tea));
        for (let step = firstDrainStep + 1; step < full.solution.length; step++) {
          const a = full.solution[step] as SolverAction;
          if (a.kind !== 'pour') continue;
          if ((a as { from: number }).from !== special) continue;
          const layer = (a as { layer: TeaId }).layer;
          if (!eventTeas.has(layer)) {
            multiStage = true;
            break;
          }
        }
      }
    }
    void strongSteps;
  }

  base.specialMoves = specialMoves;
  base.totalMoves = full.solution.length;
  base.specialTouchShare = full.solution.length > 0 ? specialMoves / full.solution.length : 0;
  base.mixedReceives = mixedReceives;
  base.broadMixed = mixedReceives > 0;
  base.strongEvents = strongEvents;
  base.strongCausal = strongEvents > 0;
  base.canonicalStrong = base.strongCausal;
  base.multiStage = multiStage;
  base.bufferReplan = replanEvents > 0;
  base.replanEvents = replanEvents;
  base.holdGapFirst = firstHoldGap;
  base.distinctThroughSpecial = throughSpecial.size;
  base.mixedCycles = cycles;
  base.multiRunCycles = multiRunCycles;
  base.ignored = !base.strongCausal;
  base.pairMixEvents = pairMixEvents;
  base.ordinarySpecialReceives = ordinarySpecialReceives;
  base.offPairReceives = offPairReceives;
  base.differentReceives = differentReceives;

  // Control divergence: replay FULL solution under CONTROL legality.
  {
    let divergence: number | null = null;
    for (let step = 0; step < full.solution.length; step++) {
      const action = full.solution[step] as SolverAction;
      if (action.kind !== 'pour') continue;
      const from = (action as { from: number }).from;
      const to = (action as { to: number }).to;
      // Reconstruct the FULL pre-state at this step by replaying FULL.
      // (Cheap N=6 boards: re-replay from root each step.)
      let probe = boardFrom(cups);
      let ok = true;
      for (let k = 0; k < step; k++) {
        const prior = full.solution[k] as SolverAction;
        const r = applyAction(probe, prior, constraints);
        if (!r) {
          ok = false;
          break;
        }
        probe = r;
      }
      if (!ok) break;
      const code = pourRejectCodeState(
        {
          cups: probe.cups.map((c) => [...c]),
          floatingIngredients: probe.floatingIngredients.map(() => null),
          sinkingIngredients: probe.sinkingIngredients.map(() => null),
          strainer: { present: false, attachedCupIndex: null, heldTea: null },
          iceSlots: probe.iceSlots.map(() => null),
          capacityObstacles: probe.capacityObstacles.map(() => null),
          teaBudSlots: probe.teaBudSlots.map(() => null),
        } as never,
        from,
        to,
        control,
      );
      if (code !== 'ok') {
        divergence = step;
        break;
      }
    }
    base.controlDiverges = divergence !== null;
    base.firstRejectStep = divergence;
  }

  // C block pressure: along the FULL replay, count states where a
  // same-color receive into nonempty special is CONTROL-legal but FULL-illegal.
  if (candidate === 'different-tea-buffer') {
    let probe = boardFrom(cups);
    let states = 0;
    let blocks = 0;
    for (const action of full.solution) {
      const layers = probe.cups.map((c) => [...c]) as TeaId[][];
      const spec = layers[special] as TeaId[];
      if (spec.length > 0) {
        states++;
        let blockedHere = false;
        for (let f = 0; f < layers.length; f++) {
          if (f === special) continue;
          const src = layers[f] as TeaId[];
          if (src.length === 0) continue;
          const top = src[src.length - 1] as TeaId;
          if (top !== spec[spec.length - 1]) continue;
          const fullCode = pourRejectCodeState({ cups: layers } as never, f, special, constraints);
          const ctrlCode = pourRejectCodeState({ cups: layers } as never, f, special, control);
          if (ctrlCode === 'ok' && fullCode !== 'ok') {
            blockedHere = true;
            blocks++;
            break;
          }
        }
        void blockedHere;
      }
      if ((action as SolverAction).kind !== 'pour') continue;
      const r = applyAction(probe, action as SolverAction, constraints);
      if (!r) break;
      probe = r;
    }
    base.blockPressureStates = blocks;
    void states;
    // SAME_COLOR_BLOCK via CONTROL-solution replay under FULL.
    if (ctrl.solvable && ctrl.solution) {
      let cprobe = boardFrom(cups);
      let nBlocks = 0;
      for (const action of ctrl.solution) {
        if ((action as SolverAction).kind !== 'pour') continue;
        const from = (action as { from: number }).from;
        const to = (action as { to: number }).to;
        if (to === special) {
          const cl = cprobe.cups.map((c) => [...c]) as TeaId[][];
          const spec = cl[special] as TeaId[];
          const src = cl[from] as TeaId[];
          if (spec.length > 0 && src.length > 0 && spec[spec.length - 1] === src[src.length - 1]) {
            const fullCode = pourRejectCodeState({ cups: cl } as never, from, to, constraints);
            if (fullCode !== 'ok') nBlocks++;
          }
        }
        const r = applyAction(cprobe, action as SolverAction, control);
        if (!r) break;
        cprobe = r;
      }
      base.sameColorBlocks = nBlocks;
    }
  }
  return base;
}

export interface G29Summary {
  n: number;
  solvability: number;
  broadRate: number;
  strongRate: number;
  strongPerSolved: number;
  canonicalStrong: number;
  canonicalStarts: number;
  controlDivergenceRate: number;
  ignoredRate: number;
  specialTouchP50: number;
  specialTouchP90: number;
  specialTouchP95: number;
  extraMovesP50: number | null;
  depthCollapseRate: number;
  extremeShortcutRate: number;
  visitedP50: number;
  visitedP95: number;
  solverMsP50: number;
  solverMsP95: number;
  stateMultP50: number;
  stateMultP95: number;
  stateMultMax: number;
  truncation: number;
  mixedReceivesHist: { zero: number; one: number; two: number; three: number; fourPlus: number };
  strongEventsP50: number;
  replanRate: number;
  multiStageRate: number;
  holdGapP50: number | null;
  holdGapP95: number | null;
  distinctP50: number;
  maxSimulP50: number;
  cyclesP50: number;
}

function quant(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

export function summarize(results: G29BoardResult[]): G29Summary {
  const n = results.length;
  const solved = results.filter((r) => r.fullSolvable);
  const broad = results.filter((r) => r.broadMixed);
  const strong = results.filter((r) => r.strongCausal);
  const ignored = solved.filter((r) => r.ignored);
  const diverged = results.filter((r) => r.controlDiverges);
  const touches = solved.map((r) => r.specialTouchShare).sort((a, b) => a - b);
  const fullVisited = solved.map((r) => r.fullVisited).sort((a, b) => a - b);
  const fullMs = solved.map((r) => r.fullMs).sort((a, b) => a - b);
  const mults = solved.map((r) => r.fullVisited / Math.max(1, r.controlVisited)).sort((a, b) => a - b);
  const extras = solved
    .filter((r) => r.extraMoves !== null && r.extraMoves !== undefined)
    .map((r) => r.extraMoves as number)
    .sort((a, b) => a - b);
  const strongCounts = solved.map((r) => r.strongEvents).sort((a, b) => a - b);
  const gaps = solved
    .filter((r) => r.holdGapFirst !== null)
    .map((r) => r.holdGapFirst as number)
    .sort((a, b) => a - b);
  const distincts = solved.map((r) => r.distinctThroughSpecial).sort((a, b) => a - b);
  const simuls = solved.map((r) => r.maxDistinctSpecial).sort((a, b) => a - b);
  const cycles = solved.map((r) => r.mixedCycles).sort((a, b) => a - b);
  const recv = solved.map((r) => r.mixedReceives);
  return {
    n,
    solvability: solved.length / Math.max(1, n),
    broadRate: broad.length / Math.max(1, n),
    strongRate: strong.length / Math.max(1, n),
    strongPerSolved: strong.length / Math.max(1, solved.length),
    canonicalStrong: new Set(strong.map((r) => r.startKey)).size,
    canonicalStarts: new Set(results.map((r) => r.startKey)).size,
    controlDivergenceRate: diverged.length / Math.max(1, n),
    ignoredRate: ignored.length / Math.max(1, solved.length),
    specialTouchP50: quant(touches, 0.5),
    specialTouchP90: quant(touches, 0.9),
    specialTouchP95: quant(touches, 0.95),
    extraMovesP50: extras.length > 0 ? quant(extras, 0.5) : null,
    depthCollapseRate: solved.filter((r) => r.depthCollapse).length / Math.max(1, solved.length),
    extremeShortcutRate: solved.filter((r) => r.extremeShortcut).length / Math.max(1, solved.length),
    visitedP50: quant(fullVisited, 0.5),
    visitedP95: quant(fullVisited, 0.95),
    solverMsP50: quant(fullMs, 0.5),
    solverMsP95: quant(fullMs, 0.95),
    stateMultP50: quant(mults, 0.5),
    stateMultP95: quant(mults, 0.95),
    stateMultMax: mults.length > 0 ? mults[mults.length - 1] as number : 0,
    truncation: results.filter((r) => r.fullTruncated).length,
    mixedReceivesHist: {
      zero: recv.filter((v) => v === 0).length,
      one: recv.filter((v) => v === 1).length,
      two: recv.filter((v) => v === 2).length,
      three: recv.filter((v) => v === 3).length,
      fourPlus: recv.filter((v) => v >= 4).length,
    },
    strongEventsP50: quant(strongCounts, 0.5),
    replanRate: solved.filter((r) => r.bufferReplan).length / Math.max(1, n),
    multiStageRate: solved.filter((r) => r.multiStage).length / Math.max(1, n),
    holdGapP50: gaps.length > 0 ? quant(gaps, 0.5) : null,
    holdGapP95: gaps.length > 0 ? quant(gaps, 0.95) : null,
    distinctP50: quant(distincts, 0.5),
    maxSimulP50: quant(simuls, 0.5),
    cyclesP50: quant(cycles, 0.5),
  };
}
