/**
 * G15 Order+Tasting curation (DEV ONLY): robust 12-template production bank.
 * Topology: 4c/6v 4,4,4,4,0,0, O1+O2 on two full mixed (indices 0-3),
 * tasting bowl (cap2/mustEndEmpty) on index 5 empty + ordinary empty index 4.
 * Requires C2 (L2 + tasting used) + prefers C3, pressure≤0.65, gap≥2.
 * Robustness: 6 role bijections must all stay C2 in-band.
 */
import { CupConstraint, TeaId, emptyFloatingIngredients } from '../../src/game/types.ts';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import { servedPrefixLength } from '../../src/game/logic/servingOrder.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
const ACCEPT = { min: 10, max: 14 };
const SWEET = { min: 11, max: 13 };
const TASTING_IDX = 5;
const PERMS: number[][] = [[0,1,2,3],[1,0,2,3],[0,1,3,2],[2,3,0,1],[3,2,1,0],[1,3,0,2]];
type Role = 'c0'|'c1'|'c2'|'c3';
function toRoles(cups: TeaId[][]): Role[][] {
  return cups.map((cup) => cup.map((t) => `c${PALETTE.indexOf(t)}` as Role));
}
function fromRoles(roles: Role[][], order: TeaId[]): TeaId[][] {
  return roles.map((cup) => cup.map((r) => order[Number(r.slice(1))] as TeaId));
}
function isMixedFull(cup: TeaId[]): boolean { return cup.length === 4 && new Set(cup).size >= 2; }
function consWith(h1: number, h2: number): CupConstraint[] {
  const c = Array.from({ length: 6 }, (_, i) => (
    i === h1 ? { mode: 'normal', serveOrder: 1 }
    : i === h2 ? { mode: 'normal', serveOrder: 2 }
    : { mode: 'normal' as const }
  )) as CupConstraint[];
  c[TASTING_IDX] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
  return c;
}
function baseState(cups: TeaId[][]) {
  return { cups, floatingIngredients: emptyFloatingIngredients(cups.length) };
}
interface Cand { cups: TeaId[][]; h1: number; h2: number; seed: number; depth: number; pressDiv: number; gap12: number; c3: boolean; final1: TeaId | null; final2: TeaId | null; }

