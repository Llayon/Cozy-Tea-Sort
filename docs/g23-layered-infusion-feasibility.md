# G23 — Ordered Layered Infusion feasibility

**Verdict: STOP — MECHANIC REJECTED FOR THE FROZEN G23 CONTRACT.**

The kernel is implementable through the existing pour truth and is covered by
focused tests. The frozen feasibility profile, however, is arithmetically
unwinnable: a special cup that permanently holds 2–3 layers leaves 14 or 13
tea units, while ordinary capacity-4 cups can only end empty or full. Neither
14 nor 13 is a multiple of 4. This is independent of board, seed, generator,
recipe order or solver quality.

No production template, fast path, rollout, UI, tutorial, new action, new
TeaId or merge was added. G24 was not started.

## 1. Starting SHA

`428755b6ba4a3dc6ec7cca87b3cbeb2b8d1a13c6` — `origin/main` (G21 final).
Working tree of the original repository was dirty with unrelated pixel-art WIP;
it was never checked out, stashed, reset, cleaned, staged or committed.

## 2. Ending research SHA

Kernel/evidence commit on `spike/g23-layered-infusion-feasibility`:
`7e3c793db344a81a819d7d0dabf07825c6007c31`. This report is the next commit
on the same branch; the final branch head is recorded in the handoff.

## 3. Worktree and branch

- Worktree: `D:\Programms\Max\Cozy-Tea-Sort-g23-layered-infusion`
- Branch: `spike/g23-layered-infusion-feasibility`
- Base: `428755b6ba4a3dc6ec7cca87b3cbeb2b8d1a13c6`
- Original worktree `D:\Programms\Max\Cozy-Tea-Sort` untouched.

## 4. WIP fingerprint before / after

- Method reproduced from G22: all tracked + untracked (non-ignored) files,
  SHA-256 per file, `HASH  SIZE  ABSOLUTE_PATH`, sorted, UTF-8 BOM, CRLF.
- Files hashed: **182**
- Before: `7E2B50E0F4DB2B990BF6B45D4335450AB8A53FE00DDEAD2EA6C989D796684838`
- After:  `7E2B50E0F4DB2B990BF6B45D4335450AB8A53FE00DDEAD2EA6C989D796684838`
- Diff hash before: `598dc4daa5b63bac969a8ceae0e9a6597cee161d`
- Diff hash after:  `598dc4daa5b63bac969a8ceae0e9a6597cee161d`

Exact match. The original WIP is byte-identical.

## 5. Architecture audit

### 5.1 Reusable existing machinery

- `CupConstraint` is already the single static vessel-identity record
  (`mode`, target, capacity, must-end-empty, order, shared, pair, flask).
- `cupConstraintSignature` is the single canonical grouping signature.
- `teaRejectCodeBetween` / `pourRejectCodeState` are the one legality truth.
- `pourCountState` / `unstrainedPourCountState` are the one transfer-count
  truth; `applyPourState` is the one atomic transition.
- `cupEndStateSatisfied`, `isInFinalState`, `isPuzzleWonState` are the one
  completion/victory truth.
- `canonicalPuzzleKey` groups vessels by signature; `solvePuzzle` is a 0-1 BFS
  over the same actions; deadlock uses the same constructive-move predicate.
- `TeaSortLogic` snapshots whole cup arrays + static constraints, so undo and
  restart already carry recipe identity without additional state.

### 5.2 Can existing Targets express the contract?

**No.** A Target is final-state-only: one named TeaId, full homogeneous,
capacity 4. It has no interim destination gate, no ordered prefix, no
different-next-Teal rule and no exact non-homogeneous final array. Blend is
chemistry, Tasting is a temporary must-end-empty bowl. None of them expresses
“accept A, then only B, then only C; exact bottom→top array wins.”

### 5.3 Minimal kernel changes

1. `CupConstraint.layerRecipe?: readonly TeaId[]` — static bottom→top recipe.
2. `isValidLayeredInfusionConstraint` — fail-closed shape validation (normal,
   capacity 2/3 = recipe length, distinct known TeaIds, no contradictory
   target/end-empty/order/shared/pair/flask fields).
3. `cupConstraintSignature` — recipe suffix `:LRn:A>B[>C]`; legacy signatures
   remain byte-identical.
4. `teaRejectCodeBetween` — recipe destination gate: only the next expected
   TeaId; wrong layer / malformed recipe fail closed; full still `target-full`.
