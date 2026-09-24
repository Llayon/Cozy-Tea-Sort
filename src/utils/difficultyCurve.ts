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
 * specials are: teapot, mystery, target serving):
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
}

const PINNED_ROLLOUT_1_16: Record<number, MechanicPlan> = {
  1: { teapot: false, targets: false },
  2: { teapot: false, targets: false },
  3: { teapot: false, targets: false },
  4: { teapot: false, targets: false },
  5: { teapot: false, targets: false },
  6: { teapot: true, targets: false },
  7: { teapot: true, targets: false },
  8: { teapot: false, targets: false },
  9: { teapot: false, targets: false },
  10: { teapot: false, targets: true },
  11: { teapot: false, targets: true },
  12: { teapot: false, targets: false },
  13: { teapot: false, targets: false },
  14: { teapot: true, targets: true },
  15: { teapot: true, targets: false },
  16: { teapot: false, targets: false },
};

/**
 * Mechanic plan for any level: pinned table for 1–16, then a deterministic
 * rotation (warmup/relax clean; challenge/peak cycle through ≤2-special
 * combos, never teapot + mystery + targets together).
 */
export function mechanicPlanForLevel(levelNum: number): MechanicPlan {
  const pinned = PINNED_ROLLOUT_1_16[levelNum];
  if (pinned) return { ...pinned };
  const cycleIndex = (levelNum - 1) % 4; // 0 warmup, 1 challenge, 2 peak, 3 relax
  const cycleNumber = Math.floor((levelNum - 1) / 4) + 1;
  if (cycleIndex === 0 || cycleIndex === 3) return { teapot: false, targets: false };
  const step = cycleNumber % 3;
  if (cycleIndex === 1) {
    // challenge (no mystery): teapot → targets → teapot+targets.
    if (step === 0) return { teapot: true, targets: false };
    if (step === 1) return { teapot: false, targets: true };
    return { teapot: true, targets: true };
  }
  // peak (mystery always on): teapot+mystery → targets+mystery → mystery-only.
  if (step === 0) return { teapot: true, targets: false };
  if (step === 1) return { teapot: false, targets: true };
  return { teapot: false, targets: false };
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



  // Special-mechanic overlay: single source of truth for teapot/targets.
  const plan = mechanicPlanForLevel(levelNum);
  hasSourceOnlyTeapot = plan.teapot;
  const targetTeaIds: TeaId[] = plan.targets ? pickTargetPair(colors) : [];
  if (plan.teapot && plan.targets) {
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
    targetTeaIds,
    rewardRecipeId,
    rewardSkinId,
  };
}
