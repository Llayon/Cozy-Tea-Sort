/**
 * G24 — shipped-mechanic algebraic fixtures.
 *
 * Fixtures are instantiated from the actual G21 template banks and their
 * terminal options come from the actual finality helpers. A positive verdict
 * means only that a terminal allocation exists; it is not a solvability claim.
 */

import { describe, expect, it } from 'vitest';
import { analyzeTerminalAllocation } from '../src/game/logic/contractPreflight';
import {
  CONTRACT_PREFLIGHT_SCENARIOS,
  analyzeScenario,
} from '../scripts/dev/lib/contract-preflight-scenarios';
import type { TeaId } from '../src/game/types';

function sumAmounts(amounts: Readonly<Partial<Record<TeaId, number>>>): number {
  return Object.values(amounts).reduce((sum, value) => sum + (value ?? 0), 0);
}

function witnessTotal(
  result: ReturnType<typeof analyzeTerminalAllocation>,
): number {
  return (result.witness?.assignments ?? []).reduce(
    (sum, assignment) => sum + sumAmounts(assignment.amounts),
    0,
  );
}

const POSITIVE_SCENARIOS = [
  'classic',
  'tasting',
  'thermos',
  'serving-order',
  'serving-order-tasting',
  'shared-tray',
  'tea-pair',
  'steeping-flask',
  'flask-tray',
  'targets',
] as const;

describe('G24 shipped mechanics — positive fixtures', () => {
  it.each(POSITIVE_SCENARIOS)('%s is AlgebraicallyFeasible', (name) => {
    const { result } = analyzeScenario(name);
    expect(result.verdict).toBe('AlgebraicallyFeasible');
    expect(result.witness).toBeDefined();
    expect(result.witness?.assignments.length).toBeGreaterThan(0);
    expect(result.exploredStates).toBeGreaterThan(0);
  });

  it('tasting ends empty: its terminal contribution is exactly zero', () => {
    const { scenario, result } = analyzeScenario('tasting');
    expect(result.verdict).toBe('AlgebraicallyFeasible');
    const tasting = result.witness?.assignments.find((assignment) => assignment.unitId === 'cup-5');
    expect(tasting).toBeDefined();
    expect(sumAmounts(tasting?.amounts ?? {})).toBe(0);
    expect(scenario.problem.inventory).toMatchObject({
      matcha: 4,
      sea_buckthorn: 4,
      karkade: 4,
      milk_oolong: 4,
    });
  });

  it('thermos ends empty: its terminal contribution is exactly zero', () => {
    const { result } = analyzeScenario('thermos');
    const thermos = result.witness?.assignments.find((assignment) => assignment.unitId === 'cup-5');
    expect(thermos).toBeDefined();
    expect(sumAmounts(thermos?.amounts ?? {})).toBe(0);
  });

  it('steeping flask ends empty: source readiness does not change terminal allocation', () => {
    const { result } = analyzeScenario('steeping-flask');
    const flask = result.witness?.assignments.find((assignment) => assignment.unitId === 'cup-5');
    expect(flask).toBeDefined();
    expect(sumAmounts(flask?.amounts ?? {})).toBe(0);
  });

  it('tea pair is relational: the group consumes exactly 4 units of one tea', () => {
    const { result } = analyzeScenario('tea-pair');
    const pair = result.witness?.assignments.find(
      (assignment) => assignment.unitId === 'group-tea-pair',
    );
    expect(pair).toBeDefined();
    expect(pair?.unitKind).toBe('group');
    expect(pair?.members).toHaveLength(2);
    expect(sumAmounts(pair?.amounts ?? {})).toBe(4);
    const nonZero = Object.values(pair?.amounts ?? {}).filter((value) => (value ?? 0) > 0);
    expect(nonZero).toHaveLength(1);
  });

  it('shared tray is relational at victory: occupancy never exceeds its 6-layer limit', () => {
    const { result } = analyzeScenario('shared-tray');
    const tray = result.witness?.assignments.find(
      (assignment) => assignment.unitId === 'group-tea-tray',
    );
    expect(tray).toBeDefined();
    expect(tray?.unitKind).toBe('group');
    expect(sumAmounts(tray?.amounts ?? {})).toBeLessThanOrEqual(6);
  });

  it('G21 flask + tray composition is AlgebraicallyFeasible and conserves 16 units', () => {
    const { result } = analyzeScenario('flask-tray');
    expect(result.verdict).toBe('AlgebraicallyFeasible');
    expect(witnessTotal(result)).toBe(16);
    const tray = result.witness?.assignments.find(
      (assignment) => assignment.unitId === 'group-tea-tray',
    );
    expect(tray).toBeDefined();
    expect(sumAmounts(tray?.amounts ?? {})).toBeLessThanOrEqual(6);
  });

  it('serving order is terminal-content only: ordered cups finish full homogeneous', () => {
    const { scenario, result } = analyzeScenario('serving-order');
    expect(result.verdict).toBe('AlgebraicallyFeasible');
    for (const assignment of result.witness?.assignments ?? []) {
      if (assignment.unitId !== 'cup-1' && assignment.unitId !== 'cup-2') continue;
      expect(sumAmounts(assignment.amounts)).toBe(4);
      const nonZero = Object.values(assignment.amounts).filter((value) => (value ?? 0) > 0);
      expect(nonZero).toHaveLength(1);
    }
    expect(scenario.problem.units.length).toBe(6);
  });

  it('named targets are fixed final demands, not optional storage', () => {
    const { result } = analyzeScenario('targets');
    expect(result.verdict).toBe('AlgebraicallyFeasible');
    expect(result.diagnostic.fixedConsumption).toMatchObject({
      matcha: 4,
      sea_buckthorn: 4,
      karkade: 0,
      milk_oolong: 0,
    });
  });

  it('current blend input is Unsupported, never a false UNSAT', () => {
    const { result } = analyzeScenario('blend');
    expect(result.verdict).toBe('Unsupported');
    expect(result.unsupportedReason).toContain('transformation-aware');
  });
});

describe('G24 shipped mechanics — scenario inventory', () => {
  it('every current 4-color fixture carries exactly 16 tea units', () => {
    for (const scenario of CONTRACT_PREFLIGHT_SCENARIOS) {
      if (scenario.problem.teaIds.length !== 4) continue;
      if (scenario.name.startsWith('g23-')) continue;
      if (scenario.name === 'artificial-per-color-residual') continue;
      if (scenario.name === 'artificial-full-color-special') continue;
      if (scenario.name === 'artificial-relational-cap2-pair') continue;
      const total = Object.values(scenario.problem.inventory).reduce(
        (sum, value) => sum + (value ?? 0),
        0,
      );
      expect(total, scenario.name).toBe(16);
    }
  });
});
