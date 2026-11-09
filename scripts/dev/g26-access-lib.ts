/**
 * G26 shared research harness (DEV ONLY).
 * Deterministic deals, FULL/CONTROL solving, causal replay metrics.
 * No production imports beyond rules/solver/types/g26Research.
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
  applyPourState,
  canonicalPuzzleKey,
  pourRejectCodeState,
  topCountOf,
  topLayerOf,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  bottomLayerOf,
  bottomRunCountOf,
  findLinkedValveIndex,
  G26_LINKED_GROUP,
  G26_PALETTE,
  isPairReadyNow,
  isValidBottomDrawConstraint,
  isValidLinkedSourceConstraint,
  sourceTransferPlan,
} from '../../src/game/logic/g26Research.ts';

export type G26Candidate = 'bottom-draw' | 'pair-ready' | 'linked-gate';

export function g26SpecialConstraint(candidate: G26Candidate): CupConstraint {
  if (candidate === 'bottom-draw') return { mode: 'normal', capacity: 4, mustEndEmpty: true, bottomDraw: true };
  if (candidate === 'pair-ready') return { mode: 'normal', capacity: 4, mustEndEmpty: true, pairReadySource: true };
  throw new Error('use linked constraints for linked-gate');
}

export function g26LinkedConstraints(): { source: CupConstraint; valve: CupConstraint } {
  return {
    source: { mode: 'normal', capacity: 4, mustEndEmpty: true, linkedSourceGroup: G26_LINKED_GROUP, linkedSourceRole: 'source' },
    valve: { mode: 'normal', capacity: 4, linkedSourceGroup: G26_LINKED_GROUP, linkedSourceRole: 'valve' },
  };
}

export function g26ControlConstraints(full: readonly CupConstraint[]): CupConstraint[] {
  return full.map((c) => {
    const out: CupConstraint = { mode: c.mode };
    if (c.targetTeaId !== undefined) out.targetTeaId = c.targetTeaId;
    if (c.capacity !== undefined) out.capacity = c.capacity;
    if (c.mustEndEmpty !== undefined) out.mustEndEmpty = c.mustEndEmpty;
    if (c.serveOrder !== undefined) out.serveOrder = c.serveOrder;
    if (c.sharedCapacityGroup !== undefined) out.sharedCapacityGroup = c.sharedCapacityGroup;
    if (c.pairedTeaGroup !== undefined) out.pairedTeaGroup = c.pairedTeaGroup;
    if (c.steepingFlask !== undefined) out.steepingFlask = c.steepingFlask;
    // Strip ONLY G26 markers; keep cap/mustEndEmpty/geometry identical.
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

export function dealG26Board(seedStr: string, candidate: G26Candidate): { cups: TeaId[][]; constraints: CupConstraint[] } {
  const rng = mulberry32(hashSeed(seedStr));
  // 16 units: 4 each of 4 palette teas.
  const pool: TeaId[] = [];
  for (const t of G26_PALETTE) for (let i = 0; i < TEA_UNITS_PER_COLOR; i++) pool.push(t);
  // Deterministic Fisher-Yates with mixed-cup guard.
  for (let attempt = 0; attempt < 50; attempt++) {
    const arr = [...pool];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j] as TeaId, arr[i] as TeaId];
    }
    const filled: TeaId[][] = [arr.slice(0, 4), arr.slice(4, 8), arr.slice(8, 12), arr.slice(12, 16)];
    if (filled.some((cup) => cup.every((l) => l === cup[0]))) continue;
    if (candidate === 'linked-gate') {
      const { source, valve } = g26LinkedConstraints();
      return {
        cups: [...filled.map((c) => [...c]), [], []],
        constraints: [{ mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, source, valve],
      };
    }
    const special = g26SpecialConstraint(candidate);
    return {
      cups: [...filled.map((c) => [...c]), [], []],
      constraints: [{ mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, { mode: 'normal' }, special, { mode: 'normal' }],
    };
  }
  throw new Error(`dealG26Board: could not deal mixed board for ${seedStr}`);
}

export interface G26BoardResult {
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
  // Candidate-specific causal flags (FULL optimal replay).
  causal: boolean;
  canonicalCausal: boolean;
  // Control divergence: optimal CONTROL replay under FULL diverges/blocks.
  controlDiverges: boolean;
  firstDivergenceStep: number | null;
  // Shared.
  ignored: boolean; // optimal FULL never uses special source
  specialSourceMoves: number;
  totalMoves: number;
  causalDepthRatio: number | null; // first causal step / total
  // A extras.
  bottomRunHistogram?: number[];
  bottomTopDifferRate?: number;
  // B extras.
  pressureSteps?: number;
  // C extras.
  valveNeverUsed?: boolean;
}

function applyAction(board: PuzzleState, action: SolverAction, constraints: readonly CupConstraint[]): PuzzleState | null {
  const res = applyPuzzleActionState(board, action as never, constraints);
  return res ? res.state : null;
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

export function analyzeG26Board(seed: string, candidate: G26Candidate): G26BoardResult {
  const { cups, constraints } = dealG26Board(seed, candidate);
  const control = g26ControlConstraints(constraints);
  const t0 = Date.now();
  const full = solvePuzzle(cups, { cupConstraints: constraints });
  const fullMs = Date.now() - t0;
  const t1 = Date.now();
  const ctrl = solvePuzzle(cups, { cupConstraints: control });
  const controlMs = Date.now() - t1;

  const base: G26BoardResult = {
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
    ignored: true,
    specialSourceMoves: 0,
    totalMoves: full.solution?.length ?? 0,
    causalDepthRatio: null,
  };
  if (!full.solvable || !full.solution) return base;

  // Replay FULL optimal under FULL, collecting causal events.
  let board = boardFrom(cups);
  const fullKey0 = canonicalPuzzleKey(board, constraints);
  void fullKey0;
  let causalStep: number | null = null;
  let specialMoves = 0;
  // B: track pressure before unlock.
  let bSawPressure = false;
  let bPressureStep = -1;
  // C: track pressure/release.
  let cSawPressure = false;
  // A: bottom-run histogram over special source actions.
  const aRuns: number[] = [];
  let aTopDifferCount = 0;
  let aSpecialActions = 0;

  // Identify special index (A/B) or S index (C).
  let specialIdx = -1;
  if (candidate === 'bottom-draw' || candidate === 'pair-ready') specialIdx = 4;
  const sIdx = candidate === 'linked-gate' ? 4 : -1;

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

    if (candidate === 'bottom-draw' && from === specialIdx) {
      specialMoves++;
      aSpecialActions++;
      const layers = preCups[from] as TeaId[];
      const bottomTea = bottomLayerOf(layers);
      const topTea = topLayerOf(layers);
      if (bottomTea !== topTea) aTopDifferCount++;
      aRuns.push(bottomRunCountOf(layers));
      // BOTTOM_UNIQUE_ACCESS: bottom != top, FULL uses bottom, CONTROL would use different top.
      if (bottomTea !== null && topTea !== null && bottomTea !== topTea) {
        // CONTROL same action would choose topTea; resulting states differ?
        // Verify: CONTROL legality may differ (color) or resulting state differs.
        const ctrlCode = pourRejectCodeState({ cups: preCups }, from, to, control);
        const fullCode = pourRejectCodeState({ cups: preCups }, from, to, constraints);
        void fullCode;
        // Compute CONTROL resulting state if legal.
        const ctrlRes = applyPourState({ cups: preCups }, from, to, control);
        const fullRes = applyPourState({ cups: preCups }, from, to, constraints);
        const differ =
          ctrlCode !== 'ok' || !ctrlRes || !fullRes || JSON.stringify(ctrlRes.state.cups) !== JSON.stringify(fullRes.state.cups);
        if (differ && causalStep === null) {
          causalStep = step;
          base.causal = true;
        }
      }
    }
    if (candidate === 'pair-ready' && from === specialIdx) {
      specialMoves++;
      if (causalStep === null && bSawPressure) {
        // This source action after pressure => unlock => causal.
        causalStep = step;
        base.causal = true;
      }
    }
    // B pressure detection on every FULL state BEFORE the action:
    if (candidate === 'pair-ready' && specialIdx !== -1) {
      const layers = preCups[specialIdx] as TeaId[];
      if (layers.length > 0 && topCountOf(layers) !== 2) {
        const fullBlocks = pourRejectCodeState({ cups: preCups }, specialIdx, (preCups.length + 1) % preCups.length, constraints);
        void fullBlocks;
        // Pressure if CONTROL has at least one legal source pour from special but FULL blocks all?
        let controlHasLegal = false;
        let fullBlocksAll = true;
        for (let t = 0; t < preCups.length; t++) {
          if (t === specialIdx) continue;
          if (pourRejectCodeState({ cups: preCups }, specialIdx, t, control) === 'ok') controlHasLegal = true;
          if (pourRejectCodeState({ cups: preCups }, specialIdx, t, constraints) === 'ok') fullBlocksAll = false;
        }
        if (controlHasLegal && fullBlocksAll && !bSawPressure) {
          bSawPressure = true;
          bPressureStep = step;
        }
      }
    }
    if (candidate === 'linked-gate' && from === sIdx) {
      specialMoves++;
      if (cSawPressure && causalStep === null) {
        causalStep = step;
        base.causal = true;
      }
    }
    if (candidate === 'linked-gate' && sIdx !== -1) {
      const sLayers = preCups[sIdx] as TeaId[];
      const vIdx = findLinkedValveIndex(constraints, sIdx);
      const vLayers = vIdx !== -1 ? (preCups[vIdx] as TeaId[]) : [];
      if (sLayers.length > 0 && vLayers.length > 0 && !cSawPressure) {
        // Pressure if CONTROL can source S but FULL blocks.
        let controlCan = false;
        let fullCan = false;
        for (let t = 0; t < preCups.length; t++) {
          if (t === sIdx) continue;
          if (pourRejectCodeState({ cups: preCups }, sIdx, t, control) === 'ok') controlCan = true;
          if (pourRejectCodeState({ cups: preCups }, sIdx, t, constraints) === 'ok') fullCan = true;
        }
        if (controlCan && !fullCan) cSawPressure = true;
      }
    }

    const next = applyAction(board, action, constraints);
    if (!next) break;
    board = next;
  }
  base.specialSourceMoves = specialMoves;
  base.ignored = specialMoves === 0;
  if (causalStep !== null) base.causalDepthRatio = (causalStep + 1) / Math.max(1, full.solution.length);
  base.bottomRunHistogram = aRuns;
  if (aSpecialActions > 0) base.bottomTopDifferRate = aTopDifferCount / aSpecialActions;
  if (candidate === 'pair-ready') base.pressureSteps = bSawPressure ? 1 : 0;
  void bPressureStep;

  // Canonical causal: same but require canonical key divergence? For G26,
  // use state-key difference as canonical (FULL vs CONTROL next-state keys differ).
  base.canonicalCausal = base.causal;

  // Control divergence: replay optimal CONTROL solution under FULL.
  if (ctrl.solvable && ctrl.solution) {
    let cboard = boardFrom(cups);
    for (let step = 0; step < ctrl.solution.length; step++) {
      const action = ctrl.solution[step] as SolverAction;
      if (action.kind !== 'pour') {
        const next = applyAction(cboard, action, constraints);
        if (!next) {
          base.controlDiverges = true;
          base.firstDivergenceStep = step;
          break;
        }
        cboard = next;
        continue;
      }
      const from = (action as { from: number }).from;
      const to = (action as { to: number }).to;
      const preCups = cboard.cups.map((c) => [...c]) as TeaId[][];
      const fullRes = applyPourState({ cups: preCups }, from, to, constraints);
      const ctrlRes = applyPourState({ cups: preCups }, from, to, control);
      if (!fullRes) {
        base.controlDiverges = true;
        base.firstDivergenceStep = step;
        break;
      }
      if (ctrlRes && JSON.stringify(fullRes.state.cups) !== JSON.stringify(ctrlRes.state.cups)) {
        base.controlDiverges = true;
        base.firstDivergenceStep = step;
        break;
      }
      const next = applyAction(cboard, action, constraints);
      if (!next) {
        base.controlDiverges = true;
        base.firstDivergenceStep = step;
        break;
      }
      cboard = next;
    }
  }

  // C valve use: check if V ever nonempty in FULL replay? Approximate via initial + solution?
  if (candidate === 'linked-gate') {
    // If special never used and V never used, valveNeverUsed true when no pour touches V.
    let touchesV = false;
    let vboard = boardFrom(cups);
    for (const action of full.solution) {
      if ((action as { kind: string }).kind !== 'pour') continue;
      const { from, to } = action as { from: number; to: number };
      if (from === 5 || to === 5) touchesV = true;
      const next = applyAction(vboard, action as SolverAction, constraints);
      if (!next) break;
      vboard = next;
    }
    base.valveNeverUsed = !touchesV;
  }
  return base;
}

export function summarize(results: G26BoardResult[]): Record<string, number | string> {
  const n = results.length;
  const solved = results.filter((r) => r.fullSolvable);
  const causal = results.filter((r) => r.causal);
  const ignored = results.filter((r) => r.fullSolvable && r.ignored);
  const diverged = results.filter((r) => r.controlDiverges);
  const fullVisited = solved.map((r) => r.fullVisited).sort((a, b) => a - b);
  const controlVisited = results.filter((r) => r.controlSolvable).map((r) => r.controlVisited).sort((a, b) => a - b);
  const fullMs = solved.map((r) => r.fullMs).sort((a, b) => a - b);
  const quant = (arr: number[], q: number): number => (arr.length === 0 ? 0 : (arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] as number));
  const mults = solved
    .map((r) => {
      const c = results.find((x) => x.seed === r.seed);
      void c;
      return r.fullVisited / Math.max(1, r.controlVisited);
    })
    .sort((a, b) => a - b);
  return {
    n,
    solvability: solved.length / Math.max(1, n),
    causalRate: causal.length / Math.max(1, n),
    causalPerSolved: causal.length / Math.max(1, solved.length),
    canonicalCausal: causal.length,
    ignoredRate: ignored.length / Math.max(1, solved.length),
    controlDivergenceRate: diverged.length / Math.max(1, solved.length),
    visitedP50: quant(fullVisited, 0.5),
    visitedP95: quant(fullVisited, 0.95),
    solverMsP50: quant(fullMs, 0.5),
    solverMsP95: quant(fullMs, 0.95),
    stateMultP50: quant(mults, 0.5),
    stateMultP95: quant(mults, 0.95),
    stateMultMax: mults.length > 0 ? mults[mults.length - 1] : 0,
    truncation: results.filter((r) => r.fullTruncated).length,
  };
}
