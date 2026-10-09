/**
 * Authoritative Pixi.js v8 view (moved from the monolith, behavior preserved).
 *
 * Ownership: `TeaSortLogic` = puzzle truth, `TeaSortView` = rendering/input,
 * React = progression/meta UI. Pixi never decides rewards or levels.
 *
 * Lifecycle guarantees:
 * - one Pixi Application / one ticker / one ResizeObserver per view;
 * - `resetLevel()` reuses the view (no Pixi re-init per level);
 * - `setupInteractivity()` binds exactly once;
 * - old cup views are detached + destroyed on level setup (no duplicate
 *   pointer handlers, no duplicate canvases).
 */

import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import {
  CINNAMON_EFFECTIVE_CAPACITY,
  CapacityObstacleSlot,
  CupConstraint,
  CupSkinId,
  FloatingIngredientId,
  FloatingIngredientSlot,
  IceSlot,
  STANDARD_CUP_CAPACITY,
  SinkingIngredientSlot,
  TEA_TYPES,
  THERMOS_CAPACITY,
  TeaBudId,
  TeaBudSlot,
  TeaId,
  cloneCupConstraint,
  cupCapacity,
  isTastingCupConstraint,
  isThermosCupConstraint,
} from '../types';
import { Cup, TeaSortLogic } from '../logic/teaSortLogic';
import {
  canActAsSource,
  floatingIngredientHostSatisfied,
  isCompleteCup,
  pourRejectCodeState,
  sinkingIngredientHostSatisfied,
  targetCupState,
} from '../logic/rules';
import type {
  PourRejectCode,
  StrainerPlaceRejectCode,
  StrainerReleaseRejectCode,
} from '../logic/rules';

/**
 * Tasting-bowl body height (Gauntlet 4): the shallow bowl is bottom-aligned
 * inside the standard 142-tall layout cell, so rows never jump and pour
 * animation layout never churns. Rim top = height - body height.
 */
export const TASTING_BOWL_BODY_H = 66;

/** Standard liquid slot height for tall vessels (4 slots fill the body). */
const STANDARD_SLOT_H = 29;

/**
 * High-thermos body height (Gauntlet 10): visibly taller than the standard
 * 142-tall cell (+18) yet fitting the mobile 3+3 layout. Deliberately NOT
 * the naive 142*5/4=177.5 scale (which collides rows/stand on 360x800);
 * +18 keeps two rows + stand inside ~430px content height at scale<=1.08.
 * The vessel is slightly narrower (see THERMOS_WIDTH) so 3 columns still
 * fit 360px. Container height for thermos views equals this constant;
 * standard/tasting heights are unchanged.
 */
export const THERMOS_BODY_H = 160;

/** High-thermos body width: slightly narrower than the standard 64 glass. */
export const THERMOS_WIDTH = 56;

/**
 * Thermos liquid slot height for a given container height: the interior
 * (rim inset → base, minus the standard 16px rim air gap) divided by the
 * authoritative thermos capacity — 5 individually readable layers, never
 * compressed to illegibility. Default height yields 26px (vs 29 standard,
 * only ~10% smaller). Pure helper — unit-testable, no Pixi.
 */
export function thermosSlotH(height: number = THERMOS_BODY_H): number {
  const bottomY = height - 6;
  const interiorTop = 4 + 4;
  const airGap = 16;
  return (bottomY - interiorTop - airGap) / THERMOS_CAPACITY;
}

/** Thermos slot height at the canonical body height (26px, readable). */
export const THERMOS_SLOT_H = 26;

/**
 * Full-vessel UX copy (Gauntlet 4 §35, extended Gauntlet 10): capacity-aware,
 * vessel-friendly. Standard cups keep the exact legacy `4/4` wording; the
 * tasting bowl reports `2/2`; the high thermos reports `5/5`. Pure helper —
 * unit-tested, no Pixi.
 */
export function fullVesselHint(constraint: CupConstraint): string {
  if (isTastingCupConstraint(constraint)) {
    return 'Пиала заполнена (2/2)! Выберите другой сосуд или пустой стакан.';
  }
  if (isThermosCupConstraint(constraint)) {
    return 'Термос заполнен (5/5)! Выберите другой сосуд или пустой стакан.';
  }
  const cap = cupCapacity(constraint);
  return `Стакан полон (${cap}/${cap})! Выберите другой сосуд или пустой стакан.`;
}

/**
 * Catch-one strainer tool mode (Gauntlet 6 §32-47, presentation-only).
 * - `off`: normal tea selection / pour flow.
 * - `place`: empty tool on stand (or vacant stand for relocation) — next
 *   cup tap attempts `placeStrainer`, never mutates until a valid cup.
 * - `release`: loaded tool on stand — next cup tap attempts
 *   `releaseStrainer`, never mutates until a valid cup.
 * The mode never mirrors `logic.strainerState`; it is UI intent only.
 */
export type StrainerToolMode = 'off' | 'place' | 'release';

/** Release onto a mismatched color (loaded tool, non-empty destination). */
export const STRAINER_WRONG_COLOR_HINT =
  'Этот чай можно вернуть только на такой же слой или в пустой сосуд.';
/** Release into the source-only teapot (never a destination). */
export const STRAINER_TEAPOT_HINT = 'В чайник нельзя наливать — он только раздаёт настой.';
/** Attached source would pour a single layer (tool stays attached). */
export const STRAINER_NEEDS_TWO_HINT = 'Ситечку нужен перелив хотя бы из 2 слоёв.';
/** No tool in this puzzle (defensive; production always has one when shown). */
export const STRAINER_NO_TOOL_HINT = 'Ситечко недоступно на этом уровне.';
/** Tool already holds a layer — release it before placing again. */
export const STRAINER_LOADED_HINT = 'Ситечко уже держит чай — верните его в подходящий сосуд.';
/** Tool is empty — catch a layer first (strained pour m>=2). */
export const STRAINER_EMPTY_HINT = 'Ситечко пусто — сначала поймайте слой при переливании.';
/** Placement needs a non-empty host. */
export const STRAINER_TARGET_EMPTY_HINT = 'Ситечко ставится только на сосуд с чаем.';
/** Guest cup can never host the tool. */
export const STRAINER_SINK_HOST_HINT = 'На чашку гостя ситечко не ставится.';
/** Tool already on this vessel. */
export const STRAINER_SAME_HOST_HINT = 'Ситечко уже стоит на этом сосуде.';
/** Floating ingredient blocks the tool on this vessel. */
export const STRAINER_LEMON_CONFLICT_HINT = 'Лимон мешает ситечку — выберите другой сосуд.';
/** Generic placement / release fallback (no state mutation). */
export const STRAINER_GENERIC_PLACE_HINT = 'Нельзя поставить ситечко сюда.';
export const STRAINER_GENERIC_RELEASE_HINT = 'Нельзя вернуть чай сюда.';

/**
 * Placement UX copy (pure, no Pixi): maps `placeStrainerRejectCodeState`
 * codes to Russian hints. `ok` yields empty string (no hint).
 */
export function strainerPlaceHint(code: StrainerPlaceRejectCode): string {
  switch (code) {
    case 'ok':
      return '';
    case 'no-strainer':
      return STRAINER_NO_TOOL_HINT;
    case 'strainer-loaded':
      return STRAINER_LOADED_HINT;
    case 'out-of-range':
      return STRAINER_GENERIC_PLACE_HINT;
    case 'target-empty':
      return STRAINER_TARGET_EMPTY_HINT;
    case 'target-sink-only':
      return STRAINER_SINK_HOST_HINT;
    case 'same-host':
      return STRAINER_SAME_HOST_HINT;
    case 'target-floating-occupied-by-tool-conflict':
      return STRAINER_LEMON_CONFLICT_HINT;
    default:
      return STRAINER_GENERIC_PLACE_HINT;
  }
}

/**
 * Release UX copy (pure, no Pixi): maps `releaseStrainerRejectCodeState`
 * codes to Russian hints. Full vessels delegate to `fullVesselHint`
 * (capacity-aware 4/4 vs 2/2); teapot uses the dotted strainer copy;
 * color mismatch uses the wrong-color copy. `ok` yields empty string.
 */
export function strainerReleaseHint(
  code: StrainerReleaseRejectCode,
  constraint?: CupConstraint,
): string {
  switch (code) {
    case 'ok':
      return '';
    case 'no-strainer':
      return STRAINER_NO_TOOL_HINT;
    case 'strainer-empty':
      return STRAINER_EMPTY_HINT;
    case 'out-of-range':
      return STRAINER_GENERIC_RELEASE_HINT;
    case 'target-full':
      return fullVesselHint(constraint ?? { mode: 'normal' });
    case 'target-source-only':
      return STRAINER_TEAPOT_HINT;
    case 'color-mismatch':
      return STRAINER_WRONG_COLOR_HINT;
    default:
      return STRAINER_GENERIC_RELEASE_HINT;
  }
}

/**
 * Strained-pour UX copy (pure, no Pixi): maps `pourRejectCodeState`
 * strainer gates to Russian hints. Attached single-layer pours need two
 * layers (tool stays attached); malformed loaded+attached fails closed.
 */
export function strainedPourHint(code: PourRejectCode): string {
  switch (code) {
    case 'ok':
      return '';
    case 'strainer-needs-two-layers':
      return STRAINER_NEEDS_TWO_HINT;
    case 'strainer-loaded':
      return STRAINER_LOADED_HINT;
    default:
      return '';
  }
}

/** Alias set for forward-compat with alternate test import names. */
export const strainerPlaceRejectHint = strainerPlaceHint;
export const getStrainerPlaceHint = strainerPlaceHint;
export const placeStrainerHint = strainerPlaceHint;
export const strainerReleaseRejectHint = strainerReleaseHint;
export const getStrainerReleaseHint = strainerReleaseHint;
export const releaseStrainerHint = strainerReleaseHint;
export const strainerPourHint = strainedPourHint;
export const getStrainedPourHint = strainedPourHint;
export const getStrainerPourHint = strainedPourHint;

/**
 * Tool-mode transition for a stand tap (pure, no Pixi, no logic mutation):
 * - heldTea != null (loaded on stand) toggles `release` (else `off`);
 * - heldTea == null (empty on stand, or vacant stand while attached for
 *   free relocation) toggles `place` (else `off`).
 * Entering a mode always implies clearing tea selection (caller-owned).
 */
export function strainerToolModeForStandTap(
  heldTea: TeaId | null,
  current: StrainerToolMode,
): StrainerToolMode {
  if (heldTea !== null) {
    return current === 'release' ? 'off' : 'release';
  }
  return current === 'place' ? 'off' : 'place';
}

/** Alias set for tool-mode helper import compatibility. */
export const nextStrainerToolMode = strainerToolModeForStandTap;
export const toolModeForStandTap = strainerToolModeForStandTap;
export const getStrainerToolModeForStandTap = strainerToolModeForStandTap;

/**
 * Whether selecting a tea source must exit tool mode (pure): always true
 * when a mode is active — tea selection and tool intent stay mutually
 * exclusive, and tool mode never mutates logic by itself.
 */
export function shouldExitToolModeOnTeaSelect(mode: StrainerToolMode): boolean {
  return mode !== 'off';
}

/**
 * Placement-transit plan (pure, G6.1): where the tool flight starts and
 * which static marker must stay hidden during travel.
 * - attached==null (tool on stand) → flight starts at the stand anchor;
 *   nothing is hidden (stand visual stays pre during travel, lands post).
 * - attached==A (relocation to a legal host B; the caller pre-checks
 *   legality so A≠B) → flight starts at A's rim anchor and A's static
 *   marker is hidden for the flight, so exactly one mesh is ever visible.
 *   On failure the caller restores via refreshStrainerVisuals() (logic is
 *   untouched until landing, so refresh redraws the old host marker).
 */
export interface StrainerPlaceTransitPlan {
  /** True when the flight starts at the stand; false when at the old host. */
  fromStand: boolean;
  /** Old host whose static marker must be hidden during travel (null=none). */
  suppressCupIndex: number | null;
}

export function strainerPlaceTransitPlan(
  attachedCupIndex: number | null,
): StrainerPlaceTransitPlan {
  if (attachedCupIndex === null) return { fromStand: true, suppressCupIndex: null };
  return { fromStand: false, suppressCupIndex: attachedCupIndex };
}

/** Visual radius of the floating lemon slice (~16px diameter). */
export const LEMON_SLICE_R = 8;

/**
 * Pure 2D rotation helper (stage-space transform math shared by the tea
 * spout anchor and the lemon surface anchor).
 */
export function rotatePoint2D(x: number, y: number, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/**
 * Transit surface-count rule (G5.1, pure and unit-tested): logic is
 * already post-move when animation runs, so the flight STARTS from the
 * reconstructed pre-move source surface — but it must LAND on the FINAL
 * post-pour destination surface (the tea has arrived when the lemon
 * lands, and the static slice reappears exactly there).
 */
export function lemonTransitCounts(
  postSourceLen: number,
  postTargetLen: number,
  transfer: number,
): { sourcePre: number; targetFinal: number } {
  return { sourcePre: postSourceLen + transfer, targetFinal: postTargetLen };
}

/**
 * Liquid surface Y in container-local coords for a given layer count
 * (Gauntlet 5 §65): derived from actual vessel slot geometry and the
 * actual rim — never a fixed global y. Empty vessels report a rim-ish
 * fallback (unreachable in production: legal outflow always carries the
 * lemon, so it never strands on empty).
 */
export function lemonSurfaceLocalY(
  layerCount: number,
  constraint: CupConstraint,
  height = 142,
): number {
  const bottomY = height - 6;
  if (layerCount <= 0) return height - TASTING_BOWL_BODY_H + 6;
  const slotH = isTastingCupConstraint(constraint)
    ? (bottomY - (height - TASTING_BOWL_BODY_H + 4)) / cupCapacity(constraint)
    : isThermosCupConstraint(constraint)
      ? thermosSlotH(height)
      : STANDARD_SLOT_H;
  return bottomY - layerCount * slotH;
}

/**
 * Lemon slice CENTER Y in container-local coords (G5.2): the single
 * anchor shared by the static slice and the flight endpoints. The slice
 * sits slightly embedded into the surface (not balanced on top of it),
 * and both render paths must agree exactly — otherwise takeoff and
 * landing visibly jump by the embed offset.
 */
export function lemonCenterLocalY(
  layerCount: number,
  constraint: CupConstraint,
  height = 142,
): number {
  return lemonSurfaceLocalY(layerCount, constraint, height) - 3;
}

/**
 * Restrained floating lemon slice (Gauntlet 5 §64): warm golden rind,
 * pale center, subtle segment lines, slight tilt. Cozy illustrated
 * style — readable, never sticker-like, no emoji, no text.
 */
export function drawLemonSlice(g: Graphics, cx: number, cy: number, r = LEMON_SLICE_R): void {
  const tilt = -0.35;
  // Rind + pale flesh.
  g.circle(cx, cy, r).fill({ color: 0xe8b93c, alpha: 1 });
  g.circle(cx, cy, r).stroke({ width: 1.4, color: 0xc9962e, alpha: 1 });
  g.circle(cx, cy, r - 2.2).fill({ color: 0xf7e08b, alpha: 1 });
  // Segment lines fanning from the center (slight tilt).
  for (let k = 0; k < 3; k++) {
    const a = tilt + (k * Math.PI) / 3;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * (r - 2.6), cy + Math.sin(a) * (r - 2.6));
    g.stroke({ width: 1.1, color: 0xe3c566, alpha: 0.95 });
  }
  g.circle(cx, cy, 1.1).fill({ color: 0xfbf3c4, alpha: 1 });
  // Gloss highlight.
  g.ellipse(cx - r * 0.3, cy - r * 0.38, 2.2, 1.3).fill({ color: 0xffffff, alpha: 0.55 });
}

/**
 * Sinking honey «Мёд на дне» (Gauntlet 7 §79-91): ONE shared bottom
 * anchor used by BOTH static rendering and transit landing — never two
 * offset truths. Pure, headless-testable, no Pixi.
 *
 * - Standard cups: near the glass base (`height - 6 - 10`), i.e. below
 *   the tea column but above the base shade, so the blob reads through
 *   tea without hiding tea identity.
 * - Teapot (source-only): belly anchor derived from the ACTUAL teapot
 *   geometry in `CupView.drawTeapotFrame` (`bellyR = min(24, cornerR+4)`
 *   with `cornerR = 18`), never a hardcoded standard y — the wider
 *   belly sits slightly differently so honey rests in the lower belly.
 * - Tasting bowl: shallow-body anchor above its foot, same cell.
 * Goal semantics stay in `rules.ts` (`sinkingIngredientHostSatisfied`) —
 * the View only calls it for the halo, never reimplements it.
 */
export const HONEY_BLOB_W = 34;
export const HONEY_BLOB_H = 13;
export const HONEY_DROP_R = 5;
/** Sink leg duration (spec §82: short ~180-260ms sink). */
export const HONEY_SINK_MS = 220;
/** Arc leg duration (short amber arc to the rim before sinking). */
export const HONEY_ARC_MS = 300;

export function honeyBottomLocalY(constraint: CupConstraint, height = 142): number {
  if (constraint.mode === 'source-only') {
    // Mirrors CupView.drawTeapotFrame: bellyR = min(24, cornerRadius + 4).
    const bellyR = Math.min(24, 18 + 4);
    return height - bellyR + 2;
  }
  if (isTastingCupConstraint(constraint)) {
    return height - 14;
  }
  if (isThermosCupConstraint(constraint)) {
    // Tall translucent vessel: same bottom-anchored logic as standard cups,
    // height-derived so the taller body lands correctly above the base.
    return height - 6 - 10;
  }
  return height - 6 - 10;
}

export function honeyBottomLocalPoint(
  constraint: CupConstraint,
  width: number,
  height = 142,
): { x: number; y: number } {
  return { x: width / 2, y: honeyBottomLocalY(constraint, height) };
}

/** Alias set for forward-compat with alternate test import names. */
export const honeyBottomLocalYN = honeyBottomLocalY;
export const getHoneyBottomLocalY = honeyBottomLocalY;
export const getHoneyBottomLocalPoint = honeyBottomLocalPoint;
export const honeyBottomPoint = honeyBottomLocalPoint;

/**
 * Procedural warm-amber translucent blob (Gauntlet 7 §80): soft organic
 * ellipse + glossy highlight + subtle outline. Translucent so the tea
 * color underneath stays readable — honey tints, never hides. No red,
 * no checkmark, no text.
 */
export function drawHoneyBlob(
  g: Graphics,
  cx: number,
  cy: number,
  w = HONEY_BLOB_W,
  h = HONEY_BLOB_H,
): void {
  // Soft organic body: main ellipse + smaller side lobe.
  g.ellipse(cx, cy, w / 2, h / 2).fill({ color: 0xd9962b, alpha: 0.55 });
  g.ellipse(cx + w * 0.18, cy + h * 0.12, w * 0.16, h * 0.22).fill({
    color: 0xe8a93c,
    alpha: 0.45,
  });
  g.ellipse(cx, cy, w / 2, h / 2).stroke({ width: 1.4, color: 0xa86a1a, alpha: 0.65 });
  // Glossy highlight (upper-left, cozy illustrated language).
  g.ellipse(cx - w * 0.18, cy - h * 0.22, w * 0.2, h * 0.16).fill({
    color: 0xffffff,
    alpha: 0.38,
  });
}

/**
 * In-flight amber drop (Gauntlet 7 §82): ONE small bead for the pour-arc
 * + sink. Same warm-amber family as the static blob, never lemon-yellow
 * (lemon rides the surface with rind/segments; honey is a bottom bead).
 */
export function drawHoneyDrop(g: Graphics, cx: number, cy: number, r = HONEY_DROP_R): void {
  g.circle(cx, cy, r).fill({ color: 0xd9962b, alpha: 0.92 });
  g.circle(cx, cy, r).stroke({ width: 1.1, color: 0xa86a1a, alpha: 0.8 });
  g.circle(cx - 1, cy - 1.1, 1.2).fill({ color: 0xffffff, alpha: 0.6 });
}

/** Frozen-cup ice slab half-width (fits inside the 64-wide vessel). */
export const ICE_SLAB_HALF_W = 22;
/** Frozen-cup ice slab height. */
export const ICE_SLAB_H = 10;
/** Extra melt-flourish duration after the tea lands (spec §101: ~250–400ms). */
export const ICE_MELT_MS = 320;

/**
 * Ice surface center Y in container-local coords (Gauntlet 9 §98–99): the
 * single anchor shared by the static slab and the melt flourish. The slab
 * rides slightly embedded into the liquid surface (like the lemon slice),
 * never balanced above the rim.
 */
export function iceCenterLocalY(
  layerCount: number,
  constraint: CupConstraint,
  height = 142,
): number {
  return lemonSurfaceLocalY(layerCount, constraint, height) - 2;
}

/**
 * Procedural frozen slab (Gauntlet 9 §98): small translucent pale-blue ice
 * sheet floating at the tea surface + subtle frost rim + two crack facets.
 * Cozy and readable, never neon: restrained cyan, soft white gloss, no
 * snowflake, no emoji, no text. Shape (not color alone) carries the frozen
 * state for limited color discrimination (§130).
 */
export function drawIceSlab(
  g: Graphics,
  cx: number,
  cy: number,
  halfW = ICE_SLAB_HALF_W,
  h = ICE_SLAB_H,
  alpha = 1,
): void {
  // Translucent slab body.
  g.roundRect(cx - halfW, cy - h / 2, halfW * 2, h, 4).fill({ color: 0xbfe0ea, alpha: 0.75 * alpha });
  // Frost rim (top edge reads as ice even without color).
  g.roundRect(cx - halfW, cy - h / 2, halfW * 2, 3.4, 2).fill({ color: 0xffffff, alpha: 0.8 * alpha });
  g.roundRect(cx - halfW, cy - h / 2, halfW * 2, h, 4).stroke({ width: 1.4, color: 0x8ab8cc, alpha: 0.9 * alpha });
  // Two crack facets (shape language, visible in monochrome).
  g.beginPath();
  g.moveTo(cx - halfW * 0.3, cy - h / 2 + 1);
  g.lineTo(cx - halfW * 0.05, cy + h / 2 - 1);
  g.stroke({ width: 1.1, color: 0xffffff, alpha: 0.85 * alpha });
  g.beginPath();
  g.moveTo(cx + halfW * 0.25, cy - h / 2 + 1);
  g.lineTo(cx + halfW * 0.45, cy);
  g.lineTo(cx + halfW * 0.2, cy + h / 2 - 1);
  g.stroke({ width: 1, color: 0xe8f4f8, alpha: 0.8 * alpha });
  // Gloss highlight.
  g.ellipse(cx - halfW * 0.4, cy - h * 0.18, 5, 1.6).fill({ color: 0xffffff, alpha: 0.55 * alpha });
}

