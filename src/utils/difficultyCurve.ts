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
 * specials are: teapot, mystery, target serving, sink guest cup, tasting
 * bowl, lemon):
 * 1 warmup clean · 2 challenge clean · 3 peak mystery · 4 relax clean ·
 * 5 warmup clean · 6 challenge TEAPOT · 7 peak TEAPOT+mystery · 8 relax clean ·
 * 9 warmup clean · 10 challenge 2 TARGETS · 11 peak 2 TARGETS+mystery ·
 * 12 relax clean · 13 warmup clean · 14 challenge TEAPOT+2 TARGETS ·
 * 15 peak TEAPOT+mystery · 16 relax clean ·
 * 17 warmup clean · 18 challenge SINK · 19 peak SINK+mystery ·
 * 20 relax clean · 21 warmup clean · 22 challenge TEAPOT+SINK ·
 * 23 peak TARGETS+mystery · 24 relax clean ·
 * 25 warmup clean · 26 challenge TASTING · 27 peak TASTING+mystery ·
 * 28 relax clean · 29 warmup clean · 30 challenge TEAPOT+TASTING ·
 * 31 peak TARGETS+mystery · 32 relax clean ·
 * 33 warmup clean · 34 challenge LEMON · 35 peak LEMON+mystery ·
 * 36 relax clean · 37 warmup clean · 38 challenge TEAPOT+LEMON ·
 * 39 peak SINK+mystery · 40 relax clean.
 * Lemon levels always carry sea_buckthorn in the active palette.
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
  lemon: boolean;
  strainer: boolean;
  honey: boolean;
  frozen: boolean;
  thermos: boolean;
  cinnamon: boolean;
  teaBloom: boolean;
}

const CLEAN: MechanicPlan = { teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false };

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
 * Pinned rollout 33–40 (Gauntlet 5 — first floating lemon):
 * 33 warmup clean · 34 challenge LEMON · 35 peak LEMON+mystery ·
 * 36 relax clean · 37 warmup clean · 38 challenge TEAPOT+LEMON ·
 * 39 peak SINK+mystery (familiar combo, no lemon) · 40 relax clean.
 */
const PINNED_ROLLOUT_33_40: Record<number, MechanicPlan> = {
  33: { ...CLEAN },
  34: { ...CLEAN, lemon: true },
  35: { ...CLEAN, lemon: true },
  36: { ...CLEAN },
  37: { ...CLEAN },
  38: { ...CLEAN, teapot: true, lemon: true },
  39: { ...CLEAN, sink: true },
  40: { ...CLEAN },
};

/**
 * Pinned rollout 41–48 (Gauntlet 6 — catch-one strainer, tight topology):
 * 41 warmup clean · 42 challenge STRAINER · 43 peak STRAINER+mystery ·
 * 44 relax clean · 45 warmup clean · 46 challenge TEAPOT+STRAINER ·
 * 47 peak LEMON+mystery (familiar combo, no strainer) · 48 relax clean.
 */
const PINNED_ROLLOUT_41_48: Record<number, MechanicPlan> = {
  41: { ...CLEAN },
  42: { ...CLEAN, strainer: true },
  43: { ...CLEAN, strainer: true },
  44: { ...CLEAN },
  45: { ...CLEAN },
  46: { ...CLEAN, teapot: true, strainer: true },
  47: { ...CLEAN, lemon: true },
  48: { ...CLEAN },
};

/**
 * Pinned rollout 49–56 (Gauntlet 7 — sinking honey «Мёд на дне»):
 * 49 warmup clean · 50 challenge HONEY · 51 peak HONEY+mystery ·
 * 52 relax clean · 53 warmup clean · 54 challenge TEAPOT+HONEY ·
 * 55 peak STRAINER+mystery (familiar mechanic) · 56 relax clean.
 */
