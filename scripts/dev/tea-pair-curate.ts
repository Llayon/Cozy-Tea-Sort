/**
 * G17 tea-pair curation (DEV ONLY): sample V6 shaped candidates, keep robust
 * L2 (6 deterministic role permutations x 2 pair-member swaps, in-band),
 * then pick 18 canonical-distinct templates with final-role diversity.
 *
 * Run:
 *   bunx tsx scripts/dev/tea-pair-curate.ts
 *   bunx tsx scripts/dev/tea-pair-curate.ts --emit
 */
import { CupConstraint, TeaId, emptyFloatingIngredients } from '../../src/game/types.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import {
  PALETTE,
  analyzePairTrace,
  pairConstraints,
  shaped,
  stripPair,
  type PairTrace,
} from './tea-pair-search.ts';

const MAX_VISITED = 200_000;
const MAX_DEPTH = 60;
/** Measured V6 depths 8–14; production challenge accept 5–13 → 8–13. */
export const ACCEPT = { min: 8, max: 13 };
/** Depth sweet spot from 5000-sample evidence. */
export const SWEET = { min: 10, max: 12 };

const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 2, 3],
  [0, 1, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 3, 0, 2],
];

const CONS = pairConstraints(6);
const PLAIN_CONS = stripPair(CONS);

function toRoles(cups: TeaId[][]): string[][] {
  const map = new Map<TeaId, string>(PALETTE.map((t, i) => [t, `c${i}`]));
  return cups.map((cup) => cup.map((t) => map.get(t) as string));
}

function fromRoles(roles: string[][], order: TeaId[]): TeaId[][] {
  const m = new Map<string, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  return roles.map((cup) => cup.map((r) => m.get(r) as TeaId));
}

interface Analyzed {
  trace: PairTrace;
  depth: number;
  visited: number;
}

function analyze(cups: TeaId[][]): Analyzed | null {
  const r = solvePuzzle(cups, {
    cupConstraints: CONS,
    maxVisited: MAX_VISITED,
    maxDepth: MAX_DEPTH,
    returnSolution: true,
  });
  if (!r.solvable || r.truncated || r.minMoves === undefined || !r.solution) return null;
  const trace = analyzePairTrace(cups, r.solution, CONS);
  if (!trace.win || !trace.matchedSameTea || !trace.l2 || trace.stable === null) return null;
  if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) return null;
  if (trace.commitRatio === null || trace.commitRatio > 0.8) return null;
  return { trace, depth: r.minMoves, visited: r.visitedStates };
}

function swapPair(cups: TeaId[][]): TeaId[][] {
  const out = cups.map((c) => [...c]);
  const a = out[0] as TeaId[];
  const b = out[1] as TeaId[];
  out[0] = b;
  out[1] = a;
  return out;
}

function plainDepth(cups: TeaId[][]): number | null {
  const r = solvePuzzle(cups, {
    cupConstraints: PLAIN_CONS,
    maxVisited: MAX_VISITED,
    maxDepth: MAX_DEPTH,
  });
  if (!r.solvable || r.truncated || r.minMoves === undefined) return null;
  return r.minMoves;
}

interface Pick {
  seed: number;
  roles: string[][];
  depth: number;
  visited: number;
  commitRatio: number;
  gap: number;
  finalRole: number;
  anchorSwitch: boolean;
  l3b: boolean;
  l3: boolean;
  conflicts: number;
  key: string;
  score: number;
}

function scoreOf(a: Analyzed, l3b: boolean, l3: boolean): number {
  const t = a.trace;
  const stable = t.stable;
  if (!stable) return -Infinity;
  let score = 0;
  if ((t.commitRatio ?? 1) <= 0.65) score += 3;
  else if ((t.commitRatio ?? 1) <= 0.72) score += 1;
  if (stable.gap >= 2) score += 3;
  if (stable.gap >= 4) score += 1;
  if (stable.gap >= 6) score += 1;
  if (stable.commitDepth <= 0.5 * a.depth) score += 1;
  if (t.anchorSwitch) score += 2;
  if (l3b) score += 1;
  if (a.depth >= SWEET.min && a.depth <= SWEET.max) score += 2;
  if (a.visited <= 800) score += 1;
  if (t.conflictStates > 0) score += 1;
  return score;
}

const IS_MAIN = (process.argv[1] ?? '').replace(/\\/g, '/').endsWith('tea-pair-curate.ts');

