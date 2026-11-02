/**
 * G21 composition research harness (DEV ONLY).
 *
 * Candidate classes:
 *   A FLASK_ORDER     flask + serving order
 *   B TRAY_ORDER      shared tray + serving order
 *   C PAIR_TASTING    tea pair + tasting
 *   D FLASK_PAIR      steeping flask + tea pair
 *   E FLASK_TRAY      steeping flask + shared tray
 *
 * FULL solve first. Controls are solved only for C2 boards, as in G15.
 * No production code, no runtime mining, no new solver/pour/state.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CupConstraint,
  STEEPING_FLASK_CONSTRAINT,
  TeaId,
  cloneCupConstraint,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  isSteepingFlaskReady,
  pourCountState,
  pourRejectCodeState,
} from '../../src/game/logic/rules.ts';
import { applySolutionState, solvePuzzle } from '../../src/game/logic/solver.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import { servedPrefixLength } from '../../src/game/logic/servingOrder.ts';
import {
  pairedTeaStatus,
  type PairedTeaStatus,
} from '../../src/game/logic/teaPair.ts';
import {
  analyzeServingTrace,
  stripOrders,
} from './serving-order-search.ts';
import {
  analyzePairTrace,
  stripPair,
} from './tea-pair-search.ts';
import { stripTray } from './shared-tray-search.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const MAX_VISITED = 200_000;
const MAX_DEPTH = 60;
const ORDER_EARLY = 0.8;

export type CandidateId = 'A6' | 'B6' | 'C6' | 'C7' | 'D6' | 'D7' | 'E6' | 'E7';
type Mechanic = 'order' | 'flask' | 'tray' | 'pair' | 'tasting';

export interface ProfileDef {
  id: CandidateId;
  label: 'FLASK_ORDER' | 'TRAY_ORDER' | 'PAIR_TASTING' | 'FLASK_PAIR' | 'FLASK_TRAY';
  mechanics: readonly [Mechanic, Mechanic];
  lengths: number[];
}

export const PROFILES: Record<CandidateId, ProfileDef> = {
  A6: { id: 'A6', label: 'FLASK_ORDER', mechanics: ['flask', 'order'], lengths: [4, 4, 4, 4, 0, 0] },
  B6: { id: 'B6', label: 'TRAY_ORDER', mechanics: ['tray', 'order'], lengths: [4, 4, 3, 3, 2, 0] },
  C6: { id: 'C6', label: 'PAIR_TASTING', mechanics: ['pair', 'tasting'], lengths: [2, 2, 4, 4, 4, 0] },
  C7: { id: 'C7', label: 'PAIR_TASTING', mechanics: ['pair', 'tasting'], lengths: [2, 2, 4, 4, 4, 0, 0] },
  D6: { id: 'D6', label: 'FLASK_PAIR', mechanics: ['flask', 'pair'], lengths: [2, 2, 4, 4, 4, 0] },
  D7: { id: 'D7', label: 'FLASK_PAIR', mechanics: ['flask', 'pair'], lengths: [2, 2, 4, 4, 4, 0, 0] },
  E6: { id: 'E6', label: 'FLASK_TRAY', mechanics: ['flask', 'tray'], lengths: [4, 4, 3, 3, 2, 0] },
  E7: { id: 'E7', label: 'FLASK_TRAY', mechanics: ['flask', 'tray'], lengths: [4, 4, 3, 3, 2, 0, 0] },
};

const ALL_IDS: CandidateId[] = ['A6', 'B6', 'C6', 'C7', 'D6', 'D7', 'E6', 'E7'];

function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const tea of PALETTE) for (let i = 0; i < 4; i++) p.push(tea);
  return p;
}

function isMixed(cup: TeaId[]): boolean {
  return cup.length === 0 || new Set(cup).size >= 2;
}

export function shape(profile: ProfileDef, seed: number): { cups: TeaId[][]; order1: number; order2: number } {
  for (let attempt = 0; attempt < 700; attempt++) {
    const rng = createRng(`g21-${profile.id}-${seed}-try-${attempt}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const length of profile.lengths) {
      cups.push(p.slice(off, off + length));
      off += length;
    }
    if (!cups.every(isMixed)) continue;
    let order1 = 0;
    let order2 = 1;
    if (profile.id === 'A6') {
      order1 = Math.floor(rng() * 4);
      order2 = Math.floor(rng() * 3);
      if (order2 >= order1) order2++;
    } else if (profile.id === 'B6') {
      // The two 4-layer cups are the ordered cups; randomize 1/2 assignment.
      order1 = 0;
      order2 = 1;
      if (rng() < 0.5) [order1, order2] = [order2, order1];
    }
    return { cups, order1, order2 };
  }
  throw new Error(`no shape ${profile.id} ${seed}`);
}

function baseConstraints(n: number): CupConstraint[] {
  return Array.from({ length: n }, () => ({ mode: 'normal' as const }));
}

function flaskConstraint(): CupConstraint {
  return cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
}

export function fullConstraints(profile: ProfileDef, order1: number, order2: number): CupConstraint[] {
  const c = baseConstraints(profile.lengths.length);
  if (profile.mechanics.includes('order')) {
    c[order1] = { mode: 'normal', serveOrder: 1 };
    c[order2] = { mode: 'normal', serveOrder: 2 };
  }
  if (profile.mechanics.includes('flask')) c[profile.id.startsWith('A') ? 5 : 5] = flaskConstraint();
  if (profile.mechanics.includes('tray')) {
    c[2] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
    c[3] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  }
  if (profile.mechanics.includes('pair')) {
    c[0] = { mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' };
    c[1] = { mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' };
  }
  if (profile.mechanics.includes('tasting')) {
    c[5] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
  }
  return c;
}

function stripFlask(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { steepingFlask?: unknown }).steepingFlask;
    return n;
  });
}

function stripTasting(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { mustEndEmpty?: unknown }).mustEndEmpty;
    return n;
  });
}

function firstAction(solution: readonly SolverAction[] | undefined): string | null {
  const a = solution?.[0];
  if (!a) return null;
  return `${a.kind}:${(a as { from?: number }).from ?? ''}→${(a as { to?: number }).to ?? ''}`;
}

function homogeneous(cup: readonly TeaId[]): boolean {
  return cup.length === 0 || cup.every((tea) => tea === cup[0]);
}

interface OrderFacts {
  active: boolean;
  pressureDepth: number | null;
  serve1Depth: number | null;
  serve2Depth: number | null;
  prefix: number;
  win: boolean;
}

function orderFacts(cups: TeaId[][], solution: readonly SolverAction[], constraints: CupConstraint[], h1: number, h2: number): OrderFacts {
  const tr = analyzeServingTrace(cups, h1, h2, solution, constraints);
  const minimal = Math.max(1, solution.length);
  const active =
    tr.win &&
    tr.servedPrefixFinal === 2 &&
    tr.firstPressureDepth !== null &&
    tr.serve1Depth !== null &&
    tr.serve2Depth !== null &&
    tr.firstPressureDepth < tr.serve1Depth &&
    tr.serve1Depth < tr.serve2Depth &&
    tr.firstPressureDepth / minimal <= ORDER_EARLY;
  return {
    active,
    pressureDepth: tr.firstPressureDepth,
    serve1Depth: tr.serve1Depth,
    serve2Depth: tr.serve2Depth,
    prefix: tr.servedPrefixFinal,
    win: tr.win,
  };
}

function flaskPressure(cups: TeaId[][], constraints: CupConstraint[], flaskIndex: number): boolean {
  const control = stripFlask(constraints);
  const state = { cups, floatingIngredients: emptyFloatingIngredients(cups.length) };
  for (let to = 0; to < cups.length; to++) {
    if (to === flaskIndex) continue;
    if (pourRejectCodeState(state, flaskIndex, to, constraints) !== 'source-steeping-not-ready') continue;
    if (pourRejectCodeState(state, flaskIndex, to, control) !== 'ok') continue;
    if (pourCountState(state, flaskIndex, to, control) > 0) return true;
  }
  return false;
}

interface FlaskFacts {
  active: boolean;
  commitDepth: number | null;
  commitTea: TeaId | null;
  pressureDepth: number | null;
  readyDepth: number | null;
  releaseDepth: number | null;
  emptyDepth: number | null;
  partialRelease: boolean;
  cleanDecant: boolean;
  win: boolean;
}

function flaskFacts(cups: TeaId[][], solution: readonly SolverAction[], constraints: CupConstraint[], flaskIndex: number): FlaskFacts {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  let commitDepth: number | null = null;
  let commitTea: TeaId | null = null;
  let pressureDepth: number | null = null;
  let readyDepth: number | null = null;
  let releaseDepth: number | null = null;
  let emptyDepth: number | null = null;
  let partialRelease = false;
  let cleanDecant = false;

  for (let d = 0; d <= solution.length; d++) {
    const before = state.cups[flaskIndex] as TeaId[];
    if (before.length >= 1 && before.length <= 3 && homogeneous(before) && flaskPressure(state.cups as TeaId[][], constraints, flaskIndex)) {
      if (pressureDepth === null) pressureDepth = d;
    }
    if (d === solution.length) break;
    const action = solution[d] as SolverAction;
    if (action.kind !== 'pour') continue;
    const wasReady = isSteepingFlaskReady(before, constraints[flaskIndex]);
    const result = applyPourState(state, action.from as number, action.to as number, constraints);
    if (!result) break;
    const after = result.state.cups[flaskIndex] as TeaId[];
    if (before.length === 0 && after.length >= 1 && after.length <= 3 && homogeneous(after) && commitDepth === null) {
      commitDepth = d + 1;
      commitTea = after[0] as TeaId;
    }
    if (!wasReady && isSteepingFlaskReady(after, constraints[flaskIndex]) && readyDepth === null) readyDepth = d + 1;
    if (action.from === flaskIndex && wasReady && releaseDepth === null) {
      releaseDepth = d + 1;
      if (after.length >= 1 && after.length <= 3) partialRelease = true;
      if (after.length === 0) cleanDecant = true;
    }
    if (releaseDepth !== null && after.length === 0 && emptyDepth === null) emptyDepth = d + 1;
    state = result.state as typeof state;
  }
  const win = isPuzzleWonState(state, constraints);
  const active =
    win &&
    commitDepth !== null &&
    pressureDepth !== null &&
    readyDepth !== null &&
    releaseDepth !== null &&
    emptyDepth !== null &&
    commitDepth <= pressureDepth &&
    pressureDepth < readyDepth &&
    readyDepth < releaseDepth &&
    releaseDepth <= emptyDepth &&
    commitDepth / Math.max(1, solution.length) <= 0.8;
  return { active, commitDepth, commitTea, pressureDepth, readyDepth, releaseDepth, emptyDepth, partialRelease, cleanDecant, win };
}

interface TrayFacts {
  active: boolean;
  pressureDepth: number | null;
  releaseDepth: number | null;
  refillDepth: number | null;
  crossMemberReuse: boolean;
  win: boolean;
}

function trayPressure(cups: TeaId[][], constraints: CupConstraint[], tray: readonly number[]): number {
  const control = stripTray(constraints);
  const state = { cups, floatingIngredients: emptyFloatingIngredients(cups.length) };
  let count = 0;
  for (const to of tray) {
    if ((cups[to] as TeaId[]).length >= 4) continue;
    for (let from = 0; from < cups.length; from++) {
      if (tray.includes(from)) continue;
      if (!canPourState(state, from, to, control)) continue;
      const mControl = pourCountState(state, from, to, control);
      if (mControl <= 0) continue;
      const mShared = pourCountState(state, from, to, constraints);
      if (!canPourState(state, from, to, constraints) || mShared < mControl) count++;
    }
  }
  return count;
}

function occupancy(cups: TeaId[][], tray: readonly number[]): number {
  return tray.reduce((sum, idx) => sum + ((cups[idx] as TeaId[]) ?? []).length, 0);
}

function trayFacts(cups: TeaId[][], solution: readonly SolverAction[], constraints: CupConstraint[], tray: readonly number[]): TrayFacts {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  let pressureDepth: number | null = null;
  let releaseDepth: number | null = null;
  let refillDepth: number | null = null;
  let crossMemberReuse = false;
  const released = new Set<number>();
  let releasedOnce = false;

  for (let d = 0; d <= solution.length; d++) {
    if (trayPressure(state.cups as TeaId[][], constraints, tray) > 0 && pressureDepth === null) pressureDepth = d;
    if (d === solution.length) break;
    const action = solution[d] as SolverAction;
    if (action.kind !== 'pour') continue;
    const beforeOcc = occupancy(state.cups as TeaId[][], tray);
    const result = applyPourState(state, action.from as number, action.to as number, constraints);
    if (!result) break;
    const afterOcc = occupancy(result.state.cups as TeaId[][], tray);
    const fromTray = tray.includes(action.from as number);
    const toTray = tray.includes(action.to as number);
    if (fromTray && !toTray && afterOcc < beforeOcc) {
      released.add(action.from as number);
      if (pressureDepth !== null && releaseDepth === null) releaseDepth = d + 1;
      releasedOnce = true;
    } else if (releasedOnce && !fromTray && toTray && afterOcc > beforeOcc) {
      if (refillDepth === null) refillDepth = d + 1;
      for (const member of released) {
        if (member !== action.to) crossMemberReuse = true;
      }
    }
    state = result.state as typeof state;
  }
  const win = isPuzzleWonState(state, constraints);
  const active =
    win &&
    pressureDepth !== null &&
    releaseDepth !== null &&
    refillDepth !== null &&
    pressureDepth < releaseDepth &&
    releaseDepth < refillDepth &&
    pressureDepth / Math.max(1, solution.length) <= ORDER_EARLY;
  return { active, pressureDepth, releaseDepth, refillDepth, crossMemberReuse, win };
}

interface TastingFacts {
  active: boolean;
  inflows: number;
  outflows: number;
  maxOccupancy: number;
  firstInDepth: number | null;
  firstOutDepth: number | null;
  emptiedDepth: number | null;
  finalEmpty: boolean;
  win: boolean;
}

function tastingFacts(cups: TeaId[][], solution: readonly SolverAction[], constraints: CupConstraint[], tastingIndex: number): TastingFacts {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  let inflows = 0;
  let outflows = 0;
  let maxOccupancy = (cups[tastingIndex] as TeaId[]).length;
  let firstInDepth: number | null = null;
  let firstOutDepth: number | null = null;
  let emptiedDepth: number | null = null;
  let wasNonEmpty = maxOccupancy > 0;

  for (let d = 0; d < solution.length; d++) {
    const action = solution[d] as SolverAction;
    if (action.kind !== 'pour') continue;
    const result = applyPourState(state, action.from as number, action.to as number, constraints);
    if (!result) break;
    const after = result.state.cups[tastingIndex] as TeaId[];
    if (action.to === tastingIndex) {
      inflows++;
      if (firstInDepth === null) firstInDepth = d + 1;
    }
    if (action.from === tastingIndex) {
      outflows++;
      if (firstOutDepth === null) firstOutDepth = d + 1;
    }
    maxOccupancy = Math.max(maxOccupancy, after.length);
    if (wasNonEmpty && after.length === 0 && emptiedDepth === null) emptiedDepth = d + 1;
    wasNonEmpty = after.length > 0;
    state = result.state as typeof state;
  }
  const finalEmpty = (state.cups[tastingIndex] as TeaId[]).length === 0;
  const win = isPuzzleWonState(state, constraints);
  return {
    active: win && inflows > 0 && outflows > 0 && finalEmpty,
    inflows,
    outflows,
    maxOccupancy,
    firstInDepth,
    firstOutDepth,
    emptiedDepth,
    finalEmpty,
    win,
  };
}

function pairFacts(cups: TeaId[][], solution: readonly SolverAction[], constraints: CupConstraint[]) {
  return analyzePairTrace(cups, solution, constraints);
}

interface Mechanics {
  order?: OrderFacts;
  flask?: FlaskFacts;
  tray?: TrayFacts;
  pair?: ReturnType<typeof pairFacts>;
  tasting?: TastingFacts;
}

export function mechanicsFor(profile: ProfileDef, cups: TeaId[][], solution: readonly SolverAction[], constraints: CupConstraint[], order1: number, order2: number): Mechanics {
  const out: Mechanics = {};
  if (profile.mechanics.includes('order')) out.order = orderFacts(cups, solution, constraints, order1, order2);
  if (profile.mechanics.includes('flask')) out.flask = flaskFacts(cups, solution, constraints, 5);
  if (profile.mechanics.includes('tray')) out.tray = trayFacts(cups, solution, constraints, [2, 3]);
  if (profile.mechanics.includes('pair')) out.pair = pairFacts(cups, solution, constraints);
  if (profile.mechanics.includes('tasting')) out.tasting = tastingFacts(cups, solution, constraints, 5);
  return out;
}

export function fullActive(mechanics: Mechanics): boolean {
  if (mechanics.order && !mechanics.order.active) return false;
  if (mechanics.flask && !mechanics.flask.active) return false;
  if (mechanics.tray && !mechanics.tray.active) return false;
  if (mechanics.pair && !mechanics.pair.l2) return false;
  if (mechanics.tasting && !mechanics.tasting.active) return false;
  return true;
}

function controlDefs(profile: ProfileDef, constraints: CupConstraint[]): Array<{ name: string; constraints: CupConstraint[] }> {
  if (profile.label === 'FLASK_ORDER') {
    return [
      { name: 'order', constraints: stripOrders(constraints) },
      { name: 'flask', constraints: stripFlask(constraints) },
    ];
  }
  if (profile.label === 'TRAY_ORDER') {
    return [
      { name: 'tray', constraints: stripOrders(constraints) },
      { name: 'order', constraints: stripTray(constraints) },
    ];
  }
  if (profile.label === 'PAIR_TASTING') {
    return [
      { name: 'pair', constraints: stripTasting(constraints) },
      { name: 'tasting', constraints: stripPair(constraints) },
    ];
  }
  if (profile.label === 'FLASK_PAIR') {
    return [
      { name: 'pair', constraints: stripFlask(constraints) },
      { name: 'flask', constraints: stripPair(constraints) },
    ];
  }
  return [
    { name: 'flask', constraints: stripTray(constraints) },
    { name: 'tray', constraints: stripFlask(constraints) },
  ];
}

function replayAgainstFull(
  cups: TeaId[][],
  solution: readonly SolverAction[],
  full: CupConstraint[],
): boolean {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  for (const action of solution) {
    if (action.kind !== 'pour') continue;
    const result = applyPourState(state, action.from as number, action.to as number, full);
    if (!result) return false;
    state = result.state as typeof state;
  }
  return isPuzzleWonState(state, full);
}

export interface C2Record {
  seed: number;
  cups: TeaId[][];
  order1: number;
  order2: number;
  depth: number;
  first: string | null;
  mechanics: Mechanics;
  controls: Array<{
    name: string;
    solvable: boolean;
    minMoves: number | null;
    first: string | null;
    invalidated: boolean;
    visited: number | null;
  }>;
  c3: boolean;
  c3x: boolean;
  c4: boolean;
  stateMultiplier: number | null;
  key: string;
}

function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] as number;
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

async function runProfile(profile: ProfileDef, n: number): Promise<Record<string, unknown>> {
  const c2Records: C2Record[] = [];
  let solvable = 0;
  let unsolvable = 0;
  let truncated = 0;
  let l1 = 0;
  let c2 = 0;
  let c3 = 0;
  let c3x = 0;
  let c4 = 0;
  let oneSided = 0;
  const canonicalC2 = new Set<string>();
  const canonicalC3 = new Set<string>();
  const canonicalC3x = new Set<string>();
  const depths: number[] = [];
  const visited: number[] = [];
  const ms: number[] = [];
  const fullControlDepths: number[] = [];
  const controlDepths: number[] = [];
  const multipliers: number[] = [];
  const start = performance.now();

  for (let s = 0; s < n; s++) {
    const { cups, order1, order2 } = shape(profile, s);
    const cons = fullConstraints(profile, order1, order2);
    const t0 = performance.now();
    const result = solvePuzzle(cups, {
      cupConstraints: cons,
      floatingIngredients: emptyFloatingIngredients(cups.length),
      maxVisited: MAX_VISITED,
      maxDepth: MAX_DEPTH,
      returnSolution: true,
    });
    ms.push(performance.now() - t0);
    visited.push(result.visitedStates);
    if (result.truncated) {
      truncated++;
      if ((s + 1) % 100 === 0) console.log(`[${profile.id}] ${s + 1}/${n} full=truncated c2=${c2}`);
      continue;
    }
    if (!result.solvable || !result.solution || result.minMoves === undefined) {
      unsolvable++;
      if ((s + 1) % 100 === 0) console.log(`[${profile.id}] ${s + 1}/${n} full=unsolvable c2=${c2}`);
      continue;
    }
    solvable++;
    depths.push(result.minMoves);
    const finalState = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
      result.solution,
      cons,
    );
    const won = finalState !== null && isPuzzleWonState(finalState, cons);
    if (won) l1++;
    const mechanics = mechanicsFor(profile, cups, result.solution, cons, order1, order2);
    if (!won || !fullActive(mechanics)) {
      if ((s + 1) % 100 === 0) console.log(`[${profile.id}] ${s + 1}/${n} no-C2 c2=${c2}`);
      continue;
    }

    c2++;
    const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, cons);
    canonicalC2.add(key);
    const fullFirst = firstAction(result.solution);
    let allControlsSolvable = true;
    let invalidatedCount = 0;
    const controls: C2Record['controls'] = [];
    for (const def of controlDefs(profile, cons)) {
      const cr = solvePuzzle(cups, {
        cupConstraints: def.constraints,
        floatingIngredients: emptyFloatingIngredients(cups.length),
        maxVisited: MAX_VISITED,
        maxDepth: MAX_DEPTH,
        returnSolution: true,
      });
      const controlSolved = !cr.truncated && cr.solvable && cr.solution !== undefined && cr.minMoves !== undefined;
      if (!controlSolved) allControlsSolvable = false;
      const invalidated = controlSolved
        ? !replayAgainstFull(cups, cr.solution as SolverAction[], cons)
        : false;
      if (invalidated) invalidatedCount++;
      if (controlSolved) controlDepths.push(cr.minMoves as number);
      controls.push({
        name: def.name,
        solvable: controlSolved,
        minMoves: controlSolved ? (cr.minMoves as number) : null,
        first: controlSolved ? firstAction(cr.solution) : null,
        invalidated,
        visited: cr.visitedStates,
      });
    }
    const divergenceA = controls[0]?.solvable === true &&
      (result.minMoves !== (controls[0]?.minMoves ?? -1) || fullFirst !== controls[0]?.first);
    const divergenceB = controls[1]?.solvable === true &&
      (result.minMoves !== (controls[1]?.minMoves ?? -1) || fullFirst !== controls[1]?.first);
    const isC3 = divergenceA && divergenceB;
    const isC3x = invalidatedCount === 2;
    const isC4 = allControlsSolvable &&
      result.minMoves >= Math.max(controls[0]?.minMoves ?? 0, controls[1]?.minMoves ?? 0) + 2;
    if (isC3) {
      c3++;
      canonicalC3.add(key);
    }
    if (isC3x) {
      c3x++;
      canonicalC3x.add(key);
    }
    if (invalidatedCount === 1) oneSided++;
    if (isC4) c4++;
    const maxControlVisited = Math.max(...controls.map((c) => c.visited ?? 0));
    const multiplier = maxControlVisited > 0 ? result.visitedStates / maxControlVisited : null;
    if (multiplier !== null) multipliers.push(multiplier);
    c3RecordsPush(c2Records, {
      seed: s,
      cups,
      order1,
      order2,
      depth: result.minMoves,
      first: fullFirst,
      mechanics,
      controls,
      c3: isC3,
      c3x: isC3x,
      c4: isC4,
      stateMultiplier: multiplier,
      key,
    });
    if ((s + 1) % 100 === 0) {
      console.log(`[${profile.id}] ${s + 1}/${n} solv=${solvable} c2=${c2} c3=${c3} c3x=${c3x}`);
    }
  }

  const fullControlDepthsForDelta: number[] = [];
  const controlDepthsForDelta: number[] = [];
  for (const record of c2Records) {
    fullControlDepthsForDelta.push(record.depth);
    for (const c of record.controls) if (c.minMoves !== null) controlDepthsForDelta.push(c.minMoves);
  }
  const summary = {
    id: profile.id,
    label: profile.label,
    mechanics: profile.mechanics,
    topology: profile.lengths,
    sampled: n,
    solvable,
    unsolvable,
    truncated,
    solvabilityRate: solvable / Math.max(1, n),
    l1,
    c2,
    c2Rate: c2 / Math.max(1, n),
    canonicalC2: canonicalC2.size,
    c3,
    c3Rate: c3 / Math.max(1, n),
    canonicalC3: canonicalC3.size,
    c3x,
    c3xRate: c3x / Math.max(1, n),
    canonicalC3x: canonicalC3x.size,
    c4,
    oneSidedInvalidation: oneSided,
    depth: { p50: median(depths), p95: pct(depths, 95), max: depths.length ? Math.max(...depths) : null },
    visited: { p50: median(visited), p95: pct(visited, 95), max: visited.length ? Math.max(...visited) : null },
    solverMs: { p50: median(ms), p95: pct(ms, 95), max: ms.length ? Math.max(...ms) : null },
    stateMultiplier: { p50: median(multipliers), p95: pct(multipliers, 95), max: multipliers.length ? Math.max(...multipliers) : null },
    controls: {
      fullDepthP50: median(fullControlDepthsForDelta),
      depthP50: median(controlDepthsForDelta),
      minMovesP50: median(controlDepths),
    },
    wallMs: Math.round(performance.now() - start),
    c2Records,
  };
  console.log(`[${profile.id}] summary solv=${solvable}/${n} c2=${c2} c3=${c3} c3x=${c3x} c4=${c4} canonC2=${canonicalC2.size} wall=${summary.wallMs}ms`);
  return summary;
}

function c3RecordsPush(records: C2Record[], record: C2Record): void {
  if (records.length < 5000) records.push(record);
}

const IS_MAIN = ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('composition2-search.ts'));
if (IS_MAIN) {
  const arg = process.argv[2] ?? 'all';
  const n = Number(process.argv[3] ?? 1000);
  const ids: CandidateId[] = arg === 'all' ? ALL_IDS : [arg as CandidateId];
  if (ids.some((id) => !PROFILES[id])) throw new Error(`unknown profile ${arg}`);
  const output: Record<string, unknown> = {};
  for (const id of ids) {
    output[id] = await runProfile(PROFILES[id] as ProfileDef, n);
  }
  const outPath = resolve(import.meta.dirname, `out/g21-${arg}-${n}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`wrote ${outPath}`);
}
