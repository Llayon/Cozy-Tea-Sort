# Paired Tea — «Чайная пара» / TEA PAIR (Gauntlet 17)

First RELATIONAL finality axis: exactly two otherwise-normal capacity-2
bowls form one pair. Both stay fully usable and reopenable while sorting,
but the puzzle is won only when BOTH hold the same full homogeneous
two-layer tea. The final tea is **not stored anywhere** — it emerges from
current contents and derives on every call.

Player copy (L250 tutorial):
«Эти две пиалы — чайная пара. В конце в обеих должен быть один и тот же
чай. Какой именно — решаешь по ходу.»

## What it is not

Not target cups (no predefined tea), not a lock, not a new player action
(only POUR), not a new solver, not a second pour implementation, not a
PuzzleState row, not a tea-economy change (4 units per color), not a combo
mechanic (standalone only). A complete pair member remains source-capable,
including anchor reopening.

## State (derived, no new row)

```ts
// CupConstraint.pairedTeaGroup?: 'tea-pair' (static identity only)
// exactly two members, both mode 'normal', capacity 2, no target,
// no mustEndEmpty, no serveOrder, no sharedCapacityGroup
```

No `chosenTea`, `committedTea`, `anchorIndex`, `matched`, `pairStatus`,
history or counters in `PuzzleState`. Everything derives from current cup
contents + static group identity:

- neither member `[X,X]` → `uncommitted`
- exactly one member `[X,X]` → `committed(X)` (anchor = that member)
- both `[X,X]` same tea → `matched(X)`
- both `[X,X]` different teas → `conflict(X,Y)`

Reopening a committed anchor simply clears the commitment. `X×2 + Y×2` is
a legal mid-game state, not an error and not a deadlock.

## Rules

- Pair members use ordinary pour rules. There are no pair-specific
  rejections and no source locking.
- `isInFinalState` is always false for a pair member, so pruning never
  treats a complete member as untouchable. Exact pair→empty relocation is
  legal and stays a canonical self-loop.
- Win requires all non-pair vessels locally satisfied AND the pair matched
  on the same tea. Empty pair, one-full-one-empty and conflict never win.
- Malformed pair layouts fail closed (never match, never win).

## Canonical identity

`cupConstraintSignature` appends `:P` after the existing suffix:
`N:_:C2:D:P` for a pair bowl — distinct from ordinary cap-2 (`N:_:C2:D`)
and tasting cap-2 (`N:_:C2:E`). The two pair members are symmetric and
permute with each other; they never permute with ordinary vessels. Absent
pair markers keep every legacy/G16 key byte-identical.

## Solver + L2

The ONE existing 0-1 BFS is used, with the pair-aware `isPuzzleWonState`.
Production L2 requires a stable segment in the optimal replay:

```
PAIR_COMMIT(X) → PAIR_PRESSURE(X) → later PAIR_MATCH(X) → WIN
```

Commit and pressure may share one post-move state; match must be strictly
later. `commitDepth / minMoves ≤ 0.80` (preferred bank target ≤ 0.65) and
`matchDepth − commitDepth ≥ 2`.

## Compatibility (standalone)

Production is STANDALONE. `teaPair + blend` is FORBID/ FORBID; every other
composition sibling is unproven (research level / forbid cup) and is
rejected at request validation:

`serving order, mystery, tasting, honey, strainer, shared tray, blend,
teapot, targets, sink, lemon, ice, thermos, cinnamon, tea bud`.

`mechanicCompatibility.ts` stays the ONE policy source; G15/G16 decisions
are unchanged.

## Feasibility (DEV-only, production solver)

Two topologies were sampled; both: 4 colors × 4 units = 16 layers, exactly
one `tea-pair` group on vessels [0,1], both pair and all non-empty starts
mixed.

| topology | vessels | lengths | sample | solvable | trunc | L2 | L3 | solver p95 |
|---|---|---|---|---|---|---|---|---|
| **V6 (WINNER)** | 6 | 2,2,4,4,4,0 | 5000 | 98.64% | 0 | 46.84% (canon 2341) | 1591 | ~12 ms |
| V7 (rejected) | 7 | 2,2,4,4,4,0,0 | 2000 | 100% | 0 | 42.0% (canon 839) | 302 | ~426 ms |

