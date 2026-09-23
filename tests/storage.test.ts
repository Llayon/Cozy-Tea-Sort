import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  loadProgress,
  parseRecipeList,
  parseSkinId,
  parseSkinList,
  saveProgress,
  STORAGE_KEYS,
} from '../src/game/storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(entries: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(entries));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

describe('storage validation', () => {
  it('rejects garbage recipe JSON with a safe fallback', () => {
    expect(parseRecipeList('not-json', ['matcha'])).toEqual(['matcha']);
    expect(parseRecipeList('[1,2,3]', ['matcha'])).toEqual(['matcha']);
    expect(parseRecipeList('["nope","matcha"]', ['matcha'])).toEqual(['matcha']);
  });

  it('dedupes and filters unknown recipe ids', () => {
    expect(parseRecipeList('["matcha","matcha","karkade","bogus"]', ['matcha'])).toEqual([
      'matcha',
      'karkade',
    ]);
  });

  it('rejects unknown skin ids with fallbacks', () => {
    expect(parseSkinId('velvet', 'glass')).toBe('glass');
    expect(parseSkinId('ceramic', 'glass')).toBe('ceramic');
    expect(parseSkinList('["glass","glass","nope"]', ['glass'])).toEqual(['glass']);
  });

  it('saveProgress never throws when storage is unavailable', () => {
    expect(() =>
      saveProgress({ currentLevel: 3, highestUnlockedLevel: 4 }),
    ).not.toThrow();
    expect(STORAGE_KEYS.highestUnlocked).toBe('cozy_tea_highest_unlocked');
  });

  it('locked equipped skin falls back to an unlocked skin (I)', () => {
    stubStorage({
      cozy_tea_unlocked_skins: JSON.stringify(['glass']),
      cozy_tea_equipped_skin: 'porcelain',
    });
    expect(loadProgress().equippedSkin).toBe('glass');
  });

  it('unlocked equipped skin is kept as-is', () => {
    stubStorage({
      cozy_tea_unlocked_skins: JSON.stringify(['glass', 'ceramic']),
      cozy_tea_equipped_skin: 'ceramic',
    });
    const loaded = loadProgress();
    expect(loaded.equippedSkin).toBe('ceramic');
    expect(loaded.unlockedSkins).toEqual(['glass', 'ceramic']);
  });

  it('unknown equipped skin string falls back safely', () => {
    stubStorage({
      cozy_tea_unlocked_skins: JSON.stringify(['glass']),
      cozy_tea_equipped_skin: 'velvet',
    });
    expect(loadProgress().equippedSkin).toBe('glass');
  });
});
