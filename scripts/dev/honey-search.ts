/**
 * OFFLINE honey feasibility search (Gauntlet 7 gate §56-59, dev-only).
 * Configs: A=4c/6v/2e honey, B=5c/7v/2e honey+mystery-assignable,
 * C=4c/6v/2e teapot+honey (honey starts in teapot).
 * Usage: bun scripts/dev/honey-search.ts [A|B|C|all] [numSeeds] [startSeed]
 * Env EMIT_JSONL: append participating candidates as JSON lines for curation.
 */
import { createRng, shuffleInPlace } from '../../src/game/logic/rng';
import { solvePuzzle, applySolutionState } from '../../src/game/logic/solver';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  sinkingIngredientHostSatisfied,
} from '../../src/game/logic/rules';
import { selectMysteryCup } from '../../src/game/logic/generator';
import type { CupConstraint, TeaId } from '../../src/game/types';

const PAL4: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'buckwheat'];
const PAL5: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'buckwheat'];

interface Cfg {
  key: string;
  numColors: number;
  palette: TeaId[];
  totalVessels: number;
  hasTeapot: boolean;
  checkMysteryAssignable: boolean;
}

const CFGS: Record<string, Cfg> = {
  A: { key: 'A', numColors: 4, palette: PAL4, totalVessels: 6, hasTeapot: false, checkMysteryAssignable: false },
  B: { key: 'B', numColors: 5, palette: PAL5, totalVessels: 7, hasTeapot: false, checkMysteryAssignable: true },
  C: { key: 'C', numColors: 4, palette: PAL4, totalVessels: 6, hasTeapot: true, checkMysteryAssignable: false },
};

function isMixedFull(cup: TeaId[]): boolean {
  return cup.length === 4 && cup.some((t) => t !== cup[0]);
}

function dealOne(
  rng: () => number,
  cfg: Cfg,
): { cups: TeaId[][]; constraints: CupConstraint[]; honeyHost: number } | null {
  const pool: TeaId[] = [];
  for (let c = 0; c < cfg.numColors; c++) for (let k = 0; k < 4; k++) pool.push(cfg.palette[c] as TeaId);
  shuffleInPlace(rng, pool);
  const filled = cfg.totalVessels - 2;
  const cups: TeaId[][] = [];
  for (let c = 0; c < filled; c++) cups.push(pool.slice(c * 4, c * 4 + 4));
  cups.push([], []);
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
    return { cups, constraints: cons, honeyHost: 0 };
  }
  const hosts: number[] = [];
  cups.forEach((cup, i) => {
    if (cup.length === 4 && isMixedFull(cup)) hosts.push(i);
  });
  if (hosts.length === 0) return null;
  const honeyHost = hosts[Math.floor(rng() * hosts.length)] as number;
  return { cups, constraints: cons, honeyHost };
}

interface Participation {
  stays: number;
  moves: number;
  firstMoveDepth: number | null;
  finalOk: boolean;
  win: boolean;
}

function analyzeParticipation(
  cups: TeaId[][],
  honeyHost: number,
  solution: Array<{ kind: string; from?: number; to?: number }>,
  constraints: CupConstraint[],
): Participation {
  let board = cups.map((c) => [...c]);
  let slots = cups.map((_, i) => (i === honeyHost ? ('honey' as const) : null));
  let stays = 0;
  let moves = 0;
  let firstMoveDepth: number | null = null;
  for (let i = 0; i < solution.length; i++) {
    const step = solution[i] as { kind: string; from: number; to: number };
    if (step.kind !== 'pour') continue;
    const hostBefore = slots.findIndex((s) => s === 'honey');
    const res = applyPourState(
      { cups: board, floatingIngredients: board.map(() => null), sinkingIngredients: [...slots] },
      step.from,
      step.to,
      constraints,
    );
    if (!res) return { stays, moves, firstMoveDepth, finalOk: false, win: false };
    const hostAfter = (res.state.sinkingIngredients as (string | null)[]).findIndex((s) => s === 'honey');
    const wasHostPour = hostBefore === step.from;
    if (wasHostPour && hostAfter === hostBefore && res.state.cups[step.from]?.length !== 0) stays++;
    if (wasHostPour && hostAfter !== hostBefore) {
      moves++;
      if (firstMoveDepth === null) firstMoveDepth = i;
    }
    board = res.state.cups;
    slots = [...(res.state.sinkingIngredients as (string | null)[])];
  }
  const finalHost = slots.findIndex((s) => s === 'honey');
  const finalOk =
    finalHost >= 0 &&
    sinkingIngredientHostSatisfied('honey', board[finalHost] as TeaId[], constraints[finalHost]);
  const win = isPuzzleWonState(
    { cups: board, floatingIngredients: board.map(() => null), sinkingIngredients: [...slots] },
    constraints,
  );
  return { stays, moves, firstMoveDepth, finalOk, win };
}

