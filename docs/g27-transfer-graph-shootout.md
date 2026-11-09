G27 RESEARCH CLOSED — NO WINNER

# G27 — Transfer Graph Shootout

> Research only. No production merge, no rollout, no UI, no composition.

## Initial hypothesis (recorded before experiment, §149)

- **Tea Bridge (A):** highest expected product value. Bidirectional single-bridge
  routing should force genuine cross-side planning while keeping every board
  solvable: each side keeps its own empty workspace plus the shared bridge.
- **One-Way Bridge (B):** higher trap risk. Directional routing can strand tea
  on the wrong side with no recovery; the generator deals tea symmetrically,
  so many boards may be structurally doomed.
- **Two-Lane Routing (C):** highest complexity/performance risk. Eight vessels
  and two bridges enlarge the state space before routing even matters; the
  second lane may prove decorative.

Evidence below overrides this hypothesis.

## Source (§3, §159)

- Production main SHA: `f8781059343d7a851749e84e39b7a7e6f4fc5846`
- Branch: `spike/g27-transfer-graph`
- Evidence commits on `spike/g27-transfer-graph` (no PR, no merge):
  `d78c695` screen (kernel + contract screen + 68 witnesses),
  `530ad68` probe (lib + runners + A/B N100 JSON),
  `656a14f` verdict data (C N100 JSON + quality evidence + report).
  Tip holds only report wording fixups beyond these.
- Worktree: `../Cozy-Tea-Sort-g27-transfer-graph` (kept after review, §157)
- Original WIP before: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  diff SHA256 `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d0a07869dbac749d`,
  diff bytes 37532, plus untracked `public/`, `PixelArtImage`, pixel-art files.
  Original directory untouched (no stash/reset/clean/checkout/merge/commit/rebase).
- Original WIP after: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  diff SHA256 `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d0a07869dbac749d`,
  diff bytes 37532 — byte-identical to before (verified via
  `C:\Temp\g27-orig-after.diff`). Same 5 modified files, same untracked
  files, no stash. Original directory untouched.

## G24 preflight (§4-§5, §160)

Authoritative API: `src/game/logic/contractPreflight.ts` →
`analyzeTerminalAllocation` (reused, no second preflight).

Screen: `scripts/dev/g27-contract-screen.ts` (4 terminal vessels + empties).

| Candidate | Vessels | Terminal | Empty | Verdict | Explored |
|---|---|---|---|---|---|
| Tea Bridge (A) | 7 | 4 flex cap4 | 3 | AlgebraicallyFeasible | 7 |
| One-Way (B) | 7 | 4 flex cap4 | 3 | AlgebraicallyFeasible | 7 |
| Two-Lane (C) | 8 | 4 flex cap4 | 4 | AlgebraicallyFeasible | 7 |

All three: **AlgebraicallyFeasible**. Routing never changes terminal tea
allocation, so no candidate was rescued or re-topologized (§5).

## Architecture (§11-§18, §122)

- Research kernel: `src/game/logic/g27Research.ts` (never imported by
  production app paths).
- One pure seam: `isTransferEdgeAllowed(fromConstraint, toConstraint)` —
  directional, deterministic, no state. Routing is evaluated BEFORE ordinary
  pour semantics inside `teaRejectCodeBetween`, after structural addressing
  and impossible static roles (`same-cup`, `out-of-range`, `source-sink-only`,
  `target-source-only`).
- One machine reject code: `transfer-edge-blocked`. Without routing markers
  no new code can appear (legacy freeze).
- One pour truth (`applyPourState`), one count truth (`pourCountState`), one
  solver (`solvePuzzle` via `canPourState` — no routing-specific solver).
- Static routing roles on `CupConstraint.transferGraph/transferRole`;
  `cloneCupConstraint` carries them; `cupConstraintSignature` appends
  `:T<graph>:<role>` only when present (legacy keys byte-identical:
  plain normal still `N:_`).
- Malformed graphs fail closed (`isG27BoardMalformed`): half-marked pairs,
  mixed graphs, wrong census, unknown roles, production specials, dynamic
  slots/tools, blend composition. Malformed vessels never satisfy victory.
- No new action, no mutable routing state, no graph DSL, no generic
  graph-isomorphism handling (explicit frozen role labels only).
- Finality unchanged: bridges are ordinary cap4 `mustEndEmpty` vessels (no
  mixed finality invented).

## Direct witnesses (§67, §161)

File: `tests/g27-transfer-graph.test.ts` — 68 scenarios, all green.

