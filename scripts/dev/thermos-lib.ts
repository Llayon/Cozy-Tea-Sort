/**
 * G10 thermos feasibility sampler (DEV ONLY — never CI/production).
 * Deterministic shaped deals, production solver/canonical/rules.
 * Profiles T2 (thermos len2) and T3 (thermos len3), 4c/6v/16u, 4,4,3,3,2,0.
 */
import {
  CupConstraint,
  TeaId,
  emptyFloatingIngredients,
  normalizeFloatingIngredients,
  normalizeIceSlots,
  normalizeSinkingIngredients,
  normalizeStrainerState,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle, SolverAction } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';

export const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
export const THERMOS_IDX = 5;
export const MAX_VISITED = 120_000;
export const MAX_DEPTH = 60;

export interface ThermosTrace {
  receives: number;
  sourceUses: number;
  fifthSlotUses: number;
  drainsAfterFifth: number;
  maxOccupancy: number;
  firstReceiveDepth: number | null;
  firstFifthSlotDepth: number | null;
  firstDrainAfterFifthDepth: number | null;
  firstEmptyAfterFifthDepth: number | null;
  finalThermosEmpty: boolean;
  win: boolean;
}

export function thermosConstraints(): CupConstraint[] {
  const cs: CupConstraint[] = [];
  for (let i = 0; i < 6; i++) cs.push({ mode: 'normal' });
  cs[THERMOS_IDX] = { mode: 'normal', capacity: 5, mustEndEmpty: true };
  return cs;
}

export function cap4ControlConstraints(): CupConstraint[] {
  const cs: CupConstraint[] = [];
  for (let i = 0; i < 6; i++) cs.push({ mode: 'normal' });
  cs[THERMOS_IDX] = { mode: 'normal', capacity: 4, mustEndEmpty: true };
  return cs;
}

export function lengthsFor(profile: 'T2' | 'T3'): number[] {
  // index 5 = thermos
  if (profile === 'T2') return [4, 4, 3, 3, 0, 2];
  return [4, 4, 3, 2, 0, 3];
}

function poolFor(): TeaId[] {
  const pool: TeaId[] = [];
  for (const c of PALETTE) for (let k = 0; k < 4; k++) pool.push(c);
  return pool;
}

function meetsThermosProfile(cups: TeaId[][], profile: 'T2' | 'T3'): boolean {
  const t = cups[THERMOS_IDX] as TeaId[];
  const wantLen = profile === 'T2' ? 2 : 3;
  if (t.length !== wantLen) return false;
  if (new Set(t).size < 2) return false;
  const top = t[t.length - 1] as TeaId;
  const inside = t.filter((x) => x === top).length;
  if (inside !== 1) return false;
  return true;
}

export function makeShapedDeal(profile: 'T2' | 'T3', shapedIndex: number): { cups: TeaId[][]; attempts: number } {
  const lengths = lengthsFor(profile);
  let attempts = 0;
  for (let a = 0; a < 500; a++) {
    attempts++;
    const rng = createRng(`${profile}-shaped-${shapedIndex}-try-${a}`);
    const pool = poolFor();
    shuffleInPlace(rng, pool);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of lengths) {
      cups.push(pool.slice(off, off + L));
      off += L;
    }
    if (meetsThermosProfile(cups, profile)) return { cups, attempts };
  }
  throw new Error(`makeShapedDeal: could not shape ${profile} #${shapedIndex}`);
}

