/**
 * G18 tutorial / first-exposure registry (presentation only).
 *
 * This module owns player-facing tutorial copy + WHICH production level is
 * the one-time first exposure for each mechanic. It contains no gameplay
 * rules, capacities, legality, win conditions or solver semantics — those
 * stay in their established sources.
 *
 * G18 audit finding: legacy banners (teapot/targets/sink/tasting/lemon/
 * strainer/honey) were rendered on every later level containing the
 * mechanic (88–108 times). Tutorials now appear exactly on the intended
 * first-exposure level; Help remains the always-available reference.
 */
import type { LevelConfig } from '../../types/tea';

export type TutorialId =
  | 'teapot'
  | 'targets'
  | 'sink'
  | 'tasting'
  | 'lemon'
  | 'strainer'
  | 'honey'
  | 'lemonHoney'
  | 'frozen'
  | 'thermos'
  | 'cinnamon'
  | 'teaBloom'
  | 'blend'
  | 'servingOrder'
  | 'orderTasting'
  | 'sharedTray'
  | 'teaPair';

export interface TutorialTone {
  background: string;
  border: string;
  text: string;
  icon: string;
}

export interface TutorialDefinition {
  id: TutorialId;
  /** First-exposure production level. Tutorial is not shown later. */
  level: number;
  bannerId: string;
  mechanic: string;
  /** One-new-concept summary used by the audit tests. */
  concept: string;
  text: string;
  tone: TutorialTone;
  /** Defensive presentation guard: level + authoritative config flag. */
  matches: (config: LevelConfig) => boolean;
}

const TONE = {
  teapot: { background: '#2B2115', border: '#5A4426', text: '#E8C98A', icon: '#E8B878' },
  targets: { background: '#252015', border: '#6B5A2E', text: '#E8D9A0', icon: '#E8C878' },
  sink: { background: '#241B2E', border: '#5A4A6B', text: '#D9C9F0', icon: '#C9A8E8' },
  tasting: { background: '#1B2A24', border: '#3E5A4E', text: '#C9E8D4', icon: '#8AC9A8' },
  lemon: { background: '#2E2410', border: '#6B5A2E', text: '#F0DFA8', icon: '#E8C85E' },
  strainer: { background: '#1E2A30', border: '#3E5A66', text: '#C9E4E8', icon: '#8AC9D4' },
  honey: { background: '#2E1F0E', border: '#7A5222', text: '#F5D9A0', icon: '#E8A83E' },
  frozen: { background: '#16242E', border: '#3E5A6B', text: '#C9E2F0', icon: '#8AC9E8' },
  thermos: { background: '#2A2118', border: '#6B5A3E', text: '#F0D9A8', icon: '#E8C878' },
  cinnamon: { background: '#2E1C12', border: '#7A4A2E', text: '#F2C9A0', icon: '#E8A05E' },
  teaBloom: { background: '#1E2A1A', border: '#4A6B3E', text: '#D4E8B8', icon: '#9AC878' },
  blend: { background: '#2E2118', border: '#7A5A3E', text: '#F0D9B8', icon: '#D8A05E' },
  serving: { background: '#232A1E', border: '#5A6B4E', text: '#DCE8C8', icon: '#B8C898' },
  teaPair: { background: '#2B2020', border: '#7A4E58', text: '#F2D8DE', icon: '#D8A0AC' },
} as const satisfies Record<string, TutorialTone>;

