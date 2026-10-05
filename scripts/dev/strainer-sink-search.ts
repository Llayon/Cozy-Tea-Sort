/**
 * OFFLINE strainer×sink feasibility search (Gauntlet 9 gate §55-66, dev-only).
 * Topology: 4c/6v/2e — 4 filled normal + 1 empty normal + 1 empty sink-only
 * (stable last slot, G3 convention) + stand-empty strainer. No other specials.
 * Usage: bun scripts/dev/strainer-sink-search.ts [numSeeds] [startSeed]
 * Env EMIT_JSONL: append L2-strong candidates as JSON lines for curation.
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle } from '../../src/game/logic/solver';
import {
  applyPourState,
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isProductiveStrainerPlacement,
  isPuzzleWonState,
} from '../../src/game/logic/rules';
import type { CupConstraint, SolverAction, TeaId } from '../../src/game/types';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function dealOne(
  rng: () => number,
): { cups: TeaId[][]; constraints: CupConstraint[]; sinkIndex: number } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) pool.push(PALETTE[c] as TeaId);
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [];
  for (let c = 0; c < 4; c++) cups.push(pool.slice(c * 4, c * 4 + 4));
  cups.push([]);
  shuffleInPlace(rng, cups);
  // Sink replaces an empty role at the stable last slot (G3 convention).
  const last = cups.length - 1;
  const empties: number[] = [];
  cups.forEach((cup, i) => {
    if (cup.length === 0) empties.push(i);
  });
  if (empties.length === 0) return null;
  if (!empties.includes(last)) {
    const slot = empties[Math.floor(rng() * empties.length)] as number;
    const tmp = cups[last] as TeaId[];
    cups[last] = cups[slot] as TeaId[];
    cups[slot] = tmp;
  }
  cups[last] = [];
  const constraints: CupConstraint[] = cups.map((_, i) =>
    i === last ? { mode: 'sink-only' as const } : { mode: 'normal' as const },
  );
  return { cups, constraints, sinkIndex: last };
}

export interface StrainerSinkTrace {
  placements: number;
  strainedPours: number;
  releases: number;
  guardedSinkEvents: number;
  releasesIntoSink: number;
  releasesElsewhere: number;
  sinkReceivesOrdinary: number;
  sinkReceivesStrained: number;
  firstPlacementDepth: number | null;
  firstGuardedSinkDepth: number | null;
  firstReleaseDepth: number | null;
  finalHeldTeaNull: boolean;
  finalSinkSatisfied: boolean;
  win: boolean;
  /** L3 recommit depths (caught tea released into SAME sink after >=1 transfer). */
  recommitDepths: number[];
}

interface GuardedCatch {
  tea: TeaId;
  sink: number;
  depth: number;
}

