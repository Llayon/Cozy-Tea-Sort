/**
 * G27 fairness probe (DEV ONLY). Runs only for N2000 survivors (§104).
 * Usage: bunx tsx scripts/dev/g27-fairness.ts <tea-bridge|one-way|two-lane> [N=50] [--out path]
 *
 * Per board: legal/constructive/solvable/optimal root moves, fatal first
 * moves, doom (FULL unsolvable), unavoidable graph trap (FULL unsolvable
 * but CONTROL solvable).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  analyzeG27Board,
  dealG27Board,
  g27ControlConstraints,
  g27FullConstraints,
  type G27Candidate,
} from './g27-routing-lib.ts';
import {
  applyPourState,
  isConstructiveMoveState,
  listLegalMovesState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';

declare const process: { argv: string[]; exitCode?: number };

const candidate = process.argv[2] as G27Candidate;
const N = Number(process.argv[3] ?? 50);
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

if (!['tea-bridge', 'one-way', 'two-lane'].includes(candidate) || !Number.isFinite(N) || N <= 0) {
  console.error('usage: g27-fairness.ts <tea-bridge|one-way|two-lane> [N] [--out path]');
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
    graphTrap: boolean;
  }
  const rows: FairRow[] = [];
  for (let i = 0; i < N; i++) {
    const seed = `g27-${candidate}-fair-${i}`;
    const { cups } = dealG27Board(seed, candidate);
    const full = g27FullConstraints(candidate);
    const control = g27ControlConstraints(full);
    const state = { cups } as never;
    const legal = listLegalMovesState(state, false, full);
    const constructive = listLegalMovesState(state, true, full);
    const base = analyzeG27Board(seed, candidate);
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
    rows.push({
      seed,
      fullSolvable: base.fullSolvable,
      controlSolvable: base.controlSolvable,
      legalRoots: legal.length,
      constructiveRoots: constructive.length,
      solvableRoots,
      optimalRoots,
      fatalRoots,
      graphTrap: !base.fullSolvable && base.controlSolvable,
    });
    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${N}`);
  }
  const doom = rows.filter((r) => !r.fullSolvable).length;
  const traps = rows.filter((r) => r.graphTrap).length;
  const avg = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
  const summary = {
    candidate,
    N,
    doom,
    graphTraps: traps,
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
