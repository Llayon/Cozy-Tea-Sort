/**
 * OFFLINE strainer+honey feasibility search (Gauntlet 9 gate §55-64, dev-only).
 * Config: 4c/5v/1e tight, one honey on mixed-full host, one strainer stand-empty.
 * Palette includes buckwheat (c0). Usage: bun scripts/dev/strainer-honey-search.ts [numSeeds] [startSeed]
 * Env EMIT_JSONL: append L2-strong candidates as JSON lines for curation.
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle, applySolutionState } from '../../src/game/logic/solver';
import {
  applyPourState,
  applyPuzzleActionState,
  canonicalPuzzleKey,
  isProductiveStrainerPlacement,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../../src/game/logic/rules';
import type { CupConstraint, SolverAction, TeaId } from '../../src/game/types';

const PALETTE: TeaId[] = ['buckwheat', 'matcha', 'karkade', 'sea_buckthorn'];

function isMixedFull(cup: TeaId[]): boolean {
  return cup.length === 4 && cup.some((t) => t !== cup[0]);
}

function dealOne(
  rng: () => number,
): { cups: TeaId[][]; constraints: CupConstraint[]; honeyHost: number } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) pool.push(PALETTE[c] as TeaId);
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [];
  for (let c = 0; c < 4; c++) cups.push(pool.slice(c * 4, c * 4 + 4));
  cups.push([]);
  shuffleInPlace(rng, cups);
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  const hosts: number[] = [];
  cups.forEach((cup, i) => {
    if (cup.length === 4 && isMixedFull(cup)) hosts.push(i);
  });
  if (hosts.length === 0) return null;
  const honeyHost = hosts[Math.floor(rng() * hosts.length)] as number;
  return { cups, constraints: cons, honeyHost };
}

export interface StrainerHoneyTrace {
  placements: number;
  strainedPours: number;
  releases: number;
  honeyStays: number;
  honeyMoves: number;
  honeyHandoffs: number;
  rejoins: number;
  goalRejoins: number;
  firstPlacementDepth: number | null;
  firstHandoffDepth: number | null;
  firstReleaseDepth: number | null;
  firstRejoinDepth: number | null;
  finalHeldTeaNull: boolean;
  finalHoneyGoal: boolean;
  win: boolean;
}

export function analyzeStrainerHoneyTrace(
  startCups: TeaId[][],
  startHoney: readonly (string | null)[],
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): StrainerHoneyTrace {
  const trace: StrainerHoneyTrace = {
    placements: 0,
    strainedPours: 0,
    releases: 0,
    honeyStays: 0,
    honeyMoves: 0,
    honeyHandoffs: 0,
    rejoins: 0,
    goalRejoins: 0,
    firstPlacementDepth: null,
    firstHandoffDepth: null,
    firstReleaseDepth: null,
    firstRejoinDepth: null,
    finalHeldTeaNull: false,
    finalHoneyGoal: false,
    win: false,
  };
  let cups = startCups.map((c) => [...c]);
  let sinking = [...startHoney] as (string | null)[];
  let floating = cups.map(() => null as null);
  let strainer = { present: true, attachedCupIndex: null as number | null, heldTea: null as TeaId | null };
  const handoffCaught: TeaId[] = [];
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind === 'place-strainer') {
      trace.placements++;
      if (trace.firstPlacementDepth === null) trace.firstPlacementDepth = i;
      const res = applyPuzzleActionState(
        { cups, floatingIngredients: [...floating], sinkingIngredients: [...(sinking as never[])] as never, strainer: { ...strainer } },
        a,
        cupConstraints,
      );
      if (!res) return trace;
      cups = res.state.cups;
      sinking = [...(res.state.sinkingIngredients as unknown as (string | null)[])];
      strainer = { ...res.state.strainer };
      continue;
    }
    if (a.kind === 'release-strainer') {
      trace.releases++;
      if (trace.firstReleaseDepth === null) trace.firstReleaseDepth = i;
      const heldBefore = strainer.heldTea;
      const dest = (a as { to: number }).to;
      const honeyHostBefore = sinking.findIndex((s) => s === 'honey');
      const res = applyPuzzleActionState(
        { cups, floatingIngredients: [...floating], sinkingIngredients: [...(sinking as never[])] as never, strainer: { ...strainer } },
        a,
        cupConstraints,
      );
      if (!res) return trace;
      cups = res.state.cups;
      sinking = [...(res.state.sinkingIngredients as unknown as (string | null)[])];
      strainer = { ...res.state.strainer };
      // REJOIN: held tea came from a handoff and lands in current honey host.
      if (heldBefore !== null && handoffCaught.includes(heldBefore) && dest === honeyHostBefore && honeyHostBefore >= 0) {
        trace.rejoins++;
        if (trace.firstRejoinDepth === null) trace.firstRejoinDepth = i;
        const hostCup = cups[dest] as TeaId[];
        if (
          hostCup.length === 4 &&
          hostCup.every((t) => t === 'buckwheat') &&
          sinking[dest] === 'honey'
        ) {
          trace.goalRejoins++;
        }
      }
      continue;
    }
    // pour
    const from = (a as { from: number }).from;
    const to = (a as { to: number }).to;
    const hostBefore = sinking.findIndex((s) => s === 'honey');
    const wasHoneyHost = hostBefore === from;
    const res = applyPourState(
      { cups, floatingIngredients: [...floating], sinkingIngredients: [...(sinking as never[])] as never, strainer: { ...strainer } },
      from,
      to,
      cupConstraints,
    );
    if (!res) return trace;
    const honeyMoved = res.sinkingIngredientMoved === 'honey';
    if (wasHoneyHost) {
      if (honeyMoved) trace.honeyMoves++;
      else if (res.state.cups[from]?.length !== 0) trace.honeyStays++;
    }
    if (res.strained) {
      trace.strainedPours++;
      if (wasHoneyHost && honeyMoved && res.caughtTea != null && res.state.cups[from]?.length === 0) {
        trace.honeyHandoffs++;
        if (trace.firstHandoffDepth === null) trace.firstHandoffDepth = i;
        handoffCaught.push(res.caughtTea);
      }
    }
    cups = res.state.cups;
    sinking = [...(res.state.sinkingIngredients as unknown as (string | null)[])];
    floating = [...(res.state.floatingIngredients as unknown as never[])] as never as never[];
    strainer = { ...res.state.strainer };
  }
  trace.finalHeldTeaNull = strainer.heldTea === null;
  const fh = sinking.findIndex((s) => s === 'honey');
  trace.finalHoneyGoal =
    fh >= 0 && sinkingIngredientHostSatisfied('honey', cups[fh] as TeaId[], cupConstraints[fh]);
  trace.win = isPuzzleWonState(
    {
      cups,
      floatingIngredients: cups.map(() => null),
      sinkingIngredients: [...(sinking as never[])] as never,
      strainer: { ...strainer },
    },
    cupConstraints,
  );
  return trace;
}

function isL2(
  rescued: boolean,
  trace: StrainerHoneyTrace,
  hasProductivePlacement: boolean,
): boolean {
  return (
    rescued &&
    hasProductivePlacement &&
    trace.honeyHandoffs >= 1 &&
    trace.releases >= 1 &&
    trace.finalHeldTeaNull &&
    trace.finalHoneyGoal &&
    trace.win
  );
}

const EMIT_JSONL = process.env.EMIT_JSONL ?? '';

async function main(numSeeds: number, startSeed: number) {
  let solvW = 0;
  let solvWO = 0;
  let truncW = 0;
  let truncWO = 0;
  let rescued = 0;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  const withTimes: number[] = [];
  const woTimes: number[] = [];
  const withVisited: number[] = [];
  const woVisited: number[] = [];
  const depthHist = new Map<number, number>();
  const placeHist = new Map<number, number>();
  const strainedHist = new Map<number, number>();
  const releaseHist = new Map<number, number>();
  const honeyMovesHist = new Map<number, number>();
  const honeyStaysHist = new Map<number, number>();
  const handoffHist = new Map<number, number>();
  const rejoinHist = new Map<number, number>();
  const firstPlace: number[] = [];
  const firstHandoff: number[] = [];
  const firstRelease: number[] = [];
  const handoffRatio: number[] = [];
  const distinctL2 = new Map<string, { seed: number; depth: number }>();
  const distinctL3 = new Map<string, { seed: number; depth: number }>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    const rng = createRng(`strainerhoneygate:${s}`);
    const deal = dealOne(rng);
    if (!deal) continue;
    const { cups, constraints, honeyHost } = deal;
    const sinking = cups.map((_, i) => (i === honeyHost ? ('honey' as const) : null));
    const floating = cups.map(() => null as null);
    const stand = { present: true, attachedCupIndex: null, heldTea: null };
    if (
      isPuzzleWonState({ cups, floatingIngredients: [...floating], sinkingIngredients: [...sinking], strainer: { ...stand } }, constraints)
    ) {
      continue;
    }
    const tB = Date.now();
    const w = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: [...floating],
      sinkingIngredients: [...sinking],
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
      sinkingIngredients: [...sinking],
    });
    woTimes.push(Date.now() - tA);
    woVisited.push(wo.visitedStates);
    if (wo.truncated) truncWO++;
    const wS = w.solvable && !w.truncated;
    const woS = wo.solvable && !wo.truncated;
    if (wS) solvW++;
    if (woS) solvWO++;
    const isRescued = wS && !wo.truncated && !woS;
    if (isRescued) rescued++;
    if (!wS) continue;
    const sol = (w.solution ?? []) as SolverAction[];
    const trace = analyzeStrainerHoneyTrace(cups, [...sinking], sol, constraints);
    // Productive placement: at least one place-strainer that enables m>=2 strained pour.
    let hasProd = false;
    {
      let bc = cups.map((c) => [...c]);
      let bs = [...sinking] as (string | null)[];
      let bf = cups.map(() => null as null);
      let bstr = { present: true, attachedCupIndex: null as number | null, heldTea: null as TeaId | null };
      for (const a of sol) {
        if (a.kind === 'place-strainer') {
          const to = (a as { to: number }).to;
          if (
            isProductiveStrainerPlacement(
              { cups: bc, floatingIngredients: [...bf], sinkingIngredients: [...(bs as never[])] as never, strainer: { ...bstr } },
              to,
              constraints,
            )
          ) {
            hasProd = true;
            break;
          }
        }
        const res = applyPuzzleActionState(
          { cups: bc, floatingIngredients: [...bf], sinkingIngredients: [...(bs as never[])] as never, strainer: { ...bstr } },
          a,
          constraints,
        );
        if (!res) break;
        bc = res.state.cups;
        bs = [...(res.state.sinkingIngredients as unknown as (string | null)[])];
        bstr = { ...res.state.strainer };
      }
    }
    if (trace.finalHoneyGoal && trace.win) l1++;
    if (!isL2(isRescued, trace, hasProd)) continue;
    l2++;
    const isL3 = trace.rejoins >= 1;
    if (isL3) l3++;
    const d = w.minMoves as number;
    depthHist.set(d, (depthHist.get(d) ?? 0) + 1);
    placeHist.set(trace.placements, (placeHist.get(trace.placements) ?? 0) + 1);
    strainedHist.set(trace.strainedPours, (strainedHist.get(trace.strainedPours) ?? 0) + 1);
    releaseHist.set(trace.releases, (releaseHist.get(trace.releases) ?? 0) + 1);
    honeyMovesHist.set(trace.honeyMoves, (honeyMovesHist.get(trace.honeyMoves) ?? 0) + 1);
    honeyStaysHist.set(trace.honeyStays, (honeyStaysHist.get(trace.honeyStays) ?? 0) + 1);
    handoffHist.set(trace.honeyHandoffs, (handoffHist.get(trace.honeyHandoffs) ?? 0) + 1);
    rejoinHist.set(trace.rejoins, (rejoinHist.get(trace.rejoins) ?? 0) + 1);
    if (trace.firstPlacementDepth !== null) firstPlace.push(trace.firstPlacementDepth);
    if (trace.firstHandoffDepth !== null) {
      firstHandoff.push(trace.firstHandoffDepth);
      handoffRatio.push(trace.firstHandoffDepth / Math.max(1, d));
    }
    if (trace.firstReleaseDepth !== null) firstRelease.push(trace.firstReleaseDepth);
    const key = canonicalPuzzleKey(
      { cups, floatingIngredients: [...floating], sinkingIngredients: [...sinking], strainer: { ...stand } },
      constraints,
    );
    if (!distinctL2.has(key)) distinctL2.set(key, { seed: s, depth: d });
    if (isL3 && !distinctL3.has(key)) distinctL3.set(key, { seed: s, depth: d });
    if (EMIT_JSONL) {
      const fs = await import('node:fs');
      const rel = cups.map((cup) =>
        cup.map((t) => (t === 'buckwheat' ? 'c0' : `c${['matcha', 'karkade', 'sea_buckthorn'].indexOf(t) + 1}`)),
      );
      fs.appendFileSync(
        EMIT_JSONL,
        JSON.stringify({
          seed: s,
          depth: d,
          withVisited: w.visitedStates,
          cups: rel,
          honeyHost,
          placements: trace.placements,
          strainedPours: trace.strainedPours,
          releases: trace.releases,
          honeyMoves: trace.honeyMoves,
          honeyStays: trace.honeyStays,
          handoffs: trace.honeyHandoffs,
          rejoins: trace.rejoins,
          goalRejoins: trace.goalRejoins,
          firstPlacement: trace.firstPlacementDepth,
          firstHandoff: trace.firstHandoffDepth,
          firstRelease: trace.firstReleaseDepth,
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
  console.log(`\n== done in ${dt}s (n=${numSeeds}) ==`);
  console.log(`solvableWith=${solvW} solvableWithout=${solvWO} rescued=${rescued} truncW=${truncW} truncWO=${truncWO}`);
  console.log(`L1=${l1} L2=${l2} L3=${l3} canonicalDistinctL2=${distinctL2.size} canonicalDistinctL3=${distinctL3.size}`);
  console.log(`depthHist: ${[...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`placements: ${[...placeHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`strained: ${[...strainedHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`releases: ${[...releaseHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`honeyMoves: ${[...honeyMovesHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`honeyStays: ${[...honeyStaysHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`handoffs: ${[...handoffHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`rejoins: ${[...rejoinHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`firstPlace p50=${pct(firstPlace, 50)} p95=${pct(firstPlace, 95)}`);
  console.log(`firstHandoff p50=${pct(firstHandoff, 50)} p95=${pct(firstHandoff, 95)}`);
  console.log(`firstRelease p50=${pct(firstRelease, 50)} p95=${pct(firstRelease, 95)}`);
  console.log(`handoffDepth/minMoves p50=${pct(handoffRatio, 50).toFixed(2)} p95=${pct(handoffRatio, 95).toFixed(2)}`);
  console.log(`visitedWith p50=${pct(withVisited, 50)} p95=${pct(withVisited, 95)} max=${withVisited.length ? Math.max(...withVisited) : 0}`);
  console.log(`visitedWithout p50=${pct(woVisited, 50)} p95=${pct(woVisited, 95)} max=${woVisited.length ? Math.max(...woVisited) : 0}`);
  console.log(`solveTimeWith p50=${pct(withTimes, 50)} p95=${pct(withTimes, 95)} max=${withTimes.length ? Math.max(...withTimes) : 0}`);
  console.log(`solveTimeWithout p50=${pct(woTimes, 50)} p95=${pct(woTimes, 95)} max=${woTimes.length ? Math.max(...woTimes) : 0}`);
  const pass = distinctL2.size >= 30;
  console.log(pass ? 'GATE PASS: canonical L2 >= 30' : 'GATE FAIL: canonical L2 < 30');
}

const numSeeds = parseInt(process.argv[2] ?? '5000', 10);
const startSeed = parseInt(process.argv[3] ?? '0', 10);
await main(numSeeds, startSeed);
