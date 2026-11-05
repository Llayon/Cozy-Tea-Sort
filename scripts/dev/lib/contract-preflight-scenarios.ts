/**
 * G24 DEV-ONLY built-in contract-preflight scenarios.
 *
 * Every shipped-mechanic fixture is instantiated from the ACTUAL production
 * template bank and its terminal options are derived by asking the ACTUAL
 * finality helpers (`cupEndStateSatisfied`, `isServeCupComplete`,
 * `isPairedTeaGoalSatisfied`, `isSharedCapacityOvercap`). No remembered
 * capacity/finality constants are duplicated here.
 *
 * This module is dev/test infrastructure. It is never imported by the app.
 */

import {
  STEEPING_FLASK_CONSTRAINT,
  TASTING_BOWL_CAPACITY,
  THERMOS_CAPACITY,
  cloneCupConstraint,
  cupCapacity,
  defaultCupConstraints,
  type CupConstraint,
  type TeaId,
} from '../../../src/game/types';
import { cupEndStateSatisfied } from '../../../src/game/logic/rules';
import { isServeCupComplete } from '../../../src/game/logic/servingOrder';
import {
  TEA_PAIR_GROUP,
  TEA_PAIR_MEMBER_CAPACITY,
  isPairedTeaGoalSatisfied,
} from '../../../src/game/logic/teaPair';
import { sharedCapacityLimit } from '../../../src/game/logic/sharedCapacity';
import {
  TASTING_TEMPLATE_BANK,
  instantiateTastingTemplate,
} from '../../../src/game/logic/tastingTemplates';
import {
  THERMOS_TEMPLATE_BANK,
  instantiateThermosTemplate,
} from '../../../src/game/logic/thermosTemplates';
import {
  SERVING_ORDER_TEMPLATE_BANK,
  instantiateServingOrderTemplate,
} from '../../../src/game/logic/servingOrderTemplates';
import {
  SERVING_ORDER_COMPOSITION_BANK,
  instantiateServingOrderCompositionTemplate,
} from '../../../src/game/logic/servingOrderCompositionTemplates';
import {
  SHARED_TRAY_TEMPLATE_BANK,
  instantiateSharedTrayTemplate,
} from '../../../src/game/logic/sharedTrayTemplates';
import {
  TEA_PAIR_TEMPLATE_BANK,
  instantiateTeaPairTemplate,
} from '../../../src/game/logic/teaPairTemplates';
import {
  STEEPING_FLASK_TEMPLATE_BANK,
  instantiateSteepingFlaskTemplate,
} from '../../../src/game/logic/steepingFlaskTemplates';
import {
  STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK,
  instantiateSteepingFlaskSharedTrayTemplate,
} from '../../../src/game/logic/steepingFlaskSharedTrayTemplates';
import {
  TARGET_TEMPLATE_BANK,
  instantiateTargetTemplate,
} from '../../../src/game/logic/targetTemplates';
import {
  BLEND_TEMPLATE_BANK,
  instantiateBlendTemplate,
} from '../../../src/game/logic/blendTemplates';
import {
  analyzeTerminalAllocation,
  type TeaAmounts,
  type TerminalAllocationProblem,
  type TerminalAllocationVerdict,
  type TerminalOption,
  type TerminalUnit,
} from '../../../src/game/logic/contractPreflight';

export interface ContractPreflightScenario {
  readonly name: string;
  readonly description: string;
  readonly problem: TerminalAllocationProblem;
  readonly expectedVerdict: TerminalAllocationVerdict;
  readonly expectedReasonIncludes?: readonly string[];
}

const PALETTE4: readonly TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function inventoryFromCups(cups: readonly (readonly TeaId[])[], teaIds: readonly TeaId[]): TeaAmounts {
  const amounts: Partial<Record<TeaId, number>> = {};
  for (const tea of teaIds) amounts[tea] = 0;
  for (const cup of cups) {
    for (const layer of cup) {
      amounts[layer] = (amounts[layer] ?? 0) + 1;
    }
  }
  return amounts;
}

