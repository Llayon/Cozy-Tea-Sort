/** G28 diagnostic: do optimal replays ever receive into a NONEMPTY special? */
import { dealG28Board } from './g28-stack-lib.ts';
import { applyPuzzleActionState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { G28Candidate } from '../../src/game/logic/g28Research.ts';

declare const process: { argv: string[] };

const candidates = ['underpour', 'reverse-receive', 'full-flip'] as G28Candidate[];
for (const c of candidates) {
  let boards = 0;
  let intoEmpty = 0;
  let intoNonempty = 0;
  let fromSpecial = 0;
  for (let i = 0; i < 100; i++) {
    const { cups, constraints } = dealG28Board(`g28-probe-${i}`, c);
    const res = solvePuzzle(cups, { cupConstraints: constraints });
    if (!res.solvable || !res.solution) continue;
    boards++;
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
        else intoNonempty++;
      }
      if (from === 4) fromSpecial++;
      const r = applyPuzzleActionState(board as never, a as never, constraints as never);
      if (!r) break;
      board = r.state as typeof board;
    }
  }
  console.log(`${c}: boards=${boards} intoEmpty=${intoEmpty} intoNonempty=${intoNonempty} fromSpecial=${fromSpecial}`);
}
void process;
