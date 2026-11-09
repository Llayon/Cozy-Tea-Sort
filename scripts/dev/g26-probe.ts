/**
 * G26 probe runner (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g26-probe.ts <candidate> <N> [--out path]
 * candidate: bottom-draw | pair-ready | linked-gate
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { analyzeG26Board, summarize, type G26Candidate } from './g26-access-lib.ts';

const candidate = process.argv[2] as G26Candidate;
const N = Number(process.argv[3]);
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

if (!['bottom-draw', 'pair-ready', 'linked-gate'].includes(candidate) || !Number.isFinite(N) || N <= 0) {
  console.error('usage: g26-probe.ts <bottom-draw|pair-ready|linked-gate> <N> [--out path]');
  process.exit(1);
}

const results = [];
for (let i = 0; i < N; i++) {
  const seed = `g26-${candidate}-probe-${i}`;
  results.push(analyzeG26Board(seed, candidate));
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N}`);
}

const summary = summarize(results);
console.log(JSON.stringify({ candidate, N, summary }, null, 2));

// Candidate-specific extras.
if (candidate === 'bottom-draw') {
  const causal = results.filter((r) => r.causal);
  const depths = causal.map((r) => r.causalDepthRatio ?? 0).sort((a, b) => a - b);
  const shares = results
    .filter((r) => r.fullSolvable)
    .map((r) => r.specialSourceMoves / Math.max(1, r.totalMoves))
    .sort((a, b) => a - b);
  const quant = (arr: number[], q: number) => (arr.length === 0 ? 0 : arr[Math.min(arr.length - 1, Math.floor(q * arr.length))]);
  console.log(
    JSON.stringify(
      {
        causalTiming_le070: depths.filter((d) => d <= 0.7).length / Math.max(1, depths.length),
        causalTiming_le050: depths.filter((d) => d <= 0.5).length / Math.max(1, depths.length),
        moveShare_p50: quant(shares, 0.5),
        moveShare_p90: quant(shares, 0.9),
        moveShare_p95: quant(shares, 0.95),
      },
      null,
      2,
    ),
  );
}
if (candidate === 'linked-gate') {
  const solved = results.filter((r) => r.fullSolvable);
  console.log(
    JSON.stringify(
      { valveNeverUsedRate: solved.filter((r) => r.valveNeverUsed).length / Math.max(1, solved.length) },
      null,
      2,
    ),
  );
}

if (outPath) {
  mkdirSync(outPath.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  writeFileSync(outPath, JSON.stringify({ candidate, N, summary, results }, null, 2));
  console.log(`wrote ${outPath}`);
}
