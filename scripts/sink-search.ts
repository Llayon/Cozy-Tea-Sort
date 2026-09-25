/**
 * OFFLINE sink template discovery (Gauntlet 3 §22, dev-only, never shipped
 * to production runtime).
 *
 * Uses the PRODUCTION rules/solver/canonicalKey/difficulty bands to find
 * high-quality sink puzzles, then relativizes them to palette roles
 * (c0..c4) for the committed bank. Also performs the §26 fairness
 * analysis (root branching: legal/solvable/optimal/fatal/sink-directed
 * first moves) for curation (§27).
 *
 * Usage:
 *   bun scripts/sink-search.ts [config] [numSeeds] [startSeed]
 *   config: sink-challenge | sink-mystery-peak | teapot-sink-challenge | all
 */
import { createRng, shuffleInPlace } from '../src/game/logic/rng';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  applyPour,
  canonicalKey,
  isWonState,
  listLegalMoves,
} from '../src/game/logic/rules';
import { depthAccepted, depthInTarget } from '../src/game/logic/difficulty';
import { selectMysteryCup } from '../src/game/logic/generator';
import { MAX_CUP_CAPACITY, type CupConstraint, type TeaId } from '../src/game/types';

const PALETTE_4: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const PALETTE_5: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'];

interface Config {
  kind: string;
  numColors: number;
  palette: TeaId[];
  emptyCups: number;
  hasMystery: boolean;
  hasTeapot: boolean;
  phase: 'challenge' | 'peak';
}

const CONFIGS: Record<string, Config> = {
  'sink-challenge': { kind: 'sink-challenge', numColors: 4, palette: PALETTE_4, emptyCups: 2, hasMystery: false, hasTeapot: false, phase: 'challenge' },
  'sink-mystery-peak': { kind: 'sink-mystery-peak', numColors: 5, palette: PALETTE_5, emptyCups: 2, hasMystery: true, hasTeapot: false, phase: 'peak' },
  'teapot-sink-challenge': { kind: 'teapot-sink-challenge', numColors: 4, palette: PALETTE_4, emptyCups: 2, hasMystery: false, hasTeapot: true, phase: 'challenge' },
};

function isMixedFullCup(cup: TeaId[]): boolean {
  if (cup.length !== MAX_CUP_CAPACITY) return false;
  return cup.some((t) => t !== cup[0]);
}

/** Replicates production dealCandidate + sink placement for search. */
function dealOne(rng: () => number, cfg: Config): { cups: TeaId[][]; constraints: CupConstraint[]; hiddenCounts: number[] } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < cfg.numColors; c++) {
    for (let k = 0; k < MAX_CUP_CAPACITY; k++) pool.push(cfg.palette[c] as TeaId);
  }
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [];
  for (let c = 0; c < cfg.numColors; c++) cups.push(pool.slice(c * MAX_CUP_CAPACITY, (c + 1) * MAX_CUP_CAPACITY));
  for (let e = 0; e < cfg.emptyCups; e++) cups.push([]);
  shuffleInPlace(rng, cups);

  const constraints: CupConstraint[] = cups.map(() => ({ mode: 'normal' as const }));

  if (cfg.hasTeapot) {
    const mixed: number[] = [];
    cups.forEach((cup, i) => { if (cup.length > 0 && isMixedFullCup(cup)) mixed.push(i); });
    if (mixed.length === 0) return null;
    const chosen = mixed[Math.floor(rng() * mixed.length)] as number;
    if (chosen !== 0) {
      const t = cups[0] as TeaId[]; cups[0] = cups[chosen] as TeaId[]; cups[chosen] = t;
    }
    constraints[0] = { mode: 'source-only' };
  }

  // Sink: swap an empty slot to last, mark sink-only.
  const last = cups.length - 1;
  const emptySlots: number[] = [];
  cups.forEach((cup, i) => { if (cup.length === 0 && constraints[i]?.mode === 'normal') emptySlots.push(i); });
  if (emptySlots.length === 0) return null;
  if (!emptySlots.includes(last)) {
    const slot = emptySlots[Math.floor(rng() * emptySlots.length)] as number;
    const t = cups[last] as TeaId[]; cups[last] = cups[slot] as TeaId[]; cups[slot] = t;
    const tc = constraints[last] as CupConstraint; constraints[last] = constraints[slot] as CupConstraint; constraints[slot] = tc;
  }
  constraints[last] = { mode: 'sink-only' };
  cups[last] = [];

  const hiddenCounts = cups.map(() => 0);
  if (cfg.hasMystery) {
    const idx = selectMysteryCup(cups, (cands) => {
      const at = Math.floor(rng() * cands.length);
      return cands[at] ?? null;
    }, constraints);
    if (idx === null) return null;
    hiddenCounts[idx] = 1;
  }
  return { cups, constraints, hiddenCounts };
}

