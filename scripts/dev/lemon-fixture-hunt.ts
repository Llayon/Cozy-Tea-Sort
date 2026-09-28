/** Dev-only: hunt a compact hand fixture with genuine lemon travel. */
import { solvePuzzle } from '../../src/game/logic/solver';
import { applyPourState, isPuzzleWonState } from '../../src/game/logic/rules';
import { floatingIngredientIndex } from '../../src/game/types';
import type { CupConstraint, FloatingIngredientSlot, TeaId } from '../../src/game/types';

const M: TeaId = 'matcha';
const SB: TeaId = 'sea_buckthorn';
const K: TeaId = 'karkade';
const N: CupConstraint = { mode: 'normal' };

const candidates: Array<{ name: string; cups: TeaId[][]; slots: FloatingIngredientSlot[] }> = [
  {
    name: 'ride-out-and-back',
    cups: [[K, SB, M, M], [M, K, K, SB], [SB, M, K, SB], [], []],
    slots: [null, null, 'lemon', null, null],
  },
  {
    name: 'buckthorn-taxi',
    cups: [[SB, M, K, K], [K, SB, M, M], [M, K, SB, SB], [], []],
    slots: ['lemon', null, null, null, null],
  },
  {
    name: 'two-hop',
    cups: [[M, SB, SB, K], [K, M, M, SB], [SB, K, K, M], [], []],
    slots: [null, 'lemon', null, null, null],
  },
];

for (const { name, cups, slots } of candidates) {
  const constraints: CupConstraint[] = cups.map(() => ({ ...N }));
  const solved = solvePuzzle(cups, { cupConstraints: constraints, floatingIngredients: slots });
  const sol = solved.solution ?? [];
  // Count relocations across the replay.
  let board = { cups: cups.map((c) => [...c]), floatingIngredients: [...slots] };
  let relocations = 0;
  let ok = true;
  for (const m of sol) {
    const before = floatingIngredientIndex(board, 'lemon');
    const res = applyPourState(board, m.from, m.to, constraints);
    if (!res) { ok = false; break; }
    board = { cups: res.state.cups, floatingIngredients: res.state.floatingIngredients };
    if (floatingIngredientIndex(board, 'lemon') !== before) relocations++;
  }
  const won = ok && isPuzzleWonState(board, constraints);
  const finalHost = floatingIngredientIndex(board, 'lemon');
  console.log(`${name}: solvable=${solved.solvable} minMoves=${solved.minMoves} relocations=${relocations} won=${won} finalHost=${finalHost} finalCup=${JSON.stringify(board.cups[finalHost])}`);
  if (solved.solvable) console.log(`  path: ${sol.map((m) => `${m.from}->${m.to}x${m.count}`).join(' ')}`);
}