export function analyzeStrainerSinkTrace(
  startCups: TeaId[][],
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): StrainerSinkTrace {
  const trace: StrainerSinkTrace = {
    placements: 0,
    strainedPours: 0,
    releases: 0,
    guardedSinkEvents: 0,
    releasesIntoSink: 0,
    releasesElsewhere: 0,
    sinkReceivesOrdinary: 0,
    sinkReceivesStrained: 0,
    firstPlacementDepth: null,
    firstGuardedSinkDepth: null,
    firstReleaseDepth: null,
    finalHeldTeaNull: false,
    finalSinkSatisfied: false,
    win: false,
    recommitDepths: [],
  };
  const sinkIndex = cupConstraints.findIndex((c) => c.mode === 'sink-only');
  let cups = startCups.map((c) => [...c]);
  let floating = cups.map(() => null as null);
  let strainer = { present: true, attachedCupIndex: null as number | null, heldTea: null as TeaId | null };
  const catches: GuardedCatch[] = [];
  const transferDepths: number[] = [];
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind === 'place-strainer') {
      trace.placements++;
      if (trace.firstPlacementDepth === null) trace.firstPlacementDepth = i;
      const res = applyPuzzleActionState(
        { cups, floatingIngredients: [...floating], strainer: { ...strainer } },
        a,
        cupConstraints,
      );
      if (!res) return trace;
      cups = res.state.cups;
      strainer = { ...res.state.strainer };
      continue;
    }
    if (a.kind === 'release-strainer') {
      trace.releases++;
      if (trace.firstReleaseDepth === null) trace.firstReleaseDepth = i;
      const heldBefore = strainer.heldTea;
      const dest = (a as { to: number }).to;
      const res = applyPuzzleActionState(
        { cups, floatingIngredients: [...floating], strainer: { ...strainer } },
        a,
        cupConstraints,
      );
      if (!res) return trace;
      cups = res.state.cups;
      strainer = { ...res.state.strainer };
      transferDepths.push(i);
      if (dest === sinkIndex) trace.releasesIntoSink++;
      else trace.releasesElsewhere++;
      // L3 recommit: held tea caught at SAME sink, >=1 transfer strictly between.
      if (heldBefore !== null && dest === sinkIndex) {
        for (const c of catches) {
          if (c.tea === heldBefore && c.sink === dest && transferDepths.some((d) => d > c.depth && d < i)) {
            trace.recommitDepths.push(i);
            break;
          }
        }
      }
      continue;
    }
    const from = (a as { from: number }).from;
    const to = (a as { to: number }).to;
    const res = applyPourState(
      { cups, floatingIngredients: [...floating], strainer: { ...strainer } },
      from,
      to,
      cupConstraints,
    );
    if (!res) return trace;
    transferDepths.push(i);
    if (to === sinkIndex) {
      if (res.strained) trace.sinkReceivesStrained++;
      else trace.sinkReceivesOrdinary++;
    }
    if (res.strained) {
      trace.strainedPours++;
      if (
        to === sinkIndex &&
        res.caughtTea != null &&
        res.transferred >= 2 &&
        res.received === res.transferred - 1
      ) {
        trace.guardedSinkEvents++;
        if (trace.firstGuardedSinkDepth === null) trace.firstGuardedSinkDepth = i;
        catches.push({ tea: res.caughtTea, sink: to, depth: i });
      }
    }
    cups = res.state.cups;
    floating = [...(res.state.floatingIngredients as unknown as null[])];
    strainer = { ...res.state.strainer };
  }
  trace.finalHeldTeaNull = strainer.heldTea === null;
  const sinkCup = cups[sinkIndex] as TeaId[] | undefined;
  trace.finalSinkSatisfied =
    sinkIndex >= 0 &&
    sinkCup !== undefined &&
    sinkCup.length === 4 &&
    sinkCup.every((t) => t === sinkCup[0]);
  trace.win = isPuzzleWonState(
    { cups, floatingIngredients: cups.map(() => null), strainer: { ...strainer } },
    cupConstraints,
  );
  return trace;
}

const EMIT_JSONL = process.env.EMIT_JSONL ?? '';