5. Transfer bound in `unstrainedPourCountState` and `pourCountState` — never
   pour past the currently expected recipe run (with distinct recipes this is
   exactly one layer, so a longer same-tea source run is partially consumed).
6. `cupEndStateSatisfied` / `isInFinalState` / `teaWonState` — exact full
   recipe array; malformed recipes never win.
7. Canonical recipe-bearing vessels include their physical cup index
   (`...@idx`) so recipe length, sequence and special-cup position are all
   distinct keys.

No second solver, no second pour implementation, no new action, no new
TeaId, no global state, no mutable recipe progress.

### 5.4 Single source of truth preserved

- One `applyPourState`.
- One `pourCountState` / `unstrainedPourCountState` pair.
- One `canonicalPuzzleKey`.
- One win predicate.
- One solver (`solvePuzzle`) and one deadlock predicate.
- Recipe progress and the next expected ingredient are derived exclusively
  from `layerRecipe` + current layers.

### 5.5 Canonical key

Recipe-free keys are unchanged (focused regression asserts exact pre-G23
strings). A recipe vessel contributes:

`N:_:C2:D:LR2:matcha>karkade` / `N:_:C3:D:LR3:...` plus `@<cupIndex>` in the
canonical group signature. Thus L2 vs L3, `[A,B]` vs `[B,A]`, and special cup
at index 2 vs 3 never collapse. Malformed recipes still get a distinct
`:LR...` marker and fail closed.

### 5.6 No additional mutable state

There is no `recipeProgress`, cursor, chosen tea, completed-ingredient list,
locked recipe or recipe-specific snapshot field. Undo/restart/reshuffle only
need the existing static constraints and existing cup snapshots.

## 6. Implemented kernel contract

| Rule | Implementation |
|---|---|
| Static recipe | `CupConstraint.layerRecipe`, bottom → top |
| Distinct TeaIds | `isValidLayeredInfusionConstraint` |
| Cup starts empty | Research preflight builds it empty; rule itself allows any valid prefix |
| Only next expected tea | `teaRejectCodeBetween` |
| Wrong tea rejected | `target-recipe-wrong-layer`, no state change |
| Remaining recipe bound | `layerRecipeTransferLimit` |
| Multiple same top layers | partial transfer of exactly the needed run |
| Special cup as source | ordinary source rules (no recipe source gate) |
| Auto position after drain | expected = `recipe[layers.length]` |
| Exact victory | `cupEndStateSatisfied` requires full array equality |
| Incomplete recipe | never victory |
| Malformed recipe | `target-recipe-invalid`, never victory |
| No transformations | no chemistry / new TeaId |

## 7. Frozen profiles and arithmetic blocker

Shared topology: 4 TeaIds, 4 units each, 16 units, 6 vessels, 5 ordinary
capacity-4 cups + one empty special cup; ordinary initial multiset
`4,4,4,4,0`.

At victory:

- special cup holds exactly `k` layers, `k = 2` (L2) or `k = 3` (L3);
- every ordinary cup is empty or full homogeneous capacity 4;
- therefore the tea left in ordinary cups is `16 - k` and must be a multiple
  of 4.

`16 - 2 = 14`, `14 mod 4 = 2`. `16 - 3 = 13`, `13 mod 4 = 1`.

Neither can be partitioned into ordinary cups. The same argument applies
per TeaId: taking one layer of a colour leaves 3 units of that colour, which
can never form a full 4-layer ordinary cup. Therefore **every** board in the
frozen profile is unwinnable, regardless of recipe order or seed. This is a
mechanic/resource-accounting incompatibility, not a solver or sample artifact.

## 8. L2 results (N = 2000)

- Seeds: `g23-layered-infusion:0` … `g23-layered-infusion:1999`
- Production request: `numColors=4`, palette
  `[matcha, sea_buckthorn, karkade, milk_oolong]`, `emptyCups=2`,
  `hasMysteryLayer=false`, `phase=peak`
- Special position chosen deterministically from the two generated empties
  (`i % 2`); recipe chosen from all 12 ordered pairs (`i % 12`).
- Raw: `scripts/dev/out/g23-layered-infusion-preflight-2000.json`
- Summary: `scripts/dev/out/g23-layered-infusion-preflight-2000-summary.json`
- Payload SHA-256:
  `3af528654d2ddba629f09132aa0d0dd9e356ae85d92088ade3e1fe5419085f84`

