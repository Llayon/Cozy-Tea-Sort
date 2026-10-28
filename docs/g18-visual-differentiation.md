# G18 — Visual Differentiation Matrix

Source: `origin/main` @ `f2d28287aa0f67e096309800d2224fa5ee574e81` (G17 final), after G18 presentation hardening.

Scope: special vessel / goal cues that must remain distinguishable at 360–430 CSS px. Tea layers are always the primary visual state; decorations use `eventMode='none'` or non-interactive DOM.

| mechanic | physical silhouette | base / saucer / tray cue | capacity cue | symbol / text cue | color dependency | animation cue | player-facing semantic |
|---|---|---|---|---|---|---|---|
| **Tasting** | shallow wide bowl, bottom-aligned; visibly shorter than a cup (body 66 vs 142) | gold rim + foot saucer | two readable interior slots; Help/tutorial “2 слоя” | no number; gold rim is the persistent vessel identity | none (gold is structural) | pour in/out; full bowl is still incomplete | temporary workspace, **must end empty** |
| **Tea Pair** | two small matching porcelain bowls, taller than tasting (body 84), rose trim + side ears | shared foot-ring language; no saucer/tray | authoritative capacity 2 per bowl, exactly two readable slots | **mirrored floral halves** on both bowls; no numbers/locks | accent petals use committed TeaId **but** the floral shape is persistent | synchronized short steam flourish only on matched completion | two relational members, **same emergent full tea**, reopenable |
| **Serving Order** | ordinary cup body | porcelain saucer under base | standard 4 individual slots | **① / ② medallion**, served rim treatment | order number is text/shape, not color | serve flourish on completion; served cup locked as source | ordered completion ①→②; served cups cannot pour |
| **Shared Tray** | two ordinary cups on **ONE continuous wooden tray** spanning both positions | continuous tray body + top rail + dark lip (one object, not two planks) | **exactly six group markers on the one tray**; filled count = combined occupancy | six dots (filled = solid, free = hollow ring); no per-cup marker sets | markers shape-coded; wood tone structural | markers update with derived occupancy; no lock animation | one shared six-layer budget across the two cups |
| **Thermos** | tall narrow body, clearly taller than standard cups (160 vs 142) | gold rim + base accent + cap knob | 5 readable slots (taller slot rhythm) | cap knob + gold rim; no target medallion | gold structural | melt/drain ordinary pours; must end empty | temporary 5-layer storage, **must end empty** |
| **Sink / guest cup** | low ceremonial cup with small handle | wide saucer beneath | standard 4 slots | gold rim/detail, no padlock/icon | gold structural | soft gold glow only when full homogeneous | receives tea, **never pours back out** |
| **Target cup** | ordinary cup body | none (no saucer) | standard 4 individual slots | **gold medallion with target-tea dot** at base | dot uses target tea color; gold ring + dot shape carry meaning too | correct/wrong-full medallion state | must end full homogeneous of its named tea; usable meanwhile |
| **Frozen** | ordinary cup body, ice overlay inside | ordinary base | ordinary 4 slots | pale blue ice slab + cracks + frost rim | pale blue is reinforced by slab/crack **shape**, not color alone | slab cracks/fades on hot pour; static clears (one visual only) | source unavailable until melted by hot tea; then ordinary |
| **Cinnamon** | ordinary cup body + protruding stick | ordinary base | **2 effective layers while stick present**; base-4 slot geometry unchanged | rolled-bark stick + warm obstruction band + ≤2 blocked-slot cues | warm brown structural; blocked slots also have line cues | stick lifts/tilts on removal; static clears to ordinary | capacity restricted until the cup fully empties |
| **Tea Bloom** | ordinary cup body, bud at bottom | ordinary base | consumes no capacity | tied tea-bud silhouette at bottom | green/brown bud shape, not color alone | bud opens at final outflow; static bud clears | dormant bud blooms when its cup empties; cup stays ordinary |
| **Teapot** | wider belly + spout + lid/knob + handle | no saucer | standard 4 slots; starts full/mixed | spout + lid silhouette | skin material language only | pour stream from spout; empty once emptied | source-only: gives tea, never receives |
| **Lemon** | floating slice on surface | none | no capacity effect | lemon slice silhouette | yellow reinforced by slice shape | travels with any successful outflow | moves with any outflow; final host is full sea-buckthorn |
| **Honey** | bottom blob | none | no capacity effect | amber blob + drop transit | amber structural | moves only on final emptying; arc + sink | stays at bottom until vessel empties; final host is full buckwheat |
| **Strainer** | bottom-center brass stand + mini mesh | ceramic/wood rest | catches exactly one layer | mesh basket + handle; no text | brass structural | place/release flights; catch during pour | movable tool; catches one layer, must be returned |
| **Blend** | no special vessel (chemistry) | none | destination stays capacity 4 | black tea + milk palette; reaction crossfade | reactant/product TeaIds | exactly one source layer travels; one product layer, no phantom fifth | contact reaction black tea + milk → milk tea; reversible |

## Differentiation gate checks

- **Tasting vs Tea Pair** — PASS after G18: tasting is a shallow gold-rim bowl on a foot saucer and must end empty; pair is a taller rose-trimmed bowl with mirrored floral halves and a relational same-tea goal. They share capacity 2 but not silhouette, base language, symbol or end semantics.
- **Serving Order vs Tea Pair** — PASS: order uses numbered saucers ①/② and a served lock; pair uses no numbers, no lock, and remains reopenable. The mirrored floral motif cannot be read as an order.
- **Shared Tray vs two ordinary cups** — PASS after G18: the two member cups now sit on one continuous tray with exactly six markers (previously two separate planks with 12 markers). Group membership and group occupancy are unambiguous.
- **Target Cup vs Tea Pair accent** — PASS: target uses a gold medallion with a target-tea dot; pair uses rose porcelain + floral half petals. Different shape, palette and position; pair never renders a target medallion (validation forbids it).
- **Order + Tasting coexistence (L154)** — PASS: numbered saucers remain visible on the serving cups while the gold-rim tasting bowl sits in the second row. No same-cup composition; one contextual tutorial only.
- **Color-only semantics** — PASS: pair (floral shape), tray (six marker shapes), order (①/② text), targets (medallion + dot shape) all carry a non-color cue. Tea identity remains color-first as the core game language.
- **Decoration input** — PASS by code audit: tray/saucer/floral/steam/ingredient/badges are `eventMode='none'` or non-interactive DOM; cup hit areas remain authoritative.

## Visual acceptance evidence

- `docs/g18-evidence/360x800-shared-tray-L162.png`
- `docs/g18-evidence/390x844-shared-tray-partial.png` (4/6 markers after a real move)
- `docs/g18-evidence/390x844-tea-pair-L250.png`
- `docs/g18-evidence/390x844-order-tasting-L154.png`
- Full 84-capture matrix: `scripts/dev/out/g18-screens/` + `docs/g18-screenshot-manifest.json` (regenerate with `bun run test:visual`).
- Structural guards: `tests/g18-visual-contract.test.ts`; UI freshness/journey: `e2e/release-journey.spec.ts`.

## Not visually claimed

- Subjective “fun” or perceived difficulty is not inferred from these cues.
- Physical-device GPU/antialias appearance is **not verified** in this environment; captures are headless Chromium/SwiftShader evidence.
