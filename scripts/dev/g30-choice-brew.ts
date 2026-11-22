/**
 * G30-B Choice Brew probe (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g30-choice-brew.ts [N] [outPath]
 */
import { g30AnalyzeTrace, g30ContractB, g30Deal, g30SolveBoard } from './g30-milestone-lib.ts';

declare const process: { argv: readonly string[]; exitCode?: number };

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

const N = Number(process.argv[2] ?? 100);
const outPath = process.argv[3] ?? `scripts/dev/out/g30-b-choice-N${N}.json`;

const rows: unknown[] = [];
let solvFull = 0;
let solvCtl = 0;
let trunc = 0;
let integrated = 0;
let replan = 0;
let taxOnly = 0;
let roundtrip = 0;
let late = 0;
let incidental = 0;
const ratios: number[] = [];
const postWorks: number[] = [];
const touches: number[] = [];
const deltas: number[] = [];
const fullMs: number[] = [];
const ctlMs: number[] = [];
const stateMult: number[] = [];
const byPair: Record<string, { n: number; integ: number; replan: number; tax: number; incid: number }> = {};

for (let i = 0; i < N; i++) {
  const seed = `g30-probe-${i}`;
  const cups = g30Deal(seed);
  const contract = g30ContractB(i);
  const pair = [...(contract as { allowedTeas: readonly string[] }).allowedTeas].sort().join('+');
  const { control, full, controlMs, fullMs: fms } = g30SolveBoard(cups, contract);
  ctlMs.push(controlMs);
  fullMs.push(fms);
  if (control.solvable) solvCtl++;
  if (full.solvable) solvFull++;
  if (full.truncated || control.truncated) trunc++;
  const trace = g30AnalyzeTrace(cups, contract, full, control);
  if (trace && full.solvable && control.solvable) {
    if (trace.integrated) integrated++;
    if (trace.replan) replan++;
    if (trace.taxOnly) taxOnly++;
    if (trace.roundtrip) roundtrip++;
    if (trace.incidental) incidental++;
    if (trace.milestoneRatio !== null) {
      ratios.push(trace.milestoneRatio);
      if (trace.milestoneRatio > 0.8) late++;
    }
    postWorks.push(trace.postWork);
    touches.push(trace.specialShare);
    if (trace.delta !== null) deltas.push(trace.delta);
    if (control.visitedStates > 0) stateMult.push(full.visitedStates / control.visitedStates);
    byPair[pair] = byPair[pair] ?? { n: 0, integ: 0, replan: 0, tax: 0, incid: 0 };
    byPair[pair].n++;
    if (trace.integrated) byPair[pair].integ++;
    if (trace.replan) byPair[pair].replan++;
    if (trace.taxOnly) byPair[pair].tax++;
    if (trace.incidental) byPair[pair].incid++;
  }
  rows.push({
    i, seed, pair,
    controlSolvable: control.solvable, controlMoves: control.minMoves ?? null,
    controlVisited: control.visitedStates, controlTruncated: control.truncated ?? false, controlMs,
    fullSolvable: full.solvable, fullMoves: full.minMoves ?? null,
    fullVisited: full.visitedStates, fullTruncated: full.truncated ?? false, fullMs: fms,
    trace,
  });
  if ((i + 1) % 50 === 0) console.log(`B ${i + 1}/${N}`);
}

const bothSolved = rows.filter(
  (r) => (r as { controlSolvable: boolean; fullSolvable: boolean }).controlSolvable && (r as { controlSolvable: boolean; fullSolvable: boolean }).fullSolvable,
).length;

const summary = {
  candidate: 'choice-brew',
  N,
  solvFull: solvFull / N,
  solvControl: solvCtl / N,
  bothSolved,
  truncation: trunc,
  integrated: bothSolved ? integrated / bothSolved : 0,
  replan: bothSolved ? replan / bothSolved : 0,
  taxOnly: bothSolved ? taxOnly / bothSolved : 0,
  roundtrip: bothSolved ? roundtrip / bothSolved : 0,
  incidental: bothSolved ? incidental / bothSolved : 0,
  lateMilestone: bothSolved ? late / bothSolved : 0,
  milestoneP50: pct(ratios, 50),
  milestoneP90: pct(ratios, 90),
  milestoneP95: pct(ratios, 95),
  postWorkHist: {
    '0': postWorks.filter((x) => x === 0).length,
    '1': postWorks.filter((x) => x === 1).length,
    '2-3': postWorks.filter((x) => x >= 2 && x <= 3).length,
    '4+': postWorks.filter((x) => x >= 4).length,
  },
  specialTouchP50: pct(touches, 50),
  specialTouchP90: pct(touches, 90),
  specialTouchP95: pct(touches, 95),
  deltaP50: pct(deltas, 50),
  solverFullP50: pct(fullMs, 50),
  solverFullP95: pct(fullMs, 95),
  solverCtlP95: pct(ctlMs, 95),
  stateMultP50: pct(stateMult, 50),
  stateMultP95: pct(stateMult, 95),
  stateMultMax: stateMult.length ? Math.max(...stateMult) : 0,
  byPair,
  gates: {
    solvGe90: solvFull / N >= 0.9,
    trunc0: trunc === 0,
    p95le300: pct(fullMs, 95) <= 300,
    integOrReplanGe10: (bothSolved ? integrated / bothSolved : 0) >= 0.1 || (bothSolved ? replan / bothSolved : 0) >= 0.1,
    taxLt80: (bothSolved ? taxOnly / bothSolved : 0) < 0.8,
  },
};

console.log(JSON.stringify(summary, null, 2));
const fs = await import('node:fs');
fs.mkdirSync('scripts/dev/out', { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ summary, rows }, null, 2));
console.log(`wrote ${outPath}`);
