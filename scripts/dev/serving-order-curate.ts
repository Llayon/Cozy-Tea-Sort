/**
 * G14 serving-order curation (DEV ONLY): robust 18-template production bank.
 *
 * Stage 1: sample shaped concrete deals (fixed palette), solve ordered,
 * keep L2 in-band. Stage 2: rank (pressure timing, serve gap, L3, sweet
 * depth, host/final-tea diversity), control-solve for L3, robustness-test
 * 6 role bijections each (G12/G13 tie-break lesson: validate final
 * instantiated layouts). Emits servingOrderTemplates.ts content.
 * Usage: bunx tsx scripts/dev/serving-order-curate.ts [samples] [want]
 */
import { CupConstraint, TeaId, emptyFloatingIngredients } from '../../src/game/types.ts';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import { servedPrefixLength } from '../../src/game/logic/servingOrder.ts';
import { analyzeServingTrace, consWithHosts, pressureCandidates, stripOrders } from './serving-order-search.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
const ACCEPT = { min: 10, max: 14 };
const SWEET = { min: 11, max: 13 };

// Six deterministic role bijections (order arrays over PALETTE roles).
const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 2, 3],
  [0, 1, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 3, 0, 2],
];

type Role = 'c0' | 'c1' | 'c2' | 'c3';

function toRoles(cups: TeaId[][]): Role[][] {
  return cups.map((cup) => cup.map((t) => {
    const i = PALETTE.indexOf(t);
    if (i < 0) throw new Error(`non-palette tea ${t}`);
    return `c${i}` as Role;
  }));
}

function fromRoles(roles: Role[][], order: TeaId[]): TeaId[][] {
  return roles.map((cup) => cup.map((r) => {
    const i = Number(r.slice(1));
    return order[i] as TeaId;
  }));
}

function isMixedFull(cup: TeaId[]): boolean {
  return cup.length === 4 && new Set(cup).size >= 2;
}

interface Cand {
  cups: TeaId[][];
  h1: number;
  h2: number;
  seed: number;
  depth: number;
  pressDiv: number;
  gap12: number;
  l3: boolean;
  final1: TeaId | null;
  final2: TeaId | null;
}

function finalTea(cups: TeaId[][], sol: readonly SolverAction[], cons: readonly CupConstraint[], host: number): TeaId | null {
  let board = cups.map((c) => [...c]);
  for (const a of sol) {
    if (a.kind !== 'pour') continue;
    const res = applyPourState({ cups: board, floatingIngredients: emptyFloatingIngredients(board.length) }, a.from, a.to, cons);
    if (!res) return null;
    board = res.state.cups as TeaId[][];
  }
  const cup = board[host] as TeaId[];
  return cup.length === 4 && cup.every((t) => t === cup[0]) ? (cup[0] as TeaId) : null;
}

const SAMPLES = Number(process.argv[2] ?? 3000);
const WANT = Number(process.argv[3] ?? 18);
const pool: Cand[] = [];

