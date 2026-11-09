# G26 — Access Axis Shootout (research only)

Status: RESEARCH ONLY. No production merge, no template bank, no generator
fast path, no rollout, no tutorial, no Help, no Pixi/UI, no animation, no
telemetry, no composition, no Mystery/Blend change, no TeaId count change,
no `TEA_UNITS_PER_COLOR` change, no win-economy change.

## Source

- `origin/main` SHA: `f8781059343d7a851749e84e39b7a7e6f4fc5846`
  (Merge PR #8 `feat/g24-contract-preflight`)
- active branch: `spike/g26-access-axis` (from `origin/main`)
- worktree: `D:/Programms/Max/Cozy-Tea-Sort-g26-access-axis`
- ending research SHA: (see commits below)
- original WIP (in `D:/Programms/Max/Cozy-Tea-Sort`, untouched):
  before: diff `1d222e6e4c52fd8ca244b3eea347ecf8a996ba09fb941782978a7fd2e1532c1a`
  (18765 bytes, 5 modified + 5 untracked = 10 status lines),
  HEAD `7df1b6729104b8ea7b9cb3ed59aa86e3351648`, `origin/main` as above.
  after: (re-verified untouched, see Final report — source).

## G24 prerequisite (hard gate §4 — PASS)

- Authoritative API: `analyzeTerminalAllocation(problem)` in
  `src/game/logic/contractPreflight.ts:368-370`.
- Distinguishes `AlgebraicallyFeasible` / `AlgebraicUnsat` / `Unsupported`;
  never treats algebraic feasibility as solver solvability.
- G24 suite green before G26 work: 45/45
  (`tests/contract-preflight.test.ts` 25 + `tests/contract-preflight-existing-mechanics.test.ts` 20).
- G24 kept green throughout (see Quality).

## Production constants (audited from source)

- `TEA_UNITS_PER_COLOR = 4` (`src/game/types.ts:619`)
- `STANDARD_CUP_CAPACITY = 4`, `MAX_CUP_CAPACITY` alias
- `TASTING_BOWL_CAPACITY = 2`, `THERMOS_CAPACITY = 5`
- `SHARED_CAPACITY_LIMITS = { 'tea-tray': 6 }`
- No remembered values; scripts import these directly.

## Architecture audit (§13)

- `cups[i][0]` is the BOTTOM layer, `cups[i][last]` is the TOP layer.
  Proof: `topLayerOf = layers[layers.length-1]` (`src/game/logic/rules.ts:331-335`),
  `topCountOf` counts backwards from the end (`:336-345`),
  `applyPourState` pops from the end and pushes to the end (`:1394-1396` pre-G26).
- Single source-extraction plan: `sourceTransferPlan(layers, constraint)` in
  `src/game/logic/g26Research.ts` (see §14). It returns `{ tea, available, kind }`:
  ordinary/top when valid, bottom run when valid bottom-draw, null/0 when empty.
- Single transition truth preserved: `applyPourState` remains the only pour
  engine; it consumes the plan (`layer`, `isBottom`) and removes `m` bottom
  layers via `splice(0,m)` for valid bottom-draw, otherwise pops `m` top layers.
- Legality (`pourRejectCodeState` → `teaRejectCodeBetween`), count
  (`pourCountState`, `unstrainedPourCountState`), apply, solver, canonicalization,
  deadlock, win finality, Undo/Restart all delegate to the same plan.
  No second solver, no second pour engine, no mutable progress, no timers,
  no move counters as mechanic state.
- Legacy freeze: when research markers absent, top-source semantics
  byte/behavior identical, canonical keys identical, solver results unchanged,
  all G24/G21 production mechanics unchanged (verified by 298 focused tests).

## Stage 0 — G24 terminal contracts (§§10-11, 78)

Script: `scripts/dev/g26-contract-screen.ts` (imports production constants only).
Tests: direct contract assertions via script (all three feasible).

| Candidate | Terminal contract | Verdict | Witness |
|---|---|---|---|
| Bottom Draw | special cap4 `mustEndEmpty` fixed `{}` + 5×ordinary (16 units as 4×4) | `AlgebraicallyFeasible` (states=11) | special `mustEndEmpty`, 4× full homogeneous + 1× empty |
| Pair-Ready | special cap4 `mustEndEmpty` fixed `{}` + 5×ordinary (16 units as 4×4) | `AlgebraicallyFeasible` (states=11) | same shape as above |
| Linked Gate | S cap4 `mustEndEmpty` fixed `{}` + 5×ordinary incl. V ordinary (16 units as 4×4) | `AlgebraicallyFeasible` (states=11) | S `mustEndEmpty`, V ordinary, 4× full + 1× empty |

No `AlgebraicUnsat` — §13 hard stop not triggered; no topology/inventory/TeaId/
vessel/finality rescue.

## Research kernels (§§14-17, 27-28, 46-52, 63-66)

- `src/game/logic/g26Research.ts` (new, dev-only helpers; no state, no UI).
- `CupConstraint` markers (research only, optional):
  `bottomDraw`, `pairReadySource`, `linkedSourceGroup` + `linkedSourceRole`.
- `src/game/types.ts`: clone + `cupConstraintSignature` suffixes (`:BD`, `:PRS`,
  `:LSG:<group>:<role>`); absent markers leave legacy keys byte-identical.
- `src/game/logic/rules.ts` minimal branches:
  cupEndState fail-closed for malformed markers, G26 source gates
  (`source-pair-not-ready`, `source-linked-not-ready`), bottom-run color check,
  bottom-run transfer bounds, bottom `splice(0,m)` removal, standalone
  fail-closed for G26-involved pours on malformed boards.
  Absent markers: legacy identical (regression + canonical freeze verified).
- `src/game/logic/teaSortLogic.ts`: one-line fix so Undo snapshot `move.layer`
  uses authoritative `res.layer` (bottom tea for bottom-draw sources).
- ONE solver (`solvePuzzle` defaults 200k/60), ONE pour truth (`applyPourState`),
  no new TeaId/action, no mutable progress, no second search heuristic.

Unit tests (33/33): bottom-draw 11, pair-ready 11, linked-gate 11.

## Stage 1 — common policy (§§81-84)

- Primary topology A/B: 4 colors, 6 vessels, 4,4,4,4,0,0. One special empty
  (cap4 `mustEndEmpty` + marker) at index 4, one ordinary empty at index 5.
- Primary topology C: 4 colors, 6 vessels, 4,4,4,4,0,0. S empty at index 4,
  V empty at index 5, four full mixed vessels. No third empty.
- Shaped starts: filled ordinary cups mixed, no already-solved full homogeneous
  cup, deterministic seeds (`g26-<candidate>-probe-<i>`), same board families
  where candidate semantics permit (same 16-unit shuffle for A/B/C).
- FULL + CONTROL per board (CONTROL strips only candidate markers, keeps
  cap4/`mustEndEmpty`/contents/positions identical).
- Optimal-solution replay (no trace inference); first-action difference treated
  as weak evidence; control-replay impossibility ranked strongest.

## Direct witnesses (§§79-80 — PASS for all three)

- Bottom-draw (11 tests): witness1 FULL legal vs CONTROL illegal, witness2
  diverging resulting states, witness3 partial bottom removal, witness4 FULL
  rejects on bottom while CONTROL accepts on top, Undo exact, plan truth,
  canonical distinct + legacy freeze, malformed fail-closed, homogeneous
  no-novelty note.
- Pair-ready (11 tests): run1/3/4 locked, run2 ready with ordinary transfer
  (1-free-slot moves exactly 1), readiness derives after receives, empty
  precedence, Undo exact, canonical + freeze, malformed fail-closed, control
  divergence.
- Linked-gate (11 tests): S usable when V empty, V occupancy locks S, V
  emptied re-enables S (no mutable state), valve ordinary behavior, control
  divergence, Undo exact, static linking exact/ambiguous/missing fail-closed,
  canonical S/V distinct, malformed fail-closed, empty precedence, full cycle.

No candidate failed direct gate; all advanced to N=250.

## Stage 1 — N=250 (§§85-89)

| Candidate | N | Solv | Trunc | Causal | Ignored | Depth p50 | Visited p50/p95 | p95 solver | Stage verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Bottom Draw | 250 | 100% | 0 | 0% (0/250) | 30% | 12 | 1345/2352 | 246ms | REJECT (causal <5%) |
| Pair-Ready | 250 | 100% | 0 | 51.6% (129/250) | 33.2% | 12 | 1309/2475 | 273ms | ADVANCE (HOLD on perf) |
| Linked Gate | 250 | 100% | 0 | 54.4% (136/250) | 32.4% | 12 | 3086/5227 | 894ms | REJECT (perf >300ms) |

- Causal denominator: ALL sampled boards (also causal/solved identical here
  since solvability 100%).
- Bottom-draw: 175/250 use special source but `bottomTopDifferRate` 0 —
  all special uses are homogeneous (bottom==top), no access novelty.
  Control divergence 0/250, stateMult p50/p95 1.0 — FULL/CONTROL identical.
- Pair-ready: control divergence 57.6%, stateMult p95 1.0 — no search blowup.
- Linked-gate: control divergence 61.6%, valveNeverUsed 6.4% (valves used),
  but visited 2.3× larger and p95 894ms — performance catastrophe, stateMult
  p95 2.53 (over preferred 2.5×).

Per §88, bottom-draw REJECT immediately (0% <5%); per §86/§96, linked-gate
REJECT (p95 far over 300ms, no budget increase allowed). Only pair-ready
advances to N=1000 (solvability 100% so not HOLD-ADVANCE on solvability, but
performance HOLD 250–300ms noted).

## Stage 2 — N=1000 (§§90-107, pair-ready only)

- N=1000, solvability 100% (1000/1000) — PASS (≥95%).
- Truncation 0 — PASS.
- `PAIR_CAUSAL` 487/1000 (48.7%), canonical-causal 487 — PASS (≥10% min,
  ≥20% preferred, ≥50 canonical).
- Control divergence 549/1000 (54.9%).
- Ignored (0 special source moves) 376/1000 (37.6%) — PASS (preferred <50%,
  far from >70% decorative-reject).
- Depth p50 12 / p90 14 / max 15 (same as N=250 family).
- Visited p50 1324 / p95 2501.
- Solver p50 156ms / p95 324ms — HOLD/REVIEW (>300ms; confirmatory requires
  ≤250ms, so cannot qualify for N=5000 on current envelope).
- StateMult p50 0.97 / p90 1.0 / p95 1.0 / max 1.09 — PASS (preferred <2.5×).
- Special source moves: p50 1 / p90 1 / max 2; totalMoves p50 12 → move share
  ~8% median — no domination.
- Single-cycle risk (§123): max 2 special source moves per optimal game,
  median 1 — tool becomes ready once, drains, never matters again in most
  causal games. Causal impact is strong (48.7%) but pattern is one-shot buffer
  use, Flask-redundant waiting with a narrower gate (run2 vs full-homogeneous).
- Flask redundancy check (§59): pair-ready is conceptually a weaker/awkward
  Flask-style wait (derived source readiness from geometry) with no new
  decision pattern beyond one-shot buffering; even with strong causal rate,
  the dominant pattern is single ready→drain, not repeated planning cycles.

Root fairness pre-probe (§107, 20 boards before full fairness):
doom 0/20, fatal p50 0 / p90 1 / max 2 — no severe trap signal. Full 50-board
fairness not triggered (no N=5000 qualifier).

Qualified for N=5000? NO — fails §108 performance (p95 324ms >250ms) and
fails novelty/dominance review (single-cycle one-shot). No confirmatory run.

## Confirmatory N=5000 (§§109-112)

No qualifier (A rejected causal, C rejected performance, B fails confirmatory
performance + single-cycle novelty review). Correctly skipped per §§109,
146 (no rescue topology).

## Fairness (§§113-116)

Full 50-board fairness requires N=5000 qualifier — none, so no full fairness.
Pre-probe for the sole N=1000 qualifier (pair-ready, 20 boards):
constructive root moves 8/8, solvable-first median 8/8, doom 0/20,
fatal-first p50 0 / p90 1 / max 2 — PASS, no HOLD.

## Candidate classification (§140)

- Bottom Draw: REJECT (N=250 causal 0%, control divergence 0%, no access
  novelty on random deals; direct witnesses prove mechanics but population
  evidence shows pure buffer use).
- Pair-Ready: REJECT (N=1000 causal 48.7% passes numerically, but single-cycle
  one-shot max2/median1, Flask-redundant waiting, p95 324ms exceeds
  confirmatory 250ms envelope; cannot advance to N=5000, cannot be winner).
- Linked Gate: REJECT (N=250 causal 54.4% but solver p95 894ms, visited 2.3×,
  stateMult p95 2.53 — performance/state catastrophe with no budget relief).

## Winner (§§141-143)

At most one winner; if two pass, rank them. Here none pass to confirmatory.

```text
G26 RESEARCH CLOSED — NO WINNER
```

Ranking moot. Second place DEFER not assigned (no PASS/HOLD justification;
rescue would require topology mining, extra vessels, or redefining the axis —
all prohibited by §§144-146).

## Final comparison table (§139)

| Metric | Bottom Draw | Pair-Ready | Linked Gate |
|---|---:|---:|---:|
| Solvability (N250/N1000) | 100% / — | 100% / 100% | 100% / — |
| Causal | 0% REJECT | 51.6% / 48.7% | 54.4% |
| Canonical causal | 0 | 129 / 487 | 136 |
| Control divergence | 0% | 57.6% / 54.9% | 61.6% |
| Ignored | 30% | 33.2% / 37.6% | 32.4% |
| Move share (special) | p50 7.7% | p50 ~8% (1/12) | — |
| Depth p50 | 12 | 12 | 12 |
| Solver p95 | 246ms | 273ms / 324ms | 894ms FAIL |
| State mult p95 | 1.0 | 1.0 | 2.53 |
| Doom (pre-probe) | — | 0/20 | — |
| Fatal first | — | p50 0/p90 1 | — |
| Novelty | none (homogeneous only) | one-shot run2 buffer | gate real but costly |
| Verdict | REJECT | REJECT | REJECT |

## Quality (§153)

- `bun install --frozen-lockfile` — ok (114 packages).
- `bun run typecheck` — PASS (exit 0, before and after).
- Focused unit: 298/298 PASS (rules, solver, undo, rng, tasting, thermos,
  shared-tray, tea-pair, serving-order, steeping-flask, blend, G24 ×2, G26 ×3).
- `bun run build` — PASS (2.01s, 901.84 kB; baseline ~898.48 kB → delta
  ~3.4 kB research markers/branches, inert in production without markers).
- `GITHUB_PAGES=true bun run build` — not run (same code path as build;
  existing browser regression covers research-inert surface).
- `bun run test:e2e:ci` — not run (no new browser spec per §155; research
  kernel has no production UI; existing browser regression unchanged).
- No new E2E spec (§155), no screenshots (§156).
- G24 suite kept green (45/45 before and after).
- No infrastructure flake encountered in focused runs; full canonical suite
  not run to avoid known VITEST RPC flake (§154) — focused + G24 + G26 + build
  cover research integrity without process-exit noise.

## Limitations (§172)

- Physical UI irrelevant (research mechanics have no visuals).
- Wall-clock solver timing is machine-dependent; solver budget/tie-breaking
  unchanged (200k/60); tsx harness overhead included.
- Candidate-specific topologies fixed (A/B 4,4,4,4,0,0 special+ordinary empty;
  C S+V empty, no third empty); no topology search or rescue variant.
- Solver deterministic tie-breaking retained; no candidate-specific tie-break.
- Causal definitions use optimal-FULL replay + CONTROL-replay divergence;
  first-action-only differences never counted as causal.
- Diagnostic topology (e.g. tight 4,4,4,3,1,0) not tested — candidates already
  decided at balanced topology (A decorative-fail, C perf-fail, B single-cycle).
- Fairness full 50-board not run (no N=5000 qualifier); 20-board pre-probe only
  for pair-ready.

## Winner next step (§§173-174)

No winner — do not combine failed candidates.

Recommended genuinely different axis (not a rescue of A/B/C):
probe DESTINATION-availability or ORDER-constrained access rather than
SOURCE-access (e.g. derived destination readiness, or serving-order-gated
source) — a new proposal, not G26 continuation.

## Hard stops (§175)

None triggered by manipulation:
G24 green, all contracts feasible, one solver / one pour truth preserved,
bottom-draw logic centralized in `sourceTransferPlan`, no mutable readiness,
no budget raise, no candidate tie-break, causal denominator = ALL sampled,
control geometry identical, no topology mining, no domination/fairness ignore,
no old-mechanic regression, no canonical key change without marker, original
WIP untouched.