import { canPourState, pourCountState, pourRejectCodeState } from '../../src/game/logic/rules.ts';
import { cloneCupConstraint } from '../../src/game/types.ts';
function stripOrders(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => { const n = cloneCupConstraint(c); delete (n as { serveOrder?: number }).serveOrder; return n; });
}
function pressureCands(cups: TeaId[][], h2: number, cons: readonly CupConstraint[]): number {
  const st = baseState(cups.map((c) => [...c]));
  if (servedPrefixLength(st, cons) !== 0) return 0;
  const dest = cups[h2] as TeaId[];
  if (dest.length === 4) return 0;
  const ctrl = stripOrders(cons);
  let n = 0;
  for (let s = 0; s < cups.length; s++) {
    if (s === h2) continue;
    const cs = baseState(cups.map((c) => [...c]));
    if (!canPourState(cs, s, h2, ctrl)) continue;
    const m = pourCountState(cs, s, h2, ctrl);
    if (m <= 0) continue;
    const src = cups[s] as TeaId[];
    const top = src[src.length - 1] as TeaId;
    const cand = [...dest];
    for (let i = 0; i < m; i++) cand.push(top);
    if (cand.length !== 4 || !cand.every((l) => l === top)) continue;
    if (pourRejectCodeState(st, s, h2, cons) === 'serve-order') n++;
  }
  return n;
}
function analyze(cups0: TeaId[][], h2: number, sol: readonly SolverAction[], cons: readonly CupConstraint[]) {
  let cups = cups0.map((c) => [...c]);
  const tr = { firstPressureDepth: null as number | null, serve1Depth: null as number | null, serve2Depth: null as number | null, win: false, prefix: 0 };
  for (let d = 0; d <= sol.length; d++) {
    if (d > 0) {
      const a = sol[d - 1] as SolverAction;
      if (a.kind !== 'pour') continue;
      const res = applyPourState(baseState(cups), a.from, a.to, cons);
      if (!res) return tr;
      cups = res.state.cups as TeaId[][];
      if (res.serveCompleted === 1 && tr.serve1Depth === null) tr.serve1Depth = d - 1;
      if (res.serveCompleted === 2 && tr.serve2Depth === null) tr.serve2Depth = d - 1;
    }
    if (pressureCands(cups, h2, cons) > 0 && tr.firstPressureDepth === null) tr.firstPressureDepth = d;
  }
  tr.prefix = servedPrefixLength(baseState(cups), cons);
  tr.win = isPuzzleWonState(baseState(cups), cons);
  return tr;
}
function finalTea(cups: TeaId[][], sol: readonly SolverAction[], cons: readonly CupConstraint[], host: number): TeaId | null {
  let b = cups.map((c) => [...c]);
  for (const a of sol) {
    if (a.kind !== 'pour') continue;
    const res = applyPourState(baseState(b), a.from, a.to, cons);
    if (!res) return null;
    b = res.state.cups as TeaId[][];
  }
  const cup = b[host] as TeaId[];
  return cup.length === 4 && cup.every((t) => t === cup[0]) ? (cup[0] as TeaId) : null;
}
const SAMPLES = Number(process.argv[2] ?? 3000);
const WANT = Number(process.argv[3] ?? 12);
const pool: Cand[] = [];
for (let s = 0; s < SAMPLES && pool.length < 200; s++) {
  let done = false;
  for (let a = 0; a < 60 && !done; a++) {
    const rng = createRng(`g15-taste-prod-${s}-try-${a}`);
    const p: TeaId[] = [];
    for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [p.slice(0,4), p.slice(4,8), p.slice(8,12), p.slice(12,16), [], []];
    // shuffle only first four (full) + keep empties at 4,5 (4 ordinary, 5 tasting)
    const full = cups.slice(0, 4);
    shuffleInPlace(rng, full);
    const board = [...full, [], []];
    if (!board.filter((c) => c.length === 4).every(isMixedFull)) continue;
    const h1 = Math.floor(rng() * 4);
    let h2 = Math.floor(rng() * 3);
    if (h2 >= h1) h2++;
    const C = consWith(h1, h2);
    const r = solvePuzzle(board, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (r.truncated || !r.solvable || r.minMoves === undefined || !r.solution) continue;
    if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) continue;
    const tr = analyze(board, h2, r.solution, C);
    const l1 = tr.serve1Depth !== null && tr.serve2Depth !== null && tr.win && tr.prefix === 2;
    const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
    const l2 = l1 && tr.firstPressureDepth !== null && tr.serve1Depth !== null && tr.serve2Depth !== null &&
      tr.firstPressureDepth < tr.serve1Depth && tr.serve1Depth < tr.serve2Depth && early;
    if (!l2) continue;
    const tastingUsed = (r.solution as SolverAction[]).some((x) => x.kind === 'pour' && (x.from === TASTING_IDX || x.to === TASTING_IDX));
    if (!tastingUsed) continue;
    const pressDiv = (tr.firstPressureDepth as number) / Math.max(1, r.minMoves);
    const gap12 = (tr.serve2Depth as number) - (tr.serve1Depth as number);
    // C3: diverges from both controls
    const ro = solvePuzzle(board, { cupConstraints: consWith(h1, h2).map((c, i) => i === TASTING_IDX ? ({ mode: 'normal' } as CupConstraint) : c), maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    // ORDER ONLY = orders, tasting replaced with ordinary empty
    const oc = Array.from({ length: 6 }, (_, i) => (i === h1 ? { mode: 'normal', serveOrder: 1 } : i === h2 ? { mode: 'normal', serveOrder: 2 } : { mode: 'normal' as const })) as CupConstraint[];
    const rOrder = solvePuzzle(board, { cupConstraints: oc, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    const bc = plainCons();
    const rb = solvePuzzle(board, { cupConstraints: (() => { const b = plainCons(); b[TASTING_IDX] = { mode: 'normal', capacity: 2, mustEndEmpty: true }; return b; })(), maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    void ro;
    const f0 = (r.solution as SolverAction[])[0];
    const firstFull = f0 ? `${f0.kind}:${(f0 as { from?: number }).from}→${(f0 as { to?: number }).to}` : null;
    let c3 = false;
    if (!rOrder.truncated && rOrder.solvable && rOrder.minMoves !== undefined && rOrder.solution && !rb.truncated && rb.solvable && rb.minMoves !== undefined && rb.solution) {
      const g0 = (rOrder.solution as SolverAction[])[0];
      const b0 = (rb.solution as SolverAction[])[0];
      const firstO = g0 ? `${g0.kind}:${(g0 as { from?: number }).from}→${(g0 as { to?: number }).to}` : null;
      const firstB = b0 ? `${b0.kind}:${(b0 as { from?: number }).from}→${(b0 as { to?: number }).to}` : null;
      c3 = (r.minMoves !== rOrder.minMoves || firstFull !== firstO) && (r.minMoves !== rb.minMoves || firstFull !== firstB);
    }
    pool.push({ cups: board, h1, h2, seed: s * 1000 + a, depth: r.minMoves, pressDiv, gap12, c3, final1: finalTea(board, r.solution, C, h1), final2: finalTea(board, r.solution, C, h2) });
    done = true;
  }
  if ((s + 1) % 500 === 0) console.log(`scan ${s + 1}/${SAMPLES} pool=${pool.length}`);
}
function plainCons(): CupConstraint[] { return Array.from({ length: 6 }, () => ({ mode: 'normal' as const })); }
console.log(`pool=${pool.length}`);
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
  if ((y.c3 ? 1 : 0) !== (x.c3 ? 1 : 0)) return (y.c3 ? 1 : 0) - (x.c3 ? 1 : 0);
  return x.depth - y.depth;
});
const chosen: Cand[] = [];
const seen = new Set<string>();
const pairUse: Record<string, number> = {};
for (const cand of pool) {
  if (chosen.length >= WANT) break;
  const roles = toRoles(cand.cups);
  let ok = 0;
  for (const perm of PERMS) {
    const order = perm.map((i) => PALETTE[i] as TeaId);
    const cups = fromRoles(roles, order);
    if (!cups.filter((c) => c.length === 4).every(isMixedFull)) continue;
    const C = consWith(cand.h1, cand.h2);
    const r = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    if (r.truncated || !r.solvable || r.minMoves === undefined || !r.solution) continue;
    if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) continue;
    const tr = analyze(cups, cand.h2, r.solution, C);
    const l1 = tr.serve1Depth !== null && tr.serve2Depth !== null && tr.win && tr.prefix === 2;
    const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
    if (!(l1 && tr.firstPressureDepth !== null && tr.serve1Depth !== null && tr.serve2Depth !== null && tr.firstPressureDepth < tr.serve1Depth && tr.serve1Depth < tr.serve2Depth && early)) continue;
    const used = (r.solution as SolverAction[]).some((x) => x.kind === 'pour' && (x.from === TASTING_IDX || x.to === TASTING_IDX));
    if (!used) continue;
    ok++;
  }
  if (ok < 6) continue;
  const key = canonicalPuzzleKey({ cups: cand.cups, floatingIngredients: emptyFloatingIngredients(6) }, consWith(cand.h1, cand.h2));
  if (seen.has(key)) continue;
  seen.add(key);
  const pk = `${cand.h1}>${cand.h2}`;
  pairUse[pk] = (pairUse[pk] ?? 0) + 1;
  if ((pairUse[pk] as number) > 3) continue;
  chosen.push(cand);
  console.log(`picked ${chosen.length}/${WANT} seed=${cand.seed} depth=${cand.depth} pressDiv=${cand.pressDiv.toFixed(2)} gap=${cand.gap12} c3=${cand.c3} hosts=${pk} final=${cand.final1}/${cand.final2}`);
}
console.log(`\nchosen=${chosen.length} pairs=${JSON.stringify(pairUse)}`);
console.log(`bank quality: C3 ${chosen.filter((c) => c.c3).length}/${WANT}, pressure≤0.65 ${chosen.filter((c) => c.pressDiv <= 0.65).length}/${WANT}, gap≥2 ${chosen.filter((c) => c.gap12 >= 2).length}/${WANT}`);
console.log('\n===== TEMPLATE FILE (paste into servingOrderCompositionTemplates.ts) =====\n');
for (const c of chosen) {
  const roles = toRoles(c.cups);
  console.log(`    { id: 'serve-taste-${String(c.depth).padStart(2,'0')}-${c.seed}', kind: 'serving-order-tasting', depth: ${c.depth}, cups: ${JSON.stringify(roles)}, serve1Index: ${c.h1}, serve2Index: ${c.h2}, tastingIndex: ${TASTING_IDX} },`);
}
