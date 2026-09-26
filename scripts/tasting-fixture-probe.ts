/** Dev-only: probe hand-fixture candidates for tasting participation. */
import { solvePuzzle, applySolution } from '../src/game/logic/solver';
import { isWonState } from '../src/game/logic/rules';
import type { CupConstraint, TeaId } from '../src/game/types';

const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'lavender';
const N: CupConstraint = { mode: 'normal' };
const T: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

const candidates: Array<{ name: string; cups: TeaId[][]; constraints: CupConstraint[] }> = [
  {
    name: 'alt-2c',
    cups: [[B, A, B, A], [A, B, A, B], [], []],
    constraints: [N, N, N, T],
  },
  {
    name: 'swap-3c',
    cups: [[C, B, A, A], [A, C, B, B], [B, A, C, C], [], []],
    constraints: [N, N, N, N, T],
  },
  {
    name: 'tower-3c',
    cups: [[B, C, A, A], [C, A, B, B], [A, B, C, C], [], []],
    constraints: [N, N, N, N, T],
  },
  {
    name: 'tight-3c',
    cups: [[C, B, A, A], [A, C, B, B], [B, A, C, C], []],
    constraints: [N, N, N, T],
  },
  {
    name: 'tight-3c-b',
    cups: [[B, C, B, A], [C, A, C, B], [A, B, A, C], []],
    constraints: [N, N, N, T],
  },
];

for (const { name, cups, constraints } of candidates) {
  const t = cups.length - 1;
  const solved = solvePuzzle(cups, { cupConstraints: constraints });
  const sol = solved.solution ?? [];
  const enters = sol.some((m) => m.to === t);
  const exits = sol.some((m) => m.from === t);
  const final = solved.solvable ? applySolution(cups, sol, constraints) : null;
  console.log(
    `${name}: solvable=${solved.solvable} minMoves=${solved.minMoves} enters=${enters} exits=${exits} ` +
    `won=${final ? isWonState(final, constraints) : false} finalTasting=${JSON.stringify(final?.[t])}`,
  );
  if (solved.solvable) {
    console.log(`  path: ${sol.map((m) => `${m.from}->${m.to}x${m.count}`).join(' ')}`);
  }
}
