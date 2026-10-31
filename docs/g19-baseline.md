# G19 baseline evidence (before implementation)

Source of truth: `origin/main` = `1a350ef345d73d7e3d476e2c0f1d6c82af26a548`
(G18 final merge). Worktree: `Cozy-Tea-Sort-g19-long-run`,
branch `feat/g19-long-run`. G18 oracle used unchanged:
`tests/fixtures/g18-rollout-snapshot.json` (source SHA
`f2d28287aa0f67e096309800d2224fa5ee574e81`, 1600 level hashes, 66 generated
samples).

## Original-tree WIP protection

The original tree (`D:\Programms\Max\Cozy-Tea-Sort`) contained the unrelated
pixel-art WIP. Its fingerprint before G19 work was:

- 11,027 files hashed (all non-`.git` files, SHA-256 per file)
- fingerprint file SHA-256:
  `0CF535E0F717FE5D63E273C02C3FF1ED6159402396138680AA7F8A99EEA8D5EE`

No stash/reset/clean/checkout/merge was performed in the original tree.

## Recurrence debt reproduction (current code, L1–L5000)

Command:

```bash
bunx tsx scripts/dev/g19-rollout-report.ts --from 1 --to 5000 \
  --out scripts/dev/out/g19-recurrence-baseline.json
```

Observed before implementation:

| Plan | First | Second | Last ≤5000 | Count ≤1600 | Max gap ≤1600 |
|---|---:|---:|---:|---:|---:|
| Shared Tray | 162 | 242 | 242 | 2 | 80 |
| Tea Pair | 250 | 330 | 330 | 2 | 80 |
| Frozen | 66 | 70 | 4970 | 18 | **240** |
| Thermos | 74 | 78 | 4966 | 20 | 88 |
| Cinnamon | 82 | 86 | 4962 | 18 | **236** |
| Tea Bloom | 90 | 94 | 4958 | 21 | 80 |
| Blend | 98 | 102 | 4946 | 21 | 80 |
| Serving Order | 106 | 110 | 4950 | 21 | 80 |
| Order+Tasting | 154 | 234 | 4954 | 19 | 80 |

Shared Tray has **no exposure after L242** and Tea Pair **no exposure after
L330** in the current long-run sample. Frozen and Cinnamon retain their
historical >112 gaps. This reproduces the G18 findings independently.

## Persistence clamp reproduction

Command:

```bash
bunx tsx scripts/dev/g19-persistence-audit.ts \
  --out scripts/dev/out/g19-persistence-baseline.json
```

Observed before implementation (`sanitizeLevel` cap 999):

| Case | Stored / input | Loaded after save |
|---|---|---:|
| current=1000, highest=1600 | `1000`, `1600` | current 999, highest 999 |
| current=1600, highest=1600 | `1600`, `1600` | current 999, highest 999 |
| highest=99999999 | `99999999` | highest 999 |
| complete 999 from 999 | `applyWin` | highest 1000 |
| complete 1000 from 1000 | `applyWin` | highest **1000** (no advance) |
| complete 1600 from 1600 | `applyWin` | highest **1000** |

The two failures are structural: both `currentLevel` and
`highestUnlockedLevel` route through the same 999 cap, so >999 progression
cannot round-trip.

## Freeze oracle

The G18 fixture is retained and never regenerated. G19 freeze tests compare
G19 output against the fixture for L1–L330 and all 40 generated samples
inside that prefix; 331+ is the documented intentional V2 boundary.
