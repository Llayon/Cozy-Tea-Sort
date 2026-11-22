# Choice Brew — production mechanic (Gauntlet 22 «Выбор заварки»)

## Player rule

One vessel on the board is the brewing vessel (чаша выбора). It brews exactly
like an ordinary vessel, but it carries a historical objective: fully brew
(`AAAA`) either one of the two marked teas in it — once. After that the
objective stays completed even after the vessel is emptied, and the vessel
must still end empty for victory.

- Stage 0 (`не заварено`): neither allowed tea has been fully brewed yet.
- Stage 1 (`заварено`): one of the two allowed teas has been fully brewed
  at least once. The mark persists; the tea itself may leave.

Victory = ordinary puzzle victory AND brewing vessel empty AND stage 1.

## Domain contract

Static (immutable level data, `ChoiceBrewContract` in
`src/game/logic/choiceBrew.ts`):

```ts
interface ChoiceBrewContract {
  vesselIndex: number;              // the one brewing vessel
  allowedTeas: readonly [TeaId, TeaId]; // unordered pair, A != B
}
```

Valid production shape: exactly one vessel `normal / capacity 4 /
mustEndEmpty`, all others plain ordinary; pair of two distinct known TeaIds;
vessel in range. Standalone only — any sibling special fails validation.

Dynamic history (the ONE mutable truth,
`PuzzleState.choiceBrewState: { stage: 0 | 1 } | undefined`):

- absent = no Choice Brew mechanic (legacy boards unchanged);
- `advanceChoiceBrewState(previous, nextCups, contract)` — pure seam called
  atomically inside `applyPourState`;
- monotonic `0 → 1` during normal play; Undo restores the snapshot exactly;
  restart re-initializes to stage 0 with the contract intact;
- no `chosenTea` is ever stored.

## Canonical state

Solver key suffix `||CB:<pair>:<stage>` where `<pair>` is the
order-normalized static pair (`[A,B] ≡ [B,A]`) and `<stage>` the history.
Same cups with stage0 ≠ stage1 key differently; different pairs key
differently. No Choice Brew → byte-identical legacy keys (pinned). No TeaId
renaming exists anywhere in canonicalization (audit 2026-11-22), so only
order normalization is applied.

No constructive-pruning change was needed: the brewing vessel lives in its
own constraint-signature group (`N:_:C4:E`), so both the milestone-advancing
pour (ordinary → brewing vessel) and the drain (brewing vessel → ordinary)
always cross signature groups and stay constructive. Pinned by test.

## Persistence

Audit result (2026-11-22): the game persists NO active puzzle state. The
only persisted module is `src/game/storage.ts` (`currentLevel`,
`highestUnlockedLevel`, recipes, skins, mute) — no cups, constraints,
history, moves, seeds, versions, or schemas. A page reload restarts the
current puzzle (documented, acceptable policy), so a Choice Brew stage can
never be "lost" across a save boundary: there is no run-save path.

Consequences, all pinned by tests:

- No save-schema bump, no migration. Old saves (which contain no history)
  load unchanged; absent history stays absent.
- The in-memory level backup (`LevelBackupState.choiceBrewContract` in
  `src/App.tsx`) carries the static contract so restart/reshuffle rebuilds
  the mechanic at stage 0 — a restart after the milestone never silently
  drops the objective (victory would otherwise be unreachable).
- `TeaSortLogic` snapshots `choiceBrewState` in `GameStateSnapshot`; Undo
  restores the exact stage (multi-step Undo pinned through milestone).
- Malformed restores fail closed: history without a contract never wins;
  an out-of-range stage normalizes to 0 (never granted).

If a future run-save feature is added, the save MUST include both the
static pair/vessel and the stage, and MUST NOT trust a client-supplied stage
without the validation in `isValidChoiceBrewContract`.

## Generator

Frozen topology CB: 4 colors × 4 units, 6 vessels `4,4,4,4,0,0` — one empty
brewing vessel (index 4) + one ordinary empty (index 5).

- Curated bank `src/game/logic/choiceBrewTemplates.ts`: 18 templates
  (3 per unordered role-pair × 6 pairs), role-based `c0..c3` over the
  sorted palette so TeaRole permutations preserve structure. Curated from
  G30 confirmatory evidence (integrated, non-ritual, non-incidental,
  post-work ≥ 2); every template replays to a win with the milestone
  triggered on the identity instantiation (depth 10–15, stageMove 2–4).
