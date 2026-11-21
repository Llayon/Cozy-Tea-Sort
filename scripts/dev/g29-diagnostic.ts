/** G29 diagnostic: classify optimal-replay receives into the special vessel. */
import { dealG29Board } from './g29-compatibility-lib.ts';
import { applyPuzzleActionState, topLayerOf } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { G29Candidate } from '../../src/game/logic/g29Research.ts';

const candidates = ['mixed-buffer', 'two-tea-buffer', 'different-tea-buffer'] as G29Candidate[];
for (const c of candidates) {
  let intoEmpty = 0;
  let match = 0;
  let differ = 0;
  for (let i = 0; i < 100; i++) {
    const { cups, constraints } = dealG29Board(`g29-probe-${i}`, c, i);
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
      if (to === 4) {
        if ((board.cups[4] as unknown[]).length === 0) intoEmpty++;
        else {
          const top = topLayerOf(board.cups[4] as never[]);
          const src = topLayerOf(board.cups[from] as never[]);
          if (top === src) match++;
          else differ++;
        }
      }
      const r = applyPuzzleActionState(board as never, a as never, constraints as never);
      if (!r) break;
      board = r.state as typeof board;
    }
  }
  console.log(`${c}: intoEmpty=${intoEmpty} intoNonemptyMatch=${match} intoNonemptyDiffer=${differ}`);
}
