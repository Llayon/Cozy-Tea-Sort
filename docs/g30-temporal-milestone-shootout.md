# G30 — Temporal Milestone Shootout (research-only)

## 0. Verdict (to be finalized after N2000 + fairness)

TBD — one of:
- `G30 WINNER — BREW ONCE`
- `G30 WINNER — CHOICE BREW`
- `G30 WINNER — BREW SEQUENCE`
- `G30 RESEARCH CLOSED — NO WINNER`

## 1. Initial hypothesis (pre-registration)

- A Brew Once: best balance / moderate ritual risk.
- B Choice Brew: highest solvability / highest incidental-completion risk.
- C Brew Sequence: highest planning potential / highest tax and fairness risk.

Evidence overrides hypothesis.

## 2. Source

- origin/main SHA: `f8781059343d7a851749e84e39b7a7e6f4fc5846`
- branch: `spike/g30-temporal-milestone`
- worktree: `D:/Programms/Max/Cozy-Tea-Sort-g30-temporal-milestone`
- original WIP (untouched `D:/Programms/Max/Cozy-Tea-Sort`):
  - HEAD `7df1b672910af4b8ea7b9cb3ed59aa86e3351648`
  - status 10 lines (5 modified + public/ + 4 files)
  - diff SHA256 `0626769AA317EB3128A3B1191BB04F135EC9BB8BDF9F192D09A07869DBAC749D` (37532 bytes)
  - No stash/reset/clean/checkout/rebase/merge/commit inside original WIP.

## 3. G24 screen

All three candidates share terminal contract: special `mode=normal capacity=4 mustEndEmpty`
contributes `{}`; 5 ordinary vessels flexible (empty or full homogeneous 4).

| Candidate | Terminal contract | G24 verdict | Witness |
|---|---|---|---|
| Brew Once | special empty | AlgebraicallyFeasible | 5 flexible + 1 fixed empty, explored=11 |
| Choice Brew | special empty | AlgebraicallyFeasible | same, explored=11 |
| Brew Sequence | special empty | AlgebraicallyFeasible | same, explored=11 |

History does not alter tea inventory. No STOP.

## 4. Architecture

- `BrewMilestoneState { stage }` single history truth in `PuzzleState.brewMilestone` (absent = no mechanic).
- `BrewMilestoneContract` static: brew-once / choice-brew (unordered normalized) / brew-sequence (ordered).
- `advanceBrewMilestoneState(previous, nextCups, contract)` pure seam; called atomically inside `applyPourState`.
- One apply truth: `applyPourState` extended with optional 6th param (legacy callers identical tea transition).
- Canonical: legacy byte-identical when no contract + no milestone; else `||BRW:<sig>:<stage>`.
- Victory: tea finality + `mustEndEmpty` + stage complete; malformed/blend+brew fail closed.
- Undo restores stage exactly via `GameStateSnapshot.brewMilestone`; Restart re-inits stage0.
- Clone/normalize preserves milestone exactly when present; absent stays absent.
- Solver: same BFS, same budget/tie-break/pruning; optional `brewContract` threads stage through start/canonical/apply/victory. CONTROL has no history bit.

## 5. Direct witnesses

- `tests/g30-brew-once.test.ts`: 22 groups (partial, trigger, wrong-tea, drain persist, win gates, Undo/redo, canonical, parity, Restart, mustEndEmpty, freeze, clone, malformed, solver smoke, replay, no-second-pour).
- `tests/g30-choice-brew.test.ts`: 22 groups (A/B triggers, off-pair, drain, no-chosen-tea, Undo, canonical, unordered normalization, parity, win, mustEndEmpty, freeze, malformed, smoke, replay, Restart).
- `tests/g30-brew-sequence.test.ts`: 22 groups (stage0 A->1, B@0 stays, drain, B@1->2, A@1 stays, stage2 persist, final gates, Undo B/A, canonical 0/1/2, order identity, parity, malformed, mustEndEmpty, freeze, smoke, replay, Restart).

All green before N100.

