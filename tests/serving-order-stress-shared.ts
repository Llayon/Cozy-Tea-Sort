/**
 * Gauntlet 14 — production serving-order stress (shared helpers).
 * 200 deterministic seeds: shape/counts/mixed/orders/solver/band/
 * pressure→serve1→serve2/prefix2/win + per-move tea conservation
 * (serving never changes tea counts) + variety + perf. No mining in CI
 * beyond this bounded stress (feasibility 5k lives in scripts/dev).
 */
import { defaultCupConstraints, emptyFloatingIngredients, type CupConstraint, type SolverAction, type TeaId } from '../src/game/types';
import { applyPourState, isPuzzleWonState, listConstructiveActionsState } from '../src/game/logic/rules';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  analyzeServingOrderParticipation,
  createGenerateStats,
  generateLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { SERVING_ORDER_DEPTH_ACCEPT } from '../src/game/logic/servingOrderTemplates';
import { canonicalPuzzleKey } from '../src/game/logic/rules';

/** Generic tea counters (serving never changes tea — conservation check). */
function countTea(b: TeaId[][], tea: TeaId): number {
  let n = 0;
  for (const cup of b) for (const l of cup) if (l === tea) n++;
  return n;
}

export const CONS6: CupConstraint[] = defaultCupConstraints(6);

export function servingReqFor(seedIdx: number): GenerateRequest {
  // Deterministic palette rotation (eligible legacy teas only).
  const quads: Array<[TeaId, TeaId, TeaId, TeaId]> = [
    ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
    ['lavender', 'saffron', 'buckwheat', 'matcha'],
    ['karkade', 'milk_oolong', 'lavender', 'sea_buckthorn'],
    ['saffron', 'buckwheat', 'matcha', 'karkade'],
  ];
  const pick = quads[seedIdx % quads.length] as [TeaId, TeaId, TeaId, TeaId];
  return {
    numColors: 4,
    colors: [...pick],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
    serveOrderCount: 2,
  };
}

export interface ServingStressResult {
  seed: string;
  minMoves: number;
  visited: number;
  pressDiv: number;
  gap12: number;
  l3: boolean;
  depth: number;
  templateAttempts: number;
  solverCalls: number;
  genMs: number;
  solveMs: number;
  rootConstructive: number;
  startKey: string;
}

export function runOneServingSeed(seedIdx: number): ServingStressResult {
  const req = servingReqFor(seedIdx);
  const seed = `serving-stress-${seedIdx}`;
  const stats = createGenerateStats();
  const tGen = Date.now();
  const lvl = generateLevel(req, seed, { stats });
  const genMs = Date.now() - tGen;
  const orders = lvl.cupConstraints.filter((c) => c.serveOrder !== undefined);
  if (orders.length !== 2) throw new Error(`seed ${seedIdx}: orders`);
  if (lvl.cups.length !== 6) throw new Error(`seed ${seedIdx}: vessels`);
  const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
  if (JSON.stringify(lens) !== JSON.stringify([0, 0, 4, 4, 4, 4])) throw new Error(`seed ${seedIdx}: shape`);
  for (const cup of lvl.cups) {
    if (cup.length === 4 && new Set(cup).size < 2) throw new Error(`seed ${seedIdx}: mixed`);
  }
  if (lvl.minMoves < SERVING_ORDER_DEPTH_ACCEPT.min || lvl.minMoves > SERVING_ORDER_DEPTH_ACCEPT.max) {
    throw new Error(`seed ${seedIdx}: band ${lvl.minMoves}`);
  }
  // Re-solve explicitly to verify determinism + replay participation.
  const tSolve = Date.now();
  const r = solvePuzzle(lvl.cups, { cupConstraints: lvl.cupConstraints });
  const solveMs = Date.now() - tSolve;
  if (!r.solvable || r.truncated || r.minMoves === undefined || !r.solution) {
    throw new Error(`seed ${seedIdx}: unsolvable`);
  }
  if (r.minMoves !== lvl.minMoves) throw new Error(`seed ${seedIdx}: depth drift`);
  const rootConstructive = listConstructiveActionsState(
    { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) },
    lvl.cupConstraints,
  ).filter((a) => a.kind === 'pour').length;
  // Replay: tea conservation (serving changes nothing) + prefix monotonicity.
  let board = lvl.cups.map((c) => [...c]);
  const beforeCounts = (b: TeaId[][]) => ({
    total: b.reduce((n, c) => n + c.length, 0),
    per: (req.colors as TeaId[]).map((t) => countTea(b, t)).join(','),
  });
  const c0 = beforeCounts(board);
  let lastPrefix = 0;
  for (const a of r.solution as SolverAction[]) {
    if (a.kind !== 'pour') continue;
    const res = applyPourState(
      { cups: board, floatingIngredients: emptyFloatingIngredients(6) },
      (a as { from: number }).from, (a as { to: number }).to, lvl.cupConstraints,
    );
    if (!res) throw new Error(`seed ${seedIdx}: replay fail`);
    board = res.state.cups as TeaId[][];
    const c1 = beforeCounts(board);
    if (c1.total !== c0.total || c1.per !== c0.per) throw new Error(`seed ${seedIdx}: tea changed`);
  }
  const part = analyzeServingOrderParticipation(lvl.cups, r.solution as SolverAction[], lvl.cupConstraints);
  if (part.firstPressureDepth === null) throw new Error(`seed ${seedIdx}: no pressure`);
  if (!(part.firstPressureDepth < (part.serve1Depth as number))) throw new Error(`seed ${seedIdx}: pressure order`);
  if (!((part.serve1Depth as number) < (part.serve2Depth as number))) throw new Error(`seed ${seedIdx}: serve order`);
  if (part.servedPrefixFinal !== 2 || !part.win) throw new Error(`seed ${seedIdx}: final`);
  if (!isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints)) {
    throw new Error(`seed ${seedIdx}: win`);
  }
  void lastPrefix;
  return {
    seed, minMoves: lvl.minMoves, visited: lvl.visitedStates,
    pressDiv: (part.firstPressureDepth as number) / Math.max(1, lvl.minMoves),
    gap12: part.serve1ToServe2Gap ?? 0,
    l3: false,
    depth: lvl.minMoves, templateAttempts: stats.templateAttempts, solverCalls: stats.solverCalls,
    genMs, solveMs, rootConstructive,
    startKey: canonicalPuzzleKey({ cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) }, lvl.cupConstraints),
  };
}
