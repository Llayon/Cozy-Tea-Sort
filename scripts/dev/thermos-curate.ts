/**
 * OFFLINE thermos curation (G10 production, dev-only).
 * Samples T3 shaped deals via thermos-lib, selects 18 canonical-distinct L2
 * templates: L3 preferred, sweet depth, fifth before final quarter, delayed
 * drain, low visited. Emits TS bank to stdout + JSONL to stderr file optionally.
 * Usage: bun scripts/dev/thermos-curate.ts [shapedCount] [outJsonl]
 */
import * as fs from 'node:fs';
import {
  PALETTE,
  THERMOS_IDX,
  MAX_VISITED,
  MAX_DEPTH,
  thermosConstraints,
  cap4ControlConstraints,
  makeShapedDeal,
  analyzeThermosTrace,
} from './thermos-lib.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { emptyFloatingIngredients } from '../../src/game/types.ts';
import type { SolverAction } from '../../src/game/types.ts';

const shapedTarget = Number(process.argv[2] ?? 1500);
const outJsonl = process.argv[3] ?? '';

const cons = thermosConstraints();
const consCap4 = cap4ControlConstraints();

interface Cand {
  seedIdx: number;
  depth: number;
  visited: number;
  cups: string[][]; // concrete teas
  thermos: number;
  fifth: number | null;
  drain: number | null;
  isL3: boolean;
  cap4min?: number;
  key: string;
}

const cands: Cand[] = [];
const seenKeys = new Set<string>();
let shaped = 0, solv = 0;
for (let s = 0; s < shapedTarget; s++) {
  const { cups } = makeShapedDeal('T3', s + 100000); // offset to avoid overlap with feasibility 0..2499
  shaped++;
  const r = solvePuzzle(cups, { cupConstraints: cons, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (!r.solvable || r.truncated || !r.solution || r.minMoves === undefined) continue;
  solv++;
  const trace = analyzeThermosTrace(cups, r.solution as SolverAction[], cons);
  if (!(trace.fifthSlotUses >= 1 && trace.drainsAfterFifth >= 1 && trace.finalThermosEmpty && trace.win)) continue;
  const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, cons);
  if (seenKeys.has(key)) continue;
  seenKeys.add(key);
  // cap4 L3 check
  const rc = solvePuzzle(cups, { cupConstraints: consCap4, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  let isL3 = false;
  let cap4min: number | undefined;
  if (!rc.truncated) {
    if (!rc.solvable) isL3 = true;
    else if (rc.minMoves !== undefined && rc.minMoves > (r.minMoves as number)) { isL3 = true; cap4min = rc.minMoves; }
    else if (rc.minMoves !== undefined) cap4min = rc.minMoves;
  }
  cands.push({
    seedIdx: s + 100000, depth: r.minMoves, visited: r.visitedStates,
    cups: cups as unknown as string[][], thermos: THERMOS_IDX,
    fifth: trace.firstFifthSlotDepth, drain: trace.firstDrainAfterFifthDepth,
    isL3, cap4min, key,
  });
  if (cands.length % 50 === 0) console.error(`shaped=${shaped} solv=${solv} L2distinct=${cands.length} L3=${cands.filter(c=>c.isL3).length}`);
}
console.error(`done shaped=${shaped} solv=${solv} L2distinct=${cands.length} L3=${cands.filter(c=>c.isL3).length}`);
const depthHist: Record<string, number> = {};
for (const c of cands) depthHist[String(c.depth)] = (depthHist[String(c.depth)] ?? 0) + 1;
console.error(`L2depthHist=${JSON.stringify(depthHist)}`);

// Derive bands: accept 8-14 (observed 4-14 but 8-14 covers bulk, matches frozen accept width)
const ACCEPT = { min: 8, max: 14 };
const SWEET = { min: 10, max: 12 };
const inBand = cands.filter(c => c.depth >= ACCEPT.min && c.depth <= ACCEPT.max);
console.error(`inBand ${ACCEPT.min}-${ACCEPT.max}: ${inBand.length}`);

// Score: L3 first, sweet depth, fifth before final quarter, delayed drain, low visited
function score(c: Cand): number {
  let s = 0;
  if (!c.isL3) s += 5;
  const center = 11;
  s += Math.abs(c.depth - center) * 0.5;
  if (c.depth < SWEET.min || c.depth > SWEET.max) s += 1.5;
  if (c.fifth !== null && c.depth > 0 && (c.fifth / c.depth) > 0.75) s += 3;
  if (c.fifth !== null && c.drain !== null) {
    const gap = (c.drain as number) - (c.fifth as number);
    if (gap === 1) s += 2; // immediate undo discouraged
    else if (gap >= 3) s -= 0.5; // delayed unpacking preferred
  } else s += 2;
  if (c.fifth === 0) s += 2;
  s += c.visited / 3000;
  return s;
}
const ranked = [...inBand].sort((a,b)=>score(a)-score(b));
// Quotas for depth spread: aim 2x9, 4x10, 6x11, 4x12, 2x13 (like frozen, but from data)
const quotas: Array<{depth:number;count:number}> = [
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
// Ensure at least 6 L3: first pick best L3 across depths
const l3ranked = ranked.filter(c=>c.isL3);
for (const c of l3ranked) {
  if (picked.length >= 6) break;
  // respect quotas loosely
  const dCount = picked.filter(p=>p.depth===c.depth).length;
  const quota = quotas.find(q=>q.depth===c.depth)?.count ?? 3;
  if (dCount >= quota) continue;
  tryAdd(c);
}
for (const q of quotas) {
  const pool = ranked.filter(c=>c.depth===q.depth && !picked.includes(c));
  for (const c of pool) {
    if (picked.filter(p=>p.depth===q.depth).length >= q.count) break;
    if (picked.length >= 18) break;
    tryAdd(c);
  }
}
for (const c of ranked) {
  if (picked.length >= 18) break;
  if (picked.includes(c)) continue;
  tryAdd(c);
}
console.error(`picked=${picked.length} L3=${picked.filter(p=>p.isL3).length} depths=${picked.map(p=>p.depth).join(',')}`);
if (outJsonl) {
  fs.writeFileSync(outJsonl, picked.map(p=>JSON.stringify(p)).join('\n'));
  console.error(`wrote ${outJsonl}`);
}
// Emit TS: relativize concrete teas to roles c0..c3 via PALETTE order
const roleOf = new Map<string,string>(PALETTE.map((t,i)=>[t as string, `c${i}`]));
const entries = picked.map(p=>{
  const roleCups = (p.cups as unknown as string[][]).map(cup=>cup.map(t=>roleOf.get(t) ?? t));
  const cupStr = JSON.stringify(roleCups).replace(/"c0"/g,"'c0'").replace(/"c1"/g,"'c1'").replace(/"c2"/g,"'c2'").replace(/"c3"/g,"'c3'");
  return `    { id: 'thermos-${p.depth}-${p.seedIdx}', kind: 'thermos', depth: ${p.depth}, cups: ${cupStr}, thermosIndex: ${p.thermos} },`;
});
console.log(entries.join('\n'));
