/**
 * Canonical tea palette + shared game types.
 *
 * This is the single source of truth for `TeaId`, `CupSkinId`,
 * tea metadata and cup capacity. All other modules must import
 * from here instead of defining their own copies.
 */

export type TeaId =
  | 'matcha'
  | 'sea_buckthorn'
  | 'karkade'
  | 'milk_oolong'
  | 'lavender'
  | 'saffron'
  | 'buckwheat';

export type CupSkinId = 'glass' | 'ceramic' | 'porcelain';

export interface TeaType {
  id: TeaId;
  name: string;
  nameRu: string;
  colorHex: string;
  colorNum: number;
  textColor: string;
  steamColor: string;
  description: string;
}

export const TEA_TYPES: Record<TeaId, TeaType> = {
  matcha: {
    id: 'matcha',
    name: 'Matcha Tea',
    nameRu: 'Матча',
    colorHex: '#84B866',
    colorNum: 0x84b866,
    textColor: '#243b19',
    steamColor: 'rgba(132, 184, 102, 0.45)',
    description: 'Свежий зеленый японский чай',
  },
  sea_buckthorn: {
    id: 'sea_buckthorn',
    name: 'Sea Buckthorn',
    nameRu: 'Облепиховый',
    colorHex: '#FFA834',
    colorNum: 0xffa834,
    textColor: '#572b04',
    steamColor: 'rgba(255, 168, 52, 0.45)',
    description: 'Теплый янтарно-цитрусовый настой',
  },
  karkade: {
    id: 'karkade',
    name: 'Karkade Berry',
    nameRu: 'Каркаде',
    colorHex: '#D6405C',
    colorNum: 0xd6405c,
    textColor: '#3d0c15',
    steamColor: 'rgba(214, 64, 92, 0.45)',
    description: 'Глубокий рубиново-ягодный настой',
  },
  milk_oolong: {
    id: 'milk_oolong',
    name: 'Milk Oolong / Latte',
    nameRu: 'Молочный улун',
    colorHex: '#F5D6B8',
    colorNum: 0xf5d6b8,
    textColor: '#4a2f18',
    steamColor: 'rgba(245, 214, 184, 0.45)',
    description: 'Нежный сливочно-кофейный купаж',
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender Herbal',
    nameRu: 'Лавандовый чай',
    colorHex: '#A79AFE',
    colorNum: 0xa79afe,
    textColor: '#292257',
    steamColor: 'rgba(167, 154, 254, 0.45)',
    description: 'Ароматный цветочный настой',
  },
  saffron: {
    id: 'saffron',
    name: 'Golden Saffron',
    nameRu: 'Золотой шафран',
    colorHex: '#F2C94C',
    colorNum: 0xf2c94c,
    textColor: '#47360a',
    steamColor: 'rgba(242, 201, 76, 0.45)',
    description: 'Драгоценный солнечный шафрановый купаж',
  },
  buckwheat: {
    id: 'buckwheat',
    name: 'Buckwheat Ku Qiao',
    nameRu: 'Гречишный чай',
    colorHex: '#C49A45',
    colorNum: 0xc49a45,
    textColor: '#3d2b0e',
    steamColor: 'rgba(196, 154, 69, 0.45)',
    description: 'Теплый медовый чай с нотками свежей выпечки',
  },
};

export const ALL_TEA_IDS: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
  'lavender',
  'saffron',
  'buckwheat',
];

/**
 * STANDARD TEA QUANTITY PER COLOR (Gauntlet 4 decoupling).
 *
 * Every active TeaId always contributes exactly this many units to a
 * puzzle — regardless of vessel capacities. A capacity-2 tasting bowl
 * never changes the tea pool: it is a temporary workspace, not a
 * destination.
 */
export const TEA_UNITS_PER_COLOR = 4;

/** Standard vessel capacity (ordinary cups, teapot, guest cup, targets). */
export const STANDARD_CUP_CAPACITY = 4;