export function analyzeThermosTrace(
  startCups: TeaId[][],
  solution: readonly SolverAction[],
  constraints: readonly CupConstraint[],
): ThermosTrace {
  let cups = startCups.map((c) => [...c]);
  const tr: ThermosTrace = {
    receives: 0,
    sourceUses: 0,
    fifthSlotUses: 0,
    drainsAfterFifth: 0,
    maxOccupancy: (cups[THERMOS_IDX] as TeaId[]).length,
    firstReceiveDepth: null,
    firstFifthSlotDepth: null,
    firstDrainAfterFifthDepth: null,
    firstEmptyAfterFifthDepth: null,
    finalThermosEmpty: false,
    win: false,
  };
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const to = (a as { to: number }).to;
    const before = (cups[THERMOS_IDX] as TeaId[]).length;
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
      from,
      to,
      constraints,
    );
    if (!res) return tr;
    cups = res.state.cups as TeaId[][];
    const after = (cups[THERMOS_IDX] as TeaId[]).length;
    tr.maxOccupancy = Math.max(tr.maxOccupancy, after);
    if (to === THERMOS_IDX) {
      tr.receives++;
      if (tr.firstReceiveDepth === null) tr.firstReceiveDepth = i;
      if (before === 4 && after === 5) {
        tr.fifthSlotUses++;
        if (tr.firstFifthSlotDepth === null) tr.firstFifthSlotDepth = i;
      }
    }
    if (from === THERMOS_IDX) {
      tr.sourceUses++;
      if (tr.firstFifthSlotDepth !== null && i > (tr.firstFifthSlotDepth as number) && after < 5) {
        tr.drainsAfterFifth++;
        if (tr.firstDrainAfterFifthDepth === null) tr.firstDrainAfterFifthDepth = i;
      }
    }
    if (tr.firstFifthSlotDepth !== null && i > (tr.firstFifthSlotDepth as number) && after === 0 && tr.firstEmptyAfterFifthDepth === null) {
      tr.firstEmptyAfterFifthDepth = i;
    }
  }
  tr.finalThermosEmpty = (cups[THERMOS_IDX] as TeaId[]).length === 0;
  tr.win = isPuzzleWonState({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, constraints);
  return tr;
}

function pct(arr: number[], p: number): number | null {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.floor((p / 100) * s.length));
  return s[idx] as number;
}

function hist(arr: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const v of arr) h[String(v)] = (h[String(v)] ?? 0) + 1;
  return h;
}

export interface ProfileResult {
  profile: string;
  targetShaped: number;
  sampleAttempts: number;
  shaped: number;
  solvable: number;
  unsolvable: number;
  truncated: number;
  l1: number;
  l2: number;
  l3: number;
  strongL3: number;
  canonL2: number;
  canonL3: number;
  depths: number[];
  maxOcc: number[];
  fifthUses: number[];
  firstFifth: number[];
  firstDrain: number[];
  fifthDivMoves: number[];
  drainDivMoves: number[];
  finalEmptyRate: number;
  visited: number[];
  solverMs: number[];
  // cap4
  cap4solvable: number;
  cap4unsolvable: number;
  cap4truncated: number;
  deltas: number[];
  strictlyShorter: number;
  ge2Shorter: number;
  rescue: number;
  // quality
  fifthOnMove1: number;
  fifthFirst25: number;
  fifthMid50: number;
  fifthFinal25: number;
  reach5once: number;
  reach5multi: number;
  drainImmediate: number;
  drainDelayed2: number;
  l2entries: Array<{ cups: TeaId[][]; minMoves: number; key: string; trace: ThermosTrace; cap4min?: number; cap4solv?: boolean }>;
}

