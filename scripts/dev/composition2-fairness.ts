/**
 * G21 E6 FLASK_TRAY fairness (DEV evidence): 50 representative C2 boards
 * from the curated 12-template bank × deterministic role permutations.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CupConstraint,
  TeaId,
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  defaultCupConstraints,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  isConstructiveMoveState,
  isPuzzleWonState,
  listConstructiveActionsState,
} from '../../src/game/logic/rules.ts';
import { applySolutionState, solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES,
  instantiateSteepingFlaskSharedTrayTemplate,
} from '../../src/game/logic/steepingFlaskSharedTrayTemplates.ts';
import { PROFILES, fullActive, fullConstraints, mechanicsFor } from './composition2-search.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 2, 3, 0],
  [3, 0, 2, 1],
];

function instantiate(tpl: (typeof ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES)[number], order: TeaId[]) {
  const inst = instantiateSteepingFlaskSharedTrayTemplate(tpl, PALETTE, order);
  const cons = fullConstraints(PROFILES.E6, 0, 1);
  for (const member of inst.trayMembers) {
    cons[member] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  }
  cons[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  return { cups: inst.cups, cons };
}

const rows = [];
for (const tpl of ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES) {
  for (const perm of PERMS) {
    if (rows.length >= 50) break;
    const order = perm.map((i) => PALETTE[i] as TeaId);
    const { cups, cons } = instantiate(tpl, order);
    const solved = solvePuzzle(cups, {
      cupConstraints: cons,
      floatingIngredients: emptyFloatingIngredients(cups.length),
      maxVisited: 200_000,
      maxDepth: 60,
      returnSolution: true,
    });
    if (!solved.solvable || solved.truncated || !solved.solution || solved.minMoves === undefined) continue;
    const finalState = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
      solved.solution,
      cons,
    );
    if (!finalState || !isPuzzleWonState(finalState, cons)) continue;
    const mechanics = mechanicsFor(PROFILES.E6, cups, solved.solution, cons, 0, 1);
    if (!fullActive(mechanics)) continue;
    const start = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
    const first = listConstructiveActionsState(start, cons).filter(
      (a): a is { kind: 'pour'; from: number; to: number } => a.kind === 'pour',
    );
    let anySolvable = false;
    let anyOptimal = false;
    let allFatal = true;
    let fatal = 0;
    for (const action of first) {
      if (!isConstructiveMoveState(start, action.from, action.to, cons)) continue;
      const result = applyPourState(start, action.from, action.to, cons);
      if (!result) continue;
      const after = solvePuzzle(result.state.cups as TeaId[][], {
        cupConstraints: cons,
        floatingIngredients: emptyFloatingIngredients(cups.length),
        maxVisited: 200_000,
        maxDepth: 60,
      });
      if (after.solvable && !after.truncated) {
        anySolvable = true;
        allFatal = false;
        if (after.minMoves === solved.minMoves - 1) anyOptimal = true;
      } else if (!after.truncated) {
        fatal++;
      }
    }
    rows.push({
      template: tpl.id,
      perm,
      depth: solved.minMoves,
      rootConstructive: first.length,
      solvableFirst: anySolvable,
      optimalFirst: anyOptimal,
      fatalFirstMoves: fatal,
      doomed: allFatal && first.length > 0,
      c3: tpl.c3,
      c3x: tpl.c3x,
    });
  }
  if (rows.length >= 50) break;
}

const out = {
  gauntlet: 'G21',
  candidate: 'E6 FLASK_TRAY',
  candidates: rows.length,
  rootConstructive: rows.filter((r) => r.rootConstructive > 0).length,
  solvableFirst: rows.filter((r) => r.solvableFirst).length,
  optimalFirst: rows.filter((r) => r.optimalFirst).length,
  fatalFirstMoves: rows.reduce((sum, r) => sum + r.fatalFirstMoves, 0),
  totalFirstMoves: rows.reduce((sum, r) => sum + r.rootConstructive, 0),
  doomedCandidates: rows.filter((r) => r.doomed).length,
  rows,
};
const OUT = resolve(import.meta.dirname, 'out/g21-flask-tray-fairness.json');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, rows: undefined }, null, 2));
console.log(`wrote ${OUT}`);