## 6. N100 early probe (to be filled with tables)

See `scripts/dev/out/g30-*-N100.json`.

- A N100 (N=100, bothSolved=100): solvFull 100%, trunc 0, INTEGRATED 31%, REPLAN 76%, TAX_ONLY 0%, roundtrip 13%, late 64% (p50 0.909), postWork 0:54/1:11/2-3:21/4+:14, special p50 35.7%, delta p50 1, solver p95 155ms, stateMult p95 1.28. Gates pass (solv>=90, trunc0, p95<=300, integOrReplan>=10%, tax<80%).
- B N100 (N=100, bothSolved=100): solvFull 100%, INTEGRATED 48%, REPLAN 77%, TAX 0%, roundtrip 2%, incidental 2%, late 43% (p50 0.769), postWork 0:30/1:18/2-3:26/4+:26, special p50 33.3%, delta 1, solver p95 ~148ms. Gates pass.
- C N100 (N=100, bothSolved=100): solvFull 100%, INTEGRATED 2%, REPLAN 82%, TAX 0%, seqRitual 58%, late(first) 11% (p50_1 0.692, p50_2 0.929), interStage median 1, postWork 0:92/1:6/2-3:2/4+:0, special p50 46.2%, delta 3, solver p95 176ms, stateMult p95 1.49. Gates pass (replan>=10%), advances to N500 despite weak integration.

## 6b. N100 table (§133)

| Candidate | Solv | Integrated | Replan | Tax-only | milestone p50 | p95 solver | State mult | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Brew Once (N=100) | 100% | 31% | 76% | 0% | 0.909 | 155ms | p95 1.28 | advance (gates pass; late-ritual flag) |
| Choice Brew (N=100) | 100% | 48% | 77% | 0% | 0.769 | ~148ms | TBD | advance (gates pass) |
| Brew Sequence (N=100) | 100% | 2% | 82% | 0% | 0.692 → 0.929 | 176ms | p95 1.49 | advance on replan gate; weak integration noted |

See `scripts/dev/out/g30-*-N500.json`.

- A N500 (N=500, bothSolved=500): solv 100%, INTEGRATED 35.2% (req >=25% pass), REPLAN 77.6% (req >=15% pass), TAX 0% (req <50% pass), roundtrip 11.2%, late 59.6% (p50 0.857), postWork 0:233/1:73/2-3:106/4+:88, special p50 35.7%, delta 1, solver p95 138ms, stateMult p95 1.31. byTarget balanced (125 each; integ 40-48, replan 93-104). Qualifies for N2000. Timing red flag (p50 0.857 >0.70, late 60% >40%).
- B N500 (N=500, bothSolved=500): solv 100%, INTEGRATED 44.8% (req >=20% pass), REPLAN 77.8% (req >=15% pass), TAX 0% (pass), incidental 1.8% (req <60% pass, pref <40% pass), late 47% (p50 0.80), postWork 0:159/1:90/2-3:116/4+:135, special p50 35.7%, delta 1, solver p95 154ms, stateMult p95 1.39. byPair balanced (83-84 each; integ 32-42, incid 0-5). Qualifies.
- C N500 (N=500, bothSolved=500): solv 100%, INTEGRATED 2% (req >=20% FAIL), REPLAN 83% (pass), TAX 0% (pass), seqRitual 59%, interStage median 1 (req >=2 FAIL), postWork 0:461/1:28/2-3:11/4+:0, special p50 46.2%, delta 3, solver p95 170ms, stateMult p95 1.44. byOrder uniformly weak (integ 0-2 per order). FAILS N500 gates — rejected for N2000, no tuning.

## 8. N2000 confirmatory

Only qualifiers (A/B). See outputs.