const PINNED_ROLLOUT_49_56: Record<number, MechanicPlan> = {
  49: { ...CLEAN },
  50: { ...CLEAN, honey: true },
  51: { ...CLEAN, honey: true },
  52: { ...CLEAN },
  53: { ...CLEAN },
  54: { ...CLEAN, teapot: true, honey: true },
  55: { ...CLEAN, strainer: true },
  56: { ...CLEAN },
};

/**
 * Pinned rollout 57–64 (Gauntlet 8 — lemon+honey interaction):
 * 57 warmup clean · 58 challenge LEMON+HONEY · 59 peak HONEY+mystery
 * (familiar combination) · 60 relax clean · 61 warmup clean ·
 * 62 challenge LEMON+HONEY (no tutorial repeat) · 63 peak STRAINER+mystery
 * (familiar combination) · 64 relax clean.
 */
const PINNED_ROLLOUT_57_64: Record<number, MechanicPlan> = {
  57: { ...CLEAN },
  58: { ...CLEAN, lemon: true, honey: true },
  59: { ...CLEAN, honey: true },
  60: { ...CLEAN },
  61: { ...CLEAN },
  62: { ...CLEAN, lemon: true, honey: true },
  63: { ...CLEAN, strainer: true },
  64: { ...CLEAN },
};

/**
 * Pinned rollout 65–72 (Gauntlet 9 — frozen cup «Замёрзшая чашка»):
 * 65 warmup clean · 66 challenge FROZEN CUP (tutorial) · 67 peak
 * LEMON+mystery (familiar G8 lemon half — the full lemon+honey interaction
 * is challenge-only by G8 validation, and peak phase forces Mystery, so a
 * literal peak interaction would be ungeneratable) · 68 relax clean ·
 * 69 warmup clean · 70 challenge FROZEN CUP (no tutorial repeat) ·
 * 71 peak HONEY+mystery (familiar combination) · 72 relax clean.
 */
const PINNED_ROLLOUT_65_72: Record<number, MechanicPlan> = {
  65: { ...CLEAN },
  66: { ...CLEAN, frozen: true },
  67: { ...CLEAN, lemon: true },
  68: { ...CLEAN },
  69: { ...CLEAN },
  70: { ...CLEAN, frozen: true },
  71: { ...CLEAN, honey: true },
  72: { ...CLEAN },
};

/**
 * Pinned rollout 73–80 (Gauntlet 10 — high thermos «Высокий термос»):
 * 73 warmup clean · 74 challenge THERMOS (tutorial) · 75 peak
 * STRAINER+mystery (familiar G6 mechanic, already-valid peak) ·
 * 76 relax clean · 77 warmup clean · 78 challenge THERMOS (no tutorial
 * repeat) · 79 peak HONEY+mystery (familiar G7 combination) ·
 * 80 relax clean.
 */
const PINNED_ROLLOUT_73_80: Record<number, MechanicPlan> = {
  73: { ...CLEAN },
  74: { ...CLEAN, thermos: true },
  75: { ...CLEAN, strainer: true },
  76: { ...CLEAN },
  77: { ...CLEAN },
  78: { ...CLEAN, thermos: true },
  79: { ...CLEAN, honey: true },
  80: { ...CLEAN },
};

/**
 * Pinned rollout 81–88 (Gauntlet 11 — cinnamon stick «Палочка корицы»):
 * 81 warmup clean · 82 challenge CINNAMON (tutorial) · 83 peak
 * LEMON+mystery (familiar G5 mechanic, already-valid peak) ·
 * 84 relax clean · 85 warmup clean · 86 challenge CINNAMON (no tutorial
 * repeat) · 87 peak STRAINER+mystery (familiar G6 mechanic,
 * already-valid peak) · 88 relax clean.
 */
