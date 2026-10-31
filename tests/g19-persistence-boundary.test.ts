/**
 * G19 persistence boundary — named MAX_PERSISTED_LEVEL, exact round trips,
 * applyWin invariants, legacy key compatibility and safe invalid input.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyWin, MAX_PERSISTED_LEVEL, sanitizeLevel } from '../src/game/logic/progression';
import { STORAGE_KEYS, loadProgress, saveProgress } from '../src/game/storage';

class MemoryStorage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  raw(key: string): string | null {
    return this.getItem(key);
  }
}

const K = STORAGE_KEYS;
let shim: MemoryStorage;

beforeEach(() => {
  shim = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: shim,
  });
});

describe('G19 named progression bound', () => {
  it('exports one 10,000 product bound', () => {
    expect(MAX_PERSISTED_LEVEL).toBe(10_000);
  });

  it('sanitizeLevel accepts the valid domain and clamps both ends', () => {
    const expected: Array<[unknown, number]> = [
      [1, 1],
      [330, 330],
      [998, 998],
      [999, 999],
      [1000, 1000],
      [1001, 1001],
      [1599, 1599],
      [1600, 1600],
      [1601, 1601],
      [MAX_PERSISTED_LEVEL - 1, MAX_PERSISTED_LEVEL - 1],
      [MAX_PERSISTED_LEVEL, MAX_PERSISTED_LEVEL],
      [MAX_PERSISTED_LEVEL + 1, MAX_PERSISTED_LEVEL],
      [99_999_999, MAX_PERSISTED_LEVEL],
      [0, 1],
      [-1, 1],
      [NaN, 1],
      [Infinity, 1],
      ['1600', 1600],
      ['1000.9', 1000],
    ];
    for (const [input, want] of expected) expect(sanitizeLevel(input), String(input)).toBe(want);
  });

  it('applyWin advances 999 -> 1000, 1000 -> 1001, 1599 -> 1600, 1600 -> 1601', () => {
    const cases: Array<[number, number]> = [
      [999, 1000],
      [1000, 1001],
      [1599, 1600],
      [1600, 1601],
      [MAX_PERSISTED_LEVEL - 1, MAX_PERSISTED_LEVEL],
      [MAX_PERSISTED_LEVEL, MAX_PERSISTED_LEVEL],
    ];
    for (const [completed, want] of cases) {
      const result = applyWin(
        { highestUnlockedLevel: completed, unlockedRecipes: [], unlockedSkins: [] },
        completed,
        {},
      );
      expect(result.highestUnlockedLevel, `complete ${completed}`).toBe(want);
      expect(result.highestUnlockedLevel).toBeLessThanOrEqual(MAX_PERSISTED_LEVEL);
    }
  });

  it('applyWin never creates MAX+1 and never regresses', () => {
    for (const prev of [1, 330, 999, 1000, 1600, MAX_PERSISTED_LEVEL]) {
      for (const completed of [1, 330, 999, 1000, 1600, MAX_PERSISTED_LEVEL - 1, MAX_PERSISTED_LEVEL, MAX_PERSISTED_LEVEL + 1]) {
        const result = applyWin(
          { highestUnlockedLevel: prev, unlockedRecipes: [], unlockedSkins: [] },
          completed,
          {},
        );
        expect(result.highestUnlockedLevel).toBeGreaterThanOrEqual(Math.min(prev, MAX_PERSISTED_LEVEL));
        expect(result.highestUnlockedLevel).toBeLessThanOrEqual(MAX_PERSISTED_LEVEL);
        expect(result.highestUnlockedLevel).toBeLessThanOrEqual(
          Math.max(Math.min(prev, MAX_PERSISTED_LEVEL), Math.min(MAX_PERSISTED_LEVEL, completed + 1)),
        );
      }
    }
  });

  it('replaying an old level does not advance highest', () => {
    const result = applyWin(
      { highestUnlockedLevel: 1600, unlockedRecipes: [], unlockedSkins: [] },
      330,
      {},
    );
    expect(result.highestUnlockedLevel).toBe(1600);
  });
});

describe('G19 save/load round trips beyond 999', () => {
  it('999 -> 1000 persists exactly', () => {
    shim.setItem(K.currentLevel, '999');
    shim.setItem(K.highestUnlocked, '999');
    shim.setItem(K.legacyLevel, '999');
    const win = applyWin(
      { highestUnlockedLevel: 999, unlockedRecipes: [], unlockedSkins: [] },
      999,
      {},
    );
    saveProgress({ currentLevel: 1000, highestUnlockedLevel: win.highestUnlockedLevel });
    expect(shim.raw(K.currentLevel)).toBe('1000');
    expect(shim.raw(K.highestUnlocked)).toBe('1000');
    expect(shim.raw(K.legacyLevel)).toBe('1000');
    expect(loadProgress()).toMatchObject({ currentLevel: 1000, highestUnlockedLevel: 1000 });
  });

  it('1000 -> 1001 persists exactly', () => {
    const win = applyWin(
      { highestUnlockedLevel: 1000, unlockedRecipes: [], unlockedSkins: [] },
      1000,
      {},
    );
    saveProgress({ currentLevel: 1001, highestUnlockedLevel: win.highestUnlockedLevel });
    expect(loadProgress()).toMatchObject({ currentLevel: 1001, highestUnlockedLevel: 1001 });
  });

  it('1599 -> 1600 and 1600 round-trip exactly', () => {
    const win = applyWin(
      { highestUnlockedLevel: 1599, unlockedRecipes: [], unlockedSkins: [] },
      1599,
      {},
    );
    saveProgress({ currentLevel: 1600, highestUnlockedLevel: win.highestUnlockedLevel });
    expect(loadProgress()).toMatchObject({ currentLevel: 1600, highestUnlockedLevel: 1600 });
    saveProgress({ currentLevel: 1600, highestUnlockedLevel: 1600 });
    expect(loadProgress()).toMatchObject({ currentLevel: 1600, highestUnlockedLevel: 1600 });
  });

  it('1600 -> 1601 persists exactly', () => {
    const win = applyWin(
      { highestUnlockedLevel: 1600, unlockedRecipes: [], unlockedSkins: [] },
      1600,
      {},
    );
    saveProgress({ currentLevel: 1601, highestUnlockedLevel: win.highestUnlockedLevel });
    expect(loadProgress()).toMatchObject({ currentLevel: 1601, highestUnlockedLevel: 1601 });
  });

  it('MAX-1 -> MAX works; completing MAX keeps MAX and never writes MAX+1', () => {
    const before = applyWin(
      { highestUnlockedLevel: MAX_PERSISTED_LEVEL - 1, unlockedRecipes: [], unlockedSkins: [] },
      MAX_PERSISTED_LEVEL - 1,
      {},
    );
    expect(before.highestUnlockedLevel).toBe(MAX_PERSISTED_LEVEL);
    saveProgress({ currentLevel: MAX_PERSISTED_LEVEL, highestUnlockedLevel: before.highestUnlockedLevel });
    expect(loadProgress()).toMatchObject({
      currentLevel: MAX_PERSISTED_LEVEL,
      highestUnlockedLevel: MAX_PERSISTED_LEVEL,
    });

    const after = applyWin(
      { highestUnlockedLevel: MAX_PERSISTED_LEVEL, unlockedRecipes: [], unlockedSkins: [] },
      MAX_PERSISTED_LEVEL,
      {},
    );
    expect(after.highestUnlockedLevel).toBe(MAX_PERSISTED_LEVEL);
    saveProgress({ currentLevel: MAX_PERSISTED_LEVEL, highestUnlockedLevel: after.highestUnlockedLevel });
    expect(shim.raw(K.highestUnlocked)).toBe(String(MAX_PERSISTED_LEVEL));
    expect(shim.raw(K.legacyLevel)).toBe(String(MAX_PERSISTED_LEVEL));
    expect(loadProgress()).toMatchObject({
      currentLevel: MAX_PERSISTED_LEVEL,
      highestUnlockedLevel: MAX_PERSISTED_LEVEL,
    });
  });

  it('over-max stored values clamp safely', () => {
    shim.setItem(K.currentLevel, '99999999');
    shim.setItem(K.highestUnlocked, '99999999');
    shim.setItem(K.legacyLevel, '99999999');
    expect(loadProgress()).toMatchObject({
      currentLevel: MAX_PERSISTED_LEVEL,
      highestUnlockedLevel: MAX_PERSISTED_LEVEL,
    });
    saveProgress({ currentLevel: 99_999_999, highestUnlockedLevel: 99_999_999 });
    expect(shim.raw(K.currentLevel)).toBe(String(MAX_PERSISTED_LEVEL));
    expect(shim.raw(K.highestUnlocked)).toBe(String(MAX_PERSISTED_LEVEL));
  });

  it('current above highest clamps into the unlocked range', () => {
    shim.setItem(K.currentLevel, '1600');
    shim.setItem(K.highestUnlocked, '1500');
    expect(loadProgress()).toMatchObject({ currentLevel: 1500, highestUnlockedLevel: 1500 });
  });

  it('legacy-only saves and <=999 saves load unchanged', () => {
    for (const level of [1, 100, 330, 999]) {
      shim.clear();
      shim.setItem(K.currentLevel, String(level));
      shim.setItem(K.highestUnlocked, String(level));
      shim.setItem(K.legacyLevel, String(level));
      expect(loadProgress()).toMatchObject({ currentLevel: level, highestUnlockedLevel: level });
    }
    shim.clear();
    shim.setItem(K.currentLevel, '1200');
    shim.setItem(K.legacyLevel, '1200');
    expect(loadProgress()).toMatchObject({ currentLevel: 1200, highestUnlockedLevel: 1200 });
  });

  it('keeps legacy key synchronized above 999', () => {
    saveProgress({ currentLevel: 1000, highestUnlockedLevel: 1600 });
    expect(shim.raw(K.legacyLevel)).toBe('1600');
    expect(shim.raw(K.highestUnlocked)).toBe('1600');
  });

  it('invalid values fall back safely and preserve the current<=highest invariant', () => {
    const cases: Array<Record<string, string>> = [
      { [K.currentLevel]: 'garbage', [K.highestUnlocked]: 'NaN', [K.legacyLevel]: 'null' },
      { [K.currentLevel]: '0', [K.highestUnlocked]: '-5' },
      { [K.currentLevel]: 'Infinity', [K.highestUnlocked]: '-Infinity' },
      {},
    ];
    for (const stored of cases) {
      shim.clear();
      for (const [key, value] of Object.entries(stored)) shim.setItem(key, value);
      const loaded = loadProgress();
      expect(Number.isInteger(loaded.currentLevel)).toBe(true);
      expect(Number.isInteger(loaded.highestUnlockedLevel)).toBe(true);
      expect(loaded.currentLevel).toBeGreaterThanOrEqual(1);
      expect(loaded.currentLevel).toBeLessThanOrEqual(loaded.highestUnlockedLevel);
      expect(loaded.highestUnlockedLevel).toBeLessThanOrEqual(MAX_PERSISTED_LEVEL);
    }
  });

  it('storage unavailable/throws never crashes load or save', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem(): string | null {
          throw new Error('blocked');
        },
        setItem(): void {
          throw new Error('blocked');
        },
      },
    });
    expect(() => loadProgress()).not.toThrow();
    expect(loadProgress()).toMatchObject({ currentLevel: 1, highestUnlockedLevel: 1 });
    expect(() => saveProgress({ currentLevel: 1000, highestUnlockedLevel: 1000 })).not.toThrow();
  });
});
