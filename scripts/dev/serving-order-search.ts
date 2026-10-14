/**
 * G14 serving-order feasibility sampler (DEV ONLY — never CI/production).
 *
 * Topology: 4c/6v/16u, layer counts 4,4,4,4,0,0; all four nonempty MIXED;
 * two ordered saucers (O1+O2 on two different full mixed cups, pair
 * sampled across filled positions); two ordinary empties; no specials.
 * Uses production solver/rules/canonicalization + explicit constraints.
 */
import {
  CupConstraint,
  TeaId,
  cloneCupConstraint,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  pourCountState,
  pourRejectCodeState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import { servedPrefixLength } from '../../src/game/logic/servingOrder.ts';

export const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
export const LENGTHS = [4, 4, 4, 4, 0, 0];
export const MAX_VISITED = 120_000;
export const MAX_DEPTH = 60;

export interface ServingOrderTrace {
  pressureStates: number;
  blockedCompletionCandidates: number;
  firstPressureDepth: number | null;
  serve1Depth: number | null;
  serve2Depth: number | null;
  pressureToServe1Gap: number | null;
  serve1ToServe2Gap: number | null;
  servedPrefixFinal: number;
  win: boolean;
}

export function consWithHosts(h1: number, h2: number): CupConstraint[] {
  return Array.from({ length: 6 }, (_, i) => (
    i === h1 ? { mode: 'normal', serveOrder: 1 }
    : i === h2 ? { mode: 'normal', serveOrder: 2 }
    : { mode: 'normal' as const }
  )) as CupConstraint[];
}

function plainCons(): CupConstraint[] {
  return Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
}

function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}

function isMixedFull(cup: TeaId[]): boolean {
  if (cup.length !== 4) return false;
  return new Set(cup).size >= 2;
}

