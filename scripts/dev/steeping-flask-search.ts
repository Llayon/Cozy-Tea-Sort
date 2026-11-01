/**
 * G20 DEV feasibility harness — steeping flask (F0/F1/F7).
 *
 * Shaped candidates only (no runtime mining). Uses the production solver and
 * the real pour truth. Analysis is offline; no results are consumed by the
 * game at runtime.
 *
 * Run:
 *   bunx tsx scripts/dev/steeping-flask-search.ts --profile F0 --count 2000
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  applyPourState,
  canonicalPuzzleKey,
  isSteepingFlaskReady,
  pourCountState,
  pourRejectCodeState,
  type PourRejectCode,
} from '../../src/game/logic/rules.ts';
import { createRng } from '../../src/game/logic/rng.ts';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  emptyFloatingIngredients,
  type CupConstraint,
  type TeaId,
} from '../../src/game/types.ts';

type ProfileId = 'F0' | 'F1' | 'F7';
type Role = 'c0' | 'c1' | 'c2' | 'c3';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const ROLES: Role[] = ['c0', 'c1', 'c2', 'c3'];

const PROFILES: Record<
  ProfileId,
  {
    vessels: number;
    flaskIndex: number;
    normalLengths: number[];
    flaskLength: number;
    ordinaryEmptyCount: number;
  }
> = {
  F0: { vessels: 6, flaskIndex: 5, normalLengths: [4, 4, 4, 4, 0], flaskLength: 0, ordinaryEmptyCount: 1 },
  F1: { vessels: 6, flaskIndex: 5, normalLengths: [4, 4, 4, 3, 0], flaskLength: 1, ordinaryEmptyCount: 1 },
  F7: { vessels: 7, flaskIndex: 6, normalLengths: [4, 4, 4, 4, 0, 0], flaskLength: 0, ordinaryEmptyCount: 2 },
};

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] as string) : fallback;
}

const PROFILE = argValue('--profile', 'F0') as ProfileId;
const COUNT = Number(argValue('--count', '2000'));
const OUT = resolve(
  import.meta.dirname,
  'out',
  `g20-steeping-${PROFILE.toLowerCase()}-${COUNT}.json`,
);
if (!PROFILES[PROFILE]) throw new Error(`unknown profile ${PROFILE}`);

function shuffle<T>(rng: () => number, input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

function homogeneous(cup: readonly number[]): boolean {
  return cup.length > 0 && cup.every((v) => v === cup[0]);
}

function makeCandidate(rng: () => number): {
  roleCups: Role[][];
  constraints: CupConstraint[];
  flaskIndex: number;
  flaskLength: number;
} | null {
  const spec = PROFILES[PROFILE];
  const units = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3];
  const shuffled = shuffle(rng, units);
  let cursor = 0;
  const normal: number[][] = [];
  for (const len of spec.normalLengths) {
    const cup = shuffled.slice(cursor, cursor + len);
    cursor += len;
    if (homogeneous(cup)) return null;
    normal.push(cup);
  }
  const flask = shuffled.slice(cursor, cursor + spec.flaskLength);
  const roleCups: Role[][] = spec.normalLengths.map((len, i) => {
    const cup = normal[i] as number[];
    if (i === spec.flaskIndex) return flask.map((v) => ROLES[v] as Role);
    return cup.map((v) => ROLES[v] as Role);
  });
  // Insert flask at its physical index; normalLengths has a placeholder slot.
  const cups: Role[][] = [];
  let normalIndex = 0;
  for (let i = 0; i < spec.vessels; i++) {
    if (i === spec.flaskIndex) {
      cups.push(flask.map((v) => ROLES[v] as Role));
    } else {
      const cup = normal[normalIndex++] as number[];
      cups.push(cup.map((v) => ROLES[v] as Role));
    }
  }
  void roleCups;
  const constraints: CupConstraint[] = cups.map(() => ({ mode: 'normal' }));
  constraints[spec.flaskIndex] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  return { roleCups: cups, constraints, flaskIndex: spec.flaskIndex, flaskLength: flask.length };
}

function roleCupsToTea(roleCups: Role[][]): TeaId[][] {
  return roleCups.map((cup) => cup.map((role) => PALETTE[ROLES.indexOf(role)] as TeaId));
}

interface TraceAnalysis {
  commitDepth: number | null;
  commitTea: TeaId | null;
  pressureDepth: number | null;
  readyDepth: number | null;
  releaseDepth: number | null;
  emptyDepth: number | null;
  directReadyDepth: number | null;
  partialRelease: boolean;
  cleanDecant: boolean;
  rebrew: boolean;
  releaseShape: 0 | 1 | 2 | 3 | null;
  controlBreaksSteeping: boolean;
  controlMinMoves: number | null;
}

function hasPressure(
  state: { cups: TeaId[][]; floatingIngredients: (string | null)[] },
  constraints: readonly CupConstraint[],
  flaskIndex: number,
): boolean {
  const controlConstraints = constraints.map((c, i) =>
    i === flaskIndex ? { mode: c.mode, capacity: c.capacity, mustEndEmpty: c.mustEndEmpty } as CupConstraint : c,
  );
  for (let d = 0; d < state.cups.length; d++) {
    if (d === flaskIndex) continue;
    const real = pourRejectCodeState(state, flaskIndex, d, constraints);
    if (real !== 'source-steeping-not-ready') continue;
    const control = pourRejectCodeState(state, flaskIndex, d, controlConstraints);
    if (control !== 'ok') continue;
    if (pourCountState(state, flaskIndex, d, controlConstraints) > 0) return true;
  }
  return false;
}

function analyzeTrace(
  cups: TeaId[][],
  constraints: CupConstraint[],
  flaskIndex: number,
  solution: Array<{ kind: string; from: number; to: number }>,
  minMoves: number,
  controlMinMoves: number | null,
  controlSolution: Array<{ kind: string; from: number; to: number }>,
): TraceAnalysis {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  let commitDepth: number | null = null;
  let commitTea: TeaId | null = null;
  let pressureDepth: number | null = null;
  let readyDepth: number | null = null;
  let releaseDepth: number | null = null;
  let emptyDepth: number | null = null;
  let directReadyDepth: number | null = null;
  let partialRelease = false;
  let cleanDecant = false;
  let releaseShape: 0 | 1 | 2 | 3 | null = null;
  let cycleTea: TeaId | null = null;
  let rebrew = false;
  let cycle = 0;
  let sawEmptyAfterCommit = false;

  for (let i = 0; i < solution.length; i++) {
    const action = solution[i] as { kind: string; from: number; to: number };
    if (action.kind !== 'pour') continue;
    const depth = i + 1;
    const before = state.cups[flaskIndex] as TeaId[];
    const wasReady = isSteepingFlaskReady(before, constraints[flaskIndex]);
    const result = applyPourState(state, action.from, action.to, constraints);
    if (!result) continue;
    const after = result.state.cups[flaskIndex] as TeaId[];
    const becameReady = !wasReady && isSteepingFlaskReady(after, constraints[flaskIndex]);
    const wasEmpty = before.length === 0;
    const becameCommit = wasEmpty && after.length >= 1 && after.length <= 3 && homogeneous(after);
    const becameDirectReady = wasEmpty && after.length === 4 && homogeneous(after);
    if (becameCommit && commitDepth === null) {
      commitDepth = depth;
      commitTea = after[0] as TeaId;
      cycleTea = after[0] as TeaId;
      cycle++;
    }
    if (becameDirectReady && directReadyDepth === null) {
      directReadyDepth = depth;
      cycle++;
    }
    if (before.length >= 1 && before.length <= 3 && !wasReady) {
      if (hasPressure(state, constraints, flaskIndex)) {
        if (pressureDepth === null) pressureDepth = depth;
      }
    }
    if (becameReady && readyDepth === null) readyDepth = depth;
    if (action.from === flaskIndex && wasReady && releaseDepth === null) {
      releaseDepth = depth;
      const post = after.length;
      releaseShape = post === 0 ? 0 : post === 1 ? 1 : post === 2 ? 2 : post === 3 ? 3 : releaseShape;
      if (post >= 1 && post <= 3) partialRelease = true;
      if (post === 0) cleanDecant = true;
    }
    if (cycleTea !== null && after.length === 0 && releaseDepth !== null && emptyDepth === null) {
      emptyDepth = depth;
      sawEmptyAfterCommit = true;
    }
    if (
      cycleTea !== null &&
      sawEmptyAfterCommit &&
      wasEmpty &&
      after.length >= 1 &&
      after.length <= 3 &&
      homogeneous(after) &&
      (after[0] as TeaId) !== cycleTea
    ) {
      rebrew = true;
    }
    state = result.state;
  }

  let controlBreaksSteeping = false;
  if (controlSolution.length > 0) {
    let cState = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
    for (const action of controlSolution) {
      if (action.kind !== 'pour') continue;
      const before = cState.cups[flaskIndex] as TeaId[];
      if (action.from === flaskIndex && before.length >= 1 && before.length <= 3) {
        controlBreaksSteeping = true;
        break;
      }
      const result = applyPourState(cState, action.from, action.to, constraints.map((c, i) =>
        i === flaskIndex ? { mode: c.mode, capacity: c.capacity, mustEndEmpty: c.mustEndEmpty } as CupConstraint : c,
      ));
      if (!result) break;
      cState = result.state;
    }
  }

  const orderingOk =
    commitDepth !== null &&
    pressureDepth !== null &&
    readyDepth !== null &&
    releaseDepth !== null &&
    emptyDepth !== null &&
    commitDepth <= pressureDepth &&
    pressureDepth < readyDepth &&
    readyDepth < releaseDepth &&
    releaseDepth <= emptyDepth &&
    emptyDepth <= minMoves;
  const l2 = orderingOk && commitDepth / Math.max(1, minMoves) <= 0.8;
  return {
    commitDepth: l2 ? commitDepth : null,
    commitTea: l2 ? commitTea : null,
    pressureDepth: l2 ? pressureDepth : null,
    readyDepth: l2 ? readyDepth : null,
    releaseDepth: l2 ? releaseDepth : null,
    emptyDepth: l2 ? emptyDepth : null,
    directReadyDepth,
    partialRelease: l2 ? partialRelease : false,
    cleanDecant: l2 ? cleanDecant : false,
    rebrew,
    releaseShape,
    controlBreaksSteeping,
    controlMinMoves,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] as number;
}

const rng = createRng(`g20-steeping-${PROFILE}`);
let attempts = 0;
let generated = 0;
let solvable = 0;
let unsolvable = 0;
let truncated = 0;
let l1 = 0;
let l2 = 0;
let l3a = 0;
let l3b = 0;
let l3c = 0;
let directReady = 0;
let partialRelease = 0;
let rebrewCount = 0;
const canonical = new Set<string>();
const canonicalL2 = new Set<string>();
const canonicalL3A = new Set<string>();
const depths: number[] = [];
const visited: number[] = [];
const solverMs: number[] = [];
const commitTiming: number[] = [];
const gaps: number[] = [];
const releaseShapes = { '4->0': 0, '4->1': 0, '4->2': 0, '4->3': 0 };
const l2Candidates: unknown[] = [];

while (generated < COUNT && attempts < COUNT * 40) {
  attempts++;
  const candidate = makeCandidate(rng);
  if (!candidate) continue;
  const cups = roleCupsToTea(candidate.roleCups);
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, candidate.constraints);
  if (canonical.has(key)) continue;
  canonical.add(key);
  generated++;
  const started = performance.now();
  const solved = solvePuzzle(cups, {
    cupConstraints: candidate.constraints,
    floatingIngredients: emptyFloatingIngredients(cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
  });
  const ms = performance.now() - started;
  if (solved.truncated) {
    truncated++;
    continue;
  }
  if (!solved.solvable || !solved.solution) {
    unsolvable++;
    continue;
  }
  solvable++;
  const finalFlask = replayFinalFlask(cups, candidate.constraints, candidate.flaskIndex, solved.solution);
  if (finalFlask.length === 0) l1++;
  depths.push(solved.minMoves);
  visited.push(solved.visitedStates);
  solverMs.push(ms);

  const controlConstraints = candidate.constraints.map((c, i) =>
    i === candidate.flaskIndex ? { mode: c.mode, capacity: c.capacity, mustEndEmpty: c.mustEndEmpty } as CupConstraint : c,
  );
  const control = solvePuzzle(cups, {
    cupConstraints: controlConstraints,
    floatingIngredients: emptyFloatingIngredients(cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
  });
  const analysis = analyzeTrace(
    cups,
    candidate.constraints,
    candidate.flaskIndex,
    solved.solution as Array<{ kind: string; from: number; to: number }>,
    solved.minMoves,
    control.solvable ? control.minMoves : null,
    control.solvable && control.solution ? (control.solution as Array<{ kind: string; from: number; to: number }>) : [],
  );
  if (analysis.commitDepth !== null) {
    l2++;
    canonicalL2.add(key);
    commitTiming.push(analysis.commitDepth / Math.max(1, solved.minMoves));
    if (analysis.readyDepth !== null) gaps.push(analysis.readyDepth - analysis.commitDepth);
    if (analysis.cleanDecant) {
      l3a++;
      canonicalL3A.add(key);
      releaseShapes['4->0']++;
    }
    if (analysis.partialRelease) partialRelease++;
    if (analysis.controlBreaksSteeping) l3b++;
    if (control.solvable && solved.minMoves > control.minMoves) l3c++;
    if (analysis.directReadyDepth !== null) directReady++;
    if (analysis.rebrew) rebrewCount++;
    l2Candidates.push({
      seedAttempt: attempts,
      depth: solved.minMoves,
      visited: solved.visitedStates,
      cups: candidate.roleCups,
      flaskIndex: candidate.flaskIndex,
      commitDepth: analysis.commitDepth,
      commitTea: analysis.commitTea,
      pressureDepth: analysis.pressureDepth,
      readyDepth: analysis.readyDepth,
      releaseDepth: analysis.releaseDepth,
      emptyDepth: analysis.emptyDepth,
      cleanDecant: analysis.cleanDecant,
      partialRelease: analysis.partialRelease,
      controlBreaksSteeping: analysis.controlBreaksSteeping,
      controlMinMoves: analysis.controlMinMoves,
    });
  }
}

function replayFinalFlask(
  cups: TeaId[][],
  constraints: CupConstraint[],
  flaskIndex: number,
  solution: Array<{ kind: string; from: number; to: number }>,
): TeaId[] {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  for (const action of solution) {
    if (action.kind !== 'pour') continue;
    const result = applyPourState(state, action.from, action.to, constraints);
    if (!result) break;
    state = result.state;
  }
  return state.cups[flaskIndex] as TeaId[];
}

const summary = {
  profile: PROFILE,
  requested: COUNT,
  attempts,
  generated,
  canonicalDistinct: canonical.size,
  solvable,
  unsolvable,
  truncated,
  solvabilityRate: solvable / Math.max(1, generated),
  l1,
  l2,
  l2Density: l2 / Math.max(1, generated),
  canonicalL2: canonicalL2.size,
  l3a,
  l3b,
  l3c,
  directReady,
  partialRelease,
  partialReleaseRate: l2 > 0 ? partialRelease / l2 : null,
  rebrew: rebrewCount,
  depths: { p50: median(depths), p95: pct(depths, 95), max: depths.length ? Math.max(...depths) : null },
  visited: { p50: median(visited), p95: pct(visited, 95), max: visited.length ? Math.max(...visited) : null },
  solverMs: { p50: median(solverMs), p95: pct(solverMs, 95), max: solverMs.length ? Math.max(...solverMs) : null },
  commitTiming: {
    p50: median(commitTiming),
    p95: pct(commitTiming, 95),
    max: commitTiming.length ? Math.max(...commitTiming) : null,
  },
  commitReadyGap: {
    p50: median(gaps),
    p95: pct(gaps, 95),
    max: gaps.length ? Math.max(...gaps) : null,
  },
  releaseShapes,
  l2Candidates,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);
const { l2Candidates: _omit, ...printable } = summary;
console.log(JSON.stringify(printable, null, 2));
console.log(`wrote ${OUT}`);
