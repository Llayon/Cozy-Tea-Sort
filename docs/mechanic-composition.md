# Mechanic Composition — «Смешанные чаепития» (Gauntlet 15)

G15 proves Tea Sort can create meaningful advanced puzzles by COMPOSING
existing mechanics — no new player action, no second pour implementation,
no ComboState, no combo-specific mutable progress, no second solver, no
pairwise spaghetti, no runtime mining, no legacy canonical break, no
G13/G13.1/G14 weakening. Order+Blend stays forbidden (G15.1 at earliest).

## Shipped subset

- SHIP: SERVING ORDER + TASTING (separate vessels; 12-template bank
  `serving-order-tasting`; challenge-only post-112 at L154, L234, … every
  ~80 levels; tutorial L154 only).
- DEFER: Order+Mystery (C3 zero — coexistence only), Order+Honey (solv 48%,
  C2 8.48% — HOLD for density/solvability), Order+Strainer (research-only
  topology mismatch).
- FORBID: Order+Blend (chemistry standalone).

## Architecture (one of everything)

- `src/game/logic/mechanicCompatibility.ts`: ONE pure compatibility source
  (`mechanicCompatibility`, `validateMechanicCombination`; level vs cup
  split; fail-closed unknowns). Generator request validation uses it;
  runtime rules use lower-level mechanic truths (no second policy, no
  `if (serveOrder && mystery)` spaghetti, no mechanic importing the other).
- ONE pour truth (`applyPourState`), ONE solver (0-1 BFS, POUR cost 1;
  serve completions stay cost-1 POUR metadata), zero combo mutable state
  (PuzzleState/CupConstraint/tea + `servedPrefixLength` + existing helpers).
- Rejection precedence frozen (exactly one reason, no mutation/increment on
  reject, no partial fallback): serving early (same/out-of-range/roles/
  empty/source-served) → blend reactive → tea core → frozen → floating →
  honey → strainer → serve-order early-completion gate.
- Canonical: ONE `cupConstraintSignature` (static: mode/target/capacity/
  mustEndEmpty/serveOrder → `N:_`, `N:_:O1`, `N:_:O2`, `N:_:C2:E`, …) +
  ONE `canonicalPuzzleKey` (dynamic markers: lemon/honey/ice/cap/bud/tool
  travel with contents inside signature groups). O1/O2/tasting/ordinary all
  distinct; same-cup order+tasting statically invalid; legacy non-combo keys
  byte-identical to G14.

## Compatibility matrices

LEVEL (same board) / CUP (same vessel):

- Order+Mystery: allow / forbid (readability + no guessing via Mystery).
- Order+Tasting: allow / forbid (static invalid anyway: cap4 vs cap2).
- Order+Honey: allow / forbid (readable separate goals).
- Order+Strainer: research / research (tight 4c/5v/1e vs 4c/6v/2e).
- Order+Blend: forbid / forbid.

## Feasibility (DEV-only 5k shaped each, 4c/6v 4,4,4,4,0,0, production solver)

Order+Tasting (SHIP):
- sampled 5000, solvable 5000 (100%), trunc 0, L1 5000,
  C2 1074 (21.48%, canon 1074), C3 292 (5.84%, canon 292), C4 0.
- depths 6–15 p50 12, visited p50 1648 p95 2899 max 3630,
  solver ms p50 109 p95 207 max 514.
- controls: Δfull-order p50 0 p95 1, Δfull-taste p50 0 p95 1,
  Δfull-plain p50 1 p95 1. C3 witness: same depth, different buffer
  (FULL opens 1→5 tasting; all single controls open 1→4).

Order+Honey (DEFER):
- sampled 5000, solvable 2400 (48.0%), trunc 0, C2 424 (8.48%, canon 424),
  C3 152 (3.04%, canon 152), C4 11. Depths 7–17 p50 12, visited p95 3234,
  ms p95 273. HOLD: solvability far below 95% preferred + C2 below 10% —
  needs topology/fairness research, not production cherry-picking.

Order+Mystery (DEFER):
- sampled 5000, solvable 5000 (100%), trunc 0, C2 1278 (25.56%),
  C3 0 (0.00%), visited p95 2212, ms p95 136. DEFER: C3 effectively zero —
  Mystery is presentation-only (solver graph unchanged), so coexistence
  never alters planning. Do not ship coexistence as interaction.

Strainer: research-only (topology mismatch, no pilot beyond matrix).
Blend: forbidden both directions (no reaction IDs in G15).

## Production (Order+Tasting only)

- Bank: 12 robust C2 (`servingOrderCompositionTemplates.ts`), 4,4,4,4,0,0,
  O1/O2 among 0–3, tasting empty at 5, ordinary empty at 4. Curation 3000 →
  200 pool → 12 (6/6 role-perm C2 in 10–14, pressure≤0.65 12/12, gap≥2
  12/12, C3 4/12, 7 host pairs, varied final teas). Depths 11–12.
- Generator: `servingOrderCompositionKindFor` + bounded fastpath (≤4
  attempts, 1 solver call happy path, C2 enforced in finalize) + pinned
  fallback `serve-taste-11-36016` (depth 11, C3, preserves combo).
  No runtime mining. Standalone matchers return null for combo requests
  (tasting matcher guards serveOrder).
- Rollout: 1–112 exact (106/110 serving standalone, no combo); first combo
  L154 challenge tutorial («Порядок подачи действует и здесь: сначала ①,
  потом ②.»), then L234, … (~80-level cadence, challenge-only, no
  warmup/relax/peak combos, no Blend leak). Sweep 1–1300 green.
- UX: saucer ①/② + tasting-bowl cues coexist (existing geometry/markers,
  no combo badge, no new hitbox, serve flourish from `serveCompleted`
  metadata, pending ② softened mark). Help unchanged (G14 copy covers
  combo); tutorial L154 only.
- Fairness (50 seeds): doom 0/50, fatal first 0/400 (0.0%).
- Stress (200 boards): all C2, prefix order, locks, conservation, replay
  parity, win parity; solver ms p50 102 p95 150 max 206; visited p50 1646
  p95 2034; generator ms p50 95 p95 143; attempts ≤4; 1 solver call.
- Perf: solver p95 <250ms, visited p95 <10k, no Worker, no state explosion
  (combo/strongest-single multiplier ~1.2×, far below 4× review line).

## Files

- `src/game/logic/mechanicCompatibility.ts` (new)
- `src/game/logic/servingOrderCompositionTemplates.ts` (new, 12 bank)
- `src/game/logic/generator.ts` (G15 combo validators, finalize gates,
  composition kind/fastpath/fallback, tasting-matcher guard)
- `src/utils/difficultyCurve.ts` (20-residue challenge rotation, combo plan
  + subtitle/palette/enforcement)
- `src/App.tsx` (L154 combo hint)
- `scripts/dev/composition-search.ts`, `composition-curate-tasting.ts` (DEV)
- `tests/composition-compatibility`, `serving-order-tasting{,-canonical,
  -solver,-templates,-fastpath,-rollout,-view,-undo,-stress}` (new batches)
- `scripts/run-tests.mjs` (G15 batches)