export interface Fairness {
  legal: number;
  solvable: number;
  optimal: number;
  fatal: number;
  sinkDirected: number;
  sinkDirectedSolvable: number;
}

export function analyzeFairness(cups: TeaId[][], constraints: readonly CupConstraint[], parentMin: number): Fairness {
  const sinkIdx = constraints.findIndex((c) => c.mode === 'sink-only');
  const moves = listLegalMoves(cups, true, constraints);
  let solvable = 0, optimal = 0, fatal = 0, sinkD = 0, sinkDS = 0;
  for (const m of moves) {
    const res = applyPour(cups, m.from, m.to, constraints);
    if (!res) continue;
    const child = solvePuzzle(res.cups, { maxVisited: 120_000, cupConstraints: constraints });
    const childSolvable = child.solvable && !child.truncated && child.minMoves !== undefined;
    if (childSolvable) {
      solvable++;
      if (child.minMoves === parentMin - 1) optimal++;
    } else if (!childSolvable && child.truncated !== true) {
      fatal++;
    } else if (child.truncated) {
      // Treat truncated as unknown (not counted fatal); be conservative.
    }
    if (m.to === sinkIdx) {
      sinkD++;
      if (childSolvable) sinkDS++;
    }
  }
  return { legal: moves.length, solvable, optimal, fatal, sinkDirected: sinkD, sinkDirectedSolvable: sinkDS };
}

/** Relativize concrete cups to c-roles by palette order. */
export function relativize(cups: TeaId[][], palette: TeaId[]): string[][] {
  return cups.map((cup) => cup.map((t) => `c${palette.indexOf(t)}`));
}

function roleKey(roleCups: string[][], constraints: readonly CupConstraint[]): string {
  const fake = roleCups as unknown as TeaId[][];
  return canonicalKey(fake, constraints);
}

const PER_DEPTH_CAP = parseInt(process.env.PER_DEPTH_CAP ?? '0', 10);
const BANK_OUT = process.env.BANK_OUT ?? '';

