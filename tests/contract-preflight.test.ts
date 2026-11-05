/**
 * G24 — algebraic contract/conservation preflight.
 *
 * These tests pin the mathematical contract only. A feasible witness is NOT
 * evidence of puzzle solvability.
 */

import { describe, expect, it } from 'vitest';
import {
  ContractPreflightInputError,
  analyzeTerminalAllocation,
  type TeaAmounts,
  type TerminalAllocationProblem,
  type TerminalAllocationResult,
  type TerminalOption,
  type TerminalUnit,
} from '../src/game/logic/contractPreflight';
import {
  CONTRACT_PREFLIGHT_SCENARIOS,
  analyzeScenario,
} from '../scripts/dev/lib/contract-preflight-scenarios';
import type { TeaId } from '../src/game/types';

const A: TeaId = 'matcha';
const B: TeaId = 'sea_buckthorn';
const C: TeaId = 'karkade';
const D: TeaId = 'milk_oolong';

function option(amounts: TeaAmounts, label?: string): TerminalOption {
  return { amounts, ...(label !== undefined ? { label } : {}) };
}

function ordinary(id: string, teaIds: readonly TeaId[], capacity = 4): TerminalUnit {
  return {
    id,
    kind: 'vessel',
    capacity,
    options: [
      option({}, 'empty'),
      ...teaIds.map((tea) => option({ [tea]: capacity }, `${tea} x${capacity}`)),
    ],
  };
}

function mustEmpty(id: string, capacity = 4): TerminalUnit {
  return {
    id,
    kind: 'vessel',
    capacity,
    options: [option({}, 'empty')],
  };
}

function exact(id: string, amounts: TeaAmounts): TerminalUnit {
  const capacity = Object.values(amounts).reduce((sum, value) => sum + (value ?? 0), 0);
  return {
    id,
    kind: 'vessel',
    capacity,
    options: [option(amounts, 'exact')],
  };
}

function relationalGroup(
  id: string,
  teaIds: readonly TeaId[],
  memberCount: number,
  memberCapacity: number,
): TerminalUnit {
  return {
    id,
    kind: 'group',
    members: Array.from({ length: memberCount }, (_, i) => `${id}-member-${i}`),
    capacity: memberCount * memberCapacity,
    options: teaIds.map((tea) =>
      option({ [tea]: memberCount * memberCapacity }, `${tea} x${memberCount * memberCapacity}`),
    ),
  };
}

function problem(
  teaIds: readonly TeaId[],
  inventory: TeaAmounts,
  units: readonly TerminalUnit[],
): TerminalAllocationProblem {
  return { teaIds, inventory, units };
}

function witnessTotals(
  result: TerminalAllocationResult,
  teaIds: readonly TeaId[],
): Record<TeaId, number> {
  const totals = Object.fromEntries(teaIds.map((tea) => [tea, 0])) as Record<TeaId, number>;
  for (const assignment of result.witness?.assignments ?? []) {
    for (const tea of teaIds) {
      totals[tea] += assignment.amounts[tea] ?? 0;
    }
  }
  return totals;
}

function expectWitnessConserves(
  result: TerminalAllocationResult,
  teaIds: readonly TeaId[],
  inventory: TeaAmounts,
): void {
  expect(result.verdict).toBe('AlgebraicallyFeasible');
  expect(result.witness).toBeDefined();
  const totals = witnessTotals(result, teaIds);
  for (const tea of teaIds) {
    expect(totals[tea]).toBe(inventory[tea] ?? 0);
  }
  for (const assignment of result.witness?.assignments ?? []) {
    for (const value of Object.values(assignment.amounts)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  }
}

function expectInputError(problemToAnalyze: TerminalAllocationProblem, needle: string): void {
  expect(() => analyzeTerminalAllocation(problemToAnalyze)).toThrow(ContractPreflightInputError);
  expect(() => analyzeTerminalAllocation(problemToAnalyze)).toThrow(needle);
}

describe('G24 core — G23 negative evidence', () => {
  it('L2 A1 B1 special final is AlgebraicallyUnsat with per-Tea residual contradiction', () => {
    const { result } = analyzeScenario('g23-layered-l2');
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.residual).toMatchObject({ [A]: 3, [B]: 3, [C]: 4, [D]: 4 });
    expect(result.reason).toContain('Residual TeaId matcha=3');
    expect(result.reason).toContain('achievable totals');
    expect(result.exploredStates).toBeGreaterThanOrEqual(0);
  });

  it('L3 A1 B1 C1 special final is AlgebraicallyUnsat', () => {
    const { result } = analyzeScenario('g23-layered-l3');
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.residual).toMatchObject({ [A]: 3, [B]: 3, [C]: 3, [D]: 4 });
    expect(result.reason).toContain('Residual TeaId matcha=3');
  });

  it('four-color A1 B1 C1 D1 special final is AlgebraicallyUnsat', () => {
    const { result } = analyzeScenario('g23-layered-four-color');
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.residual).toMatchObject({ [A]: 3, [B]: 3, [C]: 3, [D]: 3 });
    expect(result.reason).toContain('Residual TeaId matcha=3');
  });

  it('total divisibility alone does not rescue mixed per-color residuals', () => {
    // Residual total is 12 (divisible by 4), but each color residual is 3.
    const result = analyzeTerminalAllocation(
      problem([A, B, C, D], { [A]: 4, [B]: 4, [C]: 4, [D]: 4 }, [
        exact('special', { [A]: 1, [B]: 1, [C]: 1, [D]: 1 }),
        ordinary('o0', [A, B, C, D]),
        ordinary('o1', [A, B, C, D]),
        ordinary('o2', [A, B, C, D]),
      ]),
    );
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.diagnostic.residual).toMatchObject({ [A]: 3, [B]: 3, [C]: 3, [D]: 3 });
  });
});