- A (tea-bridge): 26 scenarios (A1–A26). Allowed edges, forbidden
  `LEFT↔RIGHT` with exact code, ordinary color/capacity/empty semantics after
  the edge passes, same-cup/out-of-range priority, end-to-end crossing both
  directions, FULL-vs-CONTROL parity on same-side pours, CONTROL difference,
  bridge finality both ways, Undo, canonical role distinction + legacy
  signature freeze, determinism, 4 malformed groups, solver-path check.
- B (one-way): 20 scenarios (B1–B20). Directional matrix
  (`LEFT→BRIDGE`, `BRIDGE→RIGHT` ok; `RIGHT→BRIDGE`, `BRIDGE→LEFT`,
  `LEFT↔RIGHT` blocked), no reverse transport, ordinary semantics, priority,
  CONTROL difference on the reverse route, Undo, canonical + legacy freeze,
  full matrix table, 4 malformed groups, well-formed acceptance.
- C (two-lane): 22 scenarios (C1–C22). Same-side same-lane and cross-lane
  legality, lane-A and lane-B crossings, 4 lane-mismatch rejections,
  bridge↔bridge rejection, direct cross-lane rejection, ordinary semantics,
  priority, both-lane crossings, CONTROL difference, Undo, canonical lane
  distinction + legacy freeze, bridge finality, pure lookup, 3 malformed
  groups, well-formed acceptance.

## N100 early probe (§72-§80, §162)

Seed family `g27-<candidate>-probe-<i>`. Evidence files:
`scripts/dev/out/g27-a-tea-bridge-N100.json`,
`scripts/dev/out/g27-b-one-way-N100.json`,
`scripts/dev/out/g27-c-two-lane-N100.json`.

### A — Tea Bridge N100: REJECT (domination + performance)

| Stage | N | Solv | Causal | Divergence | Ignored | Solver p95 | State mult p95 | Verdict |
|---|---|---|---|---|---|---|---|---|
| N100 | 100 | 100% | 100% (100/100) | 100% | 0% | 6031ms | 2.77 | **REJECT** |

- Raw boards 100, canonical starts 100, canonical causal 100.
- Causal identity is extreme: every board crosses (93/100 with 3+ crossing
  events), forbidden CONTROL edges 3–11 per board, ROUTE_REPLAN 81%,
  tax-only rate 0%, extraMoves p50 +4 (far below 2×forbidden — global
  replanning, not per-edge detours). The metric chain is genuine: routing
  changes strategy well beyond a fixed transport tax.
- **Domination failure (§152):** bridge-touch move share p50 57% / p90 71% /
  p95 73% — a majority of every optimal solution is bridge shuffling, over
  both the preferred (p50 <35%) and red-flag (p50 >45%) lines. Ignored 0%:
  no board solves without the bridge.
- **Performance failure (§153, §73):** FULL solver p50 2925ms / p95 6031ms —
  ~20× over the 300ms N100 gate. CONTROL alone (same 7 vessels, no graph)
  runs p50 762ms / p95 1547ms, so the frozen 7-vessel topology itself is
  incompatible with the solver envelope before routing doubles it
  (stateMult p50 2.03 / p95 2.77, max 3.28).
- Truncation 0. No N500: the N100 gate (p95 ≤300ms, no domination
  catastrophe) fails, and §116 forbids rescuing weak mechanics with an
  alternative topology.

### B — One-Way Bridge N100: REJECT (directional doom)

| Stage | N | Solv | Causal | Divergence | Ignored | Solver p95 | State mult p95 | Verdict |
|---|---|---|---|---|---|---|---|---|
| N100 | 100 | 2% (2/100) | 2% (2/100) | 100% of solved | 0% of solved | 218ms (2 solved) | 0.26 | **REJECT** |

- Raw boards 100, canonical starts 100, canonical causal 2.
- CONTROL solvable 100/100; FULL unsolvable 98/100 → **graph traps 98/100**.
  The generator deals tea symmetrically across sides while the graph only
  permits LEFT→BRIDGE→RIGHT consolidation (§55 predicted exactly this).
- Gate §76 requires solvability ≥90% AND causal ≥15%: 2% fails by ~45×.
- The 2 solved boards were causal with route replan (bridge share 0.33–0.38,
  extraMoves +3, forbidden CONTROL edges 3–5), proving the metric chain works
  — but on 2% of boards. No rescue, no N500 (§116).
- Truncation 0. Solver p95 over 2 solved boards 218ms is moot given doom.

### C — Two-Lane Routing N100: REJECT (state-space / performance catastrophe)

