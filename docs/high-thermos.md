# High Thermos — «Высокий термос» (Gauntlet 10)

Asymmetric capacity 2.0: exactly one normal vessel may be a **high thermos**.

- `mode: 'normal'` (ordinary bidirectional flow, ordinary maximal transfer,
  ordinary color rules, no special pour, no new player action).
- `cupCapacity: 5` (one extra local slot vs a standard 4-layer vessel).
- `mustEndEmpty: true` (NOT a final serving vessel — even `[B,B,B,B]`
  or `[A,B,B,B,B]` is NOT satisfied; only `[]` satisfies).
- No `targetTeaId`, never source-only/sink-only.

## Why capacity 5 needs a mixed start

`TEA_UNITS_PER_COLOR = 4` is unchanged — every active `TeaId` still has
exactly 4 layers, nothing created/destroyed. An empty cap-5 vessel could
normally reach at most 4 homogeneous layers (no fifth unit exists), so the
fifth slot would be strategically dead. Production thermos therefore starts
**partially filled AND mixed (T3: length 3, top tea exactly once inside)**,
so buried different tea + top block + later matching inflow can reach 5/5:

`[A,B] → [A,B,B,B] → [A,B,B,B,B]` (example shape; production uses T3).

## State (static constraint, no dynamic truth)

Thermos is a STATIC vessel constraint — no `thermosState`, `thermosCupIndex`,
`thermosContents`, runtime boolean, or view-owned index. Tea remains in
`cups`; role remains in `CupConstraint`:

```ts
{ mode: 'normal', capacity: 5, mustEndEmpty: true } // + no target
// helper: isThermosCupConstraint(...) derives from authoritative fields
```

`isTastingCupConstraint` stays pinned to cap-2 + mustEndEmpty (never cap-5).

## Legality / transfer (single pour truth)

Destination thermos: `free = 5 - len`, `m = min(sourceTopRun, free)`.
Source thermos: ordinary top-run rules. At 5/5 the thermos reports
`target-full` like any full vessel. Full mixed 5/5 is NOT solved — it is a
temporary packed state the player must later unpack (`thermos = []` wins).

Pruning uses the vessel's actual semantics: a must-end-empty thermos is
never final when non-empty, so moving tea OUT stays legal + constructive
(different signature groups in production; full 5/5 homogeneous is
explicitly NOT pruned even within the same group).

## Canonicalization

Static signature `N:_:C5:E` — distinct from standard `N:_` and tasting
`N:_:C2:E`. Legacy keys byte-identical; thermos swaps only within the same
full signature group (never collapses with standard cups).

## Solver / win / deadlock / undo

One existing 0-1 BFS, no new action/solver/path; every thermos pour costs 1.
Win is the shared `cupEndStateSatisfied` (thermos only empty satisfies; no
App/View special logic). Deadlock honors cap-5 + mustEndEmpty via
constructive moves. Undo/restart/reshuffle restore the exact partial-mixed
start and full timeline (fill-5, drain, multi-step, win).

## Production shape

Request: `thermosCupCount?: number` (0/1; >1 rejects loudly). Bank
`thermosTemplates.ts`, kind `'thermos'`: 18 canonical-distinct L2 T3
templates (17/18 L3), global multiset 4,4,3,3,2,0, thermos = the length-3
mixed vessel (top once), `c0..c3` fully permutable (no hot-tea binding).
Generator: validate → select → permute roles → instantiate cap-5/E →
`finalizeCandidate` (FM–GH: solvable, non-truncated, depth 9–13, optimal
replay with FIFTH_SLOT_USE + later THERMOS_DRAIN + final empty + win).
Happy path: 1 solve, ≤4 template attempts; pinned L2 fallback
`thermos-11-100124`. No cap-4 proof at runtime (L3 is offline curation).
No second special (G11 thermos+tasting is out of scope).
