# G18 — Final Release Report

## 1. Source

- Starting SHA: `f2d28287aa0f67e096309800d2224fa5ee574e81` (G17 final, `origin/main`).
- Ending SHA: branch tip at PR (see PR head; final `origin/main` SHA reported after merge).
- Commits: 4 code/test/docs commits + final evidence update (see PR).
  - `95c38dc` fix: clarify mobile vessel, tutorial and header presentation
  - `2bb7164` test: add cooperative yields for long generator gates
  - `fb75715` test: add G18 rollout freeze and mobile release browser harness
  - `bddb4a2` docs: record G18 release audit and visual evidence
- PR: opened from `feat/g18-release-hardening` to `main` (URL recorded in the final handoff).
- Worktree: `D:\Programms\Max\Cozy-Tea-Sort-g18-release-hardening` (`feat/g18-release-hardening`).
- Original WIP fingerprint: 24 modified/untracked pixel-art files hashed before work; before/after comparison performed at completion (identical). No stash/reset/clean/checkout-over/merge/stage of the original dirty pixel-art files.

## 2. Baseline

- Rollout snapshot: semantic hash per level over phase, subtitle, colors/cups, mechanic plan/flags, Mystery, targets, ingredient flags and generator request shape; 66 pinned/sampled levels also compare canonical initial key, topology hash, minMoves, hidden counts, full initial fingerprint.
- Levels covered: **1–1600 generated and enumerated** (0 failures, 0 fallbacks); rollout freeze test covers all 1600 config hashes + 66 deterministic generated samples.
- Canonical seed policy: `g18-baseline:<level>:0` (secondary `:1` for pinned/sampled); screenshot/E2E `g18-e2e:<level>:0`.
- Screenshot manifest: `docs/g18-screenshot-manifest.json` (84 captures), full set regenerable with `bun run test:visual`.
- Baseline performance commands:
  - `bunx tsx scripts/dev/g18-performance-bench.ts --out scripts/dev/out/g18-perf-reference.json`
  - `bunx tsx scripts/dev/g18-performance-bench.ts --out scripts/dev/out/g18-perf-final.json`
  - Same machine, same 100 seeds/type, back-to-back on an idle machine.

## 3. Findings

Original audit: **1 BLOCKER, 2 HIGH, 7 MEDIUM, 3 LOW, 5 INFO**.
After fixes: **0 BLOCKER, 0 unresolved HIGH** (2 MEDIUM fixed; 5 MEDIUM documented/accepted).

| ID | severity | finding | fix | verification |
|---|---|---|---|---|
| B-01 | BLOCKER | Header controls clipped/offscreen at 360/390 | responsive phase badge + 44px controls | E2E geometry at 360/390/430/1280 |
| H-01 | HIGH | Shared Tray rendered two planks / 12 markers | one continuous tray / six markers | unit contract + partial occupancy E2E + before/after screenshots |
| H-02 | HIGH | legacy tutorials repeated 88–108×; L154 double banner | one-time tutorial registry; one banner | tutorial audit test + screenshots |
| M-01 | MEDIUM | 40px header targets | real 44×44 controls | hit probes pass |
| M-02 | MEDIUM | pair floral halves not mirrored | mirrored halves | visual review + pair set evidence |
| M-03 | MEDIUM | frozen ice cue subtle | documented; not changed | visual review; G19 candidate |
| M-04 | MEDIUM | Blend reshuffle can repeat canonical start | documented; pre-existing bounded bank | E2E bounded retry |
| M-05 | MEDIUM | Shared Tray/Tea Pair only 2 exposures; long frozen/cinnamon gaps | documented design debt | progression report |
| M-06 | MEDIUM | peak/Blend generation p95 heavier than 150ms | documented; no regression | performance report |
| M-07 | MEDIUM | persistence validator caps levels at 999 while audit covers 1600 | documented product boundary; not changed | storage/progression tests unchanged |
| L-01 | LOW | phase badge icon-only <380px | documented tradeoff | responsive review |
| L-02 | LOW | tea-bud cue subtle | documented | visual review |
| L-03 | LOW | new continuous tray is a new visual shape | follows existing wood/saucer language | visual matrix |

## 4. Visual QA

- Viewport matrix: **360×800, 390×844, 430×932, 1280×800**.
- Screenshot count: **84** (62 mechanic/viewport states including partial tray + 22 tutorial states; manifest exact count).
- Tasting vs Tea Pair: PASS (shallow gold footed must-empty bowl vs taller rose mirrored pair bowl).
- Serving Order vs Tea Pair: PASS (①/② + served lock vs no numbers/no lock/reopenable).
- Shared Tray grouping: PASS (ONE continuous tray, six markers; 4/6 partial state captured).
- Order+Tasting coexistence: PASS (numbered saucers + tasting bowl; one tutorial).
- Blend / Frozen / Cinnamon / Tea Bloom: initial persistent cues reviewed; transition plans structurally covered by existing G9/G11/G12/G13 view tests. No phantom/double layer regression found.
- Ingredients: Lemon/Honey initial cues and movement semantics structurally verified; view tests unchanged.
- Strainer: stand/attached/loaded/release states structurally verified; no duplicate flying layer found.
- Mobile overlap: PASS in E2E geometry (header/stage/footer/tutorial/buttons inside viewport; no horizontal overflow).
- Safe area: PASS structurally (`env(safe-area-inset-top/bottom)` padding verified ≥8/12px plus CSS env usage; physical notch not available).
- Hitboxes: cups ≥44 CSS px in tested matrix; header/footer/help close ≥44; cup hit padding included.

