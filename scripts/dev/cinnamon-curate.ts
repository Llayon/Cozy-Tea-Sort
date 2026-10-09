/**
 * OFFLINE cinnamon curation (G11 production, dev-only).
 * Samples offset T3-like shaped deals (host len-2 mixed cinnamon, 4,4,3,3,2,0),
 * selects 18 canonical-distinct L2 templates with depth spread + host spread.
 * Emits TS bank entries to stdout; diagnostics to stderr.
 * Usage: bun scripts/dev/cinnamon-curate.ts [shapedCount] [outJsonl]
 */
import * as fs from 'node:fs';
import {
  CupConstraint,
  TeaId,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle, SolverAction } from '../../src/game/logic/solver.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const LENGTHS = [4, 4, 3, 3, 2, 0];
const HOST = 4; // feasibility host; production spreads host by permutation
const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
const ACCEPT = { min: 9, max: 13 };
const SWEET = { min: 10, max: 12 };

const C: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
const obsFor = (h: number): (string | null)[] => {
  const o: (string | null)[] = [null, null, null, null, null, null];
  o[h] = 'cinnamon';
  return o;
};

interface Cand {
  seedIdx: number;
  depth: number;
  visited: number;
  cups: string[][];
  host: number;
  unlock: number;
  expanded: number;
  gap: number;
  repurpose: boolean;
  delta: number;
  key: string;
}

const shapedTarget = Number(process.argv[2] ?? 1500);
const outJsonl = process.argv[3] ?? '';
const cands: Cand[] = [];
const seen = new Set<string>();
let shaped = 0, solv = 0;
const l2depthHist: Record<string, number> = {};
for (let s = 0; s < shapedTarget; s++) {
  const seedIdx = s + 200000;
  // deterministic shaped deal
  let cups: TeaId[][] | null = null;
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`cinn-curate-${seedIdx}-try-${a}`);
    const p: TeaId[] = [];
    for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
    shuffleInPlace(rng, p);
    const cc: TeaId[][] = [];
    let off = 0;
    for (const L of LENGTHS) { cc.push(p.slice(off, off + L)); off += L; }
    const h = cc[HOST] as TeaId[];
    if (h.length === 2 && new Set(h).size === 2) { cups = cc; break; }
  }
  if (!cups) continue;
  shaped++;
  const r = solvePuzzle(cups, { cupConstraints: C, capacityObstacles: obsFor(HOST) as any, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (!r.solvable || r.truncated || !r.solution || r.minMoves === undefined) continue;
  solv++;
  // trace
  let cur = cups.map((c) => [...c]);
  let caps: (string | null)[] = obsFor(HOST);
  let unlock: number | null = null;
  let expanded: number | null = null;
  for (let i = 0; i < (r.solution as SolverAction[]).length; i++) {
    const a = (r.solution as SolverAction[])[i] as SolverAction;
    if (a.kind !== 'pour') continue;
    const res = applyPourState({ cups: cur, floatingIngredients: emptyFloatingIngredients(cur.length), capacityObstacles: [...caps] as any }, (a as { from: number }).from, (a as { to: number }).to, C);
    if (!res) break;
    cur = res.state.cups as TeaId[][];
    caps = [...(res.state.capacityObstacles as unknown as (string | null)[])];
    if ((res as any).capacityObstacleRemoved === 'cinnamon' && unlock === null) unlock = i;
    if (unlock !== null && i > (unlock as number) && (cur[HOST] as TeaId[]).length >= 3 && expanded === null) expanded = i;
  }
  const cleared = caps.every((c) => c === null);
  const win = isPuzzleWonState({ cups: cur, floatingIngredients: emptyFloatingIngredients(cur.length), capacityObstacles: [...caps] as any }, C);
  if (unlock === null || expanded === null || !cleared || !win) continue;
  const hostFinal = cur[HOST] as TeaId[];
  const repurpose = hostFinal.length === 4 && hostFinal.every((t) => t === hostFinal[0]);
  if (!repurpose) continue; // L3B-only population; L3A absent naturally
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length), capacityObstacles: obsFor(HOST) as any }, C);
  if (seen.has(key)) continue;
  seen.add(key);
  const rc = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  const delta = rc.solvable && rc.minMoves !== undefined ? (r.minMoves as number) - (rc.minMoves as number) : 99;
  cands.push({ seedIdx, depth: r.minMoves, visited: r.visitedStates, cups: cups as unknown as string[][], host: HOST, unlock, expanded, gap: (expanded as number) - (unlock as number), repurpose, delta, key });
  l2depthHist[String(r.minMoves)] = (l2depthHist[String(r.minMoves)] ?? 0) + 1;
  if (cands.length % 50 === 0) console.error(`shaped=${shaped} solv=${solv} L2=${cands.length}`);
}
console.error(`done shaped=${shaped} solv=${solv} L2distinct=${cands.length}`);
console.error(`L2depthHist=${JSON.stringify(l2depthHist)}`);
const inBand = cands.filter((c) => c.depth >= ACCEPT.min && c.depth <= ACCEPT.max);
console.error(`inBand ${ACCEPT.min}-${ACCEPT.max}: ${inBand.length}`);

