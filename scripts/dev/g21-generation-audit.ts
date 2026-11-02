/**
 * G21 production generation audit (DEV evidence).
 * L1–2000 full + deterministic L2001–10000 sample under Rollout V4.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGenerateStats, generateLevel } from '../../src/game/logic/generator.ts';
import { generateRequestForLevelConfig } from '../../src/game/logic/productionRequest.ts';
import { getLevelConfig, mechanicPlanForLevel } from '../../src/utils/difficultyCurve.ts';

type Plan = ReturnType<typeof mechanicPlanForLevel>;
const FLAGS = ['teapot','targets','sink','tasting','lemon','strainer','honey','frozen','thermos','cinnamon','teaBloom','blend','servingOrder','sharedTray','teaPair','steepingFlask'] as const;
function planKey(plan: Plan): string {
  const on = FLAGS.filter((f) => plan[f]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}
function pct(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] as number;
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
interface Row { level:number; phase:string; plan:string; minMoves:number; visited:number; genMs:number; fallback:boolean; attempts:number; solverCalls:number; error?:string; }
function run(level:number): Row {
  const cfg = getLevelConfig(level);
  const stats = createGenerateStats();
  const started = performance.now();
  try {
    const g = generateLevel(generateRequestForLevelConfig(cfg), `g21-rollout:${level}:0`, { stats });
    return { level, phase: cfg.phase, plan: planKey(mechanicPlanForLevel(level)), minMoves: g.minMoves, visited: g.visitedStates, genMs: Math.round((performance.now() - started) * 100) / 100, fallback: stats.usedFallback, attempts: stats.templateAttempts, solverCalls: stats.solverCalls };
  } catch (e) {
    return { level, phase: cfg.phase, plan: planKey(mechanicPlanForLevel(level)), minMoves: -1, visited: 0, genMs: Math.round((performance.now() - started) * 100) / 100, fallback: stats.usedFallback, attempts: stats.templateAttempts, solverCalls: stats.solverCalls, error: String(e) };
  }
}
function summarize(rows: Row[], label: string) {
  const byPhase = new Map<string, Row[]>(); const byPlan = new Map<string, Row[]>();
  for (const r of rows) {
    const p = byPhase.get(r.phase) ?? []; p.push(r); byPhase.set(r.phase, p);
    const q = byPlan.get(r.plan) ?? []; q.push(r); byPlan.set(r.plan, q);
  }
  const stat = (rs: Row[]) => ({
    n: rs.length,
    exceptions: rs.filter((r) => r.error).length,
    fallbacks: rs.filter((r) => r.fallback).length,
    minMoves: { p50: median(rs.map((r) => r.minMoves)), p95: pct(rs.map((r) => r.minMoves), 95), max: rs.length ? Math.max(...rs.map((r) => r.minMoves)) : null },
    genMs: { p50: median(rs.map((r) => r.genMs)), p95: pct(rs.map((r) => r.genMs), 95), max: rs.length ? Math.max(...rs.map((r) => r.genMs)) : null },
    visited: { p50: median(rs.map((r) => r.visited)), p95: pct(rs.map((r) => r.visited), 95), max: rs.length ? Math.max(...rs.map((r) => r.visited)) : null },
    attempts: { p50: median(rs.map((r) => r.attempts)), p95: pct(rs.map((r) => r.attempts), 95) },
    solverCalls: { p50: median(rs.map((r) => r.solverCalls)), p95: pct(rs.map((r) => r.solverCalls), 95) },
  });
  return {
    label,
    range: { from: rows[0]?.level, to: rows[rows.length - 1]?.level },
    n: rows.length,
    generated: rows.filter((r) => !r.error).length,
    exceptions: rows.filter((r) => r.error).length,
    fallbacks: rows.filter((r) => r.fallback).length,
    phases: Object.fromEntries([...byPhase].sort().map(([k, v]) => [k, stat(v)])),
    plans: Object.fromEntries([...byPlan].sort().map(([k, v]) => [k, stat(v)])),
  };
}
const t0 = performance.now();
const fullRows: Row[] = [];
for (let level = 1; level <= 2000; level++) {
  fullRows.push(run(level));
  if (level % 250 === 0) console.error(`[g21-gen] ${level}/2000 ${((performance.now() - t0) / 1000).toFixed(1)}s`);
}
const longSet = new Set<number>();
for (let level = 2001; level <= 10000; level += 7) longSet.add(level);
for (let i = 0; i < 28; i++) {
  for (let deck = 0; ; deck++) {
    const level = 782 + 112 * deck + 4 * i;
    if (level < 2001) continue;
    if (level > 10000) break;
    longSet.add(level);
    break;
  }
}
for (let m = 2000; m <= 10000; m += 500) for (let d = -2; d <= 2; d++) { const l = m + d; if (l >= 2001 && l <= 10000) longSet.add(l); }
for (let l = 9990; l <= 10000; l++) longSet.add(l);
const longRows = [...longSet].sort((a, b) => a - b).map(run);
const full = { gauntlet: 'G21', seedPolicy: 'g21-rollout:<level>:0', summary: summarize(fullRows, 'L1-2000'), rows: fullRows };
const long = { gauntlet: 'G21', seedPolicy: 'g21-rollout:<level>:0', summary: summarize(longRows, 'L2001-10000 sample'), sampleSize: longRows.length, rows: longRows };
const outDir = resolve(import.meta.dirname, 'out');
mkdirSync(dirname(resolve(outDir, 'x')), { recursive: true });
writeFileSync(resolve(outDir, 'g21-generation-1-2000.json'), `${JSON.stringify(full, null, 2)}\n`);
writeFileSync(resolve(outDir, 'g21-generation-long-range.json'), `${JSON.stringify(long, null, 2)}\n`);
console.log(JSON.stringify({ full: full.summary.generated, fullExceptions: full.summary.exceptions, fullFallbacks: full.summary.fallbacks, long: long.summary.generated, longExceptions: long.summary.exceptions, longFallbacks: long.summary.fallbacks, wall: Math.round((performance.now() - t0) / 1000) }, null, 2));
