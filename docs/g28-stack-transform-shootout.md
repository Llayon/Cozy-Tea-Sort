G28 RESEARCH CLOSED — NO WINNER

# G28 — Stack Transformation Shootout

> Research only. No production merge, no rollout, no UI, no composition.

## Initial hypothesis (recorded before experiment, §129)

```text
A Underpour:
highest expected product value

B Reverse-on-Receive:
highest permutation power / domination risk

C Full-Flip:
lowest complexity but highest one-shot redundancy risk
```

Evidence below overrides this hypothesis.

## Source (§2, §144)

- Production main SHA: `f8781059343d7a851749e84e39b7a7e6f4fc5846`
- Branch: `spike/g28-stack-transform`
- Evidence commits: `research: screen g28 stack-transform contracts`,
  `research: probe stack-transform mechanics`,
  `docs: record g28 stack-transform verdict` (see `git log`)
- Worktree: `../Cozy-Tea-Sort-g28-stack-transform` (kept after review, §142)
- Original WIP before: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  10 status lines, diff SHA256
  `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d09a07869dbac749d`,
  diff bytes 37532, plus untracked `public/`, `PixelArtImage`, pixel-art files.
  Original directory untouched (no stash/reset/clean/checkout/merge/commit/rebase).
- Original WIP after: HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`,
  diff SHA256 `0626769aa317eb3128a3b1191bb04f135ec9bb8bdf9f192d09a07869dbac749d`,
  diff bytes 37532 — byte-identical to before. Same 5 modified files, same
  untracked files, no stash. Original directory untouched.

## G27 note (§3)

G27 was used for methodology only (staged funnel, control methodology,
causal metrics, fairness gates, WIP safety). No G27 code, kernel, or branch
is a dependency: G28 branches from production `origin/main` and implements
its own standalone kernel.

## G24 preflight (§4–§5, §57, §145)

Authoritative API: `src/game/logic/contractPreflight.ts` →
`analyzeTerminalAllocation` (reused, no second preflight).

Screen: `scripts/dev/g28-contract-screen.ts` — one shared topology for
A/B/C (4 terminal flex vessels cap4 ordinary finality + 1 special cap4
mustEndEmpty + 1 ordinary empty; 16 tea units, 4 colors × 4).

| Candidate | Terminal contract | G24 verdict | Witness |
|---|---|---|---|
| Underpour (A) | 4 flex cap4 + 2 empty | AlgebraicallyFeasible | explored=7 |
| Reverse Receive (B) | 4 flex cap4 + 2 empty | AlgebraicallyFeasible | explored=7 |
| Full Flip (C) | 4 flex cap4 + 2 empty | AlgebraicallyFeasible | explored=7 |

Order transforms never change terminal tea allocation, so no candidate was
rescued or re-topologized (§5, §158).

## Architecture (§10–§18, §146)

- Repository convention verified first (§23): index0 is BOTTOM,
  top = last index (`topLayerOf` returns `layers[len-1]`). CONTROL append is
  `[...existing, ...incoming]`.
- Research kernel: `src/game/logic/g28Research.ts` (never imported by
  production app paths).
- One pure seam: `g28TransformDestination(existing, layer, received,
  constraint)` — deterministic, no state. Transfer count, source
  extraction and destination legality are frozen before it runs:
  - A underpour → `[...incoming, ...existing]`
  - B reverse → `[...existing, ...incoming].reverse()`
  - C flip-when-full → reversed only on a nonfull→full transition,
    ordinary append otherwise
  - absent/invalid markers → ordinary append (unreachable via legal pours:
    malformed boards fail closed at legality).
- One apply truth (`applyPourState` — the seam replaces only the final
  destination-push loop), one count truth (`pourCountState` untouched), one
  solver (`solvePuzzle` via `canPourState` — no transform-specific solver).
- One machine reject code: `special-malformed`. Without G28 markers no new
  code can appear (legacy freeze).
- Static markers on `CupConstraint` (`underpour` / `reverseOnReceive` /
  `flipWhenFull`); `cloneCupConstraint` carries them; `cupConstraintSignature`
  appends `:UP` / `:ROR` / `:FF` only when present (plain normal still `N:_`).
- Malformed boards fail closed (`isG28BoardMalformed`): not-exactly-one
  valid special, sibling-marker mix, production specials, dynamic
  slots/tools, blend composition. Malformed vessels never satisfy victory.
- No new action, no mutable transform state (C re-arms derivedly from
  occupancy — proven in witness C5/C18), no new TeaId, no economy change.
- Pinned by tests: FULL transferCount == CONTROL transferCount and
  FULL source removal == CONTROL source removal for every same otherwise-
  legal action (A3/A4, B3/B4, C6/C7); legality identical FULL vs CONTROL on
  all 36 pairs (B21, C20); ordinary-destination apply parity (A9, B9, C9);
  source parity FROM special (A10, B10, C10).

## Direct witnesses (§58–§62, §147)

File: `tests/g28-stack-transform.test.ts` — 66 scenarios, all green
(22 per candidate; minimum was 15).

- A (underpour): empty receive identical (A1), nonempty reorder (A2),
  count/source/legality freeze (A3–A5), downstream divergence with exact
  transfer counts (A6: FULL top-run 1 vs CONTROL 3), homogeneous no-op (A8),
  ordinary parity both directions (A9/A10), Undo (A11), restart (A12),
  canonical `:UP` + legacy `N:_` freeze (A13), 4 malformed groups (A14–A17),
  finality both ways (A18), no mutable state + seam determinism (A19/A21),
  solver from→to (A20), addressing priority (A22).
- B (reverse): empty homogeneous identical (B1), full-stack reversal with
  exact layers (B2: CONTROL `[B,A,A]` vs FULL `[A,A,B]`), freeze trio
  (B3–B5), exposed-tea divergence with counts (B6: FULL B×1 vs CONTROL A×2),
  multi-layer burial change (B7), palindromic no-op (B8), parity (B9/B10),
  Undo/restart (B11/B12), `:ROR` + freeze (B13), malformed (B14–B16),
  finality (B17), derived repetition (B18/B20), solver (B19), 36-pair
  legality identity (B21), priority (B22).
- C (full-flip): non-filling receive ordinary (C1), fill→flip with exact
  layers (C2: CONTROL `[A,B,B,B]` vs FULL `[B,B,B,A]`), flipped-top sourcing
  (C3), homogeneous no-op (C4), drain→refill derived second flip with exact
  layers (C5: `[C,C,B,B]` vs `[B,B,C,C]`), no-counter seam checks (C18),
  freeze trio (C6–C8), parity (C9/C10), Undo/restart (C11/C12), `:FF` +
  freeze (C13), malformed (C14–C16), finality (C17), solver (C19), 36-pair
  identity (C20), priority (C21), all-candidate well-formedness (C22).

## N100 early probe (§65–§70, §123, §148)

Seed family `g28-probe-<i>` shared by A/B/C (§20). Evidence files:
`scripts/dev/out/g28-a-underpour-N100.json`,
`scripts/dev/out/g28-b-reverse-N100.json`,
`scripts/dev/out/g28-c-full-flip-N100.json`.

| Candidate | Solv | Broad causal | Strong causal | Ignored | p95 solver | State mult p95 | Verdict |
|---|---|---|---|---|---|---|---|
| A N100 | 100% | 0% | 0% (need ≥5%) | 100% | 403ms | 1.00 | **REJECT** |
| B N100 | 100% | 0% | 0% (need ≥5%) | 100% | 449ms | 1.00 | **REJECT** |
| C N100 | 100% | 0% | 0% (need ≥5%) | 100% | 711ms | 1.00 | **REJECT** |

- Raw boards 100, canonical starts 100, canonical strong 0 — for all three.
- Divergence 0 and strong divergence 0 everywhere; extraMoves p50 0;
  depth collapse 0; transform share p50 0.
- Special-touch share p50 27% / p90 33% / p95 36%: the special IS used as
  an ordinary mono-tea buffer — but never transformingly.
- Gate §66 requires broad causal ≥10% AND solver p95 ≤300ms AND no obvious
  domination. All three fail causality 0% (<10%, <5% strong) AND
  performance (403/449/711ms > 300ms). No N500 (§71).
- Follow-up diagnostics (`scripts/dev/g28-diagnostic.ts`,
  `g28-diagnostic2.ts`): optimal replays contain 100 into-empty and 100
  into-nonempty special receives per candidate — but ALL 100 into-nonempty
  receives are same-tea (top-matching), so every transform is a
  byte-identical no-op. Optimal play never mixes teas inside the special;
  the mechanic is present but never exercised. This is failure mode #1
  from §9 (mechanically present but non-causal), and per §67 a zero-strong
  candidate is REJECT as decorative.

## N500 pilot (§71–§93, §149)

No qualifiers (broad 0%, strong 0% for all). Not run — running later
stages on rejected candidates is explicitly forbidden (§94–§95, §158).

## N2000 confirmatory (§94–§100, §150)

No confirmatory qualifiers (§94). Not run.

## Fairness (§101–§105, §151)

No confirmatory survivors; 50-board fairness not run (tool retained:
`scripts/dev/g28-fairness.ts`). Observable N100 fairness signal: doom
0/100 and graph traps 0/100 for all candidates (100% solvable both FULL
and CONTROL) — fairness is healthy; causality is the killer, not traps.

## Domination (§80–§82, §152)

Mandatory question: *did the mechanic create a useful local
transformation, or did optimal play become routing most tea through the
special vessel?*

Neither: optimal play routes only ~27% (p50) of moves through the special
— below every domination line — because the special behaves exactly like
an ordinary empty buffer. There is no transformation to dominate with:
transform share p50 is 0%. The mechanic is decorative, not dominant.

## One-shot (§54–§55, §92–§93, §153)

Mandatory for C, useful for all: causal uses per board are 0/0/0;
repeated cycles 0; second flips 0. The identity does not persist beyond
one event because there is not even one event. C is not redundant with
Flask/Pair-Ready — it is weaker: those fire at least once, full-flip
never fires causally on optimal play.

## Tax analysis (depth §84–§86)

extraMoves p50 = 0 for all candidates (FULL minMoves == CONTROL minMoves
everywhere); depth collapse 0 boards; no choreography tax — consistent
with zero transform events (FULL and CONTROL optimal replays coincide).

## Quality gates (§133, §154)

- `bun install --frozen-lockfile`: PASS (114 packages).
- `bun run typecheck`: PASS (exit 0, incl. kernel, lib, probes, tests).
- Focused tests (G24 ×2 files + G28 witnesses): 111/111 PASS after changes;
  G24 `contract-preflight.ts --bench`: 21 scenarios green.
- Full `bun run test` diagnostic (canonical runner cannot return 0 in this
  environment): `tests/composition2-fastpath.test.ts` focused rerun
  (log: `scripts/dev/out/g28-quality-composition2-rerun.log`): 10/10
  assertions PASS, single error is the exact RPC signature. All other 167
  files executed directly in 12 sequential chunks (tails in
  `g28-quality-chunk-N.log`, `*.log` gitignored, worktree kept): 11 chunks
  exit 0; chunk 11 exits 1 SOLELY from the same RPC flake with all 188
  contained assertions green. Net: every assertion in all 168 files passes;
  canonical PASS not claimed per §134 (infra exits).
- `bun run build`: PASS.
- `GITHUB_PAGES=true bun run build`: PASS (exit 0).
- `bun run test:e2e:ci`: PASS — 33/33 (release journey, G19, G20, G21).
  E2E regenerated 16 screenshot PNGs under `scripts/dev/out/` (byte-size
  noise only, all comparisons passed); restored to HEAD to keep the
  worktree diff research-only.
- Bundle delta (production `index-*.js`): baseline 896285 B (measured on a
  clean `origin/main` worktree for this report) → research 898746 B =
  **+2461 B (+0.27%)**, inert (new branches execute only with G28 markers;
  legacy paths byte-identical).
- Infrastructure flakes: vitest RPC flake observed (see above); no other
  flakes.

## Limitations (§155)

- One fixed topology (4+1+1 vessels); no composition; deterministic
  tie-breaking; wall-clock machine dependence for solver timing; no UI; no
  production templates; no topology mining (failures stand as measured).

## Classification (§125)

- Underpour: **REJECT** (broad 0%, strong 0%, decorative per §67).
- Reverse Receive: **REJECT** (broad 0%, strong 0%, decorative per §67).
- Full Flip: **REJECT** (broad 0%, strong 0%, decorative per §67;
  one-shot analysis moot at zero events).

## Final comparison (§124)

| Metric | Underpour | Reverse Receive | Full Flip |
|---|---|---|---|
| Solvability | 100% | 100% | 100% |
| Broad causal | 0% | 0% | 0% |
| Strong causal | 0% | 0% | 0% |
| Canonical strong | 0 | 0 | 0 |
| Control divergence | 0% | 0% | 0% |
| Ignored | 100% | 100% | 100% |
| Special touch p50 | 27% | 27% | 27% |
| Transform share | 0% | 0% | 0% |
| Depth p50 (FULL/CONTROL) | 12/12 | 12/12 | 12/12 |
| Solver p95 | 403ms | 449ms | 711ms |
| State mult p95 | 1.00 | 1.00 | 1.00 |
| Doom | 0/100 | 0/100 | 0/100 |
| One-shot risk | n/a (0 events) | n/a (0 events) | n/a (0 events) |
| Domination | none | none | none |
| Novelty | none observed | none observed | none observed |
| Verdict | **REJECT** | **REJECT** | **REJECT** |

## No-winner next step (§157)

Do not combine A/B/C; do not rescue by multiple specials, capacity
changes, compositions, or extra empties. Next proposal must be a genuinely
different axis.
