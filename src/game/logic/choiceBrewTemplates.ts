/**
 * Choice Brew production template bank (Gauntlet 22).
 *
 * Curated from G30 Choice Brew confirmatory evidence (N2000, integrated /
 * non-ritual / non-incidental boards with post-milestone work >= 2). Each
 * template is role-based (c0..c3 over the sorted palette) so TeaRole
 * permutations preserve structure; every production instance is
 * replay-validated at generation time. Frozen topology 4,4,4,4,0,0 with
 * the brewing vessel at index 4 and one ordinary empty at index 5.
 */
import type { TeaId } from '../types';

export type ChoiceBrewTeaRole = 'c0' | 'c1' | 'c2' | 'c3';

export interface ChoiceBrewTemplate {
  id: string;
  /** Role-based root cups (indices 0..3 full, 4..5 empty). */
  cups: ChoiceBrewTeaRole[][];
  brewVesselIndex: 4;
  /** Allowed pair as roles (unordered). */
  pairRoles: readonly [ChoiceBrewTeaRole, ChoiceBrewTeaRole];
  /** Solver-verified FULL depth on the identity instantiation. */
  depth: number;
  /** 1-based move index where the milestone triggers (identity). */
  stageMove: number;
  /** Post-milestone ordinary moves (identity evidence). */
  postWork: number;
}

export const CHOICE_BREW_TEMPLATE_ATTEMPTS = 6;
export const CHOICE_BREW_DEPTH_ACCEPT = { min: 8, max: 18 };
export const CHOICE_BREW_FALLBACK_TEMPLATE_ID = 'choice-brew-01';

