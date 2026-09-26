/**
 * OFFLINE tasting template discovery (Gauntlet 4 §20, dev-only, never
 * shipped to production runtime).
 *
 * Uses the PRODUCTION rules/solver/canonicalKey/difficulty bands to find
 * tasting puzzles, relativized to palette roles (c0..c4). Participation
 * rule (§19): the optimal production solution must ENTER the tasting bowl
 * AND later EXIT it (bowl starts empty, must finish empty). Fairness
 * analysis mirrors Gauntlet 3 (legal/solvable/optimal/fatal +
 * tasting-directed first moves).
 *
 * Usage:
 *   bun scripts/tasting-search.ts [config] [numSeeds] [startSeed]
 * Env: PER_DEPTH_CAP, BANK_OUT (same contract as sink-search).
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
import {
  STANDARD_CUP_CAPACITY,
  TASTING_BOWL_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';

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
  'tasting-challenge': { kind: 'tasting-challenge', numColors: 4, palette: PALETTE_4, emptyCups: 2, hasMystery: false, hasTeapot: false, phase: 'challenge' },
  'tasting-mystery-peak': { kind: 'tasting-mystery-peak', numColors: 5, palette: PALETTE_5, emptyCups: 2, hasMystery: true, hasTeapot: false, phase: 'peak' },
  'teapot-tasting-challenge': { kind: 'teapot-tasting-challenge', numColors: 4, palette: PALETTE_4, emptyCups: 2, hasMystery: false, hasTeapot: true, phase: 'challenge' },
};

function isMixedFullCup(cup: TeaId[]): boolean {
  if (cup.length !== STANDARD_CUP_CAPACITY) return false;
  return cup.some((t) => t !== cup[0]);
}

const TASTING: CupConstraint = { mode: 'normal', capacity: TASTING_BOWL_CAPACITY, mustEndEmpty: true };

/** Replicates production dealCandidate + tasting placement for search. */
function dealOne(rng: () => number, cfg: Config): { cups: TeaId[][]; constraints: CupConstraint[]; hiddenCounts: number[] } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < cfg.numColors; c++) {
    for (let k = 0; k < TEA_UNITS_PER_COLOR; k++) pool.push(cfg.palette[c] as TeaId);
  }
  shuffleInPlace(rng, pool);
  const cups: TeaId[][] = [];
  for (let c = 0; c < cfg.numColors; c++) cups.push(pool.slice(c * TEA_UNITS_PER_COLOR, (c + 1) * TEA_UNITS_PER_COLOR));
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

  // Tasting: swap an empty standard slot to last, mark the bowl.
  const last = cups.length - 1;
  const emptySlots: number[] = [];
  cups.forEach((cup, i) => {
    if (cup.length === 0 && constraints[i]?.mode === 'normal') emptySlots.push(i);
  });
  if (emptySlots.length === 0) return null;
  if (!emptySlots.includes(last)) {
    const slot = emptySlots[Math.floor(rng() * emptySlots.length)] as number;
    const t = cups[last] as TeaId[]; cups[last] = cups[slot] as TeaId[]; cups[slot] = t;
    const tc = constraints[last] as CupConstraint; constraints[last] = constraints[slot] as CupConstraint; constraints[slot] = tc;
  }
  constraints[last] = { ...TASTING };
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
  tastingDirected: number;
  tastingDirectedSolvable: number;
}

