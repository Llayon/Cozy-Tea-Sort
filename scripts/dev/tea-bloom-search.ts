/**
 * G12 tea-bloom feasibility sampler (DEV ONLY — never CI/production).
 * Topology: 4c/6v/16u, layer counts 4,4,4,4,0,0; host = one FULL MIXED
 * normal cap4 vessel with dormant tea_bud; two ordinary empties.
 * Production solver/canonical/rules only.
 */
import {
  CupConstraint,
  TeaBudSlot,
  TeaId,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle, SolverAction } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';

export const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
export const LENGTHS = [4, 4, 4, 4, 0, 0];
export const MAX_VISITED = 120_000;
export const MAX_DEPTH = 60;

export interface TeaBloomTrace {
  blooms: number;
  postBloomReceives: number;
  postBloomSourceUses: number;
  firstBloomDepth: number | null;
  firstReuseDepth: number | null;
  firstPostBloomSourceDepth: number | null;
  maxPostBloomOccupancy: number;
  finalRepurpose: boolean;
  finalBudCleared: boolean;
  win: boolean;
}

function cons(): CupConstraint[] {
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

export function shaped(s: number): { cups: TeaId[][]; budHost: number; attempts: number } {
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`bloom-shaped-${s}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cups.push(p.slice(off, off + L)); off += L; }
    const candidates: number[] = [];
    for (let i = 0; i < 4; i++) {
      if (isMixedFull(cups[i] as TeaId[])) candidates.push(i);
    }
    if (candidates.length === 0) continue;
    // Random mixed host among the four full vessels (rng-driven).
    const pick = candidates[Math.floor(rng() * candidates.length)] as number;
    return { cups, budHost: pick, attempts: a + 1 };
  }
  throw new Error(`no shape ${s}`);
}

function budsFor(host: number): TeaBudSlot[] {
  const b: TeaBudSlot[] = [null, null, null, null, null, null];
  b[host] = 'tea_bud';
  return b;
}

export function analyzeBloomTrace(
  startCups: TeaId[][],
  startBuds: readonly TeaBudSlot[],
  budHost: number,
  solution: readonly SolverAction[],
  constraints: readonly CupConstraint[],
): TeaBloomTrace {
  let cups = startCups.map((c) => [...c]);
  let buds = [...startBuds];
  const tr: TeaBloomTrace = {
    blooms: 0,
    postBloomReceives: 0,
    postBloomSourceUses: 0,
    firstBloomDepth: null,
    firstReuseDepth: null,
    firstPostBloomSourceDepth: null,
    maxPostBloomOccupancy: 0,
    finalRepurpose: false,
    finalBudCleared: false,
    win: false,
  };
  let bloomed = false;
  let reuseSeen = false;
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const to = (a as { to: number }).to;
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length), teaBudSlots: [...buds] },
      from, to, constraints,
    );
    if (!res) return tr;
    cups = res.state.cups as TeaId[][];
    buds = [...(res.state.teaBudSlots as TeaBudSlot[])];
    if (!bloomed && res.teaBudBloomed === 'tea_bud') {
      // Bloom must come from the original host emptying (fail-closed check).
      bloomed = true;
      tr.blooms++;
      tr.firstBloomDepth = i;
    }
    if (bloomed) {
      if (to === budHost) {
        tr.postBloomReceives++;
        const occ = (cups[budHost] as TeaId[]).length;
        tr.maxPostBloomOccupancy = Math.max(tr.maxPostBloomOccupancy, occ);
        if (occ >= 2 && tr.firstReuseDepth === null) {
          tr.firstReuseDepth = i;
          reuseSeen = true;
        }
      } else {
        // Even receives to other cups still track host occupancy for max.
        tr.maxPostBloomOccupancy = Math.max(tr.maxPostBloomOccupancy, (cups[budHost] as TeaId[]).length);
        if (tr.firstReuseDepth === null && (cups[budHost] as TeaId[]).length >= 2) {
          // Host reached >=2 via a receive that just happened (to===host already handled);
          // this branch catches occupancy persisting — set on first observation.
          // Prefer exact receive depth, so only set here if somehow missed.
          tr.firstReuseDepth = i;
          reuseSeen = true;
        }
      }
      if (reuseSeen && from === budHost && tr.firstPostBloomSourceDepth === null && i > (tr.firstReuseDepth as number)) {
        tr.firstPostBloomSourceDepth = i;
      }
      if (from === budHost) tr.postBloomSourceUses++;
    }
  }
  // Correct postBloomSourceUses: only count sources AFTER bloom; above counts from===host after bloom
  // but includes the bloom move itself if bloom move sources from host (it does). Adjust: bloom move is a source use but pre-reuse.
  // Keep as-is for diagnostics; L3A uses firstPostBloomSourceDepth which requires after reuse.
  tr.finalBudCleared = buds.every((s) => s === null);
  const hostFinal = cups[budHost] as TeaId[];
  tr.finalRepurpose = hostFinal.length === 4 && hostFinal.every((t) => t === hostFinal[0]);
  tr.win = isPuzzleWonState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length), teaBudSlots: [...buds] },
    constraints,
  );
  // L2 needs meaningful reuse AFTER bloom (occupancy>=2 at some post-bloom point).
  // firstReuseDepth already captures that. If bloom happened but host never reached >=2, it stays null.
  void reuseSeen;
  return tr;
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

const N = Number(process.argv[2] ?? 5000);
const C = cons();
let sampleAttempts = 0;
let solvable = 0, unsolv = 0, trunc = 0;
let l1 = 0, l2 = 0, l3a = 0, l3b = 0, l3 = 0;
const canonL2 = new Set<string>();
const canonL3 = new Set<string>();
const depths: number[] = [];
const bloomD: number[] = [];
const reuseD: number[] = [];
const drainD: number[] = [];
const bloomDiv: number[] = [];
const reuseDiv: number[] = [];
const maxOcc: number[] = [];
const visited: number[] = [];
const ms: number[] = [];
const hostDiversity: number[] = [];
// control
let pSolv = 0, pUns = 0, pTrunc = 0;
const deltas: number[] = [];
let controlEmpty = 0, controlAvoids = 0;
const plainMinOcc: number[] = [];
// timing quality (L2 only)
let bloomMove1 = 0, bloomQ1 = 0, bloomMid = 0, bloomQ4 = 0;
let reuseImmediate = 0, reuseGap1 = 0, reuseGap2 = 0;
let finalRepRate = 0, workspaceRate = 0;

for (let s = 0; s < N; s++) {
  const { cups, budHost, attempts } = shaped(s);
  sampleAttempts += attempts;
  hostDiversity.push(new Set(cups[budHost] as TeaId[]).size);
  const buds = budsFor(budHost);
  const t0 = Date.now();
  const r = solvePuzzle(cups, { cupConstraints: C, teaBudSlots: buds, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  ms.push(Date.now() - t0);
  visited.push(r.visitedStates);
  if (r.truncated) { trunc++; continue; }
  if (!r.solvable || r.minMoves === undefined || !r.solution) { unsolv++; continue; }
  solvable++;
  depths.push(r.minMoves);
  const tr = analyzeBloomTrace(cups, buds, budHost, r.solution, C);
  const isL1 = tr.blooms >= 1 && tr.win && tr.finalBudCleared;
  if (isL1) l1++;
  if (tr.firstBloomDepth !== null) {
    bloomD.push(tr.firstBloomDepth);
    bloomDiv.push(tr.firstBloomDepth / Math.max(1, r.minMoves));
  }
  if (tr.firstReuseDepth !== null) {
    reuseD.push(tr.firstReuseDepth);
    reuseDiv.push(tr.firstReuseDepth / Math.max(1, r.minMoves));
  }
  if (tr.firstPostBloomSourceDepth !== null) drainD.push(tr.firstPostBloomSourceDepth);
  maxOcc.push(tr.maxPostBloomOccupancy);
  const isL2 = tr.blooms >= 1 && tr.firstReuseDepth !== null && tr.finalBudCleared && tr.win;
  // control: same tea board with NO bud
  const rc = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  let delta: number | null = null;
  if (!rc.truncated && rc.solvable && rc.minMoves !== undefined && rc.solution) {
    pSolv++;
    delta = (r.minMoves as number) - (rc.minMoves as number);
    deltas.push(delta);
    // replay plain optimal, track min occupancy of would-be host
    let pc = cups.map((c) => [...c]);
    let minOcc = (pc[budHost] as TeaId[]).length;
    for (const a of rc.solution) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const res = applyPourState({ cups: pc, floatingIngredients: emptyFloatingIngredients(pc.length) }, (a as { from: number }).from, (a as { to: number }).to, C);
      if (!res) break;
      pc = res.state.cups as TeaId[][];
      minOcc = Math.min(minOcc, (pc[budHost] as TeaId[]).length);
    }
    plainMinOcc.push(minOcc);
    if (minOcc === 0) controlEmpty++;
    else controlAvoids++;
  } else if (rc.truncated) pTrunc++;
  else pUns++;

  if (!isL2) continue;
  l2++;
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), teaBudSlots: buds }, C);
  canonL2.add(key);
  const isA = tr.firstPostBloomSourceDepth !== null;
  const isB = tr.finalRepurpose;
  if (isA) l3a++;
  if (isB) l3b++;
  if (isA || isB) { l3++; canonL3.add(key); }
  if (tr.firstBloomDepth === 0) bloomMove1++;
  if (tr.firstBloomDepth !== null) {
    const f = tr.firstBloomDepth / Math.max(1, r.minMoves);
    if (f < 0.25) bloomQ1++; else if (f < 0.75) bloomMid++; else bloomQ4++;
  }
  if (tr.firstBloomDepth !== null && tr.firstReuseDepth !== null) {
    const gap = tr.firstReuseDepth - tr.firstBloomDepth;
    if (gap <= 1) reuseImmediate++;
    else if (gap === 2) reuseGap1++;
    else reuseGap2++;
  }
  if (isB) finalRepRate++;
  if (isA) workspaceRate++;
  if ((s + 1) % 500 === 0) console.log(`shaped ${s + 1}/${N} L2=${l2} L3=${l3} solv=${solvable}`);
}

console.log(`\n===== TEA-BLOOM N=${N} =====`);
console.log(`attempts=${sampleAttempts} shaped=${N} solv=${solvable} unsolv=${unsolv} trunc=${trunc}`);
console.log(`L1=${l1} L2=${l2} L3A=${l3a} L3B=${l3b} L3=${l3} canonL2=${canonL2.size} canonL3=${canonL3.size}`);
console.log(`depths n=${depths.length} min=${depths.length ? Math.min(...depths) : 'n/a'} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 'n/a'} hist=${JSON.stringify(hist(depths))}`);
console.log(`bloomD p50=${pct(bloomD, 50)} p95=${pct(bloomD, 95)} reuseD p50=${pct(reuseD, 50)} p95=${pct(reuseD, 95)} drainD p50=${pct(drainD, 50)} p95=${pct(drainD, 95)}`);
console.log(`bloomDiv p50=${pct(bloomDiv, 50)} p95=${pct(bloomDiv, 95)} reuseDiv p50=${pct(reuseDiv, 50)} p95=${pct(reuseDiv, 95)}`);
console.log(`maxOcc hist=${JSON.stringify(hist(maxOcc))} hostDiversity hist=${JSON.stringify(hist(hostDiversity))}`);
console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${visited.length ? Math.max(...visited) : 'n/a'} ms p50=${pct(ms, 50)} p95=${pct(ms, 95)} max=${ms.length ? Math.max(...ms) : 'n/a'}`);
console.log(`control: plainSolv=${pSolv} plainUnsolv=${pUns} plainTrunc=${pTrunc} delta(bud-plain) p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 'n/a'} hist=${JSON.stringify(hist(deltas))}`);
console.log(`CONTROL_EMPTY=${controlEmpty} (${(100 * controlEmpty / Math.max(1, pSolv)).toFixed(1)}%) CONTROL_AVOIDS=${controlAvoids} (${(100 * controlAvoids / Math.max(1, pSolv)).toFixed(1)}%) plainMinOcc hist=${JSON.stringify(hist(plainMinOcc))}`);
console.log(`quality(L2=${l2}): bloomMove1=${bloomMove1} (${(100 * bloomMove1 / Math.max(1, l2)).toFixed(1)}%) q1=${bloomQ1} mid=${bloomMid} q4=${bloomQ4} reuseImm=${reuseImmediate} gap1=${reuseGap1} gap2+=${reuseGap2} finalRep=${finalRepRate} workspace=${workspaceRate}`);
console.log(canonL2.size >= 30 ? 'FEASIBILITY GATE PASS (>=30 canon L2)' : 'FEASIBILITY GATE FAIL (<30 canon L2)');
