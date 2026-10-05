# Spike: G9 STRAINER × HONEY — FAILED, DO NOT SHIP / DO NOT MERGE

Archival evidence for the rejected hypothesis
«Ситечко и мёд» / HONEY_HANDOFF (strainer + sinking honey interaction).

This branch exists ONLY to preserve the negative result.
Never merge into `main`. Never build production on it.

## Exact gate topology

- 4 colors, 5 vessels, 1 empty, 16 tea units (tight G6 topology)
- Palette `[buckwheat, matcha, karkade, sea_buckthorn]`, c0 = buckwheat fixed
- One honey on a random mixed-full standard normal host
- One catch-one strainer, stand-empty
- All vessels standard normal; no other specials
- WITH: strainer present + honey. WITHOUT: same tea + same honey, strainer absent
- Production `solvePuzzle` (budget 120k visits), production `canonicalPuzzleKey`
- Harness: `scripts/dev/strainer-honey-search.ts` (dev-only, committed here)

## 10k results (seeds `strainerhoneygate:<s>`, s = 0–9999)

| metric | value |
|---|---|
| sample | 10,000 |
| with-tool solvable | 2,868 (28.7%) |
| without-tool solvable | 1,381 |
| rescued (with solv, w/o unsolv, neither truncated) | 1,487 (14.9%) |
| L1 (honey goal + win) | 2,868 |
| L2 (rescued + productive placement + HONEY_HANDOFF + catch + release + held-null + honey goal + win) | 1 |
| L3 (L2 + rejoin into honey host) | 0 |
| canonical-distinct L2 (need ≥ 30) | **1 — GATE FAIL** |
| canonical-distinct L3 | 0 |
| truncations with / without | 0 / 0 |
| visited with p50 / p95 / max | 141 / ~316 / ~576 |
| visited without p50 / p95 / max | 27 / 52 / ~98 |
| solve ms with p50 / p95 | 4 / ~12 |
| solve ms without p50 / p95 | 1 / 2 |

Supporting diagnostics: strained pour from the current honey host occurs in
~14.8% of optimal solutions (always partial — honey stays); the honey host
is homogeneous-2+ at some point in ~70% — but strained **emptying**
(handoff) is optimal in ~0.01%.

## The single L2 (seed 5199, depth 15, `withVisited=502`)

- cups (c0=buckwheat): `[["c3","c2","c1","c2"],["c0","c3","c1","c2"],["c0","c1","c2","c3"],[],["c0","c0","c1","c3"]]`, honeyHost 0
- 1 placement (depth 7) → 1 handoff (depth 8, ratio 0.53) → 1 release (depth 15)
- honeyMoves 2, honeyStays 4, rejoins 0 (caught tea never rejoined — not even L3)

## Structural domination explanation

A strained emptying pour from a honey host is legality-identical to the
corresponding ordinary emptying pour (strained ⊂ ordinary: same tea/color/
capacity rules, plus m ≥ 2), but costs one extra move (the mandatory later
release of the caught layer). The cost-minimizing 0-1 BFS therefore strictly
prefers the ordinary honey move whenever both are legal and constructive.
HONEY_HANDOFF can be optimal only in narrow symmetric-empty-destination
corners where the ordinary move is pruned as a vessel permutation while the
strained move stays constructive via tool-state change. Random tight-topology
mining essentially never lands there (observed ~0.01% vs required ≥ 0.6%).

Rule-level mechanism itself is sound (verified by direct execution):
partial strained honey pour stays (§41 analogue), handoff empties + moves
honey (§42 analogue), release into honey host is inert (§43 analogue),
occupied-honey-target rejects atomically (§44 analogue), placement on a
honey host is valid, attached+honey canonical coexistence + permutation
invariance hold. The failure is density, not correctness.

## Conclusion

**DO NOT SHIP. DO NOT MERGE.** G9 was re-scoped to STRAINER × SINK-ONLY
(«Ситечко и чашка гостя», GUARDED_SINK hypothesis) in a fresh worktree.
