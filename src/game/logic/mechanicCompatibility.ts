/**
 * Mechanic compatibility source of truth (Gauntlet 15 — «Смешанные чаепития»).
 *
 * G15 is a COMPOSITION gauntlet, not a new-mechanic gauntlet. No new player
 * action, no second pour implementation, no ComboState, no combo-specific
 * mutable progress, no second solver. Composition emerges from the SAME legal
 * action graph: base pour validation + existing static constraints + serving
 * order completion constraint → ONE final legal/illegal decision → ONE
 * existing `applyPourState`.
 *
 * TWO separate concepts (never conflated):
 *
 * - LEVEL compatibility: can mechanics coexist somewhere on the SAME board?
 * - CUP compatibility: can constraints from both mechanics exist on the SAME cup?
 *
 * Policy (initial, pure, deterministic, no RNG/mutation/UI/solver):
 *
 * - SERVING ORDER + MYSTERY: level ALLOW (candidate), cup FORBID (separate
 *   cups: mystery hides information, ordered cups must stay readable; also
 *   avoids guessing puzzles through Mystery).
 * - SERVING ORDER + TASTING: level ALLOW (candidate), cup FORBID (static
 *   invalid anyway: order needs cap4 + no mustEndEmpty, tasting is cap2 +
 *   mustEndEmpty).
 * - SERVING ORDER + HONEY: level ALLOW (candidate), cup FORBID (separate
 *   cups: honey host must be ordinary so both goals stay readable).
 * - SERVING ORDER + STRAINER: level RESEARCH, cup RESEARCH (topology mismatch:
 *   strainer needs tight 4c/5v/1e, serving needs 4c/6v/2e; pilot only).
 * - SERVING ORDER + BLEND: level FORBID, cup FORBID (chemistry stays
 *   standalone; G15.1 at earliest, never G15).
 *
 * Existing non-G15 combinations preserve exactly their pre-G15 validation.
 * Fail closed: unknown pairs forbid.
 *
 * No Pixi/React imports — pure domain logic only.
 */

export type CompositionMechanicId =
  | 'servingOrder'
  | 'mystery'
  | 'tasting'
  | 'honey'
  | 'strainer'
  | 'blend';

export type CompatibilityVerdict = 'allow' | 'forbid' | 'research';

export interface MechanicCompatibility {
  sameLevel: CompatibilityVerdict;
  sameCup: CompatibilityVerdict;
  reason?: string;
}

function key(a: CompositionMechanicId, b: CompositionMechanicId): string {
  return [a, b].sort().join('+');
}

const POLICY: Record<string, MechanicCompatibility> = {
  'mystery+servingOrder': {
    sameLevel: 'allow',
    sameCup: 'forbid',
    reason: 'mystery hides information; ordered cups stay readable on separate vessels',
  },
  'servingOrder+tasting': {
    sameLevel: 'allow',
    sameCup: 'forbid',
    reason: 'static invalid: order needs cap4/no-mustEndEmpty, tasting is cap2/mustEndEmpty',
  },
  'honey+servingOrder': {
    sameLevel: 'allow',
    sameCup: 'forbid',
    reason: 'honey host stays ordinary so both goals (buckwheat-under-honey + serve order) stay readable',
  },
  'servingOrder+strainer': {
    sameLevel: 'research',
    sameCup: 'research',
    reason: 'topology mismatch (tight 4c/5v/1e vs 4c/6v/2e); pilot research only',
  },
  'blend+servingOrder': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'reaction chemistry stays standalone; Order+Blend is G15.1 at earliest',
  },
};

/**
 * Single compatibility source of truth. Pure, deterministic, symmetric
 * (A+B === B+A). Unknown pairs fail closed (forbid/forbid).
 */
export function mechanicCompatibility(
  a: CompositionMechanicId,
  b: CompositionMechanicId,
): MechanicCompatibility {
  if (a === b) return { sameLevel: 'allow', sameCup: 'allow', reason: 'same mechanic' };
  const found = POLICY[key(a, b)];
  if (found) return { ...found };
  return { sameLevel: 'forbid', sameCup: 'forbid', reason: 'unknown combination fails closed' };
}

/**
 * Validate one requested composition class (pure, no RNG/mutation/UI/solver).
 * Returns human-readable reasons (empty = valid). Used by generator request
 * validation; runtime rules use lower-level mechanic truths (no second policy).
 *
 * Accepted G15 level classes:
 * - servingOrder only (standalone, G14)
 * - servingOrder + mystery (separate cups)
 * - servingOrder + tasting (tasting 1, separate cups)
 * - servingOrder + honey (honey 1, separate cups)
 *
 * servingOrder + strainer is RESEARCH (not production-valid here).
 * servingOrder + blend is FORBID in both directions.
 */
export function validateMechanicCombination(flags: {
  servingOrder: boolean;
  mystery: boolean;
  tastingCount: number;
  honey: boolean;
  strainer: boolean;
  blend: boolean;
}): string[] {
  const reasons: string[] = [];
  const { servingOrder, mystery, tastingCount, honey, strainer, blend } = flags;
  if (!servingOrder) return reasons;
  if (blend) {
    reasons.push('serving order + blend is forbidden (G15 §17; chemistry stays standalone)');
  }
  if (strainer) {
    reasons.push('serving order + strainer is research-only (G15 §16; not production-valid)');
  }
  if (tastingCount > 0 && tastingCount !== 1) {
    reasons.push(`serving order + tasting needs exactly 1 tasting bowl (got ${tastingCount})`);
  }
  if (mystery && tastingCount > 0) {
    reasons.push('serving order + mystery + tasting is out of scope (at most one partner mechanic)');
  }
  if (mystery && honey) {
    reasons.push('serving order + mystery + honey is out of scope (at most one partner mechanic)');
  }
  if (tastingCount > 0 && honey) {
    reasons.push('serving order + tasting + honey is out of scope (at most one partner mechanic)');
  }
  return reasons;
}
