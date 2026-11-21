/** G28 diagnostic 2: classify into-nonempty receives by tea match. */
import { dealG28Board } from './g28-stack-lib.ts';
import { applyPuzzleActionState, topLayerOf } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { G28Candidate } from '../../src/game/logic/g28Research.ts';

const candidates = ['underpour', 'reverse-receive', 'full-flip'] as G28Candidate[];
for (const c of candidates) {
  let match = 0;
  let differ = 0;
  for (let i = 0; i < 100; i++) {
    const { cups, constraints } = dealG28Board(`g28-probe-${i}`, c);
    const res = solvePuzzle(cups, { cupConstraints: constraints });
    if (!res.solvable || !res.solution) continue;
    let board = {
      cups: cups.map((x) => [...x]),
      floatingIngredients: cups.map(() => null),
      sinkingIngredients: cups.map(() => null),
      strainer: { present: false, attachedCupIndex: null, heldTea: null },
      iceSlots: cups.map(() => null),
      capacityObstacles: cups.map(() => null),
      teaBudSlots: cups.map(() => null),
    };
    for (const a of res.solution) {
      if (a.kind !== 'pour') continue;
      const from = (a as { from: number }).from;
      const to = (a as { to: number }).to;
      if (to === 4 && (board.cups[4] as unknown[]).length > 0) {
        const top = topLayerOf(board.cups[4] as never[]);
        const src = topLayerOf(board.cups[from] as never[]);
        if (top === src) match++;
        else differ++;
      }
      const r = applyPuzzleActionState(board as never, a as never, constraints as never);
      if (!r) break;
      board = r.state as typeof board;
    }
  }
  console.log(`${c}: intoNonemptyMatch=${match} intoNonemptyDiffer=${differ}`);
}
