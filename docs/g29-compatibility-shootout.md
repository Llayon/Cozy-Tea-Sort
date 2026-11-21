G29 RESEARCH CLOSED — NO WINNER

# G29 — Compatibility Axis Shootout

> Research only. No production merge, no rollout, no UI, no composition.

## Initial hypothesis (recorded before experiment, §140)

```text
A Mixed Buffer:
highest causal probability,
highest domination risk

B Two-Tea Buffer:
best chance for controlled power

C Different-Tea Buffer:
high causal probability,
highest artificial-handicap risk
```

Evidence below overrides this hypothesis.

## Source (§3, §159)

- Production main SHA: `f8781059343d7a851749e84e39b7a7e6f4fc5846`
- Branch: `spike/g29-compatibility`
- Evidence commits: `research: screen g29 compatibility contracts`,
  `research: probe compatibility mechanics`,
  `docs: record g29 compatibility verdict` (see `git log`)
- Worktree: `../Cozy-Tea-Sort-g29-compatibility` (kept after review, §157)
- Original WIP before: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  10 status lines, diff SHA256
  `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d09a07869dbac749d`,
  diff bytes 37532, plus untracked `public/`, `PixelArtImage`, pixel-art files.
  Original directory untouched (no stash/reset/clean/checkout/merge/rebase/commit).
- Original WIP after: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  diff SHA256 `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d09a07869dbac749d`,
  diff bytes 37532 — byte-identical to before. Same 5 modified files, same
  untracked files, no stash. Original directory untouched.

## G24 preflight (§4–§5, §50, §160)

Authoritative API: `src/game/logic/contractPreflight.ts` →
`analyzeTerminalAllocation` (reused, no second preflight).
G24 focused suite: 45/45 green BEFORE (fresh `origin/main` worktree) and
after (see Quality section).

Screen: `scripts/dev/g29-contract-screen.ts` — one shared topology for
A/B/C (4 terminal flex vessels cap4 ordinary finality + 1 special cap4
mustEndEmpty + 1 ordinary empty; 16 tea units, 4 colors × 4).

| Candidate | Terminal contract | G24 verdict | Witness |
|---|---|---|---|
| Mixed Buffer (A) | 4 flex cap4 + 2 empty | AlgebraicallyFeasible | explored=7 |
| Two-Tea Buffer (B) | 4 flex cap4 + 2 empty | AlgebraicallyFeasible | explored=7 |
| Different-Tea Buffer (C) | 4 flex cap4 + 2 empty | AlgebraicallyFeasible | explored=7 |

Compatibility relaxations never change terminal tea allocation, so no
candidate was rescued or re-topologized (§5, §174).

## Architecture audit (§12, §161)

Audited before coding (fresh `origin/main` tree):

1. Ordinary destination color compatibility lives at the END of the private
   `teaRejectCodeBetween` core in `src/game/logic/rules.ts`:
   `if (target.length === 0) return 'ok'; return top-match ? 'ok' :
   'color-mismatch'`.
2. Rejection precedence above it (untouched by G29): same-cup →
   out-of-range → source-sink-only / target-source-only → source-empty →
   steeping-flask readiness → target-full (capacity) → complete-to-empty
   prune. The G29 seam changes ONLY the final TeaId compatibility stage,
   after all structural gates; full special stays capacity-gated.
3. One compatibility seam inserted there:
   `g29CompatibilityOverride(sourceTea, target, destConstraint)` →
   `'ordinary' | 'accept' | 'reject'`. Ordinary path falls through to the
   legacy check byte-identically.
4. Transfer count (`pourCountState`) derives from the pre-state via ordinary
   max-run/free-space bounds after `canPourState` — unchanged.
   `applyPourState` body unchanged (ordinary append; mixed stacks arise
   naturally). One solver, one apply truth, no transform engine.
