/**
 * Paired-tea goal kernel (Gauntlet 17 — TEA PAIR / «Чайная пара»).
 *
 * RELATIONAL FINALITY: exactly TWO otherwise-normal capacity-2 bowls form
 * one pair. Both stay fully usable and reopenable while sorting, but the
 * puzzle is won only when BOTH hold the SAME full homogeneous two-layer
 * tea. The final tea is NOT stored anywhere — it emerges from current
 * contents and derives every time.
 *
 * DERIVED STATE ONLY: no committed tea, anchor index, matched flag, pair
 * status, history or counters live in PuzzleState. Everything derives from
 * current tea contents + static group identity. A completed member can be
 * reopened; when it is, the commitment simply disappears.
 *
 * No Pixi/React imports here — pure domain logic only. This module must
 * stay importable from rules.ts, so no rules imports here — no cycles.
 */

import {
  CupConstraint,
  PairedTeaGroupId,
  TeaId,
  cupCapacity,
  mustEndEmpty,
} from '../types';

/** Production group id — ONE pair group. */
export const TEA_PAIR_GROUP: PairedTeaGroupId = 'tea-pair';

/** Physical capacity of one pair bowl (layer count when locally complete). */
export const TEA_PAIR_MEMBER_CAPACITY = 2;

/** Production member count (exactly two bowls). */
export const TEA_PAIR_MEMBER_COUNT = 2;

/** Local homogeneity check (rules.ts owns the shared one; no rules imports). */
function layersHomogeneous(layers: TeaId[]): boolean {
  if (layers.length === 0) return true;
  const first = layers[0];
  return layers.every((l) => l === first);
}

/** Group of one vessel (`undefined` = ordinary cup, no pair semantics). */
export function pairedTeaGroupOf(c: CupConstraint | undefined): PairedTeaGroupId | undefined {
  return c?.pairedTeaGroup ?? undefined;
}

/** True when any paired-tea constraint is present (valid or not). */
export function hasPairedTea(constraints: readonly CupConstraint[] | undefined): boolean {
  if (!constraints) return false;
  return constraints.some((c) => c?.pairedTeaGroup !== undefined);
}

/**
 * Vessel indices belonging to a group, in stable index order.
 * Presence of any marker — valid or not — counts here; production
 * validation restricts id / count / shape.
 */
export function pairedTeaMembers(
  constraints: readonly CupConstraint[] | undefined,
  group: PairedTeaGroupId = TEA_PAIR_GROUP,
): number[] {
  if (!constraints) return [];
  const out: number[] = [];
  constraints.forEach((c, idx) => {
    if (c?.pairedTeaGroup === group) out.push(idx);
  });
  return out;
}

/**
 * Static validity of one pair member: normal mode, capacity exactly 2, no
 * named target, no must-end-empty, no serving order, no shared-capacity
 * group. Says nothing about group size — that is
 * `validatePairedTeaConstraints`.
 */
export function isValidPairedTeaMemberConstraint(c: CupConstraint | undefined): boolean {
  if (!c || c.pairedTeaGroup === undefined) return false;
  if (c.pairedTeaGroup !== TEA_PAIR_GROUP) return false;
  if (c.mode !== 'normal') return false;
  if (cupCapacity(c) !== TEA_PAIR_MEMBER_CAPACITY) return false;
  if (c.targetTeaId !== undefined) return false;
  if (mustEndEmpty(c)) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  return true;
}

/**
 * Production static contract: when any pair marker is present, exactly one
 * group ('tea-pair') with exactly two valid members. Returns human-readable
 * reasons (empty = valid). Dynamic specials/tools are validated at request
 * level, not here.
 */
export function validatePairedTeaConstraints(
  constraints: readonly CupConstraint[] | undefined,
): string[] {
  const reasons: string[] = [];
  if (!constraints) return reasons;
  const groups = new Map<string, number[]>();
  constraints.forEach((c, idx) => {
    const g = c?.pairedTeaGroup;
    if (g === undefined) return;
    const arr = groups.get(g);
    if (arr) arr.push(idx);
    else groups.set(g, [idx]);
  });
  if (groups.size === 0) return reasons;
  for (const [g, members] of groups) {
    if (g !== TEA_PAIR_GROUP) {
      reasons.push(`paired-tea group ${g} unsupported (production exactly 'tea-pair')`);
      continue;
    }
    if (members.length !== TEA_PAIR_MEMBER_COUNT) {
      reasons.push(
        `paired-tea group ${g} requires exactly ${TEA_PAIR_MEMBER_COUNT} members (got ${members.length})`,
      );
    }
    for (const idx of members) {
      const c = constraints[idx];
      if (c?.mode !== 'normal') reasons.push(`tea-pair vessel ${idx} must be normal (got ${c?.mode})`);
      if (c && cupCapacity(c) !== TEA_PAIR_MEMBER_CAPACITY) {
        reasons.push(
          `tea-pair vessel ${idx} must have capacity ${TEA_PAIR_MEMBER_CAPACITY} (got ${cupCapacity(c)})`,
        );
      }
      if (c?.targetTeaId !== undefined) reasons.push(`tea-pair vessel ${idx} must not carry a target`);
      if (c && mustEndEmpty(c)) reasons.push(`tea-pair vessel ${idx} must not require ending empty`);
      if (c?.serveOrder !== undefined) reasons.push(`tea-pair vessel ${idx} must not carry serving order`);
      if (c?.sharedCapacityGroup !== undefined) {
        reasons.push(`tea-pair vessel ${idx} must not belong to a shared-capacity group`);
      }
    }
  }
  if (groups.size > 1) {
    reasons.push(`at most one paired-tea group supported (got ${groups.size})`);
  }
  return reasons;
}

