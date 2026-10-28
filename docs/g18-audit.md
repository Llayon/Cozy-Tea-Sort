# G18 — Release / UX Hardening Audit

Source of truth: `origin/main` @ `f2d28287aa0f67e096309800d2224fa5ee574e81` (G17 final, merge of `feat/g17-tea-pair`).
Worktree: `D:\Programms\Max\Cozy-Tea-Sort-g18-release-hardening` (`feat/g18-release-hardening`).
Scope: release/UX hardening only. No new mechanic, TeaId, goal, capacity rule, transformation or solver/generator change.

## Evidence level legend

- **PROVEN BY AUTOMATION** — regression/gate assertion ran and passed.
- **VISUALLY REVIEWED** — human/model review of real 360/390/430/1280 captures.
- **STRUCTURAL ONLY** — code/DOM contract verified without physical device.
- **NOT PHYSICAL-DEVICE VERIFIED** — no iPhone/Android hardware was available in this environment.

## Method

1. Captured the original dirty WIP fingerprint before creating the isolated worktree (no stash/reset/checkout/merge of WIP).
2. Enumerated all 1600 levels through real `getLevelConfig` + `generateLevel` with deterministic seeds (`g18-baseline:<level>:0`; second seed for pinned/sampled levels). Artifact: `scripts/dev/out/g18-rollout-baseline.json`.
3. Captured pre-fix mobile/desktop screenshots at 360×800, 390×844, 430×932, 1280×800 for the full mechanic matrix and every first-exposure tutorial.
4. Benchmarked generation/solver: 100 deterministic seeds × 20 representative level types (`scripts/dev/out/g18-perf-baseline.json`).
5. Ran the canonical unit gate; the known vitest worker RPC failure reproduced (see Test Infrastructure).
6. Built the tutorial inventory, progression/exposure report, visual differentiation matrix and screenshot manifest.
7. Fixed only BLOCKER/HIGH and small safe MEDIUM presentation defects; then re-ran rollout equivalence, mobile geometry, UI freshness, journey and performance evidence.

## Baseline artifacts

| artifact | purpose |
|---|---|
| `scripts/dev/out/g18-rollout-baseline.json` | full 1–1600 config, mechanic plan, actual topology hash, canonical key, minMoves, generation counters, seed |
| `tests/fixtures/g18-rollout-snapshot.json` | compact frozen 1–1600 semantic hashes + pinned/sample generation expectations + tutorial matrix |
| `scripts/dev/out/g18-progression-summary.json` | phase stats, exposure gaps, candidate spikes, contract checks |
| `scripts/dev/out/g18-progression-1-330.csv` | per-level 1–330 minMoves/phase/mechanics/rolling median |
| `scripts/dev/out/g18-perf-reference.json`, `g18-perf-final.json` | same-machine generation/solver benchmark (100 seeds × 20 types; 300-seed challenge re-measure) |
| `scripts/dev/out/g18-load-perf.json` | E2E load-to-board / load-to-interactive instrumentation |
| `docs/g18-screenshot-manifest.json` | machine-readable 84-capture screenshot manifest |
| `docs/g18-tutorial-audit.md` | tutorial/help inventory + 360px fit |
| `docs/g18-progression-audit.md` | progression/difficulty rhythm report |
| `docs/g18-visual-differentiation.md` | mechanic cue differentiation matrix |

### Rollout snapshot method

Every level 1–1600 contributes a stable hash of: phase, phase name/subtitle, color count, total vessels, palette order, mechanic flags, mechanic plan, Mystery, target TeaIDs, ingredient flags and the exact generator request shape. Tutorial eligibility is **deliberately excluded** from the freeze hash because G18 intentionally changes it from repeated hints to one-time first exposure (UX-only metadata). `tests/g18-rollout-freeze.test.ts` recomputes all 1600 hashes and reports exact differing level numbers; it also regenerates 66 pinned/sampled deterministic seeds and compares canonical initial key, topology hash, minMoves, lengths, hidden counts and full initial fingerprint.

## Screenshot inventory

- **84 captures** in `scripts/dev/out/g18-screens/` (regenerate with `bun run test:visual`).
- Viewports: 360×800, 390×844, 430×932, 1280×800.
- Mechanics: base, Mystery, Teapot, Targets, Sink, Tasting, Lemon, Strainer, Honey, Lemon+Honey, Frozen, Thermos, Cinnamon, Tea Bloom, Blend, Serving Order, Order+Tasting, Shared Tray, Tea Pair.
- First-exposure tutorials: L6, L10, L18, L26, L34, L42, L50, L58, L66, L74, L82, L90, L98, L106, L154, L162, L250 (all at 390; key long-copy states also at 360).
- Curated review set: `docs/g18-evidence/` (before/after Shared Tray, partial occupancy, Tea Pair, Order+Tasting, tutorial fit).
- Pre-fix audit-only captures were 48 images at the same matrix; the four most relevant before/after states are preserved.

