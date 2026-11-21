/**
 * G28 probe runner (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g28-probe.ts <underpour|reverse-receive|full-flip> <N> [--out path]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { analyzeG28Board, summarize } from './g28-stack-lib.ts';
import type { G28Candidate } from '../../src/game/logic/g28Research.ts';

declare const process: { argv: string[]; exitCode?: number };

const candidate = process.argv[2] as G28Candidate;
const N = Number(process.argv[3]);
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

if (
  !['underpour', 'reverse-receive', 'full-flip'].includes(candidate) ||
  !Number.isFinite(N) ||
  N <= 0
) {
  console.error('usage: g28-probe.ts <underpour|reverse-receive|full-flip> <N> [--out path]');
  process.exitCode = 1;
} else {
  const results = [];
  for (let i = 0; i < N; i++) {
    const seed = `g28-probe-${i}`;
    results.push(analyzeG28Board(seed, candidate));
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N}`);
  }
  const summary = summarize(results);
  const extra =
    candidate === 'underpour'
      ? {
          underpourHist: {
            zero: results.filter((r) => r.fullSolvable && r.underpourEvents === 0).length,
            one: results.filter((r) => r.fullSolvable && r.underpourEvents === 1).length,
            two: results.filter((r) => r.fullSolvable && r.underpourEvents === 2).length,
            threePlus: results.filter((r) => r.fullSolvable && r.underpourEvents >= 3).length,
          },
          preservedTopHist: {
            zero: results.filter((r) => r.fullSolvable && r.preservedTopUses === 0).length,
            one: results.filter((r) => r.fullSolvable && r.preservedTopUses === 1).length,
            twoPlus: results.filter((r) => r.fullSolvable && r.preservedTopUses >= 2).length,
          },
        }
      : candidate === 'reverse-receive'
        ? {
            reverseHist: {
              zero: results.filter((r) => r.fullSolvable && r.reverseEvents === 0).length,
              one: results.filter((r) => r.fullSolvable && r.reverseEvents === 1).length,
              two: results.filter((r) => r.fullSolvable && r.reverseEvents === 2).length,
              threePlus: results.filter((r) => r.fullSolvable && r.reverseEvents >= 3).length,
            },
            exposeHist: {
              zero: results.filter((r) => r.fullSolvable && r.exposeUses === 0).length,
              one: results.filter((r) => r.fullSolvable && r.exposeUses === 1).length,
              twoPlus: results.filter((r) => r.fullSolvable && r.exposeUses >= 2).length,
            },
          }
        : {
            flipHist: {
              zero: results.filter((r) => r.fullSolvable && r.flipEvents === 0).length,
              one: results.filter((r) => r.fullSolvable && r.flipEvents === 1).length,
              twoPlus: results.filter((r) => r.fullSolvable && r.flipEvents >= 2).length,
            },
            causalFlipHist: {
              zero: results.filter((r) => r.fullSolvable && r.causalFlips === 0).length,
              one: results.filter((r) => r.fullSolvable && r.causalFlips === 1).length,
              twoPlus: results.filter((r) => r.fullSolvable && r.causalFlips >= 2).length,
            },
          };
  console.log(JSON.stringify({ candidate, N, summary, ...extra }, null, 2));
  if (outPath) {
    const parts = outPath.split('/');
    mkdirSync(parts.slice(0, -1).join('/') || '.', { recursive: true });
    writeFileSync(outPath, JSON.stringify({ candidate, N, summary, results }, null, 2));
    console.log(`wrote ${outPath}`);
  }
}