function layersAmounts(layers: readonly TeaId[]): TeaAmounts {
  const amounts: Partial<Record<TeaId, number>> = {};
  for (const layer of layers) amounts[layer] = (amounts[layer] ?? 0) + 1;
  return amounts;
}

function amountKey(amounts: TeaAmounts, teaIds: readonly TeaId[]): string {
  return teaIds.map((tea) => amounts[tea] ?? 0).join(',');
}

function dedupeOptions(options: readonly TerminalOption[], teaIds: readonly TeaId[]): TerminalOption[] {
  const seen = new Set<string>();
  const out: TerminalOption[] = [];
  for (const option of options) {
    const key = amountKey(option.amounts, teaIds);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(option);
  }
  return out;
}

function terminalCandidateContents(
  constraint: CupConstraint | undefined,
  teaIds: readonly TeaId[],
): TeaId[][] {
  const cap = cupCapacity(constraint);
  const out: TeaId[][] = [[]];
  for (const tea of teaIds) {
    out.push(Array.from({ length: cap }, () => tea));
  }
  return out;
}

function singleVesselUnit(
  index: number,
  constraint: CupConstraint | undefined,
  teaIds: readonly TeaId[],
): TerminalUnit {
  const candidates = terminalCandidateContents(constraint, teaIds);
  const options: TerminalOption[] = [];
  for (const layers of candidates) {
    const satisfied = constraint?.serveOrder !== undefined
      ? isServeCupComplete(layers, constraint)
      : cupEndStateSatisfied(layers, constraint);
    if (!satisfied) continue;
    options.push({
      amounts: layersAmounts(layers),
      label: layers.length === 0 ? 'empty' : `${layers[0]} x${layers.length}`,
    });
  }
  if (options.length === 0) {
    throw new Error(`terminal fixture cup ${index} has no legal terminal option`);
  }
  return {
    id: `cup-${index}`,
    label: `cup ${index}`,
    kind: 'vessel',
    members: [`cup-${index}`],
    capacity: cupCapacity(constraint),
    options: dedupeOptions(options, teaIds),
  };
}

function cartesianMemberContents(
  memberIndices: readonly number[],
  constraints: readonly CupConstraint[],
  teaIds: readonly TeaId[],
): TeaId[][][] {
  let combos: TeaId[][][] = [[]];
  for (const idx of memberIndices) {
    const candidates = terminalCandidateContents(constraints[idx], teaIds);
    const next: TeaId[][][] = [];
    for (const prefix of combos) {
      for (const candidate of candidates) {
        next.push([...prefix, candidate]);
      }
    }
    combos = next;
  }
  return combos;
}

function relationalGroupUnit(
  id: string,
  kind: 'tea-pair' | 'tea-tray',
  memberIndices: readonly number[],
  constraints: readonly CupConstraint[],
  teaIds: readonly TeaId[],
): TerminalUnit {
  const memberConstraints = memberIndices.map((idx) => constraints[idx] as CupConstraint);
  const combos = cartesianMemberContents(memberIndices, constraints, teaIds);
  const options: TerminalOption[] = [];

  for (const combo of combos) {
    const state = { cups: combo };
    if (kind === 'tea-pair') {
      if (!isPairedTeaGoalSatisfied(state, memberConstraints)) continue;
    } else {
      if (!combo.every((layers, i) => cupEndStateSatisfied(layers, memberConstraints[i]))) {
        continue;
      }
      // G16 victory rejects occupancy > 6. This is a TERMINAL group constraint,
      // not just a transient move budget: two full 4-layer tray cups cannot win.
      const occupancy = combo.reduce((sum, layers) => sum + layers.length, 0);
      if (occupancy > sharedCapacityLimit('tea-tray')) continue;
    }
    const amounts: Partial<Record<TeaId, number>> = {};
    for (const layers of combo) {
      for (const layer of layers) amounts[layer] = (amounts[layer] ?? 0) + 1;
    }
    const nonEmpty = combo.filter((layers) => layers.length > 0);
    options.push({
      amounts,
      label: nonEmpty.length === 0
        ? 'empty'
        : nonEmpty.map((layers) => `${layers[0]} x${layers.length}`).join(' + '),
    });
  }

  if (options.length === 0) {
    throw new Error(`terminal fixture group ${id} has no legal terminal option`);
  }

  return {
    id,
    label: kind === 'tea-pair' ? 'tea pair (relational)' : 'shared tray (relational)',
    kind: 'group',
    members: memberIndices.map((idx) => `cup-${idx}`),
    capacity: memberIndices.reduce((sum, idx) => sum + cupCapacity(constraints[idx]), 0),
    options: dedupeOptions(options, teaIds),
  };
}

