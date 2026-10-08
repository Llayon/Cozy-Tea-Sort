/**
 * OFFLINE frozen-cup feasibility search (Gauntlet 9 gate §63-78, dev-only).
 * Topology: 4 colors (SB + 3 others), 6 vessels, 16 tea units, layer counts
 * exactly {4,4,4,3,1,0}; the 3-layer vessel is the frozen host (mixed,
 * exactly one SB, SB on top, ice active). No other specials.
 * Usage: bun scripts/dev/frozen-cup-search.ts [numSeeds] [startSeed]
 * Env EMIT_JSONL: append L2-strong candidates as JSON lines for curation.
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle } from '../../src/game/logic/solver';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../../src/game/logic/rules';
import { ICE_MELT_TEA } from '../../src/game/types';
import type { CupConstraint, IceSlot, SolverAction, TeaId } from '../../src/game/types';

const SB: TeaId = 'sea_buckthorn';
const PALETTE: TeaId[] = [SB, 'matcha', 'karkade', 'milk_oolong'];

function dealOne(
  rng: () => number,
): { cups: TeaId[][]; constraints: CupConstraint[]; frozenHost: number } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) pool.push(PALETTE[c] as TeaId);
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [
    pool.slice(0, 4),
    pool.slice(4, 8),
    pool.slice(8, 12),
    pool.slice(12, 15),
    pool.slice(15, 16),
    [],
  ];
  shuffleInPlace(rng, cups);
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  // Frozen host = the 3-layer vessel iff production-shaped: mixed,
  // exactly one SB, SB on top.
  const host = cups.findIndex((cup) => cup.length === 3);
  if (host < 0) return null;
  const hc = cups[host] as TeaId[];
  if (hc.filter((t) => t === SB).length !== 1) return null;
  if (hc[hc.length - 1] !== SB) return null;
  if (!hc.some((t) => t !== hc[0])) return null;
  return { cups, constraints: cons, frozenHost: host };
}

export interface IceTrace {
  melts: number;
  sourceUsesAfterMelt: number;
  deepUnlocks: number;
  firstMeltDepth: number | null;
  firstSourceUseDepth: number | null;
  firstDeepUnlockDepth: number | null;
  finalIceCleared: boolean;
  win: boolean;
}

export function analyzeIceTrace(
  startCups: TeaId[][],
  frozenHost: number,
  solution: readonly SolverAction[],
  cupConstraints: readonly CupConstraint[],
): IceTrace {
  const trace: IceTrace = {
    melts: 0,
    sourceUsesAfterMelt: 0,
    deepUnlocks: 0,
    firstMeltDepth: null,
    firstSourceUseDepth: null,
    firstDeepUnlockDepth: null,
    finalIceCleared: false,
    win: false,
  };
  let cups = startCups.map((c) => [...c]);
  let ice: IceSlot[] = cups.map((_, i) => (i === frozenHost ? ('ice' as const) : null));
  let melted = false;
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const res = applyPourState(
      { cups, floatingIngredients: cups.map(() => null), iceSlots: [...ice] },
      from,
      (a as { to: number }).to,
      cupConstraints,
    );
    if (!res) return trace;
    cups = res.state.cups;
    ice = [...res.state.iceSlots];
    if (res.iceMelted === 'ice') {
      trace.melts++;
      if (trace.firstMeltDepth === null) trace.firstMeltDepth = i;
      melted = true;
    }
    if (melted && from === frozenHost) {
      trace.sourceUsesAfterMelt++;
      if (trace.firstSourceUseDepth === null) trace.firstSourceUseDepth = i;
    }
    if (melted && (cups[frozenHost] as TeaId[]).length < 3) {
      trace.deepUnlocks++;
      if (trace.firstDeepUnlockDepth === null) trace.firstDeepUnlockDepth = i;
    }
  }
  trace.finalIceCleared = ice.every((s) => s === null);
  trace.win = isPuzzleWonState(
    { cups, floatingIngredients: cups.map(() => null), iceSlots: [...ice] },
    cupConstraints,
  );
  void ICE_MELT_TEA;
  return trace;
}

const EMIT_JSONL = process.env.EMIT_JSONL ?? '';

async function main(numSeeds: number, startSeed: number) {
  let shaped = 0;
  let solv = 0;
  let unsolv = 0;
  let trunc = 0;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  const withTimes: number[] = [];
  const withVisited: number[] = [];
  const withMoves: number[] = [];
  const noIceMoves: number[] = [];
  const deltas: number[] = [];
  const depthHist = new Map<number, number>();
  const firstMelt: number[] = [];
  const firstUse: number[] = [];
  const firstDeep: number[] = [];
  const meltRatio: number[] = [];
  const useRatio: number[] = [];
  // §76 quality diagnostics (denominator: L2).
  let meltMove1 = 0;
  let meltQ1 = 0;
  let meltMid = 0;
  let meltQ4 = 0;
  let useImmediate = 0;
  let useDelayed = 0;
  const distinctL2 = new Map<string, { seed: number; depth: number }>();
  const distinctL3 = new Map<string, { seed: number; depth: number }>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    const rng = createRng(`frozengate:${s}`);
    const deal = dealOne(rng);
    if (!deal) continue;
    shaped++;
    const { cups, constraints, frozenHost } = deal;
    const ice = cups.map((_, i) => (i === frozenHost ? ('ice' as const) : null));
    const floating = cups.map(() => null as null);
    if (isPuzzleWonState({ cups, floatingIngredients: [...floating], iceSlots: [...ice] }, constraints)) {
      unsolv++;
      continue;
    }
    const tB = Date.now();
    const w = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: [...floating],
      iceSlots: [...ice],
    });
    withTimes.push(Date.now() - tB);
    withVisited.push(w.visitedStates);
    if (w.truncated) {
      trunc++;
      continue;
    }
    if (!w.solvable || w.minMoves === undefined) {
      unsolv++;
      continue;
    }
    solv++;
    const d = w.minMoves;
    withMoves.push(d);
    const sol = (w.solution ?? []) as SolverAction[];
    const trace = analyzeIceTrace(cups, frozenHost, sol, constraints);
    // No-ice comparison (§71, diagnostics only).
    const ni = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints, floatingIngredients: [...floating] });
    if (ni.solvable && !ni.truncated && ni.minMoves !== undefined) {
      noIceMoves.push(ni.minMoves);
      deltas.push(d - ni.minMoves);
    }
    if (trace.melts >= 1 && trace.win) l1++;
    const isL2 =
      trace.melts >= 1 && trace.sourceUsesAfterMelt >= 1 && trace.finalIceCleared && trace.win;
    if (!isL2) continue;
    l2++;
    const isL3 = trace.deepUnlocks >= 1;
    if (isL3) l3++;
    depthHist.set(d, (depthHist.get(d) ?? 0) + 1);
    if (trace.firstMeltDepth !== null) {
      firstMelt.push(trace.firstMeltDepth);
      meltRatio.push(trace.firstMeltDepth / Math.max(1, d));
      if (trace.firstMeltDepth === 0) meltMove1++;
      const q = trace.firstMeltDepth / Math.max(1, d);
      if (q <= 0.25) meltQ1++;
      else if (q < 0.75) meltMid++;
      else meltQ4++;
    }
    if (trace.firstSourceUseDepth !== null) {
      firstUse.push(trace.firstSourceUseDepth);
      useRatio.push(trace.firstSourceUseDepth / Math.max(1, d));
      if (trace.firstMeltDepth !== null) {
        if (trace.firstSourceUseDepth === trace.firstMeltDepth + 1) useImmediate++;
        else useDelayed++;
      }
    }
    if (trace.firstDeepUnlockDepth !== null) firstDeep.push(trace.firstDeepUnlockDepth);
    const key = canonicalPuzzleKey(
      { cups, floatingIngredients: [...floating], iceSlots: [...ice] },
      constraints,
    );
    if (!distinctL2.has(key)) distinctL2.set(key, { seed: s, depth: d });
    if (isL3 && !distinctL3.has(key)) distinctL3.set(key, { seed: s, depth: d });
    if (EMIT_JSONL) {
      const fs = await import('node:fs');
      const rel = cups.map((cup) => cup.map((t) => (t === SB ? 'c0' : `c${['matcha', 'karkade', 'milk_oolong'].indexOf(t) + 1}`)));
      fs.appendFileSync(
        EMIT_JSONL,
        JSON.stringify({
          seed: s, depth: d, withVisited: w.visitedStates, cups: rel, frozenHost,
          melts: trace.melts, uses: trace.sourceUsesAfterMelt, deep: trace.deepUnlocks,
          firstMelt: trace.firstMeltDepth, firstUse: trace.firstSourceUseDepth, firstDeep: trace.firstDeepUnlockDepth,
        }) + '\n',
      );
    }
    if ((s - startSeed + 1) % 500 === 0) {
      console.log(`[${s - startSeed + 1}/${numSeeds}] shaped=${shaped} solv=${solv} L2=${l2} L3=${l3} dL2=${distinctL2.size}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const pct = (a: number[], p: number): number => {
    if (!a.length) return 0;
    const s2 = [...a].sort((x, y) => x - y);
    return s2[Math.min(s2.length - 1, Math.floor((p / 100) * s2.length))] as number;
  };
  const hist = (m: Map<number, number>): string =>
    [...m.entries()].sort((a, b) => a[0] - b[0]).map(([x, c]) => `${x}:${c}`).join(' ');
  console.log(`\n== done in ${dt}s (n=${numSeeds}) ==`);
  console.log(`shaped=${shaped} solvable=${solv} unsolvable=${unsolv} truncated=${trunc}`);
  console.log(`L1=${l1} L2=${l2} L3=${l3} canonicalDistinctL2=${distinctL2.size} canonicalDistinctL3=${distinctL3.size}`);
  console.log(`depthHist: ${hist(depthHist)}`);
  console.log(`firstMelt p50=${pct(firstMelt, 50)} p95=${pct(firstMelt, 95)}`);
  console.log(`firstSourceUse p50=${pct(firstUse, 50)} p95=${pct(firstUse, 95)}`);
  console.log(`firstDeepUnlock p50=${pct(firstDeep, 50)} p95=${pct(firstDeep, 95)}`);
  console.log(`meltDepth/minMoves p50=${pct(meltRatio, 50).toFixed(2)} p95=${pct(meltRatio, 95).toFixed(2)}`);
  console.log(`sourceUseDepth/minMoves p50=${pct(useRatio, 50).toFixed(2)} p95=${pct(useRatio, 95).toFixed(2)}`);
  console.log(`withIce minMoves p50=${pct(withMoves, 50)} p95=${pct(withMoves, 95)}`);
  console.log(`noIce minMoves p50=${pct(noIceMoves, 50)} p95=${pct(noIceMoves, 95)} n=${noIceMoves.length}`);
  console.log(`iceDelta(with-noIce) p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 0} n=${deltas.length}`);
  console.log(`visited p50=${pct(withVisited, 50)} p95=${pct(withVisited, 95)} max=${withVisited.length ? Math.max(...withVisited) : 0}`);
  console.log(`solveMs p50=${pct(withTimes, 50)} p95=${pct(withTimes, 95)} max=${withTimes.length ? Math.max(...withTimes) : 0}`);
  console.log(`--- §76 quality (denominator L2=${l2}) ---`);
  console.log(`meltMove1=${meltMove1} meltQ1=${meltQ1} meltMid=${meltMid} meltQ4=${meltQ4}`);
  console.log(`useImmediate=${useImmediate} useDelayed=${useDelayed}`);
  console.log(distinctL2.size >= 30 ? 'GATE PASS: canonical L2 >= 30' : 'GATE FAIL: canonical L2 < 30');
}

const numSeeds = parseInt(process.argv[2] ?? '5000', 10);
const startSeed = parseInt(process.argv[3] ?? '0', 10);
await main(numSeeds, startSeed);