## 5. Tutorials

- Inventory: **17 first-exposure tutorials**, each one new concept; full table in `docs/g18-tutorial-audit.md`.
- Terminology issues: none blocking; established terms (чашка/пиала/чайник/термос/ситечко/поднос/чайная пара/порядок подачи/слой/чай) used consistently.
- Copy changes: none to existing strings; visibility changed to first exposure only; centralized registry.
- Help consistency: PASS (pair emergent, tray group budget, tasting empty vs pair same-tea, serving lock, lemon/honey timing).
- One-time exposure: PASS (L162 only; L250 only; L242/L330 repeat without banner; legacy repeats removed; L154 one banner).
- 360px fit: PASS (max 60.3px banner height; ≥599px canvas remaining).

## 6. Progression

- Range: 1–1600 enumerated; deep audit 1–330.
- Mechanic exposure table: `docs/g18-progression-audit.md`.
- First/second exposures: all G14–G17 pins preserved (106, 154, 162, 242, 250, 330).
- Max gaps: frozen 240, cinnamon 236, Shared Tray/Tea Pair 80 between their two exposures.
- Candidate spikes: L43 (+4 vs phase median, strainer), L111 (+3, honey), L190 (+3, teapot+strainer), L323 (+3, strainer) — all inside accepted bands; not release blockers.
- Relax quality: 0 special mechanics; all relax levels cheaper than preceding level.
- Warmup cleanliness: 0 violations.
- Challenge/peak integrity: 0 illegal compositions, 0 non-allowlisted peak leakage.
- Rollout changes: **NONE** except intentional UX-only tutorial visibility; 1600 semantic hashes equal baseline.

## 7. Performance

Generator/solver sources are untouched in G18; reference/final runs were same-machine, same-command, same-seeds, back-to-back on an idle machine. No G18 presentation change touches generation, solving or level initialization except Pixi draw calls.

| representative | gen p50/p95 (ms) | solver p50/p95 (ms) |
|---|---|---|
| warmup clean | 19.5 / 89.5 | 1.7 / 4.2 |
| challenge clean | 54.1 / 280.8 | 10.8 / 19.9 |
| peak mystery | 101.0 / 413.0 | 45.8 / 76.1 |
| teapot | 40.6 / 129.8 | 4.2 / 9.2 |
| targets | 19.6 / 28.7 | 19.0 / 27.9 |
| sink | 17.9 / 39.9 | 18.8 / 37.6 |
| tasting | 13.9 / 29.0 | 14.3 / 28.4 |
| lemon | 14.4 / 35.3 | 12.7 / 31.5 |
| strainer | 2.3 / 5.2 | 1.5 / 3.7 |
| honey | 21.1 / 32.7 | 21.0 / 32.0 |
| lemon+honey | 38.1 / 86.9 | 33.5 / 86.2 |
| frozen | 9.8 / 16.3 | 9.6 / 15.1 |
| thermos | 78.0 / 146.2 | 78.0 / 158.0 |
| cinnamon | 19.3 / 34.4 | 17.9 / 33.4 |
| tea bloom | 35.1 / 65.9 | 34.3 / 63.2 |
| Blend | 208.8 / 467.1 | 221.5 / 483.1 |
| serving order | 74.2 / 114.8 | 73.9 / 118.4 |
| order+tasting | 92.4 / 118.5 | 89.0 / 117.0 |
| Shared Tray | 78.7 / 168.0 | 76.9 / 176.1 |
| Tea Pair | 13.6 / 21.6 | 13.2 / 20.1 |

- Load-to-board: 240–528ms headless (L1/L98/L154/L162/L250).
- Load-to-interactive: 1.38–1.69s including Playwright input roundtrip.
- Longest observed initialization stall: 528ms load-to-board (L1); advanced levels 240–325ms.
- Bundle: main JS 872.79kB (baseline 873.30kB), total dist 1,175,883B (baseline 1,177,906B), gzip main 225.89kB. Pages build 872.81kB main / 1,175,995B total.
- Performance deltas >15%: none attributable to G18. 100-seed p95 deltas were within ±14.8% except challenge-clean gen p95 (+20.4%, two-outlier tail); a 300-seed re-measure was +1.3% p95. Generator/solver code is unchanged.

