/**
 * G16 shared-tray feasibility sampler (DEV ONLY — never CI/production).
 *
 * Topology: 4c/6v/16u, global layer multiset 4,4,3,3,2,0; all standard normal
 * cap4; exactly one tea-tray group (2 members, limit 6); no other mechanic.
 * Profiles:
 * - P33: tray 3+3 (occupancy 6/6), rest 4,4,2,0
 * - P42: tray 4+2 (occupancy 6/6), rest 4,3,3,0
 * - P32: tray 3+2 (occupancy 5/6), rest 4,4,3,0
 * All non-empty starts mixed; tray members both mixed.
 * Uses production solver/rules/canonicalization + explicit constraints.
 */
import {
  CupConstraint,
  TeaId,
  cloneCupConstraint,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  pourCountState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import type { SolverAction } from '../../src/game/types.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import {
  sharedCapacityFree,
  sharedCapacityOccupancy,
} from '../../src/game/logic/sharedCapacity.ts';

export const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
export const MAX_VISITED = 120_000;
export const MAX_DEPTH = 60;

export type TrayProfile = 'P33' | 'P42' | 'P32';

export const PROFILE_LENGTHS: Record<TrayProfile, number[]> = {
  // tray [0,1] + rest [2..5]
  P33: [3, 3, 4, 4, 2, 0],
  P42: [4, 2, 4, 3, 3, 0],
  P32: [3, 2, 4, 4, 3, 0],
};

export const TRAY_INDICES = [0, 1] as const;

export function consWithTray(): CupConstraint[] {
  return Array.from({ length: 6 }, (_, i) =>
    i === 0 || i === 1
      ? ({ mode: 'normal', sharedCapacityGroup: 'tea-tray' } as CupConstraint)
      : ({ mode: 'normal' as const } as CupConstraint),
  );
}

function plainCons(): CupConstraint[] {
  return Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
}

function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}

function isMixed(cup: TeaId[]): boolean {
  if (cup.length === 0) return true;
  return new Set(cup).size >= 2;
}

