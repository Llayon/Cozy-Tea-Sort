/** Curate best 18 per kind from emitted candidate JSONL. Usage: bun scripts/dev/strainer-curate.ts */
import { readFileSync } from 'node:fs';

interface Cand {
  kind: string;
  seed: number;
  depth: number;
  withVisited: number;
  woVisited: number;
  cups: string[][];
  teapot: number | null;
  catches: number;
  releases: number;
  firstUse: number | null;
}

function load(path: string): Cand[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Cand);
}

const SWEET: Record<string, [number, number]> = {
  A: [12, 15],
  B: [14, 18],
  C: [11, 14],
};

const KINDMAP: Record<string, string> = {
  A: 'strainer-challenge',
  B: 'strainer-mystery-peak',
  C: 'teapot-strainer-challenge',
};

for (const tag of ['A', 'B', 'C'] as const) {
  const pool = load(`candidates-${tag}.jsonl`);
  const [lo, hi] = SWEET[tag] as [number, number];
  const sweet = pool.filter((c) => c.depth >= lo && c.depth <= hi && c.catches === 1 && c.releases === 1);
  sweet.sort((a, b) => a.withVisited - b.withVisited || (a.firstUse ?? 99) - (b.firstUse ?? 99) || a.seed - b.seed);
  // Depth-spread pick: round-robin over depths present, then fill by rank.
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
      `{ id: '${id}', kind: '${KINDMAP[tag]}', depth: ${c.depth}, cups: ${cupsTs}, teapot: ${c.teapot === null ? 'null' : c.teapot}, expectedCatches: 1, visitedStates: ${c.withVisited} }, // seed ${c.seed} firstUse ${c.firstUse} woVisit ${c.woVisited}`,
    );
  }
}
