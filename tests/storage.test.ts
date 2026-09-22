import { describe, expect, it } from 'vitest';
import {
  parseRecipeList,
  parseSkinId,
  parseSkinList,
  saveProgress,
  STORAGE_KEYS,
} from '../src/game/storage';

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
});