export function buildTerminalProblemFromCups(
  cups: readonly (readonly TeaId[])[],
  constraints: readonly CupConstraint[],
  teaIds: readonly TeaId[],
  transformations?: TerminalAllocationProblem['transformations'],
): TerminalAllocationProblem {
  if (cups.length !== constraints.length) {
    throw new Error(`cups/constraints length mismatch: ${cups.length} vs ${constraints.length}`);
  }

  const pairGroups = new Map<string, number[]>();
  const trayGroups = new Map<string, number[]>();
  constraints.forEach((constraint, idx) => {
    if (constraint.pairedTeaGroup !== undefined && constraint.sharedCapacityGroup !== undefined) {
      throw new Error(`cup ${idx} cannot belong to both a tea pair and a shared tray`);
    }
    if (constraint.pairedTeaGroup !== undefined) {
      const members = pairGroups.get(constraint.pairedTeaGroup) ?? [];
      members.push(idx);
      pairGroups.set(constraint.pairedTeaGroup, members);
    }
    if (constraint.sharedCapacityGroup !== undefined) {
      const members = trayGroups.get(constraint.sharedCapacityGroup) ?? [];
      members.push(idx);
      trayGroups.set(constraint.sharedCapacityGroup, members);
    }
  });

  const units: TerminalUnit[] = [];
  const consumed = new Set<number>();
  for (let idx = 0; idx < cups.length; idx++) {
    if (consumed.has(idx)) continue;
    const constraint = constraints[idx] as CupConstraint;
    const pairGroup = constraint.pairedTeaGroup;
    if (pairGroup !== undefined) {
      const members = pairGroups.get(pairGroup) as number[];
      if (members.length !== 2) {
        throw new Error(`tea-pair group '${pairGroup}' requires exactly 2 members (got ${members.length})`);
      }
      members.forEach((member) => consumed.add(member));
      units.push(relationalGroupUnit(`group-${pairGroup}`, 'tea-pair', members, constraints, teaIds));
      continue;
    }
    const trayGroup = constraint.sharedCapacityGroup;
    if (trayGroup !== undefined) {
      const members = trayGroups.get(trayGroup) as number[];
      members.forEach((member) => consumed.add(member));
      units.push(relationalGroupUnit(`group-${trayGroup}`, 'tea-tray', members, constraints, teaIds));
      continue;
    }
    consumed.add(idx);
    units.push(singleVesselUnit(idx, constraint, teaIds));
  }

  return {
    teaIds: [...teaIds],
    inventory: inventoryFromCups(cups, teaIds),
    units,
    ...(transformations !== undefined ? { transformations } : {}),
  };
}

function ordinaryUnit(id: string, teaIds: readonly TeaId[], capacity = 4): TerminalUnit {
  const options: TerminalOption[] = [{ amounts: {}, label: 'empty' }];
  for (const tea of teaIds) {
    options.push({ amounts: { [tea]: capacity }, label: `${tea} x${capacity}` });
  }
  return {
    id,
    label: id,
    kind: 'vessel',
    members: [id],
    capacity,
    options,
  };
}

function mustEmptyUnit(id: string, capacity = 4): TerminalUnit {
  return {
    id,
    label: id,
    kind: 'vessel',
    members: [id],
    capacity,
    options: [{ amounts: {}, label: 'empty' }],
  };
}

function exactUnit(id: string, amounts: TeaAmounts, capacity?: number): TerminalUnit {
  return {
    id,
    label: id,
    kind: 'vessel',
    members: [id],
    capacity: capacity ?? Object.values(amounts).reduce((sum, value) => sum + (value ?? 0), 0),
    options: [{ amounts, label: 'exact contract' }],
  };
}

