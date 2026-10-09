/**
 * OFFLINE robust tea-bloom curation (G12 production, dev-only).
 * Same as tea-bloom-curate but requires L2 under multiple role perms
 * (robustness filter) so production fast-path permutations preserve L2.
 * Usage: bun scripts/dev/tea-bloom-curate-robust.ts [shapedCount] [outJsonl]
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
const ROBUST_TRIALS = 8;

const C: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
function pool(): TeaId[] { const p: TeaId[] = []; for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c); return p; }
function isMixedFull(cup: TeaId[]): boolean { return cup.length === 4 && new Set(cup).size >= 2; }

interface Cand {
  seedIdx: number; depth: number; visited: number; cups: string[][]; host: number;
  bloom: number; reuse: number; gap: number; drain: number | null; repurpose: boolean;
  l3a: boolean; l3b: boolean; delta: number; controlAvoids: boolean; bloomDiv: number;
  maxOcc: number; hostDiv: number; key: string;
}

function traceL2(cups: TeaId[][], buds: TeaBudSlot[], host: number): { ok: boolean; bloom: number | null; reuse: number | null; drain: number | null; maxOcc: number; cleared: boolean; win: boolean; depth: number; visited: number; sol: SolverAction[] | null } {
  const r = solvePuzzle(cups, { cupConstraints: C, teaBudSlots: buds, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (!r.solvable || r.truncated || r.minMoves === undefined || !r.solution) return { ok: false, bloom: null, reuse: null, drain: null, maxOcc: 0, cleared: false, win: false, depth: -1, visited: r.visitedStates, sol: null };
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
    if (!res) return { ok: false, bloom, reuse, drain, maxOcc, cleared: false, win: false, depth: r.minMoves, visited: r.visitedStates, sol };
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
  const ok = bloom !== null && reuse !== null && cleared && win;
  return { ok, bloom, reuse, drain, maxOcc, cleared, win, depth: r.minMoves, visited: r.visitedStates, sol };
}

const shapedTarget = Number(process.argv[2] ?? 6000);
const outJsonl = process.argv[3] ?? '';
const cands: Cand[] = [];
const seen = new Set<string>();
let shapedN = 0, solv = 0, robustTested = 0, robustPassed = 0;
const l2depthHist: Record<string, number> = {};
for (let s = 0; s < shapedTarget; s++) {
  const seedIdx = s + 400000;
  let cups: TeaId[][] | null = null;
  let host = -1;
  for (let a = 0; a < 200; a++) {
    const rng = createRng(`bloom-rcurate-${seedIdx}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cc: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cc.push(p.slice(off, off + L)); off += L; }
    const mixed: number[] = [];
    for (let i = 0; i < 4; i++) if (isMixedFull(cc[i] as TeaId[])) mixed.push(i);
    if (mixed.length === 0) continue;
    host = mixed[Math.floor(rng() * mixed.length)] as number;
    cups = cc;
    break;
  }
  if (!cups || host < 0) continue;
  shapedN++;
  const buds: TeaBudSlot[] = [null, null, null, null, null, null];
  buds[host] = 'tea_bud';
  const t0 = traceL2(cups, buds, host);
  if (!t0.ok || t0.bloom === null || t0.reuse === null) continue;
  if (t0.depth < ACCEPT.min || t0.depth > ACCEPT.max) continue;
  solv++;
  // robustness: L2 under ROBUST_TRIALS role perms (identity + random)
  robustTested++;
  let robustOk = 0;
  // trial 0 = identity (already passed, count it)
  robustOk++;
  for (let ri = 1; ri < ROBUST_TRIALS; ri++) {
    const rng = createRng(`bloom-robust-${seedIdx}-${ri}`);
    const order = [...PALETTE];
    shuffleInPlace(rng, order);
    const roleToTea = new Map<string, TeaId>([['c0', order[0] as TeaId], ['c1', order[1] as TeaId], ['c2', order[2] as TeaId], ['c3', order[3] as TeaId]]);
    // map concrete teas through palette-index isomorphism: concrete -> role -> permuted concrete
    const idx = new Map<TeaId, number>(PALETTE.map((t, i) => [t, i] as [TeaId, number]));
    const perm = (c: TeaId[][]): TeaId[][] => c.map((cup) => cup.map((tea) => order[idx.get(tea) as number] as TeaId));
    const pcups = perm(cups);
    const tr = traceL2(pcups, buds, host);
    if (tr.ok && tr.depth === t0.depth) robustOk++;
    else break;
  }
  if (robustOk < ROBUST_TRIALS) continue;
  robustPassed++;
  const hostFinalCheck = t0.sol ? true : false;
  void hostFinalCheck;
  // recompute full details from identity trace for curation fields
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), teaBudSlots: buds }, C);
  if (seen.has(key)) continue;
  seen.add(key);
  const rc = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  const delta = rc.solvable && rc.minMoves !== undefined ? t0.depth - (rc.minMoves as number) : 99;
  let controlAvoids = false;
  if (rc.solvable && rc.solution) {
    let pc = cups.map((c) => [...c]);
    let minOcc = (pc[host] as TeaId[]).length;
    for (const a of rc.solution) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const res = applyPourState({ cups: pc, floatingIngredients: emptyFloatingIngredients(pc.length) }, (a as { from: number }).from, (a as { to: number }).to, C);
      if (!res) break;
      pc = res.state.cups as TeaId[][];
      minOcc = Math.min(minOcc, (pc[host] as TeaId[]).length);
    }
    controlAvoids = minOcc > 0;
  }
  const bloomDiv = (t0.bloom as number) / Math.max(1, t0.depth);
  if (bloomDiv > 0.75) continue;
  // L3 check
  let cur = cups.map((c) => [...c]);
  let b: TeaBudSlot[] = [...buds];
  for (const a of (t0.sol as SolverAction[])) {
    if ((a as SolverAction).kind !== 'pour') continue;
    const res = applyPourState({ cups: cur, floatingIngredients: emptyFloatingIngredients(cur.length), teaBudSlots: [...b] }, (a as { from: number }).from, (a as { to: number }).to, C);
    if (!res) break;
    cur = res.state.cups as TeaId[][];
    b = [...(res.state.teaBudSlots as TeaBudSlot[])];
  }
  const hostFinal = cur[host] as TeaId[];
  const repurpose = hostFinal.length === 4 && hostFinal.every((tt) => tt === hostFinal[0]);
  const l3a = t0.drain !== null;
  const l3b = repurpose;
  if (!l3a && !l3b) continue;
  cands.push({ seedIdx, depth: t0.depth, visited: t0.visited, cups: cups as unknown as string[][], host, bloom: t0.bloom as number, reuse: t0.reuse as number, gap: (t0.reuse as number) - (t0.bloom as number), drain: t0.drain, repurpose, l3a, l3b, delta, controlAvoids, bloomDiv, maxOcc: t0.maxOcc, hostDiv: new Set((cups[host] as TeaId[])).size, key });
  l2depthHist[String(t0.depth)] = (l2depthHist[String(t0.depth)] ?? 0) + 1;
  if (cands.length % 10 === 0) console.error(`shaped=${shapedN} l2id=${solv} robust=${cands.length} tested=${robustTested} passed=${robustPassed}`);
  if (cands.length >= 60) break;
}
console.error(`done shaped=${shapedN} l2id=${solv} robustDistinct=${cands.length} tested=${robustTested} passed=${robustPassed}`);
console.error(`L2depthHist(robust)=${JSON.stringify(l2depthHist)}`);
const inBand = cands.filter((c) => c.depth >= ACCEPT.min && c.depth <= ACCEPT.max);
console.error(`inBand ${ACCEPT.min}-${ACCEPT.max}: ${inBand.length} l3a=${inBand.filter((c) => c.l3a).length} l3b=${inBand.filter((c) => c.l3b).length} avoids=${inBand.filter((c) => c.controlAvoids).length}`);
function score(c: Cand): number {
  let s = Math.abs(c.depth - 12) * 0.5;
  if (c.depth < SWEET.min || c.depth > SWEET.max) s += 1.5;
  if (c.gap <= 1) s += 2;
  else if (c.gap >= 3) s -= 0.75;
  else if (c.gap === 2) s -= 0.25;
  if (c.bloom === 0) s += 3;
  if (c.bloomDiv > 0.6) s += 1;
  if (!c.controlAvoids) s += 1.25;
  if (c.delta < 0 || c.delta > 2) s += 1;
  s += c.visited / 3000;
  return s;
}
const ranked = [...inBand].sort((a, b) => score(a) - score(b));
const quotas = [{ depth: 10, count: 2 }, { depth: 11, count: 5 }, { depth: 12, count: 5 }, { depth: 13, count: 4 }, { depth: 14, count: 2 }];
const picked: Cand[] = [];
const seenPat = new Set<string>();
const tryAdd = (c: Cand): boolean => { const pat = JSON.stringify(c.cups); if (seenPat.has(pat)) return false; seenPat.add(pat); picked.push(c); return true; };
const l3aPool = ranked.filter((c) => c.l3a);
for (const c of l3aPool.slice(0, 6)) {
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
console.error(`gaps=${picked.map((p) => p.gap).join(',')} blooms=${picked.map((p) => p.bloom).join(',')} bloomDiv=${picked.map((p) => p.bloomDiv.toFixed(2)).join(',')}`);
console.error(`l3a=${picked.filter((p) => p.l3a).length} l3b=${picked.filter((p) => p.l3b).length} avoids=${picked.filter((p) => p.controlAvoids).length} deltas=${picked.map((p) => p.delta).join(',')}`);
console.error(`hosts-orig=${picked.map((p) => p.host).join(',')} hostDiv=${picked.map((p) => p.hostDiv).join(',')}`);
picked.forEach((c, i) => { (c as unknown as { origHost: number }).origHost = c.host; c.host = [0, 1, 2, 3, 4, 5][i % 6] as number; });
console.error(`hosts-final=${picked.map((p) => p.host).join(',')}`);
const fb = [...picked].sort((a, b) => score(a) - score(b))[0];
console.error(`fallback suggestion: tea-bloom-${fb?.depth}-${fb?.seedIdx}`);
if (outJsonl) { fs.writeFileSync(outJsonl, picked.map((p) => JSON.stringify(p)).join('\n')); console.error(`wrote ${outJsonl}`); }
const roleOf = new Map<string, string>(PALETTE.map((tt, i) => [tt as string, `c${i}`]));
const entries = picked.map((p) => {
  const origHost = (p as unknown as { origHost: number }).origHost ?? p.host;
  const cups = (p.cups as unknown as string[][]).map((c) => [...c]);
  if (p.host !== origHost) { const tmp = cups[p.host] as string[]; cups[p.host] = cups[origHost] as string[]; cups[origHost] = tmp; }
  const roleCups = cups.map((cup) => cup.map((tt) => roleOf.get(tt) ?? tt));
  const cupStr = JSON.stringify(roleCups).replace(/"c0"/g, "'c0'").replace(/"c1"/g, "'c1'").replace(/"c2"/g, "'c2'").replace(/"c3"/g, "'c3'");
  return `    { id: 'tea-bloom-${p.depth}-${p.seedIdx}', kind: 'tea-bloom', depth: ${p.depth}, cups: ${cupStr}, teaBudHost: ${p.host} },`;
});
console.log(entries.join('\n'));
