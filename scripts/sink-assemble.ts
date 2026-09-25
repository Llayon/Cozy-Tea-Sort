/** Dev-only: assemble src/game/logic/sinkTemplates.ts from curated bank txt files. */
import fs from 'node:fs';

const ch = fs.readFileSync('scripts/sink-bank-challenge.txt', 'utf8').trimEnd();
const tp = fs.readFileSync('scripts/sink-bank-teapot18.txt', 'utf8').trimEnd();
const pk = fs.readFileSync('scripts/sink-bank-peak18.txt', 'utf8').trimEnd();

const header = `/**
 * Sink-only guest-cup template bank (Gauntlet 3).
 *
 * WHY: same reason as the target bank (Gauntlet 2.1) — random-deal sink
 * generation would need many BFS validations per level, stalling the main
 * thread. These topologies were discovered OFFLINE by the production
 * generator + solver, then relativized to palette roles:
 *   c0..c4 = palette teas in request-palette order (instantiation applies
 *   a seeded permutation — a full puzzle isomorphism, so the discovered
 *   solver depth holds EXACTLY for every palette).
 * The sink carries no named tea, so there is no t0/t1 role requirement.
 *
 * Every template: filled tea vessels hold the full 4-units-per-color pool,
 * exactly one ordinary empty remains, the sink sits EMPTY at the stable
 * last slot, and the teapot (where applicable) sits full + mixed at slot
 * 0. Constraint metadata is applied during instantiation; mystery is
 * assigned separately at runtime on an untargeted normal cup.
 *
 * Fairness curation (Gauntlet 3 §26–27): every committed template was
 * analyzed OFFLINE for root branching (legal / solvable / optimal /
 * fatal / sink-directed first moves). Result: fatal-first-move ratio 0
 * across the bank — all legal openings stay solvable, all sink-directed
 * openings stay solvable. Sink-only creates planning, not traps.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through \`finalizeCandidate\`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea role inside template cup patterns. */
export type SinkTeaRole = 'c0' | 'c1' | 'c2' | 'c3' | 'c4';

export type SinkTemplateKind = 'sink-challenge' | 'sink-mystery-peak' | 'teapot-sink-challenge';

export interface SinkTemplate {
  id: string;
  kind: SinkTemplateKind;
  /** Discovered solver depth (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (\`[]\` = empty vessel; last slot = empty sink). */
  cups: SinkTeaRole[][];
  /** Teapot slot when present, else null. */
  teapot: number | null;
  /** Sink slot (stable last vessel index). */
  sink: number;
}

/** Generation contract each kind serves (mirrors the canonical requests). */
export interface SinkTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
  sinkOnlyCount: number;
}

export const SINK_TEMPLATE_SPECS: Record<SinkTemplateKind, SinkTemplateSpec> = {
  'sink-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0, sinkOnlyCount: 1 },
  'sink-mystery-peak': { numColors: 5, emptyCups: 2, hasMysteryLayer: true, sourceOnlyCount: 0, sinkOnlyCount: 1 },
  'teapot-sink-challenge': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 1, sinkOnlyCount: 1 },
};

/** Bounded runtime template attempts (never a 150-scan for sink). */
export const SINK_TEMPLATE_ATTEMPTS = 4;

export const SINK_TEMPLATE_BANK: Record<SinkTemplateKind, SinkTemplate[]> = {
  'sink-challenge': [
${ch}
  ],
  'sink-mystery-peak': [
${pk}
  ],
  'teapot-sink-challenge': [
${tp}
  ],
};
`;

const footer = `
/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_SINK_TEMPLATES: SinkTemplate[] = [
  ...SINK_TEMPLATE_BANK['sink-challenge'],
  ...SINK_TEMPLATE_BANK['sink-mystery-peak'],
  ...SINK_TEMPLATE_BANK['teapot-sink-challenge'],
];

/**
 * Instantiate a template against a concrete palette + role bijection.
 * \`order\`: palette teas serving roles c0..c4 (seeded permutation). Any
 * bijection is a full puzzle isomorphism (sink stays empty, teapot stays
 * mixed-full, color counts preserved), so the discovered depth is
 * preserved exactly.
 */
export function instantiateSinkTemplate(
  tpl: SinkTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; teapotSlot: number | null; sinkSlot: number } {
  const roleToTea = new Map<SinkTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
    ['c4', order[4] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, teapotSlot: tpl.teapot, sinkSlot: tpl.sink };
}
`;

fs.writeFileSync('src/game/logic/sinkTemplates.ts', header + footer);
console.log('assembled src/game/logic/sinkTemplates.ts');