function groupUnit(
  id: string,
  teaIds: readonly TeaId[],
  memberCount: number,
  memberCapacity: number,
): TerminalUnit {
  const options: TerminalOption[] = [];
  for (const tea of teaIds) {
    options.push({ amounts: { [tea]: memberCount * memberCapacity }, label: `${tea} x${memberCount * memberCapacity}` });
  }
  return {
    id,
    label: id,
    kind: 'group',
    members: Array.from({ length: memberCount }, (_, i) => `${id}-member-${i}`),
    capacity: memberCount * memberCapacity,
    options,
  };
}

function problem(
  teaIds: readonly TeaId[],
  inventory: TeaAmounts,
  units: readonly TerminalUnit[],
  transformations?: TerminalAllocationProblem['transformations'],
): TerminalAllocationProblem {
  return { teaIds, inventory, units, ...(transformations !== undefined ? { transformations } : {}) };
}

function classicProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const cups: TeaId[][] = teaIds.map((tea) => Array.from({ length: 4 }, () => tea));
  cups.push([], []);
  const constraints = defaultCupConstraints(cups.length);
  return buildTerminalProblemFromCups(cups, constraints, teaIds);
}

function tastingProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = TASTING_TEMPLATE_BANK['tasting-challenge'][0]!;
  const inst = instantiateTastingTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.tastingSlot] = {
    mode: 'normal',
    capacity: TASTING_BOWL_CAPACITY,
    mustEndEmpty: true,
  };
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function thermosProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = THERMOS_TEMPLATE_BANK.thermos[0]!;
  const inst = instantiateThermosTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.thermosSlot] = { mode: 'normal', capacity: THERMOS_CAPACITY, mustEndEmpty: true };
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function servingOrderProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = SERVING_ORDER_TEMPLATE_BANK['serving-order'][0]!;
  const inst = instantiateServingOrderTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
  constraints[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function servingOrderTastingProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = SERVING_ORDER_COMPOSITION_BANK['serving-order-tasting'][0]!;
  const inst = instantiateServingOrderCompositionTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.serve1Index] = { mode: 'normal', serveOrder: 1 };
  constraints[inst.serve2Index] = { mode: 'normal', serveOrder: 2 };
  constraints[inst.tastingIndex] = { mode: 'normal', capacity: TASTING_BOWL_CAPACITY, mustEndEmpty: true };
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function sharedTrayProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = SHARED_TRAY_TEMPLATE_BANK['shared-tray'][0]!;
  const inst = instantiateSharedTrayTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  for (const member of inst.trayMembers) {
    constraints[member] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  }
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function teaPairProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = TEA_PAIR_TEMPLATE_BANK['tea-pair'][0]!;
  const inst = instantiateTeaPairTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  for (const member of inst.pairMembers) {
    constraints[member] = {
      mode: 'normal',
      capacity: TEA_PAIR_MEMBER_CAPACITY,
      pairedTeaGroup: TEA_PAIR_GROUP,
    };
  }
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function steepingFlaskProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = STEEPING_FLASK_TEMPLATE_BANK['steeping-flask'][0]!;
  const inst = instantiateSteepingFlaskTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function flaskTrayProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const tpl = STEEPING_FLASK_SHARED_TRAY_TEMPLATE_BANK['flask-tray'][0]!;
  const inst = instantiateSteepingFlaskSharedTrayTemplate(tpl, teaIds);
  const constraints = defaultCupConstraints(inst.cups.length);
  for (const member of inst.trayMembers) {
    constraints[member] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  }
  constraints[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function targetsProblem(): TerminalAllocationProblem {
  const teaIds = [...PALETTE4];
  const targetTeas: [TeaId, TeaId] = [teaIds[0] as TeaId, teaIds[1] as TeaId];
  const others = teaIds.filter((tea) => tea !== targetTeas[0] && tea !== targetTeas[1]);
  const tpl = TARGET_TEMPLATE_BANK['target-challenge'][0]!;
  const inst = instantiateTargetTemplate(tpl, targetTeas, others);
  const constraints = defaultCupConstraints(inst.cups.length);
  for (const [idx, tea] of inst.targetTeaBySlot) {
    constraints[idx] = { mode: 'normal', targetTeaId: tea };
  }
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds);
}