function score(c: Cand): number {
  let s = Math.abs(c.depth - 11) * 0.5;
  if (c.depth < SWEET.min || c.depth > SWEET.max) s += 1.5;
  if (c.gap <= 1) s += 2;
  else if (c.gap >= 3) s -= 0.5;
  if (c.unlock === 0) s += 3;
  s += c.visited / 3000;
  s += Math.min(c.delta, 4) * 0.25;
  return s;
}
const ranked = [...inBand].sort((a, b) => score(a) - score(b));
const quotas = [
  { depth: 9, count: 2 },
  { depth: 10, count: 4 },
  { depth: 11, count: 6 },
  { depth: 12, count: 4 },
  { depth: 13, count: 2 },
];
const picked: Cand[] = [];
const seenPat = new Set<string>();
const tryAdd = (c: Cand): boolean => {
  const pat = JSON.stringify(c.cups);
  if (seenPat.has(pat)) return false;
  seenPat.add(pat);
  picked.push(c);
  return true;
};
for (const q of quotas) {
  for (const c of ranked.filter((c) => c.depth === q.depth)) {
    if (picked.filter((p) => p.depth === q.depth).length >= q.count) break;
    if (picked.length >= 18) break;
    tryAdd(c);
  }
}
for (const c of ranked) {
  if (picked.length >= 18) break;
  if (picked.includes(c)) continue;
  tryAdd(c);
}
console.error(`picked=${picked.length} depths=${picked.map((p) => p.depth).join(',')}`);
console.error(`gaps=${picked.map((p) => p.gap).join(',')} unlocks=${picked.map((p) => p.unlock).join(',')}`);
// host spread 0..5 round-robin (exact isomorphism: all constraints normal)
const hosts = [5, 0, 2, 4, 1, 3];
picked.forEach((c, i) => { c.host = hosts[i % hosts.length] as number; });
console.error(`hosts=${picked.map((p) => p.host).join(',')}`);
// fallback suggestion: best depth-11 by score
const fb = [...picked].filter((p) => p.depth === 11).sort((a, b) => score(a) - score(b));
console.error(`fallback suggestion: thermos-style ids cinnamon-11-${fb[0]?.seedIdx} backups cinnamon-11-${fb[1]?.seedIdx},cinnamon-10-${picked.find((p) => p.depth === 10)?.seedIdx}`);
if (outJsonl) {
  fs.writeFileSync(outJsonl, picked.map((p) => JSON.stringify(p)).join('\n'));
  console.error(`wrote ${outJsonl}`);
}
// emit TS with host-permuted slot order + role mapping
const roleOf = new Map<string, string>(PALETTE.map((t, i) => [t as string, `c${i}`]));
const entries = picked.map((p) => {
  // permute vessel indices so cinnamon host lands on p.host (swap contents)
  const cups = (p.cups as unknown as string[][]).map((c) => [...c]);
  const curHostIdx = HOST;
  if (p.host !== curHostIdx) {
    const tmp = cups[p.host] as string[];
    cups[p.host] = cups[curHostIdx] as string[];
    cups[curHostIdx] = tmp;
  }
  const roleCups = cups.map((cup) => cup.map((t) => roleOf.get(t) ?? t));
  const cupStr = JSON.stringify(roleCups).replace(/"c0"/g, "'c0'").replace(/"c1"/g, "'c1'").replace(/"c2"/g, "'c2'").replace(/"c3"/g, "'c3'");
  return `    { id: 'cinnamon-${p.depth}-${p.seedIdx}', kind: 'cinnamon', depth: ${p.depth}, cups: ${cupStr}, cinnamonHost: ${p.host} },`;
});
console.log(entries.join('\n'));