/**
 * Legacy alias (Gauntlets 0–3). New code must use `TEA_UNITS_PER_COLOR`
 * for tea-quantity questions and `cupCapacity(constraint)` for
 * vessel-capacity questions. Retained so the migration stays safe.
 */
export const MAX_CUP_CAPACITY = STANDARD_CUP_CAPACITY;

/** Tasting-bowl (дегустационная пиала) physical capacity. */
export const TASTING_BOWL_CAPACITY = 2;

/**
 * Per-vessel constraint (puzzle/domain data, never UI data).
 *
 * Two ORTHOGONAL concepts share one small immutable record:
 *
 * - `mode` controls POUR BEHAVIOR:
 *   - `normal`      : ordinary Water Sort vessel (may give and receive).
 *   - `source-only` : teapot — may GIVE tea but can never RECEIVE tea.
 *   - `sink-only`   : guest cup — may RECEIVE tea but can never GIVE tea.
 * - `targetTeaId` controls FINAL DESTINATION (named serving):
 *   - absent        : ordinary end-state rule (empty, or full homogeneous).
 *   - present       : at victory this cup MUST be full homogeneous of
 *     exactly `targetTeaId`. Only valid with `mode: 'normal'`; a
 *     source-only or sink-only vessel MUST NOT carry a target (rejected in
 *     production generation — flow restriction and destination identity
 *     stay separate).
 * - `capacity` controls PHYSICAL SPACE (Gauntlet 4):
 *   - absent        : standard capacity (`STANDARD_CUP_CAPACITY`).
 *   - present       : this vessel holds at most that many layers. The
 *     production tasting bowl uses `TASTING_BOWL_CAPACITY` (2).
 * - `mustEndEmpty` controls COMPLETION REQUIREMENT (Gauntlet 4):
 *   - absent/false  : normal end-state semantics for the mode.
 *   - true          : this vessel MUST be empty in the solved state
 *     (tasting bowl — even a full homogeneous bowl is NOT complete).
 *
 * Target is NOT a pouring mode: during play a target cup pours exactly
 * like a normal cup (any legal tea in or out, mistakes allowed). The
 * constraint binds ONLY the final solved state.
 *
 * A tasting bowl is NOT a flow mode: it pours exactly like a normal cup
 * in both directions. Only its capacity and end-state rule differ.
 *
 * No Pixi/React types may ever appear in this module.
 */
export type CupMode = 'normal' | 'source-only' | 'sink-only';

export interface CupConstraint {
  mode: CupMode;
  targetTeaId?: TeaId;
  /**
   * Vessel capacity. Undefined = standard capacity
   * (`STANDARD_CUP_CAPACITY`). Explicit `4` is semantically identical to
   * omitted (canonicalization treats them the same).
   */
  capacity?: number;
  /**
   * This vessel must be empty in the solved state. Undefined = false
   * (normal end-state semantics). Explicit `false` is semantically
   * identical to omitted.
   */
  mustEndEmpty?: boolean;
}

/** Canonical normal-vessel constraint (frozen). */
export const NORMAL_CUP_CONSTRAINT: CupConstraint = Object.freeze({
  mode: 'normal',
}) as CupConstraint;

/** Canonical source-only (teapot) constraint (frozen). */
export const SOURCE_ONLY_CUP_CONSTRAINT: CupConstraint = Object.freeze({
  mode: 'source-only',
}) as CupConstraint;

/** Canonical sink-only (guest cup) constraint (frozen). */
export const SINK_ONLY_CUP_CONSTRAINT: CupConstraint = Object.freeze({
  mode: 'sink-only',
}) as CupConstraint;

/** Canonical tasting-bowl (дегустационная пиала) constraint (frozen). */
export const TASTING_BOWL_CONSTRAINT: CupConstraint = Object.freeze({
  mode: 'normal',
  capacity: TASTING_BOWL_CAPACITY,
  mustEndEmpty: true,
}) as CupConstraint;

