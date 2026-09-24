import { LevelConfig, LevelRhythmPhase, TeaId } from '../types/tea';

/**
 * Кривая сложности «Дыхание» (Sawtooth):
 * Чередует фазы напряжения и расслабления:
 * 1. Разминка (3 цвета, 5 чашек, интуитивно за 4-6 ходов)
 * 2. Легкий вызов (4 цвета, 6 чашек, просчет на 2-3 хода)
 * 3. Пик / «Задачка» (5 цветов, 7 чашек, 1 скрытый слой «Таинственный настой»)
 * 4. Релакс-награда (Спад сложности: 3 цвета, 5 чашек, новый эстетичный цвет чая)
 *
 * Gauntlet 1 rollout (source-only teapot, total vessels unchanged, max 7):
 * 1 warmup standard · 2 challenge standard · 3 peak mystery-only ·
 * 4 relax standard · 5 warmup standard · 6 challenge FIRST TEAPOT (no mystery) ·
 * 7 peak TEAPOT + mystery on a NORMAL cup · 8 relax standard.
 * Later cycles: challenge → teapot, peak → teapot + mystery,
 * warmup/relax stay clean decompression levels.
 */
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

    // First teapot appears on level 6 (cycle 2 challenge); later
    // challenge cycles keep it. Cycle 1 challenge stays standard.
    if (levelNum === 6 || cycleNumber > 2 || (cycleNumber === 2 && levelNum > 2)) {
      // Cycle 2+ challenge (levels 6, 10, 14, …) uses the teapot.
      // Level 2 (cycle 1) is explicitly excluded by the cycleNumber check.
      hasSourceOnlyTeapot = cycleNumber >= 2;
      if (levelNum === 2) hasSourceOnlyTeapot = false;
      if (hasSourceOnlyTeapot) {
        phaseSubtitle = 'Чайник-раздатчик • 6 сосудов';
      }
    }
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

    // Level 3 (cycle 1 peak): mystery-only, no teapot.
    // Level 7+ (cycle 2+ peak): teapot + mystery on a NORMAL cup.
    if (levelNum >= 7) {
      hasSourceOnlyTeapot = true;
      phaseSubtitle = 'Чайник и таинственный настой • 7 сосудов';
    }
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

  // Explicit Gauntlet 1 guard: levels 1–5 and 8 never carry a teapot,
  // even if cycle math above drifts.
  if (levelNum <= 5 || levelNum === 8) {
    hasSourceOnlyTeapot = false;
    if (levelNum === 6) {
      hasSourceOnlyTeapot = true;
    }
  }
  if (levelNum === 6) {
    hasSourceOnlyTeapot = true;
    phaseSubtitle = 'Чайник-раздатчик • 6 сосудов';
  }
  if (levelNum === 7) {
    hasSourceOnlyTeapot = true;
    hasMysteryLayer = true;
    phaseSubtitle = 'Чайник и таинственный настой • 7 сосудов';
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
    rewardRecipeId,
    rewardSkinId,
  };
}
