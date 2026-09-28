/**
 * OFFLINE lemon template discovery (Gauntlet 5 §51, dev-only, never
 * shipped to production runtime).
 *
 * Uses the PRODUCTION state-aware rules/solver/canonicalPuzzleKey/
 * difficulty bands. Relativization fixes c0 = sea_buckthorn (the lemon
 * target) and maps remaining teas by palette order. Participation (§46):
 * the optimal solution must relocate the lemon ≥1 (tracked across the
 * replay, not inferred from the initial host). Fairness mirrors Gauntlet
 * 3/4 plus lemon-host-directed moves and wrong-final deadlock rate (§54).
 *
 * Usage:
 *   bun scripts/dev/lemon-search.ts [config] [numSeeds] [startSeed]
 * Env: PER_DEPTH_CAP, BANK_OUT.
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle } from '../../src/game/logic/solver';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  isWonState,
  listLegalMovesState,
} from '../../src/game/logic/rules';
import { depthAccepted, depthInTarget } from '../../src/game/logic/difficulty';
import { selectLemonHost, selectMysteryCup } from '../../src/game/logic/generator';
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  floatingIngredientIndex,
  type CupConstraint,
  type FloatingIngredientSlot,
  type TeaId,
} from '../../src/game/types';

const SB: TeaId = 'sea_buckthorn';
const PALETTE_4: TeaId[] = ['matcha', SB, 'karkade', 'milk_oolong'];
const PALETTE_5: TeaId[] = ['matcha', SB, 'karkade', 'milk_oolong', 'lavender'];

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
  'lemon-challenge': { kind: 'lemon-challenge', numColors: 4, palette: PALETTE_4, emptyCups: 2, hasMystery: false, hasTeapot: false, phase: 'challenge' },
  'lemon-mystery-peak': { kind: 'lemon-mystery-peak', numColors: 5, palette: PALETTE_5, emptyCups: 2, hasMystery: true, hasTeapot: false, phase: 'peak' },
  'teapot-lemon-challenge': { kind: 'teapot-lemon-challenge', numColors: 4, palette: PALETTE_4, emptyCups: 2, hasMystery: false, hasTeapot: true, phase: 'challenge' },
};

function isMixedFullCup(cup: TeaId[]): boolean {
  if (cup.length !== STANDARD_CUP_CAPACITY) return false;
  return cup.some((t) => t !== cup[0]);
}

function dealOne(
  rng: () => number,
  cfg: Config,
): { cups: TeaId[][]; constraints: CupConstraint[]; slots: FloatingIngredientSlot[]; hiddenCounts: number[] } | null {
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

  const hiddenCounts = cups.map(() => 0);
  let mysteryIdx = -1;
  if (cfg.hasMystery) {
    const idx = selectMysteryCup(cups, (cands) => {
      const at = Math.floor(rng() * cands.length);
      return cands[at] ?? null;
    }, constraints);
    if (idx === null) return null;
    hiddenCounts[idx] = 1;
    mysteryIdx = idx;
  }

  const host = selectLemonHost(
    cups,
    constraints,
    (cands) => {
      const at = Math.floor(rng() * cands.length);
      return cands[at] ?? null;
    },
    mysteryIdx >= 0 ? [mysteryIdx] : [],
  );
  if (host === null) return null;
  const slots: FloatingIngredientSlot[] = cups.map(() => null);
  slots[host] = 'lemon';
  return { cups, constraints, slots, hiddenCounts };
}

export interface LemonFairness {
  legal: number;
  solvable: number;
  optimal: number;
  fatal: number;
  lemonDirected: number;
  lemonDirectedSolvable: number;
  wrongFinalDeadlocks: number;
}

/** Count actual lemon relocations across a solution replay (§47). */
export function countLemonRelocations(
  cups: TeaId[][],
  slots: FloatingIngredientSlot[],
  solution: Array<{ from: number; to: number }>,
  constraints?: readonly CupConstraint[],
): number {
  let board = { cups: cups.map((c) => [...c]), floatingIngredients: [...slots] };
  let relocations = 0;
  for (const m of solution) {
    const before = floatingIngredientIndex(board, 'lemon');
    const res = applyPourState(board, m.from, m.to, constraints);
    if (!res) return -1;
    board = { cups: res.state.cups, floatingIngredients: res.state.floatingIngredients };
    if (floatingIngredientIndex(board, 'lemon') !== before) relocations++;
  }
  return relocations;
}

export function analyzeLemonFairness(
  cups: TeaId[][],
  slots: FloatingIngredientSlot[],
  constraints: readonly CupConstraint[],
  parentMin: number,
): LemonFairness {
  const host = floatingIngredientIndex({ floatingIngredients: slots }, 'lemon');
  const state = { cups, floatingIngredients: slots };
  const moves = listLegalMovesState(state, true, constraints);
  let solvable = 0, optimal = 0, fatal = 0, ld = 0, lds = 0, wfd = 0;
  for (const m of moves) {
    const res = applyPourState(state, m.from, m.to, constraints);
    if (!res) continue;
    const child = solvePuzzle(res.state.cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      floatingIngredients: res.state.floatingIngredients,
    });
    const ok = child.solvable && !child.truncated && child.minMoves !== undefined;
    if (ok) {
      solvable++;
      if (child.minMoves === parentMin - 1) optimal++;
    } else if (!child.truncated) {
      fatal++;
    }
    if (m.from === host) {
      ld++;
      if (ok) lds++;
    }
    // Wrong-final analysis (§54): tea sorted, lemon wrong, stuck.
    if (
      isWonState(res.state.cups, constraints) &&
      !isPuzzleWonState(res.state, constraints) &&
      isPuzzleDeadlockedState(res.state, constraints)
    ) {
      wfd++;
    }
  }
  return { legal: moves.length, solvable, optimal, fatal, lemonDirected: ld, lemonDirectedSolvable: lds, wrongFinalDeadlocks: wfd };
}

