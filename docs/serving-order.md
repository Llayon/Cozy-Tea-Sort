# Serving Order — «Порядок подачи» (Gauntlet 14)

First DEPENDENCY axis: exactly two otherwise-normal cups sit on ordered
serving saucers ① and ②. Both stay fully usable while sorting, but they
must COMPLETE in order — ① first, ② second. A served cup becomes
source-locked: «Чашками можно пользоваться как обычно, но закончить их
нужно по порядку: сначала ①, потом ②. Поданную чашку больше не
переливают.»

## What it is not

Not a lock on cup ② (it sources/receives normally while incomplete), not
a target color (any tea may serve either saucer), not capacity, not a
timer, not a new player action, not a new solver, not a PuzzleState row.
The puzzle effect is exactly: ② may not cross into full-homogeneous
before ① is served; served cups may not pour out.

## State (derived, no new row)

```ts
// CupConstraint.serveOrder?: number  (static identity only; 1, 2 in production)
```

No `servedCups`, `serveProgress`, `currentServeOrder`, `servedPrefix`,
`wasServed`, `viewServed1/2`. Progress derives from current tea contents
+ static constraints (`servedPrefixLength`: leading completed orders —
① mixed/② mixed → 0; ① full/② mixed → 1; both full → 2; ① mixed/② full
→ 0, malformed but repairable). Reachable forward play is monotone
0→1→2: early completion of ② is rejected and served sources are locked,
so the board always encodes its own progress. Raw fabricated boards
cannot prove history — accepted (invariants enforced by valid starts +
transitions + solver, never by stored history).

## Transition (atomic, one POUR)

Single truth stays `applyPourState` (no `applyServingPour`):

1. ordinary bounds / source / role validation
2. served-source guard → `source-served` (no mutation, no move)
3. ordinary color/capacity transfer determination (maximal m preserved)
4. candidate destination contents derived
5. candidate completing an ordered cup with order > prefix+1 →
   `serve-order` (WHOLE action rejected, never partial m)
6. commit normal pour (tea economy untouched, 4 units per color)
7. metadata `serveCompleted: 1 | 2 | null` from prefix before vs after
   (UX only — replay re-derives, never trusts metadata)

Rejection precedence keeps obvious errors meaningful: only a genuinely
otherwise-legal pour whose result would illegally complete a future cup
returns `serve-order`. Win requires ordinary end-state AND served prefix
=== ordered count (2); ①-empty/②-full and ①-full/②-empty boards with
satisfied local rules are NOT won.

## Canonical identity (static, no served markers)

`cupConstraintSignature` appends `:O1` / `:O2` (`N:_:O1`); absent order
keeps legacy strings byte-identical (no `:O_` markers). ①, ② and
ordinary cups never canonicalize as interchangeable; ordinary cups keep
normal symmetry. No `#served` / `#prefix` markers — served status
derives from tea + static constraints. Solver is the ONE existing 0-1
BFS (every serve is an ordinary cost-1 POUR); deadlock/constructive
classification flows through the same state-aware rules (a valid SERVE
is constructive; served cups expose no source actions).

## Production shape

Standalone only (no Mystery/teapot/targets/sink/tasting/thermos/
lemon/honey/strainer/ice/cinnamon/tea-bloom/blend — validation rejects
all combos; chemistry × order fails closed). `serveOrderCount: 0 | 2`
request; `serving-order` template bank (18 robust L2, roles c0..c3,
serve indices ride with cups); bounded fast path (≤4 attempts, 1 solve);
pinned L2 fallback. Rollout 105–112 (106 tutorial, 110 repeat;
107 tasting+mystery, 111 honey+mystery familiar peaks), challenge-only
rotation afterwards. Saucers: porcelain accent + vector ①/② medallion
(shape-coded, never color alone); served settle flourish ~320ms on the
existing ticker; soft hints «Сначала подай чашку ①» / «Эта чашка уже
подана» (no alarms); cup ② never looks disabled.
