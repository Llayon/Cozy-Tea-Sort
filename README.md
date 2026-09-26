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
bun run test       # authoritative batched quality gate (scripts/run-tests.mjs)
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
src/game/logic/targetTemplates.ts  offline-curated named-serving topologies (fast path)
src/game/logic/sinkTemplates.ts    offline-curated guest-cup topologies (fast path)
src/game/logic/tastingTemplates.ts offline-curated tasting-bowl topologies (fast path)
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

Canonical target, sink and tasting production configs skip the random scan entirely: bounded template banks (`targetTemplates.ts`, `sinkTemplates.ts`, `tastingTemplates.ts` — topologies discovered offline with the production solver, palette-relative) serve each level with ~1 solver validation (`*_TEMPLATE_ATTEMPTS <= 4`, `candidatesTried === 0`); every instantiation still passes the single `finalizeCandidate` gate, with a validated fallback ladder behind it.

## Solver

BFS over the exact shared rule table. State key is canonical (cups are unlabeled, so cup encodings are sorted — collapses empty/identical-cup permutations). Constructive moves only (homogeneous-stack → empty relocations are pruned, which also keeps deadlock detection consistent by construction). Supports the maximum puzzle (5 colors, 7 cups, capacity 4). Used at generation time and in tests, not per-frame.

Asymmetric vessels: `CupConstraint` (`normal` | `source-only` | `sink-only`, plus optional `targetTeaId`, `capacity`, `mustEndEmpty`) travels with every puzzle. Two decoupled concepts: `TEA_UNITS_PER_COLOR` (4 tea units per color, always) vs vessel capacity (`cupCapacity`: standard 4, tasting bowl 2). Canonicalization groups cups by identical full signature (`N:_`, `N:<tea>`, `SRC:_`, `SNK:_`, `N:_:C2:E` for the tasting bowl — explicit defaults canonicalize identically to omitted fields) and sorts contents only *within* each group. The homogeneous→empty prune likewise applies only within identical-signature groups AND only when a full-for-its-own-capacity stack is already in its final state (emptying a wrongly-filled target, a teapot, or a tasting bowl that must end empty is real progress, never pruned). One shared `cupEndStateSatisfied` helper defines victory per vessel: source-only empty, sink-only full-to-capacity homogeneous, targets full-to-capacity of exactly their tea, tasting bowls empty (even a full homogeneous bowl is not complete), plain normals empty or full-to-capacity homogeneous.

## Source-only teapot

One filled vessel may be a teapot: it can GIVE tea but can never RECEIVE (`target-source-only` rejection, UI shows «В чайник нельзя наливать — он только раздаёт настой»). Total vessels unchanged (replaces one filled cup, max 7), starts full + mixed (≥ 2 TeaIds) at index 0, stays empty once emptied. Mystery is never hidden inside the teapot. Rollout: L6 challenge teapot, L7 peak teapot + mystery (normal cup), later challenge/peak cycles repeat the pattern; warmup/relax stay clean.

## Sink-only guest cup («Чашка гостя»)

Flow table (`mode` = pour behavior, `targetTeaId` = final destination — orthogonal):

| mode        | give (pour out) | receive (pour in) |
|-------------|-----------------|-------------------|
| normal      | yes             | yes               |
| source-only | yes             | no                |
| sink-only   | no              | yes (ordinary Water Sort target rules) |

One empty vessel may be a guest cup: it RECEIVES tea but tea can NEVER be poured back out (`source-sink-only` rejection, UI shows «Из чашки гостя нельзя переливать — можно отменить ход.»). Total vessels unchanged (replaces one empty cup, max 7), starts empty at the stable last slot with at least one ordinary empty buffer beside it, must finish full + homogeneous (any tea — no named target, no Mystery inside). Undo is unlimited timeline reversal and restores exact previous layers, so every commitment is recoverable. The first pour into the empty guest effectively chooses which tea is served. Rollout: L18 challenge sink, L19 peak sink + mystery (normal cup), L22 challenge teapot + sink (teapot may pour directly into the guest); later challenge/peak cycles rotate sink / teapot+sink / targets / teapot+targets and sink+mystery / targets+mystery / teapot+mystery / mystery-only; NEVER sink + targets, NEVER three specials (max 2 per level); warmup/relax always clean.

## Tasting bowl (дегустационная пиала)

A small working vessel with capacity 2 and normal flow in both directions — it changes space management, not flow direction. `AAAA` into an empty bowl moves exactly 2 layers; a `2/2` bowl is full (`Пиала заполнена (2/2)!`); its contents pour back out under ordinary color rules. It starts empty at the stable last slot (replacing one empty vessel, max 7 total, one ordinary standard empty buffer always remains) and MUST finish empty — even a full homogeneous bowl is not complete. The optimal solution of every committed template demonstrably routes tea through the bowl (in and back out). Mystery never lives inside it; tasting + sink and tasting + targets are rejected loudly. Rollout: L26 challenge tasting, L27 peak tasting + mystery (standard cup), L30 challenge teapot + tasting; later cycles rotate tasting / teapot+tasting / sink / teapot+sink / targets / teapot+targets (challenge) and tasting/sink/targets/teapot + mystery or mystery-only (peak); NEVER tasting + sink, NEVER tasting + targets, NEVER three specials (max 2 per level); warmup/relax always clean. Visually a shallow gold-rimmed bowl with foot saucer, bottom-aligned in the standard cell (2 readable liquid slots, pour stream anchored to the real rim, full-cell hit area).

## Named serving (target cups)

Some normal cups carry a visual destination (`targetTeaId`): at victory they must contain exactly that tea, full homogeneous. During play they pour exactly like ordinary cups — temporary wrong colors, working-space use and mistakes are all legal; only the final state is constrained. `mode` (pour behavior) and `targetTeaId` (final destination) are orthogonal: a teapot never carries a target. Rollout: L10 challenge 2 targets, L11 peak 2 targets + mystery (untargeted cup), L14 challenge teapot + 2 targets, L15 peak teapot + mystery; never teapot + mystery + targets together (max 2 specials per level); warmup/relax always clean. Target pairs are deterministic per level (`pickTargetPair`, reshuffles keep the same goals); target cups start filled, full, never pre-solved, in stable slots (0,1 — or 1,2 behind the teapot).

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

`bun run test` executes `scripts/run-tests.mjs`: the suite runs as sequential batches (one vitest process each) because a single 20-file parallel run deterministically trips vitest's own worker RPC (`Timeout calling "onTaskUpdate"` after all tests pass) under this suite's BFS CPU load. Batching is infrastructure isolation only — it never weakens assertions. The runner validates at startup that every `tests/**/*.test.ts` file is assigned exactly once (unassigned/duplicated/missing files abort before anything runs), fails fast, and retries a failed batch at most once and ONLY when the output carries that exact RPC signature with zero real-failure evidence (no FAIL lines, failed counts, AssertionError, or non-RPC unhandled error — mixed failures never retry). `bun run test:all-at-once` keeps the raw single invocation as the diagnostic command; `bun run test` is the authoritative quality gate.
