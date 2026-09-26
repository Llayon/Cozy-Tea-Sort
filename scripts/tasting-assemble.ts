/** Dev-only: assemble src/game/logic/tastingTemplates.ts from curated bank txt files. */
import fs from 'node:fs';

const ch = fs.readFileSync('scripts/tasting-bank-challenge18.txt', 'utf8').trimEnd();
const tp = fs.readFileSync('scripts/tasting-bank-teapot18.txt', 'utf8').trimEnd();
const pk = fs.readFileSync('scripts/tasting-bank-peak18.txt', 'utf8').trimEnd();

const header = `/**
 * Tasting-bowl template bank (Gauntlet 4).
 *
 * WHY: same reason as the target/sink banks — random-deal tasting
 * generation would need many BFS validations per level, stalling the
 * main thread. These topologies were discovered OFFLINE by the production
 * generator + solver, then relativized to palette roles:
 *   c0..c4 = palette teas in request-palette order (instantiation applies
 *   a seeded permutation — a full puzzle isomorphism, so the discovered
 *   solver depth holds EXACTLY for every palette).
 *
 * Every template: filled standard vessels hold the full
 * TEA_UNITS_PER_COLOR pool, exactly one ordinary standard empty remains,
 * the tasting bowl sits EMPTY (capacity 2, must-end-empty) at the stable
 * last slot, and the teapot (where applicable) sits full + mixed at slot
 * 0. Constraint metadata is applied during instantiation; mystery is
 * assigned separately at runtime on a standard normal cup.
 *
 * Participation curation (Gauntlet 4 §19): every committed template was
 * verified OFFLINE — its production solver solution ENTERS the tasting
 * bowl AND later EXITS it (bowl starts empty, must finish empty). Bank
 * fairness: fatal-first-move ratio ~0 across the bank; every legal
 * opening stays solvable.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through \`finalizeCandidate\`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type TastingTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type TastingTemplateKind = 'tasting-challenge' | 'tasting-mystery-peak' | 'teapot-tasting-challenge';

export interface TastingTemplate {
  id: string;
  kind: TastingTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (\`[]\` = empty vessel; last slot = empty tasting bowl). */
  cups: TastingTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Tasting-bowl slot (stable last vessel index). */
  tasting: number;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface TastingTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
  tastingCupCount: number;
}

export const TASTING_TEMPLATE_SPECS: Record<TastingTemplateKind, TastingTemplateSpec> = {
  'tasting-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0, tastingCupCount: 1 },
  'tasting-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0, tastingCupCount: 1 },
  'teapot-tasting-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1, tastingCupCount: 1 },
};

/** Bounded runtime template attempts (never a 150-scan for tasting). */
export const TASTING_TEMPLATE_ATTEMPTS = 4;

export const TASTING_TEMPLATE_BANK: Record<TastingTemplateKind, TastingTemplate[]> = {
  'tasting-challenge': [
${ch}
  ],
  'tasting-mystery-peak': [
${pk}
  ],
  'teapot-tasting-challenge': [
${tp}
  ],
};
`;

const footer = `
/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_TASTING_TEMPLATES: TastingTemplate[] = [
  ...TASTING_TEMPLATE_BANK['tasting-challenge'],
  ...TASTING_TEMPLATE_BANK['tasting-mystery-peak'],
  ...TASTING_TEMPLATE_BANK['teapot-tasting-challenge'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * \`order\`: palette teas serving roles c0..c4 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (tasting stays empty C2/E,
 * teapot stays mixed-full, color counts preserved), so the discovered
 * depth is preserved exactly.
 */
export function instantiateTastingTemplate(
  tpl: TastingTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; teapotSlot: number | null; tastingSlot: number } {
  const roleToTea = new Map<TastingTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
    ['c4', order[4] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, tastingSlot: tpl.tasting };
}
`;

fs.writeFileSync('src/game/logic/tastingTemplates.ts', header + footer);
console.log('assembled src/game/logic/tastingTemplates.ts');