## Findings and classification

| severity | found | fixed | documented/accepted |
|---|---:|---:|---:|
| BLOCKER | 1 | 1 | 0 |
| HIGH | 2 | 2 | 0 |
| MEDIUM | 7 | 2 | 5 |
| LOW | 3 | 0 | 3 |
| INFO | 5 | — | 5 |

### BLOCKER

| ID | finding | evidence | fix | verification |
|---|---|---|---|---|
| B-01 | **Header controls clipped/offscreen at 360 and 390.** “Info” was fully/partially outside the viewport; at 360 “Sound” was also clipped. | Pre-fix 390/360 captures; rects: Info right edge 419.5 at 390 and 360, Sound right edge 375.5 at 360. | Responsive phase badge (icon at <380, short label 380–479, full label ≥480) + real 44×44 header controls. | `e2e/release-journey.spec.ts` geometry gate at 360/390/430/1280; after rects all ≤ viewport, 44×44 practical targets. |

### HIGH

| ID | finding | evidence | fix | verification |
|---|---|---|---|---|
| H-01 | **Shared Tray read as two separate planks.** Each member cup drew its own plank and its own six markers (12 markers total), contradicting “one shared six-layer resource”. | Pre-fix L162 captures at 360/390; per-cup `renderTrayMotif` drew plank + 6 markers twice. | One view-level continuous tray spanning both member positions; exactly six markers on it; filled count derives from combined live occupancy. Per-cup tray layer cleared. | `tests/g18-visual-contract.test.ts`; L162 partial-occupancy E2E (`4/6` filled after a real move); before/after evidence images. |
| H-02 | **Legacy tutorial repetition + L154 double banner.** Teapot/targets/sink/tasting/lemon/strainer/honey banners appeared on every later level with the mechanic (88–108 times each through L1600). L154 rendered both the tasting tutorial and the order composition hint. | Baseline tutorial counts: teapot 108, targets 90, sink 88, tasting 107, lemon 92, strainer 89, honey 92. L154 DOM had two `*-tutorial-hint` nodes. | Centralized tutorial registry; every banner is first-exposure only. L154 renders exactly the one Order+Tasting composition hint. Existing copy preserved. | `tests/g18-tutorial-audit.test.ts` (one-time exposure, no repeat at L7/11/19/…/242/330, one banner max); `docs/g18-tutorial-audit.md`; tutorial screenshots. |

### MEDIUM

| ID | finding | status / evidence |
|---|---|---|
| M-01 | Header icon buttons were 40px visual targets (preferred is ≥44 CSS px). | **Fixed**: real 44×44 controls; E2E probes 21px from center still hit the same button. |
| M-02 | Tea Pair floral halves were not mirrored (both petal sets leaned the same direction), weakening the “one shared set” read. | **Fixed**: left bowl petals now grow toward the right, right bowl toward the left; pair remains distinct from tasting. Evidence `docs/g18-evidence/after-390x844-tea-pair-L250.png`. |
| M-03 | Frozen-cup ice cue is subtle on a busy board (small pale slab + cracks); the frozen state is clear from the blocked source + tutorial but could be stronger at 360. | **Documented, not changed in G18** (art-direction polish; shape cue exists and is not color-only). Candidate G19 polish. |
| M-04 | Blend reshuffle can occasionally produce the same canonical start despite a new seed (bounded blend template bank). This is pre-existing generator behavior; template-bank re-curation is out of G18 scope. | **Documented**; E2E uses one bounded retry for the user-facing “new layout” assertion. Not a gameplay freeze violation. |
| M-05 | Shared Tray and Tea Pair appear only twice in 1–1600 (L162/242 and L250/330). Frozen/cinnamon have max gaps 240/236 levels. | **Progression design debt**, documented in `docs/g18-progression-audit.md`; rollout intentionally NOT redesigned in G18. |
| M-06 | Idle same-machine p95: base peak generation 413ms, Blend generation 467ms, Shared Tray 168ms. Modern non-Blend mechanics otherwise ≤150ms p95 (targets 29, sink 40, tasting 29, lemon 35, honey 33, cinnamon 34, tea-bloom 66, serving 115, order+tasting 119, tea pair 22). | **Documented**; no G18 regression and no Worker/renderer redesign. Blend is the known heavy exception; 100-seed p95 tails vary, so challenge-clean was re-measured at 300 seeds (+1.3% p95). |
| M-07 | Progression storage validator caps levels at 999 (`sanitizeLevel`), while G18 enumerates/generates levels 1–1600 structurally. This appears to be the existing product boundary (highest unlocked 1000); beyond it, reload clamps progression. | **Documented, not changed**: changing the persistence boundary is product progression scope, not G18 UX hardening. Levels 1000–1600 remain structurally generated/validated for rollout audit; no pinned level is affected. |

