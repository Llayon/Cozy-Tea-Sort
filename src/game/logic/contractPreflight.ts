/**
 * G24 — DEV/domain terminal-allocation preflight.
 *
 * This module answers ONE narrow question:
 *
 *   Can the supplied tea inventory be distributed among the supplied terminal
 *   vessel contracts, exactly?
 *
 * It does NOT solve puzzles, explore moves, prove reachability, or claim that
 * a level is solvable. A positive verdict is `AlgebraicallyFeasible`, never
 * `SOLVABLE`.
 *
 * The checker is pure, deterministic and dependency-free. It is not imported
 * by the production app; it exists for tests, dev CLIs and future mechanic
 * preflight.
 *
 * No Pixi/React imports. No rules/solver imports. Only `TeaId` types.
 */

import type { TeaId } from '../types';

/** Sparse tea amounts. Missing TeaIds mean zero. */
export type TeaAmounts = Readonly<Partial<Record<TeaId, number>>>;

/** One legal terminal contribution of a vessel or relational group. */
export interface TerminalOption {
  readonly amounts: TeaAmounts;
  /** Human-readable option label for witnesses/diagnostics. */
  readonly label?: string;
}

/**
 * A terminal contract. A vessel is one unit. A relational goal (Tea Pair,
 * Shared Tray, future group finality) is ONE unit whose options describe the
 * joint contribution of all its members.
 */
export interface TerminalUnit {
  readonly id: string;
  readonly label?: string;
  readonly kind?: 'vessel' | 'group';
  readonly members?: readonly string[];
  /** Physical capacity for diagnostics/validation when known. */
  readonly capacity?: number;
  readonly options: readonly TerminalOption[];
}

/**
 * A proposal that changes TeaId identity (chemistry). Per-TeaId conservation
 * cannot be applied safely, so the checker returns `Unsupported` instead of
 * risking a false `AlgebraicUnsat`.
 */
export interface TerminalTransformation {
  readonly id: string;
  readonly description?: string;
}

export interface TerminalAllocationProblem {
  readonly teaIds: readonly TeaId[];
  readonly inventory: TeaAmounts;
  readonly units: readonly TerminalUnit[];
  readonly transformations?: readonly TerminalTransformation[];
}

export type TerminalAllocationVerdict =
  | 'AlgebraicallyFeasible'
  | 'AlgebraicUnsat'
  | 'Unsupported';

export type TerminalAllocationReasonCode =
  | 'feasible'
  | 'unsupported-transformation'
  | 'fixed-demand-exceeds-inventory'
  | 'total-capacity-exceeds'
  | 'per-tea-residual-not-representable'
  | 'no-terminal-allocation';

export interface TerminalAllocationDiagnostic {
  readonly inventory: TeaAmounts;
  readonly fixedConsumption: TeaAmounts;
  readonly residual: TeaAmounts;
  readonly terminalUnitCount: number;
  readonly fixedUnitCount: number;
  readonly totalTerminalCapacity: number;
  readonly perTeaTerminalCapacity: TeaAmounts;
  readonly frontierUnitIndex?: number;
  readonly frontierResidual?: TeaAmounts;
  readonly impossibleTeaId?: TeaId;
  readonly reasonCode: TerminalAllocationReasonCode;
}

export interface TerminalAllocationAssignment {
  readonly unitId: string;
  readonly unitLabel?: string;
  readonly unitKind: 'vessel' | 'group';
  readonly members?: readonly string[];
  readonly optionIndex: number;
  readonly optionLabel?: string;
  readonly amounts: TeaAmounts;
}

export interface TerminalAllocationWitness {
  readonly assignments: readonly TerminalAllocationAssignment[];
}

export interface TerminalAllocationResult {
  readonly verdict: TerminalAllocationVerdict;
  readonly witness?: TerminalAllocationWitness;
  readonly reason?: string;
  readonly residual?: TeaAmounts;
  readonly exploredStates: number;
  readonly diagnostic: TerminalAllocationDiagnostic;
  readonly unsupportedReason?: string;
}

