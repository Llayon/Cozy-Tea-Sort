import { describe, expect, it } from 'vitest';
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type TeaId,
} from '../src/game/types';
import { TEA_PAIR_MEMBER_CAPACITY } from '../src/game/logic/teaPair';
import { G25_MIRROR_A, G25_MIRROR_B, G25_PALETTE } from '../src/game/logic/g25Research';
import {
  analyzeTerminalAllocation,
  type TerminalAllocationProblem,
  type TerminalUnit,
} from '../src/game/logic/contractPreflight';

function homogeneousOptions(teaIds: readonly TeaId[], capUnits: number): TerminalUnit['options'] {
  const opts: Array<{ amounts: Record<string, number>; label?: string }> = [{ amounts: {}, label: 'empty' }];
  for (const t of teaIds) opts.push({ amounts: { [t]: capUnits }, label: `${t}x${capUnits}` });
  return opts as unknown as TerminalUnit['options'];
}
function ordinaryVessel(id: string, teaIds: readonly TeaId[]): TerminalUnit {
  return { id, kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: homogeneousOptions(teaIds, TEA_UNITS_PER_COLOR) };
}

describe('G25 Stage A contract candidates', () => {
  it('uses production constants (no remembered values)', () => {
    expect(TEA_UNITS_PER_COLOR).toBe(4);
    expect(STANDARD_CUP_CAPACITY).toBe(4);
    expect(TEA_PAIR_MEMBER_CAPACITY).toBe(2);
    expect([...G25_PALETTE]).toEqual(['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong']);
  });

  it('mirror pair is AlgebraicallyFeasible with A4B4 witness', () => {
    const teaIds = [...G25_PALETTE];
    const inventory: Record<string, number> = {};
    for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
    const problem: TerminalAllocationProblem = {
      teaIds,
      inventory: inventory as never,
      units: [
        {
          id: 'group-mirror',
          kind: 'group',
          members: ['cup-4', 'cup-5'],
          capacity: STANDARD_CUP_CAPACITY * 2,
          options: [
            { amounts: { [G25_MIRROR_A]: 4, [G25_MIRROR_B]: 4 } as never, label: 'mirror' },
          ],
        },
        ordinaryVessel('o0', teaIds),
        ordinaryVessel('o1', teaIds),
        { id: 'e0', kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: [{ amounts: {} }] },
        { id: 'e1', kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: [{ amounts: {} }] },
      ],
    };
    const r = analyzeTerminalAllocation(problem);
    expect(r.verdict).toBe('AlgebraicallyFeasible');
    expect(r.witness).toBeDefined();
  });

  it('striped pair is AlgebraicallyFeasible (diagnostic control)', () => {
    const teaIds = [...G25_PALETTE];
    const inventory: Record<string, number> = {};
    for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
    const problem: TerminalAllocationProblem = {
      teaIds,
      inventory: inventory as never,
      units: [
        {
          id: 'group-striped',
          kind: 'group',
          members: ['cup-4', 'cup-5'],
          capacity: STANDARD_CUP_CAPACITY * 2,
          options: [{ amounts: { [G25_MIRROR_A]: 4, [G25_MIRROR_B]: 4 } as never, label: 'striped' }],
        },
        ordinaryVessel('o0', teaIds),
        ordinaryVessel('o1', teaIds),
        { id: 'e0', kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: [{ amounts: {} }] },
        { id: 'e1', kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: [{ amounts: {} }] },
      ],
    };
    expect(analyzeTerminalAllocation(problem).verdict).toBe('AlgebraicallyFeasible');
  });

  it('metered pourer and measuring bowl are AlgebraicallyFeasible (empty tool)', () => {
    for (const name of ['metered', 'measuring']) {
      const teaIds = [...G25_PALETTE];
      const inventory: Record<string, number> = {};
      for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
      const units: TerminalUnit[] = [
        { id: `special-${name}`, kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: [{ amounts: {} }] },
      ];
      for (let i = 0; i < 5; i++) units.push(ordinaryVessel(`o${i}`, teaIds));
      const r = analyzeTerminalAllocation({ teaIds, inventory: inventory as never, units });
      expect(r.verdict).toBe('AlgebraicallyFeasible');
    }
  });

  it('split service is AlgebraicallyFeasible (positive control)', () => {
    const teaIds = [...G25_PALETTE];
    const inventory: Record<string, number> = {};
    for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
    const units: TerminalUnit[] = [
      {
        id: 'group-split',
        kind: 'group',
        members: ['cup-0', 'cup-1'],
        capacity: TEA_PAIR_MEMBER_CAPACITY * 2,
        options: [{ amounts: { matcha: 4 } as never, label: 'split' }],
      },
    ];
    for (let i = 0; i < 3; i++) units.push(ordinaryVessel(`o${i}`, teaIds));
    expect(analyzeTerminalAllocation({ teaIds, inventory: inventory as never, units }).verdict).toBe(
      'AlgebraicallyFeasible',
    );
  });
});
