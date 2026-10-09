/**
 * OFFLINE robust tea-bloom curation v2 (G12 production, dev-only).
 * Robustness is evaluated on FINAL (post-host-spread, post-color-perm)
 * layouts — exactly what production serves. Host spread assigned per
 * candidate round-robin BEFORE robustness trials.
 * Usage: bun scripts/dev/tea-bloom-curate-v2.ts [shapedCount]
 */
import * as fs from 'node:fs';
import { CupConstraint, TeaBudSlot, TeaId, emptyFloatingIngredients } from '../../src/game/types.ts';
import { applyPourState, canonicalPuzzleKey, isPuzzleWonState } from '../../src/game/logic/rules.ts';
import { solvePuzzle, SolverAction } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const LENGTHS = [4, 4, 4, 4, 0, 0];
const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
const ACCEPT = { min: 10, max: 14 };
const SWEET = { min: 11, max: 13 };
const ROBUST_TRIALS = 6;

const C: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
function pool(): TeaId[] { const p: TeaId[] = []; for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c); return p; }
function isMixedFull(cup: TeaId[]): boolean { return cup.length === 4 && new Set(cup).size >= 2; }

interface Cand {
  seedIdx: number; depth: number; visited: number; cups: string[][]; host: number;
  bloom: number; reuse: number; gap: number; drain: number | null; repurpose: boolean;
  l3a: boolean; l3b: boolean; delta: number; controlAvoids: boolean; bloomDiv: number;
  maxOcc: number; hostDiv: number; key: string;
}