function blendProblem(): TerminalAllocationProblem {
  const teaIds: TeaId[] = ['black_tea', 'milk', 'milk_tea', 'matcha', 'sea_buckthorn'];
  const tpl = BLEND_TEMPLATE_BANK['milk-tea-blend'][0]!;
  const inst = instantiateBlendTemplate(tpl, 'matcha', 'sea_buckthorn');
  const constraints = defaultCupConstraints(inst.cups.length);
  return buildTerminalProblemFromCups(inst.cups, constraints, teaIds, [
    { id: 'milk-tea', description: 'black_tea + milk -> milk_tea' },
  ]);
}

const G23_TEA_IDS: readonly TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const G23_INVENTORY: TeaAmounts = {
  matcha: 4,
  sea_buckthorn: 4,
  karkade: 4,
  milk_oolong: 4,
};

function g23Problem(recipe: TeaAmounts): TerminalAllocationProblem {
  const units: TerminalUnit[] = [
    exactUnit('g23-special-recipe-cup', recipe),
    ...Array.from({ length: 5 }, (_, i) => ordinaryUnit(`g23-ordinary-${i}`, G23_TEA_IDS)),
  ];
  return problem(G23_TEA_IDS, G23_INVENTORY, units);
}

function artificialProblem(
  teaIds: readonly TeaId[],
  inventory: TeaAmounts,
  units: readonly TerminalUnit[],
): TerminalAllocationProblem {
  return problem(teaIds, inventory, units);
}

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';
const AB_TEAS: readonly TeaId[] = [A, B];
const ABCD_TEAS: readonly TeaId[] = [A, B, C, D];

