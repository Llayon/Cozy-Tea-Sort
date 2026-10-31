# G19 — final report

## Source

1. Starting SHA: `1a350ef345d73d7e3d476e2c0f1d6c82af26a548` (`origin/main`,
   G18 final merge).
2. Ending SHA: **PENDING (post-merge)**.
3. Feature commits: **PENDING**.
4. PR: **PENDING**.
5. Files changed: see `git diff --stat` / PR; core files are
   `src/utils/difficultyCurve.ts`, `src/game/logic/progression.ts`,
   `src/App.tsx`, new G19 tests/fixtures/scripts/docs.
6. Worktree: `Cozy-Tea-Sort-g19-long-run`, branch `feat/g19-long-run`.
7. Original WIP fingerprint before/after: **PENDING after cleanup**
   (before: `0CF535E0F717FE5D63E273C02C3FF1ED6159402396138680AA7F8A99EEA8D5EE`,
   11,027 files).

## Freeze

8. G18 oracle: `tests/fixtures/g18-rollout-snapshot.json`, source SHA
   `f2d28287aa0f67e096309800d2224fa5ee574e81`, unchanged.
9. L1–330 semantic comparison: **330/330 identical**.
10. Generated baseline comparison: **40/40 G18 samples in the prefix exact**
    for canonical key, topology hash, minMoves, hidden counts, initial
    fingerprint and stats.
11. Unexpected differences: **0** in 1–330. L331–L333 also exact.
12. Intentional difference boundary: **L334** (first V2 challenge). Of the
    26 G18 samples above L330, 13 challenge samples changed intentionally;
    all 13 non-challenge samples stayed identical.

## V2 architecture

13. V1/V2 boundary: `ROLLOUT_V1_MAX_LEVEL = 330`,
    `ROLLOUT_V2_FIRST_CHALLENGE_LEVEL = 334`.
14. First V2 challenge: **L334 Frozen**.
15. Deck representation: typed `V2_CHALLENGE_DECK_IDS` + one
    `planFromV2Id` helper → `CHALLENGE_DECK_V2`; no 28 duplicated branches.
16. Deck length: 28 challenge slots / 112 level span.
17. Exact 28 slots: see `docs/g19-progression-report.md` and
    `V2_CHALLENGE_DECK_IDS`.
18. Slot formula: `((level - 334) / 4) % 28` with integer validation.
19. Compatibility validation: every slot checked against the existing
    `mechanicCompatibility.ts` validators and generated through the real
    production request path.
20. No second gameplay truth: the deck only selects existing plans; rules,
    capacities, compatibility, generator, solver and win conditions are
    unchanged.

## Recurrence

21–27. Full table in `docs/g19-progression-report.md`. Key results:
Shared Tray `162, 242, 338, 450, 562...`; Tea Pair
`250, 330, 374, 486, 598...`; all once-per-deck advanced plans have
steady-state max = 112 and median = 112 through L10000. Counts ≤2000/≤10000
are in the report table.

## Modern mechanics

28. Shared Tray: old 2 exposures (162,242) then none; new first V2 338,
    steady gap 112, 89 exposures through L10000.
29. Tea Pair: old 2 exposures (250,330) then none; new first V2 374,
    steady gap 112, 88 exposures through L10000.
30. Frozen: old max gap 240; first V2 334; boundary catch-up 164;
    steady gap 112.
31. Cinnamon: old max gap 236; first V2 382; boundary gap 60;
    steady gap 112.
32. Tea Bloom: old max gap 80; first V2 346; boundary 28; steady 112.
33. Thermos: old max gap 88; first V2 354; boundary 28; steady 112.
34. Blend: one challenge per 112 levels (`402, 514, 626...`), steady 112.
35. Order+Tasting: first V2 410, steady 112.

## Progression

36. Phase medians 331–2000: warmup 6, challenge 10, peak 13, relax 6
    (p50). p95: 6 / 13 / 17 / 6. Max: 6 / 15 / 18 / 6.
37. Challenge minMoves p50/p95: 10 / 13.
38. Peak minMoves p50/p95: 13 / 17.
39. Candidate spikes: 33 challenge / 43 peak in the local rolling report;
    documented as template-depth context, no rollout change made.
40. Warmup violations: 0 through L10000.
41. Relax violations: 0 through L10000.
42. Illegal challenge plans: 0 through L10000.
43. Peak leaks: 0 for V2 deck-only mechanics through L10000.
44. Tutorial repeats: 0 across all 28 recurring deck slots.

## Generation

