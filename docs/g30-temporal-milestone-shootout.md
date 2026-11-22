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

## 7. N500 pilot

See `scripts/dev/out/g30-*-N500.json`.

## 8. N2000 confirmatory

Only qualifiers (A/B). See outputs.

## 9. Fairness (50 boards, confirmatory survivors only)

See fairness runs.

## 10. Tax analysis

Mandatory answer: did milestone change the sorting plan, or was it ceremony?

## 11. Quality gates

To be reported explicitly.

## 12. Limitations

Fixed topology, no composition, deterministic solver tie-breaking, wall-clock timing, no UI/production templates/topology mining.
