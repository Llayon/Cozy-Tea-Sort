# G20 — Steeping Flask / «Заварочная колба»

Source base: `origin/main` `d9e582399a8685d71ef37b48ec8f742befbb4211`
(G19 final). Worktree: `Cozy-Tea-Sort-g20-steeping-flask`.

## Product rule

One standalone capacity-4 vessel:

- starts empty in the selected F0 topology;
- receives tea under ordinary Water Sort rules;
- may source **only** when its current layers are exactly 4/4 homogeneous;
- must end empty at victory.

Readiness is derived from current layers + the static constraint. No
`flaskReady`, `steepedTea`, `brewProgress`, `flaskLocked` or similar field
exists in `PuzzleState`.

## Static contract

`CupConstraint` adds one optional static field:

```ts
steepingFlask?: boolean;
```

A valid production flask is exactly:

```ts
{
  mode: 'normal',
  capacity: 4,
  mustEndEmpty: true,
  steepingFlask: true,
  // targetTeaId/serveOrder/sharedCapacityGroup/pairedTeaGroup absent
}
```

`isSteepingFlaskConstraint` identifies the marker; `isValidSteepingFlaskConstraint`
enforces the exact shape fail-closed. `cloneCupConstraint` copies the marker
(including explicit `false`).

Canonical suffix: `N:_:C4:E:SF`. Absent/false marker leaves every legacy key
byte-identical (`N:_:C4:E` for a legacy cap4/end-empty vessel, `N:_` for a
standard cup).

## Derived readiness and pour truth

`isSteepingFlaskReady(layers, constraint)` is true iff:

- the constraint is a valid flask;
- `layers.length === 4`;
- all four layers are the same TeaId.

Empty/partial/full-mixed/malformed → false.

The only transition implementation remains `applyPourState`. The only
legality truth remains `pourRejectCodeState`; the G20 gate sits after
addressing/role/source-empty and before destination capacity/color detail:

- empty flask source → `source-empty` (not steeping-not-ready);
- partial/flask mixed source → `source-steeping-not-ready`;
- full homogeneous flask → ordinary legal source with ordinary maximal
  transfer count.

Partial release is deliberately legal: `4 → 2` leaves `2` and automatically
re-locks the source gate. Clean decant `4 → 0` is legal and constructive
because flask and ordinary vessels have different static signatures.

`cupEndStateSatisfied` returns true only for an empty valid flask; a full
homogeneous flask is **not** final. Malformed flask constraints never
satisfy victory.

`canActAsSource` stays true for a valid flask (it can source when ready);
the temporary lock is the readiness gate, not a permanent source ban.

## Compatibility

`CompositionMechanicId` adds `steepingFlask`. Production is standalone:
every sibling composition/mechanic is rejected. Blend + Flask is
FORBID/FORBID; Shared Tray/Tea Pair/Serving Order/Tasting/Mystery/Honey/
Strainer are RESEARCH at level and FORBID same cup. Existing G15–G17
verdicts are unchanged.

## Selected feasibility profile: F0

6 vessels, shape `4,4,4,4,0,0`:

- four full mixed ordinary cups;
- one ordinary empty cup;
- one empty steeping flask.

F0 5000 confirmatory: 100% solvable, 0 truncated, 2219 L2 (44.4%), 2219
clean-decant, 0 partial-release on optimal replays, depth p50 12 / p95 14,
solver p95 109 ms. See `docs/g20-feasibility.md`.

F1 (preloaded) and F7 (roomy) were rejected: F1 loses the emergent
first-tea choice and has no formal empty→partial commit; F7's solver ignores
the flask and is much slower.

## Production bank

`src/game/logic/steepingFlaskTemplates.ts`:

- 18 canonical-distinct F0 templates;
- depth band 9–14;
- 18/18 exact solver depth, L2, clean decant, no partial release;
- 18/18 control-break evidence;
- 6 deterministic TeaRole permutations per template survive;
- fallback = first bank template, exact depth/clean cycle;
- 4 committed TeaRoles represented.

## Generator

Request field: `steepingFlaskCount?: 0 | 1` (non-integer/negative/>1 rejected).
Canonical matcher requires the exact standalone F0 request. Fast path:
template → seeded full role permutation → one static flask constraint →
`finalizeCandidate`. No runtime topology search; no runtime controls.

200 production seeds:

- 200/200 generated, 0 exceptions, 0 fallbacks
- 157 distinct starts
- depth p50 11 / p95 13 / max 13
- generator p50 39.3 / p95 127.8 / max 298.8 ms
- solver p50 33.2 / p95 72.1 / max 94.1 ms
- attempts p50 1 / p95 2 / max 4
- solverCalls p50 1 / p95 2 / max 4

## Rollout V3

- G19 frozen exactly through L557 (G18 1–330 + G19 331–557).
- L555 peak, L556 relax, L557 warmup.
- V3 starts at L558; 28 challenge slots / 112-level span.
- V2 remains the policy for 334–554; V1 <=330.
- V3 deck replaces one duplicate familiar Honey slot with Steeping Flask.
- First cycle: 558 Flask, 562 Frozen, 566 Shared Tray, 570 Honey, …,
  666 Serving Order; L670 Flask again.
- Flask recurrence: 558, 670, 782, 894…
- Shared Tray: 566, 678, 790…
- Tea Pair: 602, 714, 826…
- Blend: 630, 742, 854…
- Order+Tasting: 638, 750, 862…
- 10 complete V3 decks / 280 slots verified.
- No Flask in peak/warmup/relax; no unsupported composition.
- Tutorial only at L558; L670+ no auto banner.

## UX

- Slender glass carafe with a narrow receiving neck and side stopper.
- Empty: neutral/open receiving cue.
- Partial: small closed stopper + subtle contained steam.
- Ready: stopper lift + warm bloom + short steam.
- Partial release re-locks automatically on the next redraw; no ready state
  is stored.
- Rejection copy: «Сначала наполни колбу до краёв» with the existing gentle
  shake/haptic pattern, no red alarm.
- Help copy includes the partial-release relock rule.
- Screenshots: `scripts/dev/out/g20-flask-L558-empty-{360x800,390x844,430x932}.png`
  plus `g20-flask-L558-partial.png` / `g20-flask-L558-ready.png` at 390×844;
  all three structural layouts are green.

## Tests

New: `steeping-flask.test.ts`, `-solver`, `-undo`, `-templates`,
`-fastpath`, `-view`, `-rollout`; E2E `g20-steeping-flask.spec.ts`.
Coverage includes kernel precedence, canonical, clone, derived readiness,
solver/deadlock, partial release, clean decant, undo, bank 18/18,
permutations, 200-seed production, fallback, source gate at every replay
state, V3 deck, G19 freeze, tutorial recurrence, mobile layout and rapid
input.
