/**
 * G25 Candidate A — Mirror Tea Pair pilot (DEV ONLY).
 * N=1000 default. FULL (2 mirrors) + CONTROL (2 ordinary).
 * Usage: bunx tsx scripts/dev/g25-mirror-pair.ts [N]
 */
import type { CupConstraint, TeaId } from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  pourCountState,
  canonicalPuzzleKey,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  G25_MIRROR_A,
  G25_MIRROR_B,
  g25MirrorRecipeForSlot,
} from '../../src/game/logic/g25Research.ts';
import { dealPilotBoard, pct, firstActionOf } from './lib/g25-harness.ts';

const N = Number(process.argv[2] ?? 1000);

function buildMirror(cups: TeaId[][], mirror: boolean): { cons: CupConstraint[]; m0: number; m1: number } {
  // dealPilotBoard returns 6 vessels with 2 empties at random positions.
  // For mirror topology per §64: both empties become mirrors (no ordinary empty).
  const empties: number[] = [];
  cups.forEach((c, i) => {
    if (c.length === 0) empties.push(i);
  });
  const m0 = empties[0] as number;
  const m1 = empties[1] as number;
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  if (mirror) {
    cons[m0] = { mode: 'normal', capacity: 4, g25MirrorGroup: 'mirror-pair', g25MirrorRecipe: [...g25MirrorRecipeForSlot(0)] };
    cons[m1] = { mode: 'normal', capacity: 4, g25MirrorGroup: 'mirror-pair', g25MirrorRecipe: [...g25MirrorRecipeForSlot(1)] };
  }
  return { cons, m0, m1 };
}

const canonSet = new Set<string>();
let solvable = 0;
let truncated = 0;
const depths: number[] = [];
const visiteds: number[] = [];
const mss: number[] = [];
const stateMults: number[] = [];
let orderActive = 0;
const canonOrderSet = new Set<string>();
let divergent = 0;
let firstDiffCount = 0;
const depthDeltas: number[] = [];
// interleaving: gaps between successive recipe deposits
const gapHist = { g0: 0, g1: 0, g2: 0, g3: 0 };
// dual progress: boards where work alternates vs finishes one first
let alternating = 0;
let sequential = 0;
let recipeBuild = 0;

for (let i = 0; i < N; i++) {
  const seed = `g25-pilot-${i}`;
  const cups = dealPilotBoard(seed);
  const { cons: fullCons, m0, m1 } = buildMirror(cups, true);
  const { cons: ctrlCons } = buildMirror(cups, false);
  const canon = canonicalPuzzleKey({ cups }, fullCons);
  canonSet.add(canon);

  const t0 = Date.now();
  const full = solvePuzzle(cups, { cupConstraints: [...fullCons], returnSolution: true });
  const msFull = Date.now() - t0;
  const t1 = Date.now();
  const ctrl = solvePuzzle(cups, { cupConstraints: [...ctrlCons], returnSolution: true });
  const msControl = Date.now() - t1;

  if (full.solvable) solvable++;
  if (full.truncated === true) truncated++;
  if (full.minMoves !== undefined) depths.push(full.minMoves);
  visiteds.push(full.visitedStates);
  mss.push(msFull);
  if (ctrl.visitedStates > 0) stateMults.push(full.visitedStates / Math.max(1, ctrl.visitedStates));

  // Replay FULL optimal for ORDER_ACTIVE + interleaving + dual progress
  if (full.solvable && full.solution) {
    let state: { cups: TeaId[][] } = { cups: cups.map((c) => [...c]) };
    let active = false;
    const depositSteps: number[] = []; // solution indices where to==m0/m1
    const depositTarget: number[] = [];
    let idx = 0;
    for (const step of full.solution as Array<{ kind: string; from?: number; to?: number }>) {
      if (step.kind !== 'pour') {
        idx++;
        continue;
      }
      const from = step.from as number;
      const to = step.to as number;
      if (to === m0 || to === m1) {
        depositSteps.push(idx);
        depositTarget.push(to);
      }
      // ORDER_ACTIVE: exists (f,t) with CTRL legal but FULL illegal at this state
      if (!active) {
        outer: for (let f = 0; f < 6; f++) {
          for (let t = 0; t < 6; t++) {
            if (f === t) continue;
            if (canPourState(state as never, f, t, ctrlCons) && !canPourState(state as never, f, t, fullCons)) {
              active = true;
              break outer;
            }
          }
        }
      }
      const res = applyPourState(state as never, from, to, fullCons);
      if (!res) break;
      state = { cups: res.state.cups.map((c) => [...c]) };
      idx++;
    }
    if (active) {
      orderActive++;
      canonOrderSet.add(canon);
    }
    // recipe build: final state has both mirrors exact (mandatory for win, but verify)
    const finalCups = state.cups;
    const r0 = g25MirrorRecipeForSlot(0);
    const r1 = g25MirrorRecipeForSlot(1);
    const ok0 = finalCups[m0]?.length === 4 && finalCups[m0]?.every((v, k) => v === r0[k]);
    const ok1 = finalCups[m1]?.length === 4 && finalCups[m1]?.every((v, k) => v === r1[k]);
    if (ok0 && ok1) recipeBuild++;
    // interleaving gaps
    for (let k = 1; k < depositSteps.length; k++) {
      const gap = (depositSteps[k] as number) - (depositSteps[k - 1] as number) - 1;
      if (gap <= 0) gapHist.g0++;
      else if (gap === 1) gapHist.g1++;
      else if (gap === 2) gapHist.g2++;
      else gapHist.g3++;
    }
    // dual progress: alternate vs sequential
    if (depositTarget.length >= 2) {
      const first = depositTarget[0];
      let switched = false;
      let finishedFirst = true;
      // sequential = all deposits to m0 come before all to m1 or vice versa
      const m0Idx = depositTarget.map((t, k) => (t === m0 ? k : -1)).filter((k) => k >= 0);
      const m1Idx = depositTarget.map((t, k) => (t === m1 ? k : -1)).filter((k) => k >= 0);
      if (m0Idx.length && m1Idx.length) {
        const m0Last = Math.max(...m0Idx);
        const m0First = Math.min(...m0Idx);
        const m1First = Math.min(...m1Idx);
        const m1Last = Math.max(...m1Idx);
        const sequentialM0First = m0Last < m1First;
        const sequentialM1First = m1Last < m0First;
        if (sequentialM0First || sequentialM1First) sequential++;
        else alternating++;
      }
      void switched;
      void finishedFirst;
      void first;
    }
  }

  if (full.solvable && ctrl.solvable && full.solution && ctrl.solution) {
    if (firstActionOf(full.solution as never) !== firstActionOf(ctrl.solution as never)) firstDiffCount++;
    // control replay divergence under FULL
    let st: { cups: TeaId[][] } = { cups: cups.map((c) => [...c]) };
    let div = false;
    for (const step of ctrl.solution as Array<{ kind: string; from?: number; to?: number; count?: number }>) {
      if (step.kind !== 'pour') {
        div = true;
        break;
      }
      const from = step.from as number;
      const to = step.to as number;
      if (!canPourState(st as never, from, to, fullCons)) {
        div = true;
        break;
      }
      if (pourCountState(st as never, from, to, fullCons) !== (step.count as number)) {
        div = true;
        break;
      }
      const res = applyPourState(st as never, from, to, fullCons);
      if (!res) {
        div = true;
        break;
      }
      st = { cups: res.state.cups.map((c) => [...c]) };
    }
    if (div) divergent++;
    if (full.minMoves !== undefined && ctrl.minMoves !== undefined) {
      depthDeltas.push((ctrl.minMoves as number) - (full.minMoves as number));
    }
  }
  if ((i + 1) % 200 === 0) console.log(`mirror ${i + 1}/${N}`);
}

