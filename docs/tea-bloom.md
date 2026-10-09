# Route Objective — «Чайный бутон» (Gauntlet 12)

First HISTORY-dependent route objective: one otherwise ordinary
capacity-4 cup contains a dormant tied-tea bud at its physical bottom.
The bud blooms ONLY when that cup becomes completely empty
(`budActive && sourceTeaAfter.length === 0 → clearBud`, atomically inside
the normal POUR). The level cannot finish until the bud has bloomed —
and production requires the same vessel to be meaningfully reused
afterwards: «доберись до самого дна и распусти бутон».

## What it is not

Not capacity, not source/destination blocking, not a target color, not a
tea transformation, not a timer, not a bonus decoration, not a vessel
mode, not a persistent flower cup. The puzzle effect is exactly: this
specific vessel must cross the EMPTY state at least once — then it
becomes a completely ordinary vessel again.

## State (one aligned row, no duplicates)

```ts
export type TeaBudId = 'tea_bud';
export type TeaBudSlot = TeaBudId | null;
// PuzzleState.teaBudSlots: TeaBudSlot[] (ONE authoritative location)
```

No `teaBudCupIndex`, `bloomCupIndex`, `hasTeaBud`, `cup.bloomed`,
`viewBudIndex`. Legacy states normalize missing rows to all-null. The bud
is NOT a `TeaId`: it never affects tea counts, top runs, matching, the
palette, or 4-units-per-color conservation. It consumes no capacity (the
host still holds 4 tea layers max) and changes NO pour legality. No
`bloom-bud` action: blooming is deterministic transition metadata
(`teaBudBloomed: 'tea_bud'`, presentation only). No persistent
`'bloomed'` state — after bloom the slot is null and the vessel is
ordinary (no `bloomedCupIndex`/`wasBudCup`/`flowerCupState` in
solver/canonical state).

## Transition (atomic, one-way)

Dormant-bud source + successful POUR outflow + post-source tea count 0 →
bud clears in the SAME transition (any m: `[A]` or `[A,A]` both bloom;
partial `[A,B]` → `[A]` keeps the bud) with metadata
`teaBudBloomed: 'tea_bud'`. Inflows never bloom; rejected pours change
nothing (tea, bud and moves untouched). One-way (undo/restart restore
exactly). Production never starts `[]` + dormant bud (fail-closed:
representable, never auto-clears on read, never wins; the generator
requires a full mixed len-4 host).

## Win / pruning / canonical / solver

Win additionally requires every bud slot null — a dormant bud blocks
victory even on an otherwise-sorted board. Post-bloom the vessel may
receive, source, become a 4/4 final, or stay empty like any normal cup.
Pruning never treats bud-touching pours as permutations (emptying the
host changes objective state — a homogeneous `[A,A]` + bud into an empty
is constructive; after bloom ordinary rules resume). Canonical marker
`#bud:<b>` travels with contents inside the same signature group;
all-null boards keep byte-identical G11 keys; active vs cleared key
differently; post-bloom collapse permutes normally again. ONE existing
0-1 BFS, no new action/edge; a bloom is a normal POUR at cost 1.
Undo/restart/reshuffle restore the exact full-mixed start and timeline.

## Production shape

Request `teaBudCount?: number` (0/1; >1 rejects). Bank
`teaBloomTemplates.ts`, kind `'tea-bloom'`: 18 canonical-distinct
permutation-robust L2 templates (all L3: 8 WORKSPACE_CYCLE + 10
FINAL_REPURPOSE; 14/18 route-influenced vs plain control), 4c/6v/16u
multiset 4,4,4,4,0,0, full mixed len-4 host, `c0..c3` fully permutable,
depths 10–14 (sweet 11–13). Generator: validate → select → permute →
set one `'tea_bud'` → finalizeCandidate (HB–HT: solvable,
non-truncated, in-band, BLOOM + later ≥2 + cleared + win). Happy path 1
solve, ≤4 attempts (median 1); pinned L2 fallback
`tea-bloom-12-503081`. Standalone only (no bud + mystery/teapot/targets/
sink/tasting/lemon/honey/strainer/ice/thermos/cinnamon).

## Feasibility evidence (5k shaped, production solver)

5000 solvable, 0 truncated; L1 5000, L2 136 (2.7%), L3A 38 / L3B 98
(all L2 are L3); canonL2 136; depths 5–15 (p50 12); solver p95 61ms;
delta(bud−plain) p50 0 / p95 1; CONTROL_EMPTY 42.4% / AVOIDS 57.6%.
L2 blooms are early-mid (never final-quarter) with delayed reuse in the
curated bank. The mechanic is strategically real in a natural minority
(forced early emptying + reuse at +1 friction, diverse 2/3-color hosts),
not a free final-move animation — hence curation from 60 robust
distinct L2, not pathological cherry-picking.

## View / UX

Dormant bud: small organic green/brown tied bundle with a tied-thread
silhouette at the physical bottom, strong outline so it reads through
four tea layers without harming tea readability; tea keeps base-4
geometry. Bloom: on the emptying pour the bud is revealed, expands into
a small soft flower with a few restrained petals/steam (~450ms), then
fades — the cup becomes visually normal. One Pixi ticker, one input
lock, one `onMoveComplete`; static suppression during the flourish;
view reads `teaBudSlots` + metadata only. Tutorial (L90 only):
«На дне спрятан чайный бутон. Полностью опустоши чашку — он
распустится.» Help: «Чайный бутон распустится, когда его чашка
полностью опустеет. После этого чашка остаётся обычной и её можно
снова использовать.»
