/**
 * G20 DEV curation — select 18 canonical F0 steeping-flask templates from
 * the feasibility candidate pool and emit the typed production bank.
 *
 * Run after steeping-flask-search F0 (with commitTea metadata):
 *   bunx tsx scripts/dev/steeping-flask-curate.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Role = 'c0' | 'c1' | 'c2' | 'c3';

interface Candidate {
  seedAttempt: number;
  depth: number;
  visited: number;
  cups: Role[][];
  flaskIndex: number;
  commitDepth: number;
  commitTea: string;
  pressureDepth: number;
  readyDepth: number;
  releaseDepth: number;
  emptyDepth: number;
  cleanDecant: boolean;
  partialRelease: boolean;
  controlBreaksSteeping: boolean;
  controlMinMoves: number | null;
}

const ROOT = resolve(import.meta.dirname, '../..');
const INPUT = resolve(ROOT, 'scripts/dev/out/g20-steeping-f0-2000.json');
const OUT = resolve(ROOT, 'src/game/logic/steepingFlaskTemplates.ts');

const data = JSON.parse(readFileSync(INPUT, 'utf8')) as { l2Candidates: Candidate[] };
const pool = data.l2Candidates.filter((c) => {
  if (!c.cleanDecant || c.partialRelease) return false;
  if (c.depth < 9 || c.depth > 14) return false;
  if (c.commitDepth / c.depth > 0.6) return false;
  if (c.readyDepth - c.commitDepth < 2) return false;
  return true;
});

if (pool.length < 18) {
  throw new Error(`only ${pool.length} eligible candidates; need 18`);
}

function roleIndex(tea: string): number {
  return ({ matcha: 0, sea_buckthorn: 1, karkade: 2, milk_oolong: 3 } as Record<string, number>)[tea] ?? 0;
}

function rotateVessels(
  cups: Role[][],
  flaskIndex: number,
  shift: number,
): { cups: Role[][]; flaskIndex: number } {
  const vessels = cups.map((cup, i) => ({ cup, flask: i === flaskIndex }));
  const rotated = [...vessels.slice(shift), ...vessels.slice(0, shift)];
  return {
    cups: rotated.map((v) => v.cup),
    flaskIndex: rotated.findIndex((v) => v.flask),
  };
}

const byDepth = new Map<number, Candidate[]>();
for (const c of pool) {
  const list = byDepth.get(c.depth) ?? [];
  list.push(c);
  byDepth.set(c.depth, list);
}
for (const list of byDepth.values()) {
  list.sort((a, b) => {
    if (a.controlBreaksSteeping !== b.controlBreaksSteeping) return a.controlBreaksSteeping ? -1 : 1;
    if (a.commitDepth !== b.commitDepth) return a.commitDepth - b.commitDepth;
    return a.seedAttempt - b.seedAttempt;
  });
}

const chosen: Candidate[] = [];
const depths = [...byDepth.keys()].sort((a, b) => a - b);
for (const depth of depths) {
  const list = byDepth.get(depth) as Candidate[];
  const quota = depth >= 9 && depth <= 14 ? 3 : 1;
  for (const c of list.slice(0, quota)) chosen.push(c);
  if (chosen.length >= 18) break;
}
if (chosen.length < 18) {
  for (const c of pool) {
    if (chosen.length >= 18) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
}
const selected = chosen.slice(0, 18);

// TeaRole diversity gate (committed tea is trace metadata only).
const roles = new Set(selected.map((c) => c.commitTea));
if (roles.size < 3) throw new Error(`committed TeaRole diversity ${roles.size} < 3`);

const lines: string[] = [];
lines.push('/**');
lines.push(' * Steeping-flask template bank (Gauntlet 20 — «Заварочная колба»).');
lines.push(' *');
lines.push(' * Selected profile F0: 4 colors, 6 vessels, 16 tea units, shape');
lines.push(' * 4,4,4,4,0,0 — four full mixed normal cups, one ordinary empty, one');
lines.push(' * empty cap4 / must-end-empty steeping flask. Every template is L2');
lines.push(' * and L3A CLEAN_DECANT from offline feasibility curation.');
lines.push(' *');
lines.push(' * Curation source: scripts/dev/out/g20-steeping-f0-2000.json');
lines.push(' * (F0 5000 confirmatory run is recorded separately).');
lines.push(' *');
lines.push(' * Pure domain data + instantiation. No React/Pixi imports.');
lines.push(' */');
lines.push('');
lines.push("import type { TeaId } from '../types';");
lines.push('');
lines.push("export type SteepingFlaskTeaRole = 'c0' | 'c1' | 'c2' | 'c3';");
lines.push("export type SteepingFlaskTemplateKind = 'steeping-flask';");
lines.push('');
lines.push('export interface SteepingFlaskTemplate {');
lines.push('  id: string;');
lines.push('  kind: SteepingFlaskTemplateKind;');
lines.push('  depth: number;');
lines.push('  cups: SteepingFlaskTeaRole[][];');
lines.push('  flaskIndex: number;');
lines.push('}');
lines.push('');
lines.push('export const STEEPING_FLASK_TEMPLATE_ATTEMPTS = 4;');
lines.push("export const STEEPING_FLASK_DEPTH_ACCEPT = { min: 9, max: 14 } as const;");
lines.push('');
lines.push('export const STEEPING_FLASK_TEMPLATE_BANK: Record<SteepingFlaskTemplateKind, SteepingFlaskTemplate[]> = {');
lines.push("  'steeping-flask': [");
// Keep the discovered vessel order (flask at its F0 search slot). A full
// vessel rotation is isomorphic for depth but changes solver tie-breaking,
// which can drop the L2 pressure event; readability wins over random slots.
const rotations = selected.map(() => 0);
selected.forEach((c, i) => {
  const shift = rotations[i] ?? 0;
  const { cups, flaskIndex } = rotateVessels(c.cups, c.flaskIndex, shift);
  const id = `steeping-f0-${c.depth}-${c.seedAttempt}`;
  lines.push(
    `    { id: '${id}', kind: 'steeping-flask', depth: ${c.depth}, cups: ${JSON.stringify(cups).replaceAll('"c', "'c").replaceAll('"', "'")}, flaskIndex: ${flaskIndex} },`,
  );
});
lines.push('  ],');
lines.push('};');
lines.push('');
lines.push('export const ALL_STEEPING_FLASK_TEMPLATES: SteepingFlaskTemplate[] = [');
lines.push("  ...STEEPING_FLASK_TEMPLATE_BANK['steeping-flask'],");
lines.push('];');
lines.push('');
lines.push('export function instantiateSteepingFlaskTemplate(');
lines.push('  tpl: SteepingFlaskTemplate,');
lines.push('  palette: TeaId[],');
lines.push('  order: TeaId[] = [...palette],');
lines.push('): { cups: TeaId[][]; flaskSlot: number } {');
lines.push('  const roleToTea = new Map<SteepingFlaskTeaRole, TeaId>([');
lines.push("    ['c0', order[0] as TeaId],");
lines.push("    ['c1', order[1] as TeaId],");
lines.push("    ['c2', order[2] as TeaId],");
lines.push("    ['c3', order[3] as TeaId],");
lines.push('  ]);');
lines.push('  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));');
lines.push('  return { cups, flaskSlot: tpl.flaskIndex };');
lines.push('}');
lines.push('');
lines.push('export const STEEPING_FLASK_FALLBACK_TEMPLATE_ID =');
lines.push("  STEEPING_FLASK_TEMPLATE_BANK['steeping-flask'][0]?.id ?? 'steeping-f0-fallback';");
lines.push('');

writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`selected ${selected.length} templates (${roles.size} committed TeaRoles) -> ${OUT}`);
console.log(selected.map((c) => `${c.depth}/${c.seedAttempt}`).join(', '));