| Metric | Value |
|---|---:|
| Sample count | 2000 |
| Solvable | **0** |
| Unsolvable | **2000** |
| Truncated | 0 |
| L1 (special cup empty at win) | 0 (contract requires full recipe) |
| Canonical unique starts | 2000 / 2000 |
| 200-seed canonical variety | 100% |
| Base (ordinary) minMoves p50 / p95 / max | 12 / 14 / 14 |
| Layered minMoves p50 / p95 / max | N/A (no solvable replay) |
| Solver time p50 / p95 / max | 13.189 / 23.774 / 47.038 ms |
| Visited states p50 / p95 / max | 302 / 507 / 704 |
| Special position histogram | 0:341, 1:320, 2:337, 3:358, 4:330, 5:314 |
| Recipe histogram | 12 ordered pairs, 166–167 each |

Recipe interaction metrics (first/second ingredient move, ordinary moves
between ingredients, sources used, special-as-source, refill count) are
**N/A**: there is no optimal replay to analyze because every board is
unsolvable. Denominator = 0 solvable boards.

## 9. L3 results (N = 2000)

Same seeds and base boards as L2. Recipe chosen from all 24 ordered triples
(`i % 24`); special capacity 3.

| Metric | Value |
|---|---:|
| Sample count | 2000 |
| Solvable | **0** |
| Unsolvable | **2000** |
| Truncated | 0 |
| L1 | 0 (contract requires full recipe) |
| Canonical unique starts | 2000 / 2000 |
| 200-seed canonical variety | 100% |
| Base (ordinary) minMoves p50 / p95 / max | 12 / 14 / 14 |
| Layered minMoves p50 / p95 / max | N/A |
| Solver time p50 / p95 / max | 26.419 / 46.091 / 166.534 ms |
| Visited states p50 / p95 / max | 543 / 886 / 1181 |
| Special position histogram | 0:341, 1:320, 2:337, 3:358, 4:330, 5:314 |
| Recipe histogram | 24 ordered triples, 83–84 each |

Interaction metrics: **N/A**, denominator 0.

## 10. Order sensitivity

Reverse recipe was re-solved on the identical board and special cup.

| Profile | Forward solvable | Reverse solvable | Reverse unsolvable | Reverse truncated |
|---|---:|---:|---:|---:|
| L2 | 0 / 2000 | 0 / 2000 | 2000 / 2000 | 0 |
| L3 | 0 / 2000 | 0 / 2000 | 2000 / 2000 | 0 |

Because the forward-solvable denominator is 0, “reverse unsolvable or at
least +1 move” is undefined; the >=20% order-sensitivity gate cannot pass.
Reverse timing stayed within budget (L2 p95 23.844 ms; L3 p95 47.237 ms).

## 11. Interaction histograms

Not produced: no solvable board exists, so there is no optimal replay and no
ingredient move to histogram. The 2000/2000 unsolvability is a mathematical
identity, not a scarcity of interaction events.

## 12. Depths

Layered optimal depth is undefined for both profiles (0 solvable). The
ordinary base boards were generated in the production peak band: histogram
10:390, 11:499, 12:580, 13:395, 14:136; p50 12, p95 14, max 14. This confirms
the generator itself was behaving normally and the failure is the recipe
resource contract, not weak base boards.

## 13. Solver performance

No solver budget increase was used. Both profiles used the production
defaults (`maxVisited=200_000`, `maxDepth=60`).

- L2 forward p95 23.774 ms, max 47.038 ms; 0 truncations.
- L3 forward p95 46.091 ms, max 166.534 ms; 0 truncations.
- Reverse p95 23.844 / 47.237 ms.

The <250 ms hard gate is satisfied, but this is not evidence of feasibility:
the solver is quickly proving unwinnable boards, not finding solutions.

## 14. Fairness

Not run. Fairness is a confirmatory-phase gate, and no pilot profile passed.
No fatal/doom sample was collected or claimed.

## 15. Control results

Focused controls in `tests/layered-infusion.test.ts` (13 tests, all pass):