const solvRate = (100 * solvable) / N;
const activeRate = (100 * orderActive) / Math.max(1, N);
console.log(`\n===== MIRROR PAIR PILOT N=${N} =====`);
console.log(`solvable ${solvable}/${N} (${solvRate.toFixed(1)}%) truncated=${truncated}`);
console.log(`depth p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 0}`);
console.log(`visited p50=${pct(visiteds, 50)} p95=${pct(visiteds, 95)} max=${Math.max(...visiteds)}`);
console.log(`solver ms p50=${pct(mss, 50)} p95=${pct(mss, 95)} max=${Math.max(...mss)}`);
console.log(`canonical unique ${canonSet.size}/${N}`);
console.log(`ORDER_ACTIVE ${orderActive}/${N} (${activeRate.toFixed(1)}%) canonical-active=${canonOrderSet.size}`);
console.log(`RECIPE_BUILD ${recipeBuild}/${solvable} solved`);
console.log(`control divergence ${divergent} firstDiff=${firstDiffCount}`);
console.log(`interleaving gaps 0:${gapHist.g0} 1:${gapHist.g1} 2:${gapHist.g2} 3+:${gapHist.g3}`);
console.log(`dual alternating=${alternating} sequential=${sequential}`);
console.log(`depthDelta p50=${pct(depthDeltas, 50)}`);
console.log(`stateMult p50=${pct(stateMults, 50).toFixed(2)} p90=${pct(stateMults, 90).toFixed(2)} p95=${pct(stateMults, 95).toFixed(2)}`);
console.log(`gates: solv>=95% ${solvRate >= 95 ? 'PASS' : 'FAIL'} trunc==0 ${truncated === 0 ? 'PASS' : 'FAIL'} p95<=250ms ${pct(mss, 95) <= 250 ? 'PASS' : 'FAIL'} active>=10% ${activeRate >= 10 ? 'PASS' : 'FAIL'}`);

const out = {
  candidate: 'mirror-pair',
  N,
  solvability: solvRate,
  truncation: truncated,
  depth: { p50: pct(depths, 50), p95: pct(depths, 95), max: depths.length ? Math.max(...depths) : 0 },
  visited: { p50: pct(visiteds, 50), p95: pct(visiteds, 95), max: Math.max(...visiteds) },
  ms: { p50: pct(mss, 50), p95: pct(mss, 95), max: Math.max(...mss) },
  canonicalUnique: canonSet.size,
  orderActiveRate: activeRate,
  orderActiveCount: orderActive,
  canonicalActive: canonOrderSet.size,
  recipeBuild,
  controlDivergence: (100 * divergent) / Math.max(1, N),
  firstDiff: firstDiffCount,
  interleaving: gapHist,
  dual: { alternating, sequential },
  depthDeltaP50: pct(depthDeltas, 50),
  stateMult: { p50: pct(stateMults, 50), p90: pct(stateMults, 90), p95: pct(stateMults, 95) },
};
await import('node:fs/promises').then(async (fs) => {
  await fs.mkdir('scripts/dev/out', { recursive: true });
  await fs.writeFile(`scripts/dev/out/g25-mirror-pair-N${N}.json`, JSON.stringify(out, null, 2));
});
