/**
 * G16 shared-tray curation (DEV ONLY): sample P33 shaped candidates, keep
 * robust L2 (6/6 role-perm L2 in-band), pick 18 canonical-distinct.
 * Emits src/game/logic/sharedTrayTemplates.ts content to stdout.
 */
import {
  CupConstraint,
  TeaId,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { canonicalPuzzleKey } from '../../src/game/logic/rules.ts';
import { createRng, shuffleInPlace } from '../../src/game/logic/rng.ts';
import {
  PROFILE_LENGTHS,
  TRAY_INDICES,
  consWithTray,
  stripTray,
  analyzeSharedTrayTrace,
  pressureCandidates,
} from './shared-tray-search.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const MAX_VISITED = 120_000;
const MAX_DEPTH = 60;
// Derived from P33 feasibility: depths p50 11, L2 7-15. Sweet 10-12, accept 9-13.
export const ACCEPT = { min: 9, max: 13 };
export const SWEET = { min: 10, max: 12 };

const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 2, 3],
  [0, 1, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 3, 0, 2],
];

function pool(): TeaId[] {
  const p: TeaId[] = [];
  for (const c of PALETTE) for (let k = 0; k < 4; k++) p.push(c);
  return p;
}
function isMixed(cup: TeaId[]): boolean {
  if (cup.length === 0) return true;
  return new Set(cup).size >= 2;
}
function shapedP33(s: number): TeaId[][] {
  const lengths = PROFILE_LENGTHS['P33'];
  for (let a = 0; a < 500; a++) {
    const rng = createRng(`tray-curate-P33-${s}-try-${a}`);
    const p = pool();
    shuffleInPlace(rng, p);
    const cups: TeaId[][] = [];
    let off = 0;
    for (const L of lengths) {
      cups.push(p.slice(off, off + L));
      off += L;
    }
    let ok = true;
    for (let i = 0; i < 6; i++) if ((cups[i] as TeaId[]).length > 0 && !isMixed(cups[i] as TeaId[])) { ok = false; break; }
    if (!ok) continue;
    return cups;
  }
  throw new Error(`no shape ${s}`);
}
function toRoles(cups: TeaId[][]): string[][] {
  const map = new Map<TeaId, string>(PALETTE.map((t, i) => [t, `c${i}`]));
  return cups.map((cup) => cup.map((t) => map.get(t) as string));
}
function fromRoles(roles: string[][], order: TeaId[]): TeaId[][] {
  const m = new Map<string, TeaId>([['c0', order[0] as TeaId], ['c1', order[1] as TeaId], ['c2', order[2] as TeaId], ['c3', order[3] as TeaId]]);
  return roles.map((cup) => cup.map((r) => m.get(r) as TeaId));
}
function isL2(cups: TeaId[][], cons: CupConstraint[]): { ok: boolean; depth: number; pressureDiv: number; gap: number; cross: boolean } | null {
  const r = solvePuzzle(cups, { cupConstraints: cons, maxVisited: MAX_VISITED, maxDepth: MAX_DEPTH, returnSolution: true });
  if (!r.solvable || r.truncated || r.minMoves === undefined || !r.solution) return null;
  if (r.minMoves < ACCEPT.min || r.minMoves > ACCEPT.max) return null;
  const tr = analyzeSharedTrayTrace(cups, r.solution, cons);
  if (!tr.win) return null;
  if (tr.firstPressureDepth === null || tr.firstReleaseAfterPressureDepth === null || tr.firstRefillAfterReleaseDepth === null) return null;
  const div = tr.firstPressureDepth / Math.max(1, r.minMoves);
  if (div > 0.8) return null;
  const gap = tr.firstRefillAfterReleaseDepth - tr.firstReleaseAfterPressureDepth;
  return { ok: true, depth: r.minMoves, pressureDiv: div, gap, cross: tr.crossMemberReuses > 0 };
}

const IS_MAIN = ((process.argv[1] ?? '').replace(/\\/g, '/').endsWith('shared-tray-curate.ts'));
if (IS_MAIN) {
  const picked: { roles: string[][]; depth: number; seed: number; div: number; gap: number; cross: boolean }[] = [];
  const seen = new Set<string>();
  const C = consWithTray();
  let s = 0;
  let tried = 0;
  while (picked.length < 18 && s < 8000) {
    const cups = shapedP33(s);
    tried++;
    const base = isL2(cups, C);
    if (!base) { s++; continue; }
    // Robustness: 6 perms must stay L2 in-band.
    const roles = toRoles(cups);
    let robust = true;
    let worstDiv = base.pressureDiv;
    let worstGap = base.gap;
    for (const perm of PERMS) {
      const order = perm.map((i) => PALETTE[i] as TeaId);
      const pcups = fromRoles(roles, order);
      const r = isL2(pcups, C);
      if (!r) { robust = false; break; }
      worstDiv = Math.max(worstDiv, r.pressureDiv);
      worstGap = Math.min(worstGap, r.gap);
    }
    if (!robust) { s++; continue; }
    // Prefer pressure<=0.65 and gap>=2 (soft, but require for majority).
    const key = canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(6) }, C);
    if (seen.has(key)) { s++; continue; }
    seen.add(key);
    picked.push({ roles, depth: base.depth, seed: s, div: worstDiv, gap: worstGap, cross: base.cross });
    console.log(`picked ${picked.length}/18 seed=${s} depth=${base.depth} div=${base.pressureDiv.toFixed(2)} gap=${base.gap} cross=${base.cross}`);
    s++;
  }
  console.log(`\n# tried=${tried} picked=${picked.length}`);
  if (picked.length < 18) {
    console.log('FAIL: not enough robust L2');
    process.exit(1);
  }
  // Emit file content.
  console.log(`\n// EMIT BELOW`);
  console.log(`import type { TeaId } from '../types';`);
  console.log(`export type SharedTrayTeaRole = 'c0' | 'c1' | 'c2' | 'c3';`);
  console.log(`export type SharedTrayTemplateKind = 'shared-tray';`);
  console.log(`export interface SharedTrayTemplate { id: string; kind: SharedTrayTemplateKind; depth: number; cups: SharedTrayTeaRole[][]; trayMembers: readonly [number, number]; }`);
  console.log(`export const SHARED_TRAY_DEPTH_SWEET = { min: ${SWEET.min}, max: ${SWEET.max} };`);
  console.log(`export const SHARED_TRAY_DEPTH_ACCEPT = { min: ${ACCEPT.min}, max: ${ACCEPT.max} };`);
  console.log(`export const SHARED_TRAY_TEMPLATE_ATTEMPTS = 4;`);
  console.log(`export const SHARED_TRAY_TEMPLATE_BANK: Record<SharedTrayTemplateKind, SharedTrayTemplate[]> = { 'shared-tray': [`);
  picked.forEach((p, i) => {
    const id = `tray-${p.depth}-${p.seed}`;
    console.log(`  { id: '${id}', kind: 'shared-tray', depth: ${p.depth}, cups: ${JSON.stringify(p.roles)}, trayMembers: [0, 1] },`);
  });
  console.log(`], };`);
}