/** Attempting to source from a frozen cup (never selects, gentle hint). */
export const FROZEN_SOURCE_HINT = 'Сначала растопи лёд облепиховым чаем.';
/** Pouring non-hot tea toward a frozen cup. */
export const FROZEN_NEEDS_HOT_HINT = 'Сюда можно долить только облепиховый — он растопит лёд.';

/**
 * Frozen-pour UX copy (pure, no Pixi): maps `pourRejectCodeState` ice gates
 * to Russian hints. `ok` and non-ice codes yield empty string (the caller
 * handles other rejections through their own copy).
 */
export function frozenPourHint(code: string): string {
  switch (code) {
    case 'source-frozen':
      return FROZEN_SOURCE_HINT;
    case 'target-frozen-needs-hot':
      return FROZEN_NEEDS_HOT_HINT;
    default:
      return '';
  }
}

/** Cinnamon stick width (fits inside the 64-wide standard vessel). */
export const CINNAMON_STICK_W = 11;
/** Cinnamon stick length (upper interior + protrusion above the rim). */
export const CINNAMON_STICK_H = 78;
/** Resting lean of the stick (radians, ~10deg cozy tilt). */
export const CINNAMON_STICK_TILT = 0.18;
/** How far the top end protrudes above the rim (px, container-local). */
export const CINNAMON_PROTRUSION = 18;
/** Removal-flourish duration after the tea lands (spec: ~250-400ms). */
export const CINNAMON_REMOVAL_MS = 320;
/** Bloom-flourish duration after the final tea leaves (spec: ~350-550ms). */
export const TEA_BLOOM_MS = 450;
/** Dormant bud width (fits inside the 64-wide standard vessel bottom). */
export const TEA_BUD_W = 22;
/** Dormant bud height (sits at the physical bottom, below the tea). */
export const TEA_BUD_H = 16;
/** Blocked upper slots while the stick is present (base 4 - effective 2). */
export const CINNAMON_BLOCKED_SLOTS = STANDARD_CUP_CAPACITY - CINNAMON_EFFECTIVE_CAPACITY;

/**
 * Stick geometry in container-local coords (Gauntlet 11, pure and
 * headless-testable): the single anchor shared by the static stick and
 * the removal flourish. The stick is centered slightly off-axis with a
 * small resting tilt, its top protruding above the rim and its bottom
 * resting in the upper interior above the 2-layer tea surface — it
 * occupies the blocked upper slots, never the tea column.
 */
export interface CinnamonGeometry {
  /** Stick center X (container-local). */
  x: number;
  /** Stick center Y (container-local). */
  y: number;
  /** Stick width. */
  w: number;
  /** Stick length. */
  h: number;
  /** Resting tilt (radians). */
  tilt: number;
}

export function cinnamonGeometry(width = 64, height = 142): CinnamonGeometry {
  const rimY = 4;
  const topY = rimY - CINNAMON_PROTRUSION;
  const h = CINNAMON_STICK_H;
  const w = CINNAMON_STICK_W;
  void height;
  return {
    x: width / 2 + 6,
    y: topY + h / 2,
    w,
    h,
    tilt: CINNAMON_STICK_TILT,
  };
}

/** Alias set for forward-compat with alternate test import names. */
export const getCinnamonGeometry = cinnamonGeometry;
export const cinnamonStickGeometry = cinnamonGeometry;

/**
 * Removal plan (pure, Gauntlet 11): whether the unlock pour must run the
 * lift/tilt-out flourish. The ONLY signal is the rules metadata
 * `capacityObstacleRemoved` — never a view-owned wasCinnamon flag.
 * - `'cinnamon'` → animate once for CINNAMON_REMOVAL_MS.
 * - null/undefined → no flourish, the static stick stays (partial outflow).
 */
export interface CinnamonRemovalPlan {
  shouldAnimate: boolean;
  durMs: number;
}

export function cinnamonRemovalPlan(
  capacityObstacleRemoved: CapacityObstacleSlot,
): CinnamonRemovalPlan {
  if (capacityObstacleRemoved === 'cinnamon') {
    return { shouldAnimate: true, durMs: CINNAMON_REMOVAL_MS };
  }
  return { shouldAnimate: false, durMs: 0 };
}

/** Alias set for forward-compat with alternate test import names. */
export const getCinnamonRemovalPlan = cinnamonRemovalPlan;
export const cinnamonTransitPlan = cinnamonRemovalPlan;

/**
 * Blocked-capacity overlay (pure, Gauntlet 11): the upper interior the
 * stick occupies while present. Tea layers ALWAYS use the base-4 slot
 * height (never stretched to cap-2) — this overlay only describes the
 * subtle warm obstruction band + at most two faint slot cues above the
 * tea, never fake tea layers, never gray liquid, never lock icons, never
 * text. Empty (0 blocked) once the obstacle is gone — post-unlock the cup
 * is indistinguishable from a standard normal vessel.
 */
export interface BlockedCapacityOverlay {
  /** Blocked upper slots (2 while present, 0 when gone). */
  blockedSlots: number;
  /** Obstruction band top Y (container-local). */
  bandY: number;
  /** Obstruction band height. */
  bandH: number;
  /** At most two faint cue Y positions (slot dividers). */
  cueYs: number[];
}

export function blockedCapacityOverlay(
  obstacle: CapacityObstacleSlot,
  height = 142,
): BlockedCapacityOverlay {
  if (obstacle == null) {
    return { blockedSlots: 0, bandY: 0, bandH: 0, cueYs: [] };
  }
  const bottomY = height - 6;
  const slotH = STANDARD_SLOT_H;
  const blocked = CINNAMON_BLOCKED_SLOTS;
  const bandH = blocked * slotH;
  const bandY = bottomY - STANDARD_CUP_CAPACITY * slotH;
  const cueYs: number[] = [bandY + slotH, bandY + bandH];
  return { blockedSlots: blocked, bandY, bandH, cueYs };
}

/** Alias set for forward-compat with alternate test import names. */
export const getBlockedCapacityOverlay = blockedCapacityOverlay;
export const blockedSlotOverlay = blockedCapacityOverlay;

/**
 * Dormant-bud anchor (pure, Gauntlet 12): the physical bottom of the cup
 * interior where the tied-tea bud rests BELOW the tea. Single anchor shared
 * by the static bud and the bloom flourish — never a second offset truth.
 * Tea layers keep the base-4 geometry (bud consumes no capacity, displaces
 * no layer); the bud reads through the tea via its own outline + front
 * silhouette, never by stretching tea.
 */
export function teaBudBottomPoint(width = 64, height = 142): { x: number; y: number } {
  void width;
  const bottomY = height - 6;
  return { x: width / 2, y: bottomY - TEA_BUD_H / 2 + 2 };
}

/** Alias set for forward-compat with alternate test import names. */
export const getTeaBudBottomPoint = teaBudBottomPoint;
export const teaBudGeometry = teaBudBottomPoint;

/**
 * Bud scale for a cup width (pure): the standard 64-wide glass uses scale
 * 1; narrower vessels (thermos 56) shrink proportionally. Presentation only.
 */
export function teaBudScaleForCup(width = 64): number {
  return Math.max(0.7, Math.min(1.15, width / 64));
}

/** Alias set for forward-compat with alternate test import names. */
export const getTeaBudScaleForCup = teaBudScaleForCup;

/**
 * Bloom plan (pure, Gauntlet 12): whether the emptied pour must run the
 * flower-opening flourish. The ONLY signal is the rules metadata
 * `teaBudBloomed` — never a view-owned wasBud flag.
 * - `'tea_bud'` → animate once for TEA_BLOOM_MS.
 * - null/undefined → no flourish, the static bud stays (partial outflow).
 */
export interface TeaBloomVisualPlan {
  shouldAnimate: boolean;
  durMs: number;
}

export function teaBloomVisualPlan(teaBudBloomed: TeaBudSlot): TeaBloomVisualPlan {
  if (teaBudBloomed === 'tea_bud') {
    return { shouldAnimate: true, durMs: TEA_BLOOM_MS };
  }
  return { shouldAnimate: false, durMs: 0 };
}

/** Alias set for forward-compat with alternate test import names. */
export const getTeaBloomVisualPlan = teaBloomVisualPlan;
export const teaBloomTransitPlan = teaBloomVisualPlan;

/**
 * Cozy tied-tea bud (Gauntlet 12): small organic botanical bundle — a
 * brown-green tied tea knot with two tiny closed sepals + a tied-thread
 * line, drawn with a readable darker outline so the silhouette stays legible
 * through tea layers (distinct botanical tied-bundle shape, not color
 * alone — never confused with honey/lemon/cinnamon). No emoji, no text.
 */
export function drawTeaBud(
  g: Graphics,
  cx: number,
  cy: number,
  scale = 1,
  alpha = 1,
): void {
  const w = TEA_BUD_W * scale;
  const h = TEA_BUD_H * scale;
  // Tied-bundle body (rounded knot, bark-brown with green undertone).
  g.ellipse(cx, cy, w / 2, h / 2).fill({ color: 0x5a6b3a, alpha: 0.95 * alpha });
  g.ellipse(cx, cy, w / 2, h / 2).stroke({ width: 1.8, color: 0x2e3a1e, alpha: 0.9 * alpha });
  // Two closed sepals (small green leaves hugging the knot).
  g.ellipse(cx - w * 0.22, cy - h * 0.28, w * 0.2, h * 0.3).fill({ color: 0x6f8f4a, alpha: 0.95 * alpha });
  g.ellipse(cx + w * 0.22, cy - h * 0.28, w * 0.2, h * 0.3).fill({ color: 0x6f8f4a, alpha: 0.95 * alpha });
  // Tied thread (thin wrapped line around the middle).
  g.rect(cx - w / 2 + 2, cy - 1, w - 4, 2).fill({ color: 0xd8c890, alpha: 0.9 * alpha });
}

/**
 * Opening tea flower (Gauntlet 12): restrained botanical bloom drawn at
 * `progress` 0..1 — soft petals expanding from the knot center, cozy and
 * fast (never a 2-second celebration). Presentation only; after the flourish
 * the cup renders as an ordinary normal vessel (no persistent marker).
 */
export function drawTeaBloom(
  g: Graphics,
  cx: number,
  cy: number,
  progress: number,
  scale = 1,
): void {
  const p = Math.min(1, Math.max(0, progress));
  const alpha = 1 - p * 0.9;
  const spread = (4 + p * 14) * scale;
  const petalR = (3 + p * 5) * scale;
  const petalColors = [0xe8a8c0, 0xf2c9d8, 0xd890b0, 0xe8a8c0, 0xf2d9e0];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * spread * 0.7;
    const py = cy + Math.sin(angle) * spread * 0.55 - p * 8 * scale;
    g.ellipse(px, py, petalR, petalR * 0.72).fill({ color: petalColors[i] as number, alpha: Math.max(0, alpha) });
  }
  // Fading knot center.
  g.ellipse(cx, cy - p * 8 * scale, 5 * scale * (1 - p * 0.5), 4 * scale * (1 - p * 0.5)).fill({
    color: 0x8fae5a,
    alpha: Math.max(0, 0.9 - p),
  });
}

/**
 * Cozy cinnamon stick (Gauntlet 11): warm brown rolled-bark silhouette
 * with a subtle spiral curl at the protruding top end, two faint bark
 * grain lines + soft highlight for slight texture. Restrained cozy
 * illustration — readable by shape (lean + curl + obstruction band), not
 * by brown color alone; no emoji, no text, no lock icon, no photorealism.
 */
export function drawCinnamonStick(
  g: Graphics,
  cx: number,
  cy: number,
  w = CINNAMON_STICK_W,
  h = CINNAMON_STICK_H,
  tilt = CINNAMON_STICK_TILT,
  alpha = 1,
): void {
  const halfW = w / 2;
  const halfH = h / 2;
  const dx = Math.sin(tilt) * halfH;
  // Rolled-bark body (parallelogram following the lean).
  const tlX = cx - halfW + dx;
  const tlY = cy - halfH;
  const trX = cx + halfW + dx;
  const trY = cy - halfH;
  const brX = cx + halfW - dx;
  const brY = cy + halfH;
  const blX = cx - halfW - dx;
  const blY = cy + halfH;
  g.beginPath();
  g.moveTo(tlX, tlY);
  g.lineTo(trX, trY);
  g.lineTo(brX, brY);
  g.lineTo(blX, blY);
  g.closePath();
  g.fill({ color: 0x8f5a2e, alpha: 0.96 * alpha });
  g.beginPath();
  g.moveTo(tlX, tlY);
  g.lineTo(trX, trY);
  g.lineTo(brX, brY);
  g.lineTo(blX, blY);
  g.closePath();
  g.stroke({ width: 1.4, color: 0x6b3f1d, alpha: 0.9 * alpha });
  // Bark grain: two faint longitudinal lines following the lean.
  for (const off of [-halfW * 0.28, halfW * 0.3]) {
    g.beginPath();
    g.moveTo(cx + off + dx * 0.9, cy - halfH + 7);
    g.lineTo(cx + off - dx * 0.9, cy + halfH - 6);
    g.stroke({ width: 1, color: 0x6b3f1d, alpha: 0.55 * alpha });
  }
  // Soft highlight along the left edge (slight texture, keeps tea readable).
  g.beginPath();
  g.moveTo(cx - halfW * 0.72 + dx * 0.9, cy - halfH + 8);
  g.lineTo(cx - halfW * 0.72 - dx * 0.9, cy + halfH - 8);
  g.stroke({ width: 2, color: 0xd9a86c, alpha: 0.5 * alpha });
  // Spiral curl at the protruding top end (rolled bark read by shape):
  // outer curl ring + darker opening + tiny highlight.
  const curlCX = cx + dx;
  const curlCY = cy - halfH + 2;
  g.ellipse(curlCX, curlCY, halfW * 0.95, 3.4).fill({ color: 0xa06a35, alpha: 0.98 * alpha });
  g.ellipse(curlCX, curlCY, halfW * 0.95, 3.4).stroke({
    width: 1.2,
    color: 0x6b3f1d,
    alpha: 0.9 * alpha,
  });
  g.ellipse(curlCX, curlCY, halfW * 0.48, 1.8).fill({ color: 0x4a2a12, alpha: 0.9 * alpha });
  g.ellipse(curlCX - 1.4, curlCY - 0.8, 1.4, 0.8).fill({ color: 0xffe0b3, alpha: 0.6 * alpha });
  // Rounded bottom end (rests above the tea, never submerged marker).
  g.ellipse(cx - dx, cy + halfH - 1, halfW * 0.9, 2.6).fill({
    color: 0x7a4a24,
    alpha: 0.9 * alpha,
  });
}

/** Mini brass mesh basket radius for the attached-over-rim marker. */
export const STRAINER_ATTACHED_R = 9;
/** Stand basket radius (clearly a tool, never a cup). */
export const STRAINER_STAND_R = 16;

/**
 * Procedural brass/warm-steel mesh basket (Gauntlet 6 §33): outer brass
 * ring, warm-steel inner bowl, crosshatch mesh lines, tiny side handle
 * stub. No emoji, no text. `heldColorNum` draws the caught drop when the
 * loaded tool sits on its stand (tiny heldTea-color drop visible in mesh).
 */
export function drawStrainerMesh(
  g: Graphics,
  cx: number,
  cy: number,
  r = STRAINER_ATTACHED_R,
  heldColorNum: number | null = null,
): void {
  // Warm-steel bowl.
  g.circle(cx, cy, r).fill({ color: 0xb8c0c4, alpha: 1 });
  g.circle(cx, cy, r).stroke({ width: 1.6, color: 0xc9962e, alpha: 1 });
  g.circle(cx, cy, r - 1.6).fill({ color: 0x8f9aa0, alpha: 1 });
  // Mesh crosshatch (clipped visually by the bowl: short chords only).
  for (let k = -2; k <= 2; k++) {
    const y = cy + (k * (r - 2)) / 2.4;
    const half = Math.sqrt(Math.max(0, (r - 2.4) * (r - 2.4) - (y - cy) * (y - cy)));
    if (half <= 0.5) continue;
    g.beginPath();
    g.moveTo(cx - half, y);
    g.lineTo(cx + half, y);
    g.stroke({ width: 0.9, color: 0x5e6a70, alpha: 0.9 });
    const x = cx + (k * (r - 2)) / 2.4;
    const vHalf = Math.sqrt(Math.max(0, (r - 2.4) * (r - 2.4) - (x - cx) * (x - cx)));
    if (vHalf <= 0.5) continue;
    g.beginPath();
    g.moveTo(x, cy - vHalf);
    g.lineTo(x, cy + vHalf);
    g.stroke({ width: 0.9, color: 0x6b767c, alpha: 0.9 });
  }
  // Brass rim highlight.
  g.ellipse(cx, cy - r * 0.15, r - 1, r * 0.42).stroke({ width: 1.2, color: 0xe8c878, alpha: 0.9 });
  // Thin side handle stub (tool read, never a cup handle).
  g.beginPath();
  g.moveTo(cx + r - 1, cy - 2);
  g.lineTo(cx + r + 7, cy - 6);
  g.stroke({ width: 2.2, color: 0xc9962e, alpha: 1 });
  // Caught drop (loaded-on-stand only): tiny heldTea-color bead.
  if (heldColorNum !== null) {
    g.circle(cx, cy + 1.5, Math.max(3, r * 0.32)).fill({ color: heldColorNum, alpha: 1 });
    g.circle(cx - 1, cy + 0.4, 1.1).fill({ color: 0xffffff, alpha: 0.6 });
  } else {
    // Empty mesh glint.
    g.ellipse(cx - r * 0.25, cy - r * 0.3, 2, 1.2).fill({ color: 0xffffff, alpha: 0.5 });
  }
}
import { audioSynth } from '../audio/audioSynth';
import { telegram } from '../telegram/telegramHaptics';
import { POUR_ANIMATION, POUR_DURATION_SEC } from './animation';

export interface ViewCallbacks {
  onMoveComplete?: () => void;
  /** The completed level number is passed explicitly — never a React closure. */
  onWin?: (completedLevel: number) => void;
  onDeadlock?: () => void;
  onSelectCup?: (cupIndex: number | null) => void;
  onInvalidMove?: (reason: string) => void;
}

/** UX copy when the player tries to pour OUT of the guest cup (Gauntlet 3 §39). */
export const GUEST_SINK_HINT = 'Из чашки гостя нельзя переливать — можно отменить ход.';

export type SecondTapDecision = 'switch-source' | 'reject-sink-source' | 'invalid-target';

/**
 * Second-tap source-switch policy (Gauntlet 3.1, pure and unit-tested):
 * tapping the same invalid target twice re-targets selection onto it —
 * EXCEPT a sink-only guest cup, which can never act as a source and must
 * stay unselected ("tap-as-source refused, never selected"). Legality
 * itself stays in rules.ts (`canActAsSource` reads the authoritative
 * constraint; this helper duplicates no movement rules).
 */
export function decideSecondTap(
  clickedConstraint: CupConstraint,
  clickedIsEmpty: boolean,
  isRepeatTap: boolean,
): SecondTapDecision {
  if (isRepeatTap && !clickedIsEmpty) {
    return canActAsSource(clickedConstraint) ? 'switch-source' : 'reject-sink-source';
  }
  return 'invalid-target';
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  maxAlpha?: number;
  scale: number;
  life: number;
  maxLife: number;
  color: number;
  type: 'steam' | 'confetti' | 'sparkle';
  rotation?: number;
  vRot?: number;
}

/**
 * Why the `_cancelResize` guard exists:
 * Some Pixi v8 plugin builds keep an internal `_cancelResize` teardown hook
 * for `resizeTo`-based auto-resize. During init/resize/destroy races the
 * plugin path could observe an undefined hook and throw, breaking canvas
 * setup on low-end Telegram webviews. Current Pixi v8 typings do not expose
 * it, so we keep ONE defensive noop guard (instead of scattered casts) and
 * otherwise use only public APIs (`resizeTo`, `app.resize()`, `destroy()`).
 */
function ensureLegacyResizeGuard(app: Application): void {
  const anyApp = app as unknown as { _cancelResize?: unknown };
  if (typeof anyApp._cancelResize !== 'function') {
    anyApp._cancelResize = () => {};
  }
}