5. Canonicalization (`teaCanonicalKey` and grouped variants): TeaIds are
   NOT renamed — raw TeaId strings group by constraint signature. The
   static B pair therefore follows vessel identity with no solver/canonical
   changes: signature suffix `:2TB:<lo>+<hi>` (unordered, §58/§127–§128
   gate passed — no broad refactor needed, STOP-B not triggered).
   Other suffixes: `:MB`, `:DTB`. Legacy keys byte-identical when absent.
6. Solver expands via the shared legality path (no G29 solver).
   Win/finality: malformed marked vessels never satisfy victory; valid
   specials fall through the generic mustEndEmpty branch. Undo/restart
   restore exact layers (mixed order included). Malformed boards fail
   closed with one machine code `special-malformed` (marker-involved pours
   only; same-cup/out-of-range priority preserved).

## Direct witnesses (§51–§55, §129, §162)

File: `tests/g29-compatibility.test.ts` — 66 scenarios, all green
(22 per candidate: A1–A22, B1–B22, C1–C22; minimum was 20).
Covers §52 common tests (empty/same/cross receives, full destination,
source behavior, transfer count, Undo, restart, mustEndEmpty finality,
canonical marker + legacy freeze, malformed static contract, CONTROL
difference, no TeaId transformation, no mutable state) plus §53/§54/§55
specifics (A: AA+BB→AABB vs CONTROL reject then BB-drain leaves AA;
B: pair A←B/B←A accept, A←C and C←A reject, pair static across
drain/refill, unordered A/B==B/A canonical; C: different accept,
same-color reject with `color-mismatch`, alternation from derived top,
drain→refill derived re-arm, no stored state).

## N100 early probe (§61–§70, §134, §163)

Seed family `g29-probe-<i>` shared by A/B/C (§10); B pair =
`G29_PAIRS[i % 6]` (balanced, §32). Evidence files:
`scripts/dev/out/g29-a-mixed-N100.json`,
`scripts/dev/out/g29-b-two-tea-N100.json`,
`scripts/dev/out/g29-c-different-N100.json`.

| Candidate | Solv | Strong causal | Special p50 | Depth collapse | p95 solver | State mult p95 | Verdict |
|---|---|---|---|---|---|---|---|
| A N100 | 100% | 5% (need ≥10%) | 29% | 0% | 10926ms | 41.0x | **REJECT** |
| B N100 | 100% | 1% (need ≥10%) | 29% | 0% | 901ms | 3.8x | **REJECT** |
| C N100 | 100% | 4% (need ≥10%) | 15% | 0% | 11126ms | 40.4x | **REJECT** |

### A — Mixed Buffer N100: REJECT (weak causal + search explosion)

- Raw boards 100, canonical starts 100, canonical causal 5.
- Broad 5%, strong 5%, ignored 95%: gate §66 requires strong ≥10%.
  Only 5 mixed receives in 100 optimal replays (hist: 95×0, 5×1).
- The 5 strong boards are genuine (multi-stage 5/5, replan 5/5, holdGap
  p50 6 / p95 9) — the metric chain works, but fires on 5% of boards.
- **Performance catastrophe:** solver p50 4882ms / p95 10926ms — ~36× over
  the 300ms gate. State multiplier p50 32x / p95 41x / max 43x — far over
  the >4× reject line (§91). The open compatibility widens the search
  frontier enormously even though optimal play ignores it (extraMoves p50
  0, depth collapse 0%). This is the universal-joker risk (§145)
  manifesting as computational explosion rather than solution domination
  (special touch p50 29%, no domination).
- No multi-run cycles (0/5), distinct teas p50 1, max simultaneous p50 1.
- Truncation 0. No N500 (§71).

### B — Two-Tea Buffer N100: REJECT (weak causal + over-gate perf)

- Raw boards 100, canonical starts 100, canonical causal 1.
- Broad 1%, strong 1%, ignored 99%: gate requires strong ≥10%.
  Exactly 1 pair-mix event in 100 optimal replays (pair index 3).