export const CHOICE_BREW_TEMPLATE_BANK: ChoiceBrewTemplate[] = [
  {
    id: 'choice-brew-01',
    cups: [['c2', 'c3', 'c3', 'c2'], ['c1', 'c1', 'c3', 'c1'], ['c0', 'c2', 'c0', 'c1'], ['c0', 'c3', 'c2', 'c0'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c1'],
    depth: 13,
    stageMove: 4,
    postWork: 8,
  },
  {
    id: 'choice-brew-02',
    cups: [['c2', 'c0', 'c2', 'c1'], ['c3', 'c0', 'c1', 'c3'], ['c0', 'c2', 'c1', 'c1'], ['c2', 'c3', 'c0', 'c3'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c1', 'c3'],
    depth: 14,
    stageMove: 4,
    postWork: 9,
  },
  {
    id: 'choice-brew-03',
    cups: [['c1', 'c1', 'c3', 'c1'], ['c0', 'c2', 'c2', 'c2'], ['c0', 'c3', 'c3', 'c2'], ['c1', 'c0', 'c0', 'c3'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c1', 'c2'],
    depth: 10,
    stageMove: 2,
    postWork: 7,
  },
  {
    id: 'choice-brew-04',
    cups: [['c2', 'c1', 'c0', 'c3'], ['c1', 'c2', 'c0', 'c0'], ['c3', 'c1', 'c3', 'c0'], ['c1', 'c2', 'c3', 'c2'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c2'],
    depth: 14,
    stageMove: 4,
    postWork: 9,
  },
  {
    id: 'choice-brew-05',
    cups: [['c1', 'c2', 'c2', 'c1'], ['c2', 'c0', 'c2', 'c3'], ['c1', 'c0', 'c1', 'c0'], ['c0', 'c3', 'c3', 'c3'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c3'],
    depth: 11,
    stageMove: 2,
    postWork: 8,
  },
  {
    id: 'choice-brew-06',
    cups: [['c0', 'c1', 'c0', 'c3'], ['c1', 'c3', 'c3', 'c3'], ['c2', 'c0', 'c2', 'c2'], ['c1', 'c1', 'c0', 'c2'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c2', 'c3'],
    depth: 11,
    stageMove: 2,
    postWork: 8,
  },
  {
    id: 'choice-brew-07',
    cups: [['c0', 'c3', 'c0', 'c1'], ['c0', 'c2', 'c3', 'c1'], ['c3', 'c3', 'c2', 'c1'], ['c2', 'c0', 'c2', 'c1'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c1'],
    depth: 13,
    stageMove: 4,
    postWork: 8,
  },
  {
    id: 'choice-brew-08',
    cups: [['c1', 'c3', 'c3', 'c3'], ['c2', 'c0', 'c1', 'c3'], ['c0', 'c2', 'c0', 'c1'], ['c2', 'c2', 'c1', 'c0'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c1', 'c3'],
    depth: 11,
    stageMove: 2,
    postWork: 8,
  },
  {
    id: 'choice-brew-09',
    cups: [['c1', 'c0', 'c2', 'c2'], ['c0', 'c3', 'c1', 'c2'], ['c0', 'c0', 'c1', 'c2'], ['c1', 'c3', 'c3', 'c3'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c1', 'c2'],
    depth: 11,
    stageMove: 3,
    postWork: 7,
  },
  {
    id: 'choice-brew-10',
    cups: [['c2', 'c0', 'c0', 'c0'], ['c3', 'c1', 'c3', 'c2'], ['c3', 'c2', 'c1', 'c0'], ['c1', 'c3', 'c2', 'c1'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c2'],
    depth: 12,
    stageMove: 3,
    postWork: 8,
  },
  {
    id: 'choice-brew-11',
    cups: [['c0', 'c0', 'c1', 'c3'], ['c1', 'c0', 'c2', 'c0'], ['c2', 'c3', 'c3', 'c3'], ['c1', 'c2', 'c2', 'c1'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c3'],
    depth: 10,
    stageMove: 2,
    postWork: 7,
  },
  {
    id: 'choice-brew-12',
    cups: [['c1', 'c3', 'c1', 'c2'], ['c1', 'c0', 'c0', 'c3'], ['c0', 'c2', 'c2', 'c2'], ['c3', 'c3', 'c1', 'c0'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c2', 'c3'],
    depth: 10,
    stageMove: 2,
    postWork: 7,
  },
  {
    id: 'choice-brew-13',
    cups: [['c1', 'c0', 'c2', 'c1'], ['c3', 'c2', 'c0', 'c3'], ['c0', 'c1', 'c1', 'c2'], ['c0', 'c3', 'c2', 'c3'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c1'],
    depth: 15,
    stageMove: 6,
    postWork: 8,
  },
  {
    id: 'choice-brew-14',
    cups: [['c1', 'c3', 'c3', 'c3'], ['c0', 'c1', 'c3', 'c2'], ['c2', 'c1', 'c0', 'c0'], ['c2', 'c1', 'c2', 'c0'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c1', 'c3'],
    depth: 12,
    stageMove: 3,
    postWork: 8,
  },
  {
    id: 'choice-brew-15',
    cups: [['c3', 'c0', 'c1', 'c1'], ['c0', 'c1', 'c0', 'c3'], ['c3', 'c2', 'c2', 'c2'], ['c1', 'c3', 'c0', 'c2'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c1', 'c2'],
    depth: 11,
    stageMove: 3,
    postWork: 7,
  },
  {
    id: 'choice-brew-16',
    cups: [['c3', 'c1', 'c0', 'c0'], ['c3', 'c1', 'c3', 'c0'], ['c2', 'c1', 'c2', 'c0'], ['c2', 'c3', 'c1', 'c2'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c2'],
    depth: 14,
    stageMove: 5,
    postWork: 8,
  },
  {
    id: 'choice-brew-17',
    cups: [['c0', 'c2', 'c3', 'c3'], ['c3', 'c3', 'c0', 'c2'], ['c1', 'c0', 'c1', 'c2'], ['c1', 'c2', 'c1', 'c0'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c0', 'c3'],
    depth: 13,
    stageMove: 5,
    postWork: 7,
  },
  {
    id: 'choice-brew-18',
    cups: [['c1', 'c3', 'c0', 'c2'], ['c0', 'c0', 'c3', 'c2'], ['c3', 'c1', 'c2', 'c2'], ['c3', 'c1', 'c1', 'c0'], [], []],
    brewVesselIndex: 4,
    pairRoles: ['c2', 'c3'],
    depth: 11,
    stageMove: 3,
    postWork: 7,
  },
];

export const ALL_CHOICE_BREW_TEMPLATES: readonly ChoiceBrewTemplate[] = CHOICE_BREW_TEMPLATE_BANK;

/** Instantiate roles against a concrete palette order (bijection). */
export function instantiateChoiceBrewTemplate(
  tpl: ChoiceBrewTemplate,
  order: readonly TeaId[],
): { cups: TeaId[][]; brewVesselIndex: 4; allowedTeas: readonly [TeaId, TeaId] } {
  const roleTea = (r: ChoiceBrewTeaRole): TeaId => order[Number(r.slice(1))] as TeaId;
  return {
    cups: tpl.cups.map((cup) => cup.map(roleTea)),
    brewVesselIndex: 4,
    allowedTeas: [roleTea(tpl.pairRoles[0]), roleTea(tpl.pairRoles[1])],
  };
}
