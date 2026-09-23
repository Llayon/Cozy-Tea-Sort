/**
 * Safe localStorage persistence with validation.
 * The app must never crash when storage is unavailable or throws,
 * and must never accept impossible unlock state from stored JSON.
 */

import { ALL_TEA_IDS, CupSkinId, TeaId } from './types';
import { sanitizeLevel } from './logic/progression';

const KEYS = {
  currentLevel: 'cozy_tea_current_level',
  highestUnlocked: 'cozy_tea_highest_unlocked',
  legacyLevel: 'cozy_tea_level',
  unlockedRecipes: 'cozy_tea_unlocked_recipes',
  unlockedSkins: 'cozy_tea_unlocked_skins',
  equippedSkin: 'cozy_tea_equipped_skin',
  muted: 'cozy_tea_muted',
} as const;

const KNOWN_SKINS: readonly CupSkinId[] = ['glass', 'ceramic', 'porcelain'];
const KNOWN_RECIPES: readonly TeaId[] = ALL_TEA_IDS;

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    // Storage full / blocked — progression stays in memory.
  }
}

export function parseLevel(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  return sanitizeLevel(raw, fallback);
}

export function parseRecipeList(raw: string | null, fallback: TeaId[]): TeaId[] {
  if (!raw) return [...fallback];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    const out: TeaId[] = [];
    for (const entry of parsed) {
      if (typeof entry === 'string' && (KNOWN_RECIPES as readonly string[]).includes(entry)) {
        const id = entry as TeaId;
        if (!out.includes(id)) out.push(id);
      }
    }
    return out.length > 0 ? out : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function parseSkinList(raw: string | null, fallback: CupSkinId[]): CupSkinId[] {
  if (!raw) return [...fallback];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallback];
    const out: CupSkinId[] = [];
    for (const entry of parsed) {
      if (typeof entry === 'string' && (KNOWN_SKINS as readonly string[]).includes(entry)) {
        const id = entry as CupSkinId;
        if (!out.includes(id)) out.push(id);
      }
    }
    return out.length > 0 ? out : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function parseSkinId(raw: string | null, fallback: CupSkinId): CupSkinId {
  if (raw && (KNOWN_SKINS as readonly string[]).includes(raw)) return raw as CupSkinId;
  return fallback;
}

export interface PersistedProgress {
  currentLevel: number;
  highestUnlockedLevel: number;
  unlockedRecipes: TeaId[];
  unlockedSkins: CupSkinId[];
  equippedSkin: CupSkinId;
  muted: boolean;
}

export function loadProgress(): PersistedProgress {
  const legacy = parseLevel(safeGet(KEYS.legacyLevel), 1);
  const current = parseLevel(safeGet(KEYS.currentLevel), legacy);
  const highestRaw = safeGet(KEYS.highestUnlocked);
  const highestUnlockedLevel =
    highestRaw === null ? Math.max(1, current, legacy) : parseLevel(highestRaw, Math.max(1, legacy));

  const unlockedRecipes = parseRecipeList(safeGet(KEYS.unlockedRecipes), ['matcha']);
  const unlockedSkins = parseSkinList(safeGet(KEYS.unlockedSkins), ['glass']);
  // Equipped skin must be BOTH known AND actually unlocked. A locked (or
  // manually edited) value falls back to the first unlocked skin so the UI
  // can never boot with an unearned cup skin equipped.
  const parsedSkin = parseSkinId(safeGet(KEYS.equippedSkin), 'glass');
  const equippedSkin = unlockedSkins.includes(parsedSkin)
    ? parsedSkin
    : ((unlockedSkins[0] ?? 'glass') as CupSkinId);
  const muted = safeGet(KEYS.muted) === 'true';

  // Clamp current into the legitimately unlocked range so a stale stored
  // value can never boot the player into an unearned level.
  const clampedCurrent = Math.max(1, Math.min(current, highestUnlockedLevel));

  return {
    currentLevel: clampedCurrent,
    highestUnlockedLevel,
    unlockedRecipes,
    unlockedSkins,
    equippedSkin,
    muted,
  };
}

export function saveProgress(p: Partial<PersistedProgress>): void {
  if (p.currentLevel !== undefined) safeSet(KEYS.currentLevel, String(sanitizeLevel(p.currentLevel)));
  if (p.highestUnlockedLevel !== undefined) {
    const h = sanitizeLevel(p.highestUnlockedLevel);
    safeSet(KEYS.highestUnlocked, String(h));
    // Keep the legacy key in sync so older clients don't regress.
    safeSet(KEYS.legacyLevel, String(h));
  }
  if (p.unlockedRecipes !== undefined) safeSet(KEYS.unlockedRecipes, JSON.stringify(p.unlockedRecipes));
  if (p.unlockedSkins !== undefined) safeSet(KEYS.unlockedSkins, JSON.stringify(p.unlockedSkins));
  if (p.equippedSkin !== undefined) safeSet(KEYS.equippedSkin, p.equippedSkin);
  if (p.muted !== undefined) safeSet(KEYS.muted, String(p.muted));
}

export const STORAGE_KEYS = KEYS;
