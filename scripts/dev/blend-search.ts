/**
 * G13 Phase A feasibility sampler (DEV ONLY — never CI/production).
 *
 * Abstract recipe: matcha (A) + karkade (B) → saffron (P).
 * Fillers: sea_buckthorn (C), buckwheat (D). Product starts at 0.
 * Topology: 4c/6v/16u, layer counts 4,4,4,4,0,0; all four nonempty MIXED;
 * two ordinary empties; 6 standard normal vessels; no specials.
 * Uses production solver/rules/canonicalization + explicit recipe context.
 */
import {
  CupConstraint,
  TeaId,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  listConstructiveActionsState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle, SolverAction } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import {
  DEV_ABSTRACT_BLEND_RECIPE,
  countTeaLayers,
  countTotalLayers,
} from '../../src/game/logic/blendRecipe.ts';

export const A: TeaId = 'matcha';
export const B: TeaId = 'karkade';
export const P: TeaId = 'saffron';
export const C: TeaId = 'sea_buckthorn';
export const D: TeaId = 'buckwheat';
export const RECIPE = DEV_ABSTRACT_BLEND_RECIPE;
export const LENGTHS = [4, 4, 4, 4, 0, 0];
export const MAX_VISITED = 120_000;
export const MAX_DEPTH = 60;

export interface BlendTrace {
  reactions: number;
  reactionsAtoB: number;
  reactionsBtoA: number;
  reactionDestinationCount: number;
  productTransfers: number;
  ordinaryPoursBetweenFirstLastReaction: number;
  firstReactionDepth: number | null;
  lastReactionDepth: number | null;
  firstProductTransferDepth: number | null;
  maxProductRun: number;
  finalA: number;
  finalB: number;
  finalProduct: number;
  finalTotalLayers: number;
  recipeSatisfied: boolean;
  win: boolean;
}

function cons(): CupConstraint[] {
  return Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
}

function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const c of [A, B, C, D]) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}

function isMixedFull(cup: TeaId[]): boolean {
  if (cup.length !== 4) return false;
  return new Set(cup).size >= 2;
}

