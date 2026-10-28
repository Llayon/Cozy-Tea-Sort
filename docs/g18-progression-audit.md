# G18 — Progression & Difficulty Audit

Baseline source: `f2d28287aa0f67e096309800d2224fa5ee574e81` (G17 final).

Method: real `getLevelConfig` + `generateLevel` for all 1600 levels with
`g18-baseline:<level>:0`; secondary seed `:1` for pinned/sampled levels.
Difficulty is a **solver complexity signal**, not a subjective fun/hardness claim.

## Phase complexity (levels 1–330)

| phase | n | min | p50 | p95 | max |
|---|---:|---:|---:|---:|---:|
| warmup | 83 | 4 | 6 | 6 | 6 |
| challenge | 83 | 7 | 11 | 13 | 13 |
| peak | 82 | 10 | 14 | 17 | 18 |
| relax | 82 | 4 | 6 | 6 | 6 |

All 1600 primary generations: **1600/1600 template/retry paths**, fallback levels: none.

## Mechanic exposure table

| mechanic | first | second | exposures ≤330 | all ≤1600 | max gap | median gap | tutorial banners |
|---|---:|---:|---|---|---:|---:|---|
| teapot | 6 | 7 | 6, 7, 14, 15, 22, 30, 38, 46, 54, 118, 119, 126, 134, 142, 151, 182, 183, 190, 198, 206, 214, 215, 222, 247, 262, 270, 278, 279, 286, 294, 302, 311 | 168 levels | 64 | 8 | 1 (6) |
| targets | 10 | 11 | 10, 11, 14, 23, 31, 115, 138, 142, 147, 179, 211, 218, 222, 243, 275, 298, 302, 307 | 90 levels | 84 | 21 | 1 (10) |
| sink | 18 | 19 | 18, 19, 22, 39, 130, 134, 143, 175, 207, 210, 214, 239, 271, 290, 294, 303 | 88 levels | 91 | 19 | 1 (18) |
| tasting | 26 | 27 | 26, 27, 30, 107, 122, 126, 139, 154, 171, 202, 203, 206, 234, 235, 267, 282, 286, 299, 314 | 107 levels | 77 | 15 | 2 (26, 154) |
| lemon | 34 | 35 | 34, 35, 38, 47, 58, 62, 67, 83, 95, 103, 114, 118, 135, 167, 174, 194, 198, 199, 231, 254, 263, 274, 278, 295, 327 | 112 levels | 32 | 11 | 2 (34, 58) |
| strainer | 42 | 43 | 42, 43, 46, 55, 63, 75, 87, 131, 163, 186, 190, 195, 227, 259, 266, 270, 291, 323 | 89 levels | 44 | 21 | 1 (42) |
| honey | 50 | 51 | 50, 51, 54, 58, 59, 62, 71, 79, 91, 99, 111, 127, 159, 174, 178, 182, 191, 223, 254, 255, 258, 262, 287, 319 | 112 levels | 32 | 9 | 2 (50, 58) |
| frozen | 66 | 70 | 66, 70, 170 | 18 levels | 240 | 80 | 1 (66) |
| thermos | 74 | 78 | 74, 78, 166, 246, 326 | 20 levels | 88 | 80 | 1 (74) |
| cinnamon | 82 | 86 | 82, 86, 322 | 18 levels | 236 | 80 | 1 (82) |
| teaBloom | 90 | 94 | 90, 94, 158, 238, 318 | 21 levels | 80 | 80 | 1 (90) |
| blend | 98 | 102 | 98, 102, 146, 226, 306 | 21 levels | 80 | 80 | 1 (98) |
| servingOrder | 106 | 110 | 106, 110, 150, 154, 230, 234, 310, 314 | 40 levels | 76 | 4 | 2 (106, 154) |
| sharedTray | 162 | 242 | 162, 242 | 2 levels | 80 | 80 | 1 (162) |
| teaPair | 250 | 330 | 250, 330 | 2 levels | 80 | 80 | 1 (250) |

## Candidate difficulty spikes (1–330)

Rolling window = 7 same-phase neighbours; candidate = +3 or more solver moves above the phase-local median.

| level | phase | minMoves | local median | delta | mechanics |
|---:|---|---:|---:|---:|---|
| 43 | peak | 18 | 14 | +4 | strainer |
| 111 | peak | 17 | 14 | +3 | honey |
| 190 | challenge | 13 | 10 | +3 | teapot+strainer |
| 323 | peak | 17 | 14 | +3 | strainer |

## Candidate local drops (1–330)

These are not defects by themselves; they are relaxation/context signals.

| level | phase | minMoves | local median | delta | mechanics |
|---:|---|---:|---:|---:|---|
| 39 | peak | 10 | 13 | -3 | sink |
| 83 | peak | 12 | 16 | -4 | lemon |
| 143 | peak | 11 | 14 | -3 | sink |

## Contract checks

- Warmup cleanliness violations: **0**
- Relax special-mechanic violations: **0**
- Relax levels not cheaper than the immediately preceding level: **0** (context signal, not automatically a defect)
- Illegal challenge compositions: **0**
- Peak non-allowlisted mechanic leakage: **0**

## G16/G17 cadence

- **sharedTray**: first 162, second 242, exposures ≤330: 162, 242, all exposures ≤1600: 2, max gap 80.
  - Classification: **progression design debt** (mechanic disappears after the pinned repeats). G18 does not redesign rollout by default.
- **teaPair**: first 250, second 330, exposures ≤330: 250, 330, all exposures ≤1600: 2, max gap 80.
  - Classification: **progression design debt** (mechanic disappears after the pinned repeats). G18 does not redesign rollout by default.

## Persistence boundary note

The existing storage validator caps persisted levels at 999 (highest unlocked 1000).
G18 enumerates/generates 1–1600 for structural rollout audit, but changing the
progression boundary is product scope, so it is documented (M-07) and not altered.
No pinned/G14–G17 level is affected.

## Evidence files

- `scripts/dev/out/g18-rollout-baseline.json` — full 1–1600 rollout + generated topology hashes/canonical keys.
- `scripts/dev/out/g18-progression-1-330.csv` — per-level minMoves, phase, mechanics, rolling median.
- `scripts/dev/out/g18-progression-summary.json` — machine-readable exposure/spike/contract summary.

