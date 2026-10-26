/**
 * G17 TEA PAIR feasibility sampler (DEV ONLY — never CI/production).
 *
 * Two topologies, both 4 colors × 4 units = 16 tea layers, exactly one
 * 'tea-pair' group on vessels [0,1] (capacity 2):
 * - V6: lengths 2,2,4,4,4,0 (6 vessels, one empty)
 * - V7: lengths 2,2,4,4,4,0,0 (7 vessels, two empties)
 * Both pair members and all non-empty normal starts are mixed.
 *
 * Uses production rules / solver / canonicalization. For every shaped
 * candidate it records solvability, L1/L2/L3 evidence, commit timing,
 * pressure/match ordering, canonical distinctness, plain-control delta and
 * solver cost. Run:
 *
 *   bunx tsx scripts/dev/tea-pair-search.ts both 2000
 *   bunx tsx scripts/dev/tea-pair-search.ts v7 5000
 *   bunx tsx scripts/dev/tea-pair-search.ts v7 5000 --fairness
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  CupConstraint,
  FloatingIngredientSlot,
  TeaId,
  cloneCupConstraint,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canonicalPuzzleKey,
  isConstructiveMoveState,
  isPuzzleWonState,
  listConstructiveActionsState,
} from '../../src/game/logic/rules.ts';
import { applySolutionState, solvePuzzle } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import {
  pairedTeaMembers,
  pairedTeaStatus,
  type PairedTeaStatus,
} from '../../src/game/logic/teaPair.ts';

export const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
export const MAX_VISITED = 200_000;
export const MAX_DEPTH = 60;

export type Topology = 'V6' | 'V7';

export const TOPOLOGY_LENGTHS: Record<Topology, number[]> = {
  V6: [2, 2, 4, 4, 4, 0],
  V7: [2, 2, 4, 4, 4, 0, 0],
};

export const PAIR_INDICES = [0, 1] as const;

export function pairConstraints(vesselCount: number): CupConstraint[] {
  return Array.from({ length: vesselCount }, (_, i) =>
    i === 0 || i === 1
      ? ({ mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' } as CupConstraint)
      : ({ mode: 'normal' as const } as CupConstraint),
  );
}

export function stripPair(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { pairedTeaGroup?: unknown }).pairedTeaGroup;
    return n;
  });
}

function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}

function isMixed(cup: TeaId[]): boolean {
  if (cup.length === 0) return true;
  return new Set(cup).size >= 2;
}

/** Deterministic shaped start: exact length multiset + mixed starts. */
export function shaped(topology: Topology, seed: number): { cups: TeaId[][]; attempts: number } {
  const lengths = TOPOLOGY_LENGTHS[topology];
  for (let a = 0; a < 1000; a++) {
    const rng = createRng(`g17-${topology}-${seed}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of lengths) {
      cups.push(p.slice(off, off + L));
      off += L;
    }
    let ok = true;
    for (let i = 0; i < cups.length; i++) {
      if (cups[i]!.length > 0 && !isMixed(cups[i]!)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    return { cups, attempts: a + 1 };
  }
  throw new Error(`no shape ${topology} ${seed}`);
}

const noFloat = (n: number): FloatingIngredientSlot[] => Array.from({ length: n }, () => null);
const wrap = (cups: TeaId[][]) => ({ cups, floatingIngredients: noFloat(cups.length) });

export interface StableSegment {
  tea: TeaId;
  commitDepth: number;
  pressureDepth: number;
  matchDepth: number;
  gap: number;
}

export interface PairTrace {
  win: boolean;
  solved: boolean;
  moveCount: number;
  statuses: PairedTeaStatus[];
  commitEvents: Array<{ tea: TeaId; depth: number }>;
  firstCommitTea: TeaId | null;
  firstCommitDepth: number | null;
  firstPressureDepth: number | null;
  matchedDepth: number | null;
  finalTea: TeaId | null;
  finalRole: number | null;
  stable: StableSegment | null;
  l1: boolean;
  l2: boolean;
  commitRatio: number | null;
  anchorSwitch: boolean;
  distinctCommitTeas: number;
  conflictStates: number;
  conflictRecoveryGaps: number[];
  matchedSameTea: boolean;
}

/** Replay an optimal solution and derive all pair events from board state. */
export function analyzePairTrace(
  startCups: TeaId[][],
  solution: readonly { kind: string; from?: number; to?: number }[],
  constraints: readonly CupConstraint[],
): PairTrace {
  let cups = startCups.map((c) => [...c]);
  const boards: TeaId[][][] = [cups.map((c) => [...c])];
  const statuses: PairedTeaStatus[] = [pairedTeaStatus(wrap(cups), constraints)];
  let solved = true;
  for (const a of solution) {
    if (a.kind !== 'pour') continue;
    const res = applyPourState(wrap(cups), a.from as number, a.to as number, constraints);
    if (!res) {
      solved = false;
      break;
    }
    cups = res.state.cups as TeaId[][];
    boards.push(cups.map((c) => [...c]));
    statuses.push(pairedTeaStatus(wrap(cups), constraints));
  }
  const moveCount = statuses.length - 1;
  const win = solved && isPuzzleWonState(wrap(cups), constraints);
  const finalStatus = statuses[statuses.length - 1]!;
  const finalTea = finalStatus.kind === 'matched' ? finalStatus.tea : null;
  const finalRole = finalTea === null ? null : PALETTE.indexOf(finalTea);

  const commitEvents: Array<{ tea: TeaId; depth: number }> = [];
  let firstCommitTea: TeaId | null = null;
  let firstCommitDepth: number | null = null;
  let firstPressureDepth: number | null = null;
  let matchedDepth: number | null = null;
  let distinctCommitTeas = new Set<TeaId>();
  for (let d = 0; d <= moveCount; d++) {
    const s = statuses[d]!;
    const prev = d === 0 ? ({ kind: 'uncommitted' } as PairedTeaStatus) : statuses[d - 1]!;
    if (s.kind === 'matched' && matchedDepth === null) matchedDepth = d;
    if (s.kind === 'committed') {
      distinctCommitTeas.add(s.tea);
      if (!(prev.kind === 'committed' && prev.tea === s.tea)) {
        commitEvents.push({ tea: s.tea, depth: d });
        if (firstCommitTea === null) {
          firstCommitTea = s.tea;
          firstCommitDepth = d;
        }
      }
      const partner = boards[d]?.[s.partnerIndex] as TeaId[] | undefined;
      if (firstPressureDepth === null && partner?.some((layer) => layer !== s.tea)) {
        firstPressureDepth = d;
      }
    }
  }

  // Earliest stable committed(X) segment containing pressure and a later match.
  let stable: StableSegment | null = null;
  for (let d = 0; d <= moveCount && stable === null; d++) {
    const s = statuses[d]!;
    const prev = d === 0 ? ({ kind: 'uncommitted' } as PairedTeaStatus) : statuses[d - 1]!;
    if (s.kind !== 'committed') continue;
    if (prev.kind === 'committed' && prev.tea === s.tea) continue;
    const tea = s.tea;
    let pressureDepth: number | null = null;
    let matchAt: number | null = null;
    for (let e = d; e <= moveCount; e++) {
      const es = statuses[e]!;
      if (e > d && !(es.kind === 'committed' && es.tea === tea)) {
        if (es.kind === 'matched' && es.tea === tea) matchAt = e;
        break;
      }
      if (es.kind === 'committed') {
        const partner = boards[e]?.[es.partnerIndex] as TeaId[] | undefined;
        if (pressureDepth === null && partner?.some((layer) => layer !== tea)) pressureDepth = e;
      }
    }
    if (pressureDepth !== null && matchAt !== null && matchAt > d) {
      stable = {
        tea,
        commitDepth: d,
        pressureDepth,
        matchDepth: matchAt,
        gap: matchAt - d,
      };
    }
  }

  const commitRatio =
    stable !== null && moveCount > 0 ? stable.commitDepth / moveCount : null;
  const l2 = stable !== null && commitRatio !== null && commitRatio <= 0.8;
  const l1 = solved && win && finalTea !== null;

  // Conflict runs and recovery gaps (metrics only; conflict is never required).
  let conflictStates = 0;
  const conflictRecoveryGaps: number[] = [];
  let conflictStart: number | null = null;
  for (let d = 0; d <= moveCount; d++) {
    const isConflict = statuses[d]!.kind === 'conflict';
    if (isConflict) {
      conflictStates++;
      if (conflictStart === null) conflictStart = d;
    } else if (conflictStart !== null) {
      conflictRecoveryGaps.push(d - conflictStart);
      conflictStart = null;
    }
  }
  if (conflictStart !== null) conflictRecoveryGaps.push(moveCount - conflictStart + 1);

  return {
    win,
    solved,
    moveCount,
    statuses,
    commitEvents,
    firstCommitTea,
    firstCommitDepth,
    firstPressureDepth,
    matchedDepth,
    finalTea,
    finalRole,
    stable,
    l1,
    l2,
    commitRatio,
    anchorSwitch:
      firstCommitTea !== null && finalTea !== null && firstCommitTea !== finalTea,
    distinctCommitTeas: distinctCommitTeas.size,
    conflictStates,
    conflictRecoveryGaps,
    matchedSameTea: finalStatus.kind === 'matched',
  };
}

export type ControlShape = 'empty+empty' | 'same+same' | 'different full' | 'other';

export function controlFinalShape(cups: TeaId[][]): ControlShape {
  const a = cups[0] as TeaId[];
  const b = cups[1] as TeaId[];
  if (a.length === 0 && b.length === 0) return 'empty+empty';
  if (
    a.length === 2 &&
    b.length === 2 &&
    a[0] === a[1] &&
    b[0] === b[1] &&
    a[0] === b[0]
  ) {
    return 'same+same';
  }
  if (
    a.length === 2 &&
    b.length === 2 &&
    a[0] === a[1] &&
    b[0] === b[1] &&
    a[0] !== b[0]
  ) {
    return 'different full';
  }
  return 'other';
}

function pct(a: number[], p: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function pstats(a: number[]): { p50: number | null; p95: number | null; max: number | null; mean: number | null } {
  return {
    p50: pct(a, 50),
    p95: pct(a, 95),
    max: a.length ? Math.max(...a) : null,
    mean: a.length ? a.reduce((x, y) => x + y, 0) / a.length : null,
  };
}
function hist(a: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const v of a) h[String(v)] = (h[String(v)] ?? 0) + 1;
  return h;
}

export interface CandidateRecord {
  seed: number;
  cups: TeaId[][];
  canon: string;
  attempts: number;
  trace: PairTrace;
  solverSolvable: boolean;
  solverTruncated: boolean;
  minMoves: number;
  visited: number;
  ms: number;
  plain: {
    solvable: boolean;
    truncated: boolean;
    minMoves: number | null;
    visited: number;
    ms: number;
    finalShape: ControlShape | null;
  };
  l3b: boolean;
  strongL3b: boolean;
  l3: boolean;
}

export async function runProfile(topology: Topology, n: number, withFairness: boolean) {
  const lengths = TOPOLOGY_LENGTHS[topology];
  const cons = pairConstraints(lengths.length);
  const plainCons = stripPair(cons);
  const records: CandidateRecord[] = [];

  for (let s = 0; s < n; s++) {
    const { cups, attempts } = shaped(topology, s);
    const start = wrap(cups);
    const canon = canonicalPuzzleKey(start, cons);
    const t0 = performance.now();
    const r = solvePuzzle(cups, {
      cupConstraints: cons,
      maxVisited: MAX_VISITED,
      maxDepth: MAX_DEPTH,
    });
    const ms = performance.now() - t0;
    const solvable = r.solvable && !r.truncated;
    const trace = analyzePairTrace(cups, r.solution ?? [], cons);

    const p0 = performance.now();
    const pr = solvePuzzle(cups, {
      cupConstraints: plainCons,
      maxVisited: MAX_VISITED,
      maxDepth: MAX_DEPTH,
    });
    const pms = performance.now() - p0;
    let plainShape: ControlShape | null = null;
    if (pr.solvable && !pr.truncated) {
      const fin = applySolutionState(start, pr.solution ?? [], plainCons);
      if (fin) plainShape = controlFinalShape(fin.cups as TeaId[][]);
    }
    const plainMoves = pr.solvable && !pr.truncated ? (pr.minMoves ?? null) : null;
    const delta = solvable && plainMoves !== null ? (r.minMoves ?? 0) - plainMoves : null;
    const l3b = delta !== null && delta > 0;
    const strongL3b = delta !== null && delta >= 2;
    const l3 = trace.anchorSwitch || l3b;
    records.push({
      seed: s,
      cups,
      canon,
      attempts,
      trace,
      solverSolvable: r.solvable,
      solverTruncated: r.truncated === true,
      minMoves: r.minMoves ?? 0,
      visited: r.visitedStates,
      ms,
      plain: {
        solvable: pr.solvable,
        truncated: pr.truncated === true,
        minMoves: plainMoves,
        visited: pr.visitedStates,
        ms: pms,
        finalShape: plainShape,
      },
      l3b,
      strongL3b,
      l3,
    });
  }

  const solvable = records.filter(
    (r) => r.solverSolvable && !r.solverTruncated && r.trace.win,
  );
  const unsolvable = records.filter((r) => !r.solverSolvable && !r.solverTruncated);
  const truncated = records.filter((r) => r.solverTruncated);
  const l1 = records.filter((r) => r.trace.l1).length;
  const l2 = records.filter((r) => r.trace.l2 && r.trace.l1);
  const l3a = records.filter((r) => r.trace.anchorSwitch && r.trace.l1);
  const l3bRecs = records.filter((r) => r.l3b && r.trace.l1);
  const l3 = records.filter((r) => r.l3 && r.trace.l1);
  const strong = records.filter((r) => r.strongL3b && r.trace.l1);
  const canonL2 = new Set(l2.map((r) => r.canon));
  const canonL3 = new Set(l3.map((r) => r.canon));

  const commitDepths = l2
    .map((r) => r.trace.stable?.commitDepth)
    .filter((v): v is number => v !== undefined);
  const pressureDepths = l2
    .map((r) => r.trace.stable?.pressureDepth)
    .filter((v): v is number => v !== undefined);
  const matchDepths = l2
    .map((r) => r.trace.stable?.matchDepth)
    .filter((v): v is number => v !== undefined);
  const ratios = l2
    .map((r) => r.trace.commitRatio)
    .filter((v): v is number => v !== null);
  const gaps = l2
    .map((r) => r.trace.stable?.gap)
    .filter((v): v is number => v !== undefined);
  const switchCount = records.filter((r) => r.trace.anchorSwitch).length;
  const conflictCount = records.filter((r) => r.trace.conflictStates > 0).length;
  const conflictStateCounts = records.map((r) => r.trace.conflictStates);
  const recoveryGaps = records.flatMap((r) => r.trace.conflictRecoveryGaps);
  const finalRoles = l2
    .map((r) => r.trace.finalRole)
    .filter((v): v is number => v !== null)
    .reduce<Record<string, number>>((h, role) => {
      h[`c${role}`] = (h[`c${role}`] ?? 0) + 1;
      return h;
    }, {});
  const l1Records = records.filter((r) => r.trace.l1);
  const deltas = l1Records
    .filter((r) => r.plain.minMoves !== null)
    .map((r) => r.minMoves - (r.plain.minMoves as number));
  const controlShapes = records
    .filter((r) => r.trace.l1 && r.plain.finalShape !== null)
    .reduce<Record<string, number>>((h, r) => {
      const k = r.plain.finalShape as string;
      h[k] = (h[k] ?? 0) + 1;
      return h;
    }, {});
  const diverges = records.filter(
    (r) => r.trace.l1 && r.plain.finalShape !== null && r.plain.finalShape !== 'same+same',
  ).length;
  const plainSolvable = records.filter((r) => r.plain.solvable && !r.plain.truncated).length;
  const plainTruncated = records.filter((r) => r.plain.truncated).length;

  const fairness = withFairness
    ? await fairnessCheck(records.filter((r) => r.trace.l1).slice(0, 50), cons)
    : null;

  const solverMs = records.map((r) => r.ms);
  const solverVisited = records.map((r) => r.visited);
  const plainMs = records.map((r) => r.plain.ms);
  const plainVisited = records.map((r) => r.plain.visited);

  const summary = {
    topology,
    sample: n,
    vesselCount: lengths.length,
    shaped: records.length,
    solvable: solvable.length,
    unsolvable: unsolvable.length,
    truncated: truncated.length,
    solvabilityRate: n ? solvable.length / n : 0,
    l1,
    l2: l2.length,
    l2Rate: n ? l2.length / n : 0,
    l3a: l3a.length,
    l3b: l3bRecs.length,
    l3: l3.length,
    strongL3b: strong.length,
    canonicalL2: canonL2.size,
    canonicalL3: canonL3.size,
    commitCountPerReplay: pstats(l2.map((r) => r.trace.commitEvents.length)),
    firstCommitDepth: pstats(commitDepths),
    firstPressureDepth: pstats(pressureDepths),
    matchDepth: pstats(matchDepths),
    commitRatio: pstats(ratios),
    commitMatchesRatio: {
      le065: l2.filter((r) => (r.trace.commitRatio ?? 1) <= 0.65).length,
      le080: l2.filter((r) => (r.trace.commitRatio ?? 1) <= 0.8).length,
    },
    gapHistogram: hist(gaps),
    gapAtLeast2: gaps.filter((g) => g >= 2).length,
    switchCount,
    switchRate: n ? switchCount / n : 0,
    conflictCandidates: conflictCount,
    conflictRate: n ? conflictCount / n : 0,
    conflictStates: pstats(conflictStateCounts),
    conflictRecoveryGaps: hist(recoveryGaps),
    finalRoles,
    distinctCommitTeas: pstats(l2.map((r) => r.trace.distinctCommitTeas)),
    plain: {
      solvable: plainSolvable,
      truncated: plainTruncated,
      dents: pstats(deltas),
      deltaHistogram: hist(deltas),
      diverges,
      divergeRate: n ? diverges / n : 0,
      finalShapes: controlShapes,
    },
    solver: {
      visited: pstats(solverVisited),
      ms: pstats(solverMs),
      plainVisited: pstats(plainVisited),
      plainMs: pstats(plainMs),
    },
    fairness,
    sampleCandidates: records.slice(0, 40).map((r) => {
      const { statuses: _statuses, ...trace } = r.trace;
      return {
        seed: r.seed,
        cups: r.cups,
        canon: r.canon,
        minMoves: r.minMoves,
        ...trace,
        plain: r.plain,
        l3b: r.l3b,
      };
    }),
  };
  return summary;
}

export interface FairnessSummary {
  candidates: number;
  rootConstructive: number;
  solvableFirst: number;
  optimalFirst: number;
  fatalFirstMoves: number;
  doomedCandidates: number;
  totalFirstMoves: number;
}

async function fairnessCheck(
  candidates: CandidateRecord[],
  cons: readonly CupConstraint[],
): Promise<FairnessSummary> {
  let rootConstructive = 0;
  let solvableFirst = 0;
  let optimalFirst = 0;
  let fatalFirstMoves = 0;
  let doomedCandidates = 0;
  let totalFirstMoves = 0;
  for (const c of candidates) {
    const start = wrap(c.cups);
    const first = listConstructiveActionsState(start, cons).filter(
      (a): a is { kind: 'pour'; from: number; to: number } => a.kind === 'pour',
    );
    if (first.length > 0) rootConstructive++;
    let anySolvable = false;
    let anyOptimal = false;
    let allFatal = true;
    for (const a of first) {
      if (!isConstructiveMoveState(start, a.from, a.to, cons)) continue;
      totalFirstMoves++;
      const res = applyPourState(start, a.from, a.to, cons);
      if (!res) continue;
      const r = solvePuzzle(res.state.cups as TeaId[][], {
        cupConstraints: cons,
        maxVisited: MAX_VISITED,
        maxDepth: MAX_DEPTH,
      });
      if (r.solvable && !r.truncated) {
        anySolvable = true;
        allFatal = false;
        if (r.minMoves === c.minMoves - 1) anyOptimal = true;
      } else if (!r.truncated) {
        fatalFirstMoves++;
      }
    }
    if (anySolvable) solvableFirst++;
    if (anyOptimal) optimalFirst++;
    if (allFatal && first.length > 0) doomedCandidates++;
  }
  return {
    candidates: candidates.length,
    rootConstructive,
    solvableFirst,
    optimalFirst,
    fatalFirstMoves,
    doomedCandidates,
    totalFirstMoves,
  };
}

const IS_MAIN = ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('tea-pair-search.ts'));

async function main() {
  const raw = (process.argv[2] ?? 'both').toLowerCase();
  const n = Number(process.argv[3] ?? 2000);
  const withFairness = process.argv.includes('--fairness');
  const profiles: Topology[] = raw === 'both' ? ['V6', 'V7'] : [raw.toUpperCase() as Topology];
  const all: Record<string, unknown> = { n, generatedAt: new Date().toISOString() };
  for (const p of profiles) {
    console.log(`\n===== TEA PAIR ${p} N=${n} =====`);
    const t0 = performance.now();
    const summary = await runProfile(p, n, withFairness);
    const elapsed = performance.now() - t0;
    all[p] = summary;
    const { sampleCandidates: _sample, ...brief } = summary;
    console.log(JSON.stringify(brief, null, 2));
    console.log(`wall: ${elapsed.toFixed(0)}ms`);
  }
  if (IS_MAIN) {
    const out = `scripts/dev/out/tea-pair-${profiles.join('-').toLowerCase()}-${n}.json`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(all, null, 2), 'utf8');
    console.log(`\nwrote ${out}`);
  }
}

if (IS_MAIN) {
  void main();
}