V7 was rejected: ~30× solver cost without better L2/L3 density. V6 was
confirmed on 5000 shaped boards: all four final roles represented,
2258/2342 L2 with commit/minMoves ≤ 0.65, all gaps ≥ 2, fairness 50/50
(root constructive, solvable-first, optimal-first), 0 doomed candidates.
Raw evidence: `scripts/dev/out/tea-pair-v6-5000.json`.

## Production shape

- `teaPairCount: 0 | 1` request; exact `4c/6v`, nominal `emptyCups: 2`,
  no Mystery/teapot/siblings; palette = 4 eligible legacy teas (never
  reaction IDs).
- `teaPairTemplates.ts`: 18 curated canonical-distinct L2 templates
  (`pair-*`, V6 lengths, pair members [0,1], roles c0..c3). Curation:
  452 shaped → 200 robust (6 role permutations × both pair-member orders,
  L2 in-band) → 18 selected:
  - 18/18 L2; 10/18 L3A anchor switch;
  - 18/18 commit/minMoves ≤ 0.65;
  - 18/18 gap ≥ 2 (15/18 gap ≥ 4);
  - all four final roles.
- Generator: bounded fast path (`TEA_PAIR_TEMPLATE_ATTEMPTS = 4`, one
  solver call on the happy path), one `finalizeCandidate` gate enforcing
  KE–KZ, dedicated pinned fallback `pair-11-118` (depth 11, ratio 0.18,
  gap 9) with backups. No runtime mining, no plain-control solve, no L3
  diagnostic solve.
- Production stress (220 seeds through the real generator): 220/220
  solvable, 0 fallbacks, one solver call each, attempts max 1; 170
  canonical-distinct starts; depths 10–13 (p50 12); final roles
  c0/c1/c2/c3 = 50/52/61/57; commit/minMoves p50 0.42, p95/max 0.64;
  commit→match gaps 2–10 (all ≥2). Generator p50 8ms / p95 15ms; solver
  p50 8ms / p95 14ms; visited p95 394.
- Rollout: prefix ≤242 byte-identical; L250 challenge tutorial, L330
  second exposure (no tutorial repeat); challenge-only standalone.
  Subtitle: «Чайная пара • 6 сосудов».
- UX: two matching small porcelain bowls (taller rose-trimmed body, side
  ears, paired floral halves), authoritative cap-2 geometry (two readable
  slots — never fake cap-4). Ornament accent derives only from
  `pairedTeaStatus`/`pairedTeaCommittedTea`: neutral uncommitted, shared
  tea accent when committed/matched, each bowl's own local color on
  conflict. Reopening immediately returns to neutral. Matched triggers one
  synchronized steam flourish (~360 ms) inside the existing pour/ticker —
  no green check, padlock, badge, alarm, red border, or second input lock.
  Decorative layers are `eventMode='none'`; normal bowl hitboxes remain.
- Help: «Две парные пиалы в конце должны содержать один и тот же чай — по
  2 одинаковых слоя в каждой. Цвет заранее не задан: подходящий чай
  выбирается по ходу решения.»

## Files

- `src/game/logic/teaPair.ts` (kernel, derived status/validation)
- `src/game/logic/teaPairTemplates.ts` (18-template bank)
- `src/game/logic/generator.ts` (request/fast path/finalize/fallback/trace)
- `src/game/logic/rules.ts` (relational finality/win/deadlock)
- `src/game/types.ts` (`PairedTeaGroupId`, signature `:P`)
- `src/game/logic/mechanicCompatibility.ts` (G17 policy)
- `src/utils/difficultyCurve.ts`, `src/types/tea.ts`, `src/App.tsx`
- `src/game/view/TeaSortView.ts` (paired bowls/motif/flourish)
- `scripts/dev/tea-pair-search.ts`, `tea-pair-curate.ts` (DEV only)
- `tests/tea-pair.test.ts` (kernel) + `tests/tea-pair-production.test.ts`
  (generator/bank/rollout/view/fixtures/stress)
