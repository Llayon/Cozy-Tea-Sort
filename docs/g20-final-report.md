# G20 — final report

## Source

1. Starting SHA: `d9e582399a8685d71ef37b48ec8f742befbb4211` (G19 final).
2. Ending SHA: **PENDING post-merge**.
3. Feature commits: **PENDING**.
4. PR: **PENDING**.
5. Files changed: see PR; core: `src/game/types.ts`,
   `src/game/logic/rules.ts`, `src/game/logic/generator.ts`,
   `src/game/logic/steepingFlaskTemplates.ts`,
   `src/game/logic/mechanicCompatibility.ts`,
   `src/utils/difficultyCurve.ts`, `src/game/view/TeaSortView.ts`,
   `src/game/ui/tutorials.ts`, `src/App.tsx`, plus G20 tests/scripts/docs.
6. Worktree: `Cozy-Tea-Sort-g20-steeping-flask`.
7. WIP fingerprint before: `0CF535E0F717FE5D63E273C02C3FF1ED6159402396138680AA7F8A99EEA8D5EE`
   (11,027 files). After: **PENDING cleanup verification**.

## Architecture

8. Static field: `CupConstraint.steepingFlask?: boolean`.
9. Valid constraint: normal / cap4 / mustEndEmpty / marker only.
10. Readiness helper: `isSteepingFlaskReady(layers, constraint)`.
11. No dynamic ready state anywhere in `PuzzleState`.
12. Clone copies the marker; canonical suffix `:SF`; absent marker leaves
    legacy keys byte-identical.
13. One pour truth (`applyPourState`), one solver, one source gate in
    `pourRejectCodeState`.
14. Compatibility: standalone production; Blend + Flask forbid/forbid;
    Shared/Pair/Order/Tasting/Mystery/Honey/Strainer research/forbid same cup.
15. Malformed flask constraints fail closed for readiness, source and victory.

## Rules

16. Empty flask source → `source-empty`.
17. Partial/full-mixed source → `source-steeping-not-ready`.
18. Ready full homogeneous source → ordinary maximal transfer.
19. Empty/partial inflow → ordinary rules; wrong color → `color-mismatch`.
20. Partial release legal; automatic derived relock.
21. Must end empty; full homogeneous flask is not final.
22. Clean decant 4→0 legal and constructive.
23. Addressing/role/empty precedence preserved.

## Feasibility

| Metric | F0 2000 | F0 5000 | F1 2000 | F7 2000 |
|---|---:|---:|---:|---:|
| Solvability | 100% | 100% | 100% | 100% |
| Truncated | 0 | 0 | 0 | 0 |
| L1 | 2000 | 5000 | 2000 | 2000 |
| L2 | 860 (43.0%) | 2219 (44.4%) | 0 | 0 |
| L3A clean | 860 | 2219 | 0 | 0 |
| L3B control break | 850 | 2195 | 0 | 0 |
| L3C delta | 565 | 1488 | 0 | 0 |
| Partial release | 0 | 0 | — | — |
| Depth p50/p95/max | 12/14/16 | 12/14/16 | 12/14/15 | 11/14/15 |
| Solver p50/p95 ms | 47.5/87.3 | 58.6/109.2 | 14.9/36.7 | 381.8/821.9 |

F0 selected. F1 loses emergent first choice and has no formal empty→partial
commit; F7 solver ignores the flask and is much slower. Full evidence:
`scripts/dev/out/g20-steeping-f0-*.json`, `g20-steeping-f1-2000.json`,
`g20-steeping-f7-2000.json`, `g20-flask-control.json`.

## Bank

18 canonical F0 templates, depth band 9–14. All 18: exact depth, L2,
clean decant, no partial release. 18/18 control-break, 14/18 positive
minMove delta, 6 role permutations each. Fallback = first bank template,
exact depth and clean cycle. Committed TeaRole diversity = 4.
Commit timing: 18/18 ≤0.60 (p50 0.167, p95 0.333); commit→ready gap
18/18 ≥2 (17/18 ≥4; range 3–11).

No-flask control: only 2/18 F0 templates remain solvable without the flask
workspace; F7 diagnostic is 100/100 without the flask, confirming that F7
is ordinary workspace rather than a meaningful flask topology.

## Generator

`steepingFlaskCount` 0/1; standalone F0 fast path; 4 bounded attempts.
200 production seeds: 200/200, 0 exceptions, 0 fallbacks, 157 distinct
starts, depth p50 11/p95 13, attempts p50 1/p95 2, solverCalls p50 1/p95 2.
L1–2000 audit: 2000/2000, 0 exceptions, 0 fallbacks. Long-range sample
1241 levels: 0/0. Phase medians L1–2000: warmup 6, challenge 10
(p95 13), peak 13 (p95 17), relax 6. Flask plan levels ≤2000: 13,
depth p50 11/p95 13, 0 fallback. Evidence `g20-generation-*`.

## UX

Slender glass carafe; empty open receiving cue; partial stopper + contained
steam; ready lifted stopper + warm bloom; rejection «Сначала наполни колбу
до краёв». Help explains partial-release relock. Tutorial appears once at
L558. Screenshots: `g20-flask-L558-{empty,partial,ready}.png`; 360/390/430
layouts green. All HUD controls remain ≥44px.

## Rollout V3

- G19 frozen through L557: G18 1–330 + G19 331–557 exact.
- L555 peak / L556 relax / L557 warmup unchanged.
- L558 first Flask; deck 28 slots / 112 levels.
- Flask 558, 670, 782, 894…
- Shared Tray 566, 678, 790…
- Tea Pair 602, 714, 826…
- Blend 630, 742, 854…
- Order+Tasting 638, 750, 862…
- 10 full V3 decks / 280 slots verified; no Flask in other phases; no
  unsupported composition; tutorial only at first exposure.
- V3 snapshot: `tests/fixtures/g20-rollout-v3-snapshot.json`.

## Performance

200 production seeds: generator p50 39.30 / p90 115.87 / p95 127.83 /
max 298.81 ms; solver p50 33.15 / p95 72.10 / max 94.11 ms; visited p50
810 / p95 1711 / max 1711; fallbacks 0. Bundle: main JS 887.67 kB vs G19
874.09 kB = **+13.58 kB (+1.55%)**, slightly above the preferred <1%
target; no heavy dependency was added.

## Tests / quality

New files: 7 unit + 1 E2E (`steeping-flask*.test.ts`,
`e2e/g20-steeping-flask.spec.ts`). Total test files: **159**; discovery
assignments: 159/159, 0 duplicates/unassigned. Existing G18/G19 freeze,
tutorial, rollout tests updated only at the explicit V3 boundary.

- Typecheck: **PENDING final**.
- Unit: **PENDING final**.
- Full E2E: **PENDING final**.
- CI browser subset: **PENDING final**.
- Build / Pages build: **PENDING final**.
- Quality CI / Pages CI / final SHA / worktree cleanup: **PENDING**.

## Limitations

- F0 solver p95 is 109 ms in feasibility and 72 ms in production; no solver
  budget increase.
- Physical-device QA was not performed; mobile evidence is Playwright.
- The bank uses a stable flask slot (last vessel) for readability rather
  than random position diversity.
- Recurrence metrics do not prove subjective retention/fun.