- The single strong board is fully genuine (holdGap 9, replan, multi-stage,
  divergence) — but 1/100 proves the pair restriction keeps the mechanic
  nearly unreachable on natural deals, not that it is controlled-powerful.
- Pair bias: all 6 pairs balanced (16–17 boards each); the lone strong
  board sits in pair 3 — no pair carries evidence.
- Off-pair receives 0 by construction count (all cross-color receives were
  pair-internal); ordinary special receives 188 (special used as plain
  buffer). Pair restriction does not leak — it just never fires.
- Solver p50 444ms / p95 901ms — over the 300ms gate (3×). State multiplier
  p95 3.8x (review zone, §91). Truncation 0. No N500.

### C — Different-Tea Buffer N100: REJECT (weak causal + handicap-dominated)

- Raw boards 100, canonical starts 100, canonical causal 4.
- Broad 4%, strong 4%, ignored 96%: gate requires strong ≥10%.
  Only 4 different-receives in 100 optimal replays.
- The 4 strong boards are genuine (multi-stage 4/4, replan 4/4, holdGap p50
  9 / p95 11, divergence 4/4) — but 4% proves the useful direction is
  nearly unreachable, not that alternation is powerful.
- **Handicap dominance (§84–§85, §147):** same-color blocks total 110
  (CONTROL-solution replay under FULL) vs different-receives total 4 —
  the restriction fires ~27× more often than the useful exception.
  Block pressure along FULL optimal replays: 640 blocked same-color
  opportunities on 65/100 boards. The candidate's identity is primarily
  forbidding ordinary pours, exactly the §147 failure; the §85 preferred
  balance (receives > blocks) is inverted.
- Special touch p50 15% (lowest of the three — optimal play avoids the
  special because receiving the wrong tea strands it).
- Solver p50 4985ms / p95 11126ms (~37× over gate); state mult p95 40x.
  Truncation 0. No N500.

## N500 pilot (§71–§100, §164)

No qualifiers (strong 5%/1%/4% < 10% for all; all p95 > 300ms; A/C state
mult >4×). Not run — running later stages on rejected candidates is
explicitly forbidden (§101–§102, §174).

## N2000 confirmatory (§101–§109, §165)

No confirmatory qualifiers (§101). Not run.

## Fairness (§110–§115, §166)

No confirmatory survivors; 50-board fairness not run (tool retained:
`scripts/dev/g29-fairness.ts`). Observable N100 fairness signal: doom
0/100 and compat traps 0/100 for all candidates (100% solvable both FULL
and CONTROL) — fairness is healthy; causality is the killer, not traps.

## Domination (§79–§82, §167)

Mandatory question: *did special remain a local tactical buffer, or did it
become the central solution engine for most tea?*

Neither — optimal play barely touches the special transformingly
(transform share p50 0% for all). Special-touch shares (p50 29%/29%/15%)
reflect ordinary buffer use, under every domination line. A-specific joker
signals: ≥3 distinct teas through special on >50% boards with touch p50
>35% — not observed (distinct p50 1, max simultaneous p50 1, touch p50
29%). The joker risk materialized computationally (state mult 32–41×)
rather than in solution structure.

## Buffer value (§95–§99, §168)

Mandatory: *did mixed storage create real planning time between receive
and drain, or was it only an immediate relay?*

The few strong events show real planning time: holdGap p50 6–9 moves,
BUFFER_REPLAN on all strong boards (5/5 A, 1/1 B, 4/4 C), multi-stage use
on all strong boards. But with 1–5 strong boards per 100, the mechanic is
decorative, not a relay: there is almost nothing to relay.

## C handicap (§84–§85, §169)

Mandatory for Different-Tea: *did the mechanic succeed because mixed
receive was useful, or merely because same-color receives were forbidden?*

Forbidden-wins: 4 useful different-receives vs 110 same-color blocks
(CONTROL-replay) and 640 block-pressure states (FULL-replay, 65 boards).
The mechanic's measurable effect is ~96% handicap, ~4% useful storage.

## Quality gates (§149, §170)