describe('G24 core — artificial negatives', () => {
  it('wrong total: 16 inventory but only 15 terminal units', () => {
    const result = analyzeTerminalAllocation(
      problem([A, B, C, D], { [A]: 4, [B]: 4, [C]: 4, [D]: 4 }, [
        exact('special-a3', { [A]: 3 }),
        ordinary('o0', [A, B, C, D]),
        ordinary('o1', [A, B, C, D]),
        ordinary('o2', [A, B, C, D]),
      ]),
    );
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.reason).toContain('Residual total');
    expect(result.diagnostic.reasonCode).toBe('total-capacity-exceeds');
  });

  it('per-color residual: A4 B4, special A1, residual A3', () => {
    const result = analyzeTerminalAllocation(
      problem([A, B], { [A]: 4, [B]: 4 }, [
        exact('special-a1', { [A]: 1 }),
        ordinary('o0', [A, B]),
        ordinary('o1', [A, B]),
      ]),
    );
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.reason).toContain('Residual TeaId matcha=3');
    expect(result.diagnostic.reasonCode).toBe('per-tea-residual-not-representable');
  });

  it('slot shortage: per-color multiples of 4 but too few usable terminal slots', () => {
    const result = analyzeTerminalAllocation(
      problem([A, B, C, D], { [A]: 4, [B]: 4, [C]: 4, [D]: 4 }, [
        ordinary('o0', [A, B, C, D]),
        ordinary('o1', [A, B, C, D]),
        ordinary('o2', [A, B, C, D]),
        mustEmpty('empty-3', 4),
      ]),
    );
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.reason).toContain('Residual total');
    expect(result.diagnostic.reasonCode).toBe('total-capacity-exceeds');
  });

  it('fixed target demand overflow: two A4 targets with only A4 inventory', () => {
    const result = analyzeTerminalAllocation(
      problem([A, B], { [A]: 4, [B]: 4 }, [
        exact('target-a-0', { [A]: 4 }),
        exact('target-a-1', { [A]: 4 }),
        ordinary('ordinary-b', [A, B]),
      ]),
    );
    expect(result.verdict).toBe('AlgebraicUnsat');
    expect(result.reason).toContain('Fixed terminal demand exceeds inventory');
    expect(result.diagnostic.reasonCode).toBe('fixed-demand-exceeds-inventory');
  });
});

describe('G24 core — artificial positives', () => {
  it('full-color special: A4 B4, special consumes A4, ordinary B4 remains', () => {
    const p = problem([A, B], { [A]: 4, [B]: 4 }, [
      exact('special-a4', { [A]: 4 }),
      ordinary('ordinary-b', [A, B]),
    ]);
    const result = analyzeTerminalAllocation(p);
    expectWitnessConserves(result, [A, B], p.inventory);
    expect(result.diagnostic.fixedConsumption).toMatchObject({ [A]: 4, [B]: 0 });
  });

  it('relational cap-2 + cap-2 group consumes A4; ordinary B4 remains', () => {
    const p = problem([A, B], { [A]: 4, [B]: 4 }, [
      relationalGroup('pair-ab', [A, B], 2, 2),
      ordinary('ordinary-b', [A, B]),
    ]);
    const result = analyzeTerminalAllocation(p);
    expectWitnessConserves(result, [A, B], p.inventory);
    const pair = result.witness?.assignments.find((assignment) => assignment.unitId === 'pair-ab');
    expect(pair?.unitKind).toBe('group');
    expect(pair?.amounts[A]).toBe(4);
    expect(pair?.amounts[B]).toBe(0);
  });

  it('multiple fixed targets A4 + B4 are supported without special-casing', () => {
    const p = problem([A, B, C], { [A]: 4, [B]: 4, [C]: 4 }, [
      exact('target-a', { [A]: 4 }),
      exact('target-b', { [B]: 4 }),
      ordinary('ordinary-c', [A, B, C]),
    ]);
    const result = analyzeTerminalAllocation(p);
    expectWitnessConserves(result, [A, B, C], p.inventory);
    expect(result.diagnostic.fixedConsumption).toMatchObject({ [A]: 4, [B]: 4, [C]: 0 });
  });
});

