/**
 * G30 — TEMPORAL MILESTONE SHOOTOUT (research-only kernel).
 *
 * Minimal authoritative history-dependent objective. Legal pour graph stays
 * ordinary Water Sort; only the victory contract gains a history bit.
 *
 * - Brew Once: static target brewTeaId, stage 0->1 when special becomes
 *   exactly [T,T,T,T].
 * - Choice Brew: static unordered allowed pair {A,B}, stage 0->1 when
 *   special becomes full homogeneous A OR B. No chosen-tea storage.
 * - Brew Sequence: static ordered pair A->B, stage 0=waiting A, 1=A done
 *   waiting B, 2=complete.
 *
 * Single history truth: `BrewMilestoneState.stage`. No satisfied booleans,
 * no completed arrays, no chosenTea, no event log.
 *
 * Standalone only: normal/cap4/mustEndEmpty milestone vessel, no other
 * specials. Malformed contracts fail closed (never advance, never win).
 */

import {
  ALL_TEA_IDS,
  STANDARD_CUP_CAPACITY,
  type BrewMilestoneState,
  type CupConstraint,
  type TeaId,
  cupCapacity,
  mustEndEmpty,
} from '../types';

export type { BrewMilestoneState };

export type BrewMilestoneContract =
  | { kind: 'brew-once'; vesselIndex: number; brewTeaId: TeaId }
  | { kind: 'choice-brew'; vesselIndex: number; allowedTeas: readonly [TeaId, TeaId] }
  | { kind: 'brew-sequence'; vesselIndex: number; firstTea: TeaId; secondTea: TeaId };

export function brewMilestoneMaxStage(contract: BrewMilestoneContract | undefined | null): number {
  if (!contract) return 1;
  if (contract.kind === 'brew-sequence') return 2;
  return 1;
}

function isKnownTeaId(t: unknown): t is TeaId {
  return typeof t === 'string' && (ALL_TEA_IDS as readonly string[]).includes(t);
}

function isPlainNormalCap4NoEndEmpty(c: CupConstraint | undefined): boolean {
  if (!c) return true;
  if (c.mode !== 'normal') return false;
  if (cupCapacity(c) !== STANDARD_CUP_CAPACITY) return false;
  if (mustEndEmpty(c)) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  return true;
}

function isValidMilestoneVessel(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  if (c.mode !== 'normal') return false;
  if (c.capacity !== STANDARD_CUP_CAPACITY) return false;
  if (c.mustEndEmpty !== true) return false;
  if (c.targetTeaId !== undefined) return false;
  if (c.serveOrder !== undefined) return false;
  if (c.sharedCapacityGroup !== undefined) return false;
  if (c.pairedTeaGroup !== undefined) return false;
  if (c.steepingFlask === true) return false;
  return true;
}

/**
 * Fail-closed standalone validation (§53).
 * - milestone vessel must be normal/cap4(explicit)/mustEndEmpty, no other flags;
 * - exactly one mustEndEmpty vessel in the whole board and it is the milestone;
 * - all other vessels plain normal cap4, no targets/orders/groups/flask;
 * - target teas known, distinct where required;
 * - vesselIndex in range, stage range handled separately.
 */
export function isValidBrewMilestoneContract(
  contract: BrewMilestoneContract | undefined | null,
  constraints?: readonly CupConstraint[] | undefined,
): boolean {
  if (!contract || typeof contract !== 'object') return false;
  if (!constraints || constraints.length === 0) return false;
  const n = constraints.length;
  const v = (contract as { vesselIndex?: unknown }).vesselIndex;
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= n) return false;
  const vesselIndex = v as number;
  if (!isValidMilestoneVessel(constraints[vesselIndex])) return false;
  // Exactly one mustEndEmpty vessel (the milestone itself).
  let endEmptyCount = 0;
  for (let i = 0; i < n; i++) {
    if (mustEndEmpty(constraints[i])) endEmptyCount++;
  }
  if (endEmptyCount !== 1) return false;
  // All other vessels must be plain ordinary.
  for (let i = 0; i < n; i++) {
    if (i === vesselIndex) continue;
    if (!isPlainNormalCap4NoEndEmpty(constraints[i])) return false;
  }
  if (contract.kind === 'brew-once') {
    const t = (contract as { brewTeaId?: unknown }).brewTeaId;
    if (!isKnownTeaId(t)) return false;
    return true;
  }
  if (contract.kind === 'choice-brew') {
    const p = (contract as { allowedTeas?: unknown }).allowedTeas;
    if (!Array.isArray(p) || p.length !== 2) return false;
    const a = (p as readonly unknown[])[0];
    const b = (p as readonly unknown[])[1];
    if (!isKnownTeaId(a) || !isKnownTeaId(b)) return false;
    if (a === b) return false;
    return true;
  }
  if (contract.kind === 'brew-sequence') {
    const a = (contract as { firstTea?: unknown }).firstTea;
    const b = (contract as { secondTea?: unknown }).secondTea;
    if (!isKnownTeaId(a) || !isKnownTeaId(b)) return false;
    if (a === b) return false;
    return true;
  }
  return false;
}