export function analyzeTastingFairness(
  cups: TeaId[][],
  constraints: readonly CupConstraint[],
  parentMin: number,
): Fairness {
  const tastingIdx = constraints.findIndex(
    (c) => c.mode === 'normal' && c.capacity === TASTING_BOWL_CAPACITY && c.mustEndEmpty === true,
  );
  const moves = listLegalMoves(cups, true, constraints);
  let solvable = 0, optimal = 0, fatal = 0, td = 0, tds = 0;
  for (const m of moves) {
    const res = applyPour(cups, m.from, m.to, constraints);
    if (!res) continue;
    const child = solvePuzzle(res.cups, { maxVisited: 120_000, cupConstraints: constraints });
    const childSolvable = child.solvable && !child.truncated && child.minMoves !== undefined;
    if (childSolvable) {
      solvable++;
      if (child.minMoves === parentMin - 1) optimal++;
    } else if (!child.truncated) {
      fatal++;
    }
    if (m.to === tastingIdx) {
      td++;
      if (childSolvable) tds++;
    }
  }
  return { legal: moves.length, solvable, optimal, fatal, tastingDirected: td, tastingDirectedSolvable: tds };
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
  const seen = new Map<string, { id: string; depth: number; cups: string[][]; teapot: number | null; tasting: number; fairness: Fairness; seed: number }>();
  const perDepth = new Map<number, number>();
  const sweet = cfg.phase === 'peak' ? [10, 11, 12, 13, 14] : [7, 8, 9, 10];
  let dealt = 0, solvedOk = 0, inBand = 0, inTarget = 0, participating = 0, fairPass = 0;
  const depthHist = new Map<number, number>();
  const partHist = new Map<number, number>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    if (PER_DEPTH_CAP > 0 && sweet.every((d) => (perDepth.get(d) ?? 0) >= PER_DEPTH_CAP)) {
      console.log(`[${cfgKey}] per-depth caps full at seed=${s}, stopping early`);
      break;
    }
    const rng = createRng(`tastingsearch:${cfgKey}:${s}`);
    const deal = dealOne(rng, cfg);
    if (!deal) continue;
    dealt++;
    if (isWonState(deal.cups, deal.constraints)) continue;
    const solved = solvePuzzle(deal.cups, { maxVisited: 120_000, cupConstraints: deal.constraints });
    if (!solved.solvable || solved.truncated || solved.minMoves === undefined) continue;
    solvedOk++;
    if (!depthAccepted(solved.minMoves, cfg.phase)) continue;
    inBand++;
    depthHist.set(solved.minMoves, (depthHist.get(solved.minMoves) ?? 0) + 1);
    if (!depthInTarget(solved.minMoves, cfg.phase)) continue;
    inTarget++;
    // Participation rule (§19): optimal solution must enter AND exit the bowl.
    const tastingIdx = deal.cups.length - 1;
    const enters = (solved.solution ?? []).some((m) => m.to === tastingIdx);
    const exits = (solved.solution ?? []).some((m) => m.from === tastingIdx);
    if (!enters || !exits) continue;
    participating++;
    partHist.set(solved.minMoves, (partHist.get(solved.minMoves) ?? 0) + 1);
    const fair = analyzeTastingFairness(deal.cups, deal.constraints, solved.minMoves);
    if (fair.solvable < 2) continue;
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
      tasting: deal.cups.length - 1,
      fairness: fair,
      seed: s,
    });
    if (seen.size % 5 === 0) {
      console.log(`[${cfgKey}] seed=${s} collected=${seen.size} inBand=${inBand} inTarget=${inTarget} part=${participating} fairPass=${fairPass}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n== ${cfgKey} done in ${dt}s ==`);
  console.log(`dealt=${dealt} solvedOk=${solvedOk} inBand=${inBand} inTarget=${inTarget} participating=${participating} fairPass=${fairPass} distinct=${seen.size}`);
  console.log(`depth histogram (in-band): ${[...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${n}`).join(' ')}`);
  console.log(`participating histogram (sweet): ${[...partHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}:${n}`).join(' ')}`);
  const arr = [...seen.values()].sort((a, b) => a.depth - b.depth || a.seed - b.seed);
  const f = arr.map((e) => e.fairness);
  const avg = (xs: number[]) => xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 'n/a';
  console.log(`fairness avg: legal=${avg(f.map((x) => x.legal))} solvable=${avg(f.map((x) => x.solvable))} optimal=${avg(f.map((x) => x.optimal))} fatal=${avg(f.map((x) => x.fatal))} tastD=${avg(f.map((x) => x.tastingDirected))} tastDS=${avg(f.map((x) => x.tastingDirectedSolvable))}`);
  const lines = arr.map((e) => {
    const cupsTs = `[${e.cups.map((c) => `[${c.map((r) => `'${r}'`).join(', ')}]`).join(', ')}]`;
    return `    { id: '${cfgKey}-${e.depth}-${e.seed}', kind: '${cfgKey}', depth: ${e.depth}, cups: ${cupsTs}, teapot: ${e.teapot === null ? 'null' : e.teapot}, tasting: ${e.tasting} }, // seed ${e.seed} fair L${e.fairness.legal}/S${e.fairness.solvable}/O${e.fairness.optimal}/F${e.fairness.fatal}/TD${e.fairness.tastingDirected}/${e.fairness.tastingDirectedSolvable}`;
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
