/** Curate best 18 per kind from emitted honey candidate JSONL. Usage: bun scripts/dev/honey-curate.ts */
import { readFileSync } from 'node:fs';

interface Cand {
  kind: string;
  seed: number;
  depth: number;
  withVisited: number;
  cups: string[][];
  honeyHost: number;
  teapot: number | null;
  stays: number;
  moves: number;
  firstMove: number | null;
}

function load(path: string): Cand[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Cand);
}

const SWEET: Record<string, [number, number]> = {
  A: [10, 13],
  B: [14, 17],
  C: [10, 13],
};

const KINDMAP: Record<string, string> = {
  A: 'honey-challenge',
  B: 'honey-mystery-peak',
  C: 'teapot-honey-challenge',
};

for (const tag of ['A', 'B', 'C'] as const) {
  const pool = load(`candidates-honey-${tag}.jsonl`);
  const [lo, hi] = SWEET[tag] as [number, number];
  // Prefer: sweet depth, exactly 1 honey move, few stays, early first move, low visited.
  const sweet = pool.filter(
    (c) => c.depth >= lo && c.depth <= hi && c.moves >= 1 && c.moves <= 2 && c.stays >= 1 && c.stays <= 5,
  );
  sweet.sort(
    (a, b) =>
      a.withVisited - b.withVisited ||
      a.moves - b.moves ||
      a.stays - b.stays ||
      (a.firstMove ?? 99) - (b.firstMove ?? 99) ||
      a.seed - b.seed,
  );
  const byDepth = new Map<number, Cand[]>();
  for (const c of sweet) {
    const arr = byDepth.get(c.depth) ?? [];
    arr.push(c);
    byDepth.set(c.depth, arr);
  }
  const depths = [...byDepth.keys()].sort((a, b) => a - b);
  const picked: Cand[] = [];
  const used = new Set<number>();
  while (picked.length < 18 && used.size < sweet.length) {
    for (const d of depths) {
      if (picked.length >= 18) break;
      const arr = byDepth.get(d) as Cand[];
      const nxt = arr.find((c) => !used.has(c.seed));
      if (nxt) {
        used.add(nxt.seed);
        picked.push(nxt);
      }
    }
    if (picked.length < 18 && used.size >= sweet.length) break;
  }
  picked.sort((a, b) => a.depth - b.depth || a.seed - b.seed);
  console.log(`\n--- ${tag} -> ${KINDMAP[tag]} picked ${picked.length}/${pool.length} (sweet ${lo}-${hi}) ---`);
  console.log(`depths: ${picked.map((c) => c.depth).join(',')}`);
  for (const c of picked) {
    const cupsTs = `[${c.cups.map((cup) => `[${cup.map((r) => `'${r}'`).join(', ')}]`).join(', ')}]`;
    const id = `${KINDMAP[tag]}-${c.depth}-${c.seed}`;
    console.log(
      `{ id: '${id}', kind: '${KINDMAP[tag]}', depth: ${c.depth}, cups: ${cupsTs}, honeyHost: ${c.honeyHost}, teapot: ${c.teapot === null ? 'null' : c.teapot} }, // seed ${c.seed} stays ${c.stays} moves ${c.moves} firstMove ${c.firstMove} visited ${c.withVisited}`,
    );
  }
}