export function shaped(s: number): { cups: TeaId[][]; h1: number; h2: number; attempts: number } {
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`serve-shaped-${s}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cups.push(p.slice(off, off + L)); off += L; }
    let mixed = true;
    for (let i = 0; i < 4; i++) {
      if (!isMixedFull(cups[i] as TeaId[])) { mixed = false; break; }
    }
    if (!mixed) continue;
    // Ordered host pair across the four filled positions (12 ordered pairs).
    const h1 = Math.floor(rng() * 4);
    let h2 = Math.floor(rng() * 3);
    if (h2 >= h1) h2++;
    return { cups, h1, h2, attempts: a + 1 };
  }
  throw new Error(`no shape ${s}`);
}

/** Strip serving orders (control constraints): same vessels, all ordinary. */
export function stripOrders(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { serveOrder?: number }).serveOrder;
    return n;
  });
}

/**
 * ORDER_PRESSURE probe at one replay state (prefix 0): counts sources S
 * whose ordinary control pour S → ② (orders stripped) is legal and would
 * complete ② full-homogeneous, while the ordered rules reject the same
 * action with `serve-order`. Any m (1–3) counts; no player attempt needed.
 */
export function pressureCandidates(
  cups: TeaId[][],
  h2: number,
  constraints: readonly CupConstraint[],
): number {
  const state = { cups, floatingIngredients: emptyFloatingIngredients(cups.length) };
  if (servedPrefixLength(state, constraints) !== 0) return 0;
  const dest = cups[h2] as TeaId[];
  if (dest.length === 4) return 0;
  const ctrl = stripOrders(constraints);
  let n = 0;
  for (let s = 0; s < cups.length; s++) {
    if (s === h2) continue;
    if (!canPourState(state, s, h2, ctrl)) continue;
    const m = pourCountState(state, s, h2, ctrl);
    if (m <= 0) continue;
    const src = cups[s] as TeaId[];
    const top = src[src.length - 1] as TeaId;
    const candidate = [...dest];
    for (let i = 0; i < m; i++) candidate.push(top);
    if (candidate.length !== 4 || !candidate.every((l) => l === top)) continue;
    if (pourRejectCodeState(state, s, h2, constraints) === 'serve-order') n++;
  }
  return n;
}

export function analyzeServingTrace(
  startCups: TeaId[][],
  h1: number,
  h2: number,
  solution: readonly SolverAction[],
  constraints: readonly CupConstraint[],
): ServingOrderTrace {
  let cups = startCups.map((c) => [...c]);
  const tr: ServingOrderTrace = {
    pressureStates: 0,
    blockedCompletionCandidates: 0,
    firstPressureDepth: null,
    serve1Depth: null,
    serve2Depth: null,
    pressureToServe1Gap: null,
    serve1ToServe2Gap: null,
    servedPrefixFinal: 0,
    win: false,
  };
  const st = () => ({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) });
  // Depth 0 = initial state, then after each move.
  for (let d = 0; d <= solution.length; d++) {
    if (d > 0) {
      const a = solution[d - 1] as SolverAction;
      if (a.kind !== 'pour') { cups = cups; continue; }
      const res = applyPourState(st(), a.from, a.to, constraints);
      if (!res) return tr;
      cups = res.state.cups as TeaId[][];
      if (res.serveCompleted === 1 && tr.serve1Depth === null) tr.serve1Depth = d - 1;
      if (res.serveCompleted === 2 && tr.serve2Depth === null) tr.serve2Depth = d - 1;
    }
    const cands = pressureCandidates(cups, h2, constraints);
    if (cands > 0) {
      tr.pressureStates++;
      tr.blockedCompletionCandidates += cands;
      if (tr.firstPressureDepth === null) tr.firstPressureDepth = d;
    }
  }
  tr.servedPrefixFinal = servedPrefixLength(st(), constraints);
  tr.win = isPuzzleWonState(st(), constraints);
  if (tr.firstPressureDepth !== null && tr.serve1Depth !== null) {
    tr.pressureToServe1Gap = tr.serve1Depth - tr.firstPressureDepth;
  }
  if (tr.serve1Depth !== null && tr.serve2Depth !== null) {
    tr.serve1ToServe2Gap = tr.serve2Depth - tr.serve1Depth;
  }
  return tr;
}

/** Plain-control completion order: first full-homogeneous depth per host. */
export function controlCompletionTimes(
  startCups: TeaId[][],
  solution: readonly SolverAction[],
  h1: number,
  h2: number,
): { first1: number | null; first2: number | null } {
  let cups = startCups.map((c) => [...c]);
  const cons = plainCons();
  let first1: number | null = null;
  let first2: number | null = null;
  const full = (cup: TeaId[]) => cup.length === 4 && cup.every((t) => t === cup[0]);
  solution.forEach((a, i) => {
    if ((a as SolverAction).kind !== 'pour') return;
    const res = applyPourState({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, (a as { from: number }).from, (a as { to: number }).to, cons);
    if (!res) return;
    cups = res.state.cups as TeaId[][];
    if (first1 === null && full(cups[h1] as TeaId[])) first1 = i;
    if (first2 === null && full(cups[h2] as TeaId[])) first2 = i;
  });
  return { first1, first2 };
}

function pct(a: number[], p: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function hist(a: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const v of a) h[String(v)] = (h[String(v)] ?? 0) + 1;
  return h;
}

const IS_SERVE_SEARCH_MAIN = ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('serving-order-search.ts'));
const N = IS_SERVE_SEARCH_MAIN ? Number(process.argv[2] ?? 5000) : 0;
const pairHist: Record<string, number> = {};
let solvable = 0;
let unsolv = 0;
let trunc = 0;
let l1 = 0;
let l2 = 0;
let l3a = 0;
let l3b = 0;
let l3 = 0;
let strong = 0;
const canonL2 = new Set<string>();
const canonL3 = new Set<string>();
const depths: number[] = [];
const l2depths: number[] = [];
const firstPD: number[] = [];
const serve1D: number[] = [];
const serve2D: number[] = [];
const pressDiv: number[] = [];
const serve1Div: number[] = [];
const serve2Div: number[] = [];
const gapPS1: number[] = [];
const gapS1S2: number[] = [];
const pressStates: number[] = [];
const blockedCands: number[] = [];
const visited: number[] = [];
const ms: number[] = [];
const plainVisited: number[] = [];
const plainMs: number[] = [];
const deltas: number[] = [];
let pSolv = 0;
let pUns = 0;
let pTrunc = 0;
let reverses = 0;
let deltaGt0 = 0;
let deltaGe2 = 0;

for (let s = 0; s < N; s++) {
  const { cups, h1, h2 } = shaped(s);
  const C = consWithHosts(h1, h2);
  pairHist[`${h1}>${h2}`] = (pairHist[`${h1}>${h2}`] ?? 0) + 1;
  const t0 = Date.now();
  const r = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  ms.push(Date.now() - t0);
  visited.push(r.visitedStates);
  if (r.truncated) { trunc++; continue; }
  if (!r.solvable || r.minMoves === undefined || !r.solution) { unsolv++; continue; }
  solvable++;
  depths.push(r.minMoves);
  const tr = analyzeServingTrace(cups, h1, h2, r.solution, C);
  const isL1 = tr.serve1Depth !== null && tr.serve2Depth !== null && tr.win && tr.servedPrefixFinal === 2;
  if (isL1) l1++;
  const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
  const isL2 = isL1 && tr.firstPressureDepth !== null && tr.serve1Depth !== null && tr.serve2Depth !== null &&
    (tr.firstPressureDepth as number) < (tr.serve1Depth as number) &&
    (tr.serve1Depth as number) < (tr.serve2Depth as number) && early;
  // Plain control on the same layout (orders stripped).
  const pc0 = Date.now();
  const rc = solvePuzzle(cups, { cupConstraints: plainCons(), maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  plainMs.push(Date.now() - pc0);
  plainVisited.push(rc.visitedStates);
  let delta: number | null = null;
  let rev = false;
  if (!rc.truncated && rc.solvable && rc.minMoves !== undefined && rc.solution) {
    pSolv++;
    delta = (r.minMoves as number) - (rc.minMoves as number);
    deltas.push(delta);
    const ct = controlCompletionTimes(cups, rc.solution, h1, h2);
    rev = ct.first2 !== null && (ct.first1 === null || (ct.first2 as number) < (ct.first1 as number));
    if (rev) reverses++;
    if (delta > 0) deltaGt0++;
    if (delta >= 2) deltaGe2++;
  } else if (rc.truncated) pTrunc++;
  else pUns++;
  if (!isL2) continue;
  l2++;
  l2depths.push(r.minMoves);
  if (tr.firstPressureDepth !== null) {
    firstPD.push(tr.firstPressureDepth);
    pressDiv.push(tr.firstPressureDepth / Math.max(1, r.minMoves));
  }
  if (tr.serve1Depth !== null) {
    serve1D.push(tr.serve1Depth);
    serve1Div.push(tr.serve1Depth / Math.max(1, r.minMoves));
  }
  if (tr.serve2Depth !== null) {
    serve2D.push(tr.serve2Depth);
    serve2Div.push(tr.serve2Depth / Math.max(1, r.minMoves));
  }
  if (tr.pressureToServe1Gap !== null) gapPS1.push(tr.pressureToServe1Gap);
  if (tr.serve1ToServe2Gap !== null) gapS1S2.push(tr.serve1ToServe2Gap);
  pressStates.push(tr.pressureStates);
  blockedCands.push(tr.blockedCompletionCandidates);
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, C);
  canonL2.add(key);
  const isA = rev;
  const isB = delta !== null && delta > 0;
  if (isA) l3a++;
  if (isB) l3b++;
  if (isA || isB) { l3++; canonL3.add(key); }
  if (delta !== null && delta >= 2) strong++;
  if ((s + 1) % 500 === 0) console.log(`shaped ${s + 1}/${N} L2=${l2} L3=${l3} solv=${solvable}`);
}

if (IS_SERVE_SEARCH_MAIN) {
console.log(`\n===== SERVING-ORDER N=${N} =====`);
console.log(`shaped=${N} solv=${solvable} unsolv=${unsolv} trunc=${trunc} truncRate=${(100 * trunc / Math.max(1, N)).toFixed(2)}%`);
console.log(`pairs=${JSON.stringify(pairHist)}`);
console.log(`L1=${l1} L2=${l2} (rate=${(100 * l2 / Math.max(1, N)).toFixed(2)}%) L3A=${l3a} L3B=${l3b} L3=${l3} overlap=${l3a + l3b - l3} strong=${strong} canonL2=${canonL2.size} canonL3=${canonL3.size}`);
console.log(`depths n=${depths.length} min=${depths.length ? Math.min(...depths) : 'n/a'} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 'n/a'} hist=${JSON.stringify(hist(depths))}`);
console.log(`L2depths hist=${JSON.stringify(hist(l2depths))}`);
console.log(`firstPressure p50=${pct(firstPD, 50)} p95=${pct(firstPD, 95)} serve1 p50=${pct(serve1D, 50)} p95=${pct(serve1D, 95)} serve2 p50=${pct(serve2D, 50)} p95=${pct(serve2D, 95)}`);
console.log(`pressure/minMoves p50=${pct(pressDiv, 50)} p95=${pct(pressDiv, 95)} serve1/minMoves p50=${pct(serve1Div, 50)} p95=${pct(serve1Div, 95)} serve2/minMoves p50=${pct(serve2Div, 50)} p95=${pct(serve2Div, 95)}`);
console.log(`gapP→S1 hist=${JSON.stringify(hist(gapPS1))} gapS1→S2 hist=${JSON.stringify(hist(gapS1S2))}`);
console.log(`pressureStates p50=${pct(pressStates, 50)} blockedCands p50=${pct(blockedCands, 50)}`);
console.log(`control: plainSolv=${pSolv} plainUnsolv=${pUns} plainTrunc=${pTrunc} delta p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 'n/a'} min=${deltas.length ? Math.min(...deltas) : 'n/a'}`);
console.log(`reverses=${reverses} (${(100 * reverses / Math.max(1, pSolv)).toFixed(1)}% of plain-solved) delta>0=${deltaGt0} delta>=2=${deltaGe2}`);
console.log(`ordered visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${visited.length ? Math.max(...visited) : 'n/a'} ms p50=${pct(ms, 50)} p95=${pct(ms, 95)} max=${ms.length ? Math.max(...ms) : 'n/a'}`);
console.log(`plain visited p50=${pct(plainVisited, 50)} p95=${pct(plainVisited, 95)} max=${plainVisited.length ? Math.max(...plainVisited) : 'n/a'} ms p50=${pct(plainMs, 50)} p95=${pct(plainMs, 95)} max=${ms.length ? Math.max(...plainMs) : 'n/a'}`);
console.log(canonL2.size >= 30 ? 'CORRECTNESS GATE PASS (>=30 canon L2)' : 'CORRECTNESS GATE FAIL (<30 canon L2)');
}
