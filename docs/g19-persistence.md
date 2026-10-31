# G19 — persistence beyond 999

## Old behavior

`src/game/logic/progression.ts` capped every sanitized level at `999`:

```ts
Math.max(1, Math.min(999, Math.floor(value)))
```

`saveProgress()` routes **both** `currentLevel` and
`highestUnlockedLevel` through that sanitizer, and `applyWin()` did not clamp
`completed + 1`. Consequences on the G18 baseline:

- saving `currentLevel = 1000` stored `999`;
- saving `highestUnlockedLevel = 1600` stored `999`;
- completing L999 produced highest 1000 in memory but could not persist it
  faithfully after reload;
- completing L1000 or L1600 could not advance beyond the stored 999 cap.

Reproduction evidence: `scripts/dev/out/g19-persistence-baseline.json`.

## New named bound

```ts
export const MAX_PERSISTED_LEVEL = 10_000;
```

Rationale: 10,000 comfortably covers the audited L1–L10000 rollout, keeps
progression human-scale, and prevents garbage localStorage values from
creating absurd progression. The game does not claim 10,000 handcrafted
levels; these are deterministic procedural levels.

The value lives in one source (`src/game/logic/progression.ts`). No active
product `999` cap remains. Historical G18 fixtures/docs that mention 999 are
explicit compatibility evidence and are kept.

## Sanitizer contract

`sanitizeLevel(n, fallback = 1)`:

- accepts the existing number/string input surface (`parseInt` semantics
  unchanged);
- valid domain is `1..MAX_PERSISTED_LEVEL`;
- floors numeric values;
- clamps over-max values to 10,000;
- clamps zero/negative to 1;
- returns a bounded fallback for `NaN` / `Infinity` / garbage;
- always returns an integer.

Examples: `999 -> 999`, `1000 -> 1000`, `1600 -> 1600`,
`10001 -> 10000`, `99999999 -> 10000`, `-1 -> 1`, `NaN -> 1`.

## applyWin boundary

`applyWin` now computes:

```ts
const completed = sanitizeLevel(completedLevel);
const nextUnlock = Math.min(MAX_PERSISTED_LEVEL, completed + 1);
const highest = Math.max(sanitizeLevel(prev.highestUnlockedLevel), nextUnlock);
```

Therefore:

- completing 999 unlocks 1000;
- completing 1000 unlocks 1001;
- completing 1599 unlocks 1600;
- completing 1600 unlocks 1601;
- completing 9999 unlocks 10000;
- completing 10000 keeps highest at **10000** forever (no 10001 leak);
- replaying an old level never regresses highest.

`current = 10000` is playable; `currentLevel + 1` is never naturally
unlocked or started beyond the product bound.

## Storage keys and legacy compatibility

No migration was introduced. Keys are unchanged:

- `cozy_tea_current_level`
- `cozy_tea_highest_unlocked`
- `cozy_tea_level` (legacy mirror of highest)
- recipe/skin/mute keys unchanged

`saveProgress({ highestUnlockedLevel })` still synchronizes the legacy
`cozy_tea_level` key, including above 999. Existing saves with values ≤999
load identically. A legacy-only save (`cozy_tea_level = 1200`, no highest
key) now correctly boots at 1200 instead of clamping to 999.

No backend, database or Telegram-specific persistence source exists in this
repository; only localStorage was audited.

## Load invariant

After `loadProgress()`:

```text
1 <= currentLevel <= highestUnlockedLevel <= MAX_PERSISTED_LEVEL
```

- stored `current=1600, highest=1500` clamps current to 1500;
- stored `highest > MAX` clamps to MAX;
- stored `current > MAX` clamps to MAX;
- `NaN` / `Infinity` / `0` / negative / garbage strings fall back safely;
- storage unavailable or throwing `getItem`/`setItem` never crashes the
  app; progression falls back in memory.

## Test matrix

`tests/g19-persistence-boundary.test.ts` covers:

| Case | Expected |
|---|---|
| sanitize 1 / 330 / 998 / 999 | unchanged |
| sanitize 1000 / 1001 / 1599 / 1600 / 1601 | exact |
| sanitize MAX−1 / MAX / MAX+1 | MAX−1 / MAX / MAX |
| sanitize 99,999,999 | MAX |
| sanitize 0 / −1 / NaN / Infinity | 1 |
| applyWin 999 | 1000 |
| applyWin 1000 | 1001 |
| applyWin 1599 | 1600 |
| applyWin 1600 | 1601 |
| applyWin MAX−1 | MAX |
| applyWin MAX | MAX |
| applyWin MAX+1 / over-max | MAX |
| replay old level | no regression |
| save/load 999→1000 | exact |
| save/load 1000→1001 | exact |
| save/load 1599→1600 | exact |
| save/load 1600 | exact |
| save/load 1600→1601 | exact |
| save/load MAX−1→MAX | exact |
| save/load MAX | exact, never MAX+1 |
| legacy key sync >999 | exact |
| stored current > highest | current clamped |
| over-max stored values | clamped |
| invalid/garbage values | safe fallback |
| storage throws | no crash |
| legacy ≤999 saves | identical |

Browser E2E (`e2e/g19-long-run.spec.ts`) additionally proves:

- seeded `current=1000, highest=1600` reloads as 1000/1600;
- a legitimate L999 victory persists highest 1000, then Next starts L1000,
  and a fresh reload retains L1000;
- L1600 round-trips exactly;
- four-digit level display (`#999`, `#1000`, `#1600`) at 360×800,
  390×844 and 430×932.

## UI

The level number remains ordinary `#999`, `#1000`, `#1600` — no leading
zeroes. The header span is `#level-number`; four-digit values are checked
for containment/overflow/overlap on all three mobile viewports. At the
product bound the “next level” preview stays on MAX instead of implying a
MAX+1 unlock.

## Evidence

- Before: `scripts/dev/out/g19-persistence-baseline.json`
- After: `scripts/dev/out/g19-persistence-boundary.json`
- Screenshots: `scripts/dev/out/g19-level-999.png`,
  `g19-level-1000.png`, `g19-level-1600.png`