export function shaped(s: number): { cups: TeaId[][]; attempts: number } {
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`blend-shaped-${s}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cups.push(p.slice(off, off + L)); off += L; }
    // All four nonempty must be mixed; P0 guaranteed (pool has no P).
    let ok = true;
    for (let i = 0; i < 4; i++) {
      if (!isMixedFull(cups[i] as TeaId[])) { ok = false; break; }
    }
    if (!ok) continue;
    // Exact counts check (fail-closed).
    const cnt = (t: TeaId) => cups.flat().filter((x) => x === t).length;
    if (cnt(A) !== 4 || cnt(B) !== 4 || cnt(C) !== 4 || cnt(D) !== 4) continue;
    if (cnt(P) !== 0) continue;
    return { cups, attempts: a + 1 };
  }
  throw new Error(`no shape ${s}`);
}

export function analyzeBlendTrace(
  startCups: TeaId[][],
  solution: readonly SolverAction[],
  constraints: readonly CupConstraint[],
): BlendTrace {
  let cups = startCups.map((c) => [...c]);
  const tr: BlendTrace = {
    reactions: 0,
    reactionsAtoB: 0,
    reactionsBtoA: 0,
    reactionDestinationCount: 0,
    productTransfers: 0,
    ordinaryPoursBetweenFirstLastReaction: 0,
    firstReactionDepth: null,
    lastReactionDepth: null,
    firstProductTransferDepth: null,
    maxProductRun: 0,
    finalA: 0,
    finalB: 0,
    finalProduct: 0,
    finalTotalLayers: 0,
    recipeSatisfied: false,
    win: false,
  };
  const dests = new Set<number>();
  const reactionIdx: number[] = [];
  let ordinaryBetween = 0;
  for (let i = 0; i < solution.length; i++) {
    const a = solution[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const from = (a as { from: number }).from;
    const to = (a as { to: number }).to;
    // Stoichiometry gate BEFORE move (invariants must hold at every state).
    const preA = countTeaLayers(cups, A);
    const preB = countTeaLayers(cups, B);
    const preP = countTeaLayers(cups, P);
    const preC = countTeaLayers(cups, C);
    const preD = countTeaLayers(cups, D);
    const preT = countTotalLayers(cups);
    if (preA + preP !== 4 || preB + preP !== 4 || preC !== 4 || preD !== 4 || preT !== 16 - preP) {
      throw new Error(
        `stoichiometry violation BEFORE move ${i}: A=${preA} B=${preB} P=${preP} C=${preC} D=${preD} total=${preT}`,
      );
    }
    const res = applyPourState(
      { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
      from, to, constraints, RECIPE,
    );
    if (!res) throw new Error(`replay failed at move ${i} (${from}→${to})`);
    cups = res.state.cups as TeaId[][];
    // Post-move invariants.
    const postA = countTeaLayers(cups, A);
    const postB = countTeaLayers(cups, B);
    const postP = countTeaLayers(cups, P);
    const postC = countTeaLayers(cups, C);
    const postD = countTeaLayers(cups, D);
    const postT = countTotalLayers(cups);
    if (res.reaction) {
      if (postA !== preA - (res.reaction.sourceReactant === A || res.reaction.targetReactant === A ? 1 : 0) - (res.reaction.sourceReactant === A ? 0 : 0)) {
        // Generic check below covers both directions; keep explicit deltas.
      }
      // Strict per-reaction delta: A-or-B source -1, opposite -1, P +1, total -1.
      // Since one side is A and other is B, both A and B drop by exactly 1
      // when either direction reacts (A+B→P consumes one of each).
      if (postA !== preA - 1 || postB !== preB - 1 || postP !== preP + 1 || postT !== preT - 1) {
        throw new Error(
          `reaction delta violation at move ${i}: A ${preA}→${postA}, B ${preB}→${postB}, P ${preP}→${postP}, total ${preT}→${postT}`,
        );
      }
      if (postC !== preC || postD !== preD) {
        throw new Error(`filler changed during reaction at move ${i}`);
      }
    } else {
      if (postA !== preA || postB !== preB || postP !== preP || postC !== preC || postD !== preD || postT !== preT) {
        throw new Error(`ordinary pour changed counts at move ${i}`);
      }
    }
    if (postA + postP !== 4 || postB + postP !== 4 || postC !== 4 || postD !== 4 || postT !== 16 - postP) {
      throw new Error(
        `stoichiometry violation AFTER move ${i}: A=${postA} B=${postB} P=${postP} C=${postC} D=${postD} total=${postT}`,
      );
    }
    if (res.reaction) {
      tr.reactions++;
      reactionIdx.push(i);
      dests.add(to);
      if (tr.firstReactionDepth === null) tr.firstReactionDepth = i;
      tr.lastReactionDepth = i;
      if (res.reaction.sourceReactant === A) tr.reactionsAtoB++;
      else tr.reactionsBtoA++;
    } else {
      // Ordinary P→P transfer detection (product becomes a movable resource).
      if (res.layer === P && res.transferred > 0) {
        tr.productTransfers++;
        if (tr.firstProductTransferDepth === null) tr.firstProductTransferDepth = i;
      }
    }
    // Track max product run anywhere.
    for (const cup of cups) {
      let run = 0;
      let best = 0;
      for (const layer of cup as TeaId[]) {
        if (layer === P) { run++; best = Math.max(best, run); }
        else run = 0;
      }
      tr.maxProductRun = Math.max(tr.maxProductRun, best);
    }
    void ordinaryBetween;
  }
  tr.reactionDestinationCount = dests.size;
  if (tr.firstReactionDepth !== null && tr.lastReactionDepth !== null && tr.lastReactionDepth > tr.firstReactionDepth) {
    let n = 0;
    for (let i = tr.firstReactionDepth + 1; i < tr.lastReactionDepth; i++) {
      const a = solution[i] as SolverAction;
      if (a.kind !== 'pour') continue;
      // Re-derive whether move i was a reaction by replaying? Cheaper:
      // reaction indices set tells us.
      if (!reactionIdx.includes(i)) n++;
    }
    tr.ordinaryPoursBetweenFirstLastReaction = n;
  }
  tr.finalA = countTeaLayers(cups, A);
  tr.finalB = countTeaLayers(cups, B);
  tr.finalProduct = countTeaLayers(cups, P);
  tr.finalTotalLayers = countTotalLayers(cups);
  tr.recipeSatisfied = tr.finalA === 0 && tr.finalB === 0 && tr.finalProduct === 4;
  tr.win = isPuzzleWonState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    constraints, RECIPE,
  );
  return tr;
}

function pct(a: number[], p: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function hist(a: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const v of a) h[String(v)] = (h[String(v)] ?? 0) + 1;
  return h;
}

const IS_BLEND_SEARCH_MAIN = ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('blend-search.ts'));
const N = IS_BLEND_SEARCH_MAIN ? Number(process.argv[2] ?? 1000) : 0;
const CONS = cons();
let solvable = 0, unsolv = 0, trunc = 0;
let l1 = 0, l2 = 0, l3a = 0, l3b = 0, l3 = 0;
const canonL2 = new Set<string>();
const canonL3 = new Set<string>();
const depths: number[] = [];
const l2depths: number[] = [];
const reactionCounts: number[] = [];
const firstReaction: number[] = [];
const lastReaction: number[] = [];
const firstDiv: number[] = [];
const ordinaryBetween: number[] = [];
const productTransfers: number[] = [];
const reactionDests: number[] = [];
const maxRuns: number[] = [];
const visited: number[] = [];
const ms: number[] = [];
const rootConstructive: number[] = [];
let atoB = 0, btoA = 0;
// control (recipe disabled on same board)
let pSolv = 0, pUns = 0, pTrunc = 0;
const deltas: number[] = [];
const chemDepths: number[] = [];
const plainDepths: number[] = [];
// strategic quality: batch-reaction rate
let batchFirst4 = 0;
let l2batchFirst4 = 0;

for (let s = 0; s < N; s++) {
  const { cups } = shaped(s);
  const t0 = Date.now();
  const r = solvePuzzle(cups, { cupConstraints: CONS, blendRecipe: RECIPE, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  ms.push(Date.now() - t0);
  visited.push(r.visitedStates);
  rootConstructive.push(listConstructiveActionsState({ cups, floatingIngredients: emptyFloatingIngredients(6) }, CONS, RECIPE).filter((a) => a.kind === 'pour').length);
  if (r.truncated) { trunc++; continue; }
  if (!r.solvable || r.minMoves === undefined || !r.solution) { unsolv++; continue; }
  solvable++;
  depths.push(r.minMoves);
  chemDepths.push(r.minMoves);
  const tr = analyzeBlendTrace(cups, r.solution, CONS);
  reactionCounts.push(tr.reactions);
  if (tr.firstReactionDepth !== null) {
    firstReaction.push(tr.firstReactionDepth);
    firstDiv.push(tr.firstReactionDepth / Math.max(1, r.minMoves));
  }
  if (tr.lastReactionDepth !== null) lastReaction.push(tr.lastReactionDepth);
  ordinaryBetween.push(tr.ordinaryPoursBetweenFirstLastReaction);
  productTransfers.push(tr.productTransfers);
  reactionDests.push(tr.reactionDestinationCount);
  maxRuns.push(tr.maxProductRun);
  atoB += tr.reactionsAtoB;
  btoA += tr.reactionsBtoA;
  // First-4-meaningful-moves batch check: are moves 0..3 all reactions?
  const first4 = (r.solution ?? []).slice(0, 4).filter((a) => a.kind === 'pour');
  if (first4.length === 4) {
    // Re-derive: count reactions among first 4 via replay prefix.
    let tmp = cups.map((c) => [...c]);
    let allReact = true;
    for (let i = 0; i < 4; i++) {
      const a = r.solution?.[i] as SolverAction | undefined;
      if (!a || a.kind !== 'pour') { allReact = false; break; }
      const res = applyPourState({ cups: tmp, floatingIngredients: emptyFloatingIngredients(tmp.length) }, a.from, a.to, CONS, RECIPE);
      if (!res || !res.reaction) { allReact = false; break; }
      tmp = res.state.cups as TeaId[][];
    }
    if (allReact) batchFirst4++;
  }
  const isL1 = tr.reactions === 4 && tr.recipeSatisfied && tr.win;
  if (isL1) l1++;
  const interleaved = tr.ordinaryPoursBetweenFirstLastReaction >= 1;
  const earlyEnough = tr.firstReactionDepth !== null && (tr.firstReactionDepth / Math.max(1, r.minMoves)) <= 0.75;
  const isL2 = isL1 && interleaved && earlyEnough;
  // control solve (same tea, recipe disabled).
  const rc = solvePuzzle(cups, { cupConstraints: CONS, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (!rc.truncated && rc.solvable && rc.minMoves !== undefined) {
    pSolv++;
    plainDepths.push(rc.minMoves);
    deltas.push((r.minMoves as number) - (rc.minMoves as number));
  } else if (rc.truncated) pTrunc++;
  else pUns++;
  if (!isL2) continue;
  l2++;
  l2depths.push(r.minMoves);
  if (allReactBatchCheck(r.solution ?? [], cups)) l2batchFirst4++;
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, CONS);
  canonL2.add(key);
  const isA = tr.productTransfers >= 1;
  // Final P×4 in one vessel?
  const finalCups = replayFinalCups(cups, r.solution ?? [], CONS);
  const hasP4 = finalCups.some((cup) => cup.length === 4 && cup.every((t) => t === P));
  const isB = tr.reactionDestinationCount >= 2 && hasP4;
  if (isA) l3a++;
  if (isB) l3b++;
  if (isA || isB) { l3++; canonL3.add(key); }
  if ((s + 1) % 200 === 0) console.log(`shaped ${s + 1}/${N} L2=${l2} L3=${l3} solv=${solvable}`);
}

function allReactBatchCheck(sol: readonly SolverAction[], start: TeaId[][]): boolean {
  if (sol.slice(0, 4).length < 4) return false;
  let tmp = start.map((c) => [...c]);
  for (let i = 0; i < 4; i++) {
    const a = sol[i] as SolverAction;
    if (!a || a.kind !== 'pour') return false;
    const res = applyPourState({ cups: tmp, floatingIngredients: emptyFloatingIngredients(tmp.length) }, a.from, a.to, CONS, RECIPE);
    if (!res || !res.reaction) return false;
    tmp = res.state.cups as TeaId[][];
  }
  return true;
}

function replayFinalCups(start: TeaId[][], sol: readonly SolverAction[], cons: readonly CupConstraint[]): TeaId[][] {
  let cups = start.map((c) => [...c]);
  for (const a of sol) {
    if (a.kind !== 'pour') continue;
    const res = applyPourState({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, a.from, a.to, cons, RECIPE);
    if (!res) break;
    cups = res.state.cups as TeaId[][];
  }
  return cups;
}

if (IS_BLEND_SEARCH_MAIN) {
console.log(`\n===== BLEND N=${N} =====`);
console.log(`shaped=${N} solv=${solvable} unsolv=${unsolv} trunc=${trunc} truncRate=${(100 * trunc / Math.max(1, N)).toFixed(2)}%`);
console.log(`L1=${l1} L2=${l2} L3A=${l3a} L3B=${l3b} L3=${l3} overlap=${l3a + l3b - l3} canonL2=${canonL2.size} canonL3=${canonL3.size}`);
console.log(`depths n=${depths.length} min=${depths.length ? Math.min(...depths) : 'n/a'} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 'n/a'} hist=${JSON.stringify(hist(depths))}`);
console.log(`L2depths hist=${JSON.stringify(hist(l2depths))}`);
console.log(`reactionCount hist=${JSON.stringify(hist(reactionCounts))}`);
console.log(`firstReaction p50=${pct(firstReaction, 50)} p95=${pct(firstReaction, 95)} lastReaction p50=${pct(lastReaction, 50)} p95=${pct(lastReaction, 95)}`);
console.log(`firstReaction/minMoves p50=${pct(firstDiv, 50)} p95=${pct(firstDiv, 95)}`);
console.log(`ordinaryBetween hist=${JSON.stringify(hist(ordinaryBetween))}`);
console.log(`productTransfers hist=${JSON.stringify(hist(productTransfers))}`);
console.log(`reactionDestinationCount hist=${JSON.stringify(hist(reactionDests))}`);
console.log(`A→B=${atoB} B→A=${btoA}`);
console.log(`maxProductRun hist=${JSON.stringify(hist(maxRuns))}`);
console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${visited.length ? Math.max(...visited) : 'n/a'}`);
console.log(`solver ms p50=${pct(ms, 50)} p95=${pct(ms, 95)} max=${ms.length ? Math.max(...ms) : 'n/a'}`);
console.log(`rootConstructive p50=${pct(rootConstructive, 50)} p95=${pct(rootConstructive, 95)} max=${rootConstructive.length ? Math.max(...rootConstructive) : 'n/a'}`);
console.log(`control: plainSolv=${pSolv} plainUnsolv=${pUns} plainTrunc=${pTrunc} chem-ordinary delta p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 'n/a'} min=${deltas.length ? Math.min(...deltas) : 'n/a'} hist=${JSON.stringify(hist(deltas))}`);
console.log(`batchFirst4(all)=${batchFirst4}/${solvable} l2batchFirst4=${l2batchFirst4}/${Math.max(1, l2)}`);
console.log(canonL2.size >= 30 ? 'FEASIBILITY GATE PASS (>=30 canon L2)' : 'FEASIBILITY GATE FAIL (<30 canon L2)');
const p95ms = pct(ms, 95) ?? 0;
const truncRate = trunc / Math.max(1, N);
const visP95 = pct(visited, 95) ?? 0;
if (p95ms > 500 || truncRate > 0.05 || visP95 >= 0.9 * 120_000) {
  console.log(`EARLY PERFORMANCE STOP (p95ms=${p95ms} truncRate=${truncRate} visP95=${visP95})`);
}
}