- `bun install --frozen-lockfile`: PASS (114 packages).
- `bun run typecheck`: PASS (exit 0, incl. kernel, lib, probes, tests).
- Focused tests (G24 ×2 files + G29 witnesses): 111/111 PASS after changes;
  G24 `contract-preflight.ts`: 21 scenarios green.
- Full `bun run test` diagnostic (canonical runner cannot return 0 in this
  environment): `tests/composition2-fastpath.test.ts` focused rerun
  (log: `scripts/dev/out/g29-quality-composition2-rerun.log`): 10/10
  assertions PASS, single error is the exact RPC signature. All other 167
  files executed directly in 12 sequential chunks (tails in
  `g29-quality-chunk-N.log`, `*.log` gitignored, worktree kept): 11 chunks
  exit 0; chunk 11 exits 1 SOLELY from the same RPC flake with all 188
  contained assertions green. Net: every assertion in all 168 files passes;
  canonical PASS not claimed per §150 (infra exits).
- `bun run build`: PASS.
- `GITHUB_PAGES=true bun run build`: PASS (exit 0).
- `bun run test:e2e:ci`: PASS — 33/33 (release journey, G19, G20, G21).
  E2E regenerated 16 screenshot PNGs under `scripts/dev/out/` (byte-size
  noise only, all comparisons passed); restored to HEAD to keep the
  worktree diff research-only.
- Bundle delta: research 898746 B vs baseline 896285 B = **+2461 B
  (+0.27%)**, inert (new branches execute only with G29 markers; legacy
  paths byte-identical).
- Infrastructure flakes: none observed so far in G29 runs.

## Limitations (§171)

- Fixed topology (4+1+1 vessels, 4 colors); no compositions.
- Deterministic solver tie-breaking; wall-clock machine dependence.
- B pair rotation balanced by seed index (`PAIRS[i % 6]`), no curation.
- No UI; no production templates; no topology mining.

## Classification (§136)

- Mixed Buffer: **REJECT** (strong 5% < 10%; p95 36× over gate; mult 41×).
- Two-Tea Buffer: **REJECT** (strong 1% < 10%; p95 3× over gate).
- Different-Tea Buffer: **REJECT** (strong 4% < 10%; p95 37× over gate;
  handicap-dominated).

## Final comparison (§135)

| Metric | Mixed Buffer | Two-Tea | Different-Tea |
|---|---|---|---|
| Solvability | 100% | 100% | 100% |
| Broad mixed events | 5% | 1% | 4% |
| Strong causal | 5% | 1% | 4% |
| Canonical strong | 5 | 1 | 4 |
| Buffer replan | 5% (5/5 strong) | 1% (1/1) | 4% (4/4) |
| Ignored | 95% | 99% | 96% |
| Mixed receives p50 | 0 (5 total) | 0 (1 total) | 0 (4 total) |
| Distinct teas p50 | 1 | 1 | 1 |
| Special touch p50 | 29% | 29% | 15% |
| Special touch p90 | 36% | 33% | 20% |
| Depth ratio (FULL/CTRL p50) | 12/12 | 12/12 | 12/12 |
| Solver p95 | 10926ms | 901ms | 11126ms |
| State mult p95 | 41.0x | 3.8x | 40.4x |
| Doom | 0/100 | 0/100 | 0/100 |
| Domination | none | none | none (avoids special) |
| Novelty | none observed | none observed | handicap, not novelty |
| Verdict | **REJECT** | **REJECT** | **REJECT** |

## Winner / next step (§137–§138, §156–§157, §172–§173)

```text
G29 RESEARCH CLOSED — NO WINNER
```

Do not combine A/B/C; do not rescue by multiple specials, capacity
changes, compositions, or extra empties. Next research must use a
genuinely different axis. If compatibility is ever revisited, the
evidence constrains it hard: the exception must fire far more often than
5% of boards yet must not multiply the search frontier 40× — and must
offer more than forbidding ordinary pours.