export class CupView {
  index: number;
  container: Container;
  shadowGraphics: Graphics;
  cupBodyContainer: Container;
  liquidContainer: Container;
  liquidGraphics: Graphics;
  liquidMask: Graphics;
  /**
   * Floating-ingredient layer (Gauntlet 5): the lemon slice riding the
   * liquid surface. Above the liquid, below the skin rim work and the
   * target motif. Driven solely by `Cup.floatingIngredient` — no
   * parallel view state.
   */
  lemonGraphics: Graphics;
  /**
   * Sinking-honey layer (Gauntlet 7 §80): warm-amber translucent blob at
   * the vessel bottom. Positioned at the bottom (below the tea column,
   * above the base shade) and layered above the liquid with translucency
   * so tea identity reads through — honey tints, never hides. Driven
   * solely by `Cup.sinkingIngredient` + `suppressHoneyTransit` — no
   * view-owned honey index/boolean.
   */
  honeyGraphics: Graphics;
  /**
   * Frozen-cup ice layer (Gauntlet 9 §98–99): translucent slab riding the
   * liquid surface. Above the liquid (like the lemon slice), below the
   * target motif. Driven solely by `Cup.ice` — no view-owned ice index.
   * No suppression flag: logic ice is already null post-melt, so the melt
   * flourish (transit layer) can never coincide with this static.
   */
  iceGraphics: Graphics;
  /**
   * Cinnamon-stick layer (Gauntlet 11): cozy rolled-bark stick occupying
   * the upper interior with its top protruding above the rim, plus the
   * subtle warm obstruction band + at most two faint blocked-slot cues.
   * Above the liquid (like lemon/ice), below the target motif. Driven
   * solely by `Cup.capacityObstacle` — no view-owned wasCinnamon flag,
   * no dynamic capacity. No suppression flag: logic obstacle is already
   * null post-unlock, so the removal flourish (transit layer) can never
   * coincide with this static. Never intercepts pointer (eventMode none).
   */
  cinnamonGraphics: Graphics;
  /**
   * Dormant-bud layer (Gauntlet 12): small tied-tea bundle drawn at the
   * physical bottom from the authoritative `Cup.teaBud` — no view-owned
   * bud index, never a second mutable truth. Clears to empty when the bud
   * is null so post-bloom cups render as ordinary normal vessels.
   */
  teaBudGraphics: Graphics;
  glassOverlay: Graphics;
  glowGraphics: Graphics;
  /**
   * Transit suppression (Gauntlet 5 §66): while the pour-arc lemon is
   * flying, the destination's static slice stays hidden so two lemons
   * never show simultaneously. Owned by the pour flow, cleared on land.
   */
  suppressLemonTransit = false;
  /**
   * Honey transit suppression (Gauntlet 7 §82, lemon mirror): while the
   * amber drop is flying, the destination static blob stays hidden (and
   * the emptied source stays empty) so two honeys never show. Owned by
   * the pour flow, cleared on landing / reset / undo / failure refresh.
   */
  suppressHoneyTransit = false;
  /**
   * Target-motif layer (gold medallion), above liquid so the destination
   * stays readable even when the cup holds another tea. Separate graphics
   * object so skin redraws (glassOverlay) never erase it.
   */
  targetGraphics: Graphics;
  /**
   * Attached-tool marker (Gauntlet 6 §35): small brass mesh drawn over the
   * host rim when `logic.strainerState` says the EMPTY tool is attached
   * here. Owned by the strainer flow, never a parallel attached flag —
   * `renderAttachedStrainer(attached)` is called from the view's
   * `refreshStrainerVisuals()` which reads ONLY `logic.strainerState`.
   */
  strainerGraphics: Graphics;
  /**
   * Authoritative vessel role, cloned from the logic Cup at setup.
   * Rendering derives EVERYTHING (teapot shape, target motif) from here —
   * no parallel isTeapot/isTarget booleans.
   */
  readonly constraint: CupConstraint;

  homeX = 0;
  homeY = 0;
  targetX = 0;
  targetY = 0;
  targetRotation = 0;
  targetLift = 0;
  currentLift = 0;

  isLifted = false;
  shakeTime = 0;

  drainAmount = 0;
  fillAmount = 0;
  drainingLayer: TeaId | null = null;
  fillingLayer: TeaId | null = null;
  drainingCount = 0;
  fillingCount = 0;

  readonly width: number;
  readonly height: number;
  readonly cornerRadius = 18;

  /** Source-only teapot: wider body + spout + handle, same skin language. */
  get isTeapot(): boolean {
    return this.constraint.mode === 'source-only';
  }

  /** Sink-only guest cup («Чашка гостя»): receives but never pours out. */
  get isSinkOnly(): boolean {
    return this.constraint.mode === 'sink-only';
  }

  /** Tasting bowl (дегустационная пиала): normal flow, capacity 2, ends empty. */
  get isTastingBowl(): boolean {
    return isTastingCupConstraint(this.constraint);
  }

  /**
   * High thermos (высокий термос, Gauntlet 10): normal flow, capacity 5,
   * must end empty, no named target. Derived from the authoritative
   * constraint via `isThermosCupConstraint` — no parallel view state.
   */
  get isThermos(): boolean {
    return isThermosCupConstraint(this.constraint);
  }

  /**
   * Rim Y in container-local coords — the stream origin/destination anchor.
   * Tall vessels (standard + thermos) pour from y=4 so the rim is never
   * clipped; the bottom-aligned bowl pours from its own rim, never from
   * empty air where a tall rim would have been.
   */
  get rimLocalY(): number {
    return this.isTastingBowl ? this.height - TASTING_BOWL_BODY_H : 4;
  }

  /**
   * Logical liquid slot height, derived from the authoritative
   * `cupCapacity`: standard vessels keep the fixed 4-slot rhythm (29px);
   * the tasting bowl divides its own interior by its effective capacity
   * (exactly 2 readable slots); the high thermos divides its taller
   * interior by its effective capacity (exactly 5 readable slots via
   * `thermosSlotH`, never 4 compressed slots). Standard/tasting geometry
   * is unchanged.
   *
   * Cinnamon (Gauntlet 11) deliberately does NOT alter this: the stick
   * vessel keeps the STANDARD cup body/geometry and tea layers ALWAYS use
   * the base-4 slot height (never stretch 2 layers to cap-2). The
   * effective cap-2 is a legality rule in rules.ts (`effectiveCupCapacity`);
   * the view only adds the stick + obstruction band above the tea.
   */
  slotHeightFor(c: CupConstraint): number {
    if (isTastingCupConstraint(c)) {
      const bottomY = this.height - 6;
      return (bottomY - (this.rimLocalY + 4)) / cupCapacity(c);
    }
    if (isThermosCupConstraint(c)) {
      return thermosSlotH(this.height);
    }
    return STANDARD_SLOT_H;
  }