async function main(numSeeds: number, startSeed: number) {
  let solvW = 0;
  let solvWO = 0;
  let truncW = 0;
  let truncWO = 0;
  let rescued = 0;
  let strictlyShorter = 0;
  let bothSolvable = 0;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  // §65 root-cause diagnostics (over WITH-solvable optimal replays).
  let anyStrainerUse = 0;
  let strainedToNormal = 0;
  let strainedToSink = 0;
  let sinkAllOrdinary = 0;
  let rescuedNoSinkTouch = 0;
  const withTimes: number[] = [];
  const woTimes: number[] = [];
  const withVisited: number[] = [];
  const woVisited: number[] = [];
  const depthHist = new Map<number, number>();
  const placeHist = new Map<number, number>();
  const strainedHist = new Map<number, number>();
  const guardedHist = new Map<number, number>();
  const releaseHist = new Map<number, number>();
  const relSinkHist = new Map<number, number>();
  const relElseHist = new Map<number, number>();
  const ordSinkHist = new Map<number, number>();
  const firstPlace: number[] = [];
  const firstGuarded: number[] = [];
  const firstRelease: number[] = [];
  const guardedRatio: number[] = [];
  const distinctL2 = new Map<string, { seed: number; depth: number }>();
  const distinctL3 = new Map<string, { seed: number; depth: number }>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    const rng = createRng(`strainersinkgate:${s}`);
    const deal = dealOne(rng);
    if (!deal) continue;
    const { cups, constraints, sinkIndex } = deal;
    void sinkIndex;
    const floating = cups.map(() => null as null);
    const stand = { present: true, attachedCupIndex: null, heldTea: null };
    if (
      isPuzzleWonState({ cups, floatingIngredients: [...floating], strainer: { ...stand } }, constraints)
    ) {
      continue;
    }
    const tB = Date.now();
    const w = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: [...floating],
      strainer: { ...stand },
    });
    withTimes.push(Date.now() - tB);
    withVisited.push(w.visitedStates);
    if (w.truncated) truncW++;
    const tA = Date.now();
    const wo = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: [...floating],
    });
    woTimes.push(Date.now() - tA);
    woVisited.push(wo.visitedStates);
    if (wo.truncated) truncWO++;
    const wS = w.solvable && !w.truncated;
    const woS = wo.solvable && !wo.truncated;
    if (wS) solvW++;
    if (woS) solvWO++;
    if (wS && woS) {
      bothSolvable++;
      if ((w.minMoves as number) < (wo.minMoves as number)) strictlyShorter++;
    }
    const isRescued = wS && !wo.truncated && !woS;
    if (isRescued) rescued++;
    if (!wS) continue;
    const sol = (w.solution ?? []) as SolverAction[];
    const trace = analyzeStrainerSinkTrace(cups, sol, constraints);
    // Productive placement anywhere in the replay.
    let hasProd = false;
    {
      let bc = cups.map((c) => [...c]);
      let bf = cups.map(() => null as null);
      let bstr = { present: true, attachedCupIndex: null as number | null, heldTea: null as TeaId | null };
      for (const a of sol) {
        if (a.kind === 'place-strainer') {
          const to = (a as { to: number }).to;
          if (
            isProductiveStrainerPlacement(
              { cups: bc, floatingIngredients: [...bf], strainer: { ...bstr } },
              to,
              constraints,
            )
          ) {
            hasProd = true;
            break;
          }
        }
        const res = applyPuzzleActionState(
          { cups: bc, floatingIngredients: [...bf], strainer: { ...bstr } },
          a,
          constraints,
        );
        if (!res) break;
        bc = res.state.cups;
        bstr = { ...res.state.strainer };
      }
    }
    const usesStrainer = trace.placements > 0 || trace.strainedPours > 0 || trace.releases > 0;
    if (usesStrainer) anyStrainerUse++;
    if (trace.strainedPours > trace.guardedSinkEvents) strainedToNormal++;
    if (trace.guardedSinkEvents > 0) strainedToSink++;
    if (trace.finalSinkSatisfied && trace.sinkReceivesStrained === 0) sinkAllOrdinary++;
    if (isRescued && trace.guardedSinkEvents === 0 && trace.releasesIntoSink === 0) rescuedNoSinkTouch++;
    if (trace.finalSinkSatisfied && trace.win) l1++;
    const isL2 =
      isRescued &&
      hasProd &&
      trace.guardedSinkEvents >= 1 &&
      trace.releases >= 1 &&
      trace.finalHeldTeaNull &&
      trace.finalSinkSatisfied &&
      trace.win;
    if (!isL2) continue;
    l2++;
    const isL3 = trace.recommitDepths.length >= 1;
    if (isL3) l3++;
    const d = w.minMoves as number;
    depthHist.set(d, (depthHist.get(d) ?? 0) + 1);
    placeHist.set(trace.placements, (placeHist.get(trace.placements) ?? 0) + 1);
    strainedHist.set(trace.strainedPours, (strainedHist.get(trace.strainedPours) ?? 0) + 1);
    guardedHist.set(trace.guardedSinkEvents, (guardedHist.get(trace.guardedSinkEvents) ?? 0) + 1);
    releaseHist.set(trace.releases, (releaseHist.get(trace.releases) ?? 0) + 1);
    relSinkHist.set(trace.releasesIntoSink, (relSinkHist.get(trace.releasesIntoSink) ?? 0) + 1);
    relElseHist.set(trace.releasesElsewhere, (relElseHist.get(trace.releasesElsewhere) ?? 0) + 1);
    ordSinkHist.set(trace.sinkReceivesOrdinary, (ordSinkHist.get(trace.sinkReceivesOrdinary) ?? 0) + 1);
    if (trace.firstPlacementDepth !== null) firstPlace.push(trace.firstPlacementDepth);
    if (trace.firstGuardedSinkDepth !== null) {
      firstGuarded.push(trace.firstGuardedSinkDepth);
      guardedRatio.push(trace.firstGuardedSinkDepth / Math.max(1, d));
    }
    if (trace.firstReleaseDepth !== null) firstRelease.push(trace.firstReleaseDepth);
    const key = canonicalPuzzleKey(
      { cups, floatingIngredients: [...floating], strainer: { ...stand } },
      constraints,
    );
    if (!distinctL2.has(key)) distinctL2.set(key, { seed: s, depth: d });
    if (isL3 && !distinctL3.has(key)) distinctL3.set(key, { seed: s, depth: d });
    if (EMIT_JSONL) {
      const fs = await import('node:fs');
      const rel = cups.map((cup) => cup.map((t) => `c${PALETTE.indexOf(t)}`));
      fs.appendFileSync(
        EMIT_JSONL,
        JSON.stringify({
          seed: s, depth: d, withVisited: w.visitedStates, cups: rel, sinkIndex,
          placements: trace.placements, strainedPours: trace.strainedPours,
          guarded: trace.guardedSinkEvents, releases: trace.releases,
          relSink: trace.releasesIntoSink, relElse: trace.releasesElsewhere,
          ordSink: trace.sinkReceivesOrdinary,
          firstPlacement: trace.firstPlacementDepth, firstGuarded: trace.firstGuardedSinkDepth,
          firstRelease: trace.firstReleaseDepth, recommit: trace.recommitDepths,
        }) + '\n',
      );
    }
    if ((s - startSeed + 1) % 250 === 0) {
      console.log(`[${s - startSeed + 1}/${numSeeds}] W=${solvW} WO=${solvWO} resc=${rescued} L2=${l2} L3=${l3} dL2=${distinctL2.size}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const pct = (a: number[], p: number): number => {
    if (!a.length) return 0;
    const s2 = [...a].sort((x, y) => x - y);
    return s2[Math.min(s2.length - 1, Math.floor((p / 100) * s2.length))] as number;
  };
  const hist = (m: Map<number, number>): string =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ');
  console.log(`\n== done in ${dt}s (n=${numSeeds}) ==`);
  console.log(`solvableWith=${solvW} solvableWithout=${solvWO} rescued=${rescued} truncW=${truncW} truncWO=${truncWO}`);
  console.log(`bothSolvable=${bothSolvable} strictlyShorter=${strictlyShorter}`);
  console.log(`L1=${l1} L2=${l2} L3=${l3} canonicalDistinctL2=${distinctL2.size} canonicalDistinctL3=${distinctL3.size}`);
  console.log(`depthHist: ${hist(depthHist)}`);
  console.log(`placements: ${hist(placeHist)}`);
  console.log(`strained: ${hist(strainedHist)}`);
  console.log(`guardedSink: ${hist(guardedHist)}`);
  console.log(`releases: ${hist(releaseHist)}`);
  console.log(`releasesIntoSink: ${hist(relSinkHist)}`);
  console.log(`releasesElsewhere: ${hist(relElseHist)}`);
  console.log(`ordinarySinkReceives: ${hist(ordSinkHist)}`);
  console.log(`firstPlace p50=${pct(firstPlace, 50)} p95=${pct(firstPlace, 95)}`);
  console.log(`firstGuarded p50=${pct(firstGuarded, 50)} p95=${pct(firstGuarded, 95)}`);
  console.log(`firstRelease p50=${pct(firstRelease, 50)} p95=${pct(firstRelease, 95)}`);
  console.log(`guardedDepth/minMoves p50=${pct(guardedRatio, 50).toFixed(2)} p95=${pct(guardedRatio, 95).toFixed(2)}`);
  console.log(`visitedWith p50=${pct(withVisited, 50)} p95=${pct(withVisited, 95)} max=${withVisited.length ? Math.max(...withVisited) : 0}`);
  console.log(`visitedWithout p50=${pct(woVisited, 50)} p95=${pct(woVisited, 95)} max=${woVisited.length ? Math.max(...woVisited) : 0}`);
  console.log(`solveTimeWith p50=${pct(withTimes, 50)} p95=${pct(withTimes, 95)} max=${withTimes.length ? Math.max(...withTimes) : 0}`);
  console.log(`solveTimeWithout p50=${pct(woTimes, 50)} p95=${pct(woTimes, 95)} max=${woTimes.length ? Math.max(...woTimes) : 0}`);
  console.log(`--- §65 diagnostics (denominator: WITH-solvable=${solvW}) ---`);
  console.log(`anyStrainerUse=${anyStrainerUse} (${(100 * anyStrainerUse / Math.max(1, solvW)).toFixed(1)}%)`);
  console.log(`strainedToNormal=${strainedToNormal} (${(100 * strainedToNormal / Math.max(1, solvW)).toFixed(1)}%)`);
  console.log(`strainedToSink=${strainedToSink} (${(100 * strainedToSink / Math.max(1, solvW)).toFixed(1)}%)`);
  console.log(`sinkAllOrdinary=${sinkAllOrdinary} (${(100 * sinkAllOrdinary / Math.max(1, solvW)).toFixed(1)}%)`);
  console.log(`rescuedNoSinkTouch=${rescuedNoSinkTouch} (of rescued=${rescued})`);
  console.log(distinctL2.size >= 30 ? 'GATE PASS: canonical L2 >= 30' : 'GATE FAIL: canonical L2 < 30');
}

const numSeeds = parseInt(process.argv[2] ?? '5000', 10);
const startSeed = parseInt(process.argv[3] ?? '0', 10);
await main(numSeeds, startSeed);
