/**
 * Lemon+honey interaction template bank (Gauntlet 8 — «Лимон и мёд»).
 *
 * Every template is L2-strong: the production action-aware solver finds an
 * optimal solution with a cohost state, a SPLIT event (cohost pours: lemon
 * moves, honey stays), lemon/honey relocations and both final goals
 * (lemon on sea_buckthorn, honey on buckwheat). Six templates additionally
 * contain a JOINT MOVE event (cohost empties: both relocate together).
 *
 * Discovery: offline `scripts/dev/interaction-search.ts` over 4c/6v/2e
 * (10k seeds → 88 canonical-distinct L2, 9 L3), relativized with c0 fixed
 * to buckwheat and c1 fixed to sea_buckthorn (both target teas never
 * permuted away); c2/c3 permute freely (full isomorphism on non-target
 * teas, so discovered depth holds exactly). Initial hosts are distinct
 * mixed-full vessels by construction.
 *
 * Pure domain data + instantiation helpers. No React/Pixi imports.
 * Runtime re-validates each instantiation through `finalizeCandidate`.
 */

import type { TeaId } from '../types';

/** Palette-relative tea roles (c0 = buckwheat, c1 = sea_buckthorn). */
export type IngredientTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export type LemonHoneyTemplateKind = 'lemon-honey-interaction';

export interface LemonHoneyTemplate {
  id: string;
  kind: LemonHoneyTemplateKind;
  /** Discovered solver depth in pours (audit trail; runtime re-validates exactly). */
  depth: number;
  /** Final slot order (`[]` = empty vessel; 2 empties per G8 topology). */
  cups: IngredientTeaRole[][];
  /** Initial lemon host slot (full mixed vessel). */
  lemonHost: number;
  /** Initial honey host slot (full mixed vessel, distinct from lemon). */
  honeyHost: number;
}

/** Generation contract the kind serves (mirrors the canonical request). */
export interface LemonHoneyTemplateSpec {
  numColors: number;
  emptyCups: number;
  hasMysteryLayer: boolean;
  sourceOnlyCount: number;
}

export const LEMON_HONEY_TEMPLATE_SPECS: Record<LemonHoneyTemplateKind, LemonHoneyTemplateSpec> = {
  'lemon-honey-interaction': { numColors: 4, emptyCups: 2, hasMysteryLayer: false, sourceOnlyCount: 0 },
};

/** Measured depth bands (global bands untouched). Sweet 10–14, accept 8–16. */
export const LEMON_HONEY_DEPTH_SWEET: { min: number; max: number } = { min: 10, max: 14 };
export const LEMON_HONEY_DEPTH_ACCEPT: { min: number; max: number } = { min: 8, max: 16 };

/** Bounded runtime template attempts (never a 150-scan). */
export const LEMON_HONEY_TEMPLATE_ATTEMPTS = 4;

/** Target teas: template roles c0/c1 ALWAYS map here, never permuted away. */
export const LEMON_HONEY_TARGET_TEAS = {
  honey: 'buckwheat',
  lemon: 'sea_buckthorn',
} as const;

