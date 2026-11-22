/**
 * Choice Brew production contract (Gauntlet 22 — «Выбор заварки»).
 *
 * History-dependent objective, standalone only. The legal pour graph stays
 * ordinary Water Sort; only the victory contract gains a history stage.
 *
 * Static contract (immutable level data, never PuzzleState):
 *   one vessel (normal / capacity 4 / mustEndEmpty) + unordered allowed pair.
 * Dynamic history (the ONE mutable truth, in `PuzzleState.choiceBrewState`):
 *   stage 0 = not yet satisfied, 1 = satisfied (persists after draining).
 *
 * No chosenTea is ever stored: victory only cares that stage == 1.
 */

import {
  ALL_TEA_IDS,
  STANDARD_CUP_CAPACITY,
  type ChoiceBrewState,
  type CupConstraint,
  type TeaId,
  cupCapacity,
  mustEndEmpty,
} from '../types';

export type { ChoiceBrewState };

/**
 * Static Choice Brew contract (immutable level data).
 * `vesselIndex` identifies the single brewing vessel; `allowedTeas` is the
 * unordered pair — `[A,B]` is semantically identical to `[B,A]`.
 */
export interface ChoiceBrewContract {
  vesselIndex: number;
  allowedTeas: readonly [TeaId, TeaId];
}

function isKnownTeaId(t: unknown): t is TeaId {
  return typeof t === 'string' && (ALL_TEA_IDS as readonly string[]).includes(t);
}

function isPlainOrdinaryVessel(c: CupConstraint | undefined): boolean {
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

function isChoiceBrewVessel(c: CupConstraint | undefined): boolean {
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
 * Production shape validation (fail-closed).
 * Exactly one Choice Brew vessel (normal/cap4/mustEndEmpty, explicit
 * capacity), all other vessels plain ordinary, pair of two distinct known
 * TeaIds, vessel in range. Standalone only.
 */
export function isValidChoiceBrewContract(
  contract: ChoiceBrewContract | undefined | null,
  constraints?: readonly CupConstraint[] | undefined,
): boolean {
  if (!contract || typeof contract !== 'object') return false;
  if (!constraints || constraints.length === 0) return false;
  const n = constraints.length;
  const v = (contract as { vesselIndex?: unknown }).vesselIndex;
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= n) return false;
  if (!isChoiceBrewVessel(constraints[v as number])) return false;
  let endEmptyCount = 0;
  for (let i = 0; i < n; i++) {
    if (mustEndEmpty(constraints[i])) endEmptyCount++;
  }
  if (endEmptyCount !== 1) return false;
  for (let i = 0; i < n; i++) {
    if (i === (v as number)) continue;
    if (!isPlainOrdinaryVessel(constraints[i])) return false;
  }
  const p = (contract as { allowedTeas?: unknown }).allowedTeas;
  if (!Array.isArray(p) || p.length !== 2) return false;
  const a = (p as readonly unknown[])[0];
  const b = (p as readonly unknown[])[1];
  if (!isKnownTeaId(a) || !isKnownTeaId(b)) return false;
  if (a === b) return false;
  return true;
}

/**
 * Stable static identity for canonical keys. The unordered pair is
 * order-normalized (`[A,B]` ≡ `[B,A]`), following the same literal-TeaId
 * semantics as the canonical tea encoding (no renaming anywhere).
 */
export function choiceBrewContractSignature(contract: ChoiceBrewContract): string {
  const sorted = [...contract.allowedTeas].sort();
  return `v${contract.vesselIndex}:${sorted[0]}+${sorted[1]}`;
}

export function initialChoiceBrewState(): ChoiceBrewState {
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
 * ONE authoritative advancement seam. Pure: observes the resulting
 * post-pour tea state and returns the next history stage.
 * Monotonic 0 → 1; invalid contracts/stages never advance (fail-closed,
 * previous stage preserved).
 */
export function advanceChoiceBrewState(
  previous: ChoiceBrewState | undefined | null,
  nextCups: readonly TeaId[][],
  contract: ChoiceBrewContract | undefined | null,
  constraints?: readonly CupConstraint[] | undefined,
): ChoiceBrewState | undefined {
  if (!contract) {
    if (previous === undefined || previous === null) return undefined;
    return previous.stage === 1 ? { stage: 1 } : { stage: 0 };
  }
  if (!isValidChoiceBrewContract(contract, constraints)) {
    if (previous === undefined || previous === null) return { stage: 0 };
    return previous.stage === 1 ? { stage: 1 } : { stage: 0 };
  }
  const prevStage = previous?.stage ?? 0;
  if (prevStage !== 0 && prevStage !== 1) return { stage: 0 };
  if (prevStage === 1) return { stage: 1 };
  const cup = nextCups[contract.vesselIndex] as readonly TeaId[] | undefined;
  const [a, b] = contract.allowedTeas;
  if (isFullHomogeneous(cup, a) || isFullHomogeneous(cup, b)) return { stage: 1 };
  return { stage: 0 };
}

export function isChoiceBrewSatisfied(
  state: ChoiceBrewState | undefined | null,
  contract: ChoiceBrewContract | undefined | null,
  constraints?: readonly CupConstraint[] | undefined,
): boolean {
  if (!contract) return false;
  if (!isValidChoiceBrewContract(contract, constraints)) return false;
  return (state?.stage ?? 0) === 1;
}
