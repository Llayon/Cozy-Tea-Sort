# G25 — Mechanic Candidate Shootout (research only)

Status: RESEARCH ONLY. No production merge, no template bank, no generator fast path,
no rollout, no tutorial, no Help, no Pixi/UI, no animation, no telemetry,
no composition, no Mystery/Blend change, no TeaId count change,
no `TEA_UNITS_PER_COLOR` change, no win-economy change.

## Source
- `origin/main` SHA: `f8781059343d7a851749e84e39b7a7e6f4fc5846`
  (Merge PR #8 `feat/g24-contract-preflight`, Thu Nov 5 2026)
- active branch: `spike/g25-mechanic-shootout` (from `origin/main`)
- worktree: `D:/Programms/Max/Cozy-Tea-Sort-g25-mechanic-shootout`
- original WIP (in `D:/Programms/Max/Cozy-Tea-Sort`, untouched):
  diff hash `598dc4daa5b63bac969a8ceae0e9a6597cee161d`,
  status `M scripts/run-tests.mjs, M src/App.tsx, M src/components/RecipeBookModal.tsx,`
  `M src/game/view/TeaSortView.ts, M src/index.css` + 4 untracked pixel-art files.

## G24 prerequisite (hard gate §3 — PASS)
- Authoritative API: `analyzeTerminalAllocation(problem)` in
  `src/game/logic/contractPreflight.ts:368-370`.
- Distinguishes `AlgebraicallyFeasible` / `AlgebraicUnsat` / `Unsupported`;
  never treats algebraic feasibility as solver solvability
  (header `:9-11`, doc `docs/contract-conservation-preflight.md §1`).
- G24 suite green before G25 work: 45/45
  (`tests/contract-preflight.test.ts` 25 + `tests/contract-preflight-existing-mechanics.test.ts` 20).
- G24 kept green throughout (see Quality).

## Production constants (audited from source, §6)
- `TEA_UNITS_PER_COLOR = 4` (`src/game/types.ts:619`)
- `STANDARD_CUP_CAPACITY = 4` (`:622`), `MAX_CUP_CAPACITY` alias (`:629`)
- `TASTING_BOWL_CAPACITY = 2` (`:632`), `THERMOS_CAPACITY = 5` (`:635`)
- `SHARED_CAPACITY_LIMITS = { 'tea-tray': 6 }` (`:654-656`)
- `TEA_PAIR_GROUP = 'tea-pair'` (`src/game/logic/teaPair.ts:28`),
  `TEA_PAIR_MEMBER_CAPACITY = 2` (`:31`)
- No remembered values; scripts import these directly.

## Stage A — five mathematical contracts (§§6-13)
Script: `scripts/dev/g25-contract-screen.ts` (imports constants above).
Tests: `tests/g25-contract-candidates.test.ts` (pins all five verdicts).

| Candidate | Preflight verdict | Terminal witness | New axis? | Stage B? |
|---|---|---|---|---|
| Mirror Pair (A) | `AlgebraicallyFeasible` (states=5) | group `A4B4` + ordinary `C4` + `D4` + 2×fixed `{}` | yes — paired non-homogeneous finality `AABA/BBAA` consumes complete TeaIds | YES |
| Striped Pair (B) | `AlgebraicallyFeasible` (states=5) | same amounts, striped order | diagnostic/control only — stronger one-layer dependence, artificial state inflation | NO (deferred, §15/§87) |
| Metered Pourer (C) | `AlgebraicallyFeasible` (states=11) | special fixed `{}` + 5×ordinary (16 units as 4×4) | to be proven by causality; source-only 1-cap | YES |
| Measuring Bowl (D) | `AlgebraicallyFeasible` (states=11) | same terminal as C; only gameplay orientation differs | to be proven; higher power/domination risk | YES |
| Split Service (E) | `AlgebraicallyFeasible` (states=8) | group `A4` (2×cap-2) + 3×ordinary `B4/C4/D4` | NO — `REDUNDANT / NO NEW AXIS`: expressible as Targets (fixed `A4`) + Tea Pair (2×cap-2 same-tea) semantics; no new decision axis | NO (§16/§88) |

No `AlgebraicUnsat` — §13 hard stop not triggered; no topology/inventory/TeaId/vessel/finality rescue.

## Research kernels (§§20-24, 35-38, 49-52, 89-99)
- `src/game/logic/g25Research.ts` (new, dev-only helpers; no state, no UI).
- `CupConstraint` markers (research only, optional):
  `g25MeteredSource`, `g25MeteredDestination`, `g25MirrorGroup`, `g25MirrorRecipe`.
- `rules.ts` minimal branches (46 lines): mirror exact-finality + destination
  override (permits recipe-boundary color change `AA→B`), 1-caps via
  `g25BoundTransfer` in `unstrainedPourCountState` + `pourCountState`.
  Absent markers: legacy identical (regression + canonical freeze verified).
- `types.ts`: clone + `cupConstraintSignature` suffixes (`:G25S/:G25D/:MIR:…`);
  absent markers leave legacy keys byte-identical.
- ONE solver (`solvePuzzle` defaults 200k/60), ONE pour truth (`applyPourState`),
  no new TeaId/action, no mutable progress, no second search heuristic.

Unit tests (19/19): mirror 7, metered 4, measuring 3, contracts 5.

## Stage B — common policy (§§17-19, 60, 66-73)
- Pilot `N=1000` each, same deterministic seed family `g25-pilot-i`,
  `dealPilotBoard` (4,4,4,4,0,0 via `mulberry32`, positional shuffle).
- C/D: one special empty (cap4 `mustEndEmpty` + 1-cap) + one ordinary empty.
- A: two special empty mirrors (no ordinary empty), recipes
  `[matcha,matcha,sea_buckthorn,sea_buckthorn]` /
  `[sea_buckthorn,sea_buckthorn,matcha,matcha]`.
- FULL + CONTROL per board; replay of optimal solutions (no trace inference);
  first-action difference treated as weak evidence; control-replay impossibility
  ranked strongest.

## Candidate A — Mirror Pair (§§20-34, 63-65)
Pilot `scripts/dev/g25-mirror-pair.ts`, JSON `scripts/dev/out/g25-mirror-pair-N1000.json`.

- N=1000, solvable 791 (79.1%) — **FAIL** hard gate ≥95%.
- truncation 0 — PASS. Solver p50 13ms / p95 41ms / max 65ms — PASS (preferred <150).
- visited p50 230 / p95 632 / max 939 — tiny (mirrors constrain search).
- canonical unique 1000/1000.
- ORDER_ACTIVE 791/1000 (79.1%; 791/791 solved) — PASS ≥10% but trivially
  coupled to solvability (root already differs: empty mirror accepts only
  expected tea vs ordinary empty accepts any). Canonical-active 791.
- RECIPE_BUILD 791/791 solved (mandatory finality holds).
- Control divergence 791/791 solved (100%), firstDiff 612/791 — strongest
  evidence: optimal control replay illegal/divergent under FULL on every solved board.
- Interleaving gaps: 0:2037, 1:1541, 2:598, 3+:359 — substantial ordinary work
  between recipe deposits (not mechanical feeding).
- Dual: alternating 710 vs sequential 81 — 90% alternate cups (strong pattern).
- DepthDelta (CTRL−FULL) p50 −1 — FULL 1 move deeper (novelty without shortcut).
- StateMult FULL/CTRL: p50 0.54 / p90 1.04 / p95 1.19 — PASS (<2.0 preferred).
- Fairness probe N=50 (`g25-mirror-fairness.ts`): constructive med 2,
  solvable-first med 2, optimal-first med 2, fatal med 0 / p90 1,
  **doom 9/50 (18%)** — FAIL preferred 0/50. Narrow openings (no ordinary empty)
  + unsolvability drive doom.
- No domination (depth increases), no truncation, no perf issue.
- Verdict driver: solvability 79.1% + doom 18% under exact §64 topology.
  §65 diagnostic (one ordinary empty + seeded mirror) not pursued: it would be
  a topology rescue for a failing candidate and would not fix the
  no-ordinary-empty fairness trap that defines the proposal.

## Candidate C — Metered Pourer (§§35-48)
Pilot `scripts/dev/g25-metered-pourer.ts`, JSON `scripts/dev/out/g25-metered-pourer-N1000.json`.

- N=1000, solvable 1000 (100%) — PASS. truncation 0 — PASS.
- Solver p50 112ms / p95 210ms / max 372ms — PASS ≤250 (but above 150 preferred).
- Depth p50 12 / p95 14 / max 16. Visited p50 1599 / p95 2801.
- Canonical unique 1000/1000.
- METERED_CAUSAL 33/1000 (3.3%), canonical-causal 33 — **FAIL** (need ≥20%;
  <5% = reject as decorative per §42).
- Control divergence 635/1000 (63.5%), firstDiff 330 — asymmetry: CONTROL optimal
  uses the tool as maximal buffer, FULL optimal avoids it (restriction, not power).
- Metered share (metered actions/total): p50 7.1% / p90 10.0% / p95 11.1% —
  no domination, but ignored 419/1000 (41.9% of solved use 0 metered moves).
- DepthDelta p50 0 — no depth change (neither shortcut nor depth).
- Ordinary-vs-metered: median board uses ordinary moves ~93% — tool optional.
- StateMult p50 1.14 / p90 1.21 / p95 1.23 — PASS.
- Interpretation: with one ordinary empty always available, the 1-cap is a
  handicap; optimal play routes around the tool. Precision never required on
  random deals. No confirmatory (causal <10%, canonical-causal 33 <100).

## Candidate D — Measuring Bowl (§§49-59)
Pilot `scripts/dev/g25-measuring-bowl.ts`, JSON `scripts/dev/out/g25-measuring-bowl-N1000.json`.

- N=1000, solvable 1000 (100%) — PASS. truncation 0 — PASS.
- Solver p50 112ms / p95 207ms / max 368ms — PASS ≤250 (above 150 preferred).
- Depth p50 12 / p95 14. Visited p50 1643 / p95 2890.
- MEASURED_CAUSAL 13/1000 (1.3%), canonical-causal 13 — **FAIL** (<5% reject).
- Control divergence 214/1000 (21.4%), firstDiff 149 — weaker than C.
- Measured share (takes/total): p50 15.4% / p90 25.0% / p95 27.3% —
  no domination (median <40%, p90 <60%), but takes are size-1-from-size-1
  (no splitting of multi-runs).
- Direct extraction (take with source ≥3 before): p50 1 / p90 3; ≥3 extractions
  on 134/1000 (13.4%) — below 50% domination flag, but causal still absent.
- DepthDelta p50 0. Ignored (0 takes) 336/1000 (33.6%).
- StateMult p50 1.16 / p95 1.39 — PASS.
- C-vs-D hypothesis (§59) confirmed directionally: D is used more often as
  buffer (15% vs 7% share) because it can extract without preloading, but
  neither provides needed precision — both decorative. D's higher share without
  causality is optionality, not power.

## Comparative table (§114)

| Metric | Mirror Pair | Metered Pourer | Measuring Bowl |
|---|---:|---:|---:|
| Solvability | 79.1% FAIL | 100% PASS | 100% PASS |
| Causal rate | 79.1% ORDER_ACTIVE (trivial-coupled) | 3.3% FAIL | 1.3% FAIL |
| Canonical causal | 791 | 33 | 13 |
| Control divergence | 100% of solved | 63.5% | 21.4% |
| Depth p50 | 13 | 12 | 12 |
| Solver p95 | 41ms PASS | 210ms PASS | 207ms PASS |
| State mult p95 | 1.19 PASS | 1.23 PASS | 1.39 PASS |
| Fatal openings | doom 9/50 FAIL | n/a (not triggered) | n/a (not triggered) |
| Domination | none (depth +1) | none (ignored 42%) | none (ignored 34%) |
| Novelty | high (paired non-homog. finality) | none proven | none proven |
| Verdict | REJECT | REJECT | REJECT |

Fairness (§§74-76): only candidates passing solv≥95% + causal≥10% + perf
qualify — none qualify, so no full fairness; mirror probe reported above as
diagnostic (doom 18%).

Confirmatory (§§77-80): no candidate meets
solv≥95% + trunc 0 + causal≥10% + canonical-causal≥50 + p95≤250 + no domination
(mirror fails solv; C/D fail causal + canonical-causal). No N=5000 run — correctly skipped.

## Final classification (§115)
- Mirror Pair: REJECT (hard-gate solvability + fairness doom; interaction real
  but topology unshippable without rescue mining).
- Metered Pourer: REJECT (decorative; 3.3% <5% reject; 42% ignored).
- Measuring Bowl: REJECT (decorative; 1.3% <5% reject; 34% ignored).

## Winner (§§83-86, 116)
No PASS, no DEFER/HOLD justification (rescue would require topology mining,
extra vessels, or redefining the axis — all prohibited). Ranking moot.

## Production / rollout
No production code, no CupConstraint names, no bank, no rollout, no G26.
Research markers isolated; absent markers leave legacy behavior identical.

## Quality (§106)
- `bun install --frozen-lockfile` — ok.
- `bun run typecheck` — PASS (exit 0).
- `bun run test` — BLOCKED by known infra flake (§107), not assertion failure:
  40/171 files executed, stopped at batch 14/77 `G21 composition production stress`
  (`tests/composition2-fastpath.test.ts` 10/10 passed on both attempts;
  unhandled `vitest-worker: Timeout calling "onTaskUpdate"`). No G25/G24 failure.
  Focused rerun 284/284 PASS (rules, solver, undo, rng, tasting, thermos,
  shared-tray, tea-pair, serving-order, steeping-flask, blend, G24 ×2, G25 ×4).
- `bun run build` — PASS (1.42s, 898.48 kB). `GITHUB_PAGES=true bun run build` — PASS.
- `bun run test:e2e:ci` — PASS (33/33, 4.4m).
- No new browser spec (research kernel inert without markers; runtime surface untouched).
- Bundle delta: research markers + 46-line rules branch + `g25Research.ts` helpers
  ship via `rules.ts` import (~few KB of 898 kB); effectively inert in production.

## Limitations (§131.I)
- A/B fixed globally (`matcha`/`sea_buckthorn`); per-board adaptive choice unexplored
  (would complicate canonical comparison; not a rescue per §62).
- Mirror §65 diagnostic variant not run (would be topology rescue).
- C/D tight diagnostic (4,4,4,3,1,0) not run — candidates already decoratively
  failed at balanced topology; tight variant only allowed if promising but weak (§61).
- Fairness full 50-board only for mirror probe; C/D skipped per trigger.
- Timing is wall-clock, non-deterministic; solver budget/tie-break untouched.