export const CONTRACT_PREFLIGHT_SCENARIOS: readonly ContractPreflightScenario[] = [
  {
    name: 'classic',
    description: 'Current classic 4-color board: 4 units each, six ordinary vessels.',
    problem: classicProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'tasting',
    description: 'Shipped tasting bowl (cap 2, must end empty) with ordinary storage.',
    problem: tastingProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'thermos',
    description: 'Shipped high thermos (cap 5, must end empty) with ordinary storage.',
    problem: thermosProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'serving-order',
    description: 'Shipped serving order: two ordered cap-4 vessels must finish full homogeneous.',
    problem: servingOrderProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'serving-order-tasting',
    description: 'Shipped order + tasting composition on separate vessels.',
    problem: servingOrderTastingProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'shared-tray',
    description: 'Shipped shared tray: relational terminal occupancy must stay <= 6.',
    problem: sharedTrayProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'tea-pair',
    description: 'Shipped tea pair: two cap-2 bowls jointly consume exactly 4 units of one tea.',
    problem: teaPairProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'steeping-flask',
    description: 'Shipped steeping flask must end empty; source readiness is irrelevant here.',
    problem: steepingFlaskProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'flask-tray',
    description: 'G21 production winner: steeping flask + shared tray composition.',
    problem: flaskTrayProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'targets',
    description: 'Shipped named targets: each target must finish full homogeneous of its TeaId.',
    problem: targetsProblem(),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'blend',
    description: 'Current blend input changes TeaId identity; conservation is transformation-aware.',
    problem: blendProblem(),
    expectedVerdict: 'Unsupported',
    expectedReasonIncludes: ['chemistry', 'transformation'],
  },
  {
    name: 'g23-layered-l2',
    description: 'G23 L2 evidence: special cup permanently holds A1 B1, five ordinary cap-4 cups remain.',
    problem: g23Problem({ [A]: 1, [B]: 1 }),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Residual TeaId', '3'],
  },
  {
    name: 'g23-layered-l3',
    description: 'G23 L3 evidence: special cup permanently holds A1 B1 C1, five ordinary cap-4 cups remain.',
    problem: g23Problem({ [A]: 1, [B]: 1, [C]: 1 }),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Residual TeaId', '3'],
  },
  {
    name: 'g23-layered-four-color',
    description: 'G23 four-color mix: special cup permanently holds A1 B1 C1 D1.',
    problem: g23Problem({ [A]: 1, [B]: 1, [C]: 1, [D]: 1 }),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Residual TeaId', '3'],
  },
  {
    name: 'artificial-wrong-total',
    description: 'Inventory 16 but fixed + flexible terminal contracts can consume only 15.',
    problem: artificialProblem(ABCD_TEAS, { [A]: 4, [B]: 4, [C]: 4, [D]: 4 }, [
      exactUnit('special-a3', { [A]: 3 }),
      ordinaryUnit('ordinary-0', ABCD_TEAS),
      ordinaryUnit('ordinary-1', ABCD_TEAS),
      ordinaryUnit('ordinary-2', ABCD_TEAS),
    ]),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Residual total', 'exceeds'],
  },
  {
    name: 'artificial-per-color-residual',
    description: 'A4 B4, special consumes A1, only cap-4 ordinary storage remains; residual A3 is impossible.',
    problem: artificialProblem(AB_TEAS, { [A]: 4, [B]: 4 }, [
      exactUnit('special-a1', { [A]: 1 }),
      ordinaryUnit('ordinary-0', AB_TEAS),
      ordinaryUnit('ordinary-1', AB_TEAS),
    ]),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Residual TeaId matcha=3'],
  },
  {
    name: 'artificial-slot-shortage',
    description: 'Per-color residuals are multiples of 4, but only three usable cap-4 terminal slots exist.',
    problem: artificialProblem(ABCD_TEAS, { [A]: 4, [B]: 4, [C]: 4, [D]: 4 }, [
      ordinaryUnit('ordinary-0', ABCD_TEAS),
      ordinaryUnit('ordinary-1', ABCD_TEAS),
      ordinaryUnit('ordinary-2', ABCD_TEAS),
      mustEmptyUnit('must-empty-3', 4),
    ]),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Residual total', 'exceeds'],
  },
  {
    name: 'artificial-fixed-demand-overflow',
    description: 'Two target contracts demand A4 each, but inventory only supplies A4.',
    problem: artificialProblem(AB_TEAS, { [A]: 4, [B]: 4 }, [
      exactUnit('target-a-0', { [A]: 4 }),
      exactUnit('target-a-1', { [A]: 4 }),
      ordinaryUnit('ordinary-b', AB_TEAS),
    ]),
    expectedVerdict: 'AlgebraicUnsat',
    expectedReasonIncludes: ['Fixed terminal demand exceeds inventory', 'matcha'],
  },
  {
    name: 'artificial-full-color-special',
    description: 'A4 B4, special consumes the entire A color, ordinary B storage remains.',
    problem: artificialProblem(AB_TEAS, { [A]: 4, [B]: 4 }, [
      exactUnit('special-a4', { [A]: 4 }),
      ordinaryUnit('ordinary-b', AB_TEAS),
    ]),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'artificial-relational-cap2-pair',
    description: 'A4 B4, relational cap-2 + cap-2 group consumes A4, ordinary B4 remains.',
    problem: artificialProblem(AB_TEAS, { [A]: 4, [B]: 4 }, [
      groupUnit('pair-ab', AB_TEAS, 2, 2),
      ordinaryUnit('ordinary-b', AB_TEAS),
    ]),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
  {
    name: 'artificial-multiple-targets',
    description: 'Multiple fixed targets A4 + B4, ordinary C4 remains.',
    problem: artificialProblem([A, B, C], { [A]: 4, [B]: 4, [C]: 4 }, [
      exactUnit('target-a', { [A]: 4 }),
      exactUnit('target-b', { [B]: 4 }),
      ordinaryUnit('ordinary-c', [A, B, C]),
    ]),
    expectedVerdict: 'AlgebraicallyFeasible',
  },
];

export function scenarioByName(name: string): ContractPreflightScenario | undefined {
  return CONTRACT_PREFLIGHT_SCENARIOS.find((scenario) => scenario.name === name);
}

/** Convenience for tests: analyze a built-in scenario by name. */
export function analyzeScenario(name: string) {
  const scenario = scenarioByName(name);
  if (!scenario) throw new Error(`unknown contract-preflight scenario '${name}'`);
  return { scenario, result: analyzeTerminalAllocation(scenario.problem) };
}