  /**
   * Lemon surface point in stage space for a vessel holding `layerCount`
   * layers (G5.1): the ACTUAL transformed surface — local surface point
   * rotated by the live body tilt around the body pivot, shifted by the
   * live lift, scaled and placed at the container position (same
   * convention as the tea-spout anchor, which likewise ignores transient
   * shake). A tilted pouring source therefore launches the slice from
   * where its surface really is, not from the rest-pose point.
   */
  surfaceStagePoint(layerCount: number): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const localX = this.width / 2;
    const localY = lemonCenterLocalY(layerCount, this.constraint, this.height);
    const r = rotatePoint2D(
      localX - pivot.x,
      localY - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Ice surface point in stage space (Gauntlet 9 §98/§107): the ACTUAL
   * transformed ice anchor — local ice point rotated by the live body tilt
   * around the body pivot, shifted by the live lift, scaled and placed at
   * the container position (same convention as `surfaceStagePoint`, shake
   * ignored). The static slab and the melt flourish share this point.
   */
  iceSurfaceStagePoint(layerCount: number): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const localX = this.width / 2;
    const localY = iceCenterLocalY(layerCount, this.constraint, this.height);
    const r = rotatePoint2D(
      localX - pivot.x,
      localY - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Cinnamon stick center in container-local coords (Gauntlet 11): the ONE
   * shared anchor used by BOTH static rendering and the removal flourish.
   * Delegates to the pure `cinnamonGeometry` helper — never a second
   * offset truth. Fixed anchor (like honey, unlike lemon): partial
   * outflows keep the stick exactly here with no flicker.
   */
  cinnamonLocalPoint(): { x: number; y: number } {
    const geo = cinnamonGeometry(this.width, this.height);
    return { x: geo.x, y: geo.y };
  }

  /**
   * Cinnamon stick center in stage space (Gauntlet 11): the ACTUAL
   * transformed stick anchor — local stick point rotated by the live body
   * tilt around the body pivot, shifted by live lift, scaled and placed at
   * the container position (same convention as `surfaceStagePoint`/lemon
   * transit, shake ignored). A tilted pouring source therefore launches
   * the removal flourish from where its stick really is, never rest pose.
   */
  cinnamonStagePoint(): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const local = this.cinnamonLocalPoint();
    const r = rotatePoint2D(
      local.x - pivot.x,
      local.y - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Dormant-bud center in container-local coords (Gauntlet 12): the ONE
   * shared anchor used by BOTH static rendering and the bloom flourish.
   * Delegates to the pure `teaBudBottomPoint` helper — never a second
   * offset truth. Fixed anchor: partial outflows and inflows keep the bud
   * exactly here with no flicker.
   */
  teaBudLocalPoint(): { x: number; y: number } {
    return teaBudBottomPoint(this.width, this.height);
  }

  /**
   * Dormant-bud center in stage space (Gauntlet 12): the ACTUAL transformed
   * bud anchor — same pivot/rotation/lift/scale convention as the cinnamon
   * anchor, shake ignored. A tilted pouring source therefore launches the
   * bloom flourish from where its bud really is, never rest pose.
   */
  teaBudStagePoint(): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const local = this.teaBudLocalPoint();
    const r = rotatePoint2D(
      local.x - pivot.x,
      local.y - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Attached-tool anchor in container-local coords (Gauntlet 6 §35):
   * centered over the OPENING (teapot lid center, never spout/handle),
   * hovering just above the rim so tea color and Mystery markers below
   * stay fully readable. Small mesh (r=9) — never a cup silhouette.
   */
  strainerLocalPoint(): { x: number; y: number } {
    return { x: this.width / 2, y: this.rimLocalY - 14 };
  }

  /**
   * Attached-tool anchor in stage space (transform-aware like the lemon
   * anchor): pivot/rotation/lift/scale applied, shake ignored. Transit
   * endpoints (stand↔host) and the static marker share this point.
   */
  strainerStagePoint(): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const local = this.strainerLocalPoint();
    const r = rotatePoint2D(
      local.x - pivot.x,
      local.y - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Honey bottom anchor in container-local coords (Gauntlet 7 §79): the
   * ONE shared anchor used by BOTH static rendering and transit landing.
   * Delegates to the pure `honeyBottomLocalPoint` helper — never a second
   * offset truth.
   */
  honeyLocalPoint(): { x: number; y: number } {
    return honeyBottomLocalPoint(this.constraint, this.width, this.height);
  }

  /**
   * Honey bottom anchor in stage space (Gauntlet 7 §82): the ACTUAL
   * transformed bottom — local bottom point rotated by the live body tilt
   * around the body pivot, shifted by live lift, scaled and placed at the
   * container position (same convention as `surfaceStagePoint`/lemon
   * transit, shake ignored). A tilted pouring source therefore launches
   * the drop from where its bottom really is, never the rest pose.
   */
  honeyStagePoint(): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const local = this.honeyLocalPoint();
    const r = rotatePoint2D(
      local.x - pivot.x,
      local.y - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Destination rim anchor in stage space (transform-aware like the honey
   * bottom anchor): the mouth the amber drop falls through before sinking.
   * Uses the vessel's ACTUAL rim (`rimLocalY`), so tasting bowls receive
   * at their own shallow rim.
   */
  honeyRimStagePoint(): { x: number; y: number } {
    const pivot = this.cupBodyContainer.pivot;
    const localX = this.width / 2;
    const localY = this.rimLocalY + 8;
    const r = rotatePoint2D(
      localX - pivot.x,
      localY - pivot.y,
      this.cupBodyContainer.rotation,
    );
    return {
      x: this.container.x + (this.width / 2 + r.x) * this.scale,
      y: this.container.y + (pivot.y + this.currentLift + r.y) * this.scale,
    };
  }

  /**
   * Attached empty-tool marker (Gauntlet 6 §35): tiny brass mesh hovering
   * over the host rim. `true` draws, `false` clears. No tea color, no
   * Mystery cover — the mesh floats above the rim, liquid stays visible.
   */
  renderAttachedStrainer(attached: boolean): void {
    const g = this.strainerGraphics;
    g.clear();
    if (!attached) return;
    const p = this.strainerLocalPoint();
    drawStrainerMesh(g, p.x, p.y, STRAINER_ATTACHED_R, null);
  }

  /** Named-serving destination, if this cup is a target cup. */
  get targetTeaId(): TeaId | undefined {
    return this.constraint.mode === 'normal' ? this.constraint.targetTeaId : undefined;
  }

  skinId: CupSkinId = 'glass';
  lastCup: Cup | null = null;
  scale = 1;

  get visualWidth(): number {
    return this.width * this.scale;
  }

  get visualHeight(): number {
    return this.height * this.scale;
  }

  setScale(scale: number) {
    this.scale = scale;
    this.container.scale.set(scale);
  }

  constructor(index: number, constraint?: CupConstraint) {
    this.index = index;
    this.constraint = cloneCupConstraint(constraint ?? { mode: 'normal' });
    // Teapot reads as a teapot: a restrained wider belly (72 vs 64).
    // Spout/handle overflow into the inter-cup gap padding, so rows stay clean.
    // Thermos reads taller + slightly narrower (56 vs 64) so 3 columns still
    // fit 360px; height equals THERMOS_BODY_H so 5 slots stay readable.
    if (this.constraint.mode === 'source-only') {
      this.width = 72;
    } else if (isThermosCupConstraint(this.constraint)) {
      this.width = THERMOS_WIDTH;
    } else {
      this.width = 64;
    }
    this.height = isThermosCupConstraint(this.constraint) ? THERMOS_BODY_H : 142;
    this.container = new Container();

    this.shadowGraphics = new Graphics();
    this.container.addChild(this.shadowGraphics);

    this.cupBodyContainer = new Container();
    this.container.addChild(this.cupBodyContainer);

    this.glowGraphics = new Graphics();
    this.cupBodyContainer.addChild(this.glowGraphics);

    this.liquidContainer = new Container();
    this.liquidGraphics = new Graphics();
    this.liquidMask = new Graphics();
    this.liquidContainer.addChild(this.liquidGraphics);
    this.cupBodyContainer.addChild(this.liquidMask);
    this.liquidContainer.mask = this.liquidMask;
    this.cupBodyContainer.addChild(this.liquidContainer);

    // Honey sits at the bottom (below the tea column, above the base
    // shade) but renders translucently ABOVE the liquid so it reads
    // through tea without hiding tea color; glass highlights + lemon
    // (surface) + target motif stay above it for readability.
    this.honeyGraphics = new Graphics();
    this.cupBodyContainer.addChild(this.honeyGraphics);

    this.glassOverlay = new Graphics();
    this.cupBodyContainer.addChild(this.glassOverlay);

    this.lemonGraphics = new Graphics();
    this.lemonGraphics.eventMode = 'none';
    this.cupBodyContainer.addChild(this.lemonGraphics);

    this.iceGraphics = new Graphics();
    this.iceGraphics.eventMode = 'none';
    this.cupBodyContainer.addChild(this.iceGraphics);

    // Cinnamon stick + obstruction band (Gauntlet 11): above the liquid so
    // the stick reads over the empty upper interior, below the target
    // motif. Standard hitbox unchanged; this layer never intercepts
    // pointer (eventMode none, same as the strainer marker).
    this.cinnamonGraphics = new Graphics();
    this.cinnamonGraphics.eventMode = 'none';
    this.cupBodyContainer.addChild(this.cinnamonGraphics);

    // Dormant tea bud (Gauntlet 12): at the physical bottom, above the
    // liquid so the tied-bundle silhouette reads through tea (strong
    // outline, glass-front rendering), below the target motif. Never
    // intercepts pointer (eventMode none). Tea geometry unchanged.
    this.teaBudGraphics = new Graphics();
    this.teaBudGraphics.eventMode = 'none';
    this.cupBodyContainer.addChild(this.teaBudGraphics);

    this.targetGraphics = new Graphics();
    this.cupBodyContainer.addChild(this.targetGraphics);

    this.strainerGraphics = new Graphics();
    this.strainerGraphics.eventMode = 'none';
    this.cupBodyContainer.addChild(this.strainerGraphics);

    this.cupBodyContainer.pivot.set(this.width / 2, 10);

    this.drawCupFrame();
    this.drawShadow();
  }

  setSkin(skinId: CupSkinId) {
    this.skinId = skinId;
    this.drawCupFrame();
    if (this.lastCup) {
      this.renderLiquid(this.lastCup);
    } else {
      this.renderTargetMotif(null);
    }
  }

  setHomePosition(x: number, y: number) {
    this.homeX = x;
    this.homeY = y;
    this.targetX = x;
    this.targetY = y;
    this.container.position.set(x, y);
  }

  drawShadow() {
    this.shadowGraphics.clear();
    this.shadowGraphics
      .ellipse(this.width / 2, this.height + 6, this.width / 2 + 6, 9)
      .fill({ color: 0x120c0a, alpha: 0.35 });
  }

  drawCupFrame() {
    const w = this.width;
    const h = this.height;
    const r = this.cornerRadius;

    this.liquidMask.clear();
    this.liquidMask.roundRect(2, 4, w - 4, h - 6, r).fill({ color: 0xffffff });

    this.glassOverlay.clear();

    // Source-only teapot: wider belly + lid/knob + spout (left) + handle
    // (right), drawn in the active skin's material language. Tea layers
    // reuse the same liquid renderer so readability is unchanged.
    if (this.isTeapot) {
      this.drawTeapotFrame(w, h, r);
      return;
    }

    // Sink-only guest cup: low ceremonial tea cup with a small handle and
    // a saucer beneath, restrained gold rim/detail in the active skin
    // language. Same liquid box so layers stay readable; no text, no icons.
    if (this.isSinkOnly) {
      this.drawGuestCupFrame(w, h, r);
      return;
    }

    // Tasting bowl (Gauntlet 4): shallow ceremonial пиала, bottom-aligned
    // in the standard cell — smaller, shallower, gold-rimmed, with a foot
    // saucer. The liquid mask covers only the bowl interior (see below).
    if (this.isTastingBowl) {
      this.liquidMask.clear();
      this.liquidMask
        .roundRect(3, this.rimLocalY + 4, w - 6, h - 6 - (this.rimLocalY + 4), 10)
        .fill({ color: 0xffffff });
      this.drawTastingBowlFrame(w, h);
      return;
    }

    // High thermos (Gauntlet 10): tall slim translucent vessel — same
    // full-height liquid mask as standard cups (all 5 layers readable),
    // narrower silhouette, cozy glass language. No text, no logos.
    if (this.isThermos) {
      this.liquidMask.clear();
      this.liquidMask.roundRect(2, 4, w - 4, h - 6, r).fill({ color: 0xffffff });
      this.drawThermosFrame(w, h);
      return;
    }

    if (this.skinId === 'ceramic') {
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0x5a3d2b, alpha: 0.22 });

      this.glassOverlay.roundRect(4, h - 11, w - 8, 9, 3).fill({ color: 0x3d271a, alpha: 0.45 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 3.2, color: 0xc49a75, alpha: 0.95 });

      this.glassOverlay.roundRect(-2, 1, w + 4, 7, 3.5).fill({ color: 0xd8ab85, alpha: 0.9 });
      this.glassOverlay.ellipse(w / 2, 4.5, w / 2, 3).stroke({ width: 1.8, color: 0x7a543a, alpha: 0.9 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 28);
      this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
      this.glassOverlay.stroke({ width: 5.5, color: 0x7a543a, alpha: 0.92 });
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 33);
      this.glassOverlay.bezierCurveTo(w + 13, 39, w + 13, 86, w - 1, 93);
      this.glassOverlay.stroke({ width: 2, color: 0xc49a75, alpha: 0.7 });

      this.glassOverlay.roundRect(6, 14, 3.5, h - 38, 2).fill({ color: 0xffe8d6, alpha: 0.2 });
    } else if (this.skinId === 'porcelain') {
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0xfffaea, alpha: 0.24 });

      this.glassOverlay.roundRect(4, h - 10, w - 8, 8, 3).fill({ color: 0xfffaea, alpha: 0.5 });
      this.glassOverlay.roundRect(6, h - 5, w - 12, 3, 1.5).fill({ color: 0xd4af37, alpha: 0.85 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 2.8, color: 0xffffff, alpha: 0.9 });

      this.glassOverlay.roundRect(-2, 1, w + 4, 6.5, 3).fill({ color: 0xd4af37, alpha: 0.95 });
      this.glassOverlay.ellipse(w / 2, 4, w / 2, 2.8).stroke({ width: 2, color: 0xffe680, alpha: 0.95 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 26);
      this.glassOverlay.bezierCurveTo(w + 24, 33, w + 24, 92, w - 1, 100);
      this.glassOverlay.stroke({ width: 4.8, color: 0xd4af37, alpha: 0.95 });
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 32);
      this.glassOverlay.bezierCurveTo(w + 14, 38, w + 14, 86, w - 1, 94);
      this.glassOverlay.stroke({ width: 1.8, color: 0xffe680, alpha: 0.8 });

      this.glassOverlay.roundRect(5, 12, 4, h - 34, 2).fill({ color: 0xffffff, alpha: 0.45 });
      this.glassOverlay.roundRect(12, 16, 2, h - 46, 1).fill({ color: 0xffffff, alpha: 0.3 });
    } else {
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0xffffff, alpha: 0.12 });

      this.glassOverlay.roundRect(4, h - 10, w - 8, 8, 3).fill({ color: 0xffffff, alpha: 0.32 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 2.8, color: 0xffffff, alpha: 0.82 });

      this.glassOverlay.roundRect(-2, 1, w + 4, 6, 3).fill({ color: 0xffffff, alpha: 0.55 });
      this.glassOverlay.ellipse(w / 2, 4, w / 2, 3).stroke({ width: 1.8, color: 0xffffff, alpha: 0.8 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 28);
      this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
      this.glassOverlay.stroke({ width: 5, color: 0xffffff, alpha: 0.75 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 34);
      this.glassOverlay.bezierCurveTo(w + 14, 40, w + 14, 85, w - 1, 92);
      this.glassOverlay.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

      this.glassOverlay.roundRect(5, 12, 4.5, h - 34, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
      this.glassOverlay.roundRect(12, 16, 2.5, h - 46, 1.2).fill({ color: 0xffffff, alpha: 0.22 });
      this.glassOverlay.roundRect(w - 9, 14, 3, h - 38, 1.5).fill({ color: 0xffffff, alpha: 0.28 });
    }
  }

  /**
   * Restrained procedural teapot: wider belly body, lid + knob, a small
   * left spout and a right handle. Inherits the active skin palette
   * (glass / ceramic / porcelain) so the service language stays coherent.
   * No text is baked into the canvas; the hit area stays >= normal cups.
   */
  private drawTeapotFrame(w: number, h: number, r: number) {
    const g = this.glassOverlay;
    const bellyR = Math.min(24, r + 4);
    // Skin palette.
    let bodyFill = 0xffffff;
    let bodyFillAlpha = 0.12;
    let edgeColor = 0xffffff;
    let edgeAlpha = 0.85;
    let lidColor = 0xffffff;
    let lidAlpha = 0.55;
    let trimColor = 0xffffff;
    if (this.skinId === 'ceramic') {
      bodyFill = 0x5a3d2b;
      bodyFillAlpha = 0.28;
      edgeColor = 0xc49a75;
      edgeAlpha = 0.95;
      lidColor = 0xd8ab85;
      lidAlpha = 0.9;
      trimColor = 0x7a543a;
    } else if (this.skinId === 'porcelain') {
      bodyFill = 0xfffaea;
      bodyFillAlpha = 0.26;
      edgeColor = 0xffffff;
      edgeAlpha = 0.92;
      lidColor = 0xd4af37;
      lidAlpha = 0.95;
      trimColor = 0xffe680;
    }

    // Spout (left): short tapered pourer from the upper belly.
    g.beginPath();
    g.moveTo(3, 30);
    g.lineTo(-11, 12);
    g.lineTo(-8, 8);
    g.lineTo(8, 24);
    g.closePath();
    g.fill({ color: edgeColor, alpha: Math.min(1, edgeAlpha) });
    g.beginPath();
    g.moveTo(2, 28);
    g.lineTo(-8, 13);
    g.stroke({ width: 2, color: trimColor, alpha: 0.6 });

    // Handle (right): cozy C-curve, same language as normal-cup handles.
    g.beginPath();
    g.moveTo(w - 1, 30);
    g.bezierCurveTo(w + 24, 38, w + 24, 92, w - 1, 100);
    g.stroke({ width: 5.5, color: edgeColor, alpha: edgeAlpha });
    g.beginPath();
    g.moveTo(w - 1, 36);
    g.bezierCurveTo(w + 14, 42, w + 14, 86, w - 1, 94);
    g.stroke({ width: 2, color: trimColor, alpha: 0.7 });

    // Belly body.
    g.beginPath();
    g.moveTo(0, 10);
    g.lineTo(w, 10);
    g.lineTo(w, h - bellyR);
    g.quadraticCurveTo(w, h, w - bellyR, h);
    g.lineTo(bellyR, h);
    g.quadraticCurveTo(0, h, 0, h - bellyR);
    g.closePath();
    g.fill({ color: bodyFill, alpha: bodyFillAlpha });
    g.beginPath();
    g.moveTo(0, 10);
    g.lineTo(0, h - bellyR);
    g.quadraticCurveTo(0, h, bellyR, h);
    g.lineTo(w - bellyR, h);
    g.quadraticCurveTo(w, h, w, h - bellyR);
    g.lineTo(w, 10);
    g.stroke({ width: 3, color: edgeColor, alpha: edgeAlpha });

    // Base shade + highlight (keeps tea layers readable, not cluttered).
    g.roundRect(5, h - 11, w - 10, 9, 3).fill({ color: 0x000000, alpha: 0.18 });
    g.roundRect(8, 18, 4, h - 44, 2).fill({ color: 0xffffff, alpha: 0.28 });

    // Lid + knob.
    g.roundRect(-3, 2, w + 6, 9, 4).fill({ color: lidColor, alpha: lidAlpha });
    g.ellipse(w / 2, 6.5, w / 2, 3.2).stroke({ width: 1.8, color: trimColor, alpha: 0.9 });
    g.circle(w / 2, 0, 4).fill({ color: lidColor, alpha: lidAlpha });
    g.circle(w / 2, 0, 4).stroke({ width: 1.4, color: trimColor, alpha: 0.85 });
  }

  /**
   * Sink-only guest cup («Чашка гостя»): a low ceremonial tea cup — same
   * liquid box as ordinary vessels (readability first), but with a small
   * visible handle, a saucer beneath, and a restrained gold rim/detail in
   * the active skin language. No baked-in text, no padlock icon: the
   * silhouette itself reads as a serving destination, never as a teapot.
   * Saucer/handle overflow slightly into the inter-cup gap padding, so
   * rows stay clean and the hit area (widened at setup) covers them.
   */
  private drawGuestCupFrame(w: number, h: number, r: number) {
    const g = this.glassOverlay;
    let bodyFill = 0xffffff;
    let bodyFillAlpha = 0.12;
    let edgeColor = 0xffffff;
    let edgeAlpha = 0.82;
    let saucerColor = 0xffffff;
    let saucerAlpha = 0.2;
    let goldColor = 0xd4af37;
    if (this.skinId === 'ceramic') {
      bodyFill = 0x5a3d2b;
      bodyFillAlpha = 0.28;
      edgeColor = 0xc49a75;
      edgeAlpha = 0.95;
      saucerColor = 0x5a3d2b;
      saucerAlpha = 0.55;
      goldColor = 0xe8c878;
    } else if (this.skinId === 'porcelain') {
      bodyFill = 0xfffaea;
      bodyFillAlpha = 0.26;
      edgeColor = 0xffffff;
      edgeAlpha = 0.92;
      saucerColor = 0xfffaea;
      saucerAlpha = 0.42;
      goldColor = 0xd4af37;
    }

    // Saucer beneath the cup.
    g.ellipse(w / 2, h + 9, w / 2 + 11, 8).fill({ color: saucerColor, alpha: saucerAlpha });
    g.ellipse(w / 2, h + 9, w / 2 + 11, 8).stroke({ width: 1.6, color: goldColor, alpha: 0.75 });
    g.ellipse(w / 2, h + 8, w / 2 + 4, 4.5).fill({ color: 0x000000, alpha: 0.18 });
    g.ellipse(w / 2, h + 8, w / 2 + 4, 4.5).stroke({ width: 1, color: goldColor, alpha: 0.5 });

    // Small handle (right): tighter ceremonial C-curve.
    g.beginPath();
    g.moveTo(w - 1, 44);
    g.bezierCurveTo(w + 15, 49, w + 15, 92, w - 1, 98);
    g.stroke({ width: 4.5, color: edgeColor, alpha: edgeAlpha });
    g.beginPath();
    g.moveTo(w - 1, 49);
    g.bezierCurveTo(w + 8, 53, w + 8, 87, w - 1, 93);
    g.stroke({ width: 1.6, color: goldColor, alpha: 0.7 });

    // Cup body.
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(w, 4);
    g.lineTo(w, h - r);
    g.quadraticCurveTo(w, h, w - r, h);
    g.lineTo(r, h);
    g.quadraticCurveTo(0, h, 0, h - r);
    g.closePath();
    g.fill({ color: bodyFill, alpha: bodyFillAlpha });
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(0, h - r);
    g.quadraticCurveTo(0, h, r, h);
    g.lineTo(w - r, h);
    g.quadraticCurveTo(w, h, w, h - r);
    g.lineTo(w, 4);
    g.stroke({ width: 2.6, color: edgeColor, alpha: edgeAlpha });

    // Restrained gold rim + base accent.
    g.roundRect(-2, 1, w + 4, 6, 3).fill({ color: goldColor, alpha: 0.9 });
    g.ellipse(w / 2, 4, w / 2, 2.8).stroke({ width: 1.4, color: 0xfff3c4, alpha: 0.9 });
    g.roundRect(5, h - 5, w - 10, 3, 1.5).fill({ color: goldColor, alpha: 0.85 });

    // Soft highlight (keeps tea layers readable).
    g.roundRect(5, 12, 4, h - 34, 2).fill({ color: 0xffffff, alpha: 0.3 });
  }

  /**
   * Tasting bowl (Gauntlet 4): a shallow ceremonial пиала — wider rim
   * relative to height, foot saucer, restrained gold rim/detail in the
   * active skin language. Bottom-aligned in the standard cell; clearly
   * distinct from the tall cup, the teapot and the guest cup. No text,
   * no icons. Liquid (2 slots) is drawn by the shared renderer through
   * the bowl-interior mask set in drawCupFrame.
   */
  private drawTastingBowlFrame(w: number, h: number) {
    const g = this.glassOverlay;
    const rimY = this.rimLocalY;
    let bodyFill = 0xffffff;
    let bodyFillAlpha = 0.12;
    let edgeColor = 0xffffff;
    let edgeAlpha = 0.82;
    let saucerColor = 0xffffff;
    let saucerAlpha = 0.2;
    let goldColor = 0xd4af37;
    if (this.skinId === 'ceramic') {
      bodyFill = 0x5a3d2b;
      bodyFillAlpha = 0.3;
      edgeColor = 0xc49a75;
      edgeAlpha = 0.95;
      saucerColor = 0x5a3d2b;
      saucerAlpha = 0.55;
      goldColor = 0xe8c878;
    } else if (this.skinId === 'porcelain') {
      bodyFill = 0xfffaea;
      bodyFillAlpha = 0.28;
      edgeColor = 0xffffff;
      edgeAlpha = 0.92;
      saucerColor = 0xfffaea;
      saucerAlpha = 0.42;
      goldColor = 0xd4af37;
    }

    // Foot saucer beneath the bowl.
    g.ellipse(w / 2, h + 4, w / 2 + 6, 6).fill({ color: saucerColor, alpha: saucerAlpha });
    g.ellipse(w / 2, h + 4, w / 2 + 6, 6).stroke({ width: 1.6, color: goldColor, alpha: 0.75 });
    // Foot stem.
    g.roundRect(w / 2 - 9, h - 10, 18, 10, 3).fill({ color: edgeColor, alpha: 0.5 });

    // Bowl body: wide rim tapering to a rounded base.
    const rimOver = 4;
    const baseHalf = w / 2 - 13;
    g.beginPath();
    g.moveTo(-rimOver, rimY);
    g.quadraticCurveTo(-rimOver + 2, h - 14, w / 2 - baseHalf, h - 4);
    g.quadraticCurveTo(w / 2, h, w / 2 + baseHalf, h - 4);
    g.quadraticCurveTo(w + rimOver - 2, h - 14, w + rimOver, rimY);
    g.closePath();
    g.fill({ color: bodyFill, alpha: bodyFillAlpha });
    g.beginPath();
    g.moveTo(-rimOver, rimY);
    g.quadraticCurveTo(-rimOver + 2, h - 14, w / 2 - baseHalf, h - 4);
    g.quadraticCurveTo(w / 2, h, w / 2 + baseHalf, h - 4);
    g.quadraticCurveTo(w + rimOver - 2, h - 14, w + rimOver, rimY);
    g.stroke({ width: 2.6, color: edgeColor, alpha: edgeAlpha });

    // Restrained gold rim band + opening highlight.
    g.roundRect(-rimOver - 1, rimY - 3, w + (rimOver + 1) * 2, 6, 3).fill({
      color: goldColor,
      alpha: 0.9,
    });
    g.ellipse(w / 2, rimY, w / 2 - 2, 2.8).stroke({ width: 1.4, color: 0xfff3c4, alpha: 0.9 });

    // Soft highlight on the left wall (keeps tea layers readable).
    g.roundRect(7, rimY + 10, 3.5, h - rimY - 26, 2).fill({ color: 0xffffff, alpha: 0.28 });
  }

  /**
   * High thermos (Gauntlet 10): tall slim translucent vessel in the active
   * skin language — full-height liquid box (all 5 layers readable through
   * low-alpha walls, never an opaque flask), slightly narrower silhouette,
   * cozy glass highlights. The restrained gold rim + base accent adapts the
   * tasting-bowl must-end-empty cue (temporary storage, not a target cup):
   * no medallion ever renders here (no targetTeaId by construction), no
   * text, no logos. The slim cap knob sits above the liquid column so tea
   * identity stays fully readable.
   */
  private drawThermosFrame(w: number, h: number) {
    const g = this.glassOverlay;
    const r = this.cornerRadius;
    let bodyFill = 0xffffff;
    let bodyFillAlpha = 0.12;
    let edgeColor = 0xffffff;
    let edgeAlpha = 0.82;
    let goldColor = 0xd4af37;
    if (this.skinId === 'ceramic') {
      bodyFill = 0x5a3d2b;
      bodyFillAlpha = 0.22;
      edgeColor = 0xc49a75;
      edgeAlpha = 0.95;
      goldColor = 0xe8c878;
    } else if (this.skinId === 'porcelain') {
      bodyFill = 0xfffaea;
      bodyFillAlpha = 0.24;
      edgeColor = 0xffffff;
      edgeAlpha = 0.9;
      goldColor = 0xd4af37;
    }

    // Tall slim translucent body.
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(w, 4);
    g.lineTo(w, h - r);
    g.quadraticCurveTo(w, h, w - r, h);
    g.lineTo(r, h);
    g.quadraticCurveTo(0, h, 0, h - r);
    g.closePath();
    g.fill({ color: bodyFill, alpha: bodyFillAlpha });
    g.beginPath();
    g.moveTo(0, 4);
    g.lineTo(0, h - r);
    g.quadraticCurveTo(0, h, r, h);
    g.lineTo(w - r, h);
    g.quadraticCurveTo(w, h, w, h - r);
    g.lineTo(w, 4);
    g.stroke({ width: 2.6, color: edgeColor, alpha: edgeAlpha });

    // Base shade (keeps the bottom layer readable, never opaque).
    g.roundRect(4, h - 10, w - 8, 8, 3).fill({ color: 0xffffff, alpha: 0.28 });

    // Temporary-storage cue (tasting adaptation): restrained gold rim band.
    g.roundRect(-2, 1, w + 4, 6, 3).fill({ color: goldColor, alpha: 0.9 });
    g.ellipse(w / 2, 4, w / 2, 2.8).stroke({ width: 1.4, color: 0xfff3c4, alpha: 0.9 });

    // Slim cap knob above the liquid column (thermos read, half above the
    // rim like the teapot knob — never covering tea, no text, no logo).
    g.roundRect(w / 2 - 8, -2, 16, 5, 2).fill({ color: edgeColor, alpha: 0.85 });
    g.roundRect(w / 2 - 8, -2, 16, 5, 2).stroke({ width: 1, color: goldColor, alpha: 0.7 });

    // Thin gold base accent (guest/tasting language for special vessels).
    g.roundRect(5, h - 5, w - 10, 3, 1.5).fill({ color: goldColor, alpha: 0.85 });

    // Cozy highlights, low alpha so all 5 layers stay readable.
    g.roundRect(5, 12, 3.5, h - 34, 2).fill({ color: 0xffffff, alpha: 0.3 });
    g.roundRect(w - 8, 14, 2.5, h - 38, 1.2).fill({ color: 0xffffff, alpha: 0.22 });
  }

  /**
   * Named-serving destination motif (Gauntlet 2): a small restrained gold
   * porcelain-style medallion near the cup base with an accent dot in the
   * target tea's color. Rendered from the authoritative CupConstraint
   * (never inferred from contents), above the liquid so it stays readable
   * even when the cup temporarily holds another tea. State comes from the
   * pure domain helper `targetCupState` — the view decides nothing.
   */
  renderTargetMotif(cup: Cup | null) {
    const g = this.targetGraphics;
    g.clear();
    const target = this.targetTeaId;
    if (target === undefined || !cup) return;
    const tea = TEA_TYPES[target];
    const state = targetCupState(cup.layers, this.constraint);
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h - 18;

    if (state === 'correct') {
      // Soft gold-green confirmation glow behind the medallion.
      g.circle(cx, cy, 13).fill({ color: 0x9fc46a, alpha: 0.35 });
      g.circle(cx, cy, 10.5).fill({ color: 0xffe9a8, alpha: 0.5 });
    }
    // Medallion body.
    g.circle(cx, cy, 7.5).fill({ color: 0x2a1d12, alpha: 0.72 });
    const ringColor = state === 'wrong-full' ? 0xe08a3c : 0xd4af37;
    const ringAlpha = state === 'working' ? 0.9 : 1;
    g.circle(cx, cy, 7.5).stroke({ width: 2, color: ringColor, alpha: ringAlpha });
    // Target-tea accent dot: the restrained symbolic system — the wanted
    // tea's own color, readable at mobile size, no text baked in canvas.
    g.circle(cx, cy, 4.2).fill({ color: tea.colorNum, alpha: 1 });
    g.circle(cx - 1.2, cy - 1.2, 1.4).fill({ color: 0xffffff, alpha: 0.55 });
  }

  /**
   * Sink-only per-vessel completion treatment (Gauntlet 3 §44): a soft
   * gold glow behind a FULL homogeneous guest cup — the same restrained
   * per-vessel language the target 'correct' motif already uses, so no
   * global "wrong state" is implied (any tea may serve the guest).
   */
  private refreshSinkGlow(cup: Cup | null) {
    if (!this.isSinkOnly || !cup || !isCompleteCup(cup.layers) || !cup.isHomogeneous) return;
    this.glowGraphics
      .roundRect(-7, -3, this.width + 14, this.height + 10, this.cornerRadius + 5)
      .fill({ color: 0xffe9a8, alpha: 0.22 });
    this.glowGraphics
      .roundRect(-4, 0, this.width + 8, this.height + 4, this.cornerRadius + 3)
      .stroke({ width: 2, color: 0xd4af37, alpha: 0.6 });
  }

  /**
   * Floating lemon slice (Gauntlet 5 §64–68): drawn from the authoritative
   * `Cup.floatingIngredient` at the actual liquid surface for the current
   * (possibly fill-animating) layer count. Hidden while a pour-arc transit
   * is flying so two lemons never show. A correctly served lemon (full
   * homogeneous sea_buckthorn) gets a soft warm-gold halo — no checkmark,
   * no red state, no punishment.
   */
  renderLemon(cup: Cup) {
    const g = this.lemonGraphics;
    g.clear();
    if (this.suppressLemonTransit) return;
    const ing = cup.floatingIngredient;
    if (ing == null || ing !== 'lemon') return;
    // During a fill animation the logic is already post-move: ride the
    // animated surface (pre-pour base + grown fraction) instead of
    // jumping to the final level.
    let effCount = cup.layers.length;
    if (this.fillingCount > 0 && this.fillingLayer) {
      effCount = cup.layers.length - this.fillingCount + this.fillingCount * this.fillAmount;
    }
    const cx = this.width / 2;
    const cy = lemonCenterLocalY(effCount, cup.constraint, this.height);
    if (floatingIngredientHostSatisfied('lemon', cup.layers, cup.constraint)) {
      g.circle(cx, cy, LEMON_SLICE_R + 5).fill({ color: 0xffe9a8, alpha: 0.3 });
    }
    drawLemonSlice(g, cx, cy, LEMON_SLICE_R);
  }

  /**
   * Sinking honey (Gauntlet 7 §80-81): drawn from the authoritative
   * `Cup.sinkingIngredient` at the ONE shared bottom anchor
   * (`honeyLocalPoint`, never a second offset truth). The blob stays at
   * the bottom during partial outflows (fixed anchor, no flicker) and
   * stays hidden while its drop transit is flying. A correctly served
   * honey (full homogeneous buckwheat per `sinkingIngredientHostSatisfied`
   * — View only calls it, never reimplements goal logic) gets a very
   * subtle warm halo, never red, never checkmark.
   */
  renderHoney(cup: Cup) {
    const g = this.honeyGraphics;
    g.clear();
    // No-honey fast path: empty vessels (and suppressed flights) leave an
    // empty layer, so honey-free levels render byte-identical to before.
    if (this.suppressHoneyTransit) return;
    const ing = cup.sinkingIngredient;
    if (ing == null || ing !== 'honey') return;
    const p = this.honeyLocalPoint();
    if (sinkingIngredientHostSatisfied(ing, cup.layers, cup.constraint)) {
      g.circle(p.x, p.y, 13).fill({ color: 0xffe9a8, alpha: 0.26 });
    }
    drawHoneyBlob(g, p.x, p.y);
  }

  /**
   * Frozen-cup ice slab (Gauntlet 9 §98–99): drawn from the authoritative
   * `Cup.ice` at the actual liquid surface for the current (possibly
   * fill-animating) layer count. Tea layers stay fully visible beneath the
   * translucent slab; the slab + frost rim + cracks read as frozen by
   * shape, not color alone.
   */
  renderIce(cup: Cup) {
    const g = this.iceGraphics;
    g.clear();
    if (cup.ice == null || cup.ice !== 'ice') return;
    // During a fill animation the logic is already post-move: ride the
    // animated surface like the lemon slice instead of jumping.
    let effCount = cup.layers.length;
    if (this.fillingCount > 0 && this.fillingLayer) {
      effCount = cup.layers.length - this.fillingCount + this.fillingCount * this.fillAmount;
    }
    const cx = this.width / 2;
    const cy = iceCenterLocalY(effCount, cup.constraint, this.height);
    drawIceSlab(g, cx, cy);
  }

  /**
   * Cinnamon stick (Gauntlet 11): drawn from the authoritative
   * `Cup.capacityObstacle` at the ONE shared stick anchor
   * (`cinnamonLocalPoint`, never a second offset truth). The stick keeps
   * the STANDARD cup body/geometry; tea layers always use the base-4 slot
   * height (see `slotHeightFor` — never stretched). The blocked upper
   * interior reads via the stick silhouette occupying it + a subtle
   * translucent warm obstruction band + at most two faint slot cues —
   * never fake tea layers, never gray liquid, never Mystery-? cover,
   * never lock icons, never text. The stick stays fixed during partial
   * outflows (no flicker); post-unlock (obstacle null) this clears to an
   * empty layer so the cup is indistinguishable from standard normal.
   */
  renderCinnamon(cup: Cup) {
    const g = this.cinnamonGraphics;
    g.clear();
    const obstacle: CapacityObstacleSlot = cup.capacityObstacle;
    if (obstacle == null || obstacle !== 'cinnamon') return;
    // No-honey-style fast path is implicit: null clears to empty, so
    // cinnamon-free levels render byte-identical to before.
    const overlay = blockedCapacityOverlay(obstacle, this.height);
    if (overlay.blockedSlots > 0) {
      // Subtle translucent warm obstruction band over the blocked upper
      // interior (warm tint, never gray, never opaque tea).
      g.roundRect(3, overlay.bandY, this.width - 6, overlay.bandH, 4).fill({
        color: 0xc98a4b,
        alpha: 0.14,
      });
      // At most two faint blocked-slot cues (thin dividers, shape language
      // for limited color discrimination — not color alone, no icons).
      for (const cueY of overlay.cueYs.slice(0, 2)) {
        g.rect(5, cueY - 0.75, this.width - 10, 1.5).fill({
          color: 0xffe0b3,
          alpha: 0.4,
        });
      }
    }
    const geo = cinnamonGeometry(this.width, this.height);
    drawCinnamonStick(g, geo.x, geo.y, geo.w, geo.h, geo.tilt, 1);
  }

  /**
   * Dormant tea bud (Gauntlet 12): drawn from the authoritative
   * `Cup.teaBud` at the ONE shared bottom anchor (`teaBudLocalPoint`,
   * never a second offset truth). The bud keeps the STANDARD cup
   * body/geometry; tea layers always use the base-4 slot height (never
   * displaced, never stretched — the bud consumes no capacity). The bud
   * silhouette draws ABOVE the liquid with a strong outline so it stays
   * readable even under four tea layers, while tea colors above stay
   * readable; no displaced bottom layer, no capacity loss. Post-bloom
   * (bud null) this clears to an empty layer so the cup is
   * indistinguishable from standard normal.
   */
  renderTeaBud(cup: Cup) {
    const g = this.teaBudGraphics;
    g.clear();
    const bud: TeaBudSlot = cup.teaBud;
    if (bud == null || bud !== 'tea_bud') return;
    // Bud-free levels render byte-identical to before (null clears empty).
    const pt = this.teaBudLocalPoint();
    drawTeaBud(g, pt.x, pt.y, teaBudScaleForCup(this.width), 1);
  }

  renderLiquid(cup: Cup) {
    this.lastCup = cup;
    this.renderTargetMotif(cup);
    this.renderLemon(cup);
    this.renderHoney(cup);
    this.renderIce(cup);
    this.renderCinnamon(cup);
    this.renderTeaBud(cup);
    // Sink glow lives in glowGraphics (behind the liquid, like the
    // selection ring); re-apply it on every liquid redraw unless a
    // selection ring is active (setSelection owns the layer then).
    if (this.isSinkOnly && !this.isLifted) {
      this.glowGraphics.clear();
      this.refreshSinkGlow(cup);
    }
    const g = this.liquidGraphics;
    g.clear();

    const w = this.width;
    const h = this.height;
    const bottomY = h - 6;
    // Dynamic slot height: tall vessels keep the 4-slot rhythm; the bowl
    // renders exactly its own capacity (2 readable slots, bottom → top).
    const layerH = this.slotHeightFor(cup.constraint);

    const layers = [...cup.layers];

    if (this.drainingCount > 0 && this.drainAmount > 0) {
      const fullLayers = layers.length;
      const effectiveLayers = fullLayers - this.drainingCount * this.drainAmount;

      for (let i = 0; i < layers.length; i++) {
        const layerId = layers[i] as TeaId;
        const tea = TEA_TYPES[layerId];
        const layerBottom = bottomY - i * layerH;
        let currentH = layerH;

        if (i >= fullLayers - this.drainingCount) {
          const layerOffset = i - (fullLayers - this.drainingCount);
          const ratio = Math.max(
            0,
            Math.min(1, effectiveLayers - (fullLayers - this.drainingCount - layerOffset)),
          );
          currentH = layerH * ratio;
        }

        if (currentH > 0.5) {
          const y = layerBottom - currentH;
          if (cup.isLayerHidden(i)) {
            g.rect(0, y, w, currentH).fill({ color: 0x3d3028 });
            g.rect(2, y + 1, w - 4, Math.max(1, currentH - 2)).fill({ color: 0x5e4b3e, alpha: 0.9 });
          } else {
            g.rect(0, y, w, currentH).fill({ color: tea.colorNum });
            g.rect(0, layerBottom - 1.5, w, 1.5).fill({ color: 0x000000, alpha: 0.12 });
          }
        }
      }

      const topY = bottomY - effectiveLayers * layerH;
      if (effectiveLayers > 0.1) {
        g.ellipse(w / 2, topY, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.28 });
      }
      return;
    }

    if (this.fillingCount > 0 && this.fillAmount > 0 && this.fillingLayer) {
      const tea = TEA_TYPES[this.fillingLayer];
      for (let i = 0; i < layers.length; i++) {
        const layerId = layers[i] as TeaId;
        const t = TEA_TYPES[layerId];
        const y = bottomY - (i + 1) * layerH;

        if (cup.isLayerHidden(i)) {
          g.rect(0, y, w, layerH).fill({ color: 0x3d3028 });
          g.rect(2, y + 2, w - 4, layerH - 4).fill({ color: 0x5e4b3e, alpha: 0.9 });
        } else {
          g.rect(0, y, w, layerH).fill({ color: t.colorNum });
          g.rect(0, bottomY - i * layerH - 1.5, w, 1.5).fill({ color: 0x000000, alpha: 0.12 });
        }
      }

      const baseCount = layers.length;
      const extraHeight = this.fillingCount * layerH * this.fillAmount;
      const y = bottomY - baseCount * layerH - extraHeight;

      g.rect(0, y, w, extraHeight).fill({ color: tea.colorNum });
      g.ellipse(w / 2, y, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.35 });
      return;
    }

    for (let i = 0; i < layers.length; i++) {
      const layerId = layers[i] as TeaId;
      const tea = TEA_TYPES[layerId];
      const y = bottomY - (i + 1) * layerH;

      if (cup.isLayerHidden(i)) {
        g.rect(0, y, w, layerH).fill({ color: 0x3d3028 });
        g.rect(2, y + 2, w - 4, layerH - 4).fill({ color: 0x5e4b3e, alpha: 0.9 });

        const cx = w / 2;
        const cy = y + layerH / 2;
        g.circle(cx, cy, 7.5).fill({ color: 0x221a16, alpha: 0.85 });
        g.circle(cx, cy, 7.5).stroke({ width: 1, color: 0xb59e88, alpha: 0.6 });
        g.rect(cx - 1, cy - 4.5, 2, 4.5).fill({ color: 0xf3ead8 });
        g.rect(cx - 1, cy + 2, 2, 2).fill({ color: 0xf3ead8 });
      } else {
        g.rect(0, y, w, layerH).fill({ color: tea.colorNum });
        g.rect(4, y + 2, 4, layerH - 4).fill({ color: 0xffffff, alpha: 0.2 });
      }

      if (i > 0) {
        g.rect(0, bottomY - i * layerH - 1, w, 1.5).fill({ color: 0x000000, alpha: 0.14 });
        g.rect(0, bottomY - i * layerH + 0.5, w, 1).fill({ color: 0xffffff, alpha: 0.12 });
      }

      if (i === layers.length - 1) {
        g.ellipse(w / 2, y, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
  }

  /**
   * Selection/glow bounds: tall vessels use the full cell; the tasting
   * bowl hugs its own shallow body (rim → foot) so the ring reads on the
   * real silhouette, not empty cell space.
   */
  private selectionBounds(): { x: number; y: number; w: number; h: number } {
    if (this.isTastingBowl) {
      const y = this.rimLocalY - 8;
      return { x: -7, y, w: this.width + 14, h: this.height + 10 - y };
    }
    return { x: -6, y: -2, w: this.width + 12, h: this.height + 8 };
  }

  setSelection(selected: boolean) {
    this.isLifted = selected;
    this.targetLift = selected ? -24 : 0;

    this.glowGraphics.clear();
    // A selected guest cup keeps its completion glow underneath the ring.
    if (this.isSinkOnly && this.lastCup) this.refreshSinkGlow(this.lastCup);
    if (selected) {
      const b = this.selectionBounds();
      this.glowGraphics
        .roundRect(b.x, b.y, b.w, b.h, this.cornerRadius + 4)
        .fill({ color: 0xf5deb3, alpha: 0.18 });
      this.glowGraphics
        .roundRect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, this.cornerRadius + 2)
        .stroke({ width: 2, color: 0xffe4b5, alpha: 0.65 });
    }
  }

  triggerShake() {
    this.shakeTime = 0.32;
  }

  update(delta: number) {
    this.currentLift += (this.targetLift - this.currentLift) * Math.min(1, delta * 14);
    this.container.x += (this.targetX - this.container.x) * Math.min(1, delta * 12);
    this.container.y += (this.targetY - this.container.y) * Math.min(1, delta * 12);
    this.cupBodyContainer.rotation +=
      (this.targetRotation - this.cupBodyContainer.rotation) * Math.min(1, delta * 12);

    let shakeOffset = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= delta;
      shakeOffset = Math.sin(this.shakeTime * 45) * 6 * (this.shakeTime / 0.32);
    }

    this.cupBodyContainer.y = 10 + this.currentLift;
    this.cupBodyContainer.x = this.width / 2 + shakeOffset;

    const liftRatio = Math.max(0, -this.currentLift / 24);
    const scaleFactor = 1 - liftRatio * 0.25;
    this.shadowGraphics.scale.set(scaleFactor, scaleFactor);
    this.shadowGraphics.alpha = 1 - liftRatio * 0.45;
  }

  /** Detach listeners and free GPU resources for this cup view. */
  destroy() {
    try {
      this.container.removeAllListeners();
    } catch {
      // ignore
    }
    try {
      this.container.destroy({ children: true });
    } catch {
      // ignore — parent teardown may already own it
    }
  }
}

export class TeaSortView {
  app: Application;
  containerEl: HTMLElement;
  logic: TeaSortLogic;
  callbacks: ViewCallbacks;
  /** Level number currently bound to this view (win-callback context). */
  boundLevel = 1;

  rootContainer = new Container();
  backgroundContainer = new Container();
  tableGraphics = new Graphics();
  cupsContainer = new Container();
  streamGraphics = new Graphics();
  particlesGraphics = new Graphics();

  cupViews: CupView[] = [];
  selectedCupIndex: number | null = null;
  isAnimating = false;

  /**
   * Catch-one tool intent (Gauntlet 6 §37, presentation-only): never
   * mirrors `logic.strainerState`, never mutates logic by itself. `place`
   * / `release` arm the NEXT cup tap; tea source selection always exits.
   */
  toolMode: StrainerToolMode = 'off';

  /**
   * Strainer stand workspace (Gauntlet 6 §33/§47): reserved bottom-center
   * tool area, NOT a vessel row. Brass mesh basket + thin handle +
   * ceramic/wood rest, drawn procedurally (no emoji/text). Hit target
   * >=44px via a wide hitArea (teapot/guest-cup precedent). Three states
   * derive ONLY from `logic.strainerState`: empty-on-stand, empty-attached
   * (marker over host rim), loaded-on-stand (heldTea drop in mesh).
   */
  strainerStandContainer = new Container();
  strainerStandGlow = new Graphics();
  strainerStandGraphics = new Graphics();
  private strainerStandShake = 0;
  private strainerStandHomeX = 0;
  private strainerStandHomeY = 0;
  strainerTransitGraphics = new Graphics();

  transitGraphics = new Graphics();
  /**
   * Active lemon pour-arc transit (Gauntlet 5 §66): exactly one flying
   * slice, drawn by the existing ticker loop (no second ticker).
   * Stage-space quadratic arc, synchronized with the pour duration.
   */
  private lemonTransit: {
    ingredient: FloatingIngredientId;
    fromX: number;
    fromY: number;
    ctrlX: number;
    ctrlY: number;
    toX: number;
    toY: number;
    startMs: number;
    durMs: number;
  } | null = null;

  /** Melt-flourish layer (Gauntlet 9 §101, existing ticker only). */
  iceTransitGraphics = new Graphics();
  /**
   * Active ice-melt flourish (Gauntlet 9 §101–105): the static slab is
   * already gone from logic (post-move ice null), so this transit layer
   * draws the cracking/fading slab at the destination surface for
   * ICE_MELT_MS under the EXISTING ticker (no second ticker). Reads ONLY
   * the `iceMelted` transition metadata — never a view-owned ice index.
   * Exactly one visual ice representation at any time (§105).
   */
  private iceMelt: {
    x: number;
    y: number;
    startMs: number;
    durMs: number;
  } | null = null;

  /** In-flight honey drop layer (Gauntlet 7 §82, existing ticker only). */
  honeyTransitGraphics = new Graphics();
  /**
   * Active honey transit (Gauntlet 7 §82): exactly ONE amber drop, drawn
   * by the EXISTING ticker loop (no second ticker). Two short legs share
   * this slot: arc (tilted source bottom → dest rim) then sink (rim →
   * shared bottom anchor). Stage-space; straight sink uses a midpoint
   * ctrl (no lift), arc uses a lifted ctrl. Reads ONLY logic cups'
   * `sinkingIngredient` + `sinkingIngredientMoved` metadata — never a
   * view-owned honey index/boolean.
   */
  private honeyTransit: {
    fromX: number;
    fromY: number;
    ctrlX: number;
    ctrlY: number;
    toX: number;
    toY: number;
    startMs: number;
    durMs: number;
  } | null = null;

  /** Removal-flourish layer (Gauntlet 11, existing ticker only). */
  cinnamonTransitGraphics = new Graphics();
  /** Bloom-flourish layer (Gauntlet 12, existing ticker only). */
  teaBloomTransitGraphics = new Graphics();
  /**
   * Active tea-bloom flourish (Gauntlet 12): the static bud is already gone
   * from logic (post-move bud null), so this transit layer draws the
   * opening flower at the emptied source bottom for TEA_BLOOM_MS under the
   * EXISTING ticker (no second ticker). Reads ONLY the `teaBudBloomed`
   * transition metadata — never a view-owned bud index. Exactly one visual
   * bud representation at any time (static suppression).
   */
  private teaBloom: {
    x: number;
    y: number;
    startMs: number;
    durMs: number;
  } | null = null;
  /**
   * Active cinnamon removal flourish (Gauntlet 11): the static stick is
   * already gone from logic (post-move obstacle null), so this transit
   * layer draws the lifting/tilting stick at the source for
   * CINNAMON_REMOVAL_MS under the EXISTING ticker (no second ticker).
   * Reads ONLY the `capacityObstacleRemoved` transition metadata — never
   * a view-owned wasCinnamon flag, never dynamic capacity. Exactly one
   * visual stick representation at any time (static suppression).
   */
  private cinnamonRemoval: {
    x: number;
    y: number;
    startMs: number;
    durMs: number;
  } | null = null;

  /**
   * Active strainer transit (Gauntlet 6 §40-41): exactly one flying tool
   * or caught drop, drawn by the EXISTING ticker loop (no second ticker).
   * Stage-space quadratic arc. `kind` selects the payload: `tool` flies a
   * mini brass mesh (place / relocate), `drop` flies a heldTea-color bead
   * (release). Strained-pour auto-return is part of the pour, never a
   * separate transit — it reuses the pour timing + a stand sparkle.
   */
  private strainerTransit: {
    kind: 'tool' | 'drop';
    heldColorNum: number | null;
    fromX: number;
    fromY: number;
    ctrlX: number;
    ctrlY: number;
    toX: number;
    toY: number;
    startMs: number;
    durMs: number;
  } | null = null;

  particles: Particle[] = [];
  ambientSteamTimer = 0;

  private isDestroyed = false;
  private isInitialized = false;
  private isInitializing = false;
  private interactivityBound = false;
  private resizeObserver: ResizeObserver | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private lastInvalidTargetIndex: number | null = null;

  currentSkin: CupSkinId = 'glass';

  setSkin(skinId: CupSkinId) {
    this.currentSkin = skinId;
    this.cupViews.forEach((v) => v.setSkin(skinId));
  }

  public get canvas(): HTMLCanvasElement | null {
    if (this.canvasEl) return this.canvasEl;
    try {
      const renderer = (this.app as unknown as { renderer?: { canvas?: unknown } }).renderer;
      if (renderer && renderer.canvas instanceof HTMLCanvasElement) {
        return renderer.canvas;
      }
    } catch {
      // ignore
    }
    return null;
  }

  constructor(containerEl: HTMLElement, logic: TeaSortLogic, callbacks: ViewCallbacks = {}) {
    this.containerEl = containerEl;
    this.logic = logic;
    this.callbacks = callbacks;
    this.app = new Application();
    ensureLegacyResizeGuard(this.app);
  }

  async init() {
    if (this.isDestroyed || this.isInitialized || this.isInitializing) return;
    this.isInitializing = true;

    try {
      ensureLegacyResizeGuard(this.app);

      await this.app.init({
        preference: 'webgl',
        resizeTo: this.containerEl,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        backgroundAlpha: 0,
        antialias: true,
      });
    } catch (err) {
      console.error('Pixi app.init error:', err);
    } finally {
      this.isInitializing = false;
    }

    if (this.isDestroyed) {
      this.safeDestroyApp();
      return;
    }

    if (!this.app.renderer) {
      console.warn('Pixi app.renderer is not available after init');
      return;
    }

    this.isInitialized = true;

    try {
      const canvas = (this.app as unknown as { canvas?: unknown }).canvas;
      if (canvas instanceof HTMLCanvasElement) {
        this.canvasEl = canvas;
      } else {
        const rendererCanvas = (this.app.renderer as unknown as { canvas?: unknown }).canvas;
        if (rendererCanvas instanceof HTMLCanvasElement) this.canvasEl = rendererCanvas;
      }
    } catch (err) {
      console.warn('Error accessing canvas element:', err);
    }

    if (this.canvasEl) {
      this.canvasEl.style.position = 'absolute';
      this.canvasEl.style.top = '0';
      this.canvasEl.style.left = '0';
      this.canvasEl.style.width = '100%';
      this.canvasEl.style.height = '100%';
      this.canvasEl.style.zIndex = '10';
      this.canvasEl.style.touchAction = 'none';
      this.canvasEl.style.cursor = 'pointer';

      if (!this.containerEl.contains(this.canvasEl)) {
        this.containerEl.appendChild(this.canvasEl);
      }
    }

    this.tableGraphics.eventMode = 'none';
    this.streamGraphics.eventMode = 'none';
    this.particlesGraphics.eventMode = 'none';
    this.backgroundContainer.eventMode = 'none';

    this.app.stage.addChild(this.rootContainer);
    this.rootContainer.addChild(this.backgroundContainer);
    this.rootContainer.addChild(this.tableGraphics);
    this.rootContainer.addChild(this.cupsContainer);
    this.rootContainer.addChild(this.streamGraphics);
    this.transitGraphics.eventMode = 'none';
    this.rootContainer.addChild(this.transitGraphics);
    this.rootContainer.addChild(this.particlesGraphics);
    // Strainer stand (Gauntlet 6 §33): reserved bottom-center tool area.
    // Added once per view lifetime (never per level), above cups so the
    // brass tool reads clearly, below transit/particles so flights sparkle
    // over it. Single interactive tool — wide >=44px hitArea.
    this.strainerStandGlow.eventMode = 'none';
    this.strainerStandContainer.addChild(this.strainerStandGlow);
    this.strainerStandContainer.addChild(this.strainerStandGraphics);
    this.strainerStandContainer.eventMode = 'static';
    this.strainerStandContainer.cursor = 'pointer';
    // 84x64 touch target (>=44px both axes, teapot/guest-cup precedent).
    this.strainerStandContainer.hitArea = new Rectangle(-14, -18, 96, 68);
    this.strainerStandContainer.on('pointerdown', (e) => {
      e.stopPropagation();
      this.handleStrainerStandTap();
    });
    this.rootContainer.addChild(this.strainerStandContainer);
    this.strainerTransitGraphics.eventMode = 'none';
    this.rootContainer.addChild(this.strainerTransitGraphics);
    // Honey drop flight (Gauntlet 7 §82): dedicated layer on the EXISTING
    // ticker (no second ticker), above cups so the amber bead reads, below
    // particles so landing sparkles read over it. Separate from the lemon
    // transit layer so a pour moving both never erases the other.
    this.honeyTransitGraphics.eventMode = 'none';
    this.rootContainer.addChild(this.honeyTransitGraphics);
    // Ice-melt flourish (Gauntlet 9 §101–105): dedicated layer on the
    // EXISTING ticker (no second ticker), above cups so the cracking slab
    // reads, below particles so melt sparkles read over it.
    this.iceTransitGraphics.eventMode = 'none';
    this.rootContainer.addChild(this.iceTransitGraphics);
    // Cinnamon removal flourish (Gauntlet 11): dedicated layer on the
    // EXISTING ticker (no second ticker), above cups so the lifting stick
    // reads, below particles so warm sparkles read over it. Separate from
    // the ice/honey/lemon layers so a joint visual never erases another.
    this.cinnamonTransitGraphics.eventMode = 'none';
    this.rootContainer.addChild(this.cinnamonTransitGraphics);
    // Tea-bloom flourish (Gauntlet 12): dedicated layer on the EXISTING
    // ticker (no second ticker), above cups so the opening flower reads,
    // below particles so bloom sparkles read over it. Separate from the
    // cinnamon/ice/honey/lemon layers so a joint visual never erases
    // another.
    this.teaBloomTransitGraphics.eventMode = 'none';
    this.rootContainer.addChild(this.teaBloomTransitGraphics);

    this.setupInteractivity();
    this.setupCups();
    this.layoutCups();
    this.renderAllCups();

    // Exactly one ticker for the lifetime of the view.
    this.app.ticker.add((ticker) => {
      if (this.isDestroyed) return;
      this.update(ticker.deltaTime / 60);
    });

    // Exactly one ResizeObserver; public resize() + local relayout.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDestroyed || !this.isInitialized || !this.app.renderer) return;
      try {
        ensureLegacyResizeGuard(this.app);
        this.app.resize();
        this.layoutCups();
      } catch (err) {
        console.warn('Safe resize error ignored:', err);
      }
    });
    this.resizeObserver.observe(this.containerEl);

    telegram.init();
  }

