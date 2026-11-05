# G24 — Contract & Conservation Preflight

**Status:** DEV-only mathematical preflight. No player action, no gameplay
field, no solver rule, no UI, no rollout change, no production invocation.

## 1. What this preflight proves — and what it does not

Given a tea inventory vector and a finite set of terminal vessel/group
contracts, the preflight answers exactly one question:

> Can the inventory be distributed among the supplied terminal contracts,
> with every contract satisfied exactly?

The two meaningful conclusions are:

- **`AlgebraicUnsat`** — no terminal allocation exists. Solver feasibility,
  reachability, fairness and fun are therefore irrelevant for this contract.
- **`AlgebraicallyFeasible`** — at least one terminal allocation exists.

`AlgebraicallyFeasible` is **not** a claim that a puzzle is solvable. It does
not prove:

- reachability from the initial board;
- solver-solvability or a minimum move count;
- fairness, fun, readability or tutorial fit;
- generation performance or template availability;
- that a future mechanic is worth shipping.

A third result, **`Unsupported`**, is returned when the input changes TeaId
identity (chemistry). `Unsupported` is never silently converted into
`AlgebraicUnsat`.

## 2. Current economy (audited from source)

Source of truth: `src/game/types.ts` and the current finality helpers in
`src/game/logic/rules.ts`, `servingOrder.ts`, `sharedCapacity.ts` and
`teaPair.ts`.

| Constant / rule | Value | Meaning |
|---|---:|---|
| `TEA_UNITS_PER_COLOR` | 4 | Every active tea color contributes exactly 4 units. |
| `STANDARD_CUP_CAPACITY` | 4 | Ordinary cup / teapot / guest cup / target / serving cup. |
| `TASTING_BOWL_CAPACITY` | 2 | Tasting bowl physical capacity. |
| `THERMOS_CAPACITY` | 5 | High thermos physical capacity. |
| Shared tray limit | 6 | Two cap-4 tray cups may hold at most 6 layers **at victory**. |
| Tea pair | 2 × cap-2 | Both pair bowls must end full homogeneous of the same tea. |

Per-TeaId conservation holds for every current non-chemistry mechanic:

```
initialCount(t) = sum(finalCount(t) across all vessels and groups)
```

Blend is the only current identity-transforming mechanic. G24 v1 does not
model its chemistry; current Blend input returns `Unsupported` with an
explicit transformation-aware reason. This avoids a false `AlgebraicUnsat`.

## 3. Current finality model

This table was derived from the actual G21 source, not from remembered
mechanics.

| Vessel / group class | Static shape | Allowed terminal contents | Terminal contribution |
|---|---|---|---|
| Ordinary normal cup | `mode: normal`, cap 4 | empty, or 4 homogeneous layers of any TeaId | `0` or `4 × TeaId` |
| Named target cup | normal, cap 4, `targetTeaId: t` | exactly 4 layers of `t` | fixed `4 × t` |
| Teapot | `mode: source-only` | empty | `0` |
| Guest cup | `mode: sink-only`, cap 4 | full 4 homogeneous of any TeaId; empty is **not** allowed | `4 × TeaId` |
| Tasting bowl | normal, cap 2, `mustEndEmpty` | empty | `0` |
| High thermos | normal, cap 5, `mustEndEmpty` | empty | `0` |
| Serving-order cup | normal, cap 4, `serveOrder: 1 or 2` | full 4 homogeneous of any TeaId; completion requires this | `4 × TeaId` |
| Shared tray group | two normal cap-4 cups, `sharedCapacityGroup: 'tea-tray'` | each empty or full 4 homogeneous, with group occupancy ≤ 6 | joint `0` or `4 × TeaId`; **never 8** |
| Tea pair group | two normal cap-2 bowls, `pairedTeaGroup: 'tea-pair'` | both full 2 homogeneous of the **same** TeaId | joint `4 × TeaId` |
| Steeping flask | normal, cap 4, `mustEndEmpty`, `steepingFlask: true` | empty | `0` |
| G21 Flask + Tray | flask + shared-tray group on separate vessels | composition of the two rows above | flask `0`; tray `0` or `4 × TeaId` |

### Important Shared Tray detail

Shared Tray is not terminally equivalent to two independent cap-4 cups.
`isPuzzleWonState` rejects any tray occupancy above 6, so two full 4-layer
tray cups (8 layers) can never be a victory state. G24 models the tray as one
relational group whose terminal options are `0` or `4 × TeaId`. The dynamic
6-layer budget during play is not otherwise simulated.

### Static vs dynamic rules

