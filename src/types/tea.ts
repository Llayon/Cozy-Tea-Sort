export type TeaId =
  | 'matcha'
  | 'sea_buckthorn'
  | 'karkade'
  | 'milk_oolong'
  | 'lavender'
  | 'saffron'
  | 'buckwheat';

export type CupSkinId = 'glass' | 'ceramic' | 'porcelain';

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

export interface TeaType {
  id: TeaId;
  name: string;
  nameRu: string;
  colorHex: string;
  colorNum: number;
  textColor: string;
  steamColor: string;
  description: string;
  flavorNotes: string[];
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
  shuffleSteps: number;
  hasMysteryLayer: boolean;
  rewardRecipeId?: TeaId;
  rewardSkinId?: CupSkinId;
}