| Stage | N | Solv | Causal | Divergence | Ignored | Solver p95 | State mult p95 | Verdict |
|---|---|---|---|---|---|---|---|---|
| N100 | 100 | 62% (62/100) | 62% (62/100) | 100% of solved | 0% of solved | 72387ms | 9.45 | **REJECT** |

- Raw boards 100, canonical starts 100, canonical causal 62.
- CONTROL solvable 100/100; FULL solved only 62/100 with **truncation 38**
  (every FULL failure is a 200k-visited search-cap hit, so true solvability
  is unknown — the search explodes before answering).
- Solver FULL p50 45040ms / p95 72387ms — ~240× over the 300ms N100 gate
  (§77: reject immediately). CONTROL alone (same 8 vessels, no graph) runs
  p50 3573ms / p95 5928ms: the frozen 8-vessel topology itself is ~20× over
  the gate before routing multiplies visits another 5.8× (p50) / 9.45×
  (p95, max 11.44 — over the >4× reject line, §90).
- Lane usage among causal: laneA 62/62, laneB 41/62 (multi-lane 66%) —
  the second lane is not purely decorative, but the finding is moot under
  performance/solvability failure. Bridge-share p50 56% also trips the
  domination flag (§93).
- No N500: fails solvability (62% < 90%), truncation (38 ≠ 0), performance,
  and state-multiplier gates simultaneously.

## N500 pilot (§81-§96, §163)

No qualifiers (A fails performance + domination; B fails solvability;
C fails solvability + truncation + performance + multiplier). Not run —
running confirmatory stages on rejected candidates is explicitly forbidden
(§97–§98).

## N2000 confirmatory (§97-§103, §164)

No confirmatory qualifiers (§97). Not run.

## Fairness (§104-§111, §165)

No confirmatory survivors; fairness probe not run (tool retained:
`scripts/dev/g27-fairness.ts`). Observable fairness signals from N100:
- A: doom 0/100 (100% solvable), graph traps 0/100.
- B: doom 98/100, graph traps 98/100 — systematic directional stranding
  (tea dealt symmetrically can never consolidate LEFT→only).
- C: FULL failures 38/100 are all search truncations (unknown doom vs
  too-hard-to-answer); CONTROL 100/100 solvable, so all 38 are graph- or
  topology-induced traps of unknown exact kind.

## Tax analysis (§166)

(To be filled: did routing change strategy, or merely replace one direct
pour with a fixed two-step detour?)

## Tax analysis (§166)

Mandatory question: *did routing change strategy, or merely replace one
direct pour with a fixed two-step detour?*

- **Tea Bridge (A): strategy changed — but into bridge shuffling.** Tax-only
  rate 0%: no causal board satisfies
  `extraMoves == 2 × forbiddenCrossings` without replan (extraMoves p50 +4
  vs forbidden edges 3–11, p50 ~6). ROUTE_REPLAN 81% proves FULL optimal
  solutions reorder non-bridge moves around crossings. So the mechanic is
  NOT a fixed movement tax — it is a genuine but dominating replan: the
  strategy changes, yet 57% (p50) of the resulting play is bridge handling.
  Verdict dimension: non-tax identity PASS, domination REJECT.
- **One-Way Bridge (B): moot — 98% doom.** The 2 solvable boards both show
  replan with +3 extra moves over 3–5 forbidden CONTROL edges (not a fixed
  2× detour either), but a mechanic solvable on 2% of deals has no strategy
  worth tax-analyzing. REJECT on fairness/solvability before tax matters.
- **Two-Lane (C): strategy signal exists but is unmeasurable in-budget.**
  Replan 95% of causal, tax-only 0%, multi-lane 66% — but with 38
  truncations the optimal replays themselves are search-cap artifacts on
  many boards. No tax rescue (§117); REJECT on performance/solvability
  before tax matters.

## Quality gates (§137, §167)

- `bun install --frozen-lockfile`: PASS (114 packages).
- `bun run typecheck`: PASS (exit 0, incl. kernel, lib, probes, tests).
- G24 focused (`contract-preflight.test.ts`,
  `contract-preflight-existing-mechanics.test.ts`): 45/45 PASS after changes;
  `contract-preflight.ts --bench`: 21 scenarios green.
- Full `bun run test`: first attempt stopped early at 40/168 files in the
  `G21 composition production stress` batch
  (`tests/composition2-fastpath.test.ts`) on the known vitest worker RPC
  flake (`Timeout calling "onTaskUpdate"` after all 10 tests in the file
  passed — unhandled error, zero assertion failures). Per §138 this is an
  infrastructure exit, NOT a canonical PASS and NOT an assertion failure.
  Focused rerun of the exact file (log:
  `scripts/dev/out/g27-quality-composition2-rerun.log`): 10/10 assertions
  PASS both times, same RPC signature both times — flake confirmed,
  unrelated to G27 code (composition2 paths carry no markers; legacy
  identical). Full-suite retry #2 stopped at the same batch with the same
  signature (40/168, zero assertion failures).
