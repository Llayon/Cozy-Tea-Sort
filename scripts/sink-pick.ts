/** Dev-only: pick a depth-balanced subset of sink-challenge templates from search output. */
import fs from 'node:fs';

const src = process.argv[2] as string;
const out = process.argv[3] as string;
// want: depth -> count, e.g. "7:4,8:5,9:5,10:4"
const want = new Map<number, number>(
  (process.argv[4] as string).split(',').map((p) => {
    const [d, n] = p.split(':');
    return [parseInt(d as string, 10), parseInt(n as string, 10)] as [number, number];
  }),
);
const text = fs.readFileSync(src, 'utf8');
const lines = text.split('\n').filter((l) => l.includes("{ id: 'sink-challenge:"));
const byDepth = new Map<number, string[]>();
for (const l of lines) {
  const m = l.match(/depth: (\d+)/);
  if (!m) continue;
  const d = parseInt(m[1] as string, 10);
  if (!byDepth.has(d)) byDepth.set(d, []);
  byDepth.get(d)?.push(l.trim());
}
const picked: string[] = [];
for (const [d, n] of [...want.entries()].sort((a, b) => a[0] - b[0])) {
  const pool = byDepth.get(d) ?? [];
  console.log(`depth ${d}: available ${pool.length}, want ${n}`);
  // Spread picks across seed order for topological variety.
  const step = Math.max(1, Math.floor(pool.length / (n as number)));
  let idx = 0;
  for (let i = 0; i < (n as number) && idx < pool.length; i++, idx += step) {
    picked.push(pool[idx] as string);
  }
  // Fill shortfall sequentially.
  for (let i = 0; picked.filter((p) => p.includes(`depth: ${d},`)).length < (n as number) && i < pool.length; i++) {
    const cand = pool[i] as string;
    if (!picked.includes(cand)) picked.push(cand);
  }
}
const renamed = picked.map((l) => {
  const m = l.match(/id: 'sink-challenge:(\d+)'.*depth: (\d+)/);
  return (l as string)
    .replace(/id: 'sink-challenge:\d+'/, `id: 'sc-${m?.[2]}-${m?.[1]}'`)
    .replace(/^(\{)/, '    $1');
});
fs.writeFileSync(out, renamed.join('\n') + '\n');
console.log(`wrote ${renamed.length} lines to ${out}`);
