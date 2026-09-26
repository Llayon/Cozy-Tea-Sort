import { LevelConfig, LevelRhythmPhase, TeaId } from '../types/tea';

/**
 * Кривая сложности «Дыхание» (Sawtooth):
 * Чередует фазы напряжения и расслабления:
 * 1. Разминка (3 цвета, 5 чашек, интуитивно за 4-6 ходов)
 * 2. Легкий вызов (4 цвета, 6 чашек, просчет на 2-3 хода)
 * 3. Пик / «Задачка» (5 цветов, 7 чашек, 1 скрытый слой «Таинственный настой»)
 * 4. Релакс-награда (Спад сложности: 3 цвета, 5 чашек, новый эстетичный цвет чая)
 *
 * Special-mechanic rollout (max 7 vessels, NEVER three specials at once —
 * specials are: teapot, mystery, target serving, sink guest cup, tasting bowl):
 * 1 warmup clean · 2 challenge clean · 3 peak mystery · 4 relax clean ·
 * 5 warmup clean · 6 challenge TEAPOT · 7 peak TEAPOT+mystery · 8 relax clean ·
 * 9 warmup clean · 10 challenge 2 TARGETS · 11 peak 2 TARGETS+mystery ·
 * 12 relax clean · 13 warmup clean · 14 challenge TEAPOT+2 TARGETS ·
 * 15 peak TEAPOT+mystery · 16 relax clean.
 * Later cycles rotate challenge/peak through ≤2-special combos;
 * warmup/relax stay clean decompression levels.
 */

/**
 * Deterministic named-serving pair for a palette: prefers aesthetically
 * recognizable distinct teas (lavender + karkade, then lavender + saffron),
 * falls back to two spaced palette entries. Same LEVEL always yields the
 * same pair, so reshuffling changes arrangement but keeps serving goals.
 */
export function pickTargetPair(palette: TeaId[]): TeaId[] {
  const prefs: Array<[TeaId, TeaId]> = [
    ['lavender', 'karkade'],
    ['lavender', 'saffron'],
    ['karkade', 'saffron'],
  ];
  for (const [a, b] of prefs) {
    if (palette.includes(a) && palette.includes(b)) return [a, b];
  }
  const a = (palette[1] ?? palette[0]) as TeaId;
  const b = ((palette[3] ?? palette[0]) === a ? palette[2] : (palette[3] ?? palette[0])) as TeaId;
  if (a !== b) return [a, b];
  return [palette[0] as TeaId, palette[2] as TeaId];
}

interface MechanicPlan {
  teapot: boolean;
  targets: boolean;
  sink: boolean;
  tasting: boolean;
}

const CLEAN: MechanicPlan = { teapot: false, targets: false, sink: false, tasting: false };

/**
 * Pinned rollout 1–16 (Gauntlets 0–2, behaviorally frozen):
 * 1 warmup clean · 2 challenge clean · 3 peak mystery · 4 relax clean ·
 * 5 warmup clean · 6 challenge TEAPOT · 7 peak TEAPOT+mystery · 8 relax clean ·
 * 9 warmup clean · 10 challenge 2 TARGETS · 11 peak 2 TARGETS+mystery ·
 * 12 relax clean · 13 warmup clean · 14 challenge TEAPOT+2 TARGETS ·
 * 15 peak TEAPOT+mystery · 16 relax clean.
 */
const PINNED_ROLLOUT_1_16: Record<number, MechanicPlan> = {
  1: { ...CLEAN },
  2: { ...CLEAN },
  3: { ...CLEAN },
  4: { ...CLEAN },
  5: { ...CLEAN },
  6: { ...CLEAN, teapot: true },
  7: { ...CLEAN, teapot: true },
  8: { ...CLEAN },
  9: { ...CLEAN },
  10: { ...CLEAN, targets: true },
  11: { ...CLEAN, targets: true },
  12: { ...CLEAN },
  13: { ...CLEAN },
  14: { ...CLEAN, teapot: true, targets: true },
  15: { ...CLEAN, teapot: true },
  16: { ...CLEAN },
};

/**
 * Pinned rollout 17–24 (Gauntlet 3 — first sink-only guest cup):
 * 17 warmup clean · 18 challenge SINK · 19 peak SINK+mystery ·
 * 20 relax clean · 21 warmup clean · 22 challenge TEAPOT+SINK ·
 * 23 peak TARGETS+mystery (familiar combo, no sink) · 24 relax clean.
 */
const PINNED_ROLLOUT_17_24: Record<number, MechanicPlan> = {
  17: { ...CLEAN },
  18: { ...CLEAN, sink: true },
  19: { ...CLEAN, sink: true },
  20: { ...CLEAN },
  21: { ...CLEAN },
  22: { ...CLEAN, teapot: true, sink: true },
  23: { ...CLEAN, targets: true },
  24: { ...CLEAN },
};