### LOW

- **L-01** At <380px the phase badge collapses to its icon (aria-label/title retained) to guarantee all controls fit. Tradeoff accepted; phase name remains available in the victory/modal/help contexts and via the accessible label.
- **L-02** Tea-bud bottom silhouette is small under four tea layers; it is shape-coded and taught once, but could receive a slightly stronger outline in a later art pass.
- **L-03** The exact rounded-rect visual style of the continuous tray is new but intentionally follows the existing wood/saucer language; no new panel/label was added.

### INFO

- Candidate difficulty spikes (phase-local, same-phase rolling median): L43 (18 vs 14, strainer), L111 (17 vs 14, honey), L190 (13 vs 10, teapot+strainer), L323 (17 vs 14, strainer). All are inside the accepted bands (peak ≤18, challenge ≤13); no illegal composition, no unexplained rollout change. They are complexity signals, not “player definitely finds this hard” claims.
- Relax contract: every relax level is cheaper than the immediately preceding level (0 violations); relax levels contain 0 special mechanics.
- Warmup contract: 0 special-mechanic violations across 1–330.
- Challenge/peak contract: 0 illegal challenge compositions, 0 non-allowlisted peak mechanic leakage.
- Full 1–1600 baseline generation: 1600/1600 generated, 0 fallback, 0 failure.

## Visual differentiation gate

Full matrix: `docs/g18-visual-differentiation.md`.

- **Tasting vs Tea Pair** — PASS: shallow gold-rim footed bowl / must end empty vs taller rose-porcelain bowl / mirrored floral halves / same emergent full tea. Not distinguishable by subtitle alone; persistent silhouettes differ.
- **Serving Order vs Tea Pair** — PASS: numbered ①/② saucers and served lock vs no numbers, no lock, reopenable pair.
- **Shared Tray vs two ordinary cups** — PASS after H-01: one continuous tray, exactly six markers, combined occupancy; partial state visible.
- **Target Cup vs Pair accent** — PASS: gold medallion + target-tea dot vs rose floral halves; pair cannot carry a target by validation.
- **Order + Tasting (L154)** — PASS: numbered saucers and shallow gold bowl coexist; one composition tutorial; no same-cup composition.
- **Special density** — PASS in reviewed captures: tea layers remain the dominant visual signal; decorations use low alpha and stay below/above without covering tea.

## Tutorial findings

- 17 first exposures, 17 unique concepts, max 60.3px banner height and ≥599px remaining canvas at 360×800.
- No tutorial copy was semantically changed; only repetition/double-banner behavior was fixed and copy centralized.
- Help and tutorial agree on Tea Pair (emergent, not preselected), Shared Tray (6 group slots), Tasting vs Pair end semantics, Serving Order lock and Lemon/Honey timing.
- Full inventory/fit table: `docs/g18-tutorial-audit.md`.

## Progression findings

- 1–330 phase medians: warmup 6, challenge 11, peak 14, relax 6 solver moves; max peak 18, all inside acceptance bands.
- All G14–G17 pinned exposures preserved: L106, L154, L162, L242, L250, L330.
- Shared Tray / Tea Pair disappear after their two pinned exposures → documented design debt, not fixed (G18 does not redesign rollout).
- Existing long gaps for frozen/cinnamon → documented.
- Full report: `docs/g18-progression-audit.md`.

## Performance findings

Same machine, same command, same seeds, 100 seeds/type, reference/final runs back-to-back on an idle machine. G18 changed no generator/solver source:

