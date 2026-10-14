/**
 * G15 composition feasibility sampler (DEV ONLY — never CI/production).
 * Optimized: FULL solve + L2/C2 screen first; controls only for C2 candidates.
 */
import {
  CupConstraint,
  TeaId,
  cloneCupConstraint,
  emptyCapacityObstacles,
  emptyFloatingIngredients,
  emptyIceSlots,
  emptySinkingIngredients,
  emptyTeaBudSlots,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  pourCountState,
  pourRejectCodeState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import { servedPrefixLength } from '../../src/game/logic/servingOrder.ts';

const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
const TASTING_PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const HONEY_PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'buckwheat', 'karkade'];
const MYSTERY_PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const LENGTHS = [4, 4, 4, 4, 0, 0];

function pool(palette: TeaId[]): TeaId[] {
  const p: TeaId[] = [];
  for (const c of palette) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}
function isMixedFull(cup: TeaId[]): boolean {
  if (cup.length !== 4) return false;
  return new Set(cup).size >= 2;
}
function shaped(palette: TeaId[], s: number): { cups: TeaId[][]; h1: number; h2: number } {
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`g15-shaped-${palette.join(',')}-${s}-try-${a}`);
    const p = pool(palette);
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cups.push(p.slice(off, off + L)); off += L; }
    let mixed = true;
    for (let i = 0; i < 4; i++) if (!isMixedFull(cups[i] as TeaId[])) { mixed = false; break; }
    if (!mixed) continue;
    const h1 = Math.floor(rng() * 4);
    let h2 = Math.floor(rng() * 3);
    if (h2 >= h1) h2++;
    return { cups, h1, h2 };
  }
  throw new Error(`no shape ${s}`);
}
function consOrder(h1: number, h2: number): CupConstraint[] {
  return Array.from({ length: 6 }, (_, i) => (
    i === h1 ? { mode: 'normal', serveOrder: 1 }
    : i === h2 ? { mode: 'normal', serveOrder: 2 }
    : { mode: 'normal' as const }
  )) as CupConstraint[];
}
function consOrderTasting(h1: number, h2: number, tastingIdx = 5): CupConstraint[] {
  const c = consOrder(h1, h2);
  c[tastingIdx] = { mode: 'normal', capacity: 2, mustEndEmpty: true };
  return c;
}
function plainCons(): CupConstraint[] {
  return Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
}
function stripOrders(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { serveOrder?: number }).serveOrder;
    return n;
  });
}
function baseState(cups: TeaId[][], sinking?: ReturnType<typeof emptySinkingIngredients>) {
  return {
    cups,
    floatingIngredients: emptyFloatingIngredients(cups.length),
    sinkingIngredients: sinking ? sinking.map((x) => x) as ReturnType<typeof emptySinkingIngredients> : emptySinkingIngredients(cups.length),
    strainer: { present: false, attachedCupIndex: null, heldTea: null },
    iceSlots: emptyIceSlots(cups.length),
    capacityObstacles: emptyCapacityObstacles(cups.length),
    teaBudSlots: emptyTeaBudSlots(cups.length),
  };
}
function pressureCandidates(cups: TeaId[][], h2: number, constraints: readonly CupConstraint[], sinking?: ReturnType<typeof emptySinkingIngredients>): number {
  const state = baseState(cups.map((c) => [...c]), sinking);
  if (servedPrefixLength(state, constraints) !== 0) return 0;
  const dest = state.cups[h2] as TeaId[];
  if (dest.length === 4) return 0;
  const ctrl = stripOrders(constraints);
  const ctrlState = baseState(state.cups.map((c) => [...c]), sinking);
  let n = 0;
  for (let s = 0; s < state.cups.length; s++) {
    if (s === h2) continue;
    if (!canPourState(ctrlState, s, h2, ctrl)) continue;
    const m = pourCountState(ctrlState, s, h2, ctrl);
    if (m <= 0) continue;
    const src = state.cups[s] as TeaId[];
    const top = src[src.length - 1] as TeaId;
    const candidate = [...dest];
    for (let i = 0; i < m; i++) candidate.push(top);
    if (candidate.length !== 4 || !candidate.every((l) => l === top)) continue;
    if (pourRejectCodeState(state, s, h2, constraints) === 'serve-order') n++;
  }
  return n;
}
function analyzeTrace(startCups: TeaId[][], h2: number, solution: readonly SolverAction[], constraints: readonly CupConstraint[], sinking?: ReturnType<typeof emptySinkingIngredients>) {
  let cups = startCups.map((c) => [...c]);
  let sink = sinking ? sinking.map((x) => x) as ReturnType<typeof emptySinkingIngredients> : emptySinkingIngredients(startCups.length);
  const tr = { pressureStates: 0, firstPressureDepth: null as number | null, serve1Depth: null as number | null, serve2Depth: null as number | null, servedPrefixFinal: 0, win: false };
  for (let d = 0; d <= solution.length; d++) {
    if (d > 0) {
      const a = solution[d - 1] as SolverAction;
      if (a.kind !== 'pour') continue;
      const res = applyPourState(baseState(cups, sink), a.from, a.to, constraints);
      if (!res) return tr;
      cups = res.state.cups as TeaId[][];
      sink = (res.state.sinkingIngredients as ReturnType<typeof emptySinkingIngredients>).map((x) => x) as ReturnType<typeof emptySinkingIngredients>;
      if (res.serveCompleted === 1 && tr.serve1Depth === null) tr.serve1Depth = d - 1;
      if (res.serveCompleted === 2 && tr.serve2Depth === null) tr.serve2Depth = d - 1;
    }
    const cands = pressureCandidates(cups, h2, constraints, sink);
    if (cands > 0) {
      tr.pressureStates++;
      if (tr.firstPressureDepth === null) tr.firstPressureDepth = d;
    }
  }
  tr.servedPrefixFinal = servedPrefixLength(baseState(cups, sink), constraints);
  tr.win = isPuzzleWonState(baseState(cups, sink), constraints);
  return tr;
}
function pct(a: number[], p: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}