for (let s = 0; s < SAMPLES && pool.length < 300; s++) {
  let done = false;
  for (let a = 0; a < 60 && !done; a++) {
    const rng = createRng(`serve-prod-${s}-try-${a}`);
    const p: TeaId[] = [];
    for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [p.slice(0, 4), p.slice(4, 8), p.slice(8, 12), p.slice(12, 16), [], []];
    shuffleInPlace(rng, cups);
    if (!cups.filter((c) => c.length === 4).every(isMixedFull)) continue;
    const h1 = Math.floor(rng() * 4);
    let h2 = Math.floor(rng() * 3);
    if (h2 >= h1) h2++;
    // Hosts must be full cups (indices may have shuffled; find full ones).
    const fullIdx = cups.map((c, i) => (c.length === 4 ? i : -1)).filter((i) => i >= 0);
    const H1 = fullIdx[h1 % fullIdx.length] as number;
    const rest = fullIdx.filter((i) => i !== H1);
    const H2 = rest[h2 % rest.length] as number;
    const C = consWithHosts(H1, H2);
    const r = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (r.truncated || !r.solvable || r.minMoves === undefined || !r.solution) continue;
    if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) continue;
    const tr = analyzeServingTrace(cups, H1, H2, r.solution, C);
    const l1 = tr.serve1Depth !== null && tr.serve2Depth !== null && tr.win;
    const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
    const l2 = l1 && tr.firstPressureDepth !== null && tr.serve1Depth !== null && tr.serve2Depth !== null &&
      tr.firstPressureDepth < tr.serve1Depth && tr.serve1Depth < tr.serve2Depth && early;
    if (!l2) continue;
    const pressDiv = (tr.firstPressureDepth as number) / Math.max(1, r.minMoves);
    const gap12 = (tr.serve1ToServe2Gap as number) ?? 0;
    // Control for L3 (offline only).
    const rc = solvePuzzle(cups, { cupConstraints: stripOrders(C), maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    let l3 = false;
    if (!rc.truncated && rc.solvable && rc.minMoves !== undefined && rc.solution) {
      let b = cups.map((c) => [...c]);
      let f1: number | null = null;
      let f2: number | null = null;
      const full = (cup: TeaId[]) => cup.length === 4 && cup.every((t) => t === cup[0]);
      rc.solution.forEach((st, i) => {
        if (st.kind !== 'pour') return;
        const res = applyPourState({ cups: b, floatingIngredients: emptyFloatingIngredients(b.length) }, st.from, st.to, stripOrders(C));
        if (!res) return;
        b = res.state.cups as TeaId[][];
        if (f1 === null && full(b[H1] as TeaId[])) f1 = i;
        if (f2 === null && full(b[H2] as TeaId[])) f2 = i;
      });
      const rev = f2 !== null && (f1 === null || (f2 as number) < (f1 as number));
      l3 = rev || (r.minMoves as number) > (rc.minMoves as number);
    }
    pool.push({
      cups, h1: H1, h2: H2, seed: s * 1000 + a, depth: r.minMoves, pressDiv, gap12, l3,
      final1: finalTea(cups, r.solution, C, H1), final2: finalTea(cups, r.solution, C, H2),
    });
    done = true;
  }
  if ((s + 1) % 500 === 0) console.log(`scan ${s + 1}/${SAMPLES} pool=${pool.length}`);
}

console.log(`pool=${pool.length}`);
// Rank: sweet depth > pressure≤0.65 > gap≥2 > L3 > host/pair spread handled at pick time.
pool.sort((x, y) => {
  const sx = x.depth >= SWEET.min && x.depth <= SWEET.max ? 0 : 1;
  const sy = y.depth >= SWEET.min && y.depth <= SWEET.max ? 0 : 1;
  if (sx !== sy) return sx - sy;
  const px = x.pressDiv <= 0.65 ? 0 : 1;
  const py = y.pressDiv <= 0.65 ? 0 : 1;
  if (px !== py) return px - py;
  const gx = x.gap12 >= 2 ? 0 : 1;
  const gy = y.gap12 >= 2 ? 0 : 1;
  if (gx !== gy) return gx - gy;
  if ((y.l3 ? 1 : 0) !== (x.l3 ? 1 : 0)) return (y.l3 ? 1 : 0) - (x.l3 ? 1 : 0);
  return x.depth - y.depth;
});

const chosen: Cand[] = [];
const seenKeys = new Set<string>();
const pairUse: Record<string, number> = {};
for (const cand of pool) {
  if (chosen.length >= WANT) break;
  const roles = toRoles(cand.cups);
  // Robustness: 6 role bijections must all stay L2 in-band.
  let ok = 0;
  for (const perm of PERMS) {
    const order = perm.map((i) => PALETTE[i] as TeaId);
    const cups = fromRoles(roles, order);
    const C: CupConstraint[] = Array.from({ length: 6 }, (_, i) => (
      i === cand.h1 ? { mode: 'normal', serveOrder: 1 }
      : i === cand.h2 ? { mode: 'normal', serveOrder: 2 }
      : { mode: 'normal' as const }
    )) as CupConstraint[];
    if (!cups.filter((c) => c.length === 4).every(isMixedFull)) continue;
    const r = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (r.truncated || !r.solvable || r.minMoves === undefined || !r.solution) continue;
    if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) continue;
    const tr = analyzeServingTrace(cups, cand.h1, cand.h2, r.solution, C);
    const l1 = tr.serve1Depth !== null && tr.serve2Depth !== null && tr.win;
    const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
    if (!(l1 && tr.firstPressureDepth !== null && tr.serve1Depth !== null && tr.serve2Depth !== null &&
      tr.firstPressureDepth < tr.serve1Depth && tr.serve1Depth < tr.serve2Depth && early)) continue;
    ok++;
  }
  if (ok < 6) continue;
  const key = canonicalPuzzleKey({ cups: cand.cups, floatingIngredients: emptyFloatingIngredients(6) }, consWithHosts(cand.h1, cand.h2));
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);
  const pk = `${cand.h1}>${cand.h2}`;
  pairUse[pk] = (pairUse[pk] ?? 0) + 1;
  if (pairUse[pk] as number > 3) continue; // host diversity: max 3 per pair
  chosen.push(cand);
  console.log(`picked ${chosen.length}/18 seed=${cand.seed} depth=${cand.depth} pressDiv=${cand.pressDiv.toFixed(2)} gap=${cand.gap12} l3=${cand.l3} hosts=${pk} final=${cand.final1}/${cand.final2}`);
}