/** Thrown only for programmer-invalid preflight inputs. */
export class ContractPreflightInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractPreflightInputError';
  }
}

interface NormalizedOption {
  readonly amounts: readonly number[];
  readonly label?: string;
}

interface NormalizedUnit {
  readonly id: string;
  readonly label?: string;
  readonly kind: 'vessel' | 'group';
  readonly members?: readonly string[];
  readonly capacity?: number;
  readonly options: readonly NormalizedOption[];
  readonly maxByTea: readonly number[];
  readonly maxTotal: number;
  readonly originalIndex: number;
}

interface NormalizedProblem {
  readonly teaIds: readonly TeaId[];
  readonly inventory: readonly number[];
  readonly units: readonly NormalizedUnit[];
  readonly transformations: readonly TerminalTransformation[];
}

function fail(message: string): never {
  throw new ContractPreflightInputError(message);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function normalizeAmounts(
  amounts: TeaAmounts,
  teaIndex: ReadonlyMap<TeaId, number>,
  context: string,
): number[] {
  const vector = new Array<number>(teaIndex.size).fill(0);
  for (const [rawKey, rawValue] of Object.entries(amounts)) {
    const key = rawKey as TeaId;
    const idx = teaIndex.get(key);
    if (idx === undefined) {
      fail(`${context}: unknown TeaId '${rawKey}'`);
    }
    if (!isNonNegativeInteger(rawValue)) {
      fail(`${context}: amount for '${rawKey}' must be a non-negative integer (got ${String(rawValue)})`);
    }
    vector[idx] = rawValue;
  }
  return vector;
}

function normalizeProblem(problem: TerminalAllocationProblem): NormalizedProblem {
  if (!problem || typeof problem !== 'object') fail('problem must be an object');
  if (!Array.isArray(problem.teaIds) || problem.teaIds.length === 0) {
    fail('teaIds must be a non-empty array');
  }

  const teaIndex = new Map<TeaId, number>();
  for (let idx = 0; idx < problem.teaIds.length; idx++) {
    const tea = problem.teaIds[idx] as TeaId;
    if (typeof tea !== 'string' || tea.length === 0) {
      fail(`teaIds[${idx}] must be a non-empty TeaId string`);
    }
    if (teaIndex.has(tea)) fail(`duplicate TeaId '${tea}'`);
    teaIndex.set(tea, idx);
  }

  const inventory = normalizeAmounts(problem.inventory ?? {}, teaIndex, 'inventory');

  if (!Array.isArray(problem.units)) fail('units must be an array');

  const unitIds = new Set<string>();
  const units: NormalizedUnit[] = problem.units.map((unit, unitIndex) => {
    if (!unit || typeof unit !== 'object') fail(`units[${unitIndex}] must be an object`);
    if (typeof unit.id !== 'string' || unit.id.length === 0) {
      fail(`units[${unitIndex}].id must be a non-empty string`);
    }
    if (unitIds.has(unit.id)) fail(`duplicate terminal unit id '${unit.id}'`);
    unitIds.add(unit.id);

    if (unit.kind !== undefined && unit.kind !== 'vessel' && unit.kind !== 'group') {
      fail(`terminal unit '${unit.id}': kind must be 'vessel' or 'group'`);
    }
    if (unit.capacity !== undefined && !isNonNegativeInteger(unit.capacity)) {
      fail(`terminal unit '${unit.id}': capacity must be a non-negative integer`);
    }
    if (unit.members !== undefined) {
      if (
        !Array.isArray(unit.members) ||
        unit.members.some((member: unknown) => typeof member !== 'string' || member.length === 0)
      ) {
        fail(`terminal unit '${unit.id}': members must be non-empty strings`);
      }
    }
    if (!Array.isArray(unit.options) || unit.options.length === 0) {
      fail(`terminal unit '${unit.id}': options must be a non-empty array`);
    }

    const seen = new Set<string>();
    const options: NormalizedOption[] = [];
    for (let optionIndex = 0; optionIndex < unit.options.length; optionIndex++) {
      const option = unit.options[optionIndex];
      if (!option || typeof option !== 'object') {
        fail(`terminal unit '${unit.id}' option ${optionIndex}: must be an object`);
      }
      const amounts = normalizeAmounts(
        option.amounts ?? {},
        teaIndex,
        `terminal unit '${unit.id}' option ${optionIndex}`,
      );
      const total = amounts.reduce((sum, value) => sum + value, 0);
      if (unit.capacity !== undefined && total > unit.capacity) {
        fail(
          `terminal unit '${unit.id}' option ${optionIndex}: contributes ${total} units but capacity is ${unit.capacity}`,
        );
      }
      const key = amounts.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({ amounts, label: option.label });
    }

    const maxByTea = new Array<number>(teaIndex.size).fill(0);
    let maxTotal = 0;
    for (const option of options) {
      let total = 0;
      for (let t = 0; t < option.amounts.length; t++) {
        const value = option.amounts[t] as number;
        total += value;
        if (value > (maxByTea[t] as number)) maxByTea[t] = value;
      }
      if (total > maxTotal) maxTotal = total;
    }

    return {
      id: unit.id,
      label: unit.label,
      kind: unit.kind ?? 'vessel',
      members: unit.members,
      capacity: unit.capacity,
      options,
      maxByTea,
      maxTotal,
      originalIndex: unitIndex,
    };
  });

  const transformations = problem.transformations ?? [];
  if (!Array.isArray(transformations)) fail('transformations must be an array when present');
  transformations.forEach((transformation, idx) => {
    if (!transformation || typeof transformation.id !== 'string' || transformation.id.length === 0) {
      fail(`transformations[${idx}].id must be a non-empty string`);
    }
  });

  return { teaIds: [...problem.teaIds], inventory, units, transformations: [...transformations] };
}

function addVectors(a: readonly number[], b: readonly number[]): number[] {
  return a.map((value, idx) => value + (b[idx] as number));
}

function subtractVectors(a: readonly number[], b: readonly number[]): number[] {
  return a.map((value, idx) => value - (b[idx] as number));
}

function sumVector(vector: readonly number[]): number {
  return vector.reduce((sum, value) => sum + value, 0);
}

function zeroVector(length: number): number[] {
  return new Array<number>(length).fill(0);
}

function toAmounts(vector: readonly number[], teaIds: readonly TeaId[]): TeaAmounts {
  const amounts: Partial<Record<TeaId, number>> = {};
  teaIds.forEach((tea, idx) => {
    amounts[tea] = vector[idx] as number;
  });
  return amounts;
}

function describeVector(vector: readonly number[], teaIds: readonly TeaId[]): string {
  const parts: string[] = [];
  teaIds.forEach((tea, idx) => {
    const value = vector[idx] as number;
    if (value !== 0) parts.push(`${tea}=${value}`);
  });
  return parts.length === 0 ? 'empty' : parts.join(' ');
}

function achievableSums(units: readonly NormalizedUnit[], teaIndex: number): Set<number> {
  let sums = new Set<number>([0]);
  for (const unit of units) {
    const next = new Set<number>();
    for (const current of sums) {
      for (const option of unit.options) {
        next.add(current + (option.amounts[teaIndex] as number));
      }
    }
    sums = next;
  }
  return sums;
}

function makeDiagnostic(
  normalized: NormalizedProblem,
  fixedConsumption: readonly number[],
  residual: readonly number[],
  fixedUnitCount: number,
  reasonCode: TerminalAllocationReasonCode,
  extra: Partial<TerminalAllocationDiagnostic> = {},
): TerminalAllocationDiagnostic {
  const totalTerminalCapacity = normalized.units.reduce((sum, unit) => sum + unit.maxTotal, 0);
  const perTeaCapacity = zeroVector(normalized.teaIds.length);
  for (const unit of normalized.units) {
    for (let t = 0; t < perTeaCapacity.length; t++) {
      perTeaCapacity[t] = (perTeaCapacity[t] as number) + (unit.maxByTea[t] as number);
    }
  }
  return {
    inventory: toAmounts(normalized.inventory, normalized.teaIds),
    fixedConsumption: toAmounts(fixedConsumption, normalized.teaIds),
    residual: toAmounts(residual, normalized.teaIds),
    terminalUnitCount: normalized.units.length,
    fixedUnitCount,
    totalTerminalCapacity,
    perTeaTerminalCapacity: toAmounts(perTeaCapacity, normalized.teaIds),
    reasonCode,
    ...extra,
  };
}

/**
 * Authoritative terminal-allocation analysis.
 *
 * Soundness:
 * - `AlgebraicUnsat` means no terminal allocation can satisfy the supplied
 *   conservation/finality contracts.
 * - `AlgebraicallyFeasible` means at least one terminal allocation exists. It
 *   does NOT prove reachability, solver-solvability, fairness or fun.
 * - `Unsupported` means the input changes TeaId identity and cannot be
 *   analyzed with per-TeaId conservation.
 */
export function analyzeTerminalAllocation(
  problem: TerminalAllocationProblem,
): TerminalAllocationResult {
  const normalized = normalizeProblem(problem);
  const teaCount = normalized.teaIds.length;

  const fixedUnits = normalized.units.filter((unit) => unit.options.length === 1);
  const flexibleUnits = normalized.units.filter((unit) => unit.options.length > 1);

  const fixedConsumption = zeroVector(teaCount);
  for (const unit of fixedUnits) {
    const option = unit.options[0] as NormalizedOption;
    for (let t = 0; t < teaCount; t++) {
      fixedConsumption[t] = (fixedConsumption[t] as number) + (option.amounts[t] as number);
    }
  }

  const residual = subtractVectors(normalized.inventory, fixedConsumption);

  if (normalized.transformations.length > 0) {
    const reason = 'chemistry requires transformation-aware accounting; per-TeaId conservation is unsupported';
    return {
      verdict: 'Unsupported',
      reason,
      exploredStates: 0,
      unsupportedReason: reason,
      diagnostic: makeDiagnostic(
        normalized,
        fixedConsumption,
        residual,
        fixedUnits.length,
        'unsupported-transformation',
      ),
    };
  }

  for (let t = 0; t < teaCount; t++) {
    const remaining = residual[t] as number;
    if (remaining < 0) {
      const tea = normalized.teaIds[t] as TeaId;
      const demand = fixedConsumption[t] as number;
      const have = normalized.inventory[t] as number;
      const reason = `Fixed terminal demand exceeds inventory for TeaId ${tea}: demand ${demand}, inventory ${have}.`;
      return {
        verdict: 'AlgebraicUnsat',
        reason,
        residual: toAmounts(residual, normalized.teaIds),
        exploredStates: 0,
        diagnostic: makeDiagnostic(
          normalized,
          fixedConsumption,
          residual,
          fixedUnits.length,
          'fixed-demand-exceeds-inventory',
          { impossibleTeaId: tea },
        ),
      };
    }
  }

  const residualTotal = sumVector(residual);
  const flexibleTotalMax = flexibleUnits.reduce((sum, unit) => sum + unit.maxTotal, 0);
  if (residualTotal > flexibleTotalMax) {
    const reason =
      `Residual total ${residualTotal} exceeds the ${flexibleTotalMax} units the remaining ` +
      `${flexibleUnits.length} terminal contracts can consume.`;
    return {
      verdict: 'AlgebraicUnsat',
      reason,
      residual: toAmounts(residual, normalized.teaIds),
      exploredStates: 0,
      diagnostic: makeDiagnostic(
        normalized,
        fixedConsumption,
        residual,
        fixedUnits.length,
        'total-capacity-exceeds',
      ),
    };
  }

  for (let t = 0; t < teaCount; t++) {
    const remaining = residual[t] as number;
    const sums = achievableSums(flexibleUnits, t);
    if (!sums.has(remaining)) {
      const tea = normalized.teaIds[t] as TeaId;
      const sorted = [...sums].sort((a, b) => a - b);
      const preview = sorted.length <= 12
        ? sorted.join(', ')
        : `${sorted.slice(0, 12).join(', ')}, … (${sorted.length} values)`;
      const reason =
        `Residual TeaId ${tea}=${remaining} cannot be formed by the remaining terminal units ` +
        `(achievable totals: ${preview}).`;
      return {
        verdict: 'AlgebraicUnsat',
        reason,
        residual: toAmounts(residual, normalized.teaIds),
        exploredStates: 0,
        diagnostic: makeDiagnostic(
          normalized,
          fixedConsumption,
          residual,
          fixedUnits.length,
          'per-tea-residual-not-representable',
          { impossibleTeaId: tea },
        ),
      };
    }
  }

  const flexibleCount = flexibleUnits.length;
  const suffixMaxTotal = new Array<number>(flexibleCount + 1).fill(0);
  const suffixMaxByTea = Array.from({ length: flexibleCount + 1 }, () =>
    zeroVector(teaCount),
  );
  for (let i = flexibleCount - 1; i >= 0; i--) {
    const unit = flexibleUnits[i] as NormalizedUnit;
    suffixMaxTotal[i] = (suffixMaxTotal[i + 1] as number) + unit.maxTotal;
    const row = suffixMaxByTea[i] as number[];
    const nextRow = suffixMaxByTea[i + 1] as number[];
    for (let t = 0; t < teaCount; t++) {
      row[t] = (nextRow[t] as number) + (unit.maxByTea[t] as number);
    }
  }

  const failed = new Set<string>();
  const chosen = new Array<number>(flexibleCount).fill(-1);
  let exploredStates = 0;
  let frontierUnitIndex = -1;
  let frontierResidual: number[] | null = null;

  const recordFrontier = (index: number, remaining: readonly number[]): void => {
    if (index > frontierUnitIndex) {
      frontierUnitIndex = index;
      frontierResidual = [...remaining];
      return;
    }
    if (index < frontierUnitIndex || frontierResidual === null) return;
    for (let t = 0; t < teaCount; t++) {
      const a = remaining[t] as number;
      const b = frontierResidual[t] as number;
      if (a < b) {
        frontierResidual = [...remaining];
        return;
      }
      if (a > b) return;
    }
  };

  const dfs = (index: number, remaining: readonly number[]): boolean => {
    if (index === flexibleCount) {
      return remaining.every((value) => value === 0);
    }
    const key = `${index}|${remaining.join(',')}`;
    if (failed.has(key)) return false;

    exploredStates++;

    for (let t = 0; t < teaCount; t++) {
      const value = remaining[t] as number;
      if (value < 0 || value > (suffixMaxByTea[index] as number[])[t]!) {
        failed.add(key);
        recordFrontier(index, remaining);
        return false;
      }
    }
    if (sumVector(remaining) > (suffixMaxTotal[index] as number)) {
      failed.add(key);
      recordFrontier(index, remaining);
      return false;
    }

    const unit = flexibleUnits[index] as NormalizedUnit;
    for (let optionIndex = 0; optionIndex < unit.options.length; optionIndex++) {
      const option = unit.options[optionIndex] as NormalizedOption;
      const next = subtractVectors(remaining, option.amounts);
      if (dfs(index + 1, next)) {
        chosen[index] = optionIndex;
        return true;
      }
    }

    failed.add(key);
    recordFrontier(index, remaining);
    return false;
  };

  const feasible = dfs(0, residual);

  if (feasible) {
    const assignmentByUnit = new Map<string, TerminalAllocationAssignment>();
    for (const unit of fixedUnits) {
      const option = unit.options[0] as NormalizedOption;
      assignmentByUnit.set(unit.id, {
        unitId: unit.id,
        unitLabel: unit.label,
        unitKind: unit.kind,
        members: unit.members,
        optionIndex: 0,
        optionLabel: option.label,
        amounts: toAmounts(option.amounts, normalized.teaIds),
      });
    }
    for (let i = 0; i < flexibleCount; i++) {
      const unit = flexibleUnits[i] as NormalizedUnit;
      const optionIndex = chosen[i] as number;
      const option = unit.options[optionIndex] as NormalizedOption;
      assignmentByUnit.set(unit.id, {
        unitId: unit.id,
        unitLabel: unit.label,
        unitKind: unit.kind,
        members: unit.members,
        optionIndex,
        optionLabel: option.label,
        amounts: toAmounts(option.amounts, normalized.teaIds),
      });
    }

    const assignments = normalized.units
      .map((unit) => assignmentByUnit.get(unit.id))
      .filter((assignment): assignment is TerminalAllocationAssignment => assignment !== undefined);

    // Internal invariant: a witness must conserve the exact inventory vector.
    const conserved = zeroVector(teaCount);
    for (const assignment of assignments) {
      for (let t = 0; t < teaCount; t++) {
        conserved[t] = (conserved[t] as number) +
          ((assignment.amounts[normalized.teaIds[t] as TeaId] ?? 0) as number);
      }
    }
    for (let t = 0; t < teaCount; t++) {
      if (conserved[t] !== normalized.inventory[t]) {
        throw new Error(
          `internal witness conservation failure for TeaId ${normalized.teaIds[t]}: ` +
            `witness ${String(conserved[t])}, inventory ${String(normalized.inventory[t])}`,
        );
      }
    }

    return {
      verdict: 'AlgebraicallyFeasible',
      witness: { assignments },
      exploredStates,
      diagnostic: makeDiagnostic(
        normalized,
        fixedConsumption,
        residual,
        fixedUnits.length,
        'feasible',
      ),
    };
  }

  let reason: string;
  if (frontierUnitIndex >= 0 && frontierResidual !== null) {
    let impossibleTea: TeaId | undefined;
    let impossibleValue = 0;
    let impossibleBound = 0;
    for (let t = 0; t < teaCount; t++) {
      const value = frontierResidual[t] as number;
      const bound = (suffixMaxByTea[frontierUnitIndex] as number[])[t] as number;
      if (value > bound) {
        impossibleTea = normalized.teaIds[t] as TeaId;
        impossibleValue = value;
        impossibleBound = bound;
        break;
      }
    }
    if (impossibleTea !== undefined) {
      reason =
        `At terminal unit ${frontierUnitIndex}, residual TeaId ${impossibleTea}=${impossibleValue} ` +
        `exceeds the ${impossibleBound} units the remaining terminal contracts can consume for it.`;
    } else {
      reason =
        `No assignment of the remaining terminal units consumes residual ` +
        `${describeVector(frontierResidual, normalized.teaIds)} exactly ` +
        `(frontier after ${frontierUnitIndex} of ${flexibleCount} flexible units).`;
    }
  } else {
    reason =
      `No assignment of the remaining terminal units consumes residual ` +
      `${describeVector(residual, normalized.teaIds)} exactly.`;
  }

  return {
    verdict: 'AlgebraicUnsat',
    reason,
    residual: toAmounts(residual, normalized.teaIds),
    exploredStates,
    diagnostic: makeDiagnostic(
      normalized,
      fixedConsumption,
      residual,
      fixedUnits.length,
      'no-terminal-allocation',
      {
        ...(frontierUnitIndex >= 0 ? { frontierUnitIndex } : {}),
        ...(frontierResidual !== null
          ? { frontierResidual: toAmounts(frontierResidual, normalized.teaIds) }
          : {}),
      },
    ),
  };
}
