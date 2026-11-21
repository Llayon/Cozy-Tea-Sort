/**
 * G29 probe runner (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g29-probe.ts <mixed-buffer|two-tea-buffer|different-tea-buffer> <N> [--out path]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { analyzeG29Board, summarize } from './g29-compatibility-lib.ts';
import type { G29Candidate } from '../../src/game/logic/g29Research.ts';

declare const process: { argv: string[]; exitCode?: number };

const candidate = process.argv[2] as G29Candidate;
const N = Number(process.argv[3]);
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

if (
  !['mixed-buffer', 'two-tea-buffer', 'different-tea-buffer'].includes(candidate) ||
  !Number.isFinite(N) ||
  N <= 0
) {
  console.error('usage: g29-probe.ts <mixed-buffer|two-tea-buffer|different-tea-buffer> <N> [--out path]');
  process.exitCode = 1;
} else {
  const results = [];
  for (let i = 0; i < N; i++) {
    const seed = `g29-probe-${i}`;
    results.push(analyzeG29Board(seed, candidate, i));
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N}`);
  }
  const summary = summarize(results);
  const extra =
    candidate === 'two-tea-buffer'
      ? {
          pairMixTotal: results.reduce((s, r) => s + r.pairMixEvents, 0),
          offPairTotal: results.reduce((s, r) => s + r.offPairReceives, 0),
          ordinaryReceivesTotal: results.reduce((s, r) => s + r.ordinarySpecialReceives, 0),
          pairBias: [0, 1, 2, 3, 4, 5].map((p) => {
            const sub = results.filter((r) => r.pairIndex === p);
            return {
              pairIndex: p,
              boards: sub.length,
              strong: sub.filter((r) => r.strongCausal).length,
              strongRate: sub.length > 0 ? sub.filter((r) => r.strongCausal).length / sub.length : 0,
            };
          }),
        }
      : candidate === 'different-tea-buffer'
        ? {
            differentReceivesTotal: results.reduce((s, r) => s + r.differentReceives, 0),
            sameColorBlocksTotal: results.reduce((s, r) => s + r.sameColorBlocks, 0),
            blockPressureTotal: results.reduce((s, r) => s + r.blockPressureStates, 0),
            blockPressureBoards: results.filter((r) => r.blockPressureStates > 0).length,
          }
        : {
            cyclesTotal: results.reduce((s, r) => s + r.mixedCycles, 0),
            multiRunCyclesTotal: results.reduce((s, r) => s + r.multiRunCycles, 0),
          };
  console.log(JSON.stringify({ candidate, N, summary, ...extra }, null, 2));
  if (outPath) {
    const parts = outPath.split('/');
    mkdirSync(parts.slice(0, -1).join('/') || '.', { recursive: true });
    writeFileSync(outPath, JSON.stringify({ candidate, N, summary, results }, null, 2));
    console.log(`wrote ${outPath}`);
  }
}