- Instantiation: seeded bank pick → seeded full palette permutation
  (bijection roles→teas) → static constraint + deterministic pair
  (`order[roleA], order[roleB]`); no solver-outcome-dependent pair choice.
- Production gate per candidate (`finalizeCandidate`): valid contract,
  vessel starts empty, ordinary empty buffer kept, FULL history-aware solve
  (budget 120k, depth band 8–18), replay wins + stage triggers + vessel ends
  empty, CONTROL solvable + CONTROL-optimal replay does NOT trigger
  (non-incidental). Fallback: identity instantiation of `choice-brew-01`,
  else loud error (never a silent wrong-mechanic level).
- Attempts: max 6 bank validations per level (never a 150-deal scan).

200-seed production sample (4 palettes × 50 seeds, direct requests):

```text
success 200/200, fallback 0, truncation 0, replayFail 0, pairWrong 0,
stageWrong 0, bothSolved 200
depth p50 11 / p90 14 / max 15
solver p50 69ms / p95 144ms (target p95 ≤250, preferred ≤200)
visited p50 1671 / p95 3242
attempts p50 1 / p95 1 / max 1
distinctRoots 186/200
pair spread: 17 tea-pairs, max 19/200 (9.5%) — no dominance
FULL−CONTROL delta p50 +1
special touch p50 0.29 / p95 0.36 (envelope preferred ≤38%)
stage timing p50 0.27 / p90 0.36 (early integration, not late ritual)
postWork ≥2: 100% · replan heuristic 100% · taxOnly 0 · incidental 0 ·
roundtrip heuristic 0
state multiplier p50 1.43 / p90 1.44 / p95 1.50 / max 1.56, ≥2.0×: 0
(envelope p95 <2.5, warning >2.0)
```

All §176 hard gates and §178 preferred targets pass with wide margins.
(Tax/integration heuristics here are the conservative G30-style
classifiers; the bank itself was curated with G30 INTEGRATED boards.)

## Pair assignment

Deterministic from seed → template → TeaRole permutation. The bank holds
exactly 3 templates per unordered role-pair; fast-path picks uniformly
(`rng`), so role-pairs are covered by construction. Tea-pair spread is
reported per sample (17 combos observed, none dominant). Pair is fixed
before solving — never selected from solver outcome (§56, §109).

## UX states

| State | Pair markers | Completion marker | Can receive | Can source | Can win |
|---|---|---|---|---|---|
| stage0 empty | yes (two dots) | no (hollow ring) | yes | n/a | no |
| stage0 partial | yes | no (hollow ring) | yes | yes | no |
| stage0 full wrong tea | yes | no (hollow ring) | full | yes | no |
| stage0 full pair tea | yes | transition bloom | full | yes | no |
| stage1 partial | yes (dimmed) | yes (gold seal) | yes | yes | no |
| stage1 empty | yes (dimmed) | yes (gold seal) | yes | n/a | maybe if others done |
| stage1 final solved | yes (dimmed) | yes (gold seal) | — | — | yes |

- Vessel identity: copper rim band on the brewing vessel (distinct from the
  flask carafe, tasting bowl, thermos).
- Pair indicators: two persistent tea-color dots on the glass, always
  visible (never modal-only, never text-only). Retained dimmed after stage1
  (no layout jump).
- Stage 0: hollow copper ring joining the dots — restrained, no lock icon,
  no red/error state, no disabled appearance. Vessel fully usable.
- Stage 1: filled gold seal + check tick + halo + steam tick — persistent
  completion, visible with the vessel empty. Does not imply "finished, do
  not touch" (no lock affordance; tea keeps flowing).
- Transition: one 600ms steam shimmer + reveal sparkles + existing
  success sound/haptic, fired only on the actual 0→1 transition
  (`choiceBrewCompleted` presentation metadata from `makeMove`, never
  stored, never replayed on reload/later full pair tea/undo snapshots).
- Wrong tea: accepted under ordinary Water Sort rules; no error, no grey
  affordance (pair describes the milestone, not pouring legality).
- No per-vessel screen-reader labels exist in the current game (same for
  flask/pair/tray); the mechanic subtitle + tutorial copy carry semantics.
- No new persistent particles; seal is static cheap vector drawing.
- No text-only pair: dots use the teas' own liquid colors, shape-coded
  (dots vs seal ring) beyond color alone.