if (IS_MAIN) {
  const targetPool = Number(process.env.POOL ?? 60);
  const maxSeeds = Number(process.env.MAX_SEEDS ?? 4000);
  const pool: Pick[] = [];
  const seen = new Set<string>();
  let s = 0;
  let checked = 0;
  let robust = 0;

  while (pool.length < targetPool && s < maxSeeds) {
    const { cups } = shaped('V6', s);
    s++;
    checked++;
    const base = analyze(cups);
    if (!base) continue;
    const roles = toRoles(cups);
    let ok = true;
    let worstRatio = base.trace.commitRatio ?? 1;
    let worstGap = base.trace.stable?.gap ?? 0;
    // 6 role permutations x both pair-member physical orders.
    for (const perm of PERMS) {
      const order = perm.map((i) => PALETTE[i] as TeaId);
      const variants = [fromRoles(roles, order), swapPair(fromRoles(roles, order))];
      for (const pcups of variants) {
        const r = analyze(pcups);
        if (!r) {
          ok = false;
          break;
        }
        worstRatio = Math.max(worstRatio, r.trace.commitRatio ?? 1);
        worstGap = Math.min(worstGap, r.trace.stable?.gap ?? 0);
      }
      if (!ok) break;
    }
    if (!ok) continue;
    robust++;
    const key = canonicalPuzzleKey(
      { cups, floatingIngredients: emptyFloatingIngredients(6) },
      CONS,
    );
    if (seen.has(key)) continue;
    seen.add(key);
    const l3bDepth = plainDepth(cups);
    const l3b = l3bDepth !== null && base.depth > l3bDepth;
    const anchorSwitch = base.trace.anchorSwitch;
    const l3 = anchorSwitch || l3b;
    const finalRole = base.trace.finalRole ?? -1;
    if (finalRole < 0) continue;
    const pick: Pick = {
      seed: s - 1,
      roles,
      depth: base.depth,
      visited: base.visited,
      commitRatio: worstRatio,
      gap: worstGap,
      finalRole,
      anchorSwitch,
      l3b,
      l3,
      conflicts: base.trace.conflictStates,
      key,
      score: scoreOf(base, l3b, l3),
    };
    pool.push(pick);
    console.log(
      `pool ${pool.length}/${targetPool} seed=${pick.seed} depth=${pick.depth} role=c${pick.finalRole} ` +
        `ratio=${worstRatio.toFixed(2)} gap=${pick.gap} switch=${anchorSwitch} l3b=${l3b} ` +
        `score=${pick.score} visited=${pick.visited}`,
    );
  }

  console.log(`\n# checked=${checked} robust=${robust} pool=${pool.length}`);

  // Select 18: prefer healthy L2 (ratio<=0.65, gap>=2), include a healthy
  // set of L3A anchor switches, and keep all four final roles represented.
  const order = (a: Pick, b: Pick) =>
    b.score - a.score || b.gap - a.gap || a.commitRatio - b.commitRatio || a.depth - b.depth;
  const healthy = pool.filter((p) => p.commitRatio <= 0.65 && p.gap >= 2).sort(order);
  const switches = healthy.filter((p) => p.anchorSwitch);
  const selected: Pick[] = [];
  const roleSeen = new Set<number>();
  // Up to 10 healthy anchor-switch templates (soft target, never forced).
  for (const p of switches) {
    if (selected.length >= 10) break;
    if (roleSeen.has(p.finalRole) && switches.filter((s) => s.finalRole === p.finalRole).length < 2) {
      continue;
    }
    selected.push(p);
    roleSeen.add(p.finalRole);
  }
  // One best non-switch per still-missing role.
  for (let role = 0; role < 4; role++) {
    if (roleSeen.has(role)) continue;
    const p = healthy.find((c) => c.finalRole === role && !c.anchorSwitch) ??
      healthy.find((c) => c.finalRole === role);
    if (p) {
      selected.push(p);
      roleSeen.add(role);
    }
  }
  // Fill remaining slots from the healthiest candidates (all roles allowed).
  for (const p of healthy) {
    if (selected.length >= 18) break;
    if (!selected.includes(p)) selected.push(p);
  }
  // If health filters were too strict, top up with the best remaining pool.
  if (selected.length < 18) {
    const rest = pool.filter((p) => !selected.includes(p)).sort(order);
    for (const p of rest) {
      if (selected.length >= 18) break;
      selected.push(p);
    }
  }
  if (selected.length < 18) {
    console.error(`FAIL: only ${selected.length} selectable robust L2 (need 18)`);
    process.exit(1);
  }
  selected.sort((a, b) => a.depth - b.depth || b.score - a.score || a.seed - b.seed);
  const count = (pred: (p: Pick) => boolean) => selected.filter(pred).length;
  const rolesUsed = new Set(selected.map((p) => p.finalRole));
  console.log(`\n# selected=18 roles=${[...rolesUsed].sort().join(',')}`);
  console.log(`# l3=${count((p) => p.l3)} switch=${count((p) => p.anchorSwitch)}`);
  console.log(`# ratio<=0.65=${count((p) => p.commitRatio <= 0.65)}`);
  console.log(`# gap>=2=${count((p) => p.gap >= 2)} gap>=4=${count((p) => p.gap >= 4)}`);
  console.log(`# depth=${selected.map((p) => p.depth).join(',')}`);
  if (count((p) => p.l3) < 10) console.error('WARN: L3 under 10');
  if (count((p) => p.commitRatio <= 0.65) < 14) console.error('WARN: commit-ratio target missed');
  if (count((p) => p.gap >= 2) < 12) console.error('WARN: gap target missed');

  // Fallback preference: early/mid commit, gap>=4, no switch, 10–11 depth.
  const fallback =
    selected
      .filter((p) => p.gap >= 4 && p.commitRatio <= 0.55 && !p.anchorSwitch)
      .sort((a, b) => b.score - a.score || a.depth - b.depth)[0] ??
    selected.filter((p) => p.gap >= 2).sort((a, b) => a.depth - b.depth)[0];
  console.log(`# fallback seed=${fallback?.seed} depth=${fallback?.depth} role=c${fallback?.finalRole}`);

  if (process.argv.includes('--emit')) {
    console.log(`\n// EMIT BELOW`);
    selected.forEach((p, i) => {
      const id = `pair-${p.depth}-${p.seed}`;
      console.log(
        `  { id: '${id}', kind: 'tea-pair', depth: ${p.depth}, cups: ${JSON.stringify(p.roles)}, pairMembers: [0, 1], expectedFinalPairRole: 'c${p.finalRole}' },`,
      );
    });
    console.log(`\n// fallback id: pair-${fallback?.depth}-${fallback?.seed}`);
  }
}