export const LEMON_HONEY_TEMPLATE_BANK: Record<LemonHoneyTemplateKind, LemonHoneyTemplate[]> = {
  'lemon-honey-interaction': [
    { id: 'lemon-honey-10-2426', kind: 'lemon-honey-interaction', depth: 10, cups: [['c0', 'c0', 'c1', 'c1'], ['c2', 'c3', 'c3', 'c3'], ['c1', 'c2', 'c1', 'c0'], [], ['c3', 'c2', 'c2', 'c0'], []], lemonHost: 0, honeyHost: 2 },
    { id: 'lemon-honey-10-3212', kind: 'lemon-honey-interaction', depth: 10, cups: [['c0', 'c1', 'c2', 'c0'], [], ['c1', 'c3', 'c2', 'c2'], ['c0', 'c3', 'c0', 'c2'], ['c3', 'c3', 'c1', 'c1'], []], lemonHost: 4, honeyHost: 0 },
    { id: 'lemon-honey-10-9624', kind: 'lemon-honey-interaction', depth: 10, cups: [[], ['c3', 'c3', 'c0', 'c1'], [], ['c0', 'c1', 'c2', 'c1'], ['c1', 'c0', 'c3', 'c3'], ['c0', 'c2', 'c2', 'c2']], lemonHost: 1, honeyHost: 3 },
    { id: 'lemon-honey-11-323', kind: 'lemon-honey-interaction', depth: 11, cups: [['c1', 'c2', 'c2', 'c1'], ['c0', 'c2', 'c1', 'c0'], ['c1', 'c0', 'c3', 'c3'], [], ['c0', 'c3', 'c3', 'c2'], []], lemonHost: 0, honeyHost: 1 },
    { id: 'lemon-honey-11-4823', kind: 'lemon-honey-interaction', depth: 11, cups: [['c0', 'c1', 'c0', 'c3'], ['c2', 'c2', 'c2', 'c1'], ['c1', 'c3', 'c2', 'c3'], ['c0', 'c0', 'c3', 'c1'], [], []], lemonHost: 3, honeyHost: 2 },
    { id: 'lemon-honey-11-7155', kind: 'lemon-honey-interaction', depth: 11, cups: [['c0', 'c3', 'c2', 'c3'], ['c1', 'c3', 'c1', 'c1'], ['c0', 'c1', 'c0', 'c3'], [], ['c0', 'c2', 'c2', 'c2'], []], lemonHost: 1, honeyHost: 2 },
    { id: 'lemon-honey-11-7242', kind: 'lemon-honey-interaction', depth: 11, cups: [['c0', 'c1', 'c2', 'c0'], ['c3', 'c3', 'c3', 'c1'], ['c1', 'c3', 'c2', 'c0'], [], [], ['c0', 'c2', 'c2', 'c1']], lemonHost: 1, honeyHost: 0 },
    { id: 'lemon-honey-11-9326', kind: 'lemon-honey-interaction', depth: 11, cups: [['c1', 'c2', 'c2', 'c2'], [], ['c3', 'c3', 'c2', 'c1'], ['c0', 'c1', 'c0', 'c0'], ['c3', 'c1', 'c0', 'c3'], []], lemonHost: 2, honeyHost: 0 },
    { id: 'lemon-honey-12-431', kind: 'lemon-honey-interaction', depth: 12, cups: [[], ['c2', 'c1', 'c0', 'c3'], ['c2', 'c2', 'c3', 'c1'], ['c0', 'c3', 'c2', 'c0'], [], ['c1', 'c1', 'c0', 'c3']], lemonHost: 2, honeyHost: 1 },
    { id: 'lemon-honey-12-4243', kind: 'lemon-honey-interaction', depth: 12, cups: [[], ['c2', 'c0', 'c2', 'c3'], ['c1', 'c3', 'c1', 'c2'], ['c0', 'c1', 'c2', 'c1'], ['c0', 'c0', 'c3', 'c3'], []], lemonHost: 3, honeyHost: 1 },
    { id: 'lemon-honey-12-4676', kind: 'lemon-honey-interaction', depth: 12, cups: [['c1', 'c0', 'c3', 'c2'], [], [], ['c2', 'c2', 'c2', 'c0'], ['c1', 'c3', 'c0', 'c3'], ['c0', 'c1', 'c3', 'c1']], lemonHost: 5, honeyHost: 0 },
    { id: 'lemon-honey-13-1397', kind: 'lemon-honey-interaction', depth: 13, cups: [['c1', 'c3', 'c0', 'c0'], ['c0', 'c1', 'c3', 'c2'], ['c2', 'c3', 'c0', 'c2'], ['c1', 'c3', 'c2', 'c1'], [], []], lemonHost: 3, honeyHost: 0 },
    { id: 'lemon-honey-13-3986', kind: 'lemon-honey-interaction', depth: 13, cups: [['c0', 'c2', 'c3', 'c1'], [], ['c1', 'c2', 'c0', 'c3'], ['c0', 'c2', 'c2', 'c1'], ['c3', 'c0', 'c1', 'c3'], []], lemonHost: 3, honeyHost: 4 },
    { id: 'lemon-honey-13-6060', kind: 'lemon-honey-interaction', depth: 13, cups: [['c2', 'c1', 'c3', 'c3'], [], ['c0', 'c3', 'c2', 'c0'], ['c2', 'c0', 'c2', 'c0'], ['c1', 'c1', 'c3', 'c1'], []], lemonHost: 4, honeyHost: 0 },
    { id: 'lemon-honey-13-7819', kind: 'lemon-honey-interaction', depth: 13, cups: [[], [], ['c1', 'c2', 'c0', 'c0'], ['c3', 'c3', 'c0', 'c1'], ['c0', 'c3', 'c2', 'c1'], ['c2', 'c1', 'c2', 'c3']], lemonHost: 3, honeyHost: 2 },
    { id: 'lemon-honey-14-5906', kind: 'lemon-honey-interaction', depth: 14, cups: [['c0', 'c1', 'c0', 'c2'], [], ['c1', 'c2', 'c3', 'c1'], [], ['c3', 'c0', 'c3', 'c2'], ['c0', 'c2', 'c3', 'c1']], lemonHost: 5, honeyHost: 2 },
    { id: 'lemon-honey-14-7389', kind: 'lemon-honey-interaction', depth: 14, cups: [['c0', 'c3', 'c2', 'c0'], ['c1', 'c2', 'c2', 'c1'], [], ['c3', 'c1', 'c0', 'c3'], ['c1', 'c2', 'c3', 'c0'], []], lemonHost: 1, honeyHost: 3 },
    { id: 'lemon-honey-14-8324', kind: 'lemon-honey-interaction', depth: 14, cups: [['c0', 'c3', 'c1', 'c1'], [], ['c2', 'c0', 'c2', 'c0'], ['c0', 'c3', 'c2', 'c2'], [], ['c1', 'c3', 'c1', 'c3']], lemonHost: 0, honeyHost: 5 },
  ],
};