G24 models terminal conservation and terminal finality only. It deliberately
ignores:

- source readiness (including steeping-flask readiness);
- destination readiness and move ordering;
- serving chronology and served-prefix locks;
- transient shared-capacity pressure;
- temporary ingredients, ice, cinnamon, buds, strainer contents;
- the move graph.

Those rules can affect reachability, but not whether a terminal inventory
allocation exists.

## 4. G23 postmortem

G23 Layered Infusion used:

- 4 TeaIds × 4 units = 16 units;
- five ordinary cap-4 cups plus one special cup;
- a special cup permanently holding the recipe:
  - L2: `A1 B1`
  - L3: `A1 B1 C1`
  - four-color mix: `A1 B1 C1 D1`;
- ordinary cups ending empty or full homogeneous cap-4.

For every TeaId `t`:

```
4 − recipeConsumption(t)
```

must be representable by the remaining terminal units. With ordinary cap-4
storage only, a remaining color count must be `0` or `4`; any other residual
is impossible. Therefore, under this terminal structure:

```
recipeConsumption(t) ∈ {0, 4}
```

for every color. A recipe that consumes 1 unit of several colors leaves
residual 3 of each and is impossible.

G24 reproduces the evidence without depending on the G23 branch:

| Fixture | Special final | Residual | Verdict |
|---|---|---|---|
| `g23-layered-l2` | `A1 B1` | `A3 B3 C4 D4` | `AlgebraicUnsat` |
| `g23-layered-l3` | `A1 B1 C1` | `A3 B3 C3 D4` | `AlgebraicUnsat` |
| `g23-layered-four-color` | `A1 B1 C1 D1` | `A3 B3 C3 D3` | `AlgebraicUnsat` |

### Why total divisibility is not enough

L2 has total residual `14`, which is not divisible by 4. That alone rejects
it. But the four-color mix has total residual `12`, which **is** divisible by
4, while every per-color residual is 3. A total-only check would falsely
accept it. G24 therefore checks per-TeaId representability and then runs the
exact terminal allocation DP.

### Generalization boundary

This conclusion applies to the tested G23 terminal structure under the
current finality economy. It is not a claim that every imaginable layered
mechanic is mathematically impossible. If a future proposal changes any of
the following, re-run the preflight:

- the special vessel ends empty or transforms tea;
- recipe layers are not conserved tea;
- ordinary completion semantics change;
- vessel capacities or counts change;
- a relational group absorbs part of the residual.

## 5. Supported and unsupported contracts

Supported in G24 v1:

- finite per-vessel terminal option sets;
- exact fixed contributions (`A1 B1`, target `B4`, etc.);
- empty-only vessels (`mustEndEmpty`, teapot, tasting, thermos, flask);
- full-homogeneous vessels (ordinary, guest, serving order);
- multiple named targets;
- relational groups with joint options (Tea Pair);
- shared-tray terminal overcap as a joint group option set;
- multi-vessel groups in the API (the current game uses two members).

Unsupported:

- chemistry / TeaId transformation (current Blend);
- arbitrary transformation algebra;
- reachability, move ordering or source/destination readiness;
- serving chronology;
- transient shared-capacity constraints beyond terminal overcap;
- any proposal whose terminal contents are not a finite enumerated set.

Unsupported input returns an explicit reason:

```
chemistry requires transformation-aware accounting;
per-TeaId conservation is unsupported
```

## 6. API

One authoritative function:

```ts
analyzeTerminalAllocation(problem: TerminalAllocationProblem): TerminalAllocationResult
```

Core shape:

```ts
interface TerminalAllocationProblem {
  teaIds: readonly TeaId[];
  inventory: TeaAmounts;          // sparse; missing TeaIds = 0
  units: readonly TerminalUnit[]; // vessels and relational groups
  transformations?: readonly TerminalTransformation[];
}

interface TerminalUnit {
  id: string;
  label?: string;
  kind?: 'vessel' | 'group';
  members?: readonly string[];
  capacity?: number;
  options: readonly TerminalOption[]; // finite legal terminal contributions
}

interface TerminalOption {
  amounts: TeaAmounts;
  label?: string;
}
```

Result:

```ts
{
  verdict: 'AlgebraicallyFeasible' | 'AlgebraicUnsat' | 'Unsupported';
  witness?: { assignments: TerminalAllocationAssignment[] };
  reason?: string;
  residual?: TeaAmounts;
  exploredStates: number;
  diagnostic: TerminalAllocationDiagnostic;
  unsupportedReason?: string;
}
```