## 8. Test Infrastructure

- RPC reproduced on untouched baseline: **YES** — batch 2 failed 2/2 with exact `[vitest-worker]: Timeout calling "onTaskUpdate"` after all tests passed. A second path reproduced during the final gate: `serving-order-tasting-rollout` (1–1300 generation sweep) failed 2/2.
- Repetition: heavy generator/teapot batch **5/5 consecutive passes** after cooperative yields; the 1–1300 sweep passed separately before the final 3× gate.
- Failure frequency baseline: 2/2 in the observed heavy batch and 2/2 in the 1–1300 sweep; after yields 0 observed in the repeated gates.
- Runner changes: cooperative yields every 5 seeds in two heavy loops + every 20 levels in the 1–1300 sweep. No assertion/seed/coverage/pass criteria changes.
- Classifier guarantees preserved: tests still prove unassigned/duplicate/missing fail, real assertion no retry, unknown error no retry, exact known RPC only retryable.
- Discovery/assignment: 147 test files assigned exactly once after the three new G18 tests (144 → 147).
- Final 3× full canonical gate: **PASS** — 147/147 files, EXIT=0 each; durations 1322s, 1124s, 1183s. No unknown failures; no retry was needed in the final runs.

## 9. Architecture

- difficultyCurve decision: **UNCHANGED**.
- Reason: audit found no material rollout regression risk; pinned history and rotation remain valid; no second compatibility source.
- Rollout equivalence: 1600/1600 semantic hashes equal G17 baseline; 66 deterministic generated samples equal canonical key/topology/minMoves/fingerprint.
- Tutorial/presentation registry: `src/game/ui/tutorials.ts` (presentation only).
- Production request projection: `src/game/logic/productionRequest.ts` (pure extraction; App + audit scripts share it).
- No second gameplay truth: no chosenTea, no stored tray occupancy, no parallel pair state; pair accent/tray markers derive from live state; one ticker.

## 10. UX State

- Undo: advanced mechanics L98/L154/L162/L250 return exact pre-move state (E2E).
- Restart: same levels return exact initial state/constraints/moves=0 (E2E).
- Reshuffle: level unchanged, seed changed, mechanic class preserved; Blend has bounded same-start-collision retry (pre-existing).
- Rapid input: double destination tap produces exactly one move; state equals single-click reference; no stuck lock.
- Level advance cleanup: L154/L162/L250 victory → next level leaves no pair/tray/served/tasting/blend decoration/state; one canvas/ticker.
- Stale derived checks: pair status pure derivation asserted (committed→reopen→uncommitted→committed Y→matched Y).
- Listener/ticker smoke: 3 move/restart/reshuffle cycles keep one canvas and stable ticker/stage/cup counts.

## 11. Quality

- `bun install --frozen-lockfile`: **PASS** (checked 119 installs / 260 packages, no changes).
- `bun run typecheck`: **PASS** (including e2e + playwright config).
- `bun run test`: **PASS 3/3 consecutive full gates** — 147/147 files, EXIT=0, 1322s / 1124s / 1183s; no RPC retries in those runs.
- E2E gate: **PASS 3/3 consecutive full mobile runs** — 32/32 tests each, 6.7–6.8m; bounded CI subset 7/7 in 1.3m.
- `bun run build`: **PASS**; `GITHUB_PAGES=true bun run build`: **PASS**.
- Console errors: dev E2E gate clean (external fonts/Telegram stubbed; no app errors); production preview clean (0 console errors, 0 page errors, 0 local asset failures, canvas present, QA bridge absent).
- Asset failures: local asset gate clean in E2E.
- Build warning: only the pre-existing >500kB chunk warning; no new serious warning.
- Bundle: main 872.79kB (baseline 873.30kB), gzip 225.89kB; total dist 1,175,883B (baseline 1,177,906B). Pages build main 872.81kB / total 1,175,995B. JS growth -0.2%, well under 5%.
- Quality CI: updated with bounded critical browser gate; final CI run pending PR.
- Pages CI: pending PR merge.
- Final SHA: **PENDING** (reported after merge).

## 12. Evidence level

- **PROVEN BY AUTOMATION**: rollout hashes/samples, 1600 enumeration, tutorials, visual contracts, UI freshness, rapid input, build/typecheck, test-runner guards.
- **VISUALLY REVIEWED**: mobile header, Shared Tray one-tray grouping, partial markers, Tea Pair set, Order+Tasting coexistence, tutorial fit, all mechanic captures.
- **STRUCTURAL ONLY**: safe-area CSS, decoration event modes, reduced-motion policy absence, transition plans where no screenshot of every frame was captured.
- **NOT PHYSICAL-DEVICE VERIFIED**: frame pacing, tap latency, GPU rendering on iPhone/Android, Telegram WebView safe-area in a real client. No physical device was available.
- Automated tests cannot prove subjective enjoyment or real-player difficulty; no such claim is made.