Tutorial (one-time, L1998): «Полностью завари в этой чаше один из двух
отмеченных чаёв. Заваривание засчитается — потом чай можно переливать
дальше, но к концу чаша должна остаться пустой.» Subtitle:
«Выбор заварки • 2 подходящих чая».

## Rollout

- New progression version V5 from challenge level 1902
  (`ROLLOUT_V5_FIRST_CHALLENGE_LEVEL`), 28-slot deck, 112-level cadence.
- V5 deck = V4 deck with exactly one slot changed: slot 24 (second
  familiar lemon; lemon still recurs at slot 7, max gap stays exactly 112)
  becomes Choice Brew. The flask keeps slot 0 and the winner composition
  stays at slot 23, so the flask-112 cadence and the 874+112k combo grid
  hold for all levels 1–10000. Everything below L1902 is byte-identical to
  current production (frozen prefix incl. the 874–1600 snapshot and 10
  exact V4 decks through L1901).
- First exposure L1998 (standalone, quad0 palette, tutorial once).
- Second exposure L2110 (next deck slot 24, still standalone).
- Cadence: 1 Choice Brew challenge per 112 levels initially (rare, like
  the flask debut); peak/warmup/relax policy untouched (no peak Choice
  Brew); no composition at launch (all siblings `research`/`forbid`).
- Determinism: same level+seed+version → same board/pair (seeded bank +
  permutation; pinned by tests).
- Long-run: combo grid verified to L10000; boundary levels deterministic.

## Compatibility

Choice Brew ships standalone. It registers in
`mechanicCompatibility.ts` as `research`/`forbid` against every sibling
special (sameLevel research/unsupported, sameCup forbid; blend explicitly
forbidden). Same-cup combinations are statically contradictory.

## Future composition

Explicitly out of scope for G31.

## Independent review (pre-merge critic)

10-point adversarial pass over history loss, canonical merging, prune
correctness, save/reload, pair desync, chosenTea, rollout freeze, bank
curation, roundtrip gating, composition leaks: 9/10 PASS. One real find —
the production finalize gate enforced non-incidental but not post-work,
so a 1-move fill-and-drain ritual could pass. Fixed: the gate now requires
`FULL minMoves − firstBrewDepth ≥ 2` (bank evidence minimum is 7), pinned
by a deterministic 3-seed generation test. Other notes (dead 2-cup
pseudo-state helpers with zero callers; release-into-full-pair edge
unreachable without strainer+brew composition) required no change.

## Quality gates (final)

- `bun install --frozen-lockfile`: PASS.
- `bun run typecheck`: PASS (exit 0, including after every phase).
- Focused: domain 28/28, generation 10/10 (incl. post-work ≥ 2 +
  non-incidental pin), progression 11/11, tutorial audit 4/4 — PASS.
- Canonical `bun run test`: (recording on completion; startup validation
  clean after registering the Choice Brew batches).
- `bun run build` / `GITHUB_PAGES=true bun run build`: (recording).
- `bun run test:e2e:ci`: (recording; pre-existing specs unaffected — no
  choice-brew level below L1902, bridge autoSolve now contract-aware).
- Independent critic pass: 9/10 (one real find — missing post-work
  assertion in the finalize gate — fixed + pinned by test).

## QA (browser, dev server)

Playwright temp specs (all PASS, then removed): pilot on L1902 (7 tests,
360/390/430 + desktop — motif rendering verified on the pre-fix deck)
superseded by the shipped-configuration run on the true debut L1998
(390px + desktop, 2 tests).

- stage0 empty + pair dots + hollow ring + tutorial banner: verified
  (L1998).
- stage0 partial and wrong tea accepted with no error and no milestone
  (stage stays 0): verified (L1998).
- Milestone success (stage1 full brew + seal + bloom): verified (L1998).
- Solved (stage1 empty + seal + victory modal «Купаж уровня 1998 собран!
  ... за 12 ходов»): verified end-to-end in browser.
- Tutorial fires once at L1998; absent at L2110: verified.
- No console/page/asset errors on any viewport.

Physical device: NOT DONE (no device access; simulator/browser only).
Telegram webapp: header/safe-area layout unchanged (no regression in
screenshots); haptic uses the existing success/selection path.
Reload/resume: no run persistence exists by design (refresh restarts the
level at stage 0 — covered by restart unit tests + existing release-journey
reload flows).

## Limitations

Standalone only (no compositions); deterministic solver tie-breaking;
no physical-device QA; wall-clock timing varies by hardware.
