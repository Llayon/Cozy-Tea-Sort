/**
 * G20 DEV diagnostics: plain marker-removal control + no-flask control.
 * Uses the 18 curated F0 templates only (no runtime mining).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { applyPourState } from '../../src/game/logic/rules.ts';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  defaultCupConstraints,
  emptyFloatingIngredients,
  isSteepingFlaskConstraint,
  type CupConstraint,
  type TeaId,
} from '../../src/game/types.ts';
import {
  ALL_STEEPING_FLASK_TEMPLATES,
  instantiateSteepingFlaskTemplate,
} from '../../src/game/logic/steepingFlaskTemplates.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function flush(p: number): number | null {
  if (!Number.isFinite(p)) return null;
  return Math.round(p * 100) / 100;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

const rows = [];
let controlBreaks = 0;
let positiveDelta = 0;
let noFlaskSolvable = 0;
const controlDepths: number[] = [];
const noFlaskDepths: number[] = [];
const noFlaskMs: number[] = [];

for (const tpl of ALL_STEEPING_FLASK_TEMPLATES) {
  const inst = instantiateSteepingFlaskTemplate(tpl, PALETTE, [...PALETTE]);
  const ownC: CupConstraint[] = defaultCupConstraints(inst.cups.length);
  ownC[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  const controlC = ownC.map((c, i) =>
    i === inst.flaskSlot
      ? ({ mode: c.mode, capacity: c.capacity, mustEndEmpty: c.mustEndEmpty } as CupConstraint)
      : c,
  );
  const ownStarted = performance.now();
  const own = solvePuzzle(inst.cups, {
    cupConstraints: ownC,
    floatingIngredients: emptyFloatingIngredients(inst.cups.length),
    maxVisited: 200_000,
  });
  const ownMs = performance.now() - ownStarted;
  const controlStarted = performance.now();
  const control = solvePuzzle(inst.cups, {
    cupConstraints: controlC,
    floatingIngredients: emptyFloatingIngredients(inst.cups.length),
    maxVisited: 200_000,
  });
  const controlMs = performance.now() - controlStarted;
  let state = {
    cups: inst.cups.map((c) => [...c]),
    floatingIngredients: emptyFloatingIngredients(inst.cups.length),
  };
  let breaks = false;
  for (const action of control.solution ?? []) {
    if (action.kind !== 'pour') continue;
    const before = state.cups[inst.flaskSlot] as TeaId[];
    if (action.from === inst.flaskSlot && before.length >= 1 && before.length <= 3) breaks = true;
    const result = applyPourState(state, action.from, action.to, controlC);
    if (!result) break;
    state = result.state;
  }
  if (breaks) controlBreaks++;
  if (control.solvable && own.minMoves > control.minMoves) positiveDelta++;
  controlDepths.push(control.minMoves);

  const noFlaskCups = inst.cups.filter((_, i) => i !== inst.flaskSlot);
  const noFlaskConstraints = defaultCupConstraints(noFlaskCups.length);
  const noFlaskStarted = performance.now();
  const noFlask = solvePuzzle(noFlaskCups, {
    cupConstraints: noFlaskConstraints,
    floatingIngredients: emptyFloatingIngredients(noFlaskCups.length),
    maxVisited: 200_000,
  });
  const noFlaskMsValue = performance.now() - noFlaskStarted;
  if (noFlask.solvable) {
    noFlaskSolvable++;
    noFlaskDepths.push(noFlask.minMoves);
  }
  noFlaskMs.push(noFlaskMsValue);

  rows.push({
    id: tpl.id,
    depth: tpl.depth,
    ownMs: flush(ownMs),
    controlSolvable: control.solvable,
    controlMinMoves: control.solvable ? control.minMoves : null,
    controlMs: flush(controlMs),
    controlBreaksSteeping: breaks,
    noFlaskSolvable: noFlask.solvable,
    noFlaskMinMoves: noFlask.solvable ? noFlask.minMoves : null,
    noFlaskMs: flush(noFlaskMsValue),
  });
}

const out = {
  gauntlet: 'G20',
  bankSize: ALL_STEEPING_FLASK_TEMPLATES.length,
  controlBreaksSteeping: controlBreaks,
  positiveMinMoveDelta: positiveDelta,
  controlDepth: { p50: median(controlDepths), values: controlDepths },
  noFlaskControl: {
    solvable: noFlaskSolvable,
    n: ALL_STEEPING_FLASK_TEMPLATES.length,
    depths: noFlaskDepths,
    solverMs: { p50: median(noFlaskMs), max: Math.max(...noFlaskMs) },
  },
  rows,
};
const OUT = resolve(import.meta.dirname, 'out/g20-flask-control.json');
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, rows: undefined }, null, 2));
console.log(`wrote ${OUT}`);