export const TUTORIALS: readonly TutorialDefinition[] = [
  {
    id: 'teapot',
    level: 6,
    bannerId: 'teapot-tutorial-hint',
    mechanic: 'teapot',
    concept: 'source-only teapot cannot receive tea',
    text: 'Новый сосуд — чайник. Из него можно только разливать чай. Налить обратно нельзя.',
    tone: TONE.teapot,
    matches: (c) => c.hasSourceOnlyTeapot,
  },
  {
    id: 'targets',
    level: 10,
    bannerId: 'target-tutorial-hint',
    mechanic: 'targets',
    concept: 'named target cups must finish with their tea',
    text: 'Именная сервировка: чашки с золотым знаком ждут свой чай. Их можно использовать как обычно, но в конце нужный сорт должен оказаться именно в своей чашке.',
    tone: TONE.targets,
    matches: (c) => c.targetTeaIds.length > 0,
  },
  {
    id: 'sink',
    level: 18,
    bannerId: 'sink-tutorial-hint',
    mechanic: 'sink',
    concept: 'guest cup receives but never gives tea back',
    text: 'Чашка гостя: в неё можно наливать чай, но переливать обратно нельзя. Выбери, какой чай подать.',
    tone: TONE.sink,
    matches: (c) => c.hasSinkGuestCup,
  },
  {
    id: 'tasting',
    level: 26,
    bannerId: 'tasting-tutorial-hint',
    mechanic: 'tasting',
    concept: 'capacity-2 tasting bowl must end empty',
    text: 'Дегустационная пиала: в неё помещается только 2 слоя. Используй её как временное место — к концу она должна быть пустой.',
    tone: TONE.tasting,
    matches: (c) => c.hasTastingBowl,
  },
  {
    id: 'lemon',
    level: 34,
    bannerId: 'lemon-tutorial-hint',
    mechanic: 'lemon',
    concept: 'lemon travels with outflow and ends on sea buckthorn',
    text: 'Долька лимона: лимон плавает сверху и переезжает вместе с переливанием. К концу оставь его на облепиховом чае.',
    tone: TONE.lemon,
    matches: (c) => c.floatingIngredient === 'lemon' && c.sinkingIngredient !== 'honey',
  },
  {
    id: 'strainer',
    level: 42,
    bannerId: 'strainer-tutorial-hint',
    mechanic: 'strainer',
    concept: 'strainer catches one layer during a pour',
    text: 'Ситечко задерживает 1 слой при переливании. Поставь его на чашку, перелей чай, а задержанный слой потом верни в подходящий сосуд.',
    tone: TONE.strainer,
    matches: (c) => c.hasStrainer,
  },
  {
    id: 'honey',
    level: 50,
    bannerId: 'honey-tutorial-hint',
    mechanic: 'honey',
    concept: 'honey stays at the bottom until the vessel empties',
    text: 'Мёд остаётся на дне. Он переедет только когда чашка опустеет. К концу оставь его под гречишным чаем.',
    tone: TONE.honey,
    matches: (c) => c.sinkingIngredient === 'honey' && c.floatingIngredient !== 'lemon',
  },
  {
    id: 'lemonHoney',
    level: 58,
    bannerId: 'lemon-honey-tutorial-hint',
    mechanic: 'lemon+honey',
    concept: 'lemon and honey move by different timing rules',
    text: 'Лимон уезжает сразу, мёд — только из пустеющей чашки. В финале лимон нужен облепиховому чаю, мёд — гречишному.',
    tone: TONE.lemon,
    matches: (c) => c.floatingIngredient === 'lemon' && c.sinkingIngredient === 'honey',
  },
  {
    id: 'frozen',
    level: 66,
    bannerId: 'frozen-tutorial-hint',
    mechanic: 'frozen',
    concept: 'frozen cup cannot pour until hot tea melts it',
    text: 'Замёрзшая чашка пока не отдаёт чай. Долей в неё облепиховый — лёд растает.',
    tone: TONE.frozen,
    matches: (c) => c.hasFrozenCup,
  },
  {
    id: 'thermos',
    level: 74,
    bannerId: 'thermos-tutorial-hint',
    mechanic: 'thermos',
    concept: 'thermos holds five layers and must end empty',
    text: 'В высокий термос помещается 5 слоёв. Это удобный временный запас, но к концу термос нужно опустошить.',
    tone: TONE.thermos,
    matches: (c) => c.hasThermos === true,
  },
  {
    id: 'cinnamon',
    level: 82,
    bannerId: 'cinnamon-tutorial-hint',
    mechanic: 'cinnamon',
    concept: 'cinnamon restricts capacity until the cup empties',
    text: 'Палочка корицы оставляет место только для 2 слоёв. Полностью опустоши чашку — палочка уберётся, и снова поместится 4.',
    tone: TONE.cinnamon,
    matches: (c) => c.hasCinnamon === true,
  },
  {
    id: 'teaBloom',
    level: 90,
    bannerId: 'tea-bloom-tutorial-hint',
    mechanic: 'teaBloom',
    concept: 'tea bud blooms when its cup empties',
    text: 'На дне спрятан чайный бутон. Полностью опустоши чашку — он распустится.',
    tone: TONE.teaBloom,
    matches: (c) => c.hasTeaBloom === true,
  },
  {
    id: 'blend',
    level: 98,
    bannerId: 'blend-tutorial-hint',
    mechanic: 'blend',
    concept: 'black tea and milk merge on contact',
    text: 'Чёрный чай и молоко соединяются при соприкосновении. Два слоя превращаются в один молочный чай.',
    tone: TONE.blend,
    matches: (c) => c.hasBlend === true,
  },
  {
    id: 'servingOrder',
    level: 106,
    bannerId: 'serving-order-tutorial-hint',
    mechanic: 'servingOrder',
    concept: 'serving cups complete in order one then two',
    text: 'Сначала собери чашку ①, потом ②. Поданную чашку больше не переливают.',
    tone: TONE.serving,
    matches: (c) => c.hasServingOrder === true && c.hasTastingBowl !== true,
  },
  {
    id: 'orderTasting',
    level: 154,
    bannerId: 'serving-order-tasting-tutorial-hint',
    mechanic: 'servingOrder+tasting',
    concept: 'serving order remains active in the composition',
    text: 'Порядок подачи действует и здесь: сначала ①, потом ②.',
    tone: TONE.serving,
    matches: (c) => c.hasServingOrder === true && c.hasTastingBowl === true,
  },
  {
    id: 'sharedTray',
    level: 162,
    bannerId: 'shared-tray-tutorial-hint',
    mechanic: 'sharedTray',
    concept: 'two cups share one six-layer tray budget',
    text: 'На подносе всего 6 мест для чая. Освободи место в одной чашке — оно появится для другой.',
    tone: TONE.serving,
    matches: (c) => c.hasSharedTray === true,
  },
  {
    id: 'teaPair',
    level: 250,
    bannerId: 'tea-pair-tutorial-hint',
    mechanic: 'teaPair',
    concept: 'both pair bowls must finish with the same emergent tea',
    text: 'Парные пиалы должны закончить с одним и тем же чаем. Какой именно — решаешь по ходу.',
    tone: TONE.teaPair,
    matches: (c) => c.hasTeaPair === true,
  },
];

const BY_ID = new Map(TUTORIALS.map((t) => [t.id, t]));

export function tutorialById(id: TutorialId): TutorialDefinition {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown tutorial id: ${id}`);
  return found;
}

/**
 * The ONE tutorial for a level (never more than one banner). Later levels
 * containing the same mechanic intentionally return null: Help is the
 * persistent reference, first exposure is the teaching moment.
 */
export function tutorialForConfig(config: LevelConfig): TutorialDefinition | null {
  for (const tutorial of TUTORIALS) {
    if (config.levelNumber !== tutorial.level) continue;
    if (tutorial.matches(config)) return tutorial;
  }
  return null;
}