  private setupCups() {
    // Tear down previous cup views first: otherwise every restart/next-level
    // would orphan pointerdown handlers and GPU children.
    for (const old of this.cupViews) {
      try {
        this.cupsContainer.removeChild(old.container);
      } catch {
        // ignore
      }
      old.destroy();
    }
    this.cupsContainer.removeChildren();
    this.cupViews = [];

    this.logic.cups.forEach((cup, index) => {
      const view = new CupView(index, cup.constraint);
      view.setSkin(this.currentSkin);

      view.container.eventMode = 'static';
      view.container.cursor = 'pointer';
      // Teapot spout/handle and guest-cup saucer/handle overflow slightly:
      // keep the touch target at least as usable as a normal vessel with
      // a wider padded hit area (saucer extends below the body too). The
      // tasting bowl keeps the full-cell interaction target even though
      // its visible ceramic is smaller — never shrink to the saucer. The
      // slim thermos keeps the same padded target (>=44px both axes).
      const padX =
        view.isTeapot ? 22 : view.isSinkOnly || view.isTastingBowl || view.isThermos ? 20 : 16;
      const padBottom = view.isSinkOnly ? 40 : 32;
      view.container.hitArea = new Rectangle(-padX, -16, view.width + padX * 2, view.height + padBottom);

      view.container.on('pointerdown', (e) => {
        e.stopPropagation();
        this.handleCupClick(view.index);
      });

      this.cupViews.push(view);
      this.cupsContainer.addChild(view.container);
    });
  }

