/**
 * G21 E6 FLASK_TRAY winner-bank curation (DEV ONLY).
 *
 * Reads the 5000-board confirmatory JSON, selects 12 robust canonical
 * templates. Every selected template must survive 6 deterministic TeaRole
 * permutations as a FULL C2 board in the production depth band.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { applySolutionState } from '../../src/game/logic/solver.ts';
import {
  CupConstraint,
  TeaId,
  emptyFloatingIngredients,
} from '../../src/game/types.ts';
import { isPuzzleWonState } from '../../src/game/logic/rules.ts';
import {
  PROFILES,
  fullActive,
  fullConstraints,
  mechanicsFor,
  type C2Record,
} from './composition2-search.ts';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const PROFILE = PROFILES.E6;
const INPUT = resolve(import.meta.dirname, 'out/g21-E6-5000.json');
const OUT = resolve(import.meta.dirname, '../../src/game/logic/steepingFlaskSharedTrayTemplates.ts');
const WANT = 12;
const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 2, 3, 0],
  [3, 0, 2, 1],
];

type Role = 'c0' | 'c1' | 'c2' | 'c3';
interface Candidate extends C2Record {
  score: number;
  permutations: number;
}

function toRoles(cups: TeaId[][]): Role[][] {
  return cups.map((cup) => cup.map((t) => `c${PALETTE.indexOf(t)}` as Role));
}
function fromRoles(roles: Role[][], order: TeaId[]): TeaId[][] {
  return roles.map((cup) => cup.map((r) => order[Number(r.slice(1))] as TeaId));
}
function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}
function pct(values: number[], p: number): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] as number;
}

function isC2ForCups(cups: TeaId[][]): { ok: boolean; depth: number | null } {
  const cons = fullConstraints(PROFILE, 0, 1);
  const solved = solvePuzzle(cups, {
    cupConstraints: cons,
    floatingIngredients: emptyFloatingIngredients(cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
    returnSolution: true,
  });
  if (!solved.solvable || solved.truncated || solved.minMoves === undefined || !solved.solution) {
    return { ok: false, depth: null };
  }
  if (solved.minMoves < 10 || solved.minMoves > 15) return { ok: false, depth: solved.minMoves };
  const finalState = applySolutionState(
    { cups, floatingIngredients: emptyFloatingIngredients(cups.length) },
    solved.solution,
    cons,
  );
  if (!finalState || !isPuzzleWonState(finalState, cons)) return { ok: false, depth: solved.minMoves };
  const mechanics = mechanicsFor(PROFILE, cups, solved.solution, cons, 0, 1);
  return { ok: fullActive(mechanics), depth: solved.minMoves };
}

const artifact = JSON.parse(readFileSync(INPUT, 'utf8')) as Record<string, { c2Records: C2Record[]; c2: number; canonicalC2: number }>;
const data = artifact.E6;
if (!data) throw new Error('missing E6 confirmatory data');
const maxVisitedP95 = 4_000;
const pool: Candidate[] = [];
for (const record of data.c2Records) {
  const flask = record.mechanics.flask;
  const tray = record.mechanics.tray;
  if (!flask || !tray) continue;
  if (!flask.active || !tray.active) continue;
  if (flask.partialRelease || !flask.cleanDecant) continue;
  if ((flask.commitDepth ?? 99) / Math.max(1, record.depth) > 0.65) continue;
  if (record.depth < 10 || record.depth > 15) continue;
  if (!tray.crossMemberReuse) continue;
  if (record.stateMultiplier !== null && record.stateMultiplier > 2) continue;
  const score =
    (record.c3x ? 4 : 0) +
    (record.c3 ? 3 : 0) +
    (tray.crossMemberReuse ? 1 : 0) +
    (flask.cleanDecant ? 1 : 0);
  pool.push({ ...record, score, permutations: 0 });
}
pool.sort((a, b) => {
  if (a.score !== b.score) return b.score - a.score;
  const sweetA = a.depth >= 11 && a.depth <= 14 ? 0 : 1;
  const sweetB = b.depth >= 11 && b.depth <= 14 ? 0 : 1;
  if (sweetA !== sweetB) return sweetA - sweetB;
  return a.depth - b.depth;
});

const DEPTH_QUOTA: Record<number, number> = { 10: 2, 11: 3, 12: 3, 13: 2, 14: 2 };
const chosen: Candidate[] = [];
const seen = new Set<string>();
const chosenByDepth = new Map<number, number>();
const quotaOrder = [10, 11, 12, 13, 14];
const orderedPool = quotaOrder.flatMap((depth) => pool.filter((c) => c.depth === depth));
for (const candidate of orderedPool) {
  if (chosen.length >= WANT) break;
  const depthQuota = DEPTH_QUOTA[candidate.depth] ?? 0;
  if ((chosenByDepth.get(candidate.depth) ?? 0) >= depthQuota) continue;
  if (seen.has(candidate.key)) continue;
  const roles = toRoles(candidate.cups);
  let ok = 0;
  const depths: number[] = [];
  for (const perm of PERMS) {
    const order = perm.map((i) => PALETTE[i] as TeaId);
    const cups = fromRoles(roles, order);
    const result = isC2ForCups(cups);
    if (result.ok) {
      ok++;
      if (result.depth !== null) depths.push(result.depth);
    }
  }
  if (ok < 6) continue;
  seen.add(candidate.key);
  candidate.permutations = ok;
  chosen.push(candidate);
  chosenByDepth.set(candidate.depth, (chosenByDepth.get(candidate.depth) ?? 0) + 1);
  console.log(
    `picked ${chosen.length}/${WANT} seed=${candidate.seed} depth=${candidate.depth} perms=${ok}/${PERMS.length} c3=${candidate.c3} c3x=${candidate.c3x} roles=${depths.join(',')}`,
  );
}

if (chosen.length < WANT) throw new Error(`only ${chosen.length}/${WANT} robust templates`);
const c3 = chosen.filter((c) => c.c3).length;
const c3x = chosen.filter((c) => c.c3x).length;
if (c3 < 4) throw new Error(`C3 bank gate failed: ${c3}/12 < 4`);
if (c3x < 4) throw new Error(`C3X bank gate failed: ${c3x}/12 < 4`);

const lines: string[] = [];
lines.push('/**');
lines.push(' * G21 FLASK_TRAY / «Колба + поднос» production bank.');
lines.push(' *');
lines.push(' * Winner evidence: E6 4c/6v 4,4,3,3,2,0; tray on [2,3] (3+3=6/6),');
lines.push(' * empty steeping flask at 5. 12 canonical templates curated from the');
lines.push(' * 5000-board E6 confirmatory run. Every template is FULL C2 (flask cycle');
lines.push(' * + tray pressure/release/refill) and survives 6 role permutations.');
lines.push(' *');
lines.push(' * Pure domain data + instantiation. No React/Pixi imports.');
lines.push(' */');
lines.push('');
lines.push("import type { TeaId } from '../types';");
lines.push('');
lines.push("export type SteepingFlaskSharedTrayRole = 'c0' | 'c1' | 'c2' | 'c3';");
lines.push("export type SteepingFlaskSharedTrayKind = 'flask-tray';");
lines.push('');
lines.push('export interface SteepingFlaskSharedTrayTemplate {');
lines.push('  id: string;');
lines.push('  kind: SteepingFlaskSharedTrayKind;');
lines.push('  depth: number;');
lines.push('  cups: SteepingFlaskSharedTrayRole[][];');
lines.push('  trayMembers: readonly [number, number];');
lines.push('  flaskIndex: number;');
lines.push('  /** Curation evidence only; runtime never reads this. */');
lines.push('  c3: boolean;');
lines.push('  c3x: boolean;');
lines.push('}');
lines.push('');
lines.push('export const STEEPING_FLASK_SHARED_TRAY_TEMPLATE_ATTEMPTS = 4;');
lines.push('export const STEEPING_FLASK_SHARED_TRAY_DEPTH_ACCEPT = { min: 10, max: 15 } as const;');
lines.push('');
lines.push("export const STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK: Record<SteepingFlaskSharedTrayKind, SteepingFlaskSharedTrayTemplate[]> = {");
lines.push("  'flask-tray': [");
for (const candidate of chosen) {
  const roles = toRoles(candidate.cups);
  const id = `flask-tray-${candidate.depth}-${candidate.seed}`;
  lines.push(
    `    { id: '${id}', kind: 'flask-tray', depth: ${candidate.depth}, cups: ${JSON.stringify(roles).replaceAll('"c', "'c").replaceAll('"', "'")}, trayMembers: [2, 3], flaskIndex: 5, c3: ${candidate.c3}, c3x: ${candidate.c3x} },`,
  );
}
lines.push('  ],');
lines.push('};');
lines.push('');
lines.push('export const ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES: SteepingFlaskSharedTrayTemplate[] = [');
lines.push("  ...STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK['flask-tray'],");
lines.push('];');
lines.push('');
lines.push('export function instantiateSteepingFlaskSharedTrayTemplate(');
lines.push('  tpl: SteepingFlaskSharedTrayTemplate,');
lines.push('  palette: TeaId[],');
lines.push('  order: TeaId[] = [...palette],');
lines.push('): { cups: TeaId[][]; trayMembers: readonly [number, number]; flaskSlot: number } {');
lines.push('  const roleToTea = new Map<SteepingFlaskSharedTrayRole, TeaId>([');
lines.push("    ['c0', order[0] as TeaId],");
lines.push("    ['c1', order[1] as TeaId],");
lines.push("    ['c2', order[2] as TeaId],");
lines.push("    ['c3', order[3] as TeaId],");
lines.push('  ]);');
lines.push('  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));');
lines.push('  return { cups, trayMembers: tpl.trayMembers, flaskSlot: tpl.flaskIndex };');
lines.push('}');
lines.push('');
lines.push('export const STEEPING_FLASK_SHARED_TRAY_FALLBACK_TEMPLATE_ID =');
lines.push("  STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK['flask-tray'][0]?.id ?? 'flask-tray-fallback';");
lines.push('');

writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(
  `selected ${chosen.length}; C3 ${c3}/12; C3X ${c3x}/12; depth p50=${median(chosen.map((c) => c.depth))}; ` +
    `depth p95=${pct(chosen.map((c) => c.depth), 95)}; wrote ${OUT}`,
);