export async function runProfile(profile: 'T2' | 'T3', targetShaped: number, logEvery = 500): Promise<ProfileResult> {
  const cons = thermosConstraints();
  const consCap4 = cap4ControlConstraints();
  const R: ProfileResult = {
    profile, targetShaped, sampleAttempts: 0, shaped: 0,
    solvable: 0, unsolvable: 0, truncated: 0, l1: 0, l2: 0, l3: 0, strongL3: 0,
    canonL2: 0, canonL3: 0, depths: [], maxOcc: [], fifthUses: [],
    firstFifth: [], firstDrain: [], fifthDivMoves: [], drainDivMoves: [],
    finalEmptyRate: 0, visited: [], solverMs: [],
    cap4solvable: 0, cap4unsolvable: 0, cap4truncated: 0, deltas: [],
    strictlyShorter: 0, ge2Shorter: 0, rescue: 0,
    fifthOnMove1: 0, fifthFirst25: 0, fifthMid50: 0, fifthFinal25: 0,
    reach5once: 0, reach5multi: 0, drainImmediate: 0, drainDelayed2: 0,
    l2entries: [],
  };
  const canonL2set = new Set<string>();
  const canonL3set = new Set<string>();
  let finalEmptyCount = 0;
  for (let s = 0; s < targetShaped; s++) {
    const { cups, attempts } = makeShapedDeal(profile, s);
    R.sampleAttempts += attempts;
    R.shaped++;
    const t0 = Date.now();
    const r = solvePuzzle(cups, { cupConstraints: cons, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    const ms = Date.now() - t0;
    R.solverMs.push(ms);
    R.visited.push(r.visitedStates);
    if (r.truncated) { R.truncated++; continue; }
    if (!r.solvable || r.minMoves === undefined || !r.solution) { R.unsolvable++; continue; }
    R.solvable++;
    R.l1++; // thermos exists + win (solvable implies win via solution)
    R.depths.push(r.minMoves);
    const trace = analyzeThermosTrace(cups, r.solution, cons);
    R.maxOcc.push(trace.maxOccupancy);
    if (trace.finalThermosEmpty) finalEmptyCount++;
    const isL2 = trace.fifthSlotUses >= 1 && trace.drainsAfterFifth >= 1 && trace.finalThermosEmpty && trace.win;
    if (trace.fifthSlotUses >= 1) {
      R.fifthUses.push(trace.fifthSlotUses);
    }
    if (trace.firstFifthSlotDepth !== null) R.firstFifth.push(trace.firstFifthSlotDepth);
    if (trace.firstDrainAfterFifthDepth !== null) R.firstDrain.push(trace.firstDrainAfterFifthDepth);
    if (trace.firstFifthSlotDepth !== null && r.minMoves > 0) R.fifthDivMoves.push(trace.firstFifthSlotDepth / r.minMoves);
    if (trace.firstDrainAfterFifthDepth !== null && r.minMoves > 0) R.drainDivMoves.push(trace.firstDrainAfterFifthDepth / r.minMoves);
    if (!isL2) continue;
    R.l2++;
    const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, cons);
    canonL2set.add(key);
    R.fifthUses; // already
    // quality diagnostics among L2
    if (trace.firstFifthSlotDepth === 0) R.fifthOnMove1++;
    if (trace.firstFifthSlotDepth !== null) {
      const frac = trace.firstFifthSlotDepth / Math.max(1, r.minMoves);
      if (frac < 0.25) R.fifthFirst25++;
      else if (frac < 0.75) R.fifthMid50++;
      else R.fifthFinal25++;
    }
    if (trace.fifthSlotUses === 1) R.reach5once++; else if (trace.fifthSlotUses > 1) R.reach5multi++;
    if (trace.firstFifthSlotDepth !== null && trace.firstDrainAfterFifthDepth !== null) {
      const gap = trace.firstDrainAfterFifthDepth - trace.firstFifthSlotDepth;
      if (gap === 1) R.drainImmediate++;
      if (gap >= 3) R.drainDelayed2++; // >=2 intervening moves means gap>=3? gap=1 immediate, gap=2 one intervening, gap>=3 two+ intervening
    }
    // cap4 control
    const rc = solvePuzzle(cups, { cupConstraints: consCap4, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    let cap4min: number | undefined;
    let cap4solv = false;
    if (rc.truncated) { R.cap4truncated++; }
    else if (rc.solvable && rc.minMoves !== undefined) {
      R.cap4solvable++; cap4solv = true; cap4min = rc.minMoves;
      const delta = (rc.minMoves as number) - (r.minMoves as number);
      R.deltas.push(delta);
      if (delta > 0) R.strictlyShorter++;
      if (delta >= 2) R.ge2Shorter++;
    } else { R.cap4unsolvable++; R.rescue++; }
    const isL3 = (!rc.solvable && !rc.truncated) || (rc.solvable && !rc.truncated && (rc.minMoves as number) > (r.minMoves as number));
    // Note: truncated cap4 does NOT count as L3 evidence per spec
    if (isL3) {
      R.l3++;
      canonL3set.add(key);
      const strong = (!rc.solvable && !rc.truncated) || (rc.solvable && !rc.truncated && (rc.minMoves as number) >= (r.minMoves as number) + 2);
      if (strong) R.strongL3++;
    }
    R.l2entries.push({ cups: cups.map((c) => [...c]), minMoves: r.minMoves as number, key, trace, cap4min, cap4solv });
    if ((s + 1) % logEvery === 0) console.log(`[${profile}] shaped ${s + 1}/${targetShaped} L2=${R.l2} L3=${R.l3} solv=${R.solvable}`);
  }
  R.canonL2 = canonL2set.size;
  R.canonL3 = canonL3set.size;
  R.finalEmptyRate = R.solvable > 0 ? finalEmptyCount / R.solvable : 0;
  return R;
}

function fmtArr(a: number[]): string {
  if (a.length === 0) return 'n/a';
  return `n=${a.length} min=${Math.min(...a)} p50=${pct(a, 50)} p95=${pct(a, 95)} max=${Math.max(...a)}`;
}

export function printResult(R: ProfileResult): void {
  console.log(`\n===== PROFILE ${R.profile} =====`);
  console.log(`sampleAttempts=${R.sampleAttempts} shaped=${R.shaped} solvable=${R.solvable} unsolvable=${R.unsolvable} truncated=${R.truncated}`);
  console.log(`L1=${R.l1} L2=${R.l2} L3=${R.l3} StrongL3=${R.strongL3} canonL2=${R.canonL2} canonL3=${R.canonL3}`);
  console.log(`depths: ${fmtArr(R.depths)} hist=${JSON.stringify(hist(R.depths))}`);
  console.log(`maxOcc: ${fmtArr(R.maxOcc)} hist=${JSON.stringify(hist(R.maxOcc))}`);
  console.log(`fifthUses: ${fmtArr(R.fifthUses)} hist=${JSON.stringify(hist(R.fifthUses))}`);
  console.log(`firstFifth: ${fmtArr(R.firstFifth)}`);
  console.log(`firstDrain: ${fmtArr(R.firstDrain)}`);
  console.log(`fifth/minMoves: n=${R.fifthDivMoves.length} p50=${pct(R.fifthDivMoves, 50)} p95=${pct(R.fifthDivMoves, 95)}`);
  console.log(`drain/minMoves: n=${R.drainDivMoves.length} p50=${pct(R.drainDivMoves, 50)} p95=${pct(R.drainDivMoves, 95)}`);
  console.log(`finalEmptyRate=${R.finalEmptyRate.toFixed(3)}`);
  console.log(`visited: ${fmtArr(R.visited)}`);
  console.log(`solverMs: ${fmtArr(R.solverMs)}`);
  console.log(`cap4: solv=${R.cap4solvable} unsolv=${R.cap4unsolvable} trunc=${R.cap4truncated} deltas: ${fmtArr(R.deltas)} hist=${JSON.stringify(hist(R.deltas))}`);
  console.log(`strictlyShorter=${R.strictlyShorter} ge2=${R.ge2Shorter} rescue=${R.rescue}`);
  if (R.l2 > 0) {
    console.log(`quality (denom L2=${R.l2}): fifthOnMove1=${R.fifthOnMove1} (${(100 * R.fifthOnMove1 / R.l2).toFixed(1)}%) first25=${R.fifthFirst25} mid50=${R.fifthMid50} final25=${R.fifthFinal25} once=${R.reach5once} multi=${R.reach5multi} drainImmediate=${R.drainImmediate} drainDelayed2+=${R.drainDelayed2}`);
  }
  const pass = R.canonL2 >= 30 ? 'PASS' : 'FAIL';
  console.log(`GATE: canonL2=${R.canonL2} (need >=30) => ${pass}; canonL3=${R.canonL3} (prefer >=10)`);
}
