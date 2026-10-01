/**
 * OFFLINE catch-one TIGHT-topology feasibility search (Gauntlet 6 gate).
 * Topologies: A=4c/5v/1e plain, B=5c/6v/1e (+mystery assignable), C=4c/5v/1e teapot.
 * Usage: bun scripts/dev/strainer-catch-search.ts [A|B|C|all] [numSeeds] [startSeed]
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle } from '../../src/game/logic/solver';
import { canonicalPuzzleKey, isPuzzleWonState } from '../../src/game/logic/rules';
import { selectMysteryCup } from '../../src/game/logic/generator';
import type { CupConstraint, TeaId } from '../../src/game/types';

const PAL4: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const PAL5: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'];

interface Cfg {
  key: string;
  numColors: number;
  palette: TeaId[];
  totalVessels: number;
  hasTeapot: boolean;
  checkMysteryAssignable: boolean;
}

const CFGS: Record<string, Cfg> = {
  A: { key: 'A', numColors: 4, palette: PAL4, totalVessels: 5, hasTeapot: false, checkMysteryAssignable: false },
  B: { key: 'B', numColors: 5, palette: PAL5, totalVessels: 6, hasTeapot: false, checkMysteryAssignable: true },
  C: { key: 'C', numColors: 4, palette: PAL4, totalVessels: 5, hasTeapot: true, checkMysteryAssignable: false },
};

function isMixedFull(cup: TeaId[]): boolean {
  return cup.length === 4 && cup.some((t) => t !== cup[0]);
}

function dealOne(rng: () => number, cfg: Cfg): { cups: TeaId[][]; constraints: CupConstraint[] } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < cfg.numColors; c++) for (let k = 0; k < 4; k++) pool.push(cfg.palette[c] as TeaId);
  shuffleInPlace(rng, pool);
  const filled = cfg.totalVessels - 1;
  const cups: TeaId[][] = [];
  for (let c = 0; c < filled; c++) cups.push(pool.slice(c * 4, c * 4 + 4));
  cups.push([]);
  shuffleInPlace(rng, cups);
  const cons: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));
  if (cfg.hasTeapot) {
    const mixed: number[] = [];
    cups.forEach((cup, i) => {
      if (cup.length === 4 && isMixedFull(cup)) mixed.push(i);
    });
    if (mixed.length === 0) return null;
    const chosen = mixed[Math.floor(rng() * mixed.length)] as number;
    if (chosen !== 0) {
      const t = cups[0] as TeaId[];
      cups[0] = cups[chosen] as TeaId[];
      cups[chosen] = t;
    }
    cons[0] = { mode: 'source-only' };
  }
  return { cups, constraints: cons };
}

function analyzeSolution(sol: Array<{ kind: string; strained?: boolean }>): {
  hasStrained: boolean;
  hasRelease: boolean;
  catches: number;
  releases: number;
  firstUseDepth: number | null;
} {
  let catches = 0;
  let releases = 0;
  let first: number | null = null;
  sol.forEach((s, i) => {
    if (s.kind === 'pour' && (s as { strained?: boolean }).strained) {
      catches++;
      if (first === null) first = i;
    }
    if (s.kind === 'release-strainer') releases++;
  });
  return { hasStrained: catches > 0, hasRelease: releases > 0, catches, releases, firstUseDepth: first };
}

async function runCfg(cfgKey: string, numSeeds: number, startSeed: number) {
  const cfg = CFGS[cfgKey] as Cfg;
  let solvW = 0;
  let solvWO = 0;
  let rescued = 0;
  let strict = 0;
  let meaningful = 0;
  let strong = 0;
  let truncW = 0;
  const withTimes: number[] = [];
  const woTimes: number[] = [];
  const withVisited: number[] = [];
  const woVisited: number[] = [];
  const mult: number[] = [];
  const depthHist = new Map<number, number>();
  const catchHist = new Map<number, number>();
  const relHist = new Map<number, number>();
  const firstUse: number[] = [];
  const distinct = new Map<string, { seed: number; withD: number; woD: number | null; rescued: boolean }>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    const rng = createRng(`catchgate:${cfgKey}:${s}`);
    const deal = dealOne(rng, cfg);
    if (!deal) continue;
    const { cups, constraints } = deal;
    const stand = { present: true, attachedCupIndex: null, heldTea: null };
    if (isPuzzleWonState({ cups, floatingIngredients: cups.map(() => null), strainer: stand }, constraints)) continue;
    if (cfg.checkMysteryAssignable) {
      const midx = selectMysteryCup(
        cups,
        (cands) => cands[Math.floor(rng() * cands.length)] ?? null,
        constraints,
      );
      if (midx === null) continue;
    }
    const tA = Date.now();
    const wo = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints });
    woTimes.push(Date.now() - tA);
    woVisited.push(wo.visitedStates);
    const tB = Date.now();
    const w = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints, strainer: stand });
    withTimes.push(Date.now() - tB);
    withVisited.push(w.visitedStates);
    if (w.truncated) truncW++;
    const woS = wo.solvable && !wo.truncated;
    const wS = w.solvable && !w.truncated;
    if (woS) solvWO++;
    if (wS) solvW++;
    if (woS && wS && wo.minMoves !== undefined && w.minMoves !== undefined) {
      mult.push(w.visitedStates / Math.max(1, wo.visitedStates));
      if (w.minMoves < wo.minMoves) strict++;
    }
    if (!woS && !wo.truncated && wS) rescued++;
    if (wS) {
      const sol = (w.solution ?? []) as Array<{ kind: string; strained?: boolean }>;
      const az = analyzeSolution(sol);
      if (az.hasStrained && az.hasRelease) {
        meaningful++;
        depthHist.set(w.minMoves as number, (depthHist.get(w.minMoves as number) ?? 0) + 1);
        catchHist.set(az.catches, (catchHist.get(az.catches) ?? 0) + 1);
        relHist.set(az.releases, (relHist.get(az.releases) ?? 0) + 1);
        if (az.firstUseDepth !== null) firstUse.push(az.firstUseDepth);
        const isStrong =
          (!woS && !wo.truncated) ||
          (woS && w.minMoves !== undefined && wo.minMoves !== undefined && w.minMoves < wo.minMoves);
        if (isStrong) {
          strong++;
          const key = canonicalPuzzleKey(
            { cups, floatingIngredients: cups.map(() => null), strainer: stand },
            constraints,
          );
          if (!distinct.has(key)) {
            distinct.set(key, {
              seed: s,
              withD: w.minMoves as number,
              woD: woS ? (wo.minMoves as number) : null,
              rescued: !woS && !wo.truncated,
            });
          }
          if (EMIT_JSONL && distinct.has(key)) {
            const fs = await import('node:fs');
            const sol = (w.solution ?? []) as Array<{ kind: string; strained?: boolean }>;
            const az2 = analyzeSolution(sol);
            fs.appendFileSync(
              EMIT_JSONL,
              JSON.stringify({
                kind: cfgKey,
                seed: s,
                depth: w.minMoves,
                withVisited: w.visitedStates,
                woVisited: wo.visitedStates,
                cups: relativize(cups, cfg.palette),
                teapot: cfg.hasTeapot ? 0 : null,
                catches: az2.catches,
                releases: az2.releases,
                firstUse: az2.firstUseDepth,
              }) + '\n',
            );
          }
        }
      }
    }
    if ((s - startSeed + 1) % 250 === 0) {
      console.log(`[${cfgKey}] ${s - startSeed + 1}/${numSeeds} W=${solvW} WO=${solvWO} resc=${rescued} strict=${strict} mean=${meaningful} strong=${strong} distinct=${distinct.size}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const pct = (a: number[], p: number): number => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
  };
  const avg = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const n = numSeeds;
  console.log(`\n== ${cfgKey} done in ${dt}s (n=${n}) ==`);
  console.log(`solvableWith=${solvW} (${((solvW / n) * 100).toFixed(1)}%) solvableWithout=${solvWO} (${((solvWO / n) * 100).toFixed(1)}%) truncatedWith=${truncW}`);
  console.log(`rescued=${rescued} (${((rescued / n) * 100).toFixed(1)}%) strictlyShorter=${strict} (${((strict / n) * 100).toFixed(1)}%) meaningfulOptimal=${meaningful} (${((meaningful / n) * 100).toFixed(1)}%)`);
  console.log(`strong=${strong} canonicalDistinctStrong=${distinct.size}`);
  console.log(`depthHist(with): ${[...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`catchesHist: ${[...catchHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`releasesHist: ${[...relHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`firstUseDepth p50=${pct(firstUse, 50)} p95=${pct(firstUse, 95)} max=${firstUse.length ? Math.max(...firstUse) : 0}`);
  console.log(`solveTimeMs with p50=${pct(withTimes, 50)} p95=${pct(withTimes, 95)} max=${withTimes.length ? Math.max(...withTimes) : 0} | without p50=${pct(woTimes, 50)} p95=${pct(woTimes, 95)} max=${woTimes.length ? Math.max(...woTimes) : 0}`);
  console.log(`visited with p50=${pct(withVisited, 50)} p95=${pct(withVisited, 95)} max=${withVisited.length ? Math.max(...withVisited) : 0} | without p50=${pct(woVisited, 50)} p95=${pct(woVisited, 95)}`);
  console.log(`visitedMult(with/without) avg=${avg(mult).toFixed(2)} p50=${pct(mult, 50).toFixed(2)} p95=${pct(mult, 95).toFixed(2)} max=${mult.length ? Math.max(...mult).toFixed(2) : 0}`);
  const ex = [...distinct.values()].slice(0, 5);
  for (const v of ex) console.log(`  strong seed=${v.seed} with=${v.withD} without=${v.woD === null ? 'UNSOLV' : v.woD} rescued=${v.rescued}`);
}

const EMIT_JSONL = process.env.EMIT_JSONL ?? '';

function relativize(cups: TeaId[][], palette: TeaId[]): string[][] {
  return cups.map((cup) => cup.map((t) => `c${palette.indexOf(t)}`));
}

const [arg = 'all', numArg = '1000', startArg = '0'] = process.argv.slice(2);
const numSeeds = parseInt(numArg, 10);
const startSeed = parseInt(startArg, 10);
const keys = arg === 'all' ? Object.keys(CFGS) : [arg];
for (const k of keys) {
  if (!CFGS[k]) {
    console.error(`unknown config ${k}`);
    process.exit(1);
  }
  await runCfg(k, numSeeds, startSeed);
}
