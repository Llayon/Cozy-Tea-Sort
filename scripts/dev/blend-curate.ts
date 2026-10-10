/**
 * G13 blend curation (DEV ONLY): production-ID bank (black_tea/milk/milk_tea).
 * Samples shaped 4,4,4,4,0,0 deals (a×4,b×4,c0×4,c1×4,P0, all mixed),
 * solves with MILK_TEA_BLEND_RECIPE, filters L2 in band, robustness-tests
 * >=6 filler permutations, commits best 18.
 * Usage: bunx tsx scripts/dev/blend-curate.ts [samples] [want]
 */
import { CupConstraint, TeaId, emptyFloatingIngredients } from '../../src/game/types.ts';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../../src/game/logic/rules.ts';
import { solvePuzzle, SolverAction } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import { MILK_TEA_BLEND_RECIPE, countTeaLayers, countTotalLayers } from '../../src/game/logic/blendRecipe.ts';

const A: TeaId = 'black_tea';
const B: TeaId = 'milk';
const P: TeaId = 'milk_tea';
const R = MILK_TEA_BLEND_RECIPE;
// Eligible legacy fillers (exclude recipe IDs + milk_oolong to avoid milk confusion).
const ELIGIBLE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'lavender', 'saffron', 'buckwheat'];
const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
const ACCEPT = { min: 10, max: 16 };
const SWEET = { min: 12, max: 14 };

function cons(): CupConstraint[] {
  return Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
}

function isMixedFull(cup: TeaId[]): boolean {
  return cup.length === 4 && new Set(cup).size >= 2;
}

export interface ProdTrace {
  reactions: number; interleaved: boolean; early: boolean; l2: boolean;
  productTransfers: number; destCount: number; hasP4: boolean; l3a: boolean; l3b: boolean;
  firstDepth: number | null; lastDepth: number | null; between: number;
  win: boolean; depth: number;
}

export function analyzeProd(cups: TeaId[][], sol: readonly SolverAction[], constraints: readonly CupConstraint[]): ProdTrace {
  let board = cups.map((c) => [...c]);
  let reactions = 0;
  const dests = new Set<number>();
  let first: number | null = null;
  let last: number | null = null;
  const rIdx: number[] = [];
  let pTrans = 0;
  for (let i = 0; i < sol.length; i++) {
    const a = sol[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) }, a.from, a.to, constraints, R);
    if (!res) throw new Error(`replay fail ${i}`);
    board = res.state.cups as TeaId[][];
    if (res.reaction) { reactions++; rIdx.push(i); dests.add(a.to); if (first === null) first = i; last = i; }
    else if (res.layer === P && res.transferred > 0) pTrans++;
  }
  let between = 0;
  if (first !== null && last !== null) {
    for (let i = first + 1; i < last; i++) if (!rIdx.includes(i)) between++;
  }
  const finalP4 = board.some((c) => c.length === 4 && c.every((t) => t === P));
  const win = isPuzzleWonState({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) }, constraints, R);
  const recipeOk = countTeaLayers(board, A) === 0 && countTeaLayers(board, B) === 0 && countTeaLayers(board, P) === 4;
  const depth = sol.filter((a) => a.kind === 'pour').length;
  const l1 = reactions === 4 && recipeOk && win;
  const interleaved = between >= 1;
  const early = first !== null && first / Math.max(1, depth) <= 0.75;
  const l2 = l1 && interleaved && early;
  const l3a = l2 && pTrans >= 1;
  const l3b = l2 && dests.size >= 2 && finalP4;
  return { reactions, interleaved, early, l2, productTransfers: pTrans, destCount: dests.size, hasP4: finalP4, l3a, l3b, firstDepth: first, lastDepth: last, between, win, depth };
}

const SAMPLES = Number(process.argv[2] ?? 3000);
const WANT = Number(process.argv[3] ?? 18);
const C = cons();
const pool: { cups: TeaId[][]; c0: TeaId; c1: TeaId; seed: number; depth: number; sol: SolverAction[]; between: number; dests: number; pTrans: number }[] = [];

