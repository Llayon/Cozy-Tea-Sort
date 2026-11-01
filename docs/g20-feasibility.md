# G20 — Steeping Flask feasibility

Source base: `origin/main` `d9e582399a8685d71ef37b48ec8f742befbb4211`.

## Profiles

| Profile | Vessels | Flask start | Shape | Purpose |
|---|---:|---:|---|---|
| F0 | 6 | empty | 4,4,4,4,0,0 | preferred: player chooses the first tea |
| F1 | 6 | 1 layer | 4,4,4,3,1,0 | preloaded comparison |
| F7 | 7 | empty | 4,4,4,4,0,0,0 | roomy diagnostic |

All profiles: 4 colors × 4 = 16 tea units; no new TeaId.

## Results (offline shaped candidates, production solver/legality)

| Metric | F0 (2000) | F0 confirm (5000) | F1 (2000) | F7 (2000) |
|---|---:|---:|---:|---:|
| Solvable | 2000 (100%) | 5000 (100%) | 2000 (100%) | 2000 (100%) |
| Truncated | 0 | 0 | 0 | 0 |
| L1 (flask empty at win) | 2000 | 5000 | 2000 | 2000 |
| L2 | 860 (43.0%) | 2219 (44.4%) | 0 | 0 |
| Canonical L2 | 860 | 2219 | 0 | 0 |
| L3A clean decant | 860 | 2219 | 0 | 0 |
| L3B control breaks steeping | 850 | 2195 | 0 | 0 |
| L3C positive minMove delta | 565 | 1488 | 0 | 0 |
| Direct-ready | 0 | 0 | 0 | 0 |
| Partial release on optimal L2 | 0 | 0 | — | — |
| Rebrew | 0 | 0 | 0 | 0 |
| Depth p50/p95/max | 12 / 14 / 16 | 12 / 14 / 16 | 12 / 14 / 15 | 11 / 14 / 15 |
| Solver p50/p95/max ms | 47.5 / 87.3 / 138.1 | 58.6 / 109.2 / 166.5 | 14.9 / 36.7 / 75.2 | 381.8 / 821.9 / 1337.6 |
| Visited p50/p95/max | 1280 / 2219 / 2699 | 1292 / 2217 / 2856 | 436 / 943 / 1765 | 6199 / 12918 / 14214 |
| Commit timing p50/p95 | 0.167 / 0.308 | 0.167 / 0.333 | — | — |
| Commit→ready gap p50/p95 | 8 / 11 | 8 / 11 | — | — |
| Release shape | 4→0: all | 4→0: all | — | — |

F1 has zero L2 because the formal L2 definition requires an empty→partial
COMMIT event; F1 starts with tea already in the flask. F7 has zero L2
because the solver ignores the extra empty workspace/flask and solves the
ordinary board; it is less strategically relevant and much slower.

## Controls

- Plain control (remove only the flask marker, keep cap4 + mustEndEmpty):
  **18/18** bank templates use the would-be flask as a source while it holds
  1–3 layers.
- Control depth p50 **11** (range 8–13); positive steeping minMove delta on
  **14/18** bank templates.
- No-flask control (remove the flask vessel entirely): only **2/18** F0 bank
  templates remain solvable without it. F0 flask workspace is materially
  useful.
- F7 no-flask diagnostic: **100/100** sampled F7 boards solve without the
  flask (`g20-f7-noflask.json`); the extra vessel is ordinary workspace and
  the flask is strategically ignorable.

## Selection

**F0 selected.**

- solvability 100% ≥ 95% gate
- L2 density 44.4% far above 5%
- 2219 canonical L2 (≫30)
- clean-decant 100%, partial-release 0%
- commit timing p95 0.333 ≤ 0.60 preference
- commit→ready gap p50 8, p95 11 (≥2)
- solver p95 166.5 ms (above 150 preference, below 250 soft bound; no solver
  budget increase)
- no flask use in F7 optimal play → F7 rejected
- F1 loses emergent first-tea choice and its formal L2 is 0 → not selected

Evidence: `scripts/dev/out/g20-steeping-f0-2000.json`,
`g20-steeping-f0-5000.json`, `g20-steeping-f1-2000.json`,
`g20-steeping-f7-2000.json`, `g20-flask-control.json`.
