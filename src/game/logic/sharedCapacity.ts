/**
 * Shared-capacity group kernel (Gauntlet 16 Phase A — TEA TRAY / «Общий поднос»).
 *
 * SHARED CAPACITY ACROSS MULTIPLE VESSELS: exactly TWO otherwise-normal cups
 * sit on the same lightweight tea tray. Each keeps individual capacity 4,
 * but together they may contain at most 6 tea layers total.
 *
 * DERIVED STATE ONLY: no sharedCapacityUsed, trayOccupancy, sharedSlots,
 * trayFree, groupFill or reservedCapacity ever lives in PuzzleState. Shared
 * occupancy derives from current cup lengths + static group identity, which
 * is sound because every legal transition conserves tea and the group rule
 * only bounds outside→tray inflow (inside-group moves preserve the total).
 *
 * No Pixi/React imports here — pure domain logic only. This module must stay
 * importable from rules.ts, so no rules imports here — no cycles.
 */

import {
  SHARED_CAPACITY_LIMITS,
  STANDARD_CUP_CAPACITY,
  CupConstraint,
  ReadonlyPuzzleState,
  SharedCapacityGroupId,
  TeaId,
  cupCapacity,
  mustEndEmpty,
} from '../types';

/** Group of one vessel (`undefined` = ordinary cup, no shared capacity). */
export function sharedCapacityGroupOf(c: CupConstraint | undefined): SharedCapacityGroupId | undefined {
  return c?.sharedCapacityGroup ?? undefined;
}

/** ONE limit truth reader — never copy numeric 6 elsewhere. */
export function sharedCapacityLimit(group: SharedCapacityGroupId): number {
  return SHARED_CAPACITY_LIMITS[group];
}

/** True when any shared-capacity constraint is present (valid or not). */
export function hasSharedCapacity(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some((c) => c?.sharedCapacityGroup !== undefined);
}

/**
 * Vessel indices belonging to a group, in stable index order.
 * Presence of any marker — valid or not — counts here; production
 * validation restricts id / count / shape.
 */
export function sharedCapacityMembers(
  constraints: readonly CupConstraint[] | undefined,
  group: SharedCapacityGroupId,
): number[] {
  if (!constraints) return [];
  const out: number[] = [];
  constraints.forEach((c, idx) => {
    if (c?.sharedCapacityGroup === group) out.push(idx);
  });
  return out;
}

/**
 * Static validity of one shared-tray member cup: normal mode, base capacity 4,
 * no named target, must not end empty, no serving order. Says nothing about
 * group size/uniqueness — that is `validateSharedCapacityConstraints`.
 */
export function isValidSharedTrayMemberConstraint(c: CupConstraint | undefined): boolean {
  if (!c || c.sharedCapacityGroup === undefined) return false;
  if (c.sharedCapacityGroup !== 'tea-tray') return false;
  if (c.mode !== 'normal') return false;
  if (cupCapacity(c) !== STANDARD_CUP_CAPACITY) return false;
  if (c.targetTeaId !== undefined) return false;
  if (mustEndEmpty(c)) return false;
  if (c.serveOrder !== undefined) return false;
  return true;
}

/**
 * Production static contract: when any shared-capacity marker is present,
 * exactly one group ('tea-tray') with exactly 2 members, limit exactly 6,
 * each member a valid standard normal vessel. Returns human-readable reasons
 * (empty = valid). Dynamic specials/tools are validated at request level.
 */