/**
 * Effective vessel capacity: explicit `capacity`, else standard.
 * Non-positive / non-finite values fall back to standard (production
 * validation rejects them loudly; this keeps pure helpers total).
 */
export function cupCapacity(c: CupConstraint | undefined): number {
  const v = c?.capacity;
  if (v === undefined) return STANDARD_CUP_CAPACITY;
  if (!Number.isFinite(v) || (v as number) <= 0) return STANDARD_CUP_CAPACITY;
  return Math.floor(v as number);
}

/** Effective must-end-empty flag (explicit `true`, else false). */
export function mustEndEmpty(c: CupConstraint | undefined): boolean {
  return c?.mustEndEmpty === true;
}

/**
 * Production tasting-bowl identification (pure domain helper): normal
 * flow, capacity 2, must end empty, no named target. The View uses this
 * for the visual form — no parallel `isTastingCup` booleans anywhere.
 */
export function isTastingCupConstraint(c: CupConstraint | undefined): boolean {
  if (!c) return false;
  return (
    c.mode === 'normal' &&
    cupCapacity(c) === TASTING_BOWL_CAPACITY &&
    mustEndEmpty(c) &&
    c.targetTeaId === undefined
  );
}

/** Build `count` default (normal) constraints. */
export function defaultCupConstraints(count: number): CupConstraint[] {
  return Array.from({ length: count }, () => ({ mode: 'normal' as CupMode }));
}

/**
 * Backwards-compatible normalization: old callers that only pass
 * `TeaId[][]` synthesize all-normal constraints. Every cup has exactly
 * one constraint; default = normal with no target.
 */
export function normalizeCupConstraints(
  constraints: readonly CupConstraint[] | undefined,
  count: number,
): CupConstraint[] {
  if (!constraints) return defaultCupConstraints(count);
  const clone = (c: CupConstraint | undefined): CupConstraint => {
    if (!c) return { mode: 'normal' };
    return cloneCupConstraint(c);
  };
  if (constraints.length === count) return constraints.map(clone);
  // Length mismatch: pad/truncate defensively with normal (validators reject).
  const out: CupConstraint[] = [];
  for (let i = 0; i < count; i++) {
    out.push(clone(constraints[i]));
  }
  return out;
}

/** Defensive copy of one constraint (all four semantic fields). */
export function cloneCupConstraint(c: CupConstraint): CupConstraint {
  const out: CupConstraint = { mode: c.mode };
  if (c.targetTeaId !== undefined) out.targetTeaId = c.targetTeaId;
  if (c.capacity !== undefined) out.capacity = c.capacity;
  if (c.mustEndEmpty !== undefined) out.mustEndEmpty = c.mustEndEmpty;
  return out;
}

/**
 * Stable signature for canonicalization grouping. Cups collapse ONLY
 * when their complete behavioral + end-state signature is identical:
 * mode, target, effective capacity and must-end-empty flag.
 *
 * Standard vessels keep their legacy signatures (`N:_`, `N:<tea>`,
 * `SRC:_`, `SNK:_`); any capacity/end-state deviation appends an
 * explicit suffix (`N:_:C2:E` for the tasting bowl). Explicit defaults
 * (`capacity: 4`, `mustEndEmpty: false`) canonicalize identically to
 * omitted fields — no state-key fragmentation.
 */
export function cupConstraintSignature(c: CupConstraint): string {
  const modeSig = c.mode === 'source-only' ? 'SRC' : c.mode === 'sink-only' ? 'SNK' : 'N';
  const base = `${modeSig}:${c.targetTeaId ?? '_'}`;
  const cap = cupCapacity(c);
  const endEmpty = mustEndEmpty(c);
  if (cap === STANDARD_CUP_CAPACITY && !endEmpty) return base;
  return `${base}:C${cap}:${endEmpty ? 'E' : 'D'}`;
}