const PINNED_ROLLOUT_81_88: Record<number, MechanicPlan> = {
  81: { ...CLEAN },
  82: { ...CLEAN, cinnamon: true },
  83: { ...CLEAN, lemon: true },
  84: { ...CLEAN },
  85: { ...CLEAN },
  86: { ...CLEAN, cinnamon: true },
  87: { ...CLEAN, strainer: true },
  88: { ...CLEAN },
};

/**
 * Pinned rollout 89–96 (Gauntlet 12 — tea bud «Чайный бутон»):
 * 89 warmup clean · 90 challenge TEA BLOOM (tutorial) · 91 peak
 * HONEY+mystery (already-valid familiar safe peak) · 92 relax clean ·
 * 93 warmup clean · 94 challenge TEA BLOOM (no tutorial repeat) ·
 * 95 peak LEMON+mystery (already-valid familiar peak) · 96 relax clean.
 */
const PINNED_ROLLOUT_89_96: Record<number, MechanicPlan> = {
  89: { ...CLEAN },
  90: { ...CLEAN, teaBloom: true },
  91: { ...CLEAN, honey: true },
  92: { ...CLEAN },
  93: { ...CLEAN },
  94: { ...CLEAN, teaBloom: true },
  95: { ...CLEAN, lemon: true },
  96: { ...CLEAN },
};

/**
 * Mechanic plan for any level: pinned table for 1–96, then a deterministic
 * rotation (warmup/relax clean; challenge/peak cycle through ≤2-special
 * combos, never honey + lemon / strainer / sink / tasting / targets except
 * the dedicated lemon+honey interaction, never strainer + lemon / sink /
 * tasting / targets, never lemon + sink / lemon + tasting / lemon +
 * targets / sink + targets / tasting + sink / tasting + targets, never
 * three specials together; frozen cup, thermos, cinnamon and tea bloom stay
 * standalone; no bloom combinations yet).
 */
