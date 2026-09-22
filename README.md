# Чайный купаж — Cozy Tea Sort

Cozy Water Sort-style puzzle as a Telegram Mini App: sort tea layers between cups until each cup holds one pure blend. No timers, no penalties, unlimited undo/restart.

## Stack

- React 19 + Vite + Tailwind CSS
- Pixi.js v8 (canvas rendering, one `Application` per session)
- Web Audio API (procedural pour/select/win effects, no assets)
- Telegram WebApp haptics (best-effort, guarded fallbacks)
- Vitest (pure-logic tests, no WebGL)

## How to run

```bash
bun install
bun run dev        # local dev server
bun run typecheck  # tsc --noEmit (strict)
bun run test       # vitest run
bun run build      # vite build
```

## Architecture

Single source of truth, no duplicate implementations:

```text
src/game/types.ts                 TeaId / CupSkinId / TEA_TYPES / MAX_CUP_CAPACITY
src/game/logic/rules.ts           move legality (UI, solver, generator, deadlock all delegate here)
src/game/logic/teaSortLogic.ts    Cup + TeaSortLogic = puzzle truth (undo, mystery counters, win)
src/game/logic/rng.ts             seeded RNG (mulberry32, no external dep)
src/game/logic/solver.ts          pure BFS solver, Pixi/React-free
src/game/logic/generator.ts       solver-validated generation, bounded retries + fallback
src/game/logic/difficulty.ts      solver-depth targets + acceptance bands per rhythm phase
src/game/logic/progression.ts     pure win application (current vs highest, reward-once)
src/game/storage.ts               safe localStorage load/save with validation
src/game/view/TeaSortView.ts      rendering + input only (never decides rewards/levels)
src/game/view/animation.ts        named pour timing constants (~900 ms total)
src/game/audio/audioSynth.ts      procedural effects
src/game/telegram/telegramHaptics.ts  idempotent init, guarded haptics
src/types/tea.ts                  UI types; re-exports the canonical palette
src/utils/difficultyCurve.ts      level config (colors, cups, mystery, reward IDs)
```

Ownership: `TeaSortLogic` = puzzle truth, `TeaSortView` = rendering/input, React `App` = progression/meta UI. Level lifecycle is `generate → start → play → win → persist → victory modal → next level`. Pixi is created once and reused; `view.boundLevel` carries the explicit win context so stale React closures can never corrupt rewards.

## Level generation (solver-validated)

The old "100% solvable via reverse shuffle" claim was false: arbitrary single-layer transfers are not reversible legal moves. Generation is now **generate → solve → accept/reject**:

1. Seeded random deal (`generateLevel(config, seed)`, deterministic per seed).
2. BFS solver verdict; unsolvable candidates are rejected.
3. Solver minimum depth is matched against the phase acceptance band; closest-to-target wins.
4. Bounded retries (`GENERATOR_MAX_RETRIES = 150`), then a known-solvable deterministic fallback. No infinite loops.

Any level is reproducible from its seed (`seed` is stored on the generated level for bug reports).

## Solver

BFS over the exact shared rule table. State key is canonical (cups are unlabeled, so cup encodings are sorted — collapses empty/identical-cup permutations). Constructive moves only (homogeneous-stack → empty relocations are pruned, which also keeps deadlock detection consistent by construction). Supports the maximum puzzle (5 colors, 7 cups, capacity 4). Used at generation time and in tests, not per-frame.

## Difficulty rhythm ("Breathing")

Difficulty = solver minimum solution depth, never the shuffle count (`shuffleSteps` is retained as a deprecated compat field). Target bands (tunable):

| phase     | target depth | acceptance band |
|-----------|--------------|-----------------|
| warmup    | 4–6          | 3–9             |
| challenge | 7–10         | 5–13            |
| peak      | 10–14        | 8–18            |
| relax     | 4–6          | 3–9             |

Measured random-deal medians run slightly above the naive targets (e.g. peak ≈ 15); the enforced contract is the acceptance band plus the relative shape `peak > warmup`, `peak > relax`, verified by seeded tests.

## Mystery tea

Exactly one bottom layer may be hidden (`hiddenCount = 1`) in a cup with ≥ 3 layers where the hidden tea **differs** from the adjacent visible layer — clearing the top always reveals something different. Hiding is presentation only: the solver and rules see true state, so hidden info can never create an impossible puzzle. Undo/restart restore counters exactly.

## Progression & persistence

- `currentLevel` = puzzle being played; `highestUnlockedLevel` = furthest earned (completing N unlocks N+1).
- `N → N+1` happens only through the victory flow. The footer action ("Другой расклад") reshuffles the **same** level.
- "New recipe/skin" banners appear only when the persistent collection actually gains an entry (replays stay silent).
- Persisted (validated, never trusted blindly): highest unlocked, unlocked recipes/skins, equipped skin, mute. Refresh restarts the current puzzle but never regresses progression.

## Telegram behavior

`telegram.init()` is idempotent; every haptic call is try/caught with a `navigator.vibrate` fallback. Haptic failures never break gameplay, and input handlers fire each haptic exactly once.

## Quality gate

CI (`.github/workflows/quality.yml`, Bun, single `bun.lock`) runs `install → typecheck → test → build`.
