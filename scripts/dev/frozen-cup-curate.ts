/**
 * OFFLINE frozen-cup curation (Gauntlet 9 production, dev-only).
 * Reads L2 JSONL from frozen-cup-search.ts (EMIT_JSONL) and selects 18
 * canonical-distinct templates: sweet depth 10–12 preferred, acceptance
 * 8–14 required, mixed melt timing (some move-1, mostly delayed), low
 * visited, spread frozen-host slots. Emits the TS bank to stdout.
 * Usage: bun scripts/dev/frozen-cup-curate.ts <input.jsonl>
 */
import * as fs from 'node:fs';

interface Cand {
  seed: number;
  depth: number;
  withVisited: number;
  cups: string[][];
  frozenHost: number;
  melts: number;
  uses: number;
  deep: number;
  firstMelt: number;
  firstUse: number;
  firstDeep: number;
}

const ACCEPT = { min: 8, max: 14 };
const SWEET = { min: 10, max: 12 };

function score(c: Cand): number {
  const center = 11;
  let s = Math.abs(c.depth - center);
  if (c.depth < SWEET.min || c.depth > SWEET.max) s += 1.5;
  s += c.withVisited / 2000;
  // Prefer delayed melts slightly (planning), but keep move-1 represented
  // via the quota below rather than the score.
  if (c.firstMelt === 0) s += 0.4;
  // Prefer melt before the final quarter.
  if (c.firstMelt / Math.max(1, c.depth) > 0.75) s += 2;
  return s;
}

async function main(path: string) {
  const lines = fs.readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  const all = lines.map((l) => JSON.parse(l) as Cand);
  const inBand = all.filter((c) => c.depth >= ACCEPT.min && c.depth <= ACCEPT.max);
  console.error(`input=${all.length} inBand=${inBand.length}`);
  const ranked = [...inBand].sort((a, b) => score(a) - score(b));
  const immediate = ranked.filter((c) => c.firstMelt === 0);
  const delayed = ranked.filter((c) => c.firstMelt > 0);
  console.error(`immediate=${immediate.length} delayed=${delayed.length}`);
  const picked: Cand[] = [];
  const seenPatterns = new Set<string>();
  const hostCount = new Map<number, number>();
  const tryAdd = (c: Cand): boolean => {
    const pattern = JSON.stringify(c.cups);
    if (seenPatterns.has(pattern)) return false;
    seenPatterns.add(pattern);
    hostCount.set(c.frozenHost, (hostCount.get(c.frozenHost) ?? 0) + 1);
    picked.push(c);
    return true;
  };
  // Depth-band quotas for a real difficulty spread (sweet 10–12 core).
  const quotas: Array<{ depth: number; count: number; immediate: number }> = [
    { depth: 9, count: 2, immediate: 1 },
    { depth: 10, count: 4, immediate: 1 },
    { depth: 11, count: 6, immediate: 2 },
    { depth: 12, count: 4, immediate: 1 },
    { depth: 13, count: 2, immediate: 0 },
  ];
  for (const q of quotas) {
    const pool = ranked.filter((c) => c.depth === q.depth);
    const taken = new Set<Cand>();
    for (const c of pool.filter((c) => c.firstMelt === 0)) {
      if (picked.filter((p) => p.depth === q.depth && p.firstMelt === 0).length >= q.immediate) break;
      if (tryAdd(c)) taken.add(c);
    }
    for (const c of pool) {
      if (taken.has(c)) continue;
      if (picked.filter((p) => p.depth === q.depth).length >= q.count) break;
      tryAdd(c);
    }
  }
  // Host spread repair + fill from global ranking (pattern-distinct).
  for (const c of ranked) {
    if (picked.length >= 18) break;
    tryAdd(c);
  }
  console.error(`picked=${picked.length} hosts=${[...hostCount.entries()].map(([h, n]) => `${h}:${n}`).join(' ')}`);
  console.error(`depths=${picked.map((p) => p.depth).join(',')}`);
  console.error(`firstMelts=${picked.map((p) => p.firstMelt).join(',')}`);
  const entries = picked.map(
    (c) =>
      `    { id: 'frozen-cup-${c.depth}-${c.seed}', kind: 'frozen-cup', depth: ${c.depth}, cups: ${JSON.stringify(c.cups).replace(/"c0"/g, "'c0'").replace(/"c1"/g, "'c1'").replace(/"c2"/g, "'c2'").replace(/"c3"/g, "'c3'")}, frozenHost: ${c.frozenHost} },`,
  );
  console.log(entries.join('\n'));
}

const [path = ''] = process.argv.slice(2);
if (!path) {
  console.error('usage: bun scripts/dev/frozen-cup-curate.ts <input.jsonl>');
  process.exit(1);
}
await main(path);