/**
 * Pinned rollout 25–32 (Gauntlet 4 — first tasting bowl):
 * 25 warmup clean · 26 challenge TASTING · 27 peak TASTING+mystery ·
 * 28 relax clean · 29 warmup clean · 30 challenge TEAPOT+TASTING ·
 * 31 peak TARGETS+mystery (familiar combo, no tasting) · 32 relax clean.
 */
const PINNED_ROLLOUT_25_32: Record<number, MechanicPlan> = {
  25: { ...CLEAN },
  26: { ...CLEAN, tasting: true },
  27: { ...CLEAN, tasting: true },
  28: { ...CLEAN },
  29: { ...CLEAN },
  30: { ...CLEAN, teapot: true, tasting: true },
  31: { ...CLEAN, targets: true },
  32: { ...CLEAN },
};

/**
 * Mechanic plan for any level: pinned table for 1–32, then a deterministic
 * rotation (warmup/relax clean; challenge/peak cycle through ≤2-special
 * combos, never sink + targets / tasting + sink / tasting + targets,
 * never three specials together).
 */
export function mechanicPlanForLevel(levelNum: number): MechanicPlan {
  const pinned =
    PINNED_ROLLOUT_1_16[levelNum] ?? PINNED_ROLLOUT_17_24[levelNum] ?? PINNED_ROLLOUT_25_32[levelNum];
  if (pinned) return { ...pinned };
  const cycleIndex = (levelNum - 1) % 4; // 0 warmup, 1 challenge, 2 peak, 3 relax
  const cycleNumber = Math.floor((levelNum - 1) / 4) + 1;
  if (cycleIndex === 0 || cycleIndex === 3) return { ...CLEAN };
  if (cycleIndex === 1) {
    // challenge (no mystery): tasting → teapot+tasting → sink →
    // teapot+sink → targets → teapot+targets.
    switch (cycleNumber % 6) {
      case 0: return { ...CLEAN, tasting: true };
      case 1: return { ...CLEAN, teapot: true, tasting: true };
      case 2: return { ...CLEAN, sink: true };
      case 3: return { ...CLEAN, teapot: true, sink: true };
      case 4: return { ...CLEAN, targets: true };
      default: return { ...CLEAN, teapot: true, targets: true };
    }
  }
  // peak (mystery always on, plus AT MOST ONE more mechanic):
  // tasting+mystery → sink+mystery → targets+mystery → teapot+mystery →
  // mystery-only.
  switch (cycleNumber % 5) {
    case 0: return { ...CLEAN, tasting: true };
    case 1: return { ...CLEAN, sink: true };
    case 2: return { ...CLEAN, targets: true };
    case 3: return { ...CLEAN, teapot: true };
    default: return { ...CLEAN };
  }
}
export function getLevelConfig(levelNum: number): LevelConfig {
  const cycleIndex = (levelNum - 1) % 4; // 0, 1, 2, 3
  const cycleNumber = Math.floor((levelNum - 1) / 4) + 1;

  let phase: LevelRhythmPhase = 'warmup';
  let phaseName = 'Разминка';
  let phaseSubtitle = 'Мягкий старт купажа';
  let numColors = 3;
  let emptyCups = 2;
  let shuffleSteps = 14;
  let hasMysteryLayer = false;
  let hasSourceOnlyTeapot = false;
  let colors: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade'];

  if (cycleIndex === 0) {
    // Фаза 1: Разминка (Warmup) — always clean, no special vessels.
    phase = 'warmup';
    phaseName = 'Разминка';
    phaseSubtitle = 'Мягкий медитативный старт • 5 чашек';
    numColors = 3;
    emptyCups = 2;
    shuffleSteps = 12 + Math.min(6, cycleNumber * 2);
    hasMysteryLayer = false;
    hasSourceOnlyTeapot = false;

    if (cycleNumber === 1) {
      colors = ['matcha', 'sea_buckthorn', 'karkade'];
    } else {
      colors = ['matcha', 'saffron', 'milk_oolong'];
    }
  } else if (cycleIndex === 1) {
    // Фаза 2: Легкий вызов (Challenge)
    phase = 'challenge';
    phaseName = 'Легкий вызов';
    phaseSubtitle = 'Просчет на 2–3 хода вперед • 6 чашек';
    numColors = 4;
    emptyCups = 2;
    shuffleSteps = 20 + Math.min(8, cycleNumber * 2);
    hasMysteryLayer = false;

    if (cycleNumber === 1) {
      colors = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
    } else {
      colors = ['saffron', 'lavender', 'karkade', 'milk_oolong'];
    }

    // Special mechanics come from mechanicPlanForLevel below (pinned
    // 1–16, rotation afterwards); subtitles are set in the overlay too.
  } else if (cycleIndex === 2) {
    // Фаза 3: Пик / «Задачка» (Peak)
    phase = 'peak';
    phaseName = 'Пик мастерства';
    phaseSubtitle = 'Таинственный настой • 7 чашек';
    numColors = 5;
    emptyCups = 2; // Exactly 7 cups (capped to fit 2 neat rows on any phone)
    shuffleSteps = 26 + Math.min(8, cycleNumber * 2);
    hasMysteryLayer = true; // Bottom layer hidden until uncovered!

    if (cycleNumber === 1) {
      colors = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'];
    } else {
      colors = ['saffron', 'buckwheat', 'matcha', 'karkade', 'lavender'];
    }

    // Special mechanics (teapot/targets) come from mechanicPlanForLevel
    // below; mystery stays a pure phase property (peak always hides one
    // layer on an untargeted normal cup).
  } else {
    // Фаза 4: Релакс-награда (Relax / Reward) — always clean.
    phase = 'relax';
    phaseName = 'Релакс-передышка';
    phaseSubtitle = 'Выдох и новый золотой купаж • 5 чашек';
    numColors = 3;
    emptyCups = 2;
    shuffleSteps = 12; // Sharp drop in difficulty!
    hasMysteryLayer = false;
    hasSourceOnlyTeapot = false;

    if (levelNum === 4) {
      colors = ['saffron', 'matcha', 'milk_oolong'];
    } else if (levelNum === 8) {
      colors = ['buckwheat', 'sea_buckthorn', 'karkade'];
    } else {
      colors = ['saffron', 'buckwheat', 'lavender'];
    }
  }



  // Special-mechanic overlay: single source of truth for
  // teapot/targets/sink/tasting.
  const plan = mechanicPlanForLevel(levelNum);
  hasSourceOnlyTeapot = plan.teapot;
  const targetTeaIds: TeaId[] = plan.targets ? pickTargetPair(colors) : [];
  const hasSinkGuestCup = plan.sink;
  const hasTastingBowl = plan.tasting;
  if (plan.tasting && plan.teapot) {
    phaseSubtitle = 'Чайник и дегустационная пиала • 6 сосудов';
  } else if (plan.tasting) {
    phaseSubtitle =
      phase === 'challenge' ? 'Дегустационная пиала • 6 сосудов' : 'Пиала и таинственный настой • 7 сосудов';
  } else if (plan.sink && plan.teapot) {
    phaseSubtitle = 'Чайник и чашка гостя • 6 сосудов';
  } else if (plan.sink) {
    phaseSubtitle =
      phase === 'challenge' ? 'Чашка гостя • 6 сосудов' : 'Чашка гостя и таинственный настой • 7 сосудов';
  } else if (plan.teapot && plan.targets) {
    phaseSubtitle =
      phase === 'challenge' ? 'Чайник и сервировка • 6 сосудов' : 'Чайник и сервировка • 7 сосудов';
  } else if (plan.targets) {
    phaseSubtitle =
      phase === 'challenge'
        ? 'Именная сервировка • 6 сосудов'
        : 'Сервировка и таинственный настой • 7 сосудов';
  } else if (plan.teapot) {
    phaseSubtitle =
      phase === 'challenge' ? 'Чайник-раздатчик • 6 сосудов' : 'Чайник и таинственный настой • 7 сосудов';
  }

  // Reward checks
  let rewardRecipeId: TeaId | undefined;
  if (levelNum === 1) rewardRecipeId = 'matcha';
  else if (levelNum === 2) rewardRecipeId = 'sea_buckthorn';
  else if (levelNum === 3) rewardRecipeId = 'karkade';
  else if (levelNum === 4) rewardRecipeId = 'saffron';
  else if (levelNum === 5) rewardRecipeId = 'milk_oolong';
  else if (levelNum === 6) rewardRecipeId = 'lavender';
  else if (levelNum === 8) rewardRecipeId = 'buckwheat';

  let rewardSkinId: 'ceramic' | 'porcelain' | undefined;
  if (levelNum === 3) rewardSkinId = 'ceramic';
  if (levelNum === 5) rewardSkinId = 'porcelain';

  return {
    levelNumber: levelNum,
    phase,
    phaseName,
    phaseSubtitle,
    numColors,
    emptyCups,
    totalCups: numColors + emptyCups,
    colors,
    shuffleSteps,
    hasMysteryLayer,
    hasSourceOnlyTeapot,
    hasSinkGuestCup,
    hasTastingBowl,
    targetTeaIds,
    rewardRecipeId,
    rewardSkinId,
  };
}
