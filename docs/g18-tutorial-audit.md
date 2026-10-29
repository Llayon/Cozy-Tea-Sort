# G18 — Tutorial & Help Audit

Source: `origin/main` @ `f2d28287aa0f67e096309800d2224fa5ee574e81` (G17 final).

Method: extracted every shipped first-exposure tutorial + the persistent Help
entries, then measured the real 360×800 render (banner height, wrapped lines,
remaining canvas height). The centralized registry is
`src/game/ui/tutorials.ts`; gameplay semantics remain in their existing sources.

## Findings summary

- **HIGH (fixed): legacy tutorial repetition.** Teapot/targets/sink/tasting/lemon/strainer/honey banners rendered on every later level containing the mechanic: 88–108 banners each in the 1–1600 baseline. They now render only on the intended first-exposure level; Help remains the persistent reference.
- **HIGH (fixed): L154 rendered two banners at once** (tasting tutorial + order composition hint). L154 now renders exactly one composition hint; the base tasting rule is not re-taught.
- **No copy/meaning changes** to existing tutorial strings were made. The fix is visibility/first-exposure only, plus centralization.
- Every tutorial fits 360×800 without hiding the board: max measured height 60.3px, remaining canvas ≥599px (see table).
- Tutorial and Help do not contradict each other, including the Tea Pair emergent-choice rule and Shared Tray group budget.

## Mobile fit at 360×800

| level | banner | lines | height px | canvas px | fits |
|---:|---|---:|---:|---:|---|
| 6 | teapot-tutorial-hint | 2 | 44.5 | 615 | yes |
| 10 | target-tutorial-hint | 3 | 60.3 | 599 | yes |
| 18 | sink-tutorial-hint | 2 | 44.5 | 615 | yes |
| 26 | tasting-tutorial-hint | 3 | 60.3 | 599 | yes |
| 34 | lemon-tutorial-hint | 2 | 44.5 | 615 | yes |
| 42 | strainer-tutorial-hint | 3 | 60.3 | 599 | yes |
| 50 | honey-tutorial-hint | 2 | 44.5 | 615 | yes |
| 58 | lemon-honey-tutorial-hint | 2 | 44.5 | 615 | yes |
| 66 | frozen-tutorial-hint | 2 | 44.5 | 615 | yes |
| 74 | thermos-tutorial-hint | 2 | 44.5 | 615 | yes |
| 82 | cinnamon-tutorial-hint | 2 | 44.5 | 615 | yes |
| 90 | tea-bloom-tutorial-hint | 2 | 44.5 | 615 | yes |
| 98 | blend-tutorial-hint | 2 | 44.5 | 615 | yes |
| 106 | serving-order-tutorial-hint | 2 | 44.5 | 615 | yes |
| 154 | serving-order-tasting-tutorial-hint | 1 | 28.8 | 630 | yes |
| 162 | shared-tray-tutorial-hint | 2 | 44.5 | 615 | yes |
| 250 | tea-pair-tutorial-hint | 2 | 44.5 | 615 | yes |

## Inventory