- A N2000 (N=2000, bothSolved=2000): solv 100% (req >=95%, pref >=98% pass), INTEGRATED 35.65% (req >=25% pass; pref >=40% fail), REPLAN 78.2% (req >=15% pass; pref >=30% pass), TAX 0% (req <50% pass; pref <25% pass), roundtrip 9.45%, late 59.65% (p50 0.857; healthy pref p50<0.70 fail, late<40% fail), postWork 0:948/1:268/2-3:440/4+:344, special p50 35.7% (pref <35% marginal fail; p90 45.5% <55% pass), delta p50 1, solver p95 162ms (req <=250 pass), stateMult p95 1.32 (req <2.5 pass), max 1.92. byTarget balanced (500 each; integ 165-189, replan 380-398). Canonical strong: 713 integrated + 1564 replan (>=100 pass).
- B N2000 (N=2000, bothSolved=2000): solv 100% (req >=95%, pref >=98% pass), INTEGRATED 44.85% (req >=20% pass), REPLAN 76.9% (pass), TAX 0% (req <50% pass), roundtrip 1.95%, incidental 1.45% (req <60% pass), late 48.15% (p50 0.80; healthy pref p50<0.70 fail, late<40% fail but less severe than A), postWork 0:665/1:333/2-3:516/4+:486 (50.1% >=2 vs A 39.2%), special p50 35.7% (marginal; p90 44.4% pass), delta p50 1, solver p95 180ms (req <=250 pass), stateMult p95 1.38 (pass), max 1.91. byPair balanced (333-334 each; integ 133-163, incid 3-9). Canonical strong: 897 integrated + 1538 replan (>=100 pass).
- C N2000: not run (rejected at N500, per §92 no running rejected).

## 9. Fairness (50 boards, confirmatory survivors only)

Deterministic family `g30-fair-<i>`, FULL solver (brew-aware, stage carried into children).

- A fairness (N=50): legal root med 8 p90 8, constructive med 8 p90 8, solvable med 8 p90 8, optimal med 3, fatal med 0 p90 0, doom 0/50, windowTrap boards 0/50 (totalTraps 0).
- B fairness (N=50): legal med 8 p90 8, constructive med 8 p90 8, solvable med 8 p90 8, optimal med 4, fatal med 0 p90 0, doom 0/50, windowTrap boards 0/50 (totalTraps 0).

Both meet preferred (doom 0/50) and hard review (doom ≤2). No opaque missable windows detected (CONTROL-optimal → FULL-fatal traps = 0).

## 10. Tax analysis

Mandatory answer: did milestone change the sorting plan, or was it ceremony?

Classifier (conservative per §107): `F_filt`/`C_filt` = FULL/CONTROL pour sequences with milestone-vessel touches removed; TAX_ONLY requires exact `F_filt == C_filt` AND excursion contiguous (≤1 gap). INTEGRATED requires all four §61 conditions (pre-cleanup, postWork ≥2, non-roundtrip reintegration, diverged). REPLAN = diverged. Unproven cases → unknown (not inflated).

- A N2000: TAX_ONLY 0%, INTEGRATED 35.65%, REPLAN 78.2%, roundtrip 9.45%, delta p50 1, milestone p50 0.857 (LATE 59.65%), postWork 0:948/1:268/2-3:440/4+:344 (≥2: 39.2%), special p50 35.7%. Unknown ≈ 64% (mostly diverged-but-not-fully-integrated or same-plan-distributed-buffer). Late + weak post-work = ritual-tax red flag for the majority; strong integration proven for ~36%.
- B N2000: TAX_ONLY 0%, INTEGRATED 44.85%, REPLAN 76.9%, roundtrip 1.95%, incidental 1.45%, delta p50 1, milestone p50 0.80 (LATE 48.15%), postWork 0:665/1:333/2-3:516/4+:486 (≥2: 50.1%), special p50 35.7%. Unknown ≈ 55%. Ceremony minority; planning proven for ~45%.
- B incidental (§167): CONTROL-optimal replay triggers the allowed pair on only 1.45% of boards — the objective is not decorative; the player must plan which of the two to brew.
- C: SEQUENCE_RITUAL 59%, inter-stage median 1, postWork 92% zero — dominant back-to-back ritual; rejected.

## 11. Quality gates

