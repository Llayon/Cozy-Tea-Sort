/**
 * G11 cinnamon feasibility sampler (DEV ONLY — never CI/production).
 * Topology: 4c/6v/16u, layer counts 4,4,3,3,2,0; host = len-2 mixed
 * cinnamon vessel (base normal cap4); one empty normal. Production
 * solver/canonical/rules only.
 */
import {
  CupConstraint,
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
export const CINN_HOST = 4;
export const LENGTHS = [4, 4, 3, 3, 2, 0];
export const MAX_VISITED = 120_000;
export const MAX_DEPTH = 60;

export interface CinnamonTrace {
  unlocks: number;
  expandedUses: number;
  fourthSlotUses: number;
  expandedDrains: number;
  finalRepurpose: boolean;
  firstUnlockDepth: number | null;
  firstExpandedUseDepth: number | null;
  firstFourthSlotDepth: number | null;
  firstExpandedDrainDepth: number | null;
  maxPostUnlockOccupancy: number;
  finalObstacleCleared: boolean;
  win: boolean;
}

function cons(): CupConstraint[] {
  return Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
}
function obs(): (string | null)[] {
  const o: (string | null)[] = [null, null, null, null, null, null];
  o[CINN_HOST] = 'cinnamon';
  return o;
}
function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}
function shaped(s: number): { cups: TeaId[][]; attempts: number } {
  let attempts = 0;
  for (let a = 0; a < 500; a++) {
    attempts++;
    const rng = createRng(`cinn-shaped-${s}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cups.push(p.slice(off, off + L)); off += L; }
    const host = cups[CINN_HOST] as TeaId[];
    if (host.length === 2 && new Set(host).size === 2) return { cups, attempts };
  }
  throw new Error(`no shape ${s}`);
}

export function analyzeTrace(startCups: TeaId[][], solution: readonly SolverAction[], constraints: readonly CupConstraint[]): CinnamonTrace {
  let cups = startCups.map((c) => [...c]);
  let caps: (string | null)[] = obs();
  const tr: CinnamonTrace = {
    unlocks: 0, expandedUses: 0, fourthSlotUses: 0, expandedDrains: 0, finalRepurpose: false,
    firstUnlockDepth: null, firstExpandedUseDepth: null, firstFourthSlotDepth: null, firstExpandedDrainDepth: null,
    maxPostUnlockOccupancy: 0, finalObstacleCleared: false, win: false,
  };
  let expandedSeen = false;
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const beforeCap = caps[from];
    const res = applyPourState({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...caps] as any }, from, (a as { to: number }).to, constraints);
    if (!res) return tr;
    cups = res.state.cups as TeaId[][];
    caps = [...(res.state.capacityObstacles as unknown as (string | null)[])];
    if (beforeCap === 'cinnamon' && (res as any).capacityObstacleRemoved === 'cinnamon') {
      tr.unlocks++;
      if (tr.firstUnlockDepth === null) tr.firstUnlockDepth = i;
    }
    if (tr.firstUnlockDepth !== null && i > (tr.firstUnlockDepth as number)) {
      const occ = (cups[CINN_HOST] as TeaId[]).length;
      tr.maxPostUnlockOccupancy = Math.max(tr.maxPostUnlockOccupancy, occ);
      if (occ >= 3 && tr.firstExpandedUseDepth === null) { tr.expandedUses++; tr.firstExpandedUseDepth = i; }
      else if (occ >= 3 && !expandedSeen) { expandedSeen = true; }
      if (occ === 4 && tr.firstFourthSlotDepth === null) { tr.fourthSlotUses++; tr.firstFourthSlotDepth = i; }
      if (from === CINN_HOST && tr.firstExpandedUseDepth !== null && i > (tr.firstExpandedUseDepth as number)) {
        tr.expandedDrains++;
        if (tr.firstExpandedDrainDepth === null) tr.firstExpandedDrainDepth = i;
      }
    }
  }
  // count repeat expanded uses (occupancy>=3 states after unlock)
  tr.finalObstacleCleared = caps.every((c) => c === null);
  const hostFinal = cups[CINN_HOST] as TeaId[];
  tr.finalRepurpose = hostFinal.length === 4 && hostFinal.every((t) => t === hostFinal[0]);
  tr.win = isPuzzleWonState({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: [...caps] as any }, constraints);
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

const N = Number(process.argv[2] ?? 200);
const C = cons();
let sampleAttempts = 0, solvable = 0, unsolv = 0, trunc = 0;
let l1 = 0, l2 = 0, l3a = 0, l3b = 0, l3 = 0;
const canonL2 = new Set<string>();
const canonL3 = new Set<string>();
const depths: number[] = [];
const unlockD: number[] = [];
const expD: number[] = [];
const fourthD: number[] = [];
const drainD: number[] = [];
const unlockDiv: number[] = [];
const expDiv: number[] = [];
const maxOcc: number[] = [];
const visited: number[] = [];
const ms: number[] = [];
let finalEmpty = 0;
// control
let pSolv = 0, pUns = 0, pTrunc = 0;
const deltas: number[] = [];
// quality
let unlockMove1 = 0, uQ1 = 0, uMid = 0, uQ4 = 0, expImmediate = 0, expGap1 = 0, expGap2 = 0, fourthRate = 0;

for (let s = 0; s < N; s++) {
  const { cups, attempts } = shaped(s);
  sampleAttempts += attempts;
  const t0 = Date.now();
  const r = solvePuzzle(cups, { cupConstraints: C, capacityObstacles: obs() as any, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  ms.push(Date.now() - t0);
  visited.push(r.visitedStates);
  if (r.truncated) { trunc++; continue; }
  if (!r.solvable || r.minMoves === undefined || !r.solution) { unsolv++; continue; }
  solvable++;
  depths.push(r.minMoves);
  const tr = analyzeTrace(cups, r.solution, C);
  if (tr.finalObstacleCleared) finalEmpty++;
  const isL1 = tr.unlocks >= 1 && tr.win;
  if (isL1) l1++;
  if (tr.firstUnlockDepth !== null) unlockD.push(tr.firstUnlockDepth);
  if (tr.firstExpandedUseDepth !== null) expD.push(tr.firstExpandedUseDepth);
  if (tr.firstFourthSlotDepth !== null) fourthD.push(tr.firstFourthSlotDepth);
  if (tr.firstExpandedDrainDepth !== null) drainD.push(tr.firstExpandedDrainDepth);
  if (tr.firstUnlockDepth !== null) unlockDiv.push(tr.firstUnlockDepth / Math.max(1, r.minMoves));
  if (tr.firstExpandedUseDepth !== null) expDiv.push(tr.firstExpandedUseDepth / Math.max(1, r.minMoves));
  maxOcc.push(tr.maxPostUnlockOccupancy);
  const isL2 = tr.unlocks >= 1 && tr.firstExpandedUseDepth !== null && tr.finalObstacleCleared && tr.win;
  if (!isL2) continue;
  l2++;
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: obs() as any }, C);
  canonL2.add(key);
  const isA = tr.expandedDrains >= 1;
  const isB = tr.finalRepurpose;
  if (isA) l3a++;
  if (isB) l3b++;
  if (isA || isB) { l3++; canonL3.add(key); }
  // quality
  if (tr.firstUnlockDepth === 0) unlockMove1++;
  if (tr.firstUnlockDepth !== null) {
    const f = tr.firstUnlockDepth / Math.max(1, r.minMoves);
    if (f < 0.25) uQ1++; else if (f < 0.75) uMid++; else uQ4++;
  }
  if (tr.firstUnlockDepth !== null && tr.firstExpandedUseDepth !== null) {
    const gap = tr.firstExpandedUseDepth - tr.firstUnlockDepth;
    if (gap <= 1) expImmediate++;
    else if (gap === 2) expGap1++;
    else expGap2++;
  }
  if (tr.firstFourthSlotDepth !== null) fourthRate++;
  // control
  const rc = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (rc.truncated) pTrunc++;
  else if (rc.solvable && rc.minMoves !== undefined) { pSolv++; deltas.push((r.minMoves as number) - (rc.minMoves as number)); }
  else pUns++;
  if ((s + 1) % 500 === 0) console.log(`shaped ${s + 1}/${N} L2=${l2} L3=${l3} solv=${solvable}`);
}
console.log(`\n===== CINNAMON N=${N} =====`);
console.log(`attempts=${sampleAttempts} shaped=${N} solv=${solvable} unsolv=${unsolv} trunc=${trunc}`);
console.log(`L1=${l1} L2=${l2} L3A=${l3a} L3B=${l3b} L3=${l3} canonL2=${canonL2.size} canonL3=${canonL3.size}`);
console.log(`depths n=${depths.length} min=${Math.min(...depths)} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${Math.max(...depths)} hist=${JSON.stringify(hist(depths))}`);
console.log(`unlockD p50=${pct(unlockD, 50)} p95=${pct(unlockD, 95)} expandedD p50=${pct(expD, 50)} p95=${pct(expD, 95)} fourthD p50=${pct(fourthD, 50)} p95=${pct(fourthD, 95)} drainD p50=${pct(drainD, 50)} p95=${pct(drainD, 95)}`);
console.log(`unlockDiv p50=${pct(unlockDiv, 50)} p95=${pct(unlockDiv, 95)} expDiv p50=${pct(expDiv, 50)} p95=${pct(expDiv, 95)}`);
console.log(`maxOcc hist=${JSON.stringify(hist(maxOcc))} finalClearedRate=${(finalEmpty / Math.max(1, solvable)).toFixed(3)}`);
console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${Math.max(...visited)} ms p50=${pct(ms, 50)} p95=${pct(ms, 95)} max=${Math.max(...ms)}`);
console.log(`control: plainSolv=${pSolv} plainUnsolv=${pUns} plainTrunc=${pTrunc} delta(dynamic-plain) p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 'n/a'} hist=${JSON.stringify(hist(deltas))}`);
console.log(`quality(L2=${l2}): move1=${unlockMove1} (${(100 * unlockMove1 / Math.max(1, l2)).toFixed(1)}%) q1=${uQ1} mid=${uMid} q4=${uQ4} expImm=${expImmediate} gap1=${expGap1} gap2+=${expGap2} fourth=${fourthRate}`);
console.log(canonL2.size >= 30 ? 'GATE PASS' : 'GATE FAIL');