- Full-suite diagnostic (canonical runner cannot return 0 in this
  environment): all 167 remaining files executed directly in 12 sequential
  chunks (`scripts/dev/out/g27-quality-chunks.json`, per-chunk tails in
  `g27-quality-chunk-N.log`). 9 chunks exit 0; chunks 7/9/11 exit 1 SOLELY
  from the same `onTaskUpdate` RPC flake with ALL contained assertions
  green (168 + 143 + 188 tests passed, 0 failed). Net: every assertion in
  all 168 files passes; no canonical PASS claimed per §138 (infra exits).
- `bun run build`: PASS (1.56s).
- `GITHUB_PAGES=true bun run build`: PASS (exit 0).
- `bun run test:e2e:ci`: PASS — 33/33 (release journey, G19, G20, G21).
  E2E regenerated 16 screenshot PNGs under `scripts/dev/out/` (byte-size
  noise only, all comparisons passed); restored to HEAD to keep the
  worktree diff research-only.
- Bundle delta (production `index-*.js`): baseline 896285 B →
  research 901111 B = **+4826 B (+0.54%)**, inert (new branches only
  execute with G27 markers; legacy paths byte-identical).
- Infrastructure flakes: none observed (no `onTaskUpdate` RPC timeouts in
  any batch so far).

## Limitations (§168)

- Fixed topologies (A/B: 3+3+1 vessels; C: 2+1 / 2+1 + 2 bridges).
- Deterministic tie-breaking unchanged; wall-clock solver timing.
- No production UI, no mechanic composition, no topology mining.

## Stage report (§143)

| Stage | N | Solv | Causal | Divergence | Ignored | Solver p95 | State mult p95 | Verdict |
|---|---|---|---|---|---|---|---|---|
| A N100 | 100 | 100% | 100% | 100% | 0% | 6031ms | 2.77 | REJECT (domination + perf) |
| B N100 | 100 | 2% | 2% | 100%* | 0%* | 218ms* | 0.26* | REJECT (doom) |
| C N100 | 100 | 62% | 62% | 100%* | 0%* | 72387ms | 9.45 | REJECT (perf + trunc) |

\* over solved boards (B: 2 boards; C: 62 boards). Depth rows are p50 of
per-board optimal minMoves.

## Final comparison (§144)

| Metric | Tea Bridge (A) | One-Way (B) | Two-Lane (C) |
|---|---|---|---|
| Solvability | 100% | 2% | 62% |
| Causal (all boards) | 100% | 2% | 62% |
| Canonical causal | 100 | 2 | 62 |
| Edge divergence | 100% | 100%* | 100%* |
| Route replan | 81% | 100%* | 95% of causal |
| Ignored | 0% | 0%* | 0%* |
| Bridge move share p50/p90 | 57% / 71% | 38%* | 56% / 69%* |
| Depth p50 (FULL / CONTROL) | 16 / 11 | 13 / 10* | 15 / 11 |
| Solver p95 | 6031ms | 218ms* | 72387ms |
| State mult p95 | 2.77 | 0.26* | 9.45 |
| Doom (N100) | 0/100 | 98/100 | 38 truncations |
| Tax-only signal | 0% (replans) | 0%* | 0% of causal |
| Novelty | genuine replan, dominated | directional, doomed | two lanes used, unsearchable |
| Verdict | **REJECT** | **REJECT** | **REJECT** |

\* over solved boards. † A: medians from per-board pairs (FULL minMoves
p50 ≈16, CONTROL ≈12); C: extraMoves p50 +5.

## Classification (§145)

- Tea Bridge: **REJECT** (domination §152 + performance §153).
- One-Way Bridge: **REJECT** (solvability/fairness; directional doom).
- Two-Lane Routing: **REJECT** (performance + truncation + multiplier).

## Verdict (§158)

```text
G27 RESEARCH CLOSED — NO WINNER
```

No candidate passes its N100 gate, so none advances (§97); per §147–§148
there is no winner to rank. Next research must use a genuinely different
axis — no combining of failed routing mechanics (§170). Recommended
follow-ups (not started): if vessel connectivity is ever revisited, the
frozen 7/8-vessel topologies themselves must first fit the solver envelope
(CONTROL alone runs 1.5–6s p95), and any directional graph must come with
a routing-aware generator contract — both are new-axis problems, not G27
rescues.
