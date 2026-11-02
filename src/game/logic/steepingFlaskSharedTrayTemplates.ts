/**
 * G21 FLASK_TRAY / «Колба + поднос» production bank.
 *
 * Winner evidence: E6 4c/6v 4,4,3,3,2,0; tray on [2,3] (3+3=6/6),
 * empty steeping flask at 5. 12 canonical templates curated from the
 * 5000-board E6 confirmatory run. Every template is FULL C2 (flask cycle
 * + tray pressure/release/refill) and survives 6 role permutations.
 *
 * Pure domain data + instantiation. No React/Pixi imports.
 */

import type { TeaId } from '../types';

export type SteepingFlaskSharedTrayRole = 'c0' | 'c1' | 'c2' | 'c3';
export type SteepingFlaskSharedTrayKind = 'flask-tray';

export interface SteepingFlaskSharedTrayTemplate {
  id: string;
  kind: SteepingFlaskSharedTrayKind;
  depth: number;
  cups: SteepingFlaskSharedTrayRole[][];
  trayMembers: readonly [number, number];
  flaskIndex: number;
  /** Curation evidence only; runtime never reads this. */
  c3: boolean;
  c3x: boolean;
}

export const STEEPING_FLASK_SHARED_TRAY_TEMPLATE_ATTEMPTS = 4;
export const STEEPING_FLASK_SHARED_TRAY_DEPTH_ACCEPT = { min: 10, max: 15 } as const;

export const STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK: Record<SteepingFlaskSharedTrayKind, SteepingFlaskSharedTrayTemplate[]> = {
  'flask-tray': [
    { id: 'flask-tray-10-23', kind: 'flask-tray', depth: 10, cups: [['c3','c1','c1','c3'],['c0','c0','c0','c1'],['c0','c2','c2'],['c3','c2','c3'],['c1','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-10-174', kind: 'flask-tray', depth: 10, cups: [['c2','c2','c3','c3'],['c0','c3','c0','c0'],['c3','c1','c1'],['c0','c2','c1'],['c1','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-11-60', kind: 'flask-tray', depth: 11, cups: [['c0','c1','c1','c3'],['c3','c2','c3','c3'],['c1','c1','c0'],['c2','c0','c2'],['c2','c0'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-11-72', kind: 'flask-tray', depth: 11, cups: [['c0','c2','c2','c1'],['c3','c2','c3','c3'],['c3','c0','c1'],['c1','c0','c0'],['c1','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-11-73', kind: 'flask-tray', depth: 11, cups: [['c2','c0','c1','c3'],['c0','c0','c2','c2'],['c3','c1','c1'],['c0','c1','c3'],['c3','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-12-7', kind: 'flask-tray', depth: 12, cups: [['c0','c3','c2','c1'],['c3','c0','c1','c2'],['c2','c2','c1'],['c3','c0','c0'],['c1','c3'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-12-11', kind: 'flask-tray', depth: 12, cups: [['c1','c0','c1','c3'],['c1','c3','c3','c2'],['c0','c0','c2'],['c0','c2','c1'],['c3','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-12-13', kind: 'flask-tray', depth: 12, cups: [['c2','c0','c2','c3'],['c1','c3','c1','c0'],['c1','c1','c0'],['c3','c3','c2'],['c0','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-13-10', kind: 'flask-tray', depth: 13, cups: [['c1','c2','c1','c1'],['c3','c0','c3','c2'],['c0','c2','c0'],['c3','c1','c3'],['c0','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-13-17', kind: 'flask-tray', depth: 13, cups: [['c2','c3','c1','c0'],['c3','c0','c2','c3'],['c2','c1','c1'],['c0','c3','c0'],['c1','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-14-1', kind: 'flask-tray', depth: 14, cups: [['c1','c0','c2','c0'],['c0','c3','c2','c3'],['c2','c3','c1'],['c1','c3','c1'],['c0','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
    { id: 'flask-tray-14-24', kind: 'flask-tray', depth: 14, cups: [['c3','c2','c3','c1'],['c0','c2','c0','c1'],['c3','c0','c1'],['c3','c0','c2'],['c1','c2'],[]], trayMembers: [2, 3], flaskIndex: 5, c3: true, c3x: true },
  ],
};

export const ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES: SteepingFlaskSharedTrayTemplate[] = [
  ...STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK['flask-tray'],
];

export function instantiateSteepingFlaskSharedTrayTemplate(
  tpl: SteepingFlaskSharedTrayTemplate,
  palette: TeaId[],
  order: TeaId[] = [...palette],
): { cups: TeaId[][]; trayMembers: readonly [number, number]; flaskSlot: number } {
  const roleToTea = new Map<SteepingFlaskSharedTrayRole, TeaId>([
    ['c0', order[0] as TeaId],
    ['c1', order[1] as TeaId],
    ['c2', order[2] as TeaId],
    ['c3', order[3] as TeaId],
  ]);
  const cups = tpl.cups.map((cup) => cup.map((role) => roleToTea.get(role) as TeaId));
  return { cups, trayMembers: tpl.trayMembers, flaskSlot: tpl.flaskIndex };
}

export const STEEPING_FLASK_SHARED_TRAY_FALLBACK_TEMPLATE_ID =
  STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK['flask-tray'][0]?.id ?? 'flask-tray-fallback';