/** All bank templates flattened (bank validation tests iterate this). */
export const ALL_LEMON_HONEY_TEMPLATES: LemonHoneyTemplate[] = [
  ...LEMON_HONEY_TEMPLATE_BANK['lemon-honey-interaction'],
];

/**
 * Resolve role → tea for a concrete palette. c0 ALWAYS maps to buckwheat
 * and c1 ALWAYS maps to sea_buckthorn (callers must never permute target
 * roles away); c2/c3 take the given order. Any c2/c3 swap is a full puzzle
 * isomorphism (both goals follow their teas), so discovered depth holds.
 */
export function resolveLemonHoneyRoleTeas(
  palette: TeaId[],
  c2c3Order: [TeaId, TeaId],
): Map<IngredientTeaRole, TeaId> {
  const map = new Map<IngredientTeaRole, TeaId>([
    ['c0', LEMON_HONEY_TARGET_TEAS.honey],
    ['c1', LEMON_HONEY_TARGET_TEAS.lemon],
  ]);
  map.set('c2', c2c3Order[0]);
  map.set('c3', c2c3Order[1]);
  void palette;
  return map;
}

/** Instantiate a template against a concrete palette + c2/c3 order. */
export function instantiateLemonHoneyTemplate(
  tpl: LemonHoneyTemplate,
  palette: TeaId[],
  c2c3Order?: [TeaId, TeaId],
): { cups: TeaId[][]; lemonHost: number; honeyHost: number } {
  const others = palette.filter(
    (t) => t !== LEMON_HONEY_TARGET_TEAS.honey && t !== LEMON_HONEY_TARGET_TEAS.lemon,
  );
  const order: [TeaId, TeaId] = c2c3Order ?? [others[0] as TeaId, others[1] as TeaId];
  const roleToTea = resolveLemonHoneyRoleTeas(palette, order);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, lemonHost: tpl.lemonHost, honeyHost: tpl.honeyHost };
}
