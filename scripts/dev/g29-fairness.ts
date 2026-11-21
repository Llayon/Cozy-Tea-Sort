/**
 * G29 fairness probe (DEV ONLY). Runs only for N2000 survivors (§110).
 * Usage: bunx tsx scripts/dev/g29-fairness.ts <mixed-buffer|two-tea-buffer|different-tea-buffer> [N=50] [--out path]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  analyzeG29Board,
  dealG29Board,
  g29ControlConstraints,
  g29FullConstraints,
  G29_SPECIAL_INDEX,
} from './g29-compatibility-lib.ts';
import { applyPourState, listLegalMovesState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { G29Candidate } from '../../src/game/logic/g29Research.ts';

declare const process: { argv: string[]; exitCode?: number };

const candidate = process.argv[2] as G29Candidate;
const N = Number(process.argv[3] ?? 50);
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

if (
  !['mixed-buffer', 'two-tea-buffer', 'different-tea-buffer'].includes(candidate) ||
  !Number.isFinite(N) ||
  N <= 0
) {
  console.error('usage: g29-fairness.ts <mixed-buffer|two-tea-buffer|different-tea-buffer> [N] [--out path]');
  process.exitCode = 1;
} else {
  interface FairRow {
    seed: string;
    fullSolvable: boolean;
    controlSolvable: boolean;
    legalRoots: number;
    constructiveRoots: number;
    solvableRoots: number;
    optimalRoots: number;
    fatalRoots: number;
    compatTrap: boolean;
  }
  const rows: FairRow[] = [];
  for (let i = 0; i < N; i++) {
    const seed = `g29-fair-${i}`;
    const seedIndex = i;
    const { cups } = dealG29Board(seed, candidate, seedIndex);
    const full = g29FullConstraints(candidate, seedIndex);
    void G29_SPECIAL_INDEX;
    const state = { cups } as never;
    const legal = listLegalMovesState(state, false, full);
    const constructive = listLegalMovesState(state, true, full);
    const base = analyzeG29Board(seed, candidate, seedIndex);
    let solvableRoots = 0;
    let optimalRoots = 0;
    let fatalRoots = 0;
    if (base.fullSolvable && base.fullMoves !== undefined) {
      for (const mv of legal) {
        const res = applyPourState(state, mv.from, mv.to, full);
        if (!res) {
          fatalRoots++;
          continue;
        }
        const child = solvePuzzle(res.state.cups as never, {
          cupConstraints: full,
          maxVisited: 200_000,
          maxDepth: 60,
          returnSolution: false,
        });
        if (child.solvable) {
          solvableRoots++;
          if (child.minMoves === (base.fullMoves as number) - 1) optimalRoots++;
        } else {
          fatalRoots++;
        }
      }
    } else {
      fatalRoots = legal.length;
    }
    const control = g29ControlConstraints(full);
    const ctrl = solvePuzzle(cups as never, {
      cupConstraints: control,
      maxVisited: 200_000,
      maxDepth: 60,
      returnSolution: false,
    });
    rows.push({
      seed,
      fullSolvable: base.fullSolvable,
      controlSolvable: ctrl.solvable,
      legalRoots: legal.length,
      constructiveRoots: constructive.length,
      solvableRoots,
      optimalRoots,
      fatalRoots,
      compatTrap: !base.fullSolvable && ctrl.solvable,
    });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${N}`);
  }
  const doom = rows.filter((r) => !r.fullSolvable).length;
  const traps = rows.filter((r) => r.compatTrap).length;
  const avg = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const summary = {
    candidate,
    N,
    doom,
    compatTraps: traps,
    avgLegalRoots: avg(rows.map((r) => r.legalRoots)),
    avgConstructiveRoots: avg(rows.map((r) => r.constructiveRoots)),
    avgSolvableRoots: avg(rows.map((r) => r.solvableRoots)),
    avgOptimalRoots: avg(rows.map((r) => r.optimalRoots)),
    avgFatalRoots: avg(rows.map((r) => r.fatalRoots)),
  };
  console.log(JSON.stringify(summary, null, 2));
  if (outPath) {
    const parts = (outPath as string).split('/');
    mkdirSync(parts.slice(0, -1).join('/') || '.', { recursive: true });
    writeFileSync(outPath as string, JSON.stringify({ summary, rows }, null, 2));
    console.log(`wrote ${outPath}`);
  }
}
