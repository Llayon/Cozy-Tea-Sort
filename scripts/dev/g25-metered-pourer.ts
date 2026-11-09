/**
 * G25 Candidate C — Metered Pourer pilot (DEV ONLY).
 * N=1000 default. Solves FULL + CONTROL, replays optimal solutions.
 * Usage: bunx tsx scripts/dev/g25-metered-pourer.ts [N]
 */
import type { CupConstraint, TeaId } from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  listConstructiveActionsState,
  pourCountState,
} from '../../src/game/logic/rules.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { dealPilotBoard, pct, firstActionOf } from './lib/g25-harness.ts';

const N = Number(process.argv[2] ?? 1000);

function buildConstraints(cups: TeaId[][], metered: boolean): { cons: CupConstraint[]; specialIdx: number } {
  const empties: number[] = [];
  cups.forEach((c, i) => {
    if (c.length === 0) empties.push(i);
  });
  const specialIdx = empties[0] as number;
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  cons[specialIdx] = metered
    ? { mode: 'normal', capacity: 4, mustEndEmpty: true, g25MeteredSource: true }
    : { mode: 'normal', capacity: 4, mustEndEmpty: true };
  return { cons, specialIdx };
}

interface Row {
  seed: string;
  solvableFull: boolean;
  truncatedFull: boolean;
  minMovesFull?: number;
  visitedFull: number;
  msFull: number;
  solvableControl: boolean;
  truncatedControl: boolean;
  minMovesControl?: number;
  visitedControl: number;
  msControl: number;
  canonical: string;
  meteredCausal: boolean;
  meteredSplits: number;
  meteredMoves: number;
  totalMoves: number;
  controlDivergent: boolean;
  firstDiff: boolean;
  depthDelta?: number;
  stateMult?: number;
}