`witness.assignments` contains one contribution per terminal unit, including
the chosen option index/label and the unit's member vessel labels. For a
relational group, the assignment is the joint contribution, not two
independent per-cup guesses.

The checker throws `ContractPreflightInputError` only for programmer-invalid
input: duplicate TeaIds, duplicate unit ids, negative inventory, unknown
TeaIds, negative option amounts, empty option sets, or an option exceeding a
declared capacity.

## 7. Algorithm

1. Normalize TeaIds and inventory; validate every terminal option.
2. Deduplicate identical contribution vectors per unit.
3. Separate fixed units (exactly one option) from flexible units.
4. Subtract fixed consumption from inventory.
5. Run sound necessary checks:
   - fixed demand cannot exceed inventory;
   - residual total cannot exceed flexible maximum total;
   - each per-TeaId residual must be in the per-TeaId achievable-sum set.
6. Run exact memoized DFS over flexible units and the remaining inventory
   vector. Suffix bounds prune impossible branches. State key:
   `(flexibleUnitIndex, remainingInventoryVector)`.
7. On success, reconstruct a witness and verify exact conservation.
8. On failure, return the deepest frontier and a per-Tea residual reason.

There is no puzzle solver, no move graph, no randomness, no external ILP
dependency, and no production import. Unit order, option order and TeaId order
do not change the verdict.

## 8. CLI

```bash
bunx tsx scripts/dev/contract-preflight.ts --list
bunx tsx scripts/dev/contract-preflight.ts
bunx tsx scripts/dev/contract-preflight.ts tea-pair
bunx tsx scripts/dev/contract-preflight.ts g23-layered-l2 --json
bunx tsx scripts/dev/contract-preflight.ts --bench
```

Built-in scenarios:

```
classic
tasting
thermos
serving-order
serving-order-tasting
shared-tray
tea-pair
steeping-flask
flask-tray
targets
blend
g23-layered-l2
g23-layered-l3
g23-layered-four-color
artificial-wrong-total
artificial-per-color-residual
artificial-slot-shortage
artificial-fixed-demand-overflow
artificial-full-color-special
artificial-relational-cap2-pair
artificial-multiple-targets
```

Example:

```
Scenario: g23-layered-l2
Verdict: AlgebraicUnsat
Inventory: A4 B4 C4 D4
Fixed/special final: A1 B1
Residual: A3 B3 C4 D4
Reason: Residual TeaId matcha=3 cannot be formed by the remaining terminal
        units (achievable totals: 0, 4, 8, 12, 16, 20).
```

## 9. Engineering process

Every future mechanic that changes terminal tea allocation must run G24
preflight **before** kernel implementation:

```
CONTRACT
→ ALGEBRAIC PREFLIGHT
→ KERNEL
→ SOLVER FEASIBILITY
→ INTERACTION METRICS
→ FAIRNESS
→ PRODUCTION BANK
→ UX
→ ROLLOUT
```

Rules:

- If preflight is `AlgebraicUnsat`, stop. Do not write the kernel, do not run
  large solver samples, do not curate templates.
- If preflight is `Unsupported`, stop and define transformation-aware
  accounting first. Do not assume conservation.
- If preflight is `AlgebraicallyFeasible`, proceed to solver feasibility. The
  positive result is necessary, not sufficient.
- Transient mechanics that end empty usually consume zero final tea and pass
  conservation trivially. Still run the preflight.
- G24 is not called at runtime for generated puzzles and is not integrated
  into the production generator. Such integration would be a separate
  decision.

## 10. Test matrix

Core tests (`tests/contract-preflight.test.ts`):

- G23 L2 / L3 / four-color negatives;
- total-divisibility false-pass pin;
- wrong total, per-color residual, slot shortage, fixed-demand overflow;
- full-color special positive;
- relational cap-2 + cap-2 positive;
- multiple targets positive;
- Blend `Unsupported`;
- input validation;
- witness conservation, non-negative contributions;
- TeaId / unit / option order invariance;
- duplicate-option invariance.

Shipped-mechanic tests (`tests/contract-preflight-existing-mechanics.test.ts`):

- classic, tasting, thermos, serving order, order + tasting;
- shared tray, tea pair, steeping flask, G21 flask + tray;
- named targets;
- Blend unsupported;
- terminal-zero assertions for tasting/thermos/flask;
- relational pair consumes exactly 4 of one tea;
- shared tray witness never exceeds 6 layers;
- G21 witness conserves 16 units.

All positive witnesses are checked for exact inventory conservation. No test
claims puzzle solvability.
