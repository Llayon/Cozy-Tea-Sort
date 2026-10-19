# Shared Capacity — «Общий поднос» / TEA TRAY (Gauntlet 16)

First SHARED-CAPACITY axis: exactly two otherwise-normal cups sit on one
lightweight tea tray. Each keeps individual capacity 4, but together they
may contain at most 6 tea layers total: «На подносе две чашки. Вместе в
них помещается не больше 6 слоёв чая. Освободи место в одной — и оно
появится для другой.»

## What it is not

Not cap-3 cups (each tray cup keeps normal 4-slot geometry), not a lock,
not a new player action (only POUR), not a new solver, not a PuzzleState
row, not a tea-economy change (4 units per color), not a combo mechanic
(standalone only). The puzzle effect is exactly: outside→tray inflow is
bounded by group free space (partial m allowed, never whole-pour
rejection when mShared > 0); tray→outside frees space; tray→tray
preserves the total and is exempt.

## State (derived, no new row)

```ts
// CupConstraint.sharedCapacityGroup?: 'tea-tray' (static identity only)
// SHARED_CAPACITY_LIMITS = { 'tea-tray': 6 } (ONE limit truth)
```

No `sharedCapacityUsed`, `trayOccupancy`, `sharedSlots`, `trayFree`,
`groupFill`, `reservedCapacity`. Occupancy derives from current cup
lengths + static group identity (`sharedCapacityOccupancy`: sum of member
lengths; `sharedCapacityFree`: limit − occupancy). Reachable forward play
conserves tea and only bounds outside→tray inflow, so the board always
encodes its own occupancy. Malformed overcap states (> 6) fail closed
(no win, no silent tea deletion).

## Transition (atomic, one POUR)

Single truth stays `applyPourState` (no `applyTrayPour`):

1. ordinary addressing / role / emptiness validation (unchanged order)
2. ordinary color/capacity transfer determination (maximal mOrdinary)
3. group classification: outside→tray bounded by shared free
   (`mShared = min(mOrdinary, sharedGroupFree)`); tray→outside and
   tray→tray (same group) unbounded
4. `mShared > 0` → transfer exactly mShared (partial legal, metadata
   `sharedCapacityLimited: true` for animation/tests — never
   authoritative); `mShared == 0` → `shared-capacity-full` (no mutation,
   never a zero-layer success)
5. commit normal pour (tea economy untouched)

Rejection precedence keeps obvious errors meaningful: `target-full`
(individual 4/4) and `color-mismatch` outrank `shared-capacity-full`;
same-cup / out-of-range / source-empty / roles stay first. Win requires
ordinary end-state AND every group occupancy within its limit (tray cups
stay ordinary normal cups: empty or full-homogeneous 4/4; valid finals
4+0, 0+4, 0+0 — never 4+4).

## Canonical identity (static, no occupancy markers)

`cupConstraintSignature` appends `:G6` (`N:_:G6`); absent group keeps
legacy strings byte-identical. Tray members permute with EACH OTHER
(same group rule, symmetric) but never with ordinary cups. No
`#trayUsed` / `#sharedFree` / `#groupOccupancy` markers — lengths already
encode occupancy. Solver is the ONE existing 0-1 BFS (every pour cost 1);
deadlock/constructive classification flows through the same state-aware
rules. Local finality pruning stays sound: a full homogeneous tray
member is never treated as globally untouchable (releasing space may be
required), and only exact tray→tray whole-stack relocation into an
identical empty member is pruned as a canonical self-loop.

## Compatibility (standalone)

Production is STANDALONE: shared tray + any sibling (Mystery, Order,
Tasting, Honey, Strainer, Blend, Ice, Thermos, Cinnamon, Tea Bloom,
Lemon, Teapot, Sink, Targets) is rejected at request validation;
`mechanicCompatibility.ts` stays the ONE policy source (`sharedTray`
identity, all pairs forbid — Shared+Blend stays FORBID, G15 decisions
unweakened).

## Production shape

`sharedTrayCount: 0 | 1` request; `shared-tray` template bank (18 robust
L2, P33 profile 3,3,4,4,2,0 with tray 3+3 at [0,1], roles c0..c3, tray
indices ride with cups); bounded fast path (≤4 attempts, 1 solve);
pinned strong-L2 fallback (`tray-10-0`). Feasibility: P33 5000 shaped →
5000 solvable, 4543 L2 (90.9%, canon 4542), L3A 4248/5000, depths 7–15
p50 11, visited p95 2353, solver p95 139ms, overload 52.9%. Sweet 10–12,
accept 9–13. Rollout: prefix ≤154 untouched (G15 L154 combo pinned);
L162 tutorial («Общий поднос • 6 сосудов»), L242 second exposure, no
tutorial repeat; challenge-only standalone afterwards. Tray visual:
low-profile wooden plank + six shape-coded markers (filled vs hollow
ring, never color alone) showing the group total on both members; no
lock icons; cups keep normal geometry and hitboxes; one ticker, one
input lock; soft hint «На подносе больше нет места» (no red alarm).
