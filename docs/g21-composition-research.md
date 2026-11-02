# G21 — Modern Mechanic Composition II / «Смешанные чаепития II»

Research-first composition study. No new standalone mechanic, action, TeaId,
vessel role, PuzzleState row, transition, solver or capacity rule. At most
one composition shipped.

Source: `origin/main` `2288260a5ec9e7053c678229bc1f567fe73588fc` (G20 final).
All counts below use production rules/solver/canonicalization; the DEV
harness is `scripts/dev/composition2-search.ts`. Controls run only for C2
boards, following G15.

## Candidates

| ID | Composition | Profile | Topology | Initial lengths |
|---|---|---|---|---|
| A6 | Flask + Order | F0/O6 | 4c/6v | 4,4,4,4,0,0 |
| B6 | Shared Tray + Order | T6 | 4c/6v | 4,4,3,3,2,0 |
| C6 | Tea Pair + Tasting | P6 | 4c/6v | 2,2,4,4,4,0 |
| C7 | Tea Pair + Tasting | P7 | 4c/7v | 2,2,4,4,4,0,0 |
| D6 | Flask + Tea Pair | F6 | 4c/6v | 2,2,4,4,4,0 |
| D7 | Flask + Tea Pair | F7 | 4c/7v | 2,2,4,4,4,0,0 |
| E6 | Flask + Shared Tray | E6 | 4c/6v | 4,4,3,3,2,0 |
| E7 | Flask + Shared Tray | E7 | 4c/7v | 4,4,3,3,2,0,0 |

## Pilot (1000 shaped profiles)

| Profile | Solv % | C2 % | Canon C2 | C3 % | C3X % | Solver p95 | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| A6 | 100 | 20.5 | 205 | 6.9 | 16.5 | 294 ms | expand |
| B6 | 100 | 25.0 | 250 | 4.3 | 20.5 | 191 ms | expand |
| C6 | 0.9 | 0.1 | 1 | 0 | 0 | 5 ms | HOLD |
| C7 | 100 | 14.3 | 143 | 0 | 0 | 839 ms | HOLD |
| D6 | 94.9 | 40.0 | 400 | 0 | 0 | 15 ms | expand |
| D7 | 100 | 5.0 | 50 | 0 | 0.4 | 1674 ms | HOLD |
| E6 | 100 | 91.6 | 916 | 41.9 | 65.1 | 181 ms | expand |
| E7 | 100 | 0 | 0 | 0 | 0 | 4729 ms | HOLD |

Pilot expansion gate: solvability ≥90%, no truncation, C2 ≥3%,
canonical C2 ≥30, non-catastrophic solver. C6 fails solvability; C7/D7
fail performance and C3; D7 C2 low. A/B/D6/E6 expanded.

## Confirmatory (5000 shaped profiles)

| Metric | A6 | B6 | D6 | E6 |
|---|---:|---:|---:|---:|
| Solvable | 5000 | 5000 | 4760 | 5000 |
| Truncated | 0 | 0 | 0 | 0 |
| L1 full win | 5000 | 5000 | 4760 | 5000 |
| C2 | 1027 | 1235 | 2092 | **4565** |
| C2 rate | 20.54% | 24.70% | 41.84% | **91.30%** |
| Canonical C2 | 1027 | 1235 | 2090 | **4564** |
| C3 | 342 | 270 | 0 | **2080** |
| C3 rate | 6.84% | 5.40% | 0% | **41.60%** |
| Canonical C3 | 342 | 270 | 0 | **2080** |
| C3X | 847 | 1026 | 0 | **3277** |
| C3X rate | 16.94% | 20.52% | 0% | **65.54%** |
| C4 | 0 | 0 | 0 | 0 |
| One-sided invalidation | 173 | 189 | 672 | 1265 |
| Depth p50/p95/max | 12/14/16 | 12/13/14 | 13/15/17 | 12/14/16 |
| Solver p50/p95/max | 165/308/449 ms | 137/257/362 ms | 9/20/40 ms | 116/214/337 ms |
| Visited p50/p95 | 3028/5093 | 2251/3855 | 207/378 | 2392/3950 |
| State multiplier p50/p95 | 0.99/1.15 | 1.26/1.63 | 0.83/1.00 | **0.86/1.06** |
| C3X canonical | 847 | 1026 | 0 | 3277 |

C4 is zero for every candidate: all controls have the same or nearly the
same optimal depth; the modern interactions are mostly **plan/structure**
effects, not +2 move cost. This is reported as bonus evidence only.

## Candidate verdicts

- **E6 FLASK_TRAY — SHIP.** Only candidate with very high C2 density,
  strong C3/C3X, healthy 6-vessel topology, low state multiplier, solver
  p95 214 ms, and 0/50 doom in fairness. First combo L874.
- **A6 FLASK_ORDER — DEFER.** C2/C3 pass, but lower density and solver
  p95 308 ms crosses the >300 review line; E6 dominates. Preserve research.
- **B6 TRAY_ORDER — DEFER.** C2/C3 pass and state multiplier 1.63, but
  lower C3 density than E6 and a higher state multiplier; E6 dominates.
- **D6 FLASK_PAIR — DEFER.** C2 41.8%, but C3 = C3X = 0. Both mechanics
  are active yet single-mechanic plans survive unchanged: coexistence, not
  interaction. Do not ship.
- **C7 PAIR_TASTING — HOLD.** C3 = C3X = 0 and solver p95 839 ms; 7-vessel
  roomy topology makes tasting ordinary workspace.
- **C6 PAIR_TASTING — HOLD.** 0.9% solvability; no ordinary empty.
- **D7 FLASK_PAIR — HOLD.** C2 5%, C3 0, C3X 0.4%, solver p95 1674 ms.
- **E7 FLASK_TRAY — HOLD.** 100/100 solvable but C2 = 0; solver p95 4729 ms.
  The roomy extra empty makes both mechanics independently ignorable.

## Winner: E6 FLASK_TRAY

Topology: 4 colors / 6 vessels, lengths `4,4,3,3,2,0`.

- tray members: indices 2 and 3 (3+3 = 6/6 shared budget);
- steeping flask: index 5, empty, cap4, must end empty;
- ordinary cups: 0,1 full mixed; 4 is a normal mixed length-2 cup;
- no ordinary empty vessel.

Optimal replay must exercise:

```text
flask: COMMIT → STEEPING_PRESSURE → READY 4/4 → CLEAN_DECANT → EMPTY
tray:  SHARED_PRESSURE → GROUP_RELEASE → GROUP_REFILL
both:  FULL win
```

Fairness (50 representative curated boards): root constructive 50/50,
solvable first 50/50, optimal first 50/50, **0 fatal first moves / 300**,
**0 doomed candidates**.

## Production promotion

Only `mechanicCompatibility('steepingFlask','sharedTray')` is promoted to
`sameLevel: allow`, `sameCup: forbid`. Other G20/G16/G17 verdicts are
unchanged. Production bank: 12 canonical E6 templates, depth 10–14, 12/12
C2, 12/12 C3/C3X, 6 role permutations each. The bank is in
`steepingFlaskSharedTrayTemplates.ts`.

## Raw evidence

`scripts/dev/out/g21-{A6,B6,C6,C7,D6,D7,E6}-1000.json`,
`g21-{A6,B6,D6,E6}-5000.json`, `g21-flask-tray-fairness.json`,
`g21-flask-tray-perf.json`, `g21-generation-*`.

No other G21 candidate is production-enabled. Blend, Mystery, triple
compositions and all non-listed pairs remain out of scope.