console.log(`\nchosen=${chosen.length} pairs=${JSON.stringify(pairUse)}`);
const l3n = chosen.filter((c) => c.l3).length;
const earlyN = chosen.filter((c) => c.pressDiv <= 0.65).length;
const gapN = chosen.filter((c) => c.gap12 >= 2).length;
console.log(`bank quality: L3 ${l3n}/18, pressure≤0.65 ${earlyN}/18, gap≥2 ${gapN}/18`);
console.log('\n===== TEMPLATE FILE =====\n');
console.log(`/**
 * Serving-order template bank (Gauntlet 14 — «Порядок подачи»).
 *
 * Curated ROBUST L2 production bank (6 standard normal vessels,
 * 4,4,4,4,0,0; all full mixed; exactly one O1 + one O2). Feasibility:
 * 5000 shaped → 5000 solvable, 1260 L2 (25.2%, canon 1260), depths 6–15
 * p50 12, visited p95 2249, ms p95 132, delta chem-plain n/a (control
 * delta p50 0/p95 1), reverses 43%, batchFirst4 n/a.
 * Production curation: ${SAMPLES} samples → ${pool.length} L2 pool →
 * 18 robust (6/6 role-perm L2 in 10–14).
 *
 * Roles c0..c3 permuted among eligible legacy teas (never reaction IDs).
 * Serve indices ride with their cups. Runtime re-validates via finalize.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 */

import type { TeaId } from '../types';

/** Palette-relative role inside template cup patterns (all permutable). */
export type ServingOrderTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type ServingOrderTemplateKind = 'serving-order';

export interface ServingOrderTemplate {
  id: string;
  kind: ServingOrderTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (\`[]\` = empty vessel; layer counts are 4,4,4,4,0,0 in some order). */
  cups: ServingOrderTeaRole[][];
  /** Initial serving-saucer hosts (O1 / O2). */
  serve1Index: number;
  serve2Index: number;
}

export interface ServingOrderTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const SERVING_ORDER_TEMPLATE_SPECS: Record<ServingOrderTemplateKind, ServingOrderTemplateSpec> = {
  'serving-order': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands from robust L2 data. Sweet 11–13, accept 10–14. */
export const SERVING_ORDER_DEPTH_SWEET: { min: number; max: number } = { min: 11, max: 13 };
export const SERVING_ORDER_DEPTH_ACCEPT: { min: number; max: number } = { min: 10, max: 14 };

/** Bounded runtime template attempts (never a 150-scan for serving-order). */
export const SERVING_ORDER_TEMPLATE_ATTEMPTS = 4;

export const SERVING_ORDER_TEMPLATE_BANK: Record<ServingOrderTemplateKind, ServingOrderTemplate[]> = {
  'serving-order': [`);
for (const c of chosen) {
  const roles = toRoles(c.cups);
  console.log(`    { id: 'serving-${String(c.depth).padStart(2, '0')}-${c.seed}', kind: 'serving-order', depth: ${c.depth}, cups: ${JSON.stringify(roles)}, serve1Index: ${c.h1}, serve2Index: ${c.h2} },`);
}
console.log(`  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_SERVING_ORDER_TEMPLATES: ServingOrderTemplate[] = [
  ...SERVING_ORDER_TEMPLATE_BANK['serving-order'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * Any bijection among eligible legacy teas preserves counts and the
 * mixed-full structure; depth holds modulo solver tie-breaking among
 * filler permutations (robustness-tested 6/6 during curation; runtime
 * re-validates). Serve indices ride with their cups.
 */
export function instantiateServingOrderTemplate(
  tpl: ServingOrderTemplate,
  order: TeaId[],
): { cups: TeaId[][]; serve1Index: number; serve2Index: number } {
  const roleToTea = new Map<ServingOrderTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, serve1Index: tpl.serve1Index, serve2Index: tpl.serve2Index };
}
`);