- `bun install --frozen-lockfile`: PASS (114 packages).
- `bun run typecheck`: PASS (exit 0, before and after kernel).
- Focused G24 (`contract-preflight*.test.ts`): PASS before (45 tests) and after (with G30 direct: 111 tests total).
- Focused G30 direct: PASS (66 tests, 22 per candidate).
- Canonical full unit command (`bun run test`): BLOCKED/INFRA — 170 files registered (incl. new research-only G30 batch); run executed 14/77 batches (40 files, all green) then stopped at batch 14 (`G21 composition production stress`, `composition2-fastpath.test.ts` 10/10 passed on both attempts) on the known `Timeout calling "onTaskUpdate"` RPC flake twice in a row (spec §149). Assertions completed: all executed tests passed; no assertion failures. Focused rerun of the flaked file: PASS 10/10. G30 batch (77th) not reached in the full run; focused G30 run: 66/66 PASS. NOT claimed as canonical PASS (exit code 1, infra).
- `bun run build`: PASS (exit 0).
- `GITHUB_PAGES=true bun run build`: PASS (exit 0).
- `bun run test:e2e:ci`: PASS (33/33).
- Bundle delta: origin/main baseline dist 11 files / 1,199,383 bytes (index 896,285 bytes) vs G30 worktree 11 files / 1,203,735 bytes (index 900,539 bytes): **+4,352 bytes total (+0.36%), index +4,254 bytes (+0.47%)**. Additive kernel only (new `brewMilestone` module + optional params, no UI/production template/generator changes); production behavior without contract is byte-identical per legacy-freeze tests.

## 12. Limitations

Fixed topology, no composition, deterministic solver tie-breaking, wall-clock timing, no UI/production templates/topology mining.

## 13. Final comparison (N2000 A/B, N500 C)
| Metric | Brew Once (A) | Choice Brew (B) | Brew Sequence (C) |
|---|---:|---:|---:|
| Solvability | 100% (2000/2000) | 100% (2000/2000) | 100% (500/500) |
| Integrated | 35.65% | 44.85% | 2% |
| Replan | 78.2% | 76.9% | 83% |
| Tax-only | 0% (conservative) | 0% (conservative) | 0% (conservative) |
| Roundtrip ritual | 9.45% | 1.95% | n/a (sequenceRitual 59%) |
| Incidental (B) | — | 1.45% | — |
| Milestone timing p50 | 0.857 | 0.80 | 0.714 → 0.933 |
| Late milestone | 59.65% | 48.15% | 15.6% (first) |
| Post-milestone work ≥2 | 39.2% | 50.1% | 2.2% (post); inter-stage med 1 |
| Special touch p50 | 35.7% | 35.7% | 46.2% |
| Depth delta p50 | 1 | 1 | 3 |
| Solver p95 | 162ms | 180ms | 170ms (N500) |
| State mult p95 | 1.32 | 1.38 | 1.44 (N500) |
| Doom | 0/50 | 0/50 | not run (rejected) |
| Window traps | 0/50 | 0/50 | not run |
| Target distribution | balanced (165–189 integ/target) | balanced (133–163 integ/pair) | uniformly weak (0–2/order) |
| Verdict | HOLD/REJECT (timing) | WINNER candidate | REJECT |

Classification: A `HOLD` (passes hard gates incl. confirmatory integ/replan/tax/solv/fairness/perf, but fails healthy timing p50<0.70 + late<40% with 61% postWork ≤1 — late-ritual tax pattern per §143/§64); B `PASS` (passes all hard gates + healthy B profile §141; timing over preferred but B profile has no timing gate, ritual/incidental minimal, planning proven); C `REJECT` (fails N500 integ + inter-stage gates, dominant sequence ritual).

Winner ranking (§138): replan ~tie (A +1.3pp) → integration B+9pp → tax tie → ritual B (5x lower roundtrip) → solv tie → fairness B (optimal 4 vs 3, traps tie) → perf A marginally → mult A marginally → explainability/simplicity A marginally. Primary planning/ritual axes dominate: **Choice Brew ranks first**.
