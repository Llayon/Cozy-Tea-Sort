/**
 * G25 Candidate D — Measuring Bowl pilot (DEV ONLY).
 * N=1000 default. Solves FULL + CONTROL, replays optimal solutions.
 * Usage: bunx tsx scripts/dev/g25-measuring-bowl.ts [N]
 */
import type { CupConstraint, TeaId } from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  pourCountState,
} from '../../src/game/logic/rules.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { dealPilotBoard, pct, firstActionOf } from './lib/g25-harness.ts';

const N = Number(process.argv[2] ?? 1000);

function buildConstraints(cups: TeaId[][], measuring: boolean): { cons: CupConstraint[]; specialIdx: number } {
  const empties: number[] = [];
  cups.forEach((c, i) => {
    if (c.length === 0) empties.push(i);
  });
  const specialIdx = empties[0] as number;
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  cons[specialIdx] = measuring
    ? { mode: 'normal', capacity: 4, mustEndEmpty: true, g25MeteredDestination: true }
    : { mode: 'normal', capacity: 4, mustEndEmpty: true };
  return { cons, specialIdx };
}

const canonSet = new Set<string>();
let solvable = 0;
let truncated = 0;
const depths: number[] = [];
const visiteds: number[] = [];
const mss: number[] = [];
const stateMults: number[] = [];
let causal = 0;
const canonCausalSet = new Set<string>();
let divergent = 0;
let firstDiffCount = 0;
const moveShares: number[] = [];
const depthDeltas: number[] = [];
let ignored = 0;
const extractionCounts: number[] = [];
let extractionDom = 0; // boards with >=3 direct extractions

for (let i = 0; i < N; i++) {
  const seed = `g25-pilot-${i}`;
  const cups = dealPilotBoard(seed);
  const { cons: fullCons, specialIdx } = buildConstraints(cups, true);
  const { cons: ctrlCons } = buildConstraints(cups, false);
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

  let measuredCausal = false;
  let measuredMoves = 0;
  let totalMoves = 0;
  let extractions = 0;
  if (full.solvable && full.solution) {
    let state: { cups: TeaId[][] } = { cups: cups.map((c) => [...c]) };
    totalMoves = (full.solution as unknown[]).length;
    for (const step of full.solution as Array<{ kind: string; from?: number; to?: number; count?: number; layer?: TeaId }>) {
      if (step.kind !== 'pour') continue;
      const from = step.from as number;
      const to = step.to as number;
      if (to === specialIdx) {
        measuredMoves++;
        // direct extraction: source top-run >=2 (homogeneous peel) and FULL moves 1
        const mFull = pourCountState(state as never, from, to, fullCons);
        const mCtrl = pourCountState(state as never, from, to, ctrlCons);
        if (mCtrl > 1 && mFull === 1) {
          measuredCausal = true;
        }
        // extraction heuristic: source had >=3 of same tea before take
        const srcBefore = (state.cups[from] as TeaId[]).length;
        if (srcBefore >= 3) extractions++;
      }
      const res = applyPourState(state as never, from, to, fullCons);
      if (!res) break;
      state = { cups: res.state.cups.map((c) => [...c]) };
    }
    if (measuredCausal) {
      causal++;
      canonCausalSet.add(canon);
    }
    if (measuredMoves === 0) ignored++;
    extractionCounts.push(extractions);
    if (extractions >= 3) extractionDom++;
    moveShares.push(totalMoves > 0 ? measuredMoves / totalMoves : 0);
  } else {
    moveShares.push(0);
    extractionCounts.push(0);
  }

  let controlDivergent = false;
  if (full.solvable && ctrl.solvable && full.solution && ctrl.solution) {
    if (firstActionOf(full.solution as never) !== firstActionOf(ctrl.solution as never)) firstDiffCount++;
    let st: { cups: TeaId[][] } = { cups: cups.map((c) => [...c]) };
    for (const step of ctrl.solution as Array<{ kind: string; from?: number; to?: number; count?: number }>) {
      if (step.kind !== 'pour') {
        controlDivergent = true;
        break;
      }
      const from = step.from as number;
      const to = step.to as number;
      const wantCount = step.count as number;
      if (!canPourState(st as never, from, to, fullCons)) {
        controlDivergent = true;
        break;
      }
      if (pourCountState(st as never, from, to, fullCons) !== wantCount) {
        controlDivergent = true;
        break;
      }
      const res = applyPourState(st as never, from, to, fullCons);
      if (!res) {
        controlDivergent = true;
        break;
      }
      st = { cups: res.state.cups.map((c) => [...c]) };
    }
    if (controlDivergent) divergent++;
  }

  if (full.minMoves !== undefined && ctrl.minMoves !== undefined) depthDeltas.push((ctrl.minMoves as number) - (full.minMoves as number));
  if (ctrl.visitedStates > 0) stateMults.push(full.visitedStates / ctrl.visitedStates);
  if ((i + 1) % 200 === 0) console.log(`measuring ${i + 1}/${N}`);
}