const rows: Row[] = [];
const canonSet = new Set<string>();
let solvable = 0;
let truncated = 0;
const depths: number[] = [];
const visiteds: number[] = [];
const mss: number[] = [];
const stateMults: number[] = [];
const msMults: number[] = [];
let causal = 0;
let canonCausal = 0;
const canonCausalSet = new Set<string>();
let divergent = 0;
let firstDiffCount = 0;
const moveShares: number[] = [];
const depthDeltas: number[] = [];
let ignored = 0; // solvable FULL with 0 metered moves
let noSplitButSolved = 0;

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

  const rFull = {
    solvable: full.solvable,
    truncated: full.truncated === true,
    minMoves: full.minMoves,
    visited: full.visitedStates,
  };
  const rCtrl = {
    solvable: ctrl.solvable,
    truncated: ctrl.truncated === true,
    minMoves: ctrl.minMoves,
    visited: ctrl.visitedStates,
  };
  if (rFull.solvable) solvable++;
  if (rFull.truncated) truncated++;
  if (rFull.minMoves !== undefined) depths.push(rFull.minMoves);
  visiteds.push(rFull.visited);
  mss.push(msFull);

  // Replay FULL optimal to find METERED_CAUSAL + shares
  let meteredCausal = false;
  let meteredSplits = 0;
  let meteredMoves = 0;
  let totalMoves = 0;
  if (rFull.solvable && full.solution) {
    let state: { cups: TeaId[][] } = { cups: cups.map((c) => [...c]) };
    totalMoves = (full.solution as unknown[]).length;
    for (const step of full.solution as Array<{ kind: string; from?: number; to?: number; count?: number }>) {
      if (step.kind !== 'pour') continue;
      const from = step.from as number;
      const to = step.to as number;
      if (from === specialIdx) meteredMoves++;
      // split event: control count >1 but full count ==1 at this state
      const mFull = pourCountState(state as never, from, to, fullCons);
      const mCtrl = pourCountState(state as never, from, to, ctrlCons);
      if (mCtrl > 1 && mFull === 1) {
        meteredSplits++;
        meteredCausal = true;
      }
      const res = applyPourState(state as never, from, to, fullCons);
      if (!res) break;
      state = { cups: res.state.cups.map((c) => [...c]) };
    }
    if (meteredCausal) {
      causal++;
      canonCausalSet.add(canon);
    }
    if (meteredMoves === 0) ignored++;
    if (!meteredCausal) noSplitButSolved++;
    moveShares.push(totalMoves > 0 ? meteredMoves / totalMoves : 0);
  } else {
    moveShares.push(0);
  }

  // Control divergence: replay CONTROL optimal under FULL
  let controlDivergent = false;
  let firstDiff = false;
  if (rFull.solvable && rCtrl.solvable && full.solution && ctrl.solution) {
    const f0 = firstActionOf(full.solution as never);
    const c0 = firstActionOf(ctrl.solution as never);
    firstDiff = f0 !== c0;
    if (firstDiff) firstDiffCount++;
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
      const mFull = pourCountState(st as never, from, to, fullCons);
      if (mFull !== wantCount) {
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

  let depthDelta: number | undefined;
  if (rFull.minMoves !== undefined && rCtrl.minMoves !== undefined) {
    depthDelta = rCtrl.minMoves - rFull.minMoves;
    depthDeltas.push(depthDelta);
  }
  let stateMult: number | undefined;
  if (rCtrl.visited > 0) {
    stateMult = rFull.visited / rCtrl.visited;
    stateMults.push(stateMult);
    msMults.push(msFull / Math.max(1, msControl));
  }

  rows.push({
    seed,
    solvableFull: rFull.solvable,
    truncatedFull: rFull.truncated,
    minMovesFull: rFull.minMoves,
    visitedFull: rFull.visited,
    msFull,
    solvableControl: rCtrl.solvable,
    truncatedControl: rCtrl.truncated,
    minMovesControl: rCtrl.minMoves,
    visitedControl: rCtrl.visited,
    msControl,
    canonical: canon,
    meteredCausal,
    meteredSplits,
    meteredMoves,
    totalMoves,
    controlDivergent,
    firstDiff,
    depthDelta,
    stateMult,
  });
  if ((i + 1) % 200 === 0) console.log(`metered ${i + 1}/${N}`);
}

const solvRate = (100 * solvable) / N;
const causalRate = (100 * causal) / Math.max(1, N);
const divRate = (100 * divergent) / Math.max(1, N);
const ignoredRate = (100 * ignored) / Math.max(1, solvable);
console.log(`\n===== METERED POURER PILOT N=${N} =====`);
console.log(`solvable ${solvable}/${N} (${solvRate.toFixed(1)}%) truncated=${truncated}`);
console.log(`depth p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 0}`);
console.log(`visited p50=${pct(visiteds, 50)} p95=${pct(visiteds, 95)} max=${Math.max(...visiteds)}`);
console.log(`solver ms p50=${pct(mss, 50)} p95=${pct(mss, 95)} max=${Math.max(...mss)}`);
console.log(`canonical unique ${canonSet.size}/${N}`);
console.log(`METERED_CAUSAL ${causal}/${N} (${causalRate.toFixed(1)}%) canonical-causal=${canonCausalSet.size}`);
console.log(`control divergence ${divergent} (${divRate.toFixed(1)}%) firstDiff=${firstDiffCount}`);
console.log(`metered share p50=${(pct(moveShares, 50) * 100).toFixed(1)}% p90=${(pct(moveShares, 90) * 100).toFixed(1)}% p95=${(pct(moveShares, 95) * 100).toFixed(1)}%`);
console.log(`depthDelta (ctrl-full) p50=${pct(depthDeltas, 50)}`);
console.log(`ignored (0 metered moves) ${ignored} (${ignoredRate.toFixed(1)}% of solved)`);
console.log(`stateMult p50=${pct(stateMults, 50).toFixed(2)} p90=${pct(stateMults, 90).toFixed(2)} p95=${pct(stateMults, 95).toFixed(2)} max=${Math.max(...stateMults).toFixed(2)}`);
console.log(`gates: solv>=95% ${solvRate >= 95 ? 'PASS' : 'FAIL'} trunc==0 ${truncated === 0 ? 'PASS' : 'FAIL'} p95<=250ms ${pct(mss, 95) <= 250 ? 'PASS' : 'FAIL'} causal>=20% ${causalRate >= 20 ? 'PASS' : 'FAIL'}`);

const out = {
  candidate: 'metered-pourer',
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
  controlDivergence: divRate,
  firstDiff: firstDiffCount,
  moveShare: { p50: pct(moveShares, 50), p90: pct(moveShares, 90), p95: pct(moveShares, 95) },
  depthDeltaP50: pct(depthDeltas, 50),
  ignoredRate,
  stateMult: { p50: pct(stateMults, 50), p90: pct(stateMults, 90), p95: pct(stateMults, 95) },
};
await import('node:fs/promises').then(async (fs) => {
  await fs.mkdir('scripts/dev/out', { recursive: true });
  await fs.writeFile(`scripts/dev/out/g25-metered-pourer-N${N}.json`, JSON.stringify(out, null, 2));
});
