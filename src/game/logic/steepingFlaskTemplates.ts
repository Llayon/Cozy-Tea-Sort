/**
 * Steeping-flask template bank (Gauntlet 20 — «Заварочная колба»).
 *
 * Selected profile F0: 4 colors, 6 vessels, 16 tea units, shape
 * 4,4,4,4,0,0 — four full mixed normal cups, one ordinary empty, one
 * empty cap4 / must-end-empty steeping flask. Every template is L2
 * and L3A CLEAN_DECANT from offline feasibility curation.
 *
 * Curation source: scripts/dev/out/g20-steeping-f0-2000.json
 * (F0 5000 confirmatory run is recorded separately).
 *
 * Pure domain data + instantiation. No React/Pixi imports.
 */

import type { TeaId } from '../types';

export type SteepingFlaskTeaRole = 'c0' | 'c1' | 'c2' | 'c3';
export type SteepingFlaskTemplateKind = 'steeping-flask';

export interface SteepingFlaskTemplate {
  id: string;
  kind: SteepingFlaskTemplateKind;
  depth: number;
  cups: SteepingFlaskTeaRole[][];
  flaskIndex: number;
}

export const STEEPING_FLASK_TEMPLATE_ATTEMPTS = 4;
export const STEEPING_FLASK_DEPTH_ACCEPT = { min: 9, max: 14 } as const;

export const STEEPING_FLASK_TEMPLATE_BANK: Record<SteepingFlaskTemplateKind, SteepingFlaskTemplate[]> = {
  'steeping-flask': [
    { id: 'steeping-f0-9-222', kind: 'steeping-flask', depth: 9, cups: [['c0','c3','c1','c1'],['c2','c1','c1','c2'],['c0','c0','c2','c2'],['c3','c3','c3','c0'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-9-491', kind: 'steeping-flask', depth: 9, cups: [['c1','c1','c1','c2'],['c2','c3','c3','c1'],['c0','c0','c2','c2'],['c0','c3','c3','c0'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-10-16', kind: 'steeping-flask', depth: 10, cups: [['c1','c2','c3','c3'],['c2','c2','c0','c0'],['c0','c2','c1','c1'],['c0','c3','c3','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-10-36', kind: 'steeping-flask', depth: 10, cups: [['c3','c3','c1','c2'],['c0','c1','c1','c2'],['c1','c2','c2','c0'],['c3','c3','c0','c0'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-10-65', kind: 'steeping-flask', depth: 10, cups: [['c2','c0','c3','c0'],['c1','c0','c0','c1'],['c1','c1','c3','c3'],['c3','c2','c2','c2'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-11-57', kind: 'steeping-flask', depth: 11, cups: [['c0','c3','c0','c0'],['c1','c2','c2','c3'],['c1','c1','c3','c1'],['c0','c2','c2','c3'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-11-83', kind: 'steeping-flask', depth: 11, cups: [['c3','c0','c0','c2'],['c0','c2','c2','c3'],['c1','c1','c3','c3'],['c0','c1','c2','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-11-149', kind: 'steeping-flask', depth: 11, cups: [['c2','c1','c0','c3'],['c0','c0','c1','c2'],['c3','c0','c2','c2'],['c3','c3','c1','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-12-7', kind: 'steeping-flask', depth: 12, cups: [['c1','c1','c2','c0'],['c0','c3','c2','c2'],['c0','c3','c3','c0'],['c1','c2','c3','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-12-8', kind: 'steeping-flask', depth: 12, cups: [['c1','c3','c3','c0'],['c2','c2','c3','c0'],['c2','c1','c0','c0'],['c1','c2','c3','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-12-18', kind: 'steeping-flask', depth: 12, cups: [['c3','c1','c1','c0'],['c2','c1','c3','c3'],['c0','c2','c2','c0'],['c2','c1','c3','c0'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-13-10', kind: 'steeping-flask', depth: 13, cups: [['c2','c0','c0','c0'],['c1','c2','c1','c3'],['c0','c2','c3','c1'],['c2','c3','c1','c3'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-13-15', kind: 'steeping-flask', depth: 13, cups: [['c2','c3','c2','c2'],['c1','c0','c1','c0'],['c0','c1','c3','c3'],['c1','c3','c0','c2'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-13-21', kind: 'steeping-flask', depth: 13, cups: [['c3','c3','c1','c1'],['c0','c3','c0','c2'],['c0','c2','c1','c2'],['c0','c2','c3','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-14-24', kind: 'steeping-flask', depth: 14, cups: [['c1','c2','c1','c0'],['c2','c2','c0','c1'],['c3','c2','c1','c3'],['c0','c3','c0','c3'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-14-26', kind: 'steeping-flask', depth: 14, cups: [['c0','c3','c1','c3'],['c2','c3','c2','c0'],['c1','c2','c1','c3'],['c2','c0','c0','c1'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-14-45', kind: 'steeping-flask', depth: 14, cups: [['c0','c2','c3','c3'],['c0','c1','c2','c1'],['c3','c0','c2','c1'],['c1','c2','c3','c0'],[],[]], flaskIndex: 5 },
    { id: 'steeping-f0-12-20', kind: 'steeping-flask', depth: 12, cups: [['c1','c1','c0','c3'],['c2','c0','c2','c2'],['c1','c3','c0','c0'],['c3','c1','c2','c3'],[],[]], flaskIndex: 5 },
  ],
};

export const ALL_STEEPING_FLASK_TEMPLATES: SteepingFlaskTemplate[] = [
  ...STEEPING_FLASK_TEMPLATE_BANK['steeping-flask'],
];

export function instantiateSteepingFlaskTemplate(
  tpl: SteepingFlaskTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; flaskSlot: number } {
  const roleToTea = new Map<SteepingFlaskTeaRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, flaskSlot: tpl.flaskIndex };
}

export const STEEPING_FLASK_FALLBACK_TEMPLATE_ID =
  STEEPING_FLASK_TEMPLATE_BANK['steeping-flask'][0]?.id ?? 'steeping-f0-fallback';

