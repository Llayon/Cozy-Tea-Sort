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
 * - SHARED TRAY + ANY (servingOrder/mystery/tasting/honey/strainer/blend):
 *   level FORBID, cup FORBID (G16 production is STANDALONE; no proven
 *   composition semantics; Shared+Blend stays FORBID).
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
  | 'blend'
  | 'sharedTray';

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
  'servingOrder+sharedTray': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'G16 production is standalone; shared tray has no proven composition with serving order',
  },
  'mystery+sharedTray': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'G16 production is standalone; shared tray has no proven composition with mystery',
  },
  'sharedTray+tasting': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'G16 production is standalone; shared tray has no proven composition with tasting',
  },
  'honey+sharedTray': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'G16 production is standalone; shared tray has no proven composition with honey',
  },
  'sharedTray+strainer': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'G16 production is standalone; shared tray has no proven composition with strainer',
  },
  'blend+sharedTray': {
    sameLevel: 'forbid',
    sameCup: 'forbid',
    reason: 'G16 production is standalone; Shared+Blend stays forbidden (chemistry standalone)',
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
 *
 * G16: sharedTray is STANDALONE (no partner mechanic). Any sharedTray +
 * sibling special fails closed here; the dedicated shared-tray request
 * validator additionally rejects non-composition siblings (ice/thermos/
 * cinnamon/tea-bud/lemon/teapot/sink/targets) that have no composition id.
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

/**
 * Validate a shared-tray request class (G16 §50, pure, no RNG/mutation).
 * Returns human-readable reasons (empty = valid standalone shared tray).
 * G16 production is STANDALONE: any sibling composition mechanic fails
 * closed here. Non-composition siblings (ice/thermos/cinnamon/tea-bud/
 * lemon/teapot/sink/targets/mystery-details) are rejected by the dedicated
 * shared-tray request validator in the generator.
 */
export function validateSharedTrayCombination(flags: {
  sharedTray: boolean;
  servingOrder: boolean;
  mystery: boolean;
  tastingCount: number;
  honey: boolean;
  strainer: boolean;
  blend: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!flags.sharedTray) return reasons;
  const partners: string[] = [];
  if (flags.servingOrder) partners.push('serving order');
  if (flags.mystery) partners.push('mystery');
  if (flags.tastingCount > 0) partners.push('tasting');
  if (flags.honey) partners.push('honey');
  if (flags.strainer) partners.push('strainer');
  if (flags.blend) partners.push('blend');
  for (const p of partners) {
    if (p === 'blend') {
      reasons.push('shared tray + blend is forbidden (G16 §50; chemistry stays standalone)');
    } else {
      reasons.push(`shared tray + ${p} is out of scope (G16 production is standalone)`);
    }
  }
  return reasons;
}
