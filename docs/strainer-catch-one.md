# Catch-one movable strainer (Gauntlet 6)

## Mechanic
Empty tool on stand, free placement onto a source vessel. Next legal pour
with ordinary count m >= 2: source loses all m, destination gains m - 1,
tool catches 1 and returns loaded to stand (cost 1). Release moves heldTea
into a compatible destination (cost 1). Win requires heldTea === null.

## Why tight levels
Ordinary levels grant spare vessels; strainer levels grant ONE empty vessel
(4c/5v, 5c/6v+mystery, teapot 4c/5v) plus external one-layer storage. Every
production template is rescued: unsolvable without the tool (non-truncated
proof), solvable with it.

## Design evolution
- V1 single-layer limiter + paid placement → dominated (0/500 meaningful).
- V2 single-layer limiter + free placement → still dominated (0/300).
- V3 catch-one external storage → 30-40% rescue on tight topologies.
- Loose 6v/7v: no value. Tight 5v/6v: large rescue rate. Production uses
  tight dedicated strainer levels.

## Bands (pours)
- challenge 4c/5v: sweet 12-15, accept 10-17.
- peak 5c/6v: sweet 14-18, accept 12-20.
- teapot 4c/5v: sweet 11-14, accept 9-16.