  layoutCups() {
    let width = this.app.screen.width;
    let height = this.app.screen.height;

    if (width === 0 || height === 0) {
      width = this.containerEl.clientWidth || window.innerWidth;
      height = this.containerEl.clientHeight || window.innerHeight;
    }
    if (width === 0 || height === 0) return;

    const count = this.cupViews.length;
    // Teapot vessels are slightly wider (72 vs 64): lay out on the max
    // cell width and center narrower cups so rows stay clean on 360–430px.
    // Thermos vessels are taller (THERMOS_BODY_H vs 142): lay out on the max
    // cell height so the taller body never collides rows/stand; scale and
    // vertical gaps derive from that max, keeping the mobile 3+3 fit.
    const baseCupW = Math.max(64, ...this.cupViews.map((v) => v.width));
    const baseCupH = Math.max(142, ...this.cupViews.map((v) => v.height));

    let rows: number[][] = [];
    const minPaddingX = 24;
    const neededWidth1Row = count * (baseCupW + minPaddingX);

    if (width >= neededWidth1Row && width > height * 1.2) {
      rows = [Array.from({ length: count }, (_, i) => i)];
    } else {
      const topCount = Math.ceil(count / 2);
      const topRow = Array.from({ length: topCount }, (_, i) => i);
      const bottomRow = Array.from({ length: count - topCount }, (_, i) => topCount + i);
      rows = [topRow, bottomRow];
    }

    const rowCount = rows.length;
    const maxCols = Math.max(...rows.map((r) => r.length));

    const widthMargin = 28;
    const idealColWidth = 76;
    const scaleByWidth = (width - widthMargin) / (maxCols * idealColWidth + 16);
    const scaleByHeight = (height - 84) / (rowCount * baseCupH + (rowCount - 1) * 44 + 24);

    const cupScale = Math.max(0.72, Math.min(1.08, Math.min(scaleByWidth, scaleByHeight)));

    this.cupViews.forEach((v) => v.setScale(cupScale));

    const scaledCupW = baseCupW * cupScale;
    const scaledCupH = baseCupH * cupScale;
    const verticalGap = Math.max(
      26 * cupScale,
      Math.min(52 * cupScale, (height - rowCount * scaledCupH - 90) / Math.max(1, rowCount)),
    );

    const totalContentH = rowCount * scaledCupH + (rowCount - 1) * verticalGap;
    const minHeadroom = Math.max(68 * cupScale, 56);
    const startY = Math.max(minHeadroom, (height - totalContentH) / 2 + 10);

    rows.forEach((rowIndices, rowIndex) => {
      const inRowCount = rowIndices.length;
      const rowY = startY + rowIndex * (scaledCupH + verticalGap);

      const availableW = width - 24;
      const maxSpacing = 94 * cupScale;
      const minSpacing = 62 * cupScale;
      const calculatedSpacing =
        inRowCount > 1 ? (availableW - scaledCupW - 16 * cupScale) / (inRowCount - 1) : maxSpacing;
      const spacing = Math.min(maxSpacing, Math.max(minSpacing, calculatedSpacing));

      const rowWidth = (inRowCount - 1) * spacing + scaledCupW;
      const startX = (width - rowWidth) / 2;

      rowIndices.forEach((cupIdx, colIndex) => {
        const view = this.cupViews[cupIdx];
        if (view) {
          // Center narrower vessels inside the uniform cell so the teapot
          // never overlaps neighbors or clips its spout/handle.
          const cellX = startX + colIndex * spacing;
          const x = cellX + (scaledCupW - view.visualWidth) / 2;
          view.setHomePosition(x, rowY);
        }
      });
    });

    this.drawTableBackground(width, height);
    this.layoutStrainerStand(width, height);
  }

  private drawTableBackground(w: number, h: number) {
    this.tableGraphics.clear();

    const firstCupY = this.cupViews.length > 0 ? (this.cupViews[0]?.homeY ?? h * 0.35) : h * 0.35;
    const tableTopY = Math.max(160, firstCupY - 32);

    this.tableGraphics.rect(0, tableTopY, w, 18).fill({ color: 0x0a0604, alpha: 0.65 });

    this.tableGraphics.rect(0, tableTopY, w, 8).fill({ color: 0x825438, alpha: 0.95 });
    this.tableGraphics.rect(0, tableTopY + 1, w, 2.5).fill({ color: 0xd99868, alpha: 0.9 });
    this.tableGraphics.rect(0, tableTopY + 8, w, 4).fill({ color: 0x2e1b12, alpha: 0.85 });

    const plankH = 70;
    const tableH = h - tableTopY;
    const numPlanks = Math.ceil(tableH / plankH) + 1;

    for (let i = 0; i < numPlanks; i++) {
      const py = tableTopY + 12 + i * plankH;
      const shade = i % 2 === 0 ? 0x4d3223 : 0x583a29;
      this.tableGraphics.rect(0, py, w, plankH).fill({ color: shade, alpha: 0.88 });

      this.tableGraphics.rect(0, py + plankH - 1.5, w, 1.5).fill({ color: 0x24160f, alpha: 0.85 });
      this.tableGraphics.rect(0, py, w, 1.2).fill({ color: 0x80553d, alpha: 0.5 });
    }

    this.tableGraphics
      .ellipse(w / 2, tableTopY + tableH * 0.45, w * 0.75, tableH * 0.6)
      .fill({ color: 0xffb86c, alpha: 0.14 });

    this.cupViews.forEach((view) => {
      const cx = view.homeX + view.visualWidth / 2 - 2;
      const cy = view.homeY + view.visualHeight - 4;
      this.tableGraphics
        .ellipse(cx, cy, view.visualWidth * 0.42, 6 * view.scale)
        .fill({ color: 0x080403, alpha: 0.5 });
    });
  }

  // -------------------------------------------------------------------------
  // Catch-one strainer stand + tool-mode flow (Gauntlet 6 §32-47).
  // States derive ONLY from `logic.strainerState`; `toolMode` is UI intent.
  // Single ticker only (drawn in update()), no second ticker.
  // -------------------------------------------------------------------------

  /**
   * Reserved stand home (bottom-center/lower side): board layout untouched
   * — cups keep their exact positions, the stand lives in the free table
   * margin below the lowest row. Falls back to lower-right when the canvas
   * is too short to keep >=12px clearance (360x800 reasoning: two rows
   * centered leave ~140px bottom margin, so bottom-center never overlaps;
   * narrow/short webviews use the side pocket instead of covering tea).
   */
  private layoutStrainerStand(width: number, height: number): void {
    if (!this.strainerStandContainer) return;
    const standW = 68;
    const standH = 44;
    let sx = width / 2 - standW / 2 + 6;
    let sy = height - standH - 14;
    // Clearance vs the lowest cup bottom (visual, scaled).
    let lowestBottom = -Infinity;
    for (const v of this.cupViews) {
      lowestBottom = Math.max(lowestBottom, v.homeY + v.visualHeight);
    }
    if (Number.isFinite(lowestBottom) && sy < lowestBottom + 12) {
      // Lower-side pocket: right edge, same bottom band, never a new row.
      sx = Math.max(8, width - standW - 12);
      sy = Math.max(lowestBottom + 12, height - standH - 14);
      // If even the pocket overlaps (tiny canvas), tuck just below cups.
      if (sy < lowestBottom + 8) sy = lowestBottom + 8;
    }
    this.strainerStandHomeX = sx;
    this.strainerStandHomeY = sy;
    this.strainerStandContainer.position.set(sx, sy);
    this.refreshStrainerVisuals();
  }

  /** Stand basket center in stage space (transit start/end anchor). */
  private strainerStandCenter(): { x: number; y: number } {
    const p = this.strainerStandContainer.position;
    // Basket sits ~18px above the rest base inside the 68x44 box.
    return { x: p.x + 34, y: p.y + 18 };
  }

  /**
   * Redraw stand + attached markers from the authoritative
   * `logic.strainerState` (no parallel attached/held in View).
   * - present=false → stand hidden, no markers.
   * - attached!=null, held==null → vacant rest + mini mesh over host rim.
   * - attached==null, held==null → empty mesh on stand.
   * - attached==null, held!=null → loaded mesh on stand (heldTea drop).
   */
  refreshStrainerVisuals(): void {
    const s = this.logic.strainerState;
    const glow = this.strainerStandGlow;
    const g = this.strainerStandGraphics;
    glow.clear();
    g.clear();
    if (!s.present) {
      this.strainerStandContainer.visible = false;
      for (const v of this.cupViews) v.renderAttachedStrainer(false);
      return;
    }
    this.strainerStandContainer.visible = true;
    const onStand = s.attachedCupIndex === null;
    const heldNum = s.heldTea !== null ? TEA_TYPES[s.heldTea].colorNum : null;

    // Subtle tool-mode glow (selection language, never a tea lift).
    if (this.toolMode !== 'off') {
      const active =
        (this.toolMode === 'place' && heldNum === null) ||
        (this.toolMode === 'release' && heldNum !== null);
      if (active) {
        glow.roundRect(-12, -16, 92, 62, 14).fill({ color: 0xf5deb3, alpha: 0.16 });
        glow.roundRect(-9, -13, 86, 56, 12).stroke({ width: 2, color: 0xffe4b5, alpha: 0.55 });
      }
    }

    if (onStand) {
      // Ceramic/wood rest.
      g.ellipse(34, 38, 26, 7).fill({ color: 0x6b4a2f, alpha: 1 });
      g.ellipse(34, 38, 26, 7).stroke({ width: 1.6, color: 0x3d271a, alpha: 0.9 });
      g.ellipse(34, 37, 18, 4.5).fill({ color: 0x8a623f, alpha: 1 });
      g.ellipse(34, 37, 18, 4.5).stroke({ width: 1, color: 0xe8c878, alpha: 0.5 });
      // Brass basket + thin handle (tool, never a cup).
      drawStrainerMesh(g, 34, 18, STRAINER_STAND_R, heldNum);
      g.beginPath();
      g.moveTo(34 + STRAINER_STAND_R - 1, 16);
      g.lineTo(34 + STRAINER_STAND_R + 16, 10);
      g.stroke({ width: 3, color: 0xc9962e, alpha: 1 });
      g.beginPath();
      g.moveTo(34 + STRAINER_STAND_R - 1, 17.5);
      g.lineTo(34 + STRAINER_STAND_R + 16, 11.5);
      g.stroke({ width: 1, color: 0xe8c878, alpha: 0.7 });
    } else {
      // Vacant rest while the empty tool rides its host rim.
      g.ellipse(34, 38, 26, 7).fill({ color: 0x6b4a2f, alpha: 0.85 });
      g.ellipse(34, 38, 26, 7).stroke({ width: 1.6, color: 0x3d271a, alpha: 0.8 });
      g.ellipse(34, 37, 18, 4.5).fill({ color: 0x4a3423, alpha: 0.9 });
    }

    // Attached marker: exactly one host when empty-attached, else none.
    // Loaded tools are always on stand (invariant); malformed states show none.
    for (const v of this.cupViews) {
      const attached =
        s.present && s.heldTea === null && s.attachedCupIndex === v.index;
      v.renderAttachedStrainer(attached);
    }
  }

  /**
   * Stand tap (public for tests): empty (or vacant-while-attached) toggles
   * `place`, loaded toggles `release`. Clears tea selection, never mutates
   * logic, guarded by `isAnimating`. Second tap toggles off.
   */
  handleStrainerStandTap(): void {
    if (this.isAnimating || this.isDestroyed) return;
    const s = this.logic.strainerState;
    if (!s.present) return;
    const next = strainerToolModeForStandTap(s.heldTea, this.toolMode);
    if (next === 'off') {
      // Toggling off (second tap): silent-ish tactile exit, no selection.
      this.toolMode = 'off';
      audioSynth.playSelect();
    } else {
      // Entering a tool mode clears tea selection (mutual exclusivity).
      // Never mutates logic — arming only.
      this.deselectCurrent(false);
      this.callbacks.onSelectCup?.(null);
      this.toolMode = next;
      audioSynth.playSelect();
      telegram.hapticSelection();
    }
    this.refreshStrainerVisuals();
  }

  /** Back-compat alias for alternate test import names. */
  onStrainerStandTap(): void {
    this.handleStrainerStandTap();
  }

  private clearStrainerTransit(): void {
    this.strainerTransit = null;
    try {
      this.strainerTransitGraphics.clear();
    } catch {
      // ignore
    }
  }

  private startStrainerTransit(
    kind: 'tool' | 'drop',
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    durMs: number,
    heldColorNum: number | null = null,
  ): void {
    this.strainerTransit = {
      kind,
      heldColorNum,
      fromX,
      fromY,
      ctrlX: (fromX + toX) / 2,
      ctrlY: Math.min(fromY, toY) - 38,
      toX,
      toY,
      startMs: performance.now(),
      durMs: Math.max(1, durMs),
    };
  }

  /** Draw the in-flight tool / drop along its arc (existing ticker). */
  private drawStrainerTransit(): void {
    const t = this.strainerTransit;
    if (!t) return;
    const progress = Math.min(1, Math.max(0, (performance.now() - t.startMs) / t.durMs));
    const u = 1 - progress;
    const x = u * u * t.fromX + 2 * u * progress * t.ctrlX + progress * progress * t.toX;
    const y = u * u * t.fromY + 2 * u * progress * t.ctrlY + progress * progress * t.toY;
    this.strainerTransitGraphics.clear();
    if (t.kind === 'tool') {
      drawStrainerMesh(this.strainerTransitGraphics, x, y, STRAINER_ATTACHED_R, t.heldColorNum);
    } else {
      const c = t.heldColorNum ?? 0xffffff;
      this.strainerTransitGraphics.circle(x, y, 5).fill({ color: c, alpha: 1 });
      this.strainerTransitGraphics.circle(x - 1.2, y - 1.2, 1.4).fill({ color: 0xffffff, alpha: 0.6 });
      this.strainerTransitGraphics.circle(x, y, 7.5).stroke({ width: 1.2, color: 0xc9962e, alpha: 0.9 });
    }
  }

  /**
   * Placement transit (free): short arc stand/current-host→new-host,
   * exactly ONE `onMoveComplete`, no win/deadlock check (tea unchanged).
   * Mutates AFTER the flight so visuals stay pre during travel and land
   * post. Relocation flights start at the CURRENT host rim (G6.1), never
   * at the stand, and the old host marker stays hidden until landing so
   * exactly one mesh is visible mid-flight.
   */
  private async animatePlaceStrainer(toIdx: number): Promise<void> {
    const targetView = this.cupViews[toIdx];
    if (!targetView) {
      this.isAnimating = false;
      return;
    }
    this.isAnimating = true;
    const plan = strainerPlaceTransitPlan(this.logic.strainerState.attachedCupIndex);
    let from = this.strainerStandCenter();
    if (!plan.fromStand) {
      const oldView = this.cupViews[plan.suppressCupIndex as number];
      if (oldView) {
        from = oldView.strainerStagePoint();
        oldView.renderAttachedStrainer(false);
      } else {
        // Stale host index: fail closed to stand anchor + pre visuals.
        this.refreshStrainerVisuals();
      }
    } else {
      this.refreshStrainerVisuals();
    }
    const to = targetView.strainerStagePoint();
    this.startStrainerTransit('tool', from.x, from.y, to.x, to.y, 300, null);
    audioSynth.playSelect();
    telegram.hapticSelection();
    await this.wait(300);
    this.clearStrainerTransit();
    const applied = this.logic.placeStrainer(toIdx);
    if (!applied) {
      // Lost race (should not happen: pre-checked) — fail closed.
      this.isAnimating = false;
      this.refreshStrainerVisuals();
      return;
    }
    this.toolMode = 'off';
    this.renderAllCups();
    this.refreshStrainerVisuals();
    audioSynth.playSelect();
    telegram.hapticSelection();
    await this.wait(60);
    this.isAnimating = false;
    this.callbacks.onMoveComplete?.();
  }

  /**
   * Release transit (+1): short arc stand→dest bead, held clears on land,
   * exactly ONE `onMoveComplete`, then win/deadlock checks (tea changed).
   */
  private async animateReleaseStrainer(toIdx: number, heldColorNum: number): Promise<void> {
    const targetView = this.cupViews[toIdx];
    if (!targetView) {
      this.isAnimating = false;
      return;
    }
    this.isAnimating = true;
    const from = this.strainerStandCenter();
    const to = targetView.strainerStagePoint();
    this.refreshStrainerVisuals();
    this.startStrainerTransit('drop', from.x, from.y, to.x, to.y, 320, heldColorNum);
    audioSynth.playPour(0.32);
    telegram.hapticPour();
    await this.wait(320);
    this.clearStrainerTransit();
    const applied = this.logic.releaseStrainer(toIdx);
    if (!applied) {
      this.isAnimating = false;
      this.refreshStrainerVisuals();
      return;
    }
    this.toolMode = 'off';
    this.renderAllCups();
    this.refreshStrainerVisuals();
    this.triggerRevealSparkles(to.x, to.y);
    await this.wait(80);
    this.isAnimating = false;
    this.callbacks.onMoveComplete?.();
    if (this.logic.isWon()) {
      audioSynth.playWin();
      telegram.hapticSuccess();
      this.triggerWinConfetti();
      this.callbacks.onWin?.(this.boundLevel);
    } else if (this.logic.isDeadlocked()) {
      audioSynth.playInvalid();
      telegram.hapticError();
      this.callbacks.onDeadlock?.();
    }
  }