export function shaped(profile: TrayProfile, s: number): { cups: TeaId[][]; attempts: number } {
  const lengths = PROFILE_LENGTHS[profile];
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`tray-${profile}-${s}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of lengths) {
      cups.push(p.slice(off, off + L));
      off += L;
    }
    let ok = true;
    for (let i = 0; i < 6; i++) {
      const cup = cups[i] as TeaId[];
      if (cup.length > 0 && !isMixed(cup)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    return { cups, attempts: a + 1 };
  }
  throw new Error(`no shape ${profile} ${s}`);
}

/** Strip tray markers (plain control constraints): same vessels, all ordinary. */
export function stripTray(cons: readonly CupConstraint[]): CupConstraint[] {
  return cons.map((c) => {
    const n = cloneCupConstraint(c);
    delete (n as { sharedCapacityGroup?: unknown }).sharedCapacityGroup;
    return n;
  });
}

export interface PressureInfo {
  candidates: number;
  blocked: number;
  partial: number;
}

/**
 * SHARED_PRESSURE probe at one replay state: counts outside→tray pairs where
 * control (no-shared) is legal with mControl>0 while shared gives
 * mShared < mControl (blocked mShared=0, or partial 0<mShared<mControl).
 */
export function pressureCandidates(
  cups: TeaId[][],
  constraints: readonly CupConstraint[],
): PressureInfo {
  const ctrl = stripTray(constraints);
  const state = { cups, floatingIngredients: emptyFloatingIngredients(cups.length) };
  let candidates = 0;
  let blocked = 0;
  let partial = 0;
  for (const t of TRAY_INDICES) {
    const dest = cups[t] as TeaId[];
    if (dest.length >= 4) continue;
    for (let s = 0; s < cups.length; s++) {
      if ((TRAY_INDICES as readonly number[]).includes(s)) continue;
      if (!canPourState(state, s, t, ctrl)) continue;
      const mControl = pourCountState(state, s, t, ctrl);
      if (mControl <= 0) continue;
      const mShared = pourCountState(state, s, t, constraints);
      const sharedOk = canPourState(state, s, t, constraints);
      // mShared is 0 when illegal; blocked when !sharedOk.
      if (!sharedOk || mShared <= 0) {
        candidates++;
        blocked++;
      } else if (mShared < mControl) {
        candidates++;
        partial++;
      }
    }
  }
  return { candidates, blocked, partial };
}

export interface SharedTrayTrace {
  pressureStates: number;
  blockedCandidates: number;
  partialBoundCandidates: number;
  releases: number;
  refills: number;
  crossMemberReuses: number;
  boundTransfers: number;
  firstPressureDepth: number | null;
  firstReleaseAfterPressureDepth: number | null;
  firstRefillAfterReleaseDepth: number | null;
  minGroupOccupancy: number;
  maxGroupOccupancy: number;
  reachedLimitAfterRelease: boolean;
  finalTrayOccupancies: [number, number];
  win: boolean;
}

export function analyzeSharedTrayTrace(
  startCups: TeaId[][],
  solution: readonly SolverAction[],
  constraints: readonly CupConstraint[],
): SharedTrayTrace {
  let cups = startCups.map((c) => [...c]);
  const tr: SharedTrayTrace = {
    pressureStates: 0,
    blockedCandidates: 0,
    partialBoundCandidates: 0,
    releases: 0,
    refills: 0,
    crossMemberReuses: 0,
    boundTransfers: 0,
    firstPressureDepth: null,
    firstReleaseAfterPressureDepth: null,
    firstRefillAfterReleaseDepth: null,
    minGroupOccupancy: sharedCapacityOccupancy({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, constraints, 'tea-tray'),
    maxGroupOccupancy: sharedCapacityOccupancy({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, constraints, 'tea-tray'),
    reachedLimitAfterRelease: false,
    finalTrayOccupancies: [0, 0],
    win: false,
  };
  const st = () => ({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) });
  const occ = () => sharedCapacityOccupancy(st(), constraints, 'tea-tray');
  const traySet = new Set<number>(TRAY_INDICES as readonly number[] as number[]);
  let seenRelease = false;
  let releasedMembers = new Set<number>();
  let everBelowLimitAfterRelease = false;
  let crossCounted = false;

  // Depth 0..n states; moves 0..n-1.
  for (let d = 0; d <= solution.length; d++) {
    if (d > 0) {
      const a = solution[d - 1] as SolverAction;
      if (a.kind !== 'pour') continue;
      const before = occ();
      const res = applyPourState(st(), a.from, a.to, constraints);
      if (!res) return tr;
      cups = res.state.cups as TeaId[][];
      const after = occ();
      tr.minGroupOccupancy = Math.min(tr.minGroupOccupancy, after);
      tr.maxGroupOccupancy = Math.max(tr.maxGroupOccupancy, after);
      const fromTray = traySet.has(a.from);
      const toTray = traySet.has(a.to);
      const afterStateDepth = d; // state depth after this move
      if (fromTray && !toTray && after < before) {
        // GROUP_RELEASE
        tr.releases++;
        releasedMembers.add(a.from);
        if (tr.firstPressureDepth !== null && tr.firstReleaseAfterPressureDepth === null && d - 1 >= tr.firstPressureDepth) {
          tr.firstReleaseAfterPressureDepth = afterStateDepth;
        } else if (tr.firstPressureDepth === null) {
          // Release before any pressure still counts for totals, but L2 needs order.
        } else if (tr.firstReleaseAfterPressureDepth === null) {
          // Pressure seen, this release starts at/after it.
          tr.firstReleaseAfterPressureDepth = afterStateDepth;
        }
        if (after < 6) everBelowLimitAfterRelease = true;
        seenRelease = true;
      } else if (!fromTray && toTray && after > before) {
        // GROUP_REFILL (only counts toward L2 if after a release)
        if (seenRelease) {
          tr.refills++;
          if (tr.firstReleaseAfterPressureDepth !== null && tr.firstRefillAfterReleaseDepth === null && afterStateDepth > tr.firstReleaseAfterPressureDepth) {
            tr.firstRefillAfterReleaseDepth = afterStateDepth;
          }
          // CROSS_MEMBER_REUSE: refill member differs from some prior release member.
          if (!crossCounted) {
            for (const m of releasedMembers) {
              if (m !== a.to) {
                tr.crossMemberReuses++;
                crossCounted = true;
                break;
              }
            }
            // Count at most once per trace for L3A (could count multiple; keep 1+).
            // For richer metrics count each qualifying refill once.
            if (crossCounted) {
              // keep flag; further refills increment too?
            }
          } else {
            // Already have one; count additional cross refills.
            let cross = false;
            for (const m of releasedMembers) if (m !== a.to) cross = true;
            if (cross) tr.crossMemberReuses++;
          }
        }
        if (everBelowLimitAfterRelease && after === 6) tr.reachedLimitAfterRelease = true;
        // BOUND_TRANSFER: actual outside→tray pour bounded below ordinary.
        const ctrl = stripTray(constraints);
        // Reconstruct before-state for ordinary count: need cups before this move.
        // We have `before` occupancy but need ordinary m. Recompute from res? Use stored before cups.
        // Simplest: recompute ordinary count on the pre-move board. We lost it; reconstruct by replay? Instead compute now via control on current? No — must use pre-move.
        // Workaround: compute ordinary count from layer/top info in res? Use transferred vs ordinary estimate:
        // ordinary = min(topRunBefore, 4 - destLenBefore). We don't have those; so track boards.
        // To keep exact, we re-derive: replay is sequential, so keep prevCups.
        // (Handled below via prev tracking — see note.)
      }
      // BOUND_TRANSFER exact check needs pre-move board; do it with a second pass below.
    }
    // Pressure probe at state d (including initial and final).
    const pc = pressureCandidates(cups, constraints);
    if (pc.candidates > 0) {
      tr.pressureStates++;
      tr.blockedCandidates += pc.blocked;
      tr.partialBoundCandidates += pc.partial;
      if (tr.firstPressureDepth === null) tr.firstPressureDepth = d;
    }
  }
  // Second pass for exact BOUND_TRANSFER (needs pre-move boards + ordinary counts).
  {
    let b = startCups.map((c) => [...c]);
    const bst = () => ({ cups: b, floatingIngredients: emptyFloatingIngredients(b.length) });
    for (const a of solution) {
      if ((a as SolverAction).kind !== 'pour') continue;
      const pa = a as { from: number; to: number };
      const fromTray = traySet.has(pa.from);
      const toTray = traySet.has(pa.to);
      if (!fromTray && toTray) {
        const ctrl = stripTray(constraints);
        const mOrd = pourCountState(bst(), pa.from, pa.to, ctrl);
        const res = applyPourState(bst(), pa.from, pa.to, constraints);
        if (res && res.transferred > 0 && res.transferred < mOrd) tr.boundTransfers++;
        if (res) b = res.state.cups as TeaId[][];
        else break;
      } else {
        const res = applyPourState(bst(), pa.from, pa.to, constraints);
        if (!res) break;
        b = res.state.cups as TeaId[][];
      }
    }
  }
  tr.finalTrayOccupancies = [(cups[0] as TeaId[]).length, (cups[1] as TeaId[]).length];
  tr.win = isPuzzleWonState(st(), constraints);
  // L2 ordering fixup: ensure release/refill depths respect pressure order; if release was before pressure, drop it.
  if (tr.firstPressureDepth !== null && tr.firstReleaseAfterPressureDepth !== null && !(tr.firstPressureDepth < tr.firstReleaseAfterPressureDepth)) {
    tr.firstReleaseAfterPressureDepth = null;
    tr.firstRefillAfterReleaseDepth = null;
  }
  if (tr.firstReleaseAfterPressureDepth !== null && tr.firstRefillAfterReleaseDepth !== null && !(tr.firstReleaseAfterPressureDepth < tr.firstRefillAfterReleaseDepth)) {
    tr.firstRefillAfterReleaseDepth = null;
  }
  return tr;
}

/** Plain-control overload: max combined occupancy of would-be tray pair along plain replay. */
export function controlMaxPairOccupancy(
  startCups: TeaId[][],
  solution: readonly SolverAction[],
): number {
  let cups = startCups.map((c) => [...c]);
  let mx = (cups[0] as TeaId[]).length + (cups[1] as TeaId[]).length;
  const plain = plainCons();
  const st = () => ({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) });
  for (const a of solution) {
    if ((a as SolverAction).kind !== 'pour') continue;
    const res = applyPourState(st(), (a as { from: number }).from, (a as { to: number }).to, plain);
    if (!res) return mx;
    cups = res.state.cups as TeaId[][];
    mx = Math.max(mx, (cups[0] as TeaId[]).length + (cups[1] as TeaId[]).length);
  }
  return mx;
}

function pct(a: number[], p: number): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function hist(a: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const v of a) h[String(v)] = (h[String(v)] ?? 0) + 1;
  return h;
}

const IS_MAIN = ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('shared-tray-search.ts'));
const ARG_PROFILE = (process.argv[2] ?? 'all') as TrayProfile | 'all';
const ARG_N = Number(process.argv[3] ?? 2000);

async function runProfile(profile: TrayProfile, N: number) {
  console.log(`\n===== SHARED-TRAY ${profile} N=${N} =====`);
  let solvable = 0;
  let unsolv = 0;
  let trunc = 0;
  let l1 = 0;
  let l2 = 0;
  let l3a = 0;
  let l3b = 0;
  let l3 = 0;
  let strong = 0;
  const canonL2 = new Set<string>();
  const canonL3 = new Set<string>();
  const depths: number[] = [];
  const l2depths: number[] = [];
  const firstPD: number[] = [];
  const pressDiv: number[] = [];
  const releaseD: number[] = [];
  const refillD: number[] = [];
  const gapPR: number[] = [];
  const gapRR: number[] = [];
  const pressStates: number[] = [];
  const blockedCands: number[] = [];
  const partialCands: number[] = [];
  const visited: number[] = [];
  const ms: number[] = [];
  const plainVisited: number[] = [];
  const plainMs: number[] = [];
  const deltas: number[] = [];
  const plainMaxOcc: number[] = [];
  const startOcc: number[] = [];
  const minOcc: number[] = [];
  const maxOcc: number[] = [];
  const finalPat: Record<string, number> = {};
  let pSolv = 0;
  let pUns = 0;
  let pTrunc = 0;
  let overload = 0;
  let deltaGt0 = 0;
  let refillToLimit = 0;
  let crossRate = 0;
  let boundRate = 0;

  for (let s = 0; s < N; s++) {
    const { cups } = shaped(profile, s);
    const C = consWithTray();
    startOcc.push(sharedCapacityOccupancy({ cups, floatingIngredients: emptyFloatingIngredients(6) }, C, 'tea-tray'));
    const t0 = Date.now();
    const r = solvePuzzle(cups, { cupConstraints: C, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    ms.push(Date.now() - t0);
    visited.push(r.visitedStates);
    if (r.truncated) {
      trunc++;
      continue;
    }
    if (!r.solvable || r.minMoves === undefined || !r.solution) {
      unsolv++;
      continue;
    }
    solvable++;
    depths.push(r.minMoves);
    const tr = analyzeSharedTrayTrace(cups, r.solution, C);
    minOcc.push(tr.minGroupOccupancy);
    maxOcc.push(tr.maxGroupOccupancy);
    finalPat[`${tr.finalTrayOccupancies[0]}+${tr.finalTrayOccupancies[1]}`] = (finalPat[`${tr.finalTrayOccupancies[0]}+${tr.finalTrayOccupancies[1]}`] ?? 0) + 1;
    const isL1 = tr.win;
    if (isL1) l1++;
    const early = tr.firstPressureDepth !== null && tr.firstPressureDepth / Math.max(1, r.minMoves) <= 0.8;
    const isL2 =
      isL1 &&
      tr.firstPressureDepth !== null &&
      tr.firstReleaseAfterPressureDepth !== null &&
      tr.firstRefillAfterReleaseDepth !== null &&
      early;
    // Plain control.
    const pc0 = Date.now();
    const rc = solvePuzzle(cups, { cupConstraints: plainCons(), maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
    plainMs.push(Date.now() - pc0);
    plainVisited.push(rc.visitedStates);
    let delta: number | null = null;
    if (!rc.truncated && rc.solvable && rc.minMoves !== undefined && rc.solution) {
      pSolv++;
      delta = (r.minMoves as number) - (rc.minMoves as number);
      deltas.push(delta);
      if (delta > 0) deltaGt0++;
      const mx = controlMaxPairOccupancy(cups, rc.solution);
      plainMaxOcc.push(mx);
      if (mx > 6) overload++;
    } else if (rc.truncated) pTrunc++;
    else pUns++;
    if (!isL2) continue;
    l2++;
    l2depths.push(r.minMoves);
    if (tr.firstPressureDepth !== null) {
      firstPD.push(tr.firstPressureDepth);
      pressDiv.push(tr.firstPressureDepth / Math.max(1, r.minMoves));
    }
    if (tr.firstReleaseAfterPressureDepth !== null) releaseD.push(tr.firstReleaseAfterPressureDepth);
    if (tr.firstRefillAfterReleaseDepth !== null) refillD.push(tr.firstRefillAfterReleaseDepth);
    if (tr.firstPressureDepth !== null && tr.firstReleaseAfterPressureDepth !== null) gapPR.push(tr.firstReleaseAfterPressureDepth - tr.firstPressureDepth);
    if (tr.firstReleaseAfterPressureDepth !== null && tr.firstRefillAfterReleaseDepth !== null) gapRR.push(tr.firstRefillAfterReleaseDepth - tr.firstReleaseAfterPressureDepth);
    pressStates.push(tr.pressureStates);
    blockedCands.push(tr.blockedCandidates);
    partialCands.push(tr.partialBoundCandidates);
    if (tr.reachedLimitAfterRelease) refillToLimit++;
    if (tr.crossMemberReuses > 0) crossRate++;
    if (tr.boundTransfers > 0) boundRate++;
    const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, C);
    canonL2.add(key);
    const isA = tr.crossMemberReuses > 0;
    const isB = tr.boundTransfers > 0;
    if (isA) l3a++;
    if (isB) l3b++;
    if (isA || isB) {
      l3++;
      canonL3.add(key);
    }
    if (isA && isB) strong++;
    if ((s + 1) % 500 === 0) console.log(`  shaped ${s + 1}/${N} L2=${l2} L3=${l3} solv=${solvable}`);
  }

  console.log(`shaped=${N} solv=${solvable} unsolv=${unsolv} trunc=${trunc} truncRate=${(100 * trunc / Math.max(1, N)).toFixed(2)}%`);
  console.log(`L1=${l1} L2=${l2} (rate=${(100 * l2 / Math.max(1, N)).toFixed(2)}%) L3A=${l3a} L3B=${l3b} L3=${l3} strong=${strong} canonL2=${canonL2.size} canonL3=${canonL3.size}`);
  console.log(`depths n=${depths.length} min=${depths.length ? Math.min(...depths) : 'n/a'} p50=${pct(depths, 50)} p95=${pct(depths, 95)} max=${depths.length ? Math.max(...depths) : 'n/a'} hist=${JSON.stringify(hist(depths))}`);
  console.log(`L2depths hist=${JSON.stringify(hist(l2depths))}`);
  console.log(`firstPressure p50=${pct(firstPD, 50)} p95=${pct(firstPD, 95)} pressure/minMoves p50=${pct(pressDiv, 50)} p95=${pct(pressDiv, 95)}`);
  console.log(`release p50=${pct(releaseD, 50)} p95=${pct(releaseD, 95)} refill p50=${pct(refillD, 50)} p95=${pct(refillD, 95)} gapP→R hist=${JSON.stringify(hist(gapPR))} gapR→R hist=${JSON.stringify(hist(gapRR))}`);
  console.log(`pressureStates p50=${pct(pressStates, 50)} blocked p50=${pct(blockedCands, 50)} partial p50=${pct(partialCands, 50)}`);
  console.log(`crossMemberReuse=${crossRate} boundTransfer=${boundRate} refillToLimit=${refillToLimit}`);
  console.log(`occupancy start hist=${JSON.stringify(hist(startOcc))} min hist=${JSON.stringify(hist(minOcc))} max hist=${JSON.stringify(hist(maxOcc))} final=${JSON.stringify(finalPat)}`);
  console.log(`control: plainSolv=${pSolv} plainUnsolv=${pUns} plainTrunc=${pTrunc} delta p50=${pct(deltas, 50)} p95=${pct(deltas, 95)} max=${deltas.length ? Math.max(...deltas) : 'n/a'} min=${deltas.length ? Math.min(...deltas) : 'n/a'} delta>0=${deltaGt0} overload=${overload} (${(100 * overload / Math.max(1, pSolv)).toFixed(1)}%)`);
  console.log(`plainMaxPair hist=${JSON.stringify(hist(plainMaxOcc))}`);
  console.log(`shared visited p50=${pct(visited, 50)} p95=${pct(visited, 95)} max=${visited.length ? Math.max(...visited) : 'n/a'} ms p50=${pct(ms, 50)} p95=${pct(ms, 95)} max=${ms.length ? Math.max(...ms) : 'n/a'}`);
  console.log(`plain visited p50=${pct(plainVisited, 50)} p95=${pct(plainVisited, 95)} max=${plainVisited.length ? Math.max(...plainVisited) : 'n/a'} ms p50=${pct(plainMs, 50)} p95=${pct(plainMs, 95)} max=${plainMs.length ? Math.max(...plainMs) : 'n/a'}`);
  console.log(canonL2.size >= 30 ? 'GATE PASS (>=30 canon L2)' : 'GATE FAIL (<30 canon L2)');
  return { profile, N, solvable, unsolv, trunc, l1, l2, l3a, l3b, l3, strong, canonL2: canonL2.size, canonL3: canonL3.size };
}

if (IS_MAIN) {
  const profiles: TrayProfile[] = ARG_PROFILE === 'all' ? ['P33', 'P42', 'P32'] : [ARG_PROFILE];
  for (const p of profiles) {
    await runProfile(p, ARG_N);
  }
}
