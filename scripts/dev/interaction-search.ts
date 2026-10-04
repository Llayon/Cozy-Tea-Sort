/**
 * OFFLINE lemon+honey feasibility search (Gauntlet 8 gate §51-55, dev-only).
 * Config: 4c/6v/2e, lemon + honey on distinct mixed-full hosts, palette with
 * both target teas. Usage: bun scripts/dev/interaction-search.ts [numSeeds] [startSeed]
 * Env EMIT_JSONL: append L2-strong candidates as JSON lines for curation.
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle, applySolutionState } from '../../src/game/logic/solver';
import {
  analyzeIngredientInteraction,
  type IngredientInteractionTrace,
} from '../../src/game/logic/generator';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../../src/game/logic/rules';
import type { CupConstraint, TeaId } from '../../src/game/types';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'buckwheat'];

function isMixedFull(cup: TeaId[]): boolean {
  return cup.length === 4 && cup.some((t) => t !== cup[0]);
}

function dealOne(
  rng: () => number,
): { cups: TeaId[][]; constraints: CupConstraint[]; lemonHost: number; honeyHost: number } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) pool.push(PALETTE[c] as TeaId);
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [];
  for (let c = 0; c < 4; c++) cups.push(pool.slice(c * 4, c * 4 + 4));
  cups.push([], []);
  shuffleInPlace(rng, cups);
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  const eligible: number[] = [];
  cups.forEach((cup, i) => {
    if (cup.length === 4 && isMixedFull(cup)) eligible.push(i);
  });
  if (eligible.length < 2) return null;
  shuffleInPlace(rng, eligible);
  const lemonHost = eligible[0] as number;
  const honeyHost = eligible[1] as number;
  return { cups, constraints: cons, lemonHost, honeyHost };
}

function isL2(t: IngredientInteractionTrace): boolean {
  return (
    t.lemonMoves >= 1 &&
    t.honeyStays >= 1 &&
    t.honeyMoves >= 1 &&
    t.cohostStates >= 1 &&
    t.splitEvents >= 1 &&
    t.finalLemonOk &&
    t.finalHoneyOk &&
    t.win
  );
}

const EMIT_JSONL = process.env.EMIT_JSONL ?? '';

async function main(numSeeds: number, startSeed: number) {
  let solvW = 0;
  let l1 = 0;
  let l2 = 0;
  let l3 = 0;
  let truncW = 0;
  const withTimes: number[] = [];
  const withVisited: number[] = [];
  const depthHist = new Map<number, number>();
  const lemonHist = new Map<number, number>();
  const stayHist = new Map<number, number>();
  const moveHist = new Map<number, number>();
  const cohostHist = new Map<number, number>();
  const splitHist = new Map<number, number>();
  const jointHist = new Map<number, number>();
  const firstCohost: number[] = [];
  const firstSplit: number[] = [];
  const deltas: number[] = [];
  let accidental = 0;
  let accidentalDen = 0;
  const distinctL2 = new Map<string, { seed: number; withD: number }>();
  const distinctL3 = new Map<string, { seed: number; withD: number }>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    const rng = createRng(`interactiongate:${s}`);
    const deal = dealOne(rng);
    if (!deal) continue;
    const { cups, constraints, lemonHost, honeyHost } = deal;
    const floating = cups.map((_, i) => (i === lemonHost ? ('lemon' as const) : null));
    const sinking = cups.map((_, i) => (i === honeyHost ? ('honey' as const) : null));
    if (
      isPuzzleWonState({ cups, floatingIngredients: [...floating], sinkingIngredients: [...sinking] }, constraints)
    ) {
      continue;
    }
    const tB = Date.now();
    const w = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: [...floating],
      sinkingIngredients: [...sinking],
    });
    withTimes.push(Date.now() - tB);
    withVisited.push(w.visitedStates);
    if (w.truncated) truncW++;
    if (!(w.solvable && !w.truncated)) continue;
    solvW++;
    // Tea-only (honey-absent, lemon kept) comparison — informational per §41.
    const wo = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: [...floating],
    });
    const woS = wo.solvable && !wo.truncated;
    if (woS && wo.minMoves !== undefined && w.minMoves !== undefined) {
      deltas.push(w.minMoves - wo.minMoves);
      const teaSol = (wo.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
      let b = cups.map((c) => [...c]);
      let sl = [...sinking];
      let ok = true;
      for (const step of teaSol) {
        if (step.kind !== 'pour') continue;
        const res = applyPourState(
          { cups: b, floatingIngredients: b.map(() => null), sinkingIngredients: [...sl] },
          step.from,
          step.to,
          constraints,
        );
        if (!res) {
          ok = false;
          break;
        }
        b = res.state.cups;
        sl = [...(res.state.sinkingIngredients as (string | null)[])];
      }
      if (ok) {
        accidentalDen++;
        const fh = sl.findIndex((x) => x === 'honey');
        if (fh >= 0 && sinkingIngredientHostSatisfied('honey', b[fh] as TeaId[], constraints[fh])) accidental++;
      }
    }
    const sol = (w.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
    const t = analyzeIngredientInteraction(cups, [...floating], [...sinking], sol, constraints);
    // Cross-check replay helper reproduces the win.
    const fin = applySolutionState(
      { cups, floatingIngredients: [...floating], sinkingIngredients: [...sinking] },
      w.solution ?? [],
      constraints,
    );
    const replayWin = fin !== null && isPuzzleWonState(fin, constraints);
    if (t.finalLemonOk && t.finalHoneyOk && t.win && replayWin) l1++;
    if (!isL2(t) || !replayWin) continue;
    l2++;
    const hasJoint = t.jointMoveEvents >= 1;
    if (hasJoint) l3++;
    depthHist.set(w.minMoves as number, (depthHist.get(w.minMoves as number) ?? 0) + 1);
    lemonHist.set(t.lemonMoves, (lemonHist.get(t.lemonMoves) ?? 0) + 1);
    stayHist.set(t.honeyStays, (stayHist.get(t.honeyStays) ?? 0) + 1);
    moveHist.set(t.honeyMoves, (moveHist.get(t.honeyMoves) ?? 0) + 1);
    cohostHist.set(t.cohostStates, (cohostHist.get(t.cohostStates) ?? 0) + 1);
    splitHist.set(t.splitEvents, (splitHist.get(t.splitEvents) ?? 0) + 1);
    jointHist.set(t.jointMoveEvents, (jointHist.get(t.jointMoveEvents) ?? 0) + 1);
    if (t.firstCohostDepth !== null) firstCohost.push(t.firstCohostDepth);
    if (t.firstSplitDepth !== null) firstSplit.push(t.firstSplitDepth);
    const key = canonicalPuzzleKey(
      { cups, floatingIngredients: [...floating], sinkingIngredients: [...sinking] },
      constraints,
    );
    if (!distinctL2.has(key)) distinctL2.set(key, { seed: s, withD: w.minMoves as number });
    if (hasJoint && !distinctL3.has(key)) distinctL3.set(key, { seed: s, withD: w.minMoves as number });
    if (EMIT_JSONL) {
      const fs = await import('node:fs');
      fs.appendFileSync(
        EMIT_JSONL,
        JSON.stringify({
          seed: s,
          depth: w.minMoves,
          withVisited: w.visitedStates,
          cups,
          lemonHost,
          honeyHost,
          lemonMoves: t.lemonMoves,
          honeyStays: t.honeyStays,
          honeyMoves: t.honeyMoves,
          cohostStates: t.cohostStates,
          splitEvents: t.splitEvents,
          jointMoveEvents: t.jointMoveEvents,
          firstCohost: t.firstCohostDepth,
          firstSplit: t.firstSplitDepth,
        }) + '\n',
      );
    }
    if ((s - startSeed + 1) % 250 === 0) {
      console.log(`[${s - startSeed + 1}/${numSeeds}] W=${solvW} L2=${l2} L3=${l3} distinctL2=${distinctL2.size}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const pct = (a: number[], p: number): number => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
  };
  console.log(`\n== done in ${dt}s (n=${numSeeds}) ==`);
  console.log(`solvableWith=${solvW} L1=${l1} L2=${l2} L3=${l3} truncW=${truncW}`);
  console.log(`canonicalDistinctL2=${distinctL2.size} canonicalDistinctL3=${distinctL3.size}`);
  console.log(`depthHist: ${[...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`lemonMoves: ${[...lemonHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`honeyStays: ${[...stayHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`honeyMoves: ${[...moveHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`cohost: ${[...cohostHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`splits: ${[...splitHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`joint: ${[...jointHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`firstCohost p50=${pct(firstCohost, 50)} p95=${pct(firstCohost, 95)}`);
  console.log(`firstSplit p50=${pct(firstSplit, 50)} p95=${pct(firstSplit, 95)}`);
  console.log(`delta p50=${pct(deltas, 50)} max=${deltas.length ? Math.max(...deltas) : 0} n=${deltas.length}`);
  console.log(`teaOnlyAccidental=${accidental}/${accidentalDen}`);
  console.log(`solveTimeMs p50=${pct(withTimes, 50)} p95=${pct(withTimes, 95)} max=${withTimes.length ? Math.max(...withTimes) : 0}`);
  console.log(`visited p50=${pct(withVisited, 50)} p95=${pct(withVisited, 95)} max=${withVisited.length ? Math.max(...withVisited) : 0}`);
}

const numSeeds = parseInt(process.argv[2] ?? '1000', 10);
const startSeed = parseInt(process.argv[3] ?? '0', 10);
await main(numSeeds, startSeed);
