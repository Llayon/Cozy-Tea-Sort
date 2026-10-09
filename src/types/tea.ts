/**
 * UI-facing types. `TeaId` / `CupSkinId` / `TeaType` are re-exported from
 * the single authoritative palette in `src/game/types.ts` — do not
 * redefine them here.
 */

export type { TeaId, CupSkinId, TeaType } from '../game/types';
import type { CupSkinId, FloatingIngredientId, SinkingIngredientId, TeaId } from '../game/types';

export interface CupSkin {
  id: CupSkinId;
  name: string;
  description: string;
  unlockLevel: number;
  previewColor: string;
  borderColor: string;
  fillColor: string;
  accentColor: string;
}

export interface TeaRecipe {
  id: TeaId;
  title: string;
  subtitle: string;
  unlockLevel: number;
  flavorNotes: string[];
  ingredients: string[];
  tastingNotes: string;
  brewing: {
    temp: string;
    time: string;
    portion: string;
  };
  colorHex: string;
}

export type LevelRhythmPhase = 'warmup' | 'challenge' | 'peak' | 'relax';

export interface LevelConfig {
  levelNumber: number;
  phase: LevelRhythmPhase;
  phaseName: string;
  phaseSubtitle: string;
  numColors: number;
  emptyCups: number;
  totalCups: number;
  colors: TeaId[];
  /**
   * Legacy shuffle-count proxy for difficulty (kept for compatibility).
   * Difficulty is determined by solver-derived minimum solution depth,
   * NOT by this number.
   *
   * @deprecated Do not use for difficulty decisions.
   */
  shuffleSteps: number;
  hasMysteryLayer: boolean;
  /** True when this level includes the source-only teapot (Gauntlet 1). */
  hasSourceOnlyTeapot: boolean;
  /** True when this level includes the sink-only guest cup (Gauntlet 3). */
  hasSinkGuestCup: boolean;
  /** True when this level includes the tasting bowl (Gauntlet 4). */
  hasTastingBowl: boolean;
  /** True when this level includes the catch-one movable strainer (Gauntlet 6, tight topology). */
  hasStrainer: boolean;
  /** True when this level includes the frozen cup / ice overlay (Gauntlet 9, authored 4,4,4,3,1,0 topology). */
  hasFrozenCup: boolean;
  /** True when this level includes the high thermos (Gauntlet 10, authored 4,4,3,2,0 + T3 thermos-3 topology). */
  hasThermos?: boolean;
  /** True when this level includes the cinnamon stick (Gauntlet 11, authored 4,4,3,3,2,0 topology). */
  hasCinnamon?: boolean;
  /** True when this level includes the dormant tea bud (Gauntlet 12, authored 4,4,4,4,0,0 topology). */
  hasTeaBloom?: boolean;
  /**
   * Floating ingredient active on this level (Gauntlet 5). `undefined` =
   * classic level. Deterministic per level: reshuffling keeps the lemon
   * (new topology, new host) but never advances progression.
   */
  floatingIngredient?: FloatingIngredientId;
  /**
   * Sinking ingredient active on this level (Gauntlet 7 — «Мёд на дне»).
   * `undefined` = classic level. Deterministic per level: reshuffling
   * keeps the honey (new topology, new host) but never advances
   * progression.
   */
  sinkingIngredient?: SinkingIngredientId;
  /**
   * Named-serving destinations for this level (Gauntlet 2). Empty = none.
   * Deterministic per level: reshuffling keeps the same serving goals.
   */
  targetTeaIds: TeaId[];
  rewardRecipeId?: TeaId;
  rewardSkinId?: CupSkinId;
}