export function validateSharedCapacityConstraints(
  constraints: readonly CupConstraint[] | undefined,
): string[] {
  const reasons: string[] = [];
  if (!constraints) return reasons;
  const groups = new Map<string, number[]>();
  constraints.forEach((c, idx) => {
    const g = c?.sharedCapacityGroup;
    if (g === undefined) return;
    const arr = groups.get(g);
    if (arr) arr.push(idx);
    else groups.set(g, [idx]);
  });
  if (groups.size === 0) return reasons;
  for (const [g, members] of groups) {
    if (g !== 'tea-tray') {
      reasons.push(`shared-capacity group ${g} unsupported (production exactly 'tea-tray')`);
      continue;
    }
    const limit = (SHARED_CAPACITY_LIMITS as Record<string, number>)[g];
    if (limit !== 6) {
      reasons.push(`shared-capacity group ${g} limit must be exactly 6 (got ${String(limit)})`);
    }
    if (members.length !== 2) {
      reasons.push(`shared-capacity group ${g} requires exactly 2 members (got ${members.length})`);
    }
    for (const idx of members) {
      const c = constraints[idx];
      if (c?.mode !== 'normal') reasons.push(`shared-tray vessel ${idx} must be normal (got ${c?.mode})`);
      if (c && cupCapacity(c) !== STANDARD_CUP_CAPACITY) {
        reasons.push(`shared-tray vessel ${idx} must keep base capacity 4`);
      }
      if (c?.targetTeaId !== undefined) reasons.push(`shared-tray vessel ${idx} must not carry a target`);
      if (c && mustEndEmpty(c)) reasons.push(`shared-tray vessel ${idx} must not require ending empty`);
      if (c?.serveOrder !== undefined) reasons.push(`shared-tray vessel ${idx} must not carry serving order`);
    }
  }
  if (groups.size > 1) {
    reasons.push(`at most one shared-capacity group supported (got ${groups.size})`);
  }
  return reasons;
}

/**
 * Group occupancy: sum of tea lengths for all members of the group.
 * Pure derived helper — the ONE occupancy truth.
 */
export function sharedCapacityOccupancy(
  state: ReadonlyPuzzleState,
  constraints: readonly CupConstraint[] | undefined,
  group: SharedCapacityGroupId,
): number {
  const members = sharedCapacityMembers(constraints, group);
  let sum = 0;
  for (const idx of members) {
    sum += (state.cups[idx] as TeaId[] | undefined)?.length ?? 0;
  }
  return sum;
}

/**
 * Group free capacity: limit − occupancy. May be negative for malformed
 * overcap states (callers fail closed; production validation rejects them).
 */
export function sharedCapacityFree(
  state: ReadonlyPuzzleState,
  constraints: readonly CupConstraint[] | undefined,
  group: SharedCapacityGroupId,
): number {
  return sharedCapacityLimit(group) - sharedCapacityOccupancy(state, constraints, group);
}

/**
 * Whether a state violates any shared-capacity limit (occupancy > limit).
 * Malformed overcap states must fail closed (no win, no silent tea deletion).
 */
export function isSharedCapacityOvercap(
  state: ReadonlyPuzzleState,
  constraints: readonly CupConstraint[] | undefined,
): boolean {
  if (!hasSharedCapacity(constraints)) return false;
  const seen = new Set<string>();
  for (const c of constraints ?? []) {
    const g = c?.sharedCapacityGroup;
    if (g === undefined || seen.has(g)) continue;
    seen.add(g);
    const limit = (SHARED_CAPACITY_LIMITS as Record<string, number>)[g];
    if (limit === undefined) return true;
    if (sharedCapacityOccupancy(state, constraints, g as SharedCapacityGroupId) > limit) return true;
  }
  return false;
}

/**
 * Shared-aware transfer bound for one directed pour (G16 §§14-18).
 *
 * - outside → tray member: at most sharedGroupFree (may be 0 → reject).
 * - tray member → outside: no shared bound (frees capacity).
 * - tray A → tray B (same group): NO shared bound (total unchanged).
 * - outside → outside: no shared bound.
 *
 * Returns the maximum ADDITIONAL layers the group budget allows (≥0), or
 * null when no shared rule applies (legacy behavior unchanged). Callers
 * still apply min(top run, destination individual free).
 */
export function sharedCapacityTransferLimit(
  state: ReadonlyPuzzleState,
  fromIdx: number,
  toIdx: number,
  constraints: readonly CupConstraint[] | undefined,
): number | null {
  const toGroup = sharedCapacityGroupOf(constraints?.[toIdx]);
  if (toGroup === undefined) return null;
  const fromGroup = sharedCapacityGroupOf(constraints?.[fromIdx]);
  if (fromGroup !== undefined && fromGroup === toGroup) return null;
  return sharedCapacityFree(state, constraints, toGroup);
}