  private setupInteractivity() {
    // Bound exactly once per view lifetime (init only — never on resetLevel).
    if (this.interactivityBound) return;
    this.interactivityBound = true;

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e) => {
      if (this.isAnimating) return;

      const clickPos = e.global;
      let clickedCupIndex: number | null = null;

      for (let i = 0; i < this.cupViews.length; i++) {
        const view = this.cupViews[i] as CupView;
        const x = view.container.x;
        const y = view.container.y;
        // Teapot spout/handle, guest-cup saucer/handle, the tasting bowl and
        // the slim thermos extend beyond (or sit small inside) the body:
        // widen the touch padding so special vessels stay at least as
        // tappable (>=44px target for the narrower thermos too).
        const touchPadding =
          view.isTeapot ? 26 : view.isSinkOnly || view.isTastingBowl || view.isThermos ? 24 : 20;

        if (
          clickPos.x >= x - touchPadding &&
          clickPos.x <= x + view.visualWidth + touchPadding &&
          clickPos.y >= y - touchPadding &&
          clickPos.y <= y + view.visualHeight + touchPadding
        ) {
          clickedCupIndex = i;
          break;
        }
      }

      if (clickedCupIndex !== null) {
        this.handleCupClick(clickedCupIndex);
      } else {
        // Background tap clears tea selection AND armed tool intent.
        let clearedTool = false;
        if (this.toolMode !== 'off') {
          this.toolMode = 'off';
          clearedTool = true;
        }
        if (this.selectedCupIndex !== null) {
          this.deselectCurrent();
        } else if (clearedTool) {
          this.refreshStrainerVisuals();
        }
      }
    });
  }

  private handleCupClick(clickedIdx: number) {
    if (this.isAnimating || this.isDestroyed) return;
    const clickedCup = this.logic.cups[clickedIdx];
    const clickedView = this.cupViews[clickedIdx];
    if (!clickedCup || !clickedView) return;

    // Tool-mode taps (Gauntlet 6 §37): armed stand intent takes precedence
    // over tea selection. Reject keeps the mode (retry another cup);
    // success animates + fires exactly ONE onMoveComplete. Never mutates
    // on reject; never selects tea while armed.
    if (this.toolMode === 'place') {
      const code = this.logic.placeStrainerRejectCode(clickedIdx);
      if (this.logic.canPlaceStrainer(clickedIdx)) {
        this.lastInvalidTargetIndex = null;
        // Tea selection was already cleared when arming; keep it cleared.
        void this.animatePlaceStrainer(clickedIdx);
      } else {
        this.lastInvalidTargetIndex = clickedIdx;
        clickedView.triggerShake();
        this.strainerStandShake = 0.32;
        audioSynth.playInvalid();
        telegram.hapticError();
        this.callbacks.onInvalidMove?.(strainerPlaceHint(code));
        this.refreshStrainerVisuals();
      }
      return;
    }
    if (this.toolMode === 'release') {
      const s = this.logic.strainerState;
      const held = s.heldTea;
      const code = this.logic.releaseStrainerRejectCode(clickedIdx);
      if (held !== null && this.logic.canReleaseStrainer(clickedIdx)) {
        this.lastInvalidTargetIndex = null;
        void this.animateReleaseStrainer(clickedIdx, TEA_TYPES[held].colorNum);
      } else {
        this.lastInvalidTargetIndex = clickedIdx;
        clickedView.triggerShake();
        this.strainerStandShake = 0.32;
        audioSynth.playInvalid();
        telegram.hapticError();
        const destCup = this.logic.cups[clickedIdx];
        this.callbacks.onInvalidMove?.(
          strainerReleaseHint(code, destCup?.constraint ?? clickedCup.constraint),
        );
        this.refreshStrainerVisuals();
      }
      return;
    }

    if (this.selectedCupIndex === null) {
      if (clickedCup.isEmpty) {
        audioSynth.playInvalid();
        telegram.hapticError();
        clickedView.triggerShake();
        return;
      }

      // Guest cup as SOURCE (Gauntlet 3 §40): never leave it selected as
      // if a legal source existed — subtle invalid feedback + hint, no
      // state mutation. Legality itself stays in rules.ts (`canActAsSource`
      // reads the authoritative constraint; this helper duplicates nothing).
      if (!canActAsSource(clickedCup.constraint)) {
        audioSynth.playInvalid();
        telegram.hapticError();
        clickedView.triggerShake();
        this.callbacks.onInvalidMove?.(GUEST_SINK_HINT);
        return;
      }

      // Frozen cup as SOURCE (Gauntlet 9 §100): never leave it selected —
      // subtle invalid feedback + melt hint, no state mutation. Legality
      // itself stays in rules.ts (`source-frozen`); this duplicates nothing.
      if (clickedCup.ice != null) {
        audioSynth.playInvalid();
        telegram.hapticError();
        clickedView.triggerShake();
        this.callbacks.onInvalidMove?.(FROZEN_SOURCE_HINT);
        return;
      }

      this.selectedCupIndex = clickedIdx;
      clickedView.setSelection(true);
      audioSynth.playSelect();
      telegram.hapticSelection();
      // Selecting a tea source always exits tool mode (mutual exclusivity).
      if (this.toolMode !== 'off') {
        this.toolMode = 'off';
        this.refreshStrainerVisuals();
      }
      this.callbacks.onSelectCup?.(clickedIdx);
      // Gentle informational hint (not a rejection): selecting a target
      // cup that is full of the WRONG homogeneous tea tells the player
      // which tea belongs here. No state mutation, no move counted.
      if (targetCupState(clickedCup.layers, clickedCup.constraint) === 'wrong-full') {
        const want = clickedCup.targetTeaId ? TEA_TYPES[clickedCup.targetTeaId].nameRu : 'свой чай';
        this.callbacks.onInvalidMove?.(`Эта чашка ждёт «${want}»`);
      }
      return;
    }

    if (this.selectedCupIndex === clickedIdx) {
      this.deselectCurrent();
      audioSynth.playSelect();
      return;
    }

    const sourceIdx = this.selectedCupIndex;
    const sourceCup = this.logic.cups[sourceIdx];
    const sourceView = this.cupViews[sourceIdx];
    if (!sourceCup || !sourceView) {
      this.deselectCurrent();
      return;
    }

    if (sourceCup.canPourInto(clickedCup)) {
      this.lastInvalidTargetIndex = null;
      const res = this.logic.makeMove(sourceIdx, clickedIdx);
      if (res) {
        this.deselectCurrent(false);
        // Strained pour (Gauntlet 6 §39-40): logic already moved m out of
        // the source, m-1 into the dest, tool loaded on stand. Animation
        // keeps the mesh on the source at start, shows m-1 arriving +
        // catch, then returns loaded to stand (part of the pour, never a
        // second onMoveComplete).
        void this.animatePour(
          sourceIdx,
          clickedIdx,
          res.move.layer,
          res.move.count,
          res.sourceUncovered,
          res.floatingIngredientMoved ?? null,
          res.strained,
          res.caughtTea ?? null,
          res.sinkingIngredientMoved ?? null,
          res.iceMelted ?? null,
          res.capacityObstacleRemoved ?? null,
          res.teaBudBloomed ?? null,
        );
      }
    } else {
      // Strainer gate first (Gauntlet 6 §36): attached single-layer pours
      // reject with the needs-two copy, tool stays attached (no source
      // switch, no mutation). Malformed loaded+attached fails closed too.
      // Frozen gate (Gauntlet 9 §100): ice rejections report their own copy
      // with no source switch and no mutation either.
      try {
        const st = this.logic.toState();
        const code = pourRejectCodeState(
          {
            cups: st.cups,
            floatingIngredients: st.floatingIngredients,
            strainer: st.strainer,
            sinkingIngredients: st.sinkingIngredients,
            iceSlots: st.iceSlots,
          },
          sourceIdx,
          clickedIdx,
          st.cupConstraints,
        );
        if (code === 'strainer-needs-two-layers' || code === 'strainer-loaded') {
          this.lastInvalidTargetIndex = clickedIdx;
          clickedView.triggerShake();
          sourceView.triggerShake();
          audioSynth.playInvalid();
          telegram.hapticError();
          this.callbacks.onInvalidMove?.(strainedPourHint(code));
          return;
        }
        if (code === 'source-frozen' || code === 'target-frozen-needs-hot') {
          this.lastInvalidTargetIndex = clickedIdx;
          clickedView.triggerShake();
          sourceView.triggerShake();
          audioSynth.playInvalid();
          telegram.hapticError();
          this.callbacks.onInvalidMove?.(frozenPourHint(code));
          return;
        }
      } catch {
        // fall through to ordinary invalid handling
      }
      // A frozen cup can never become a source via second-tap switching —
      // refuse like the guest cup (selection stays where it was).
      if (clickedCup.ice != null) {
        this.lastInvalidTargetIndex = null;
        clickedView.triggerShake();
        audioSynth.playInvalid();
        telegram.hapticError();
        this.callbacks.onInvalidMove?.(FROZEN_NEEDS_HOT_HINT);
        return;
      }
      const decision = decideSecondTap(
        clickedCup.constraint,
        clickedCup.isEmpty,
        this.lastInvalidTargetIndex === clickedIdx,
      );
      if (decision === 'switch-source') {
        this.lastInvalidTargetIndex = null;
        sourceView.setSelection(false);
        this.selectedCupIndex = clickedIdx;
        clickedView.setSelection(true);
        audioSynth.playSelect();
        telegram.hapticSelection();
        this.callbacks.onSelectCup?.(clickedIdx);
        return;
      }
      if (decision === 'reject-sink-source') {
        // Gauntlet 3.1: a filled guest cup tapped twice still refuses
        // source selection — invalid feedback + hint, no state mutation.
        this.lastInvalidTargetIndex = null;
        clickedView.triggerShake();
        audioSynth.playInvalid();
        telegram.hapticError();
        this.callbacks.onInvalidMove?.(GUEST_SINK_HINT);
        return;
      }

      this.lastInvalidTargetIndex = clickedIdx;
      const reason = this.getInvalidPourReason(sourceCup, clickedCup);
      clickedView.triggerShake();
      audioSynth.playInvalid();
      telegram.hapticError();
      this.callbacks.onInvalidMove?.(reason);
    }
  }

  private getInvalidPourReason(sourceCup: Cup, targetCup: Cup): string {
    // Guest cup can never pour out (defensive: selection UX already
    // refuses to select it as a source) — Undo is the way back.
    if (sourceCup.isSinkOnly) {
      return GUEST_SINK_HINT;
    }
    // Frozen cup can never pour out (defensive: selection UX already
    // refuses to select it) — melt it with sea_buckthorn first.
    if (sourceCup.ice != null) {
      return FROZEN_SOURCE_HINT;
    }
    // Frozen destination only accepts the melt tea (defensive: the tap
    // handler already maps the authoritative rejection; this keeps the
    // fallback reason accurate too).
    if (targetCup.ice != null) {
      return FROZEN_NEEDS_HOT_HINT;
    }
    // Source-only teapot can never receive — no state mutation, no
    // move-count increment; the caller already plays invalid haptics/audio.
    if (targetCup.isSourceOnly) {
      return 'В чайник нельзя наливать — он только раздаёт настой';
    }
    if (targetCup.isFull) {
      return fullVesselHint(targetCup.constraint);
    }
    if (sourceCup.isComplete && targetCup.isEmpty) {
      return 'Этот купаж уже полностью собран!';
    }
    if (targetCup.topLayer !== null && sourceCup.topLayer !== targetCup.topLayer) {
      const sourceName = sourceCup.topLayer ? TEA_TYPES[sourceCup.topLayer].nameRu : 'чай';
      const targetName = targetCup.topLayer ? TEA_TYPES[targetCup.topLayer].nameRu : 'чай';
      return `Цвета не совпадают: «${sourceName}» нельзя налить на «${targetName}». Только на такой же чай или в пустой стакан!`;
    }
    return 'Нельзя перелить в этот стакан.';
  }

  deselectCurrent(notify = true) {
    this.lastInvalidTargetIndex = null;
    if (this.selectedCupIndex !== null) {
      const prevView = this.cupViews[this.selectedCupIndex];
      if (prevView) {
        prevView.setSelection(false);
      }
      this.selectedCupIndex = null;
      if (notify) {
        this.callbacks.onSelectCup?.(null);
      }
    }
  }

  renderAllCups() {
    this.logic.cups.forEach((cup, idx) => {
      const view = this.cupViews[idx];
      if (view) {
        view.renderLiquid(cup);
      }
    });
    // Strainer markers always follow the authoritative strainerState.
    // During a strained pour the animation owns the pre-visual and calls
    // refresh explicitly after landing; here we sync the steady state.
    if (!this.isAnimating) {
      try {
        this.refreshStrainerVisuals();
      } catch {
        // ignore pre-init (stand containers exist but stage may not)
      }
    }
  }

  /**
   * Lemon surface point in stage space (G5.1): delegates to the vessel's
   * transform-aware anchor (pivot/rotation/lift/scale). The caller
   * supplies the layer count since logic is already post-move when
   * animation runs.
   */
  private lemonStagePoint(view: CupView, layerCount: number): { x: number; y: number } {
    return view.surfaceStagePoint(layerCount);
  }

  /**
   * Begin a lemon pour-arc transit (Gauntlet 5 §66, geometry fixed G5.1):
   * the flight starts at the transformed pre-move source surface and
   * LANDS on the FINAL post-pour destination surface (the tea has arrived
   * when the lemon lands — the static slice reappears at exactly that
   * point via the post-loop `renderAllCups`). Destination static stays
   * hidden mid-flight so two lemons never show.
   */
  private startLemonTransit(
    ingredient: FloatingIngredientId,
    sourceView: CupView,
    targetView: CupView,
    sourcePreCount: number,
    targetFinalCount: number,
    durMs: number,
  ): void {
    const from = this.lemonStagePoint(sourceView, sourcePreCount);
    const to = this.lemonStagePoint(targetView, targetFinalCount);
    targetView.suppressLemonTransit = true;
    const toCup = this.logic.cups[targetView.index];
    if (toCup) targetView.renderLemon(toCup);
    this.lemonTransit = {
      ingredient,
      fromX: from.x,
      fromY: from.y,
      ctrlX: (from.x + to.x) / 2,
      ctrlY: Math.min(from.y, to.y) - 46,
      toX: to.x,
      toY: to.y,
      startMs: performance.now(),
      durMs: Math.max(1, durMs),
    };
  }

  private clearLemonTransit(): void {
    this.lemonTransit = null;
    this.transitGraphics.clear();
  }

  /**
   * Honey bottom point in stage space (Gauntlet 7 §82): delegates to the
   * vessel's transform-aware bottom anchor (pivot/rotation/lift/scale).
   * The caller captures it while the source is still tilted (actual pour
   * pose, never rest pose).
   */
  private honeyStagePoint(view: CupView): { x: number; y: number } {
    return view.honeyStagePoint();
  }

  /**
   * Honey rim point in stage space: the mouth the drop falls through
   * before sinking to the shared bottom anchor.
   */
  private honeyRimStagePoint(view: CupView): { x: number; y: number } {
    return view.honeyRimStagePoint();
  }

  /**
   * Begin a honey leg (Gauntlet 7 §82): stage-space flight from `from` to
   * `to`. Arc legs use a lifted ctrl (short amber arc); sink legs pass
   * `lift = 0` for a straight vertical sink to the shared bottom anchor.
   * The destination static blob stays hidden mid-flight (caller-owned
   * `suppressHoneyTransit`, lemon mirror) so two honeys never show.
   */
  private startHoneyTransit(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    durMs: number,
    lift = 28,
  ): void {
    this.honeyTransit = {
      fromX,
      fromY,
      ctrlX: (fromX + toX) / 2,
      ctrlY: lift === 0 ? (fromY + toY) / 2 : Math.min(fromY, toY) - lift,
      toX,
      toY,
      startMs: performance.now(),
      durMs: Math.max(1, durMs),
    };
  }

  private clearHoneyTransit(): void {
    this.honeyTransit = null;
    try {
      this.honeyTransitGraphics.clear();
    } catch {
      // ignore
    }
  }

  /**
   * Begin the ice-melt flourish (Gauntlet 9 §101): the tea has landed and
   * logic ice is already null, so draw the cracking slab fading in place
   * at the destination surface for ICE_MELT_MS. Stage-space point captured
   * at rest pose (the pour tilt has already returned by landing time).
   */
  private startIceMelt(x: number, y: number): void {
    this.iceMelt = { x, y, startMs: performance.now(), durMs: ICE_MELT_MS };
  }

  private clearIceMelt(): void {
    this.iceMelt = null;
    try {
      this.iceTransitGraphics.clear();
    } catch {
      // ignore
    }
  }

  /** Ice surface point in stage space (rest pose — melt runs post-landing). */
  private iceStagePoint(view: CupView, layerCount: number): { x: number; y: number } {
    return view.iceSurfaceStagePoint(layerCount);
  }

  /** Draw the cracking/fading melt slab (existing ticker). */
  private drawIceMelt(): void {
    const t = this.iceMelt;
    if (!t) return;
    const progress = Math.min(1, Math.max(0, (performance.now() - t.startMs) / t.durMs));
    // Slab shrinks slightly and fades out; a rising cool glint sells melt.
    const shrink = 1 - progress * 0.25;
    try {
      this.iceTransitGraphics.clear();
    } catch {
      // ignore
    }
    drawIceSlab(
      this.iceTransitGraphics,
      t.x,
      t.y - progress * 4,
      ICE_SLAB_HALF_W * shrink,
      ICE_SLAB_H * shrink,
      1 - progress,
    );
  }

  /** Cinnamon stick point in stage space (tilted pour pose — like honey). */
  private cinnamonStagePoint(view: CupView): { x: number; y: number } {
    return view.cinnamonStagePoint();
  }

  /**
   * Begin the cinnamon removal flourish (Gauntlet 11): the tea has landed
   * and logic obstacle is already null, so draw the lifting/tilting stick
   * rising out of the emptied source for CINNAMON_REMOVAL_MS. Stage-space
   * point captured while the source is still hovered/tilted (actual pour
   * pose, never rest pose) — the stick lifts out of where it really was.
   */
  private startCinnamonRemoval(x: number, y: number): void {
    const plan = cinnamonRemovalPlan('cinnamon');
    this.cinnamonRemoval = { x, y, startMs: performance.now(), durMs: plan.durMs };
  }

  private clearCinnamonRemoval(): void {
    this.cinnamonRemoval = null;
    try {
      this.cinnamonTransitGraphics.clear();
    } catch {
      // ignore
    }
  }

  /** Tea-bud point in stage space (tilted pour pose — like cinnamon). */
  private teaBloomStagePoint(view: CupView): { x: number; y: number } {
    return view.teaBudStagePoint();
  }

  /**
   * Begin the tea-bloom flourish (Gauntlet 12): the final tea has left and
   * logic bud is already null, so draw the opening flower at the emptied
   * source bottom for TEA_BLOOM_MS. Stage-space point captured while the
   * source is still hovered/tilted (actual pour pose, never rest pose).
   */
  private startTeaBloom(x: number, y: number): void {
    const plan = teaBloomVisualPlan('tea_bud');
    this.teaBloom = { x, y, startMs: performance.now(), durMs: plan.durMs };
  }

  private clearTeaBloom(): void {
    this.teaBloom = null;
    try {
      this.teaBloomTransitGraphics.clear();
    } catch {
      // ignore
    }
  }

  /** Draw the opening flower (existing ticker). */
  private drawTeaBloom(): void {
    const t = this.teaBloom;
    if (!t) return;
    const progress = Math.min(1, Math.max(0, (performance.now() - t.startMs) / t.durMs));
    // The flower opens in place at the emptied bottom and fades — a
    // rewarding but restrained objective payoff, never a second pour.
    try {
      this.teaBloomTransitGraphics.clear();
    } catch {
      // ignore
    }
    drawTeaBloom(this.teaBloomTransitGraphics, t.x, t.y, progress, 1);
  }

  /** Draw the lifting/tilting removal stick (existing ticker). */
  private drawCinnamonRemoval(): void {
    const t = this.cinnamonRemoval;
    if (!t) return;
    const progress = Math.min(1, Math.max(0, (performance.now() - t.startMs) / t.durMs));
    // The stick rises out of the emptied cup while tilting further and
    // fading — a warm lift, never a second pour, never a badge.
    const liftY = t.y - progress * 30;
    const driftX = t.x + progress * 12;
    const tilt = CINNAMON_STICK_TILT + progress * 0.55;
    const alpha = 1 - progress;
    try {
      this.cinnamonTransitGraphics.clear();
    } catch {
      // ignore
    }
    drawCinnamonStick(
      this.cinnamonTransitGraphics,
      driftX,
      liftY,
      CINNAMON_STICK_W,
      CINNAMON_STICK_H,
      tilt,
      alpha,
    );
  }

  /** Clear honey suppression on every cup (reset / undo / failure path). */
  private clearHoneySuppression(): void {
    for (const v of this.cupViews) {
      try {
        v.suppressHoneyTransit = false;
      } catch {
        // ignore
      }
    }
  }

  /**
   * Clear lemon suppression on every cup (reset / undo / failure path,
   * lemon mirror of `clearHoneySuppression`). Layer-specific: never touches
   * honey suppression — joint moves clear both by calling both helpers.
   */
  private clearLemonSuppression(): void {
    for (const v of this.cupViews) {
      try {
        v.suppressLemonTransit = false;
      } catch {
        // ignore
      }
    }
  }

  /** Whether any honey is currently visible or in flight (early-out gate). */
  private needsHoneyPass(): boolean {
    if (this.honeyTransit !== null) return true;
    try {
      const cups = this.logic.cups;
      for (let i = 0; i < cups.length; i++) {
        if (cups[i]?.sinkingIngredient != null) return true;
      }
    } catch {
      // ignore — fail closed to drawing (no early-out)
      return true;
    }
    return false;
  }

  /** Draw the in-flight honey drop along its arc/sink (existing ticker). */
  private drawHoneyTransit(): void {
    const t = this.honeyTransit;
    if (!t) return;
    const progress = Math.min(1, Math.max(0, (performance.now() - t.startMs) / t.durMs));
    const u = 1 - progress;
    const x = u * u * t.fromX + 2 * u * progress * t.ctrlX + progress * progress * t.toX;
    const y = u * u * t.fromY + 2 * u * progress * t.ctrlY + progress * progress * t.toY;
    try {
      this.honeyTransitGraphics.clear();
    } catch {
      // ignore
    }
    drawHoneyDrop(this.honeyTransitGraphics, x, y, HONEY_DROP_R);
  }

  async animatePour(
    fromIdx: number,
    toIdx: number,
    layer: TeaId,
    count: number,
    sourceUncovered = false,
    floatingIngredientMoved: FloatingIngredientSlot = null,
    strained = false,
    caughtTea: TeaId | null = null,
    sinkingIngredientMoved: SinkingIngredientSlot = null,
    iceMelted: IceSlot = null,
    capacityObstacleRemoved: CapacityObstacleSlot = null,
    teaBudBloomed: TeaBudSlot = null,
  ) {
    this.isAnimating = true;
    const sourceView = this.cupViews[fromIdx] as CupView;
    const targetView = this.cupViews[toIdx] as CupView;

    this.cupsContainer.setChildIndex(sourceView.container, this.cupsContainer.children.length - 1);

    const isLeft = sourceView.homeX <= targetView.homeX;
    const tiltSign = isLeft ? 1 : -1;
    const pourAngle = tiltSign * 0.88;

    const hoverOffsetX = 32 * targetView.scale;
    const hoverOffsetY = 66 * targetView.scale;

    let targetHoverX = isLeft
      ? targetView.homeX - hoverOffsetX
      : targetView.homeX + targetView.visualWidth + hoverOffsetX;

    targetHoverX = Math.max(4, Math.min(this.app.screen.width - sourceView.visualWidth - 4, targetHoverX));
    const targetHoverY = Math.max(12, targetView.homeY - hoverOffsetY);

    sourceView.targetX = targetHoverX;
    sourceView.targetY = targetHoverY;
    sourceView.targetRotation = pourAngle;

    await this.wait(POUR_ANIMATION.liftMs);

    const pourDurationSec = POUR_DURATION_SEC;
    audioSynth.playPour(pourDurationSec);
    telegram.hapticPour();

    // Strained catch-one (Gauntlet 6 §39): source loses m, dest gains m-1,
    // tool catches 1. Ordinary pours drain/fill the same m.
    const fillCount = strained ? Math.max(0, count - 1) : count;
    sourceView.drainingCount = count;
    sourceView.drainingLayer = layer;
    targetView.fillingCount = fillCount;
    targetView.fillingLayer = layer;

    // Keep the mesh on the source at pour start (pre-state visual even
    // though logic is already post: attached→loaded). Stand shows vacant
    // rest during the pour; the catch appears near completion.
    if (strained) {
      sourceView.renderAttachedStrainer(true);
      // Force vacant-rest look mid-pour (post logic says loaded; visual
      // lags until the catch lands — auto-return is part of this pour).
      try {
        const g = this.strainerStandGraphics;
        g.clear();
        g.ellipse(34, 38, 26, 7).fill({ color: 0x6b4a2f, alpha: 0.85 });
        g.ellipse(34, 38, 26, 7).stroke({ width: 1.6, color: 0x3d271a, alpha: 0.8 });
        g.ellipse(34, 37, 18, 4.5).fill({ color: 0x4a3423, alpha: 0.9 });
        this.strainerStandGlow.clear();
      } catch {
        // ignore
      }
    }

    // Lemon transit (G5.1): logic is already post-move. The flight
    // starts at the reconstructed pre-move source surface but lands on
    // the FINAL post-pour destination surface.
    // Layer-specific (§85): only the moving layer suppresses its own
    // statics — a stationary honey blob keeps rendering (no flicker).
    const lemonMoving = floatingIngredientMoved != null;
    if (floatingIngredientMoved != null) {
      const fromCup = this.logic.cups[fromIdx];
      const toCup = this.logic.cups[toIdx];
      const { sourcePre, targetFinal } = lemonTransitCounts(
        fromCup?.layers.length ?? 0,
        toCup?.layers.length ?? 0,
        count,
      );
      this.startLemonTransit(
        floatingIngredientMoved,
        sourceView,
        targetView,
        sourcePre,
        targetFinal,
        POUR_DURATION_SEC * 1000,
      );
    }

    // Honey transit (G7 §81-82): logic is already post-move (source empty
    // of honey, dest holds it). Partial outflows keep honey
    // (`sinkingIngredientMoved == null` → no transit, static stays at the
    // bottom, no flicker, no duplicate). Emptying outflows
    // (`=== 'honey'`) hide the destination static until the drop lands.
    // Source suppression mirrors the lemon pattern (post-move source is
    // already empty; the flag keeps it empty after departure).
    // Honey transit signal (§83-84): metadata only (`sinkingIngredientMoved
    // === 'honey'`), never a view-owned index. Partial outflows (null) keep
    // the static blob at the shared bottom anchor with no transit/flicker.
    const honeyMoving = sinkingIngredientMoved === 'honey';
    if (honeyMoving) {
      sourceView.suppressHoneyTransit = true;
      targetView.suppressHoneyTransit = true;
      const fromCupH = this.logic.cups[fromIdx];
      const toCupH = this.logic.cups[toIdx];
      if (fromCupH) sourceView.renderHoney(fromCupH);
      if (toCupH) targetView.renderHoney(toCupH);
      // Joint-move concurrency (§84/87): start the amber ARC now so it
      // flies CONCURRENTLY with the lemon surface flight + tea stream
      // under the single existing ticker (separate graphics layers, so
      // neither flight erases the other). The straight sink leg follows
      // after the pour. Honey-only moves likewise arc during the pour.
      try {
        const from = this.honeyStagePoint(sourceView);
        const rim = this.honeyRimStagePoint(targetView);
        this.startHoneyTransit(from.x, from.y, rim.x, rim.y, HONEY_ARC_MS, 28);
      } catch {
        // Start failure: the landing block re-establishes the arc from
        // logic state so the drop is still seen (no strand, no duplicate).
      }
    }

    const tea = TEA_TYPES[layer];
    const startTime = performance.now();

    while (performance.now() - startTime < pourDurationSec * 1000) {
      const elapsed = (performance.now() - startTime) / (pourDurationSec * 1000);
      const easeProgress = elapsed;

      sourceView.drainAmount = easeProgress;
      targetView.fillAmount = easeProgress;

      const fromCup = this.logic.cups[fromIdx];
      const toCup = this.logic.cups[toIdx];
      if (fromCup) sourceView.renderLiquid(fromCup);
      if (toCup) targetView.renderLiquid(toCup);

      // Stream anchors use each vessel's ACTUAL rim: a tasting bowl
      // pours from (and receives at) its own shallow rim, never from
      // empty air where a tall cup rim would have been.
      const spoutLocalX = isLeft ? sourceView.width - 2 : 2;
      const spoutLocalY = sourceView.rimLocalY;
      const rotatedSpout = this.rotatePoint(
        spoutLocalX - sourceView.width / 2,
        spoutLocalY - 10,
        sourceView.cupBodyContainer.rotation,
      );

      const spoutX = sourceView.container.x + (sourceView.width / 2 + rotatedSpout.x) * sourceView.scale;
      const spoutY = sourceView.container.y + (10 + rotatedSpout.y) * sourceView.scale;

      const destX = targetView.container.x + (targetView.width / 2) * targetView.scale;
      const destY = targetView.container.y + (targetView.rimLocalY + 8) * targetView.scale;

      this.drawLiquidStream(spoutX, spoutY, destX, destY, tea.colorNum);

      if (Math.random() < 0.35) {
        this.spawnBubble(destX, destY + 8 * targetView.scale, tea.colorNum);
      }

      await this.wait(16);
    }

    this.streamGraphics.clear();
    sourceView.drainAmount = 0;
    sourceView.drainingCount = 0;
    targetView.fillAmount = 0;
    targetView.fillingCount = 0;
    // Landing: reveal the destination static lemon, then redraw.
    // Layer-specific (§85): lemon-only pours must not touch honey
    // suppression and vice versa — joint moves clear both via both paths.
    if (lemonMoving) {
      targetView.suppressLemonTransit = false;
      this.clearLemonTransit();
    }

    // Honey landing (G7 §82/87): the amber ARC already flew concurrently
    // with the tea + lemon flight (started pre-pour from the TRANSFORMED
    // source bottom — actual tilt/lift, never rest pose). Finish with the
    // short straight sink rim → shared bottom anchor (~180-260ms). The
    // static destination honey stays hidden until landing, when it appears
    // exactly at the shared anchor. Same single ticker, same single
    // isAnimating lock — never a second ticker, never a second
    // onMoveComplete (the sole completion fires at the end of animatePour).
    if (honeyMoving) {
      try {
        const rim = this.honeyRimStagePoint(targetView);
        const bottom = this.honeyStagePoint(targetView);
        const active = this.honeyTransit;
        if (active != null) {
          // Concurrent arc in flight (normal path): wait out any remainder
          // so the drop reaches the rim before sinking (normally already
          // there — pour 420ms > arc 300ms — so this is a no-op).
          const remain = active.durMs - (performance.now() - active.startMs);
          if (remain > 0) await this.wait(remain);
        } else {
          // Pre-pour arc never started (start failure): run it now so the
          // drop is still seen travelling source → rim before sinking.
          const from = this.honeyStagePoint(sourceView);
          this.startHoneyTransit(from.x, from.y, rim.x, rim.y, HONEY_ARC_MS, 28);
          await this.wait(HONEY_ARC_MS);
        }
        this.startHoneyTransit(rim.x, rim.y, bottom.x, bottom.y, HONEY_SINK_MS, 0);
        await this.wait(HONEY_SINK_MS);
      } catch {
        // Failure path: refresh from logic state (no strand, no duplicate).
      } finally {
        this.clearHoneyTransit();
        sourceView.suppressHoneyTransit = false;
        targetView.suppressHoneyTransit = false;
        this.renderAllCups();
      }
    }

    // Ice-melt flourish (Gauntlet 9 §101): the tea has landed and logic
    // ice is already null, so the cracking slab fades in place at the
    // destination surface (~320ms total extra). Part of THIS pour — same
    // single ticker, same isAnimating lock, never a second onMoveComplete.
    // Exactly one visual ice representation at any time (§105): the static
    // slab is gone from logic, only this transit draws.
    if (iceMelted === 'ice') {
      try {
        const toCup = this.logic.cups[toIdx];
        const p = this.iceStagePoint(targetView, toCup?.layers.length ?? 0);
        this.startIceMelt(p.x, p.y);
        audioSynth.playReveal();
        telegram.hapticSuccess();
        this.triggerRevealSparkles(p.x, p.y);
        await this.wait(ICE_MELT_MS);
      } catch {
        // Failure path: refresh from logic state (ice already null there).
      } finally {
        this.clearIceMelt();
        this.renderAllCups();
      }
    }

    // Cinnamon removal flourish (Gauntlet 11): the tea has landed and the
    // source is completely empty with logic obstacle already null, so the
    // stick lifts/tilts out of the emptied source (~320ms total extra).
    // Part of THIS pour — same single ticker, same isAnimating lock, never
    // a second onMoveComplete. Exactly one visual stick at any time: the
    // static stick is gone from logic, only this transit draws (static
    // suppression). Partial outflows (null) keep the static stick with no
    // transit/flicker; post-unlock the cup renders as standard normal.
    // Signal is rules metadata only (`capacityObstacleRemoved`), never a
    // view-owned wasCinnamon flag.
    if (cinnamonRemovalPlan(capacityObstacleRemoved).shouldAnimate) {
      try {
        const p = this.cinnamonStagePoint(sourceView);
        this.startCinnamonRemoval(p.x, p.y);
        audioSynth.playReveal();
        telegram.hapticSuccess();
        this.triggerRevealSparkles(p.x, p.y);
        await this.wait(CINNAMON_REMOVAL_MS);
      } catch {
        // Failure path: refresh from logic state (obstacle already null).
      } finally {
        this.clearCinnamonRemoval();
        this.renderAllCups();
      }
    }

    // Tea-bloom flourish (Gauntlet 12): the final tea has left and the
    // source is completely empty with logic bud already null, so the flower
    // opens at the emptied source bottom (~450ms total extra). Part of THIS
    // pour — same single ticker, same isAnimating lock, never a second
    // onMoveComplete (exactly one). Exactly one visual bud at any time: the
    // static bud is gone from logic, only this transit draws (static
    // suppression). Partial outflows (null) keep the static dormant bud
    // with no transit/flicker; inflows keep it too; post-bloom the cup
    // renders as standard normal. Signal is rules metadata only
    // (`teaBudBloomed`), never a view-owned wasBud flag.
    if (teaBloomVisualPlan(teaBudBloomed).shouldAnimate) {
      try {
        const p = this.teaBloomStagePoint(sourceView);
        this.startTeaBloom(p.x, p.y);
        audioSynth.playReveal();
        telegram.hapticSuccess();
        this.triggerRevealSparkles(p.x, p.y);
        await this.wait(TEA_BLOOM_MS);
      } catch {
        // Failure path: refresh from logic state (bud already null).
      } finally {
        this.clearTeaBloom();
        this.renderAllCups();
      }
    }

    // Strained catch reveal (Gauntlet 6 §40): near completion the caught
    // layer appears in the mesh on the source, then the loaded tool
    // returns to its stand. Part of THIS pour — never a second move.
    if (strained && caughtTea !== null) {
      try {
        const p = sourceView.strainerLocalPoint();
        sourceView.strainerGraphics.clear();
        drawStrainerMesh(sourceView.strainerGraphics, p.x, p.y, STRAINER_ATTACHED_R, TEA_TYPES[caughtTea].colorNum);
      } catch {
        // ignore
      }
      audioSynth.playReveal();
      telegram.hapticSuccess();
      try {
        const sp = sourceView.strainerStagePoint();
        this.triggerRevealSparkles(sp.x, sp.y);
      } catch {
        // ignore
      }
      await this.wait(220);
      sourceView.renderAttachedStrainer(false);
    }

    this.renderAllCups();
    // Post-pour strainer sync: attached→loaded transition lands here.
    // Ordinary pours keep any unrelated attached marker; strained pours
    // now show loaded-on-stand with the caught drop + stand sparkle.
    this.refreshStrainerVisuals();
    if (strained && caughtTea !== null) {
      try {
        const sc = this.strainerStandCenter();
        this.triggerRevealSparkles(sc.x, sc.y);
      } catch {
        // ignore
      }
    }

    if (sourceUncovered) {
      audioSynth.playReveal();
      telegram.hapticSuccess();
      this.triggerRevealSparkles(
        sourceView.homeX + sourceView.visualWidth / 2,
        sourceView.homeY + sourceView.visualHeight / 2,
      );
    }

    sourceView.targetX = sourceView.homeX;
    sourceView.targetY = sourceView.homeY;
    sourceView.targetRotation = 0;
    sourceView.targetLift = 0;

    await this.wait(POUR_ANIMATION.returnMs);

    this.isAnimating = false;
    this.callbacks.onMoveComplete?.();

    if (this.logic.isWon()) {
      audioSynth.playWin();
      telegram.hapticSuccess();
      this.triggerWinConfetti();
      // Restrained serving polish: correctly served target cups glow
      // briefly with a simultaneous sparkle each. VictoryModal is untouched.
      this.logic.cups.forEach((cup, idx) => {
        if (targetCupState(cup.layers, cup.constraint) === 'correct') {
          const view = this.cupViews[idx];
          if (view) {
            this.triggerRevealSparkles(
              view.homeX + view.visualWidth / 2,
              view.homeY + view.visualHeight / 2,
            );
          }
        }
        // Correctly served lemon: a small sparkle around the slice.
        if (
          cup.floatingIngredient != null &&
          floatingIngredientHostSatisfied(cup.floatingIngredient, cup.layers, cup.constraint)
        ) {
          const view = this.cupViews[idx];
          if (view) {
            const p = this.lemonStagePoint(view, cup.layers.length);
            this.triggerRevealSparkles(p.x, p.y);
          }
        }
        // Correctly served honey: a small warm sparkle at the bottom blob.
        // View only calls `sinkingIngredientHostSatisfied`, never reimplements.
        if (
          cup.sinkingIngredient != null &&
          sinkingIngredientHostSatisfied(cup.sinkingIngredient, cup.layers, cup.constraint)
        ) {
          const view = this.cupViews[idx];
          if (view) {
            const p = this.honeyStagePoint(view);
            this.triggerRevealSparkles(p.x, p.y);
          }
        }
      });
      this.callbacks.onWin?.(this.boundLevel);
    } else if (this.logic.isDeadlocked()) {
      audioSynth.playInvalid();
      telegram.hapticError();
      this.callbacks.onDeadlock?.();
    }
  }

  triggerRevealSparkles(x: number, y: number) {
    const goldColors = [0xffd700, 0xffea79, 0xffffff, 0xe8985e];
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 15,
        alpha: 1,
        color: goldColors[Math.floor(Math.random() * goldColors.length)] as number,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
        scale: 3 + Math.random() * 3,
        type: 'sparkle',
      });
    }
  }

  private drawLiquidStream(x1: number, y1: number, x2: number, y2: number, color: number) {
    this.streamGraphics.clear();

    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    const midX = (x1 + x2) / 2 + Math.sin(performance.now() * 0.03) * 2;
    const midY = (y1 + y2) / 2;
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 5.5, color, alpha: 0.9 });

    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

    this.streamGraphics
      .circle(x2 + (Math.random() * 4 - 2), y2 + 2, 2.5)
      .fill({ color, alpha: 0.8 });
  }

  private rotatePoint(x: number, y: number, angle: number): { x: number; y: number } {
    return rotatePoint2D(x, y, angle);
  }

  private spawnBubble(x: number, y: number, color: number) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() * 2 - 1) * 1.5,
      vy: -(Math.random() * 2 + 1),
      alpha: 0.8,
      maxAlpha: 0.8,
      scale: Math.random() * 2 + 1.5,
      life: 0,
      maxLife: 0.35 + Math.random() * 0.2,
      color,
      type: 'steam',
    });
  }

  spawnSteamFromCup(cupView: CupView, colorHex: string) {
    const parsed = parseInt(colorHex.replace('#', ''), 16);
    const teaColor = Number.isNaN(parsed) ? 0xffffff : parsed;
    this.particles.push({
      x: cupView.container.x + cupView.visualWidth / 2 + (Math.random() * 20 - 10) * cupView.scale,
      // Steam rises from the actual rim (bowl rim for tasting vessels).
      y: cupView.container.y + (cupView.isTastingBowl ? cupView.rimLocalY : 10) * cupView.scale,
      vx: Math.random() * 0.8 - 0.4,
      vy: -(Math.random() * 1.2 + 0.8),
      alpha: 0.35,
      maxAlpha: 0.35,
      scale: (Math.random() * 3 + 2) * cupView.scale,
      life: 0,
      maxLife: 1.6 + Math.random() * 0.8,
      color: teaColor,
      type: 'steam',
    });
  }

  triggerWinConfetti() {
    const colors = [0x87a96b, 0xf4a460, 0xb85b6c, 0xe6c29f, 0xa29bfe, 0xffd700];
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    for (let i = 0; i < 65; i++) {
      this.particles.push({
        x: w / 2 + (Math.random() * 120 - 60),
        y: h / 2 - 60 + (Math.random() * 60 - 30),
        vx: Math.random() * 14 - 7,
        vy: -(Math.random() * 10 + 6),
        alpha: 1,
        maxAlpha: 1,
        scale: Math.random() * 6 + 4,
        life: 0,
        maxLife: 2.2 + Math.random() * 1.2,
        color: colors[Math.floor(Math.random() * colors.length)] as number,
        type: 'confetti',
        rotation: Math.random() * Math.PI * 2,
        vRot: Math.random() * 0.2 - 0.1,
      });
    }
  }

  /** Draw the in-flight lemon slice along its arc (existing ticker). */
  private drawLemonTransit(): void {
    const t = this.lemonTransit;
    if (!t) return;
    const progress = Math.min(1, Math.max(0, (performance.now() - t.startMs) / t.durMs));
    const u = 1 - progress;
    const x = u * u * t.fromX + 2 * u * progress * t.ctrlX + progress * progress * t.toX;
    const y = u * u * t.fromY + 2 * u * progress * t.ctrlY + progress * progress * t.toY;
    this.transitGraphics.clear();
    if (t.ingredient === 'lemon') drawLemonSlice(this.transitGraphics, x, y, LEMON_SLICE_R);
  }

  update(delta: number) {
    this.cupViews.forEach((c) => c.update(delta));
    this.drawLemonTransit();
    // Honey drop + strainer flights share the SAME single ticker (no second ticker).
    // No-honey fast path: skip honey work when no cup holds honey and no flight is active.
    if (this.honeyTransit !== null || this.needsHoneyPass()) {
      this.drawHoneyTransit();
    }
    // Ice-melt flourish rides the SAME single ticker (no second ticker).
    if (this.iceMelt !== null) {
      this.drawIceMelt();
    }
    // Cinnamon removal flourish rides the SAME single ticker (no second ticker).
    if (this.cinnamonRemoval !== null) {
      this.drawCinnamonRemoval();
    }
    // Tea-bloom flourish rides the SAME single ticker (no second ticker).
    if (this.teaBloom !== null) {
      this.drawTeaBloom();
    }
    this.drawStrainerTransit();
    if (this.strainerStandShake > 0) {
      this.strainerStandShake = Math.max(0, this.strainerStandShake - delta);
      const k = this.strainerStandShake / 0.32;
      this.strainerStandContainer.x =
        this.strainerStandHomeX + Math.sin(this.strainerStandShake * 45) * 6 * k;
    } else if (this.strainerStandContainer) {
      // Re-anchor when idle (layout owns home; shake never drifts).
      if (
        this.strainerStandContainer.x !== this.strainerStandHomeX &&
        this.strainerStandHomeX !== 0
      ) {
        this.strainerStandContainer.x = this.strainerStandHomeX;
      }
    }

    this.ambientSteamTimer += delta;
    if (this.ambientSteamTimer > 0.4) {
      this.ambientSteamTimer = 0;
      this.logic.cups.forEach((c, idx) => {
        if (!c.isEmpty && Math.random() < 0.45) {
          const topTea = c.topLayer ? TEA_TYPES[c.topLayer] : null;
          const view = this.cupViews[idx];
          if (view && topTea) {
            this.spawnSteamFromCup(view, topTea.colorHex);
          }
        }
      });
    }

    this.particlesGraphics.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life += delta;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.type === 'steam') {
        p.vx += Math.random() * 0.2 - 0.1;
        p.vy *= 0.98;
        const progress = p.life / p.maxLife;
        p.alpha = (1 - progress) * (p.maxAlpha ?? 0.35);
        this.particlesGraphics
          .circle(p.x, p.y, p.scale * (1 + progress * 1.2))
          .fill({ color: p.color, alpha: p.alpha });
      } else if (p.type === 'sparkle') {
        p.vx *= 0.94;
        p.vy *= 0.94;
        const progress = p.life / p.maxLife;
        p.alpha = Math.max(0, 1 - progress);
        const s = p.scale * (1 - progress * 0.5);
        this.particlesGraphics.star(p.x, p.y, 4, s, s * 0.35).fill({ color: p.color, alpha: p.alpha });
      } else {
        p.vy += 0.25;
        p.vx *= 0.98;
        if (p.rotation !== undefined && p.vRot !== undefined) {
          p.rotation += p.vRot;
        }
        const progress = p.life / p.maxLife;
        p.alpha = Math.min(1, (1 - progress) * 1.3);
        this.particlesGraphics
          .roundRect(p.x, p.y, p.scale, p.scale * 0.6, 2)
          .fill({ color: p.color, alpha: p.alpha });
      }
    }
  }

  resetLevel() {
    this.deselectCurrent(false);
    // Tool intent never survives a level swap; transits never strand.
    this.toolMode = 'off';
    this.strainerStandShake = 0;
    this.clearStrainerTransit();
    // A level swap mid-flight must never strand a flying lemon or a
    // suppressed destination slice (fresh CupViews default suppression off,
    // cleared explicitly here too for the §88 audit).
    this.clearLemonTransit();
    this.clearLemonSuppression();
    // Honey never strands either: clear the drop flight + suppression flags.
    this.clearHoneyTransit();
    this.clearHoneySuppression();
    // Melt flourish never strands either (logic ice is authoritative).
    this.clearIceMelt();
    // Removal flourish never strands either (logic obstacle is authoritative).
    this.clearCinnamonRemoval();
    this.setupCups();
    this.layoutCups();
    this.renderAllCups();
    // Steady-state stand sync (layout already refreshed, but ensure the
    // fresh strainerState paints even when cups are empty).
    try {
      this.refreshStrainerVisuals();
    } catch {
      // ignore pre-init
    }
  }

  undoMove() {
    if (this.isAnimating) return;
    this.deselectCurrent(false);
    // Undo restores logic.strainerState; armed tool intent is void.
    this.toolMode = 'off';
    this.strainerStandShake = 0;
    this.clearStrainerTransit();
    // Undo restores logic ingredient slots; a stranded flight or stale
    // suppression would hide the restored static slice/blob — clear BOTH
    // transit states + BOTH suppression flags first (§88). Guarded by
    // isAnimating above, so this only clears steady-state residue.
    this.clearLemonTransit();
    this.clearLemonSuppression();
    this.clearHoneyTransit();
    this.clearHoneySuppression();
    // Undo restores logic ice exactly; a stranded flourish would hide the
    // restored static slab — clear it first (same audit as lemon/honey).
    this.clearIceMelt();
    // Undo restores the logic obstacle exactly; a stranded removal flourish
    // would double the restored static stick — clear it first (same audit).
    this.clearCinnamonRemoval();
    const move = this.logic.undo();
    if (move) {
      audioSynth.playUndo();
      telegram.hapticSelection();
      this.renderAllCups();
      try {
        this.refreshStrainerVisuals();
      } catch {
        // ignore
      }
    } else {
      // Nothing to undo still clears a stale armed mode.
      try {
        this.refreshStrainerVisuals();
      } catch {
        // ignore
      }
    }
  }

  private safeDestroyApp() {
    try {
      ensureLegacyResizeGuard(this.app);
      if (this.app.renderer) {
        this.app.destroy(true, { children: true, texture: false });
      }
      ensureLegacyResizeGuard(this.app);
    } catch (err) {
      console.warn('Safe Pixi destroy error ignored:', err);
    }
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const v of this.cupViews) {
      try {
        this.cupsContainer.removeChild(v.container);
      } catch {
        // ignore
      }
      v.destroy();
    }
    this.cupViews = [];

    audioSynth.stopPour();

    if (this.canvasEl && this.containerEl.contains(this.canvasEl)) {
      try {
        this.containerEl.removeChild(this.canvasEl);
      } catch {
        // ignore removal if already detached
      }
    }
    this.canvasEl = null;

    this.safeDestroyApp();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