export function isValidBrewMilestoneStage(
  stage: unknown,
  contract: BrewMilestoneContract | undefined | null,
): boolean {
  if (!Number.isInteger(stage)) return false;
  const s = stage as number;
  if (s < 0) return false;
  const max = brewMilestoneMaxStage(contract);
  if (s > max) return false;
  return true;
}

/** Stable static identity for canonical keys (§126). B unordered sorted. */
export function brewContractSignature(contract: BrewMilestoneContract): string {
  const v = contract.vesselIndex;
  if (contract.kind === 'brew-once') {
    return `A:v${v}:${contract.brewTeaId}`;
  }
  if (contract.kind === 'choice-brew') {
    const [a, b] = contract.allowedTeas;
    const sorted = [a, b].sort();
    return `B:v${v}:${sorted[0]}+${sorted[1]}`;
  }
  return `C:v${v}:${contract.firstTea}>${contract.secondTea}`;
}

export function initialBrewMilestoneState(): BrewMilestoneState {
  return { stage: 0 };
}

function isFullHomogeneous(cup: readonly TeaId[] | undefined, tea: TeaId): boolean {
  if (!cup || cup.length !== STANDARD_CUP_CAPACITY) return false;
  for (const l of cup) {
    if (l !== tea) return false;
  }
  return true;
}

/**
 * Preferred milestone seam: pure helper observing the resulting post-pour
 * tea state. Monotonic forward; never regresses. Invalid contracts/stages
 * never advance (fail closed, preserve previous).
 */
export function advanceBrewMilestoneState(
  previous: BrewMilestoneState | undefined | null,
  nextCups: readonly TeaId[][],
  contract: BrewMilestoneContract | undefined | null,
  constraints?: readonly CupConstraint[] | undefined,
): BrewMilestoneState | undefined {
  if (!contract) {
    if (previous === undefined || previous === null) return undefined;
    return { stage: previous.stage };
  }
  if (!isValidBrewMilestoneContract(contract, constraints)) {
    if (previous === undefined || previous === null) return { stage: 0 };
    return { stage: previous.stage };
  }
  const prevStage = previous?.stage ?? 0;
  if (!isValidBrewMilestoneStage(prevStage, contract)) {
    return { stage: prevStage };
  }
  const cup = nextCups[contract.vesselIndex] as readonly TeaId[] | undefined;
  if (contract.kind === 'brew-once') {
    if (prevStage === 0 && isFullHomogeneous(cup, contract.brewTeaId)) return { stage: 1 };
    return { stage: prevStage };
  }
  if (contract.kind === 'choice-brew') {
    if (prevStage === 0) {
      const [a, b] = contract.allowedTeas;
      if (isFullHomogeneous(cup, a) || isFullHomogeneous(cup, b)) return { stage: 1 };
    }
    return { stage: prevStage };
  }
  // brew-sequence
  if (prevStage === 0 && isFullHomogeneous(cup, contract.firstTea)) return { stage: 1 };
  if (prevStage === 1 && isFullHomogeneous(cup, contract.secondTea)) return { stage: 2 };
  return { stage: prevStage };
}

export function isBrewMilestoneSatisfied(
  state: BrewMilestoneState | undefined | null,
  contract: BrewMilestoneContract | undefined | null,
  constraints?: readonly CupConstraint[] | undefined,
): boolean {
  if (!contract) return false;
  if (!isValidBrewMilestoneContract(contract, constraints)) return false;
  const stage = state?.stage ?? 0;
  return stage === brewMilestoneMaxStage(contract);
}