| Control | Result |
|---|---|
| Wrong first ingredient | rejected `target-recipe-wrong-layer`, no mutation |
| Wrong next ingredient | rejected `target-recipe-wrong-layer`, no mutation |
| Correct ingredient | accepted, exactly 1 layer, source decremented |
| Re-fill after partial drain | accepted; expected position re-derived from current prefix |
| Filled recipe | `target-full`; no overpour |
| Pour beyond recipe | capped to expected run (1 with distinct recipes) |
| Ordinary cup without recipe | legacy color/capacity/count behavior unchanged |
| Reversed recipe | forward first tea rejected, reversed first tea accepted |
| Target mechanic disabled | same pour becomes an ordinary legal empty-cup move |
| Special cup as source | ordinary source rules, drain then refill works |
| Malformed recipe | `target-recipe-invalid`; never satisfies victory |
| Canonical key | L2/L3, sequence, cup position all distinct; legacy keys exact |
| Undo / restart | exact cup + static recipe restored, no extra state |

These controls prove the special destination rule is correct. They do not
make the frozen profile winnable.

## 16. Quality gates

| Gate | Result |
|---|---|
| `bun install --frozen-lockfile` | **PASS** |
| `bun run typecheck` | **PASS** |
| Focused `tests/layered-infusion.test.ts` | **PASS** — 13 / 13 |
| Neighboring regression batch (12 files) | **PASS** — 188 / 188 |
| Full `bun run test` | **FAIL (infrastructure)** — see below |
| `bun run build` | **PASS** |
| `GITHUB_PAGES=true bun run build` | **PASS** |
| `bun run test:e2e:ci` | **PASS** — 33 / 33 (3.8 min) |

Full-suite detail: the canonical runner executed 41 / 166 files and stopped at
batch 14/75 (`G21 composition production stress`) on the repository’s known
`[vitest-worker]: Timeout calling "onTaskUpdate"` RPC error. All 10 tests in
that batch had passed; the runner retried once and hit the identical RPC
timeout with zero assertion failures. This is an infrastructure failure, not
a G23 assertion failure. No PASS is claimed for the full suite.

## 17. PASS / HOLD / STOP and recommendation

**STOP — MECHANIC REJECTED FOR THE FROZEN G23 CONTRACT.**

Hard-gate outcome:

| Gate | Required | Actual | Verdict |
|---|---:|---:|---|
| Solvability | >= 98% | 0% L2 / 0% L3 | **FAIL** |
| Truncations | 0 | 0 | PASS |
| Solver p95 | < 250 ms | 23.8 / 46.1 ms | PASS |
| Depth p50 | 10–14 | undefined (0 solvable) | **FAIL** |
| Depth p95 | <= 18 | undefined | **FAIL** |
| 200-seed canonical variety | >= 70% | 100% (unsolvable starts) | PASS, not sufficient |
| Interaction gates | frozen percentages | N/A (no replay) | **FAIL** |
| Reverse sensitivity | >= 20% | undefined (0 forward solvable) | **FAIL** |

The blocker is the contract itself, not tuning: with `TEA_UNITS_PER_COLOR = 4`
and ordinary cups requiring empty/full-homogeneous cap-4 end states, a special
cup that permanently holds any proper subset of a colour makes that colour’s
remainder (3 units) uncompactable. A 2- or 3-layer recipe is therefore
incompatible with the existing win condition. Making the special cup larger
does not fix it unless it consumes all 4 units of each involved colour; making
ordinary cups partial would change the core victory semantics.

Recommendation: **do not start G24.** Do not rescue this with extra vessels,
removed ordinary cups, more TeaIds, weaker recipes, changed gates or special
L1 templates. If Layered Infusion is revisited, it needs a new contract-level
resource/victory design first (e.g. recipe layers that are not conserved tea,
a special cup that ends empty, or an explicitly different ordinary completion
semantics), and that is a separate gauntlet decision.

## Evidence map

- Kernel: `src/game/types.ts`, `src/game/logic/rules.ts`
- Focused tests: `tests/layered-infusion.test.ts`
- Preflight harness: `scripts/dev/g23-layered-infusion-preflight.ts`
- Raw 2000-seed evidence:
  `scripts/dev/out/g23-layered-infusion-preflight-2000.json`
- Summary:
  `scripts/dev/out/g23-layered-infusion-preflight-2000-summary.json`
- Smaller calibration runs:
  `g23-layered-infusion-preflight-5.json`,
  `g23-layered-infusion-preflight-10.json`
- Test registration: `scripts/run-tests.mjs`
