# Frozen Cup / Ice — «Замёрзшая чашка» (Gauntlet 9)

A new mechanic family: exactly one normal vessel may begin **frozen**.
While frozen it contains tea and may receive tea, but it may **not** act
as a source. Pouring the designated hot tea (`sea_buckthorn` —
облепиховый чай растапливает лёд, a permanent learned rule) into it via
an otherwise legal Water Sort pour melts the ice atomically; the vessel
then behaves exactly like an ordinary normal cup. No timer, no health,
no punishment, no tap-to-melt action. Melting is a deterministic
consequence of POUR (no new player action, no new solver).

## Why sea_buckthorn

An existing `TeaId` — no new tea identity for heat. G9 production never
combines ice with lemon, so there are no competing sea_buckthorn
semantics in play.

## State

Ice is a genuinely new mechanic, so it owns a new aligned state layer —
the ONE authoritative ice location (no `frozenCupIndex`, no
`Cup.isFrozen` duplicate, no view-owned index):

```ts
export type IceId = 'ice';
export type IceSlot = IceId | null;
// PuzzleState.iceSlots: IceSlot[]  (ReadonlyPuzzleState.iceSlots?: …)
```

Legacy callers omit the field → normalized to all-null. Ice is not tea:
no color totals, no capacity, no transformation, nothing consumed or
produced — tea conservation intact. Production starts the frozen cup at
3/4 layers (one free tea slot); ice is an overlay, not a fifth layer.

## Legality (single truth: `pourRejectCodeState`)

- Frozen source → `source-frozen` (outranks everything except
  addressing/role identity: same-cup, out-of-range, source-sink-only).
- Frozen destination accepts ONLY sea_buckthorn on top, else
  `target-frozen-needs-hot` — outranking color/prune detail, but never
  capacity (`target-full` wins: ice creates no space) or vessel roles.
- Hot tea bypasses no ordinary rule: a melt is an ordinary legal
  transfer plus an ice-state transition.
- Legacy `complete-to-empty` pruning is exempt for genuine melts (hot
  full-homogeneous source into a frozen empty vessel melts — a semantic
  change, never a permutation).
- Malformed/edge behavior is fail-closed and pinned: full frozen cups
  report `target-full`; empty frozen cups accept hot tea (melt) and
  reject the rest; melting is one-way (undo restores it exactly).

## Transition (single truth: `applyPourState`)

Tea transfer + ice removal commit atomically; rejections mutate nothing.
Result carries presentation-only metadata `iceMelted?: 'ice'`
(ordinary pours: `undefined`) driving the view flourish. PuzzleState
remains truth.

## Canonicalization

The ice marker travels with the vessel (`…#sink:<m>#ice:<i>`). Ice-free
boards keep byte-identical G8 keys (dedicated ice path only when ice is
present); frozen vs unfrozen keys always differ; vessel swaps stay
canonical.

## Solver / win / deadlock

One existing 0-1 BFS (melt = ordinary POUR edge, cost 1; ice state rides
the canonical key). Win additionally requires no active ice
(fail-closed). Deadlock needs no new action category: a legal hot inflow
is a constructive POUR.

## Production shape

Request: `frozenCupCount?: number` (0/1). Bank `frozenCupTemplates.ts`,
kind `'frozen-cup'`: 18 canonical-distinct L2 templates (18/18 L3),
layer counts exactly 4,4,4,3,1,0; frozen host = the 3-layer vessel with
exactly one sea_buckthorn on top; `c0` always maps to sea_buckthorn.
Generator: validate → select → permute c1/c2/c3 → place ice → single
`finalizeCandidate` (ER–FL: solvable, non-truncated, depth 8–14, optimal
replay with MELT + later source-use + cleared ice + win). Happy path: 1
template attempt, 1 solver call, 0 fallbacks (200-seed bench: generator
p95 12ms, solver p95 11ms). One pinned L2 fallback (depth 11).

## Rollout

Levels 1–64 unchanged. 65 warmup clean · 66 challenge FROZEN CUP
(tutorial) · 67 peak LEMON+HONEY (familiar) · 68 relax · 69 warmup ·
70 challenge FROZEN CUP (no repeat) · 71 peak HONEY+Mystery ·
72 relax. Post-72 challenge rotation gains frozen cup (standalone only —
never combined: no ice+Mystery/teapot/targets/sink/tasting/lemon/honey/
strainer).

## View

Procedural translucent slab at the surface (shape-coded frost, §130) +
~320ms crack/fade flourish on the shared surface anchor under the one
existing ticker, one input lock, exactly one `onMoveComplete`. Frozen
source taps never select (gentle hint:
«Сначала растопи лёд облепиховым чаем.»). Tutorial (L66):
«Замёрзшая чашка пока не отдаёт чай. Долей в неё облепиховый — лёд растает.»
Help:
«Из замёрзшей чашки нельзя переливать. Налей в неё облепиховый чай — лёд растает, и чашка станет обычной.»

## Feasibility record

5,000 deterministic candidates → 815 production-shaped → 815 solvable
(100%, 0 truncated) → 815 L2 → 815 L3 → 815 canonical-distinct L2/L3.
Depths 6–14 (sweet 10–12); melt p50 depth 2 (26% move-1, 68% first
quarter — planning, not a forced tap); source-use mostly delayed;
ice-vs-no-ice delta p50 0 (gating, not rescue). Harness:
`scripts/dev/frozen-cup-search.ts`; curation:
`scripts/dev/frozen-cup-curate.ts`; bench:
`scripts/dev/frozen-cup-bench.ts` (dev-only, never CI).