for (let s = 0; s < SAMPLES && pool.length < 400; s++) {
  // Deterministic filler pair rotation for diversity.
  const c0 = ELIGIBLE[s % ELIGIBLE.length] as TeaId;
  let c1 = ELIGIBLE[(s * 3 + 1) % ELIGIBLE.length] as TeaId;
  if (c1 === c0) c1 = ELIGIBLE[(s * 3 + 2) % ELIGIBLE.length] as TeaId;
  for (let a = 0; a < 60; a++) {
    const rng = createRng(`blend-prod-${s}-try-${a}`);
    const p: TeaId[] = [];
    for (const c of [A, B, c0, c1]) for (let k = 0; k < 4; k++) p.push(c);
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [p.slice(0, 4), p.slice(4, 8), p.slice(8, 12), p.slice(12, 16), [], []];
    // Shuffle vessel order deterministically for topology diversity.
    shuffleInPlace(rng, cups);
    if (!cups.filter((c) => c.length === 4).every(isMixedFull)) continue;
    if (countTeaLayers(cups, P) !== 0) continue;
    const r = solvePuzzle(cups, { cupConstraints: C, blendRecipe: R, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (r.truncated || !r.solvable || r.minMoves === undefined || !r.solution) continue;
    if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) continue;
    const tr = analyzeProd(cups, r.solution, C);
    if (!tr.l2) continue;
    // Prefer integrated: >=2 ordinary between, dests>=2, sweet depth.
    pool.push({ cups, c0, c1, seed: s * 1000 + a, depth: r.minMoves, sol: r.solution as SolverAction[], between: tr.between, dests: tr.destCount, pTrans: tr.productTransfers });
    break;
  }
  if ((s + 1) % 500 === 0) console.log(`scan ${s + 1}/${SAMPLES} pool=${pool.length}`);
}

console.log(`pool=${pool.length}`);
// Rank: sweet depth > integrated timing (>=2 between) > dest diversity > L3 > moderate visited (approx by depth).
pool.sort((x, y) => {
  const sx = x.depth >= SWEET.min && x.depth <= SWEET.max ? 0 : 1;
  const sy = y.depth >= SWEET.min && y.depth <= SWEET.max ? 0 : 1;
  if (sx !== sy) return sx - sy;
  const bx = x.between >= 2 ? 0 : 1;
  const by = y.between >= 2 ? 0 : 1;
  if (bx !== by) return bx - by;
  if (y.dests !== x.dests) return y.dests - x.dests;
  if (y.pTrans !== x.pTrans) return y.pTrans - x.pTrans;
  return x.depth - y.depth;
});

// Robustness: each candidate must stay L2 in-band under >=6 filler permutations
// (c0/c1 remaps among ELIGIBLE, structure-preserving: same role pattern).
function toRoles(cups: TeaId[][], c0: TeaId, c1: TeaId): string[][] {
  return cups.map((cup) => cup.map((t) => {
    if (t === A) return 'a';
    if (t === B) return 'b';
    if (t === c0) return 'c0';
    if (t === c1) return 'c1';
    return `?${t}`;
  }));
}
function fromRoles(roles: string[][], c0: TeaId, c1: TeaId): TeaId[][] {
  return roles.map((cup) => cup.map((r) => {
    if (r === 'a') return A;
    if (r === 'b') return B;
    if (r === 'c0') return c0;
    if (r === 'c1') return c1;
    throw new Error(`bad role ${r}`);
  }));
}

const PERMS: Array<[TeaId, TeaId]> = [
  ['matcha', 'sea_buckthorn'], ['matcha', 'karkade'], ['sea_buckthorn', 'buckwheat'],
  ['lavender', 'saffron'], ['karkade', 'buckwheat'], ['matcha', 'lavender'],
];
const chosen: typeof pool = [];
const seenKeys = new Set<string>();
for (const cand of pool) {
  if (chosen.length >= WANT) break;
  const roles = toRoles(cand.cups, cand.c0, cand.c1);
  if (roles.flat().some((r) => r.startsWith('?'))) continue;
  let okCount = 0;
  let depths: number[] = [];
  for (const [pc0, pc1] of PERMS) {
    const cups = fromRoles(roles, pc0, pc1);
    // All full must stay mixed after remap? Structure preserved (mixed pattern
    // is role-based, so yes). Verify quickly.
    if (!cups.filter((c) => c.length === 4).every(isMixedFull)) continue;
    const r = solvePuzzle(cups, { cupConstraints: C, blendRecipe: R, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (r.truncated || !r.solvable || r.minMoves === undefined || !r.solution) continue;
    if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) continue;
    const tr = analyzeProd(cups, r.solution, C);
    if (!tr.l2) continue;
    okCount++;
    depths.push(r.minMoves);
  }
  if (okCount < 6) continue;
  const key = canonicalPuzzleKey({ cups: cand.cups, floatingIngredients: emptyFloatingIngredients(6) }, C);
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);
  (cand as { robustDepths?: number[] }).robustDepths = depths;
  chosen.push(cand);
  console.log(`picked ${chosen.length}/18 seed=${cand.seed} depth=${cand.depth} between=${cand.between} dests=${cand.dests} perms=6/6`);
}

console.log(`\nchosen=${chosen.length}`);
// Emit template file content.
const out = `/**
 * Milk-tea blend template bank (Gauntlet 13 — «Молочный купаж»).
 *
 * Curated ROBUST L2 production bank (6 standard normal vessels,
 * 4,4,4,4,0,0; a=black_tea×4, b=milk×4, c0/c1=legacy fillers×4, P0;
 * all full mixed). Feasibility: 5000 abstract shaped → 5000 L2
 * (canon 4998), depths 10–17 p50 13, visited p95 8k, ms p95 441,
 * delta chem-ordinary p50 +2, batchFirst4 0/5000 (integrated, not terminal).
 * Production curation: ${SAMPLES} prod samples → ${pool.length} L2 pool →
 * 18 robust (6/6 filler perms L2 in 10–16).
 *
 * Roles a/b fixed (recipe identities); c0/c1 seeded-permuted among eligible
 * legacy teas (never black_tea/milk/milk_tea; milk_oolong excluded to avoid
 * milk confusion). Product never initial. Runtime re-validates via finalize.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (a/b fixed, c0/c1 permutable). */
export type BlendTeaRole = 'a' | 'b' | 'c0' | 'c1';

export type BlendTemplateKind = 'milk-tea-blend';

export interface BlendTemplate {
  id: string;
  kind: BlendTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (\`[]\` = empty vessel; layer counts are 4,4,4,4,0,0 in some order). */
  cups: BlendTeaRole[][];
}

export interface BlendTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const BLEND_TEMPLATE_SPECS: Record<BlendTemplateKind, BlendTemplateSpec> = {
  'milk-tea-blend': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from L2 data (abstract 10–17 p50 13; prod accept 10–16). Sweet 12–14, accept 10–16. */
export const BLEND_DEPTH_SWEET: { min: number; max: number } = { min: 12, max: 14 };
export const BLEND_DEPTH_ACCEPT: { min: number; max: number } = { min: 10, max: 16 };

/** Bounded runtime template attempts (never a 150-scan for blend). */
export const BLEND_TEMPLATE_ATTEMPTS = 4;

export const BLEND_TEMPLATE_BANK: Record<BlendTemplateKind, BlendTemplate[]> = {
  'milk-tea-blend': [
${chosen.map((c, i) => {
  const roles = toRoles(c.cups, c.c0, c.c1);
  return `    { id: 'blend-${String(c.depth).padStart(2, '0')}-${c.seed}', kind: 'milk-tea-blend', depth: ${c.depth}, cups: ${JSON.stringify(roles)} },`;
}).join('\n')}
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_BLEND_TEMPLATES: BlendTemplate[] = [
  ...BLEND_TEMPLATE_BANK['milk-tea-blend'],
];

/**
 * Instantiate a template: a→black_tea, b→milk fixed; c0/c1→concrete fillers.
 * Any (c0,c1) bijection among eligible legacy teas preserves counts and the
 * mixed-full structure; depth holds modulo solver tie-breaking among filler
 * permutations (robustness-tested 6/6 during curation; runtime re-validates).
 */
export function instantiateBlendTemplate(
  tpl: BlendTemplate,
  c0: TeaId,
  c1: TeaId,
): { cups: TeaId[][] } {
  const map = new Map<BlendTeaRole, TeaId>([
    ['a', 'black_tea'],
    ['b', 'milk'],
    ['c0', c0],
    ['c1', c1],
  ]);
  return { cups: tpl.cups.map((cup) => cup.map((role) => map.get(role) as TeaId)) };
}
`;
console.log('\n===== TEMPLATE FILE =====\n');
console.log(out);
