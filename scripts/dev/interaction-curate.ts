/** Curate 18 L2 bank templates from emitted interaction candidates. Usage: bun scripts/dev/interaction-curate.ts */
import { readFileSync } from 'node:fs';
import { canonicalPuzzleKey } from '../../src/game/logic/rules';
import type { CupConstraint, TeaId } from '../../src/game/types';

interface Cand {
  seed: number;
  depth: number;
  withVisited: number;
  cups: TeaId[][];
  lemonHost: number;
  honeyHost: number;
  lemonMoves: number;
  honeyStays: number;
  honeyMoves: number;
  cohostStates: number;
  splitEvents: number;
  jointMoveEvents: number;
  firstCohost: number | null;
  firstSplit: number | null;
}

type Role = 'c0' | 'c1' | 'c2' | 'c3';

function relativize(cups: TeaId[][]): Role[][] {
  return cups.map((cup) =>
    cup.map((t) => {
      if (t === 'buckwheat') return 'c0';
      if (t === 'sea_buckthorn') return 'c1';
      if (t === 'karkade') return 'c2';
      return 'c3';
    }),
  );
}

// Gate palette was fixed: ['matcha','sea_buckthorn','karkade','buckwheat'].
// Canonicalize role names via sorted non-target teas so tea-name swaps do
// not count as topology diversity (production c2/c3 permute freely).
function canonicalRoles(cups: TeaId[][]): string[][] {
  const others = [...new Set(cups.flat().filter((t) => t !== 'buckwheat' && t !== 'sea_buckthorn'))].sort();
  return cups.map((cup) =>
    cup.map((t) => {
      if (t === 'buckwheat') return 'c0';
      if (t === 'sea_buckthorn') return 'c1';
      return `c${others.indexOf(t) + 2}`;
    }),
  );
}

const rows = readFileSync('candidates-interaction.jsonl', 'utf8')
  .split('\n')
  .filter((l) => l.trim().length > 0)
  .map((l) => JSON.parse(l) as Cand);

const cons6: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));

interface Pick extends Cand {
  roles: Role[][];
  ckey: string;
}

const pool: Pick[] = [];
const seen = new Set<string>();
for (const r of rows) {
  const roles = canonicalRoles(r.cups) as Role[][];
  const floating = roles.map((_, i) => (i === r.lemonHost ? ('lemon' as const) : null));
  const sinking = roles.map((_, i) => (i === r.honeyHost ? ('honey' as const) : null));
  const key = canonicalPuzzleKey(
    { cups: roles as unknown as TeaId[][], floatingIngredients: floating, sinkingIngredients: sinking },
    cons6,
  );
  if (seen.has(key)) continue;
  seen.add(key);
  pool.push({ ...r, roles, ckey: key });
}

console.log(`pool: ${rows.length} rows -> ${pool.length} canonical-distinct`);

// Bank filters: sweet depth 10-14, honey moves 1-2, stays 1-5 (clarity).
const SWEET: [number, number] = [10, 14];
const sweet = pool.filter(
  (c) => c.depth >= SWEET[0] && c.depth <= SWEET[1] && c.honeyMoves >= 1 && c.honeyMoves <= 2 && c.honeyStays >= 1 && c.honeyStays <= 5,
);
console.log(`sweet+clear: ${sweet.length}`);
const l3pool = sweet
  .filter((c) => c.jointMoveEvents >= 1)
  .sort((a, b) => a.withVisited - b.withVisited || a.seed - b.seed);
console.log(`L3 eligible: ${l3pool.length} (depths ${l3pool.map((c) => c.depth).join(',')})`);

const picked: Pick[] = [];
const used = new Set<number>();
for (const c of l3pool.slice(0, 7)) {
  used.add(c.seed);
  picked.push(c);
}
// Fill with L2-only, round-robin over depths for spread.
const rest = sweet
  .filter((c) => !used.has(c.seed))
  .sort((a, b) => a.withVisited - b.withVisited || a.seed - b.seed);
const byDepth = new Map<number, Pick[]>();
for (const c of rest) {
  const arr = byDepth.get(c.depth) ?? [];
  arr.push(c);
  byDepth.set(c.depth, arr);
}
const depths = [...byDepth.keys()].sort((a, b) => a - b);
while (picked.length < 18) {
  let progressed = false;
  for (const d of depths) {
    if (picked.length >= 18) break;
    const arr = byDepth.get(d) as Pick[];
    const nxt = arr.find((c) => !used.has(c.seed));
    if (nxt) {
      used.add(nxt.seed);
      picked.push(nxt);
      progressed = true;
    }
  }
  if (!progressed) break;
}
picked.sort((a, b) => a.depth - b.depth || a.seed - b.seed);
const l3count = picked.filter((c) => c.jointMoveEvents >= 1).length;
console.log(`\n--- picked ${picked.length} (L3 ${l3count}) ---`);
console.log(`depths: ${picked.map((c) => c.depth).join(',')}`);
for (const c of picked) {
  const cupsTs = `[${c.roles.map((cup) => `[${cup.map((r) => `'${r}'`).join(', ')}]`).join(', ')}]`;
  console.log(
    `{ id: 'lemon-honey-${c.depth}-${c.seed}', kind: 'lemon-honey-interaction', depth: ${c.depth}, cups: ${cupsTs}, lemonHost: ${c.lemonHost}, honeyHost: ${c.honeyHost} }, // seed ${c.seed} lemonMoves? stays ${c.honeyStays} moves ${c.honeyMoves} splits ${c.splitEvents} joint ${c.jointMoveEvents} firstSplit ${c.firstSplit} visited ${c.withVisited}`,
  );
}
void relativize;
