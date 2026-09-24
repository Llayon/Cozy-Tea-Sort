/**
 * UI-facing types. `TeaId` / `CupSkinId` / `TeaType` are re-exported from
 * the single authoritative palette in `src/game/types.ts` — do not
 * redefine them here.
 */

export type { TeaId, CupSkinId, TeaType } from '../game/types';
import type { CupSkinId, TeaId } from '../game/types';

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
  rewardRecipeId?: TeaId;
  rewardSkinId?: CupSkinId;
}
