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

(TODO Phase 4–6: topology, bank, pair permutation, attempts, fallback,
200-seed metrics.)

## Pair assignment

(TODO: deterministic selection from seed/template/TeaRole permutation.)

## UX states

(TODO Phase 7: vessel identity, pair indicators, stage visuals, tutorial.)

## Rollout

(TODO Phase 8: V5 boundary, first/second exposure, cadence, freeze.)

## Compatibility

Choice Brew ships standalone. It registers in
`mechanicCompatibility.ts` as `research`/`forbid` against every sibling
special (sameLevel research/unsupported, sameCup forbid).

## Future composition

Explicitly out of scope for G31.
