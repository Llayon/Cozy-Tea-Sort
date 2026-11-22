/**
 * G30 fairness (DEV ONLY, 50 deterministic boards).
 * Usage: bunx tsx scripts/dev/g30-fairness.ts a|b [N]
 */
import {
  g30ContractA,
  g30ContractB,
  g30Deal,
  type BrewMilestoneContract,
} from './g30-milestone-lib.ts';
import { g30Constraints } from './g30-milestone-lib.ts';
import {
  applyPourState,
  listConstructiveActionsState,
  listLegalMovesState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';

declare const process: { argv: readonly string[] };

function pct(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

const which = process.argv[2] ?? 'a';
const N = Number(process.argv[3] ?? 50);
const MAXV = 200_000;

function contractFor(i: number): BrewMilestoneContract {
  if (which === 'b') return g30ContractB(i);
  return g30ContractA(i);
}

const legalCounts: number[] = [];
const constrCounts: number[] = [];
const solvCounts: number[] = [];
const optCounts: number[] = [];
const fatalCounts: number[] = [];
const windowTrapBoards: number[] = [];
let doom = 0;
let totalWindowTraps = 0;

for (let i = 0; i < N; i++) {
  const seed = `g30-fair-${i}`;
  const cups = g30Deal(seed);
  const contract = contractFor(i);
  const constraints = g30Constraints();
  const start = {
    cups: cups.map((c) => [...c]),
    floatingIngredients: cups.map(() => null),
    sinkingIngredients: cups.map(() => null),
    strainer: { present: false, attachedCupIndex: null, heldTea: null },
    iceSlots: cups.map(() => null),
    capacityObstacles: cups.map(() => null),
    teaBudSlots: cups.map(() => null),
    brewMilestone: { stage: 0 },
  };
  const startCtl = {
    cups: cups.map((c) => [...c]),
    floatingIngredients: cups.map(() => null),
  };
  const legal = listLegalMovesState(start as never, false, constraints, undefined);
  const constr = listConstructiveActionsState(start as never, constraints, undefined).filter((a) => a.kind === 'pour');
  const full0 = solvePuzzle(cups, { cupConstraints: constraints, maxVisited: MAXV, brewContract: contract });
  const ctl0 = solvePuzzle(cups, { cupConstraints: constraints, maxVisited: MAXV });
  const fullMin = full0.solvable ? (full0.minMoves as number) : null;
  const ctlMin = ctl0.solvable ? (ctl0.minMoves as number) : null;
  let solv = 0;
  let opt = 0;
  let fatal = 0;
  let windowTrap = 0;
  for (const m of legal) {
    if (m.kind !== 'pour') continue;
    const resFull = applyPourState(start, m.from, m.to, constraints, undefined, contract);
    if (!resFull) continue;
    const childFull = solvePuzzle(resFull.state.cups, {
      cupConstraints: constraints,
      maxVisited: MAXV,
      brewContract: contract,
      brewInitialStage: resFull.state.brewMilestone?.stage ?? 0,
    });
    const okFull = childFull.solvable && !childFull.truncated;
    if (okFull) {
      solv++;
      if (fullMin !== null && childFull.minMoves === fullMin - 1) opt++;
    } else if (!childFull.truncated) {
      fatal++;
    }
    // Window trap: CONTROL-optimal but FULL-fatal.
    const resCtl = applyPourState(start as never, m.from, m.to, constraints, undefined, undefined);
    if (!resCtl) continue;
    const childCtl = solvePuzzle(resCtl.state.cups, { cupConstraints: constraints, maxVisited: MAXV });
    const ctlOptimal = childCtl.solvable && !childCtl.truncated && ctlMin !== null && childCtl.minMoves === ctlMin - 1;
    if (ctlOptimal && !okFull && !childFull.truncated) {
      windowTrap++;
    }
  }
  legalCounts.push(legal.filter((a) => a.kind === 'pour').length);
  constrCounts.push(constr.length);
  solvCounts.push(solv);
  optCounts.push(opt);
  fatalCounts.push(fatal);
  windowTrapBoards.push(windowTrap);
  totalWindowTraps += windowTrap;
  if (solv === 0) doom++;
  if ((i + 1) % 10 === 0) console.log(`fair ${which} ${i + 1}/${N}`);
}

console.log(`\n===== G30 FAIRNESS ${which.toUpperCase()} N=${N} =====`);
console.log(`legal root med=${pct(legalCounts, 50)} p90=${pct(legalCounts, 90)}`);
console.log(`constructive root med=${pct(constrCounts, 50)} p90=${pct(constrCounts, 90)}`);
console.log(`solvable root med=${pct(solvCounts, 50)} p90=${pct(solvCounts, 90)}`);
console.log(`optimal root med=${pct(optCounts, 50)}`);
console.log(`fatal med=${pct(fatalCounts, 50)} p90=${pct(fatalCounts, 90)}`);
console.log(`doom=${doom}/${N}`);
console.log(`windowTrap boards with >=1: ${windowTrapBoards.filter((x) => x > 0).length}/${N} totalTraps=${totalWindowTraps}`);