- Load-to-board (headless Chromium, 390×844, DPR1): 240–528ms across L1/L98/L154/L162/L250.
- Load-to-interactive (first accepted source tap including Playwright roundtrip): 1.38–1.69s. **Comparative CI signal only; not physical-device truth.**
- Generation p95 (final): warmup 90, challenge 281, peak 413, teapot 130, targets 29, sink 40, tasting 29, lemon 35, strainer 5, honey 33, lemon+honey 87, frozen 16, thermos 146, cinnamon 34, tea-bloom 66, Blend 467, serving 115, order+tasting 119, Shared Tray 168, Tea Pair 22 (ms).
- Solver p95 (final): modern non-Blend ≤176ms (Shared Tray 176, thermos 158, serving 118, order+tasting 117); Blend 483ms known heavy.
- 100-seed p95 deltas reference→final: all representatives within ±14.8% except challenge-clean generation (+20.4% p95 tail). A 300-seed re-measure of that same path was +1.3% p95 (262.6→266.0ms) with p50 57.6→59.4ms; the 100-seed p95 is a two-outlier tail effect, not a G18 path change.
- 0 generation failures / 0 fallbacks in the 20-type 100-seed matrix and the 300-seed challenge re-measure.

## Test infrastructure findings

- Canonical runner baseline: 144 files discovered/assigned, 0 duplicates/unassigned.
- The known vitest worker RPC failure **reproduced on the untouched G17 baseline**: batch 2 (`generator.test.ts` + `teapot-stress.test.ts`) failed twice with `[vitest-worker]: Timeout calling "onTaskUpdate"`; all tests had passed (`Test Files 2 passed`, `Tests 8 passed`) and exit was nonzero. The runner correctly classified it as the exact known RPC flake, retried once, and stopped when the retry also hit it.
- Fix scope: cooperative `setTimeout(0)` yields every 5 seeds in the two >60s synchronous generator/teapot loops, plus every 20 levels in the remaining 1–1300 generation rollout sweep (`serving-order-tasting-rollout`) found during the final gate. No assertion, seed count, ordering, coverage or pass criteria changed. The exact/fail-closed classifier and discovery/assignment guards are untouched.
- Post-fix heavy-batch repetition: **5/5 consecutive passes** (generator + teapot stress, ~80s each), 0 RPC errors, 0 test failures. The 1–1300 rollout sweep was re-run separately before the final three full gates.
- Heavy-batch repeats and final canonical gate repeats: see final report. `tests/test-runner.test.ts` continues to prove unassigned/duplicate/missing failure, real assertion no retry, unknown error no retry, and exact known RPC only.

## Architecture findings

- `difficultyCurve.ts`: **unchanged**. Audit found no material regression risk requiring a rollout refactor; its pinned tables/rotation remain valid debt. No second compatibility source.
- `src/game/logic/productionRequest.ts`: pure extraction of the level-config → generator-request projection; App and audit scripts now share it. No rules/generation policy added.
- `src/game/ui/tutorials.ts`: presentation-only tutorial registry; no gameplay truth. Help remains the persistent rule reference.
- Shared Tray drawing: view-level, derived from cup geometry + combined live lengths. Pair ornament: derived every refresh from `pairedTeaStatus`; no chosen-tea state, no stored occupancy, no second ticker.
- One Pixi Application/ticker/ResizeObserver preserved; no mechanic-specific ticker added. UI completion remains one `onMoveComplete` per pour.

## Fix budget actually used

- Mobile header layout, first-exposure tutorial visibility/centralization, one continuous Shared Tray, mirrored pair motif, 44px header/shortcut targets, DEV-only QA/screenshot harness, rollout/tutorial/visual regression tests, cooperative-yield test infrastructure, DEV audit scripts/docs.
- Not used for: gameplay rebalance, template-bank curation, minMoves changes, solver pruning, mechanic density, art-direction rewrite, broad animation redesign, G19.

## Ship decision (after fixes)

- BLOCKER: **0**
- HIGH: **0**
- MEDIUM: documented above (M-03…M-06 accepted/documented; M-01/M-02 fixed)
- LOW: documented above
- Gameplay freeze: verified by 1600-level semantic hash equality + 66 deterministic generated samples.
- Rollout: unchanged (except intentional UX-only tutorial visibility).
- Visual matrix: critical mobile states reviewed; structural gates pass.
- Performance: no unexplained >15% regression (final report).
- Test/browser/build/Pages/CI: see final report.

## Limitations

- No physical iPhone/Android device was available: **NOT PHYSICAL-DEVICE VERIFIED**. Headless Chromium/SwiftShader captures prove layout/structure/readability evidence, not device GPU smoothness.
- Automated tests cannot prove subjective enjoyment, “fun”, or real-player difficulty. Difficulty language in this audit is solver-complexity evidence only.
- Motion/reduced-motion: the app has no dedicated reduced-motion policy; G18 did not introduce a broad animation-system redesign. This is documented, not silently claimed as fixed.