const EMIT_JSONL = process.env.EMIT_JSONL ?? '';

function relativize(cups: TeaId[][], palette: TeaId[]): string[][] {
  // c0 fixed to buckwheat (honey target); other roles by sorted palette order.
  const others = palette.filter((t) => t !== 'buckwheat').sort();
  const role = (t: TeaId): string => (t === 'buckwheat' ? 'c0' : `c${others.indexOf(t) + 1}`);
  return cups.map((cup) => cup.map(role));
}

async function runCfg(cfgKey: string, numSeeds: number, startSeed: number) {
  const cfg = CFGS[cfgKey] as Cfg;
  let solvW = 0;
  let solvWO = 0;
  let part = 0;
  let truncW = 0;
  const withTimes: number[] = [];
  const withVisited: number[] = [];
  const deltas: number[] = [];
  let accidental = 0;
  let accidentalDen = 0;
  const depthHist = new Map<number, number>();
  const stayHist = new Map<number, number>();
  const moveHist = new Map<number, number>();
  const firstMove: number[] = [];
  const distinct = new Map<string, { seed: number; withD: number }>();
  const t0 = Date.now();
  for (let s = startSeed; s < startSeed + numSeeds; s++) {
    const rng = createRng(`honeygate:${cfgKey}:${s}`);
    const deal = dealOne(rng, cfg);
    if (!deal) continue;
    const { cups, constraints, honeyHost } = deal;
    const honeySlots = cups.map((_, i) => (i === honeyHost ? ('honey' as const) : null));
    if (
      isPuzzleWonState(
        { cups, floatingIngredients: cups.map(() => null), sinkingIngredients: [...honeySlots] },
        constraints,
      )
    ) {
      continue;
    }
    if (cfg.checkMysteryAssignable) {
      const midx = selectMysteryCup(
        cups,
        (cands) => {
          const eligible = cands.filter((c) => c !== honeyHost);
          return eligible[Math.floor(rng() * eligible.length)] ?? null;
        },
        constraints,
      );
      if (midx === null) continue;
    }
    const tB = Date.now();
    const w = solvePuzzle(cups, {
      maxVisited: 120_000,
      cupConstraints: constraints,
      sinkingIngredients: [...honeySlots],
    });
    withTimes.push(Date.now() - tB);
    withVisited.push(w.visitedStates);
    if (w.truncated) truncW++;
    const tA = Date.now();
    void tA;
    const wo = solvePuzzle(cups, { maxVisited: 120_000, cupConstraints: constraints });
    const woS = wo.solvable && !wo.truncated;
    const wS = w.solvable && !w.truncated;
    if (woS) solvWO++;
    if (wS) solvW++;
    if (woS && wS && wo.minMoves !== undefined && w.minMoves !== undefined) {
      deltas.push(w.minMoves - wo.minMoves);
      // Does the tea-only optimal accidentally satisfy honey when replayed with honey?
      const teaSol = (wo.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
      let b = cups.map((c) => [...c]);
      let sl = [...honeySlots];
      let ok = true;
      for (const step of teaSol) {
        if (step.kind !== 'pour') continue;
        const res = applyPourState(
          { cups: b, floatingIngredients: b.map(() => null), sinkingIngredients: [...sl] },
          step.from,
          step.to,
          constraints,
        );
        if (!res) {
          ok = false;
          break;
        }
        b = res.state.cups;
        sl = [...(res.state.sinkingIngredients as (string | null)[])];
      }
      if (ok) {
        accidentalDen++;
        const fh = sl.findIndex((x) => x === 'honey');
        if (fh >= 0 && sinkingIngredientHostSatisfied('honey', b[fh] as TeaId[], constraints[fh])) accidental++;
      }
    }
    if (wS) {
      const sol = (w.solution ?? []) as Array<{ kind: string; from: number; to: number }>;
      const az = analyzeParticipation(cups, honeyHost, sol, constraints);
      // Cross-check replay helper reproduces the win.
      const fin = applySolutionState(
        { cups, floatingIngredients: cups.map(() => null), sinkingIngredients: [...honeySlots] },
        w.solution ?? [],
        constraints,
      );
      const replayWin = fin !== null && isPuzzleWonState(fin, constraints);
      if (az.stays >= 1 && az.moves >= 1 && az.finalOk && az.win && replayWin) {
        part++;
        depthHist.set(w.minMoves as number, (depthHist.get(w.minMoves as number) ?? 0) + 1);
        stayHist.set(az.stays, (stayHist.get(az.stays) ?? 0) + 1);
        moveHist.set(az.moves, (moveHist.get(az.moves) ?? 0) + 1);
        if (az.firstMoveDepth !== null) firstMove.push(az.firstMoveDepth);
        const key = canonicalPuzzleKey(
          { cups, floatingIngredients: cups.map(() => null), sinkingIngredients: [...honeySlots] },
          constraints,
        );
        if (!distinct.has(key)) distinct.set(key, { seed: s, withD: w.minMoves as number });
        if (EMIT_JSONL) {
          const fs = await import('node:fs');
          fs.appendFileSync(
            EMIT_JSONL,
            JSON.stringify({
              kind: cfgKey,
              seed: s,
              depth: w.minMoves,
              withVisited: w.visitedStates,
              cups: relativize(cups, cfg.palette),
              honeyHost,
              teapot: cfg.hasTeapot ? 0 : null,
              stays: az.stays,
              moves: az.moves,
              firstMove: az.firstMoveDepth,
            }) + '\n',
          );
        }
      }
    }
    if ((s - startSeed + 1) % 250 === 0) {
      console.log(`[${cfgKey}] ${s - startSeed + 1}/${numSeeds} W=${solvW} WO=${solvWO} part=${part} distinct=${distinct.size}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const pct = (a: number[], p: number): number => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
  };
  console.log(`\n== ${cfgKey} done in ${dt}s (n=${numSeeds}) ==`);
  console.log(`solvableWith=${solvW} solvableWithoutTeaOnly=${solvWO} truncatedWith=${truncW}`);
  console.log(`participating=${part} canonicalDistinct=${distinct.size}`);
  console.log(`depthHist: ${[...depthHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`stayHist: ${[...stayHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`moveHist: ${[...moveHist.entries()].sort((a, b) => a[0] - b[0]).map(([d, c]) => `${d}:${c}`).join(' ')}`);
  console.log(`firstMoveDepth p50=${pct(firstMove, 50)} p95=${pct(firstMove, 95)} max=${firstMove.length ? Math.max(...firstMove) : 0}`);
  console.log(`delta(with-wo) p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 0} n=${deltas.length}`);
  console.log(`teaOnlyAccidental=${accidental}/${accidentalDen}`);
  console.log(`solveTimeMs with p50=${pct(withTimes, 50)} p95=${pct(withTimes, 95)} max=${withTimes.length ? Math.max(...withTimes) : 0}`);
  console.log(`visited with p50=${pct(withVisited, 50)} p95=${pct(withVisited, 95)} max=${withVisited.length ? Math.max(...withVisited) : 0}`);
  const ex = [...distinct.values()].slice(0, 5);
  for (const v of ex) console.log(`  strong seed=${v.seed} depth=${v.withD}`);
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
