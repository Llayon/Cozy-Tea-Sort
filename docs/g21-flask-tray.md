# G21 — Flask + Shared Tray / «Колба + поднос»

Shipped winner of G21 composition research. Source base:
`2288260a5ec9e7053c678229bc1f567fe73588fc`.

## Composition

Exact production class:

- 4 colors / 6 vessels / 16 tea layers;
- topology `4,4,3,3,2,0`;
- shared tray on indices 2 and 3: 3+3 = 6/6;
- empty steeping flask on index 5: cap4, must end empty;
- ordinary mixed cups: 4/4 at 0,1; 2 at 4;
- no ordinary empty vessel;
- no third mechanic; no same-cup composition.

Both existing contracts remain active and derived:

```text
FLASK: COMMIT → STEEPING_PRESSURE → READY 4/4 → CLEAN_DECANT → EMPTY
TRAY:  SHARED_PRESSURE → GROUP_RELEASE → GROUP_REFILL
```

No `ComboState`, `flaskTrayProgress`, `orderTrayProgress`, `interactionFlags`
or parallel authoritative metadata exists.

## Research result

E6 5000 confirmatory:

- 5000/5000 solvable, 0 truncated;
- C2 4565 (91.3%), canonical 4564;
- C3 2080 (41.6%), canonical 2080;
- C3X 3277 (65.5%);
- C4 0 (bonus only);
- depth p50/p95/max 12/14/16;
- solver p50/p95/max 116/214/337 ms;
- state multiplier p50/p95 0.86/1.06;
- fairness 50/50 root/constructive/optimal first, 0 fatal first moves,
  0 doomed.

It beat A6 (Flask+Order), B6 (Tray+Order) and D6 (Flask+Pair; C3 = 0).
Full matrix: `docs/g21-composition-research.md`.

## Compatibility

Promoted exactly one pair:

```text
mechanicCompatibility('steepingFlask','sharedTray')
→ sameLevel: allow
→ sameCup: forbid
```

All other G16/G17/G20 verdicts are unchanged. The generic composition
validator does not gain new partners. Production request validation allows
shared tray only inside the exact two-flag class.

## Production bank

`src/game/logic/steepingFlaskSharedTrayTemplates.ts`:

- 12 canonical templates;
- depth 10–14 (p50 12, p95 14);
- 12/12 exact depth, FULL C2, clean flask decant, no partial release;
- 12/12 C3 and C3X curation metadata;
- 6 deterministic TeaRole permutations per template;
- tray members [2,3] and flask [5] ride with fixed identity;
- fallback = first bank template (`flask-tray-10-23`), exact depth 10.

## Generator / fast path

- Exact matcher `steepingFlaskSharedTrayTemplateKindFor`;
- standalone flask/shared matchers explicitly return null for combo requests;
- sealed bank, ≤4 attempts;
- happy path 1 solver call;
- no runtime controls, C3, C3X or C4;
- runtime `finalizeCandidate` verifies FULL C2 (flask + tray traces) and
  winner structure before returning;
- 200 seeds: 200/200, 0 fallback, 137 distinct starts, depth 10–14,
  attempts p50/p95 1/1, solver calls 1;
  generator p95 191 ms, solver p95 189 ms, state multiplier p95 1.11.

## Rollout V4

- G20 frozen exactly through L873.
- V3 remains through L778; L779 peak, L780 relax, L781 warmup.
- V4 starts L782; 28 slots / 112 levels.
- Slots 0–22 and 24–27 are exactly V3.
- Slot 23 replaces standalone Tasting with FLASK_TRAY.
- First intentional diff / first combo: **L874**.
- Second combo: **L986** (no tutorial).
- Combo cadence 112; challenge-only; no peak/warmup/relax leakage.
- 10 complete V4 decks verified.
- Tutorial at L874 only: «На подносе по-прежнему всего 6 мест. Из
  заварочной колбы можно переливать только когда она полная.»
- Subtitle: «Колба + поднос • 6 сосудов».

## UX

Both existing visual languages compose, with no combo badge:

- tray plank and six shape-coded markers remain continuous;
- flask remains a slender carafe with empty/partial/ready cues;
- flask is not on the tray, not numbered, not a third mechanic;
- 360/390/430 layouts green; screenshots:
  `scripts/dev/out/g21-flask-tray-L874-{360x800,390x844,430x932}.png`;
- partial screenshot: `g21-flask-tray-L874-partial.png`;
- rapid partial-source taps do not move; Undo/Restart/Reshuffle restore the
  exact composition.

Bundle: 896.28 kB vs G20 887.67 kB = **+8.61 kB (+0.97%)**.

## Tests

- `composition2-compatibility.test.ts`
- `composition2-templates.test.ts`
- `composition2-fastpath.test.ts`
- `composition2-undo.test.ts`
- `composition2-view.test.ts`
- `composition2-rollout.test.ts`
- `e2e/g21-flask-tray.spec.ts`
- V4 snapshot: `tests/fixtures/g21-rollout-v4-snapshot.json`.

G20 freeze tests remain through L873; G18/G19 freezes unchanged through
L557. Existing G15/G16/G17/G20 banks are not re-curated.
