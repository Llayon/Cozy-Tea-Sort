/**
 * Named animation timing constants (single place, no magic numbers).
 *
 * Original pacing was lift 320ms + pour 650ms + return 320ms (~1.3s),
 * which feels long for repeated puzzle interactions. The default below
 * targets ~900ms total while keeping the cozy tilt/pour readable.
 */

export const POUR_ANIMATION = {
  /** Cup lifts/tilts toward the target rim. */
  liftMs: 240,
  /** Liquid stream + sound. */
  pourMs: 420,
  /** Cup returns home and settles. */
  returnMs: 240,
} as const;

export const POUR_DURATION_SEC = POUR_ANIMATION.pourMs / 1000;

export const TOTAL_POUR_MS =
  POUR_ANIMATION.liftMs + POUR_ANIMATION.pourMs + POUR_ANIMATION.returnMs;
