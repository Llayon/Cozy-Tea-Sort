# Spike: G9 STRAINER × SINK — FAILED, DO NOT SHIP / DO NOT MERGE

Archival evidence for the rejected hypothesis
«Ситечко и чашка гостя» / GUARDED_SINK (catch-one strainer + sink-only guest cup).

This branch exists ONLY to preserve the negative result.
Never merge into `main`. Never build production on it.

## Exact gate topology

- 4 colors, 6 vessels, 2 nominal empty roles: 4 filled normal + 1 empty
  standard normal + 1 empty sink-only guest cup at the stable last slot
  (G3 convention), 16 tea units
- Palette `[matcha, sea_buckthorn, karkade, milk_oolong]` (sink has no target tea)
- One catch-one strainer, stand-empty; no Mystery, teapot, targets, tasting,
  lemon, honey
- WITH: strainer present. WITHOUT: same tea + same sink + same constraints,
  strainer absent
- Production `solvePuzzle` (budget 120k visits), production `canonicalPuzzleKey`
- Harness: `scripts/dev/strainer-sink-search.ts` (dev-only, committed here)

## 10k results (seeds `strainersinkgate:<s>`, s = 0–9999)

| metric | value |
|---|---|
| sample | 10,000 |
| with-tool solvable | 7,363 (73.6%) |
| without-tool solvable | 4,548 |
| rescued | 2,815 (28.2%) |
| both solvable, strictly shorter with tool | 0 |
| L1 (sink goal + win) | 7,363 |
| L2 (rescued + productive placement + GUARDED_SINK + release + held-null + sink goal + win) | 0 |
| L3 (L2 + recommit into same sink after ≥1 transfer) | 0 |
| canonical-distinct L2 (need ≥ 30) | **0 — GATE FAIL** |
| canonical-distinct L3 | 0 |
| truncations with / without | 0 / 0 |
| visited with p50 / p95 / max | ~77 / ~180 / ~421 |
| visited without p50 / p95 / max | ~23 / ~46 / ~83 |
| solve ms with p50 / p95 / max | ~2 / ~5 / ~46 |
| solve ms without p50 / p95 | 0 / 1 |

§65 root-cause diagnostics (denominator: 7,363 WITH-solvable optimals):

| diagnostic | value |
|---|---|
| any strainer use | 38.2% |
| strained pour into normal cup | 38.2% |
| strained pour into sink | **0 (0.0%)** |
| sink filled entirely by ordinary moves | **100%** |
| rescued puzzles where tool never touches sink | **100% (2,815/2,815)** |

## Structural cause

The tool has genuine value in this topology (28.2% rescued — pure rescue;
0 strictly-shorter cases), but exclusively as external workspace for the
normal-cup sub-puzzle: every rescued optimal strains into a *normal* cup,
while the sink is *always* filled entirely by ordinary pours. A strained
pour into the sink (cost 1 + mandatory later release 1) is dominated by the
corresponding ordinary pour into the sink (cost 1, same color/capacity
legality) — and unlike the honey case there is not even a pruning corner to
exploit, because ordinary full-homogeneous → empty-sink relocation is
already legal and constructive across differing constraint signatures
(G3 semantics). The forward-searching cost minimizer therefore never withholds
a layer before the irreversible commit: GUARDED_SINK appears in 0/7,363
optimal solutions. Verdict: "tool has value, but not via sink."

Rule-level mechanism itself is sound (verified by direct execution on the
unmodified engine): strained → empty sink (m−1 + catch), strained → partial
sink, release into sink under normal color/capacity rules, wrong-color
release rejected, sink never sources, strainer never attaches to sink,
invalid strained sink pours reject atomically, guarded-sink undo and
release-undo restore exact state. The failure is density (0%), not correctness.

## Conclusion

**DO NOT SHIP. DO NOT MERGE.** No production bank, generator path, rollout,
tutorial, or view work was built. `origin/main` unchanged.