describe('G24 core — transformation boundary', () => {
  it('chemistry returns Unsupported, never AlgebraicUnsat', () => {
    const result = analyzeTerminalAllocation({
      teaIds: [A, B, 'milk_tea'],
      inventory: { [A]: 4, [B]: 4, milk_tea: 0 },
      units: [ordinary('o0', [A, B, 'milk_tea']), ordinary('o1', [A, B, 'milk_tea'])],
      transformations: [{ id: 'milk-tea', description: 'A + B -> milk_tea' }],
    });
    expect(result.verdict).toBe('Unsupported');
    expect(result.verdict).not.toBe('AlgebraicUnsat');
    expect(result.reason).toContain('chemistry requires transformation-aware accounting');
    expect(result.unsupportedReason).toContain('transformation-aware');
  });
});

describe('G24 core — input validation', () => {
  it('rejects duplicate TeaIds', () => {
    expectInputError(
      problem([A, A], { [A]: 4 }, [ordinary('o0', [A])]),
      'duplicate TeaId',
    );
  });

  it('rejects negative inventory', () => {
    expectInputError(
      problem([A], { [A]: -1 }, [ordinary('o0', [A])]),
      'non-negative integer',
    );
  });

  it('rejects negative option contribution', () => {
    expectInputError(
      problem([A], { [A]: 0 }, [
        { id: 'bad', capacity: 4, options: [option({ [A]: -1 })] },
      ]),
      'non-negative integer',
    );
  });

  it('rejects unknown TeaId in an option', () => {
    expectInputError(
      problem([A], { [A]: 0 }, [
        { id: 'bad', capacity: 4, options: [option({ [B]: 1 })] },
      ]),
      "unknown TeaId 'sea_buckthorn'",
    );
  });

  it('rejects duplicate terminal unit ids', () => {
    expectInputError(
      problem([A], { [A]: 0 }, [ordinary('same', [A]), ordinary('same', [A])]),
      'duplicate terminal unit id',
    );
  });

  it('rejects empty option sets', () => {
    expectInputError(
      problem([A], { [A]: 0 }, [{ id: 'bad', options: [] }]),
      'options must be a non-empty array',
    );
  });

  it('rejects an option larger than its declared capacity', () => {
    expectInputError(
      problem([A], { [A]: 0 }, [
        { id: 'bad', capacity: 2, options: [option({ [A]: 3 })] },
      ]),
      'capacity is 2',
    );
  });
});

describe('G24 core — properties', () => {
  it('every feasible built-in witness conserves the exact inventory vector', () => {
    for (const scenario of CONTRACT_PREFLIGHT_SCENARIOS) {
      const result = analyzeTerminalAllocation(scenario.problem);
      expect(result.verdict, scenario.name).toBe(scenario.expectedVerdict);
      if (result.verdict === 'AlgebraicallyFeasible') {
        expectWitnessConserves(result, scenario.problem.teaIds, scenario.problem.inventory);
      }
    }
  });

  it('no witness contribution is negative', () => {
    for (const scenario of CONTRACT_PREFLIGHT_SCENARIOS) {
      const result = analyzeTerminalAllocation(scenario.problem);
      if (result.verdict !== 'AlgebraicallyFeasible') continue;
      for (const assignment of result.witness?.assignments ?? []) {
        for (const value of Object.values(assignment.amounts)) {
          expect(value, scenario.name).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('TeaId order does not change the verdict', () => {
    const base = analyzeScenario('tea-pair').scenario.problem;
    const reordered: TerminalAllocationProblem = {
      ...base,
      teaIds: [...base.teaIds].reverse(),
    };
    expect(analyzeTerminalAllocation(reordered).verdict).toBe(
      analyzeTerminalAllocation(base).verdict,
    );
  });

  it('terminal unit order does not change the verdict', () => {
    const base = analyzeScenario('classic').scenario.problem;
    const reversed: TerminalAllocationProblem = { ...base, units: [...base.units].reverse() };
    expect(analyzeTerminalAllocation(reversed).verdict).toBe(
      analyzeTerminalAllocation(base).verdict,
    );
  });

  it('option order does not change the verdict', () => {
    const base = analyzeScenario('classic').scenario.problem;
    const reversedOptions: TerminalAllocationProblem = {
      ...base,
      units: base.units.map((unit) => ({ ...unit, options: [...unit.options].reverse() })),
    };
    expect(analyzeTerminalAllocation(reversedOptions).verdict).toBe(
      analyzeTerminalAllocation(base).verdict,
    );
  });

  it('duplicate options do not change the verdict', () => {
    const base = analyzeScenario('artificial-per-color-residual').scenario.problem;
    const duplicated: TerminalAllocationProblem = {
      ...base,
      units: base.units.map((unit) => ({
        ...unit,
        options: [...unit.options, ...unit.options],
      })),
    };
    expect(analyzeTerminalAllocation(duplicated).verdict).toBe(
      analyzeTerminalAllocation(base).verdict,
    );
  });
});
