/**
 * G18 tutorial/help inventory report (DEV evidence → docs).
 * Reads the centralized tutorial registry + measured 360px fit metrics and
 * emits docs/g18-tutorial-audit.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TUTORIALS, tutorialById, type TutorialId } from '../../src/game/ui/tutorials';

const ROOT = resolve(import.meta.dirname, '../..');
const HELP: Record<TutorialId, string> = {
  teapot: 'Из чайника можно только разливать чай. Налить чай обратно в него нельзя.',
  targets:
    'Именная сервировка: чашка с золотым знаком должна в конце содержать именно свой чай. Во время игры её можно использовать как обычную чашку.',
  sink: 'Чашка гостя принимает чай, но не отдаёт его обратно.',
  tasting: 'Дегустационная пиала вмещает только 2 слоя и к концу должна быть пустой.',
  lemon:
    'Лимон переезжает при переливании из его чашки и должен закончить на полном облепиховом чае.',
  strainer:
    'Ситечко задерживает один слой во время переливания. Пока слой остаётся в ситечке, его нужно отдельно вернуть в подходящий сосуд. Перестановка пустого ситечка не считается ходом.',
  honey:
    'Мёд остаётся на дне и переезжает только с последним переливанием из опустевшего сосуда. В финале он должен быть под полным гречишным чаем.',
  lemonHoney:
    'Если в сосуде встретились лимон и мёд, они всё равно двигаются по своим правилам: лимон уезжает с любым переливанием, а мёд остаётся на дне до полного опустошения сосуда.',
  frozen:
    'Из замёрзшей чашки нельзя переливать. Налей в неё облепиховый чай — лёд растает, и чашка станет обычной.',
  thermos:
    'Высокий термос вмещает 5 слоёв и переливает чай как обычная чашка. Но в конце уровня термос должен остаться пустым.',
  cinnamon:
    'Пока в чашке палочка корицы, в неё помещается только 2 слоя. Полностью опустоши чашку — палочка уберётся, и чашка снова будет вмещать 4.',
  teaBloom:
    'Чайный бутон распустится, когда его чашка полностью опустеет. После этого чашка остаётся обычной и её можно снова использовать.',
  blend:
    'Если чёрный чай и молоко соприкасаются, они соединяются в один слой молочного чая. Реакция работает в обе стороны.',
  servingOrder:
    'Чашками ① и ② можно пользоваться во время сортировки как обычными. Но полностью собрать их нужно по порядку: сначала ①, затем ②. Поданную чашку больше нельзя переливать.',
  orderTasting:
    'Порядок подачи остаётся активным и в композиции с дегустационной пиалой: сначала ①, затем ②. Сама пиала по-прежнему должна закончить пустой.',
  sharedTray:
    'Две чашки на общем подносе делят вместимость: вместе в них может быть не больше 6 слоёв чая. Переливая чай с подноса наружу, ты освобождаешь место для любой из этих двух чашек.',
  teaPair:
    'Две парные пиалы в конце должны содержать один и тот же чай — по 2 одинаковых слоя в каждой. Цвет заранее не задан: подходящий чай выбирается по ходу решения.',
};
const VISUAL: Record<TutorialId, string> = {
  teapot: 'spout/lid/belly silhouette',
  targets: 'gold medallion + target-tea dot',
  sink: 'gold rim, saucer, ceremonial handle',
  tasting: 'shallow gold-rim bowl + foot saucer',
  lemon: 'floating lemon slice',
  strainer: 'brass stand + mesh marker',
  honey: 'amber bottom blob',
  lemonHoney: 'lemon slice + amber bottom blob',
  frozen: 'pale ice slab + cracks',
  thermos: 'tall narrow body + cap knob',
  cinnamon: 'rolled-bark stick + blocked-slot band',
  teaBloom: 'tied bud at the bottom',
  blend: 'black tea + milk palette (reaction)',
  servingOrder: 'porcelain saucer + ①/② medallion',
  orderTasting: 'saucers ①/② + shallow gold bowl',
  sharedTray: 'ONE continuous wooden tray + six markers',
  teaPair: 'two rose-porcelain bowls + mirrored floral halves',
};

const metrics = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/dev/out/g18-tutorial-metrics.json'), 'utf8'),
) as Array<{ level: number; lines: number; height: number; canvasHeight: number; fits: boolean }>;
const baseline = JSON.parse(
  readFileSync(resolve(ROOT, 'scripts/dev/out/g18-rollout-baseline.json'), 'utf8'),
) as { records: Array<{ levelNumber: number; tutorialEligibility: string[] }> };
const oldCount = (key: string): number =>
  baseline.records.filter((r) => r.tutorialEligibility.includes(key)).length;
const OLD_KEY: Record<TutorialId, string> = {
  teapot: 'teapot',
  targets: 'targets',
  sink: 'sink',
  tasting: 'tasting',
  lemon: 'lemon',
  strainer: 'strainer',
  honey: 'honey',
  lemonHoney: 'lemonHoney',
  frozen: 'frozen',
  thermos: 'thermos',
  cinnamon: 'cinnamon',
  teaBloom: 'teaBloom',
  blend: 'blend',
  servingOrder: 'servingOrder',
  orderTasting: 'servingOrderTasting',
  sharedTray: 'sharedTray',
  teaPair: 'teaPair',
};

const words = (s: string): number => s.trim().split(/\s+/).length;
const metricFor = (level: number) => metrics.find((m) => m.level === level);
const esc = (s: string): string => s.replace(/\|/g, '\\|');

const lines: string[] = [];
lines.push('# G18 — Tutorial & Help Audit');
lines.push('');
lines.push('Source: `origin/main` @ `f2d28287aa0f67e096309800d2224fa5ee574e81` (G17 final).');
lines.push('');
lines.push('Method: extracted every shipped first-exposure tutorial + the persistent Help');
lines.push('entries, then measured the real 360×800 render (banner height, wrapped lines,');
lines.push('remaining canvas height). The centralized registry is');
lines.push('`src/game/ui/tutorials.ts`; gameplay semantics remain in their existing sources.');
lines.push('');
lines.push('## Findings summary');
lines.push('');
lines.push('- **HIGH (fixed): legacy tutorial repetition.** Teapot/targets/sink/tasting/lemon/strainer/honey banners rendered on every later level containing the mechanic: 88–108 banners each in the 1–1600 baseline. They now render only on the intended first-exposure level; Help remains the persistent reference.');
lines.push('- **HIGH (fixed): L154 rendered two banners at once** (tasting tutorial + order composition hint). L154 now renders exactly one composition hint; the base tasting rule is not re-taught.');
lines.push('- **No copy/meaning changes** to existing tutorial strings were made. The fix is visibility/first-exposure only, plus centralization.');
lines.push('- Every tutorial fits 360×800 without hiding the board: max measured height 60.3px, remaining canvas ≥599px (see table).');
lines.push('- Tutorial and Help do not contradict each other, including the Tea Pair emergent-choice rule and Shared Tray group budget.');
lines.push('');
lines.push('## Mobile fit at 360×800');
lines.push('');
lines.push('| level | banner | lines | height px | canvas px | fits |');
lines.push('|---:|---|---:|---:|---:|---|');
for (const m of metrics) {
  lines.push(`| ${m.level} | ${TUTORIALS.find((t) => t.level === m.level)?.bannerId ?? '—'} | ${m.lines} | ${m.height} | ${m.canvasHeight} | ${m.fits ? 'yes' : 'NO'} |`);
}
lines.push('');
lines.push('## Inventory');
lines.push('');
lines.push('| mechanic | first level | tutorial text | help text | words (tutorial/help) | unique concept | duplicate concepts | visual dependence | old banner count | mobile fit |');
lines.push('|---|---:|---|---|---:|---|---|---|---:|---|');
for (const t of TUTORIALS) {
  const m = metricFor(t.level);
  lines.push(
    `| ${t.mechanic} | ${t.level} | ${esc(t.text)} | ${esc(HELP[t.id])} | ${words(t.text)} / ${words(HELP[t.id])} | ${esc(t.concept)} | none | ${VISUAL[t.id]} | ${oldCount(OLD_KEY[t.id])} | ${m?.lines ?? '—'} ${m?.lines === 1 ? 'line' : 'lines'} / ${m?.height ?? '—'}px |`,
  );
}
lines.push('');
lines.push('## One-concept review');
lines.push('');
lines.push('- Each banner explains one **new** action/goal: source-only teapot, named target, sink-only guest, tasting end-empty, ingredient timing, one-layer strainer catch, capacity restriction, bud/melt/reaction, order, shared budget or pair finality.');
lines.push('- Base Water Sort rules (tap source → tap target, same-color/empty destination, one pure tea per cup) are not re-taught in later mechanics.');
lines.push('- Composition levels use one contextual hint only: L58 Lemon+Honey, L154 Order+Tasting.');
lines.push('- Shared Tray and Tea Pair are taught on their first exposure only (L162 / L250); L242 and L330 repeat without a banner.');
lines.push('');
lines.push('## Terminology table');
lines.push('');
lines.push('| term | meaning | where it appears |');
lines.push('|---|---|---|');
lines.push('| Чашка | ordinary/target/serving/guest cup (generic vessel) | base help, teapot/guest/honey/frozen/cinnamon/targets/serving tutorials, HUD |');
lines.push('| Пиала | shallow tasting bowl / paired tea bowl | tasting + tea-pair tutorials and Help |');
lines.push('| Чайник | source-only teapot | L6 tutorial + Help |');
lines.push('| Термос | tall 5-layer temporary vessel | L74 tutorial + Help |');
lines.push('| Ситечко | movable catch-one strainer | L42 tutorial + Help |');
lines.push('| Поднос | shared two-cup six-layer tray | L162 tutorial + Help |');
lines.push('| Чайная пара | two relational cap-2 bowls with one emergent final tea | L250 tutorial + Help |');
lines.push('| Порядок подачи | ordered serving ① → ② | L106/L154 tutorials + Help |');
lines.push('| Слой | one tea layer | tasting/thermos/cinnamon tutorials, Help |');
lines.push('| Чай | tea / named tea type | all copy |');
lines.push('');
lines.push('## Help consistency checks');
lines.push('');
lines.push('- **Tea Pair**: tutorial says the final tea is decided “по ходу”; Help says “Цвет заранее не задан”. Neither implies a preselected target color.');
lines.push('- **Shared Tray**: both tutorial and Help state the group total is 6 and freeing one member frees space for the other; neither says each cup has six slots.');
lines.push('- **Tasting vs Pair**: both capacity-2, but Help/tutorial distinguish “должна быть пустой” (tasting) from “один и тот же чай” (pair).');
lines.push('- **Serving Order**: both tutorial/help say ① then ② and served cups cannot be poured out; Pair never uses numbers or a served lock.');
lines.push('- **Lemon/Honey**: both surfaces explain lemon moves with any outflow, honey only on final emptying.');
lines.push('');
lines.push('## Evidence');
lines.push('');
lines.push('- `scripts/dev/out/g18-tutorial-metrics.json` / `.md` — measured 360px fit.');
lines.push('- `docs/g18-screenshot-manifest.json` — tutorial screenshots at 360/390.');
lines.push('- `tests/g18-tutorial-audit.test.ts` — one-time exposure, copy length, terminology and Help-semantic guards.');
lines.push('');

writeFileSync(resolve(ROOT, 'docs/g18-tutorial-audit.md'), `${lines.join('\n')}\n`);
console.log(
  JSON.stringify(
    {
      out: 'docs/g18-tutorial-audit.md',
      tutorials: TUTORIALS.length,
      maxHeight: Math.max(...metrics.map((m) => m.height)),
      minCanvas: Math.min(...metrics.map((m) => m.canvasHeight)),
      allFit: metrics.every((m) => m.fits),
      oldRepeatedBanners: TUTORIALS.map((t) => ({ id: t.id, oldCount: oldCount(OLD_KEY[t.id]) })),
    },
    null,
    2,
  ),
);
