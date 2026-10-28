# G18 — Manual Playtest Checklist (NOT YET PERFORMED)

This checklist is for a later human playtest. It has **not** been performed in
the G18 environment; do not treat it as evidence.

## Before tutorial text
- [ ] Can the player identify the special vessel/goal before reading the tutorial?
- [ ] Is Tasting vs Tea Pair distinguishable at arm’s length on a 360px phone?
- [ ] Does Shared Tray read as ONE resource (one tray, six group slots)?
- [ ] Does Serving Order read as ordered while Tea Pair reads as a symmetric set?
- [ ] Does a Target cup read as a named destination, not a locked cup?

## During play
- [ ] Can the player predict why a blocked move was rejected from the hint + visuals?
- [ ] Are tea layers always easier to read than decorations?
- [ ] Does the level opening feel instant enough (<~0.5s perceived to board; measure, do not guess)?
- [ ] Does Undo return exactly the expected board and derived decorations?
- [ ] Does Restart remove all transient state?
- [ ] Does “Другой расклад” feel like a genuinely new board (especially Blend)?
- [ ] Do rapid taps ever duplicate a move or feel stuck?
- [ ] Does the tutorial appear once and remain dismissible by playing?

## Mobile/device
- [ ] 360×800: no control under system UI/safe-area notch.
- [ ] 390×844: all header/footer controls reachable one-handed.
- [ ] 430×932: advanced decorations readable without zoom.
- [ ] Telegram WebView: stage height/insets correct; no horizontal scroll.
- [ ] Animation smoothness/frame pacing on a physical iPhone-class device.
- [ ] Tap latency and twin-tap behavior on a physical device.

## After a win
- [ ] Previous level’s pair accent/tray markers/served styling/steam disappear.
- [ ] Next-level board is fully interactive with moves=0.
- [ ] Victory modal fits without clipping on 360px.
- [ ] Help and tutorial do not contradict each other.

## Recording
For each issue record: level, seed, viewport/device, mechanic, expected vs observed,
screenshot/video, and whether it reproduces after Restart.