45. L1–2000 generated: **2000/2000**.
46. Exceptions: **0**.
47. Fallbacks: **0**.
48. Long-range sample: **1241** levels (L2001–L10000), every deck slot and
    all phases included.
49. Per-mechanic success: all generated; watched mechanics 100% success.
50. Attempts: see `g19-generation-*` JSON; challenge template attempts 498,
    solver calls 537 for L1–2000.
51. Solver calls: 537 (L1–2000 challenge aggregate) + measured sample calls;
    no generation exception.

## Persistence

52. Old cap source: `Math.min(999, ...)` in `sanitizeLevel`.
53. New named max: `MAX_PERSISTED_LEVEL = 10_000`.
54. Rationale: covers L1–L10000, human-scale, bounded garbage input.
55. Sanitizer: floors, clamps `1..MAX`, preserves number/string parsing.
56. applyWin: `min(MAX, completed + 1)`, never MAX+1.
57. 999→1000: pass.
58. 1000→1001: pass.
59. 1599→1600: pass.
60. 1600 round-trip: exact.
61. 1600→1601: pass.
62. MAX−1→MAX: pass.
63. MAX completion: highest stays MAX.
64. Over-max clamp: safe.
65. Invalid handling: safe (NaN/Infinity/0/negative/garbage/null).
66. Legacy key sync: `cozy_tea_level` synchronized above 999.
67. ≤999 compatibility: unchanged loads.

## High-level UI

68. L999 display: usable at 360×800, 390×844, 430×932.
69. L1000 display: usable at all three; screenshot captured.
70. L1600 display: usable at all three; screenshot captured.
71. Mobile viewports: all three checked structurally; no overflow.
72. Recurrent Shared Tray screenshot: `g19-recurrence-L338.png`.
73. Recurrent Tea Pair screenshot: `g19-recurrence-L374.png`.
74. Tutorial absence on recurrence: verified in E2E and unit tests.

## Performance

75. V2 aggregate generator p50/p95/max: see watched table / `g19-generation`
    JSON (full challenge p50 21.69 / p95 122.76 / max 520.58 ms).
76. Solver p50/p95/max: challenge independent re-solve p50 21.84 /
    p95 120.54 / max 510.77 ms.
77. Blend: gen p50 192.73 / p95 520.58 / max 520.58 ms.
78. Shared Tray: gen p50 70.09 / p95 206.26 / max 206.26 ms.
79. Tea Pair: gen p50 10.67 / p95 17.88 / max 17.88 ms.
80. Bundle delta: main 874.09 kB vs 872.79 kB = +1.30 kB (+0.15%);
    total dist 1,177,179 B.
81. >15% regressions: none attributable to G19 (generator/solver unchanged).

## Tests

82. New test files: `tests/g19-rollout-v2.test.ts`,
    `tests/g19-recurrence.test.ts`,
    `tests/g19-persistence-boundary.test.ts`,
    `tests/g19-long-run-generation.test.ts`, `tests/g19-freeze.test.ts`.
83. Total test files: 152.
84. Discovery assignment: 152 discovered / 152 assigned / 0 duplicates /
    0 unassigned.
85. Unit run 1: **PASS** — 152/152 files, 69/69 batches, 1213 s.
86. Unit run 2: **PASS** — 152/152 files, 69/69 batches, 1163 s.
87. E2E run 1: **PASS** — 48/48 tests, 8.0 min.
88. E2E run 2: **PASS** — 48/48 tests, 8.0 min.
89. CI browser subset: PASS locally — 23/23 (release first-exposure
    subset + all G19 browser tests).
90. RPC retries: none; both full unit runs were clean on attempt 1.
91. Assertion failures: 0 in the final gates. One development-only G17
    count expectation was updated for the intentional L374 Tea Pair
    recurrence; it never weakened coverage.

## Quality

92. Typecheck: pass.
93. Build: pass (874.09 kB main).
94. Pages build: pass (874.10 kB main, `GITHUB_PAGES=true`).
95. Quality CI: **PENDING**.
96. Pages CI: **PENDING**.
97. Final SHA: **PENDING**.
98. Worktree removed: **PENDING** after merge.
99. WIP intact: **PENDING** final fingerprint.

## Limitations

- Historical boundary debt is separate from V2 steady-state behavior:
  Frozen keeps a 164-level catch-up gap before L334; Cinnamon’s old
  236-level gap is inside the frozen prefix. V2 cadence is 112.
- Physical-device verification was not performed; mobile evidence is
  Playwright at 360×800 / 390×844 / 430×932.
- Recurrence metrics do not prove subjective retention or fun.
