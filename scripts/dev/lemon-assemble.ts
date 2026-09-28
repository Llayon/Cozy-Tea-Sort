/** Dev-only: assemble src/game/logic/lemonTemplates.ts from curated bank txt files. */
import fs from 'node:fs';

const ch = fs.readFileSync('scripts/dev/lemon-bank-challenge18.txt', 'utf8').trimEnd();
const tp = fs.readFileSync('scripts/dev/lemon-bank-teapot18.txt', 'utf8').trimEnd();
const pk = fs.readFileSync('scripts/dev/lemon-bank-peak18.txt', 'utf8').trimEnd();

const out = `/**
 * Floating-lemon template bank (Gauntlet 5).
 *
 * WHY: same reason as the target/sink/tasting banks — random-deal lemon
 * generation would need many state-aware BFS validations per level,
 * stalling the main thread. These topologies were discovered OFFLINE by
 * the production generator + state-aware solver, then relativized to
 * palette roles with ONE fixed point:
 *   c0 = LEMON TARGET TEA (always sea_buckthorn at runtime — NEVER
 *        permuted away, or the lemon goal would break);
 *   c1..c4 = remaining palette teas (seeded permutation allowed: a full
 *        color isomorphism fixing c0, so the discovered solver depth
 *        holds EXACTLY for every palette containing sea_buckthorn).
 *
 * Every template: filled standard vessels hold the full
 * TEA_UNITS_PER_COLOR pool, ordinary empties remain, the lemon starts on
 * a full mixed plain-standard vessel (never pre-solved, never Mystery),
 * and the teapot (where applicable) sits full + mixed at slot 0.
 * Constraint metadata is applied during instantiation; mystery is
 * assigned separately at runtime excluding the lemon host.
 *
 * Participation curation (Gauntlet 5 §46): every committed template's
 * optimal production solution relocates the lemon at least once
 * (tracked across the replay) and finishes it on full sea_buckthorn.
 * Bank fairness: fatal-first-move ratio ~0; wrong-final deadlocks ~0.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through \`finalizeCandidate\`.
 */

import { FLOATING_INGREDIENT_TYPES, type TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type LemonTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type LemonTemplateKind = 'lemon-challenge' | 'lemon-mystery-peak' | 'teapot-lemon-challenge';

export interface LemonTemplate {
  id: string;
  kind: LemonTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (\`[]\` = empty vessel). */
  cups: LemonTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Initial lemon host slot (full mixed plain-standard vessel). */
  lemonHost: number;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface LemonTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const LEMON_TEMPLATE_SPECS: Record<LemonTemplateKind, LemonTemplateSpec> = {
  'lemon-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
  'lemon-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0 },
  'teapot-lemon-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1 },
};

/** Bounded runtime template attempts (never a 150-scan for lemon). */
export const LEMON_TEMPLATE_ATTEMPTS = 4;

/** The lemon's target tea (single source; templates bind c0 to this). */
export const LEMON_TARGET_TEA: TeaId = FLOATING_INGREDIENT_TYPES.lemon.targetTeaId;

export const LEMON_TEMPLATE_BANK: Record<LemonTemplateKind, LemonTemplate[]> = {
  'lemon-challenge': [
${ch}
  ],
  'lemon-mystery-peak': [
${pk}
  ],
  'teapot-lemon-challenge': [
${tp}
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_LEMON_TEMPLATES: LemonTemplate[] = [
  ...LEMON_TEMPLATE_BANK['lemon-challenge'],
  ...LEMON_TEMPLATE_BANK['lemon-mystery-peak'],
  ...LEMON_TEMPLATE_BANK['teapot-lemon-challenge'],
];

/**
 * Resolve role → tea for a concrete palette. \`otherOrder\`: palette teas
 * (excluding the lemon target) serving roles c1..c4, in order. c0 ALWAYS
 * maps to sea_buckthorn — callers must never permute it away.
 */
export function resolveLemonRoleTeas(
  palette: TeaId[],
  otherOrder: TeaId[],
): Map<LemonTeaRole, TeaId> {
  const map = new Map<LemonTeaRole, TeaId>([['c0', LEMON_TARGET_TEA]]);
  const roles: LemonTeaRole[] = ['c1', 'c2', 'c3', 'c4'];
  const others = palette.filter((t) => t !== LEMON_TARGET_TEA);
  roles.forEach((role, i) => {
    const tea = otherOrder[i] ?? others[i];
    if (tea !== undefined) map.set(role, tea);
  });
  return map;
}

/**
 * Instantiate a template against a concrete palette + role bijection.
 * Any bijection fixing c0 is a full puzzle isomorphism (lemon host stays
 * a full mixed plain vessel, color counts preserved), so the discovered
 * depth is preserved exactly.
 */
export function instantiateLemonTemplate(
  tpl: LemonTemplate,
  palette: TeaId[],
  otherOrder: TeaId[] = palette.filter((t) => t !== LEMON_TARGET_TEA),
): { cups: TeaId[][]; teapotSlot: number | null; lemonHost: number } {
  const roleToTea = resolveLemonRoleTeas(palette, otherOrder);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, lemonHost: tpl.lemonHost };
}
`;

fs.writeFileSync('src/game/logic/lemonTemplates.ts', out);
console.log('assembled src/game/logic/lemonTemplates.ts');