| mechanic | first level | tutorial text | help text | words (tutorial/help) | unique concept | duplicate concepts | visual dependence | old banner count | mobile fit |
|---|---:|---|---|---:|---|---|---|---:|---|
| teapot | 6 | Новый сосуд — чайник. Из него можно только разливать чай. Налить обратно нельзя. | Из чайника можно только разливать чай. Налить чай обратно в него нельзя. | 13 / 12 | source-only teapot cannot receive tea | none | spout/lid/belly silhouette | 108 | 2 lines / 44.5px |
| targets | 10 | Именная сервировка: чашки с золотым знаком ждут свой чай. Их можно использовать как обычно, но в конце нужный сорт должен оказаться именно в своей чашке. | Именная сервировка: чашка с золотым знаком должна в конце содержать именно свой чай. Во время игры её можно использовать как обычную чашку. | 25 / 22 | named target cups must finish with their tea | none | gold medallion + target-tea dot | 90 | 3 lines / 60.3px |
| sink | 18 | Чашка гостя: в неё можно наливать чай, но переливать обратно нельзя. Выбери, какой чай подать. | Чашка гостя принимает чай, но не отдаёт его обратно. | 15 / 9 | guest cup receives but never gives tea back | none | gold rim, saucer, ceremonial handle | 88 | 2 lines / 44.5px |
| tasting | 26 | Дегустационная пиала: в неё помещается только 2 слоя. Используй её как временное место — к концу она должна быть пустой. | Дегустационная пиала вмещает только 2 слоя и к концу должна быть пустой. | 20 / 12 | capacity-2 tasting bowl must end empty | none | shallow gold-rim bowl + foot saucer | 107 | 3 lines / 60.3px |
| lemon | 34 | Долька лимона: лимон плавает сверху и переезжает вместе с переливанием. К концу оставь его на облепиховом чае. | Лимон переезжает при переливании из его чашки и должен закончить на полном облепиховом чае. | 17 / 14 | lemon travels with outflow and ends on sea buckthorn | none | floating lemon slice | 92 | 2 lines / 44.5px |
| strainer | 42 | Ситечко задерживает 1 слой при переливании. Поставь его на чашку, перелей чай, а задержанный слой потом верни в подходящий сосуд. | Ситечко задерживает один слой во время переливания. Пока слой остаётся в ситечке, его нужно отдельно вернуть в подходящий сосуд. Перестановка пустого ситечка не считается ходом. | 20 / 25 | strainer catches one layer during a pour | none | brass stand + mesh marker | 89 | 3 lines / 60.3px |
| honey | 50 | Мёд остаётся на дне. Он переедет только когда чашка опустеет. К концу оставь его под гречишным чаем. | Мёд остаётся на дне и переезжает только с последним переливанием из опустевшего сосуда. В финале он должен быть под полным гречишным чаем. | 17 / 22 | honey stays at the bottom until the vessel empties | none | amber bottom blob | 92 | 2 lines / 44.5px |
| lemon+honey | 58 | Лимон уезжает сразу, мёд — только из пустеющей чашки. В финале лимон нужен облепиховому чаю, мёд — гречишному. | Если в сосуде встретились лимон и мёд, они всё равно двигаются по своим правилам: лимон уезжает с любым переливанием, а мёд остаётся на дне до полного опустошения сосуда. | 18 / 28 | lemon and honey move by different timing rules | none | lemon slice + amber bottom blob | 1 | 2 lines / 44.5px |
| frozen | 66 | Замёрзшая чашка пока не отдаёт чай. Долей в неё облепиховый — лёд растает. | Из замёрзшей чашки нельзя переливать. Налей в неё облепиховый чай — лёд растает, и чашка станет обычной. | 13 / 17 | frozen cup cannot pour until hot tea melts it | none | pale ice slab + cracks | 1 | 2 lines / 44.5px |
| thermos | 74 | В высокий термос помещается 5 слоёв. Это удобный временный запас, но к концу термос нужно опустошить. | Высокий термос вмещает 5 слоёв и переливает чай как обычная чашка. Но в конце уровня термос должен остаться пустым. | 16 / 19 | thermos holds five layers and must end empty | none | tall narrow body + cap knob | 1 | 2 lines / 44.5px |
| cinnamon | 82 | Палочка корицы оставляет место только для 2 слоёв. Полностью опустоши чашку — палочка уберётся, и снова поместится 4. | Пока в чашке палочка корицы, в неё помещается только 2 слоя. Полностью опустоши чашку — палочка уберётся, и чашка снова будет вмещать 4. | 18 / 23 | cinnamon restricts capacity until the cup empties | none | rolled-bark stick + blocked-slot band | 1 | 2 lines / 44.5px |
| teaBloom | 90 | На дне спрятан чайный бутон. Полностью опустоши чашку — он распустится. | Чайный бутон распустится, когда его чашка полностью опустеет. После этого чашка остаётся обычной и её можно снова использовать. | 11 / 18 | tea bud blooms when its cup empties | none | tied bud at the bottom | 1 | 2 lines / 44.5px |
| blend | 98 | Чёрный чай и молоко соединяются при соприкосновении. Два слоя превращаются в один молочный чай. | Если чёрный чай и молоко соприкасаются, они соединяются в один слой молочного чая. Реакция работает в обе стороны. | 14 / 18 | black tea and milk merge on contact | none | black tea + milk palette (reaction) | 1 | 2 lines / 44.5px |
| servingOrder | 106 | Сначала собери чашку ①, потом ②. Поданную чашку больше не переливают. | Чашками ① и ② можно пользоваться во время сортировки как обычными. Но полностью собрать их нужно по порядку: сначала ①, затем ②. Поданную чашку больше нельзя переливать. | 11 / 27 | serving cups complete in order one then two | none | porcelain saucer + ①/② medallion | 1 | 2 lines / 44.5px |
| servingOrder+tasting | 154 | Порядок подачи действует и здесь: сначала ①, потом ②. | Порядок подачи остаётся активным и в композиции с дегустационной пиалой: сначала ①, затем ②. Сама пиала по-прежнему должна закончить пустой. | 9 / 20 | serving order remains active in the composition | none | saucers ①/② + shallow gold bowl | 1 | 1 line / 28.8px |
| sharedTray | 162 | На подносе всего 6 мест для чая. Освободи место в одной чашке — оно появится для другой. | Две чашки на общем подносе делят вместимость: вместе в них может быть не больше 6 слоёв чая. Переливая чай с подноса наружу, ты освобождаешь место для любой из этих двух чашек. | 17 / 31 | two cups share one six-layer tray budget | none | ONE continuous wooden tray + six markers | 1 | 2 lines / 44.5px |
| teaPair | 250 | Парные пиалы должны закончить с одним и тем же чаем. Какой именно — решаешь по ходу. | Две парные пиалы в конце должны содержать один и тот же чай — по 2 одинаковых слоя в каждой. Цвет заранее не задан: подходящий чай выбирается по ходу решения. | 16 / 29 | both pair bowls must finish with the same emergent tea | none | two rose-porcelain bowls + mirrored floral halves | 1 | 2 lines / 44.5px |

