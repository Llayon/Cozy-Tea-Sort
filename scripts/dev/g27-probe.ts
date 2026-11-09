/**
 * G27 probe runner (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g27-probe.ts <tea-bridge|one-way|two-lane> <N> [--out path]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { analyzeG27Board, summarize, type G27Candidate } from './g27-routing-lib.ts';

declare const process: { argv: string[]; exitCode?: number };

const candidate = process.argv[2] as G27Candidate;
const N = Number(process.argv[3]);
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

if (
  !['tea-bridge', 'one-way', 'two-lane'].includes(candidate) ||
  !Number.isFinite(N) ||
  N <= 0
) {
  console.error('usage: g27-probe.ts <tea-bridge|one-way|two-lane> <N> [--out path]');
  process.exitCode = 1;
} else {
  const results = [];
  for (let i = 0; i < N; i++) {
    const seed = `g27-${candidate}-probe-${i}`;
    results.push(analyzeG27Board(seed, candidate));
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N}`);
  }

  const summary = summarize(results);
  const laneExtra =
    candidate === 'two-lane'
      ? {
          laneAUsage: results.filter((r) => r.fullSolvable && r.laneAUsed).length,
          laneBUsage: results.filter((r) => r.fullSolvable && r.laneBUsed).length,
          multiLane: results.filter((r) => r.causal && r.laneAUsed && r.laneBUsed).length,
          multiLaneRate:
            results.filter((r) => r.causal).length > 0
              ? results.filter((r) => r.causal && r.laneAUsed && r.laneBUsed).length /
                Math.max(1, results.filter((r) => r.causal).length)
              : 0,
        }
      : {};
  console.log(JSON.stringify({ candidate, N, summary, ...laneExtra }, null, 2));

  if (outPath) {
    const parts = outPath.split('/');
    mkdirSync(parts.slice(0, -1).join('/') || '.', { recursive: true });
    writeFileSync(outPath, JSON.stringify({ candidate, N, summary, results }, null, 2));
    console.log(`wrote ${outPath}`);
  }
}
