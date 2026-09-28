/** Dev-only: curate depth-balanced 18-line banks preferring reloc>=2. */
import fs from 'node:fs';

function curate(src: string, out: string, want: Record<number, number>) {
  const text = fs.readFileSync(src, 'utf8');
  const lines = text.split('\n').filter((l) => l.trim().startsWith('{ id:'));
  const byDepth = new Map<number, { line: string; reloc: number }[]>();
  for (const l of lines) {
    const dm = l.match(/depth: (\d+)/);
    const rm = l.match(/reloc (\d+)/);
    if (!dm) continue;
    const d = parseInt(dm[1] as string, 10);
    const r = rm ? parseInt(rm[1] as string, 10) : 1;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)?.push({ line: l.trim(), reloc: r });
  }
  const picked: string[] = [];
  for (const d of Object.keys(want).map(Number).sort((a, b) => a - b)) {
    const pool = (byDepth.get(d) ?? []).sort((a, b) => b.reloc - a.reloc || 0);
    const n = want[d] as number;
    console.log(`depth ${d}: available ${pool.length} (reloc>=2: ${pool.filter((p) => p.reloc >= 2).length}), want ${n}`);
    const step = Math.max(1, Math.floor(pool.length / Math.max(1, n)));
    const sel: string[] = [];
    // First pass: spread across reloc-preferred order.
    for (let i = 0; i < pool.length && sel.length < n; i += 1) {
      const cand = pool[(i * step) % pool.length] as { line: string; reloc: number };
      if (!sel.includes(cand.line)) sel.push(cand.line);
    }
    for (const p of pool) {
      if (sel.length >= n) break;
      if (!sel.includes(p.line)) sel.push(p.line);
    }
    picked.push(...sel.slice(0, n));
  }
  fs.writeFileSync(out, picked.join('\n') + '\n');
  console.log(`wrote ${picked.length} lines to ${out}`);
}

const [src, out, spec] = process.argv.slice(2);
const want: Record<number, number> = {};
for (const p of (spec as string).split(',')) {
  const [d, n] = p.split(':');
  want[parseInt(d as string, 10)] = parseInt(n as string, 10);
}
curate(src as string, out as string, want);