const solvRate = (100 * solvable) / N;
const causalRate = (100 * causal) / Math.max(1, N);
console.log(`\n===== MEASURING BOWL PILOT N=${N} =====`);
console.log(`solvable ${solvable}/${N} (${solvRate.toFixed(1)}%) truncated=${truncated}`);
console.log(`depth p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 0}`);
console.log(`visited p50=${pct(visiteds, 50)} p95=${pct(visiteds, 95)} max=${Math.max(...visiteds)}`);
console.log(`solver ms p50=${pct(mss, 50)} p95=${pct(mss, 95)} max=${Math.max(...mss)}`);
console.log(`canonical unique ${canonSet.size}/${N}`);
console.log(`MEASURED_CAUSAL ${causal}/${N} (${causalRate.toFixed(1)}%) canonical-causal=${canonCausalSet.size}`);
console.log(`control divergence ${divergent} firstDiff=${firstDiffCount}`);
console.log(`measured share p50=${(pct(moveShares, 50) * 100).toFixed(1)}% p90=${(pct(moveShares, 90) * 100).toFixed(1)}% p95=${(pct(moveShares, 95) * 100).toFixed(1)}%`);
console.log(`extraction p50=${pct(extractionCounts, 50)} p90=${pct(extractionCounts, 90)} >=3: ${extractionDom} (${((100 * extractionDom) / Math.max(1, N)).toFixed(1)}%)`);
console.log(`depthDelta p50=${pct(depthDeltas, 50)} ignored=${ignored}`);
console.log(`stateMult p50=${pct(stateMults, 50).toFixed(2)} p95=${pct(stateMults, 95).toFixed(2)}`);
console.log(`gates: solv>=95% ${solvRate >= 95 ? 'PASS' : 'FAIL'} trunc==0 ${truncated === 0 ? 'PASS' : 'FAIL'} p95<=250ms ${pct(mss, 95) <= 250 ? 'PASS' : 'FAIL'} causal>=20% ${causalRate >= 20 ? 'PASS' : 'FAIL'}`);

const out = {
  candidate: 'measuring-bowl',
  N,
  solvability: solvRate,
  truncation: truncated,
  depth: { p50: pct(depths, 50), p95: pct(depths, 95), max: depths.length ? Math.max(...depths) : 0 },
  visited: { p50: pct(visiteds, 50), p95: pct(visiteds, 95), max: Math.max(...visiteds) },
  ms: { p50: pct(mss, 50), p95: pct(mss, 95), max: Math.max(...mss) },
  canonicalUnique: canonSet.size,
  causalRate,
  causalCount: causal,
  canonicalCausal: canonCausalSet.size,
  controlDivergence: (100 * divergent) / Math.max(1, N),
  firstDiff: firstDiffCount,
  moveShare: { p50: pct(moveShares, 50), p90: pct(moveShares, 90), p95: pct(moveShares, 95) },
  extraction: { p50: pct(extractionCounts, 50), p90: pct(extractionCounts, 90), ge3: extractionDom },
  depthDeltaP50: pct(depthDeltas, 50),
  ignoredRate: (100 * ignored) / Math.max(1, solvable),
  stateMult: { p50: pct(stateMults, 50), p90: pct(stateMults, 90), p95: pct(stateMults, 95) },
};
await import('node:fs/promises').then(async (fs) => {
  await fs.mkdir('scripts/dev/out', { recursive: true });
  await fs.writeFile(`scripts/dev/out/g25-measuring-bowl-N${N}.json`, JSON.stringify(out, null, 2));
});
