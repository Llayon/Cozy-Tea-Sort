/** Dev-only: trim a bank file to a depth-balanced subset (keeps file format). */
import fs from 'node:fs';

const src = process.argv[2] as string;
const out = process.argv[3] as string;
const want = new Map<number, number>(
  (process.argv[4] as string).split(',').map((p) => {
    const [d, n] = p.split(':');
    return [parseInt(d as string, 10), parseInt(n as string, 10)] as [number, number];
  }),
);
const lines = fs.readFileSync(src, 'utf8').split('\n').filter((l) => l.trim().startsWith('{'));
const byDepth = new Map<number, string[]>();
for (const l of lines) {
  const m = l.match(/depth: (\d+)/);
  if (!m) continue;
  const d = parseInt(m[1] as string, 10);
  if (!byDepth.has(d)) byDepth.set(d, []);
  byDepth.get(d)?.push(l);
}
const picked: string[] = [];
for (const [d, n] of [...want.entries()].sort((a, b) => a[0] - b[0])) {
  const pool = byDepth.get(d) ?? [];
  console.log(`depth ${d}: available ${pool.length}, want ${n}`);
  const step = Math.max(1, Math.floor(pool.length / (n as number)));
  let idx = 0;
  for (let i = 0; i < (n as number) && idx < pool.length; i++, idx += step) {
    picked.push(pool[idx] as string);
  }
  for (let i = 0; picked.filter((p) => p.includes(`depth: ${d},`)).length < (n as number) && i < pool.length; i++) {
    const cand = pool[i] as string;
    if (!picked.includes(cand)) picked.push(cand);
  }
}
fs.writeFileSync(out, picked.join('\n') + '\n');
console.log(`wrote ${picked.length} lines to ${out}`);
