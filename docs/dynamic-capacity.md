# Dynamic Capacity — «Палочка корицы» (Gauntlet 11)

First DYNAMIC capacity mechanic: one otherwise ordinary capacity-4 cup
contains a cinnamon stick. While present, effective tea capacity is 2.
Completely emptying the cup removes the stick atomically — the same cup
then holds 4 for the rest of the level. Workspace is earned by
deliberately emptying: «освободи чашку — открой дополнительное место».

## Why not tasting bowl 2.0 / thermos

Tasting bowl is capacity 2 forever + mustEndEmpty. Thermos is static
capacity 5 + mustEndEmpty. Cinnamon is base 4 → effective 2 → 4 DURING
PLAY with ordinary final semantics after unlock (a post-unlock
`[A,A,A,A]` is a normal satisfied final cup — unlike tasting/thermos).

## State (one aligned row, no duplicates)

```ts
export type CapacityObstacleId = 'cinnamon';
export type CapacityObstacleSlot = CapacityObstacleId | null;
// PuzzleState.capacityObstacles: CapacityObstacleSlot[] (ONE authoritative location)
```

No `cinnamonCupIndex`, `hasCinnamon`, `cup.dynamicCapacity`,
`viewCinnamonCupIndex`. Legacy states normalize missing rows to all-null.
The static `CupConstraint` (base capacity 4) is never mutated.
`TEA_UNITS_PER_COLOR = 4` unchanged — no tea created/destroyed. No
`remove-cinnamon` action: removal is a deterministic consequence of a
normal POUR (cost 1, one `onMoveComplete`).

## Effective capacity (single truth)

`cupCapacity(constraint)` stays STATIC. All "how much fits?" questions
use one shared helper when dynamic state matters:

```ts
effectiveCupCapacity(constraint, obstacle) // null → base; cinnamon → min(base, 2)
```

Legality, transfer counts, release capacity, strainer gating, solver
expansion, deadlock and constructive checks all use it. Production
cinnamon normal cup: 4 → 2.

## Transition (atomic, one-way)

Active source + successful pour + post-source length 0 → obstacle
clears in the SAME transition (any m, strained or not) with metadata
`capacityObstacleRemoved: 'cinnamon'` (presentation only). Partial
outflows keep the stick (`[A,B]` → `[A]` + cinnamon); inflows never
remove; failed pours change nothing. Never re-locks (undo/restart
restore exactly). Production never starts empty + active (fail-closed:
representable, never wins, generator rejects).

## Win / pruning / canonical / solver

Win additionally requires every obstacle slot null — an active cup,
even homogeneous `[A,A]` at effective-full 2/2, is NOT final. Post-
unlock the vessel is ordinary (may become a 4/4 final — FINAL_REPURPOSE).
Pruning never treats obstacle-touching pours as permutations (emptying
may unlock). Canonical marker `#cap:<m>` travels with contents inside
the same signature group; all-null boards keep byte-identical G10 keys;
active vs unlocked key differently; post-unlock collapse permutes
normally again. ONE existing 0-1 BFS, no new action/edge. Undo/restart/
reshuffle restore the exact mixed len-2 start and full timeline.

## Production shape

Request `cinnamonCupCount?: number` (0/1; >1 rejects). Bank
`cinnamonTemplates.ts`, kind `'cinnamon'`: 18 canonical-distinct L2
templates (all L3B repurpose; L3A buffer-cycle never occurs naturally),
4c/6v/16u multiset 4,4,3,3,2,0, len-2 mixed host, `c0..c3` fully
permutable, hosts spread 0..5, depths 9–13 (sweet 10–12). Generator:
validate → select → permute → set one `'cinnamon'` → finalizeCandidate
(GI–HA: solvable, non-truncated, in-band, UNLOCK + later ≥3 + cleared +
win). Happy path 1 solve, ≤4 attempts; pinned L2 fallback
`cinnamon-11-200263`. No second special (cinnamon + thermos/tasting are
future gauntlets if evidence justifies them).