## One-concept review

- Each banner explains one **new** action/goal: source-only teapot, named target, sink-only guest, tasting end-empty, ingredient timing, one-layer strainer catch, capacity restriction, bud/melt/reaction, order, shared budget or pair finality.
- Base Water Sort rules (tap source → tap target, same-color/empty destination, one pure tea per cup) are not re-taught in later mechanics.
- Composition levels use one contextual hint only: L58 Lemon+Honey, L154 Order+Tasting.
- Shared Tray and Tea Pair are taught on their first exposure only (L162 / L250); L242 and L330 repeat without a banner.

## Terminology table

| term | meaning | where it appears |
|---|---|---|
| Чашка | ordinary/target/serving/guest cup (generic vessel) | base help, teapot/guest/honey/frozen/cinnamon/targets/serving tutorials, HUD |
| Пиала | shallow tasting bowl / paired tea bowl | tasting + tea-pair tutorials and Help |
| Чайник | source-only teapot | L6 tutorial + Help |
| Термос | tall 5-layer temporary vessel | L74 tutorial + Help |
| Ситечко | movable catch-one strainer | L42 tutorial + Help |
| Поднос | shared two-cup six-layer tray | L162 tutorial + Help |
| Чайная пара | two relational cap-2 bowls with one emergent final tea | L250 tutorial + Help |
| Порядок подачи | ordered serving ① → ② | L106/L154 tutorials + Help |
| Слой | one tea layer | tasting/thermos/cinnamon tutorials, Help |
| Чай | tea / named tea type | all copy |

## Help consistency checks

- **Tea Pair**: tutorial says the final tea is decided “по ходу”; Help says “Цвет заранее не задан”. Neither implies a preselected target color.
- **Shared Tray**: both tutorial and Help state the group total is 6 and freeing one member frees space for the other; neither says each cup has six slots.
- **Tasting vs Pair**: both capacity-2, but Help/tutorial distinguish “должна быть пустой” (tasting) from “один и тот же чай” (pair).
- **Serving Order**: both tutorial/help say ① then ② and served cups cannot be poured out; Pair never uses numbers or a served lock.
- **Lemon/Honey**: both surfaces explain lemon moves with any outflow, honey only on final emptying.

## Evidence

- `scripts/dev/out/g18-tutorial-metrics.json` / `.md` — measured 360px fit.
- `docs/g18-screenshot-manifest.json` — tutorial screenshots at 360/390.
- `tests/g18-tutorial-audit.test.ts` — one-time exposure, copy length, terminology and Help-semantic guards.