/** Relativize with c0 fixed to sea_buckthorn. */
export function relativizeLemon(cups: TeaId[][], palette: TeaId[]): string[][] {
  const others = palette.filter((t) => t !== SB);
  return cups.map((cup) =>
    cup.map((t) => (t === SB ? 'c0' : `c${others.indexOf(t) + 1}`)),
  );
}

const PER_DEPTH_CAP = parseInt(process.env.PER_DEPTH_CAP ?? '0', 10);
const BANK_OUT = process.env.BANK_OUT ?? '';

async function searchOne(cfgKey: string, numSeeds: number, startSeed: number) {
  const cfg = CONFIGS[cfgKey] as Config;
  const seen = new Map<string, { id: string; depth: number; cups: string[][]; teapot: number | null; lemonHost: number; fairness: LemonFairness; relocations: number; seed: number }>();
  const perDepth = new Map<number, number>();
  const sweet = cfg.phase === 'peak' ? [10, 11, 12, 13, 14] : [7, 8, 9, 10];
  let dealt = 0, solvedOk = 0, inBand = 0, inTarget = 0, participating = 0, fairPass = 0;
  const depthHist = new Map<number, number>();
  const partHist = new Map<number, number>();
  const relocHist: number[] = [];
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    if (PER_DEPTH_CAP > 0 && sweet.every((d) => (perDepth.get(d) ?? 0) >= PER_DEPTH_CAP)) {
      console.log(`[${cfgKey}] per-depth caps full at seed=${s}, stopping early`);
      break;
    }
    const rng = createRng(`lemonsearch:${cfgKey}:${s}`);
    const deal = dealOne(rng, cfg);
    if (!deal) continue;
    dealt++;
    if (isPuzzleWonState({ cups: deal.cups, floatingIngredients: deal.slots }, deal.constraints)) continue;
    const solved = solvePuzzle(deal.cups, {
      maxVisited: 120_000,
      cupConstraints: deal.constraints,
      floatingIngredients: deal.slots,
    });
    if (!solved.solvable || solved.truncated || solved.minMoves === undefined) continue;
    solvedOk++;
    if (!depthAccepted(solved.minMoves, cfg.phase)) continue;
    inBand++;
    depthHist.set(solved.minMoves, (depthHist.get(solved.minMoves) ?? 0) + 1);
    if (!depthInTarget(solved.minMoves, cfg.phase)) continue;
    inTarget++;
    // Participation: ≥1 actual lemon relocation; final lemon correct + won.
    const relocations = countLemonRelocations(deal.cups, deal.slots, solved.solution ?? [], deal.constraints);
    if (relocations < 1) continue;
    participating++;
    partHist.set(solved.minMoves, (partHist.get(solved.minMoves) ?? 0) + 1);
    relocHist.push(relocations);
    const fair = analyzeLemonFairness(deal.cups, deal.slots, deal.constraints, solved.minMoves);
    if (fair.solvable < 2) continue;
    fairPass++;
    const roles = relativizeLemon(deal.cups, cfg.palette);
    const key = canonicalPuzzleKey(
      { cups: roles as unknown as TeaId[][], floatingIngredients: deal.slots },
      deal.constraints,
    );
    if (seen.has(key)) continue;
    if (PER_DEPTH_CAP > 0 && (perDepth.get(solved.minMoves) ?? 0) >= PER_DEPTH_CAP) continue;
    perDepth.set(solved.minMoves, (perDepth.get(solved.minMoves) ?? 0) + 1);
    const host = floatingIngredientIndex({ floatingIngredients: deal.slots }, 'lemon');
    seen.set(key, {
      id: `${cfgKey}:${s}`, depth: solved.minMoves, cups: roles,
      teapot: cfg.hasTeapot ? 0 : null, lemonHost: host,
      fairness: fair, relocations, seed: s,
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
  const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 'n/a');
  console.log(`fairness avg: legal=${avg(f.map((x) => x.legal))} solvable=${avg(f.map((x) => x.solvable))} optimal=${avg(f.map((x) => x.optimal))} fatal=${avg(f.map((x) => x.fatal))} lemonD=${avg(f.map((x) => x.lemonDirected))} lemonDS=${avg(f.map((x) => x.lemonDirectedSolvable))} wrongFinal=${avg(f.map((x) => x.wrongFinalDeadlocks))}`);
  const rs = relocHist.sort((a, b) => a - b);
  console.log(`relocations: min=${rs[0] ?? 'n/a'} median=${rs.length ? rs[Math.floor(rs.length / 2)] : 'n/a'} max=${rs[rs.length - 1] ?? 'n/a'}`);
  const lines = arr.map((e) => {
    const cupsTs = `[${e.cups.map((c) => `[${c.map((r) => `'${r}'`).join(', ')}]`).join(', ')}]`;
    return `    { id: '${cfgKey}-${e.depth}-${e.seed}', kind: '${cfgKey}', depth: ${e.depth}, cups: ${cupsTs}, teapot: ${e.teapot === null ? 'null' : e.teapot}, lemonHost: ${e.lemonHost} }, // seed ${e.seed} reloc ${e.relocations} fair L${e.fairness.legal}/S${e.fairness.solvable}/O${e.fairness.optimal}/F${e.fairness.fatal}/LD${e.fairness.lemonDirected}/${e.fairness.lemonDirectedSolvable}/WF${e.fairness.wrongFinalDeadlocks}`;
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