async function searchOne(cfgKey: string, numSeeds: number, startSeed: number) {
  const cfg = CONFIGS[cfgKey] as Config;
  const seen = new Map<string, { id: string; depth: number; cups: string[][]; teapot: number | null; sink: number; fairness: Fairness; seed: number }>();
  const perDepth = new Map<number, number>();
  let dealt = 0, solvedOk = 0, inBand = 0, inTarget = 0, fairPass = 0;
  const depthHist = new Map<number, number>();
  const sweet = cfg.phase === 'peak' ? [10, 11, 12, 13, 14] : [7, 8, 9, 10];
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    if (PER_DEPTH_CAP > 0 && sweet.every((d) => (perDepth.get(d) ?? 0) >= PER_DEPTH_CAP)) {
      console.log(`[${cfgKey}] per-depth caps full at seed=${s}, stopping early`);
      break;
    }
    const rng = createRng(`sinksearch:${cfgKey}:${s}`);
    const deal = dealOne(rng, cfg);
    if (!deal) continue;
    dealt++;
    if (isWonState(deal.cups, deal.constraints)) continue;
    const solved = solvePuzzle(deal.cups, { maxVisited: 120_000, cupConstraints: deal.constraints });
    if (!solved.solvable || solved.truncated || solved.minMoves === undefined) continue;
    solvedOk++;
    if (!depthAccepted(solved.minMoves, cfg.phase)) continue;
    inBand++;
    if (depthInTarget(solved.minMoves, cfg.phase)) inTarget++;
    depthHist.set(solved.minMoves, (depthHist.get(solved.minMoves) ?? 0) + 1);
    // Sweet-spot preference for the bank (spec §25).
    if (!depthInTarget(solved.minMoves, cfg.phase)) continue;
    // Solution must route into the sink (win requires sink full; verify).
    const sinkIdx = deal.constraints.findIndex((c) => c.mode === 'sink-only');
    const usesSink = (solved.solution ?? []).some((m) => m.to === sinkIdx);
    if (!usesSink) continue;
    // Fairness analysis on shortlist.
    const fair = analyzeFairness(deal.cups, deal.constraints, solved.minMoves);
    // Hard curation (§27): ≥2 solvable first moves for sink-challenge.
    // For peaks/teapot keep the same bar when possible but record all.
    if (cfgKey === 'sink-challenge' && fair.solvable < 2) continue;
    fairPass++;
    const roles = relativize(deal.cups, cfg.palette);
    const key = roleKey(roles, deal.constraints);
    if (seen.has(key)) continue;
    if (PER_DEPTH_CAP > 0 && (perDepth.get(solved.minMoves) ?? 0) >= PER_DEPTH_CAP) continue;
    perDepth.set(solved.minMoves, (perDepth.get(solved.minMoves) ?? 0) + 1);
    seen.set(key, {
      id: `${cfgKey}:${s}`,
      depth: solved.minMoves,
      cups: roles,
      teapot: cfg.hasTeapot ? 0 : null,
      sink: deal.cups.length - 1,
      fairness: fair,
      seed: s,
    });
    if (seen.size % 5 === 0) {
      console.log(`[${cfgKey}] seed=${s} collected=${seen.size} inBand=${inBand} inTarget=${inTarget} fairPass=${fairPass}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n== ${cfgKey} done in ${dt}s ==`);
  console.log(`dealt=${dealt} solvedOk=${solvedOk} inBand=${inBand} inTarget=${inTarget} fairPass=${fairPass} distinct=${seen.size}`);
  console.log(`depth histogram (in-band): ${[...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${n}`).join(' ')}`);
  const arr = [...seen.values()].sort((a, b) => a.depth - b.depth || a.seed - b.seed);
  // Fairness distribution summary.
  const f = arr.map((e) => e.fairness);
  const avg = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 'n/a';
  console.log(`fairness avg: legal=${avg(f.map((x) => x.legal))} solvable=${avg(f.map((x) => x.solvable))} optimal=${avg(f.map((x) => x.optimal))} fatal=${avg(f.map((x) => x.fatal))} sinkD=${avg(f.map((x) => x.sinkDirected))} sinkDS=${avg(f.map((x) => x.sinkDirectedSolvable))}`);
  // Emit bank-ready TS.
  const lines = arr.map((e) => {
    const cupsTs = `[${e.cups.map((c) => `[${c.map((r) => `'${r}'`).join(', ')}]`).join(', ')}]`;
    return `    { id: '${cfgKey}-${e.depth}-${e.seed}', kind: '${cfgKey}', depth: ${e.depth}, cups: ${cupsTs}, teapot: ${e.teapot === null ? 'null' : e.teapot}, sink: ${e.sink} }, // seed ${e.seed} fair L${e.fairness.legal}/S${e.fairness.solvable}/O${e.fairness.optimal}/F${e.fairness.fatal}/SD${e.fairness.sinkDirected}/${e.fairness.sinkDirectedSolvable}`;
  });
  if (BANK_OUT) {
    const fs = await import('node:fs');
    fs.writeFileSync(BANK_OUT, lines.join('\n') + '\n');
    console.log(`wrote ${lines.length} bank lines to ${BANK_OUT}`);
  } else {
    console.log(`\n--- BANK ${cfgKey} (${arr.length}) ---`);
    for (const l of lines) console.log(l);
  }
  return arr;
}

const [cfgArg = 'all', numArg = '4000', startArg = '0'] = process.argv.slice(2);
const numSeeds = parseInt(numArg, 10);
const startSeed = parseInt(startArg, 10);
const keys = cfgArg === 'all' ? Object.keys(CONFIGS) : [cfgArg];
for (const k of keys) {
  if (!CONFIGS[k]) { console.error(`unknown config ${k}`); process.exit(1); }
  await searchOne(k, numSeeds, startSeed);
}
