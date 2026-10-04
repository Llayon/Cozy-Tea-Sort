# Lemon + honey interaction (Gauntlet 8 — «Лимон и мёд»)

## Mechanic
No new ingredient and no new action. One vessel may hold BOTH lemon
(surface) and honey (bottom). A single pour moves each layer by its own
unchanged rule: lemon rides ANY outflow, honey moves ONLY when its host
empties. Partial cohost outflow → lemon moves, honey stays (SPLIT).
Emptying cohost outflow → BOTH relocate together (JOINT MOVE).
Cross-layer occupancy (lemon into honey host and vice versa) is legal;
same-layer collisions fail closed atomically with zero partial mutation.

## Production
Single kind `lemon-honey-interaction`: 4 colors, 6 vessels, 2 empties,
lemon + honey on distinct mixed-full hosts, palettes always containing
sea_buckthorn (lemon) and buckwheat (honey) via c0/c1-fixed roles.
Every bank template is L2 (cohost + split + both relocations + both
goals + win); 6 of 18 additionally show a joint move. Request detection
reuses the existing lemon + honey fields — no new identity field.

## Gate evidence
10k seeds → 88 canonical-distinct L2 (9 L3), depths 8–16, p95 solve 62ms,
0 truncations. Production: 1 template attempt, 1 solver call, 0% fallback.