/**
 * One pair member is LOCALLY complete iff it is a valid pair bowl holding
 * exactly 2 homogeneous layers. Empty, partial and mixed stacks are not.
 */
export function isPairedTeaMemberComplete(
  layers: TeaId[],
  c: CupConstraint | undefined,
): boolean {
  if (!isValidPairedTeaMemberConstraint(c)) return false;
  if (layers.length !== TEA_PAIR_MEMBER_CAPACITY) return false;
  return layersHomogeneous(layers);
}

/**
 * Pure derived pair truth.
 *
 * - neither member complete → uncommitted.
 * - exactly one member [X,X] → committed(X), anchor = that member.
 * - both [X,X] with the same tea → matched(X).
 * - both [X,X] with different teas → conflict(X,Y).
 *
 * Malformed member counts fail closed as `uncommitted` (never matched, so
 * they can never win).
 */
export type PairedTeaStatus =
  | { kind: 'uncommitted' }
  | {
      kind: 'committed';
      tea: TeaId;
      anchorIndex: number;
      partnerIndex: number;
    }
  | {
      kind: 'matched';
      tea: TeaId;
    }
  | {
      kind: 'conflict';
      teaA: TeaId;
      teaB: TeaId;
    };

export function pairedTeaStatus(
  state: { cups: readonly TeaId[][] },
  constraints: readonly CupConstraint[] | undefined,
  group: PairedTeaGroupId = TEA_PAIR_GROUP,
): PairedTeaStatus {
  const members = pairedTeaMembers(constraints, group);
  if (members.length !== TEA_PAIR_MEMBER_COUNT) return { kind: 'uncommitted' };
  const [a, b] = members as [number, number];
  const cupA = (state.cups[a] as TeaId[] | undefined) ?? [];
  const cupB = (state.cups[b] as TeaId[] | undefined) ?? [];
  const cA = constraints?.[a];
  const cB = constraints?.[b];
  const completeA = isPairedTeaMemberComplete(cupA, cA);
  const completeB = isPairedTeaMemberComplete(cupB, cB);
  if (completeA && completeB) {
    const teaA = cupA[0] as TeaId;
    const teaB = cupB[0] as TeaId;
    if (teaA === teaB) return { kind: 'matched', tea: teaA };
    return { kind: 'conflict', teaA, teaB };
  }
  if (completeA) {
    return { kind: 'committed', tea: cupA[0] as TeaId, anchorIndex: a, partnerIndex: b };
  }
  if (completeB) {
    return { kind: 'committed', tea: cupB[0] as TeaId, anchorIndex: b, partnerIndex: a };
  }
  return { kind: 'uncommitted' };
}

/**
 * Relational victory goal: matched pair for some TeaId.
 * Boards without any pair member are vacuously satisfied (legacy
 * byte-identical semantics); malformed pair layouts fail closed.
 */
export function isPairedTeaGoalSatisfied(
  state: { cups: readonly TeaId[][] },
  constraints: readonly CupConstraint[] | undefined,
  group: PairedTeaGroupId = TEA_PAIR_GROUP,
): boolean {
  const members = pairedTeaMembers(constraints, group);
  if (members.length === 0) return true;
  if (members.length !== TEA_PAIR_MEMBER_COUNT) return false;
  return pairedTeaStatus(state, constraints, group).kind === 'matched';
}

/**
 * UI-facing committed tea: committed(X) or matched(X) → X; uncommitted and
 * conflict → null. Derived on every call, never stored.
 */
export function pairedTeaCommittedTea(
  state: { cups: readonly TeaId[][] },
  constraints: readonly CupConstraint[] | undefined,
  group: PairedTeaGroupId = TEA_PAIR_GROUP,
): TeaId | null {
  const status = pairedTeaStatus(state, constraints, group);
  if (status.kind === 'committed' || status.kind === 'matched') return status.tea;
  return null;
}

/** True when this vessel is a statically valid pair member. */
export function isPairedTeaMemberVessel(
  constraints: readonly CupConstraint[] | undefined,
  cupIndex: number,
): boolean {
  return isValidPairedTeaMemberConstraint(constraints?.[cupIndex]);
}