export function mechanicPlanForLevel(levelNum: number): MechanicPlan {
  const pinned =
    PINNED_ROLLOUT_1_16[levelNum] ?? PINNED_ROLLOUT_17_24[levelNum] ??
    PINNED_ROLLOUT_25_32[levelNum] ?? PINNED_ROLLOUT_33_40[levelNum] ??
    PINNED_ROLLOUT_41_48[levelNum] ?? PINNED_ROLLOUT_49_56[levelNum] ??
    PINNED_ROLLOUT_57_64[levelNum] ?? PINNED_ROLLOUT_65_72[levelNum] ??
    PINNED_ROLLOUT_73_80[levelNum] ?? PINNED_ROLLOUT_81_88[levelNum] ??
    PINNED_ROLLOUT_89_96[levelNum];
  if (pinned) return { ...pinned };
  const cycleIndex = (levelNum - 1) % 4; // 0 warmup, 1 challenge, 2 peak, 3 relax
  const cycleNumber = Math.floor((levelNum - 1) / 4) + 1;
  if (cycleIndex === 0 || cycleIndex === 3) return { ...CLEAN };
  if (cycleIndex === 1) {
    // challenge (no mystery): tea bloom → cinnamon → thermos → frozen cup →
    // lemon+honey → honey → teapot+honey → strainer → teapot+strainer →
    // lemon → teapot+lemon → tasting → teapot+tasting → sink →
    // teapot+sink → targets → teapot+targets (all standalone except the
    // established ≤2-special combos; NO bloom combinations).
    // (Levels 1–96 are pinned, so this rotation only affects 97+; the
    // pre-G12 16-cycle order is preserved after the leading tea-bloom
    // case.)
    switch (cycleNumber % 17) {
      case 0: return { ...CLEAN, teaBloom: true };
      case 1: return { ...CLEAN, cinnamon: true };
      case 2: return { ...CLEAN, thermos: true };
      case 3: return { ...CLEAN, frozen: true };
      case 4: return { ...CLEAN, lemon: true, honey: true };
      case 5: return { ...CLEAN, honey: true };
      case 6: return { ...CLEAN, teapot: true, honey: true };
      case 7: return { ...CLEAN, strainer: true };
      case 8: return { ...CLEAN, teapot: true, strainer: true };
      case 9: return { ...CLEAN, lemon: true };
      case 10: return { ...CLEAN, teapot: true, lemon: true };
      case 11: return { ...CLEAN, tasting: true };
      case 12: return { ...CLEAN, teapot: true, tasting: true };
      case 13: return { ...CLEAN, sink: true };
      case 14: return { ...CLEAN, teapot: true, sink: true };
      case 15: return { ...CLEAN, targets: true };
      default: return { ...CLEAN, teapot: true, targets: true };
    }
  }
  // peak (mystery always on, plus AT MOST ONE more mechanic):
  // honey+mystery → strainer+mystery → lemon+mystery → tasting+mystery →
  // sink+mystery → targets+mystery → teapot+mystery → mystery-only.
  switch (cycleNumber % 8) {
    case 0: return { ...CLEAN, honey: true };
    case 1: return { ...CLEAN, strainer: true };
    case 2: return { ...CLEAN, lemon: true };
    case 3: return { ...CLEAN, tasting: true };
    case 4: return { ...CLEAN, sink: true };
    case 5: return { ...CLEAN, targets: true };
    case 6: return { ...CLEAN, teapot: true };
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
  // teapot/targets/sink/tasting/lemon/strainer/frozen/thermos/cinnamon.
  const plan = mechanicPlanForLevel(levelNum);
  hasSourceOnlyTeapot = plan.teapot;
  const targetTeaIds: TeaId[] = plan.targets ? pickTargetPair(colors) : [];
  const hasSinkGuestCup = plan.sink;
  const hasTastingBowl = plan.tasting;
  const hasStrainer = plan.strainer;
  const hasFrozenCup = plan.frozen;
  const hasThermos = plan.thermos;
  const hasCinnamon = plan.cinnamon;
  const hasTeaBloom = plan.teaBloom;
  // Tight G6 topology override (§24): strainer levels use exactly one
  // ordinary empty vessel (challenge 4c/5v, peak 5c/6v) instead of the
  // ordinary 2-empty layout. Vessel counts stay capped for mobile rows.
  if (hasStrainer) {
    emptyCups = 1;
    if (phase === 'challenge') {
      phaseSubtitle = 'Просчет на 2–3 хода вперед • 5 сосудов';
    } else if (phase === 'peak') {
      phaseSubtitle = 'Таинственный настой • 6 сосудов';
    }
  }
  // Lemon levels require sea_buckthorn in the active palette (validated
  // loudly at generation). Later-cycle palettes may lack it, so swap it
  // into slot 0 deterministically — reshuffles keep the same palette.
  const floatingIngredient = plan.lemon ? ('lemon' as const) : undefined;
  // Honey levels require buckwheat in the active palette (validated loudly
  // at generation). Same deterministic slot-0 injection as lemon.
  const sinkingIngredient = plan.honey ? ('honey' as const) : undefined;
  // Frozen-cup levels require sea_buckthorn in the active palette (the
  // stable melt tea, validated loudly at generation). Same deterministic
  // slot-0 injection — reshuffles keep the same palette.
  if (plan.frozen && !colors.includes('sea_buckthorn')) {
    colors = ['sea_buckthorn', ...colors.slice(1)];
  }
  if (plan.lemon && plan.honey) {
    // Interaction levels need BOTH target teas: sequential single-slot
    // injection would evict the first, so inject both deterministically
    // (buckwheat slot 0, sea_buckthorn slot 1, remaining palette order
    // preserved) — reshuffles keep the same palette.
    if (!colors.includes('sea_buckthorn') || !colors.includes('buckwheat')) {
      const rest = colors.filter((c) => c !== 'sea_buckthorn' && c !== 'buckwheat');
      colors = ['buckwheat', 'sea_buckthorn', ...rest].slice(0, numColors) as TeaId[];
    }
  } else {
    if (floatingIngredient !== undefined && !colors.includes('sea_buckthorn')) {
      colors = ['sea_buckthorn', ...colors.slice(1)];
    }
    if (sinkingIngredient !== undefined && !colors.includes('buckwheat')) {
      colors = ['buckwheat', ...colors.slice(1)];
    }
  }
  if (plan.lemon && plan.honey) {
    phaseSubtitle = 'Лимон и мёд • 6 сосудов';
  } else if (plan.teaBloom) {
    phaseSubtitle = 'Чайный бутон • 6 сосудов';
  } else if (plan.cinnamon) {
    phaseSubtitle = 'Палочка корицы • 6 сосудов';
  } else if (plan.thermos) {
    phaseSubtitle = 'Высокий термос • 6 сосудов';
  } else if (plan.frozen) {
    phaseSubtitle = 'Замёрзшая чашка • 6 сосудов';
  } else if (plan.honey && plan.teapot) {
    phaseSubtitle = 'Чайник с мёдом • 6 сосудов';
  } else if (plan.honey) {
    phaseSubtitle =
      phase === 'challenge' ? 'Мёд на дне • 6 сосудов' : 'Мёд и таинственный настой • 7 сосудов';
  } else if (plan.strainer && plan.teapot) {
    phaseSubtitle = 'Чайник и ситечко • 5 сосудов';
  } else if (plan.strainer) {
    phaseSubtitle =
      phase === 'challenge' ? 'Переносное ситечко • 5 сосудов' : 'Ситечко и таинственный настой • 6 сосудов';
  } else if (plan.lemon && plan.teapot) {
    phaseSubtitle = 'Чайник и лимон • 6 сосудов';
  } else if (plan.lemon) {
    phaseSubtitle =
      phase === 'challenge' ? 'Долька лимона • 6 сосудов' : 'Лимон и таинственный настой • 7 сосудов';
  } else if (plan.tasting && plan.teapot) {
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

  // Gauntlet 10 standalone enforcement (§§105-107): thermos challenge is
  // always the canonical 4c/6v layout (4 teas, 2 nominal empties → 6
  // vessels), no Mystery, no teapot. Phase is already challenge via pinned
  // 74/78 and the post-80 challenge-only rotation; re-assert here so the
  // contract holds even if the base phase defaults shift.
  if (hasThermos) {
    numColors = 4;
    emptyCups = 2;
    hasMysteryLayer = false;
    hasSourceOnlyTeapot = false;
    phaseSubtitle = 'Высокий термос • 6 сосудов';
  }

  // Gauntlet 11 standalone enforcement (§§138-146): cinnamon challenge is
  // always the canonical 4c/6v layout (4 teas, 2 nominal empties → 6
  // vessels), no Mystery, no teapot. Phase is already challenge via pinned
  // 82/86 and the post-88 challenge-only rotation; re-assert here so the
  // contract holds even if the base phase defaults shift.
  if (hasCinnamon) {
    numColors = 4;
    emptyCups = 2;
    hasMysteryLayer = false;
    hasSourceOnlyTeapot = false;
    phaseSubtitle = 'Палочка корицы • 6 сосудов';
  }

  // Gauntlet 12 standalone enforcement: tea-bloom challenge is always the
  // canonical 4c/6v layout (4 teas, 2 nominal empties → 6 vessels), no
  // Mystery, no teapot.
  if (hasTeaBloom) {
    numColors = 4;
    emptyCups = 2;
    hasMysteryLayer = false;
    hasSourceOnlyTeapot = false;
    phaseSubtitle = 'Чайный бутон • 6 сосудов';
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
    hasStrainer,
    hasFrozenCup,
    hasThermos,
    hasCinnamon,
    hasTeaBloom,
    floatingIngredient,
    sinkingIngredient,
    targetTeaIds,
    rewardRecipeId,
    rewardSkinId,
  };
}
