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

## 7. N500 pilot

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

See fairness runs.

## 10. Tax analysis

Mandatory answer: did milestone change the sorting plan, or was it ceremony?

## 11. Quality gates

To be reported explicitly.

## 12. Limitations

Fixed topology, no composition, deterministic solver tie-breaking, wall-clock timing, no UI/production templates/topology mining.