async function runCombo(kind: 'mystery' | 'tasting' | 'honey', N: number): Promise<void> {
  const palette = kind === 'honey' ? HONEY_PALETTE : kind === 'tasting' ? TASTING_PALETTE : MYSTERY_PALETTE;
  let solvable = 0; let unsolv = 0; let trunc = 0;
  let l1 = 0;
  let c2 = 0; let c3 = 0; let c4 = 0;
  const canonC2 = new Set<string>(); const canonC3 = new Set<string>();
  const depths: number[] = []; const visited: number[] = []; const ms: number[] = [];
  const deltasFullOrder: number[] = []; const deltasFullB: number[] = []; const deltasFullPlain: number[] = [];
  let bSolv = 0;
  for (let s = 0; s < N; s++) {
    const { cups, h1, h2 } = shaped(palette, s + (kind === 'tasting' ? 100000 : kind === 'honey' ? 200000 : 300000));
    let fullCons: CupConstraint[];
    let sinking: ReturnType<typeof emptySinkingIngredients> | undefined;
    let mysteryHost = -1;
    if (kind === 'tasting') fullCons = consOrderTasting(h1, h2, 5);
    else if (kind === 'honey') {
      fullCons = consOrder(h1, h2);
      const ordinaries = [0, 1, 2, 3].filter((i) => i !== h1 && i !== h2);
      const hh = ordinaries[s % ordinaries.length] as number;
      const sink = emptySinkingIngredients(6);
      sink[hh] = 'honey';
      sinking = sink;
    } else {
      fullCons = consOrder(h1, h2);
      const ordinaries = [0, 1, 2, 3].filter((i) => i !== h1 && i !== h2);
      let mHost = -1;
      for (const o of ordinaries) {
        const cup = cups[o] as TeaId[];
        if (cup.length >= 3 && cup[0] !== cup[1]) { mHost = o; break; }
      }
      if (mHost < 0) mHost = ordinaries[0] as number;
      mysteryHost = mHost;
    }
    const t0 = Date.now();
    const r = solvePuzzle(cups, { cupConstraints: fullCons, sinkingIngredients: sinking, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    ms.push(Date.now() - t0);
    visited.push(r.visitedStates);
    if (r.truncated) { trunc++; continue; }
    if (!r.solvable || r.minMoves === undefined || !r.solution) { unsolv++; continue; }
    solvable++;
    depths.push(r.minMoves);
    const tr = analyzeTrace(cups, h2, r.solution, fullCons, sinking);
    const isL1 = tr.serve1Depth !== null && tr.serve2Depth !== null && tr.win && tr.servedPrefixFinal === 2;
    if (isL1) l1++;
    const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
    const isL2 = isL1 && tr.firstPressureDepth !== null && tr.serve1Depth !== null && tr.serve2Depth !== null &&
      (tr.firstPressureDepth as number) < (tr.serve1Depth as number) &&
      (tr.serve1Depth as number) < (tr.serve2Depth as number) && early;
    if (!isL2) continue;
    let secondExercised = false;
    if (kind === 'tasting') {
      secondExercised = (r.solution as SolverAction[]).some((a) => a.kind === 'pour' && (a.from === 5 || a.to === 5));
    } else if (kind === 'honey') {
      let rcups = cups.map((c) => [...c]);
      let rsink = (sinking as ReturnType<typeof emptySinkingIngredients>).map((x) => x) as ReturnType<typeof emptySinkingIngredients>;
      for (const a of r.solution as SolverAction[]) {
        if (a.kind !== 'pour') continue;
        const res = applyPourState(baseState(rcups, rsink), a.from, a.to, fullCons);
        if (!res) break;
        if (res.sinkingIngredientMoved != null) { secondExercised = true; break; }
        rcups = res.state.cups as TeaId[][];
        rsink = (res.state.sinkingIngredients as ReturnType<typeof emptySinkingIngredients>).map((x) => x) as ReturnType<typeof emptySinkingIngredients>;
      }
    } else {
      secondExercised = (r.solution as SolverAction[]).some((a) => a.kind === 'pour' && (a.from === mysteryHost || a.to === mysteryHost));
    }
    if (!secondExercised) continue;
    // C2 reached — now controls (only here, to save time)
    c2++;
    const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6), sinkingIngredients: sinking }, fullCons);
    canonC2.add(key);
    const f0 = (r.solution as SolverAction[])[0];
    const firstFull = f0 ? `${f0.kind}:${(f0 as { from?: number }).from ?? ''}→${(f0 as { to?: number }).to ?? ''}` : null;
    let dOrder: number | null = null; let dB: number | null = null; let dPlain: number | null = null;
    let firstOrder: string | null = null; let firstB: string | null = null;
    {
      const oc = consOrder(h1, h2);
      const ro = solvePuzzle(cups, { cupConstraints: oc, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
      if (!ro.truncated && ro.solvable && ro.minMoves !== undefined && ro.solution) {
        dOrder = ro.minMoves;
        const f = (ro.solution as SolverAction[])[0];
        firstOrder = f ? `${f.kind}:${(f as { from?: number }).from ?? ''}→${(f as { to?: number }).to ?? ''}` : null;
      }
    }
    {
      let bc: CupConstraint[]; let bsink: ReturnType<typeof emptySinkingIngredients> | undefined;
      if (kind === 'tasting') { bc = plainCons(); bc[5] = { mode: 'normal', capacity: 2, mustEndEmpty: true }; }
      else if (kind === 'honey') { bc = plainCons(); bsink = (sinking as ReturnType<typeof emptySinkingIngredients>).map((x) => x) as ReturnType<typeof emptySinkingIngredients>; }
      else { bc = plainCons(); }
      const rb = solvePuzzle(cups, { cupConstraints: bc, sinkingIngredients: bsink, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
      if (!rb.truncated && rb.solvable && rb.minMoves !== undefined && rb.solution) {
        dB = rb.minMoves; bSolv++;
        const f = (rb.solution as SolverAction[])[0];
        firstB = f ? `${f.kind}:${(f as { from?: number }).from ?? ''}→${(f as { to?: number }).to ?? ''}` : null;
      }
    }
    {
      const rp = solvePuzzle(cups, { cupConstraints: plainCons(), maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
      if (!rp.truncated && rp.solvable && rp.minMoves !== undefined) dPlain = rp.minMoves;
    }
    if (dOrder !== null) deltasFullOrder.push(r.minMoves - dOrder);
    if (dB !== null) deltasFullB.push(r.minMoves - dB);
    if (dPlain !== null) deltasFullPlain.push(r.minMoves - dPlain);
    const divergesOrder = dOrder !== null && (r.minMoves !== dOrder || firstFull !== firstOrder);
    const divergesB = dB !== null && (r.minMoves !== dB || firstFull !== firstB);
    if (divergesOrder && divergesB) { c3++; canonC3.add(key); }
    if (dOrder !== null && dB !== null && r.minMoves >= Math.max(dOrder, dB) + 2) c4++;
    if (s % 500 === 499) console.log(`[${kind}] shaped ${s + 1}/${N} C2=${c2} C3=${c3} solv=${solvable}`);
  }
  console.log(`\n===== G15 ${kind.toUpperCase()} N=${N} =====`);
  console.log(`solv=${solvable} unsolv=${unsolv} trunc=${trunc} truncRate=${(100 * trunc / Math.max(1, N)).toFixed(2)}% solvRate=${(100 * solvable / Math.max(1, N)).toFixed(1)}%`);
  console.log(`L1=${l1} C2=${c2} (rate=${(100 * c2 / Math.max(1, N)).toFixed(2)}%) C3=${c3} (rate=${(100 * c3 / Math.max(1, N)).toFixed(2)}%) C4=${c4} canonC2=${canonC2.size} canonC3=${canonC3.size}`);
  console.log(`depths min=${depths.length ? Math.min(...depths) : 'n/a'} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 'n/a'}`);
  console.log(`deltaFull-Order p50=${pct(deltasFullOrder, 50)} p95=${pct(deltasFullOrder, 95)} | deltaFull-B p50=${pct(deltasFullB, 50)} p95=${pct(deltasFullB, 95)} | deltaFull-Plain p50=${pct(deltasFullPlain, 50)} p95=${pct(deltasFullPlain, 95)} bSolv=${bSolv}`);
  console.log(`visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${visited.length ? Math.max(...visited) : 'n/a'} ms p50=${pct(ms, 50)} p95=${pct(ms, 95)} max=${ms.length ? Math.max(...ms) : 'n/a'}`);
  const pass = canonC2.size >= 100 && (100 * c2 / Math.max(1, N)) >= 10;
  console.log(pass ? `FEASIBILITY CANDIDATE PASS` : `FEASIBILITY CANDIDATE HOLD`);
}
const arg = process.argv[2] ?? 'all';
const N = Number(process.argv[3] ?? 5000);
if (arg === 'all') {
  await runCombo('mystery', N);
  await runCombo('tasting', N);
  await runCombo('honey', N);
} else {
  await runCombo(arg as 'mystery' | 'tasting' | 'honey', N);
}