function traceL2(cups: TeaId[][], buds: TeaBudSlot[], host: number) {
  const r = solvePuzzle(cups, { cupConstraints: C, teaBudSlots: buds, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (!r.solvable || r.truncated || r.minMoves === undefined || !r.solution) return { ok: false as const, bloom: null as number | null, reuse: null as number | null, drain: null as number | null, maxOcc: 0, cleared: false, win: false, depth: -1, visited: r.visitedStates, sol: null as SolverAction[] | null };
  let cur = cups.map((c) => [...c]);
  let b: TeaBudSlot[] = [...buds];
  let bloom: number | null = null;
  let reuse: number | null = null;
  let drain: number | null = null;
  let maxOcc = 0;
  let reuseSeen = false;
  const sol = r.solution as SolverAction[];
  for (let i = 0; i < sol.length; i++) {
    const a = sol[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const res = applyPourState({ cups: cur, floatingIngredients: emptyFloatingIngredients(cur.length), teaBudSlots: [...b] }, (a as { from: number }).from, (a as { to: number }).to, C);
    if (!res) return { ok: false as const, bloom, reuse, drain, maxOcc, cleared: false, win: false, depth: r.minMoves, visited: r.visitedStates, sol };
    cur = res.state.cups as TeaId[][];
    b = [...(res.state.teaBudSlots as TeaBudSlot[])];
    if (bloom === null && res.teaBudBloomed === 'tea_bud') bloom = i;
    if (bloom !== null) {
      maxOcc = Math.max(maxOcc, (cur[host] as TeaId[]).length);
      if (!reuseSeen && (cur[host] as TeaId[]).length >= 2) { reuse = i; reuseSeen = true; }
      if (reuseSeen && reuse !== null && (a as { from: number }).from === host && i > reuse && drain === null) drain = i;
    }
  }
  const cleared = b.every((x) => x === null);
  const win = isPuzzleWonState({ cups: cur, floatingIngredients: emptyFloatingIngredients(cur.length), teaBudSlots: [...b] }, C);
  return { ok: bloom !== null && reuse !== null && cleared && win, bloom, reuse, drain, maxOcc, cleared, win, depth: r.minMoves, visited: r.visitedStates, sol };
}

const shapedTarget = Number(process.argv[2] ?? 8000);
const cands: Cand[] = [];
const seen = new Set<string>();
let shapedN = 0, robustPass = 0;
const hist: Record<string, number> = {};
let spreadCounter = 0;
for (let s = 0; s < shapedTarget; s++) {
  const seedIdx = s + 500000;
  let cups: TeaId[][] | null = null;
  let origHost = -1;
  for (let a = 0; a < 200; a++) {
    const rng = createRng(`bloom-v2-${seedIdx}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cc: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cc.push(p.slice(off, off + L)); off += L; }
    const mixed: number[] = [];
    for (let i = 0; i < 4; i++) if (isMixedFull(cc[i] as TeaId[])) mixed.push(i);
    if (mixed.length === 0) continue;
    origHost = mixed[Math.floor(rng() * mixed.length)] as number;
    cups = cc;
    break;
  }
  if (!cups || origHost < 0) continue;
  shapedN++;
  // Assign FINAL spread host BEFORE any L2/robustness evaluation.
  const spreadHost = spreadCounter % 6;
  spreadCounter++;
  const fcups = cups.map((c) => [...c]);
  if (spreadHost !== origHost) {
    const tmp = fcups[spreadHost] as TeaId[];
    fcups[spreadHost] = fcups[origHost] as TeaId[];
    fcups[origHost] = tmp;
  }
  const fbuds: TeaBudSlot[] = [null, null, null, null, null, null];
  fbuds[spreadHost] = 'tea_bud';
  const t0 = traceL2(fcups, fbuds, spreadHost);
  if (!t0.ok || t0.bloom === null || t0.reuse === null) continue;
  if (t0.depth < ACCEPT.min || t0.depth > ACCEPT.max) continue;
  const bloomDiv0 = (t0.bloom as number) / Math.max(1, t0.depth);
  if (bloomDiv0 > 0.75) continue;
  // Robustness: color perms on FINAL layout.
  let okCount = 1; // identity passed
  const idx = new Map<TeaId, number>(PALETTE.map((tt, i) => [tt, i] as [TeaId, number]));
  let robust = true;
  for (let ri = 1; ri < ROBUST_TRIALS; ri++) {
    const rng = createRng(`bloom-v2-robust-${seedIdx}-${ri}`);
    const order = [...PALETTE];
    shuffleInPlace(rng, order);
    const pcups = fcups.map((cup) => cup.map((tea) => order[idx.get(tea) as number] as TeaId));
    const tr = traceL2(pcups, fbuds, spreadHost);
    if (tr.ok && tr.depth === t0.depth) okCount++;
    else { robust = false; break; }
  }
  if (!robust) continue;
  robustPass++;
  const key = canonicalPuzzleKey({ cups: fcups, floatingIngredients: emptyFloatingIngredients(fcups.length), teaBudSlots: fbuds }, C);
  if (seen.has(key)) continue;
  seen.add(key);
  const rc = solvePuzzle(fcups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  const delta = rc.solvable && rc.minMoves !== undefined ? t0.depth - (rc.minMoves as number) : 99;
  let controlAvoids = false;
  if (rc.solvable && rc.solution) {
    let pc = fcups.map((c) => [...c]);
    let minOcc = (pc[spreadHost] as TeaId[]).length;
    for (const a of rc.solution) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const res = applyPourState({ cups: pc, floatingIngredients: emptyFloatingIngredients(pc.length) }, (a as { from: number }).from, (a as { to: number }).to, C);
      if (!res) break;
      pc = res.state.cups as TeaId[][];
      minOcc = Math.min(minOcc, (pc[spreadHost] as TeaId[]).length);
    }
    controlAvoids = minOcc > 0;
  }
  // L3
  let cur = fcups.map((c) => [...c]);
  let b: TeaBudSlot[] = [...fbuds];
  for (const a of (t0.sol as SolverAction[])) {
    if ((a as SolverAction).kind !== 'pour') continue;
    const res = applyPourState({ cups: cur, floatingIngredients: emptyFloatingIngredients(cur.length), teaBudSlots: [...b] }, (a as { from: number }).from, (a as { to: number }).to, C);
    if (!res) break;
    cur = res.state.cups as TeaId[][];
    b = [...(res.state.teaBudSlots as TeaBudSlot[])];
  }
  const hostFinal = cur[spreadHost] as TeaId[];
  const repurpose = hostFinal.length === 4 && hostFinal.every((tt) => tt === hostFinal[0]);
  const l3a = t0.drain !== null;
  const l3b = repurpose;
  if (!l3a && !l3b) continue;
  cands.push({ seedIdx, depth: t0.depth, visited: t0.visited, cups: fcups as unknown as string[][], host: spreadHost, bloom: t0.bloom as number, reuse: t0.reuse as number, gap: (t0.reuse as number) - (t0.bloom as number), drain: t0.drain, repurpose, l3a, l3b, delta, controlAvoids, bloomDiv: bloomDiv0, maxOcc: t0.maxOcc, hostDiv: new Set((fcups[spreadHost] as TeaId[])).size, key });
  hist[String(t0.depth)] = (hist[String(t0.depth)] ?? 0) + 1;
  if (cands.length % 10 === 0) console.error(`shaped=${shapedN} robust=${cands.length}`);
  if (cands.length >= 60) break;
}
console.error(`done shaped=${shapedN} robustDistinct=${cands.length} hist=${JSON.stringify(hist)}`);
const inBand = cands.filter((c) => c.depth >= ACCEPT.min && c.depth <= ACCEPT.max);
console.error(`inBand: ${inBand.length} l3a=${inBand.filter((c) => c.l3a).length} l3b=${inBand.filter((c) => c.l3b).length} avoids=${inBand.filter((c) => c.controlAvoids).length}`);
function score(c: Cand): number {
  let sc = Math.abs(c.depth - 12) * 0.5;
  if (c.depth < SWEET.min || c.depth > SWEET.max) sc += 1.5;
  if (c.gap <= 1) sc += 2;
  else if (c.gap >= 3) sc -= 0.75;
  else if (c.gap === 2) sc -= 0.25;
  if (c.bloom === 0) sc += 3;
  if (c.bloomDiv > 0.6) sc += 1;
  if (!c.controlAvoids) sc += 1.25;
  if (c.delta < 0 || c.delta > 2) sc += 1;
  sc += c.visited / 3000;
  return sc;
}
const ranked = [...inBand].sort((a, b) => score(a) - score(b));
const quotas = [{ depth: 10, count: 2 }, { depth: 11, count: 5 }, { depth: 12, count: 5 }, { depth: 13, count: 4 }, { depth: 14, count: 2 }];
const picked: Cand[] = [];
const seenPat = new Set<string>();
const tryAdd = (c: Cand): boolean => { const pat = JSON.stringify(c.cups); if (seenPat.has(pat)) return false; seenPat.add(pat); picked.push(c); return true; };
for (const c of ranked.filter((c) => c.l3a).slice(0, 6)) {
  if (picked.length >= 18) break;
  if (picked.includes(c)) continue;
  const atDepth = picked.filter((p) => p.depth === c.depth).length;
  const q = quotas.find((x) => x.depth === c.depth);
  if (q && atDepth >= q.count + 1) continue;
  tryAdd(c);
}
for (const q of quotas) {
  for (const c of ranked.filter((c) => c.depth === q.depth)) {
    if (picked.filter((p) => p.depth === q.depth).length >= q.count) break;
    if (picked.length >= 18) break;
    if (picked.includes(c)) continue;
    tryAdd(c);
  }
}
for (const c of ranked) { if (picked.length >= 18) break; if (picked.includes(c)) continue; tryAdd(c); }
console.error(`picked=${picked.length} depths=${picked.map((p) => p.depth).join(',')}`);
console.error(`gaps=${picked.map((p) => p.gap).join(',')} blooms=${picked.map((p) => p.bloom).join(',')}`);
console.error(`l3a=${picked.filter((p) => p.l3a).length} l3b=${picked.filter((p) => p.l3b).length} avoids=${picked.filter((p) => p.controlAvoids).length}`);
console.error(`hosts=${picked.map((p) => p.host).join(',')}`);
const fb = [...picked].sort((a, b) => score(a) - score(b))[0];
console.error(`fallback: tea-bloom-${fb?.depth}-${fb?.seedIdx}`);
const roleOf = new Map<string, string>(PALETTE.map((tt, i) => [tt as string, `c${i}`]));
const entries = picked.map((p) => {
  const cups = (p.cups as unknown as string[][]).map((c) => [...c]);
  const roleCups = cups.map((cup) => cup.map((tt) => roleOf.get(tt) ?? tt));
  const cupStr = JSON.stringify(roleCups).replace(/"c0"/g, "'c0'").replace(/"c1"/g, "'c1'").replace(/"c2"/g, "'c2'").replace(/"c3"/g, "'c3'");
  return `    { id: 'tea-bloom-${p.depth}-${p.seedIdx}', kind: 'tea-bloom', depth: ${p.depth}, cups: ${cupStr}, teaBudHost: ${p.host} },`;
});
console.log(entries.join('\n'));
