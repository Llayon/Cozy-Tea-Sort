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
- Research SHA: (filled at report time)
- Worktree: `../Cozy-Tea-Sort-g27-transfer-graph`
- Original WIP before: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  diff SHA256 `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d0a07869dbac749d`,
  diff bytes 37532, plus untracked `public/`, `PixelArtImage`, pixel-art files.
  Original directory untouched (no stash/reset/clean/checkout/merge/commit/rebase).
- Original WIP after: (filled at report time)

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

## N500 pilot (§81-§96, §163)

Only for qualifiers. (To be filled if reached.)

## N2000 confirmatory (§97-§103, §164)

Only for confirmatory qualifiers. (To be filled if reached.)

## Fairness (§104-§111, §165)

Only N2000 survivors; tool `scripts/dev/g27-fairness.ts`. (To be filled if reached.)

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
- **Two-Lane (C):** pending N100.

## Quality gates (§137, §167)

(To be filled: typecheck, focused tests, G24, full test, build,
`GITHUB_PAGES=true` build, `test:e2e:ci`, bundle delta, flakes.)

## Limitations (§168)

- Fixed topologies (A/B: 3+3+1 vessels; C: 2+1 / 2+1 + 2 bridges).
- Deterministic tie-breaking unchanged; wall-clock solver timing.
- No production UI, no mechanic composition, no topology mining.

## Verdict (§145-§147, §158)

(To be filled: exactly one of PASS / DEFER / HOLD / REJECT per candidate,
at most one winner, or NO WINNER.)
