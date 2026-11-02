# G21 — final report

## Source

1. Start SHA: `2288260a5ec9e7053c678229bc1f567fe73588fc` (G20 final).
2. End SHA: **PENDING post-merge**.
3. Commits: **PENDING**.
4. PR: **PENDING**.
5. Files: **PENDING PR stat**.
6. Worktree: `Cozy-Tea-Sort-g21-composition-ii`.
7. WIP fingerprint before: `0CF535E0F717FE5D63E273C02C3FF1ED6159402396138680AA7F8A99EEA8D5EE`;
   after: **PENDING cleanup**.

## Research matrix

| Candidate | N | Solv % | C2 % | Canon C2 | C3 % | Canon C3 | C3X % | C4 | Solver p95 | State mult p95 | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| A Flask+Order | 5000 | 100 | 20.54 | 1027 | 6.84 | 342 | 16.94 | 0 | 308 ms | 1.15 | DEFER |
| B Tray+Order | 5000 | 100 | 24.70 | 1235 | 5.40 | 270 | 20.52 | 0 | 257 ms | 1.63 | DEFER |
| C6 Pair+Tasting | 1000 | 0.9 | 0.1 | 1 | 0 | 0 | 0 | 0 | 5 ms | 1.00 | HOLD |
| C7 Pair+Tasting | 1000 | 100 | 14.30 | 143 | 0 | 0 | 0 | 0 | 839 ms | 1.00 | HOLD |
| D6 Flask+Pair | 5000 | 95.2 | 41.84 | 2090 | 0 | 0 | 0 | 0 | 20 ms | 1.00 | DEFER |
| D7 Flask+Pair | 1000 | 100 | 5.00 | 50 | 0 | 0 | 0.4 | 0 | 1674 ms | 1.00 | HOLD |
| E6 Flask+Tray | 5000 | 100 | 91.30 | 4564 | 41.60 | 2080 | 65.54 | 0 | 214 ms | 1.06 | **SHIP** |
| E7 Flask+Tray | 1000 | 100 | 0 | 0 | 0 | 0 | 0 | 0 | 4729 ms | — | HOLD |

C4 is zero everywhere; C3 is the decisive interaction gate. D6 has high C2
but zero C3/C3X: both mechanics are active, yet single-mechanic plans
survive unchanged. It is coexistence, not interaction.

## Winner

28. **E6 FLASK_TRAY**: steeping flask + shared tray, separate vessels.
29. It beats the other passing candidates on C2 density (91.3% vs 20–25%),
   C3/C3X (41.6%/65.5% vs 4–7%/17–21%), simpler state multiplier (1.06 vs
   1.15–1.63), and lower solver p95 than A (214 vs 308 ms). B is healthy but
   E6 dominates interaction density and state cost.
30. Topology: 4c/6v `4,4,3,3,2,0`; tray [2,3] at 6/6; flask [5] empty;
   ordinary cups 4/4 at 0,1 and 2 at 4; no ordinary empty.
31. Interaction identity: FULL optimal replay must complete the G20 flask
   cycle (commit/pressure/ready/clean decant/empty) and the G16 tray cycle
   (pressure/release/refill); both controls are invalidated on 65.5% of
   boards.
32. Compatibility: only `sharedTray+steepingFlask` promoted to
   `sameLevel: allow`, sameCup forbid. All other policies unchanged.

## Bank

33. 12 canonical templates.
34. 12 canonical distinct, depth 10–14 (p50 12, p95 14).
35. C2 12/12.
36. C3 12/12.
37. C3X 12/12.
38. Depth band 10–14.
39. 6 deterministic role permutations per template, all C2 in band.
40. Fixed E6 special positions; generator does not randomly move them.
41. Fallback `flask-tray-10-23`, depth 10, exact composition and C2.

## Winner mechanics

- Order: n/a.
- Flask: 12/12 clean decant, no partial-release requirement; commit timing
  tested by bank replay.
- Tray: 12/12 pressure/release/refill; cross-member reuse curated.
- Pair/tasting: n/a.
- Fairness: 50/50 root constructive, 50/50 solvable first, 50/50 optimal
  first, 0 fatal first moves / 300, 0 doomed.

## Generator

42. Exact matcher requires `steepingFlaskCount=1` + `sharedTrayCount=1` and
    rejects every third special; standalone matchers guard both ways.
43. 200 production seeds: attempts p50/p95 1/1, max 1.
44. Solver calls p50/p95 1/1.
45. Fallbacks 0/200.
46. Distinct starts 137/200.
47. Standalone flask/shared matchers return null for the combo; no generic
    “any two” engine.

## UX

48. Existing tray plank + six markers and flask carafe coexist; no combo badge.
49. Tutorial: «На подносе по-прежнему всего 6 мест. Из заварочной колбы
    можно переливать только когда она полная.» at L874 only.
50. Subtitle: «Колба + поднос • 6 сосудов».
51–53. 360×800 / 390×844 / 430×932 green; screenshots
    `g21-flask-tray-L874-{360x800,390x844,430x932}.png`.
54. Rapid partial-flask taps create no move.
55. Undo exact.
56. Restart exact.
57. Reshuffle preserves the winner composition and fresh seed.

## Rollout

58. G20 frozen L1–873 exactly.
59. V4 boundary L782; two complete V3 decks preserved.
60. First actual difference L874.
61. First combo L874.
62. Second combo L986.
63. Cadence 112.
64. 10 complete V4 decks verified.
65. Warmup/relax clean.
66. Peak unchanged; no combo.
67. L1–10000 structural audit: combo only challenge slots `874 + 112n`.

## Performance

68. Generator p50 101.48 / p90 184.47 / p95 191.19 / max 254.40 ms.
69. Solver p50 101.05 / p95 188.59 / max 226.12 ms.
70. Visited p50 2424 / p95 4183 / max 4183.
71. State multiplier p50 0.92 / p95 1.11 / max 1.11.
72. Bundle 896.28 kB vs G20 887.67 kB = **+8.61 kB (+0.97%)**, below 1%.

## Tests

73. New unit files: 6 (`composition2-*`).
74. Total unit files: 165.
75. Discovery: 165/165, 0 duplicate, 0 unassigned.
76–80. Compatibility, templates, fastpath 200 seeds, undo/view, rollout,
    legacy regression — green.
81. Local unit run1: 165/165, 1302 s.
82. Unit run2: CI PR/main full gate.
83. Local full E2E run1: 57/58 (known unrelated `Execution context was
    destroyed` navigation flake in release-journey L162; G21 spec 5/5).
84. Local full E2E run2: **58/58 clean**; run3: **58/58 clean**;
    G21 spec 5/5 in every run. Run1 was 57/58 with the known unrelated
    release-journey navigation flake.
85. CI browser: **PENDING**.

## Quality

86. Typecheck: passed local.
87. Build: passed.
88. Pages build: passed.
89–91. Preview/quality CI/Pages CI: **PENDING**.
92. Final SHA: **PENDING**.
93. Worktree removed: **PENDING**.
94. WIP intact: **PENDING after**.

## Limitations

- Physical-device QA not performed; Playwright only.
- Local full G21 E2E reproduced the same pre-existing `Execution context
  was destroyed` navigation flake in an unrelated release-journey test; G21
  spec passed in every run and PR/main CI browser gates remain authoritative.
- Local full unit gate may be memory-limited; exact CI full unit is the
  repeat authority.
- B/G21 A/B/D6/D7/C7 evidence is research-only; only E6 is production.
- C4 = 0 for the winner; interaction is plan/structure-driven, not +2 move
  cost.
