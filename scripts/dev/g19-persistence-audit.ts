/**
 * G19 persistence boundary audit (DEV evidence).
 *
 * Exercises the REAL storage.ts + progression.ts against an in-memory
 * localStorage shim. No browser and no gameplay rules involved.
 *
 * Run before the G19 fix to capture the 999 clamp, and after to capture the
 * named MAX_PERSISTED_LEVEL behavior:
 *   bunx tsx scripts/dev/g19-persistence-audit.ts --out scripts/dev/out/g19-persistence-baseline.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] as string) : fallback;
}

const OUT = resolve(ROOT, argValue('--out', 'scripts/dev/out/g19-persistence-boundary.json'));

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
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.map.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}

const shim = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: shim,
});

const storage = await import('../../src/game/storage.ts');
const progression = await import('../../src/game/logic/progression.ts');
const { STORAGE_KEYS, loadProgress, saveProgress } = storage;
const { applyWin, sanitizeLevel } = progression;
const MAX =
  typeof (progression as { MAX_PERSISTED_LEVEL?: number }).MAX_PERSISTED_LEVEL === 'number'
    ? ((progression as { MAX_PERSISTED_LEVEL: number }).MAX_PERSISTED_LEVEL)
    : 10_000;

const K = STORAGE_KEYS;
const cases: Record<string, unknown> = {};

function seed(values: Partial<Record<string, string>>): void {
  shim.clear();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) shim.setItem(key, value);
  }
}

function loadCase(name: string, values: Partial<Record<string, string>>): void {
  seed(values);
  const loaded = loadProgress();
  cases[name] = { stored: shim.snapshot(), loaded };
}

function saveCase(name: string, progress: { currentLevel?: number; highestUnlockedLevel?: number }): void {
  shim.clear();
  saveProgress(progress);
  const raw = shim.snapshot();
  const loaded = loadProgress();
  cases[name] = { input: progress, raw, loaded };
}

// Stored-state clamping.
loadCase('stored-current-1000-highest-1600', {
  [K.currentLevel]: '1000',
  [K.highestUnlocked]: '1600',
  [K.legacyLevel]: '1600',
});
loadCase('stored-current-1600-highest-1500', {
  [K.currentLevel]: '1600',
  [K.highestUnlocked]: '1500',
});
loadCase('stored-highest-99999999', {
  [K.currentLevel]: '1600',
  [K.highestUnlocked]: '99999999',
});
loadCase('stored-legacy-1200-no-highest', {
  [K.currentLevel]: '1200',
  [K.legacyLevel]: '1200',
});
loadCase('stored-invalid-garbage', {
  [K.currentLevel]: 'not-a-level',
  [K.highestUnlocked]: 'NaN',
  [K.legacyLevel]: 'null',
});
loadCase('stored-zero-negative', {
  [K.currentLevel]: '0',
  [K.highestUnlocked]: '-5',
});
loadCase('stored-empty', {});

// Save/load round trips.
saveCase('save-current-1000-highest-1600', { currentLevel: 1000, highestUnlockedLevel: 1600 });
saveCase('save-current-1600-highest-1600', { currentLevel: 1600, highestUnlockedLevel: 1600 });
saveCase('save-current-10000-highest-10000', { currentLevel: 10_000, highestUnlockedLevel: 10_000 });
saveCase('save-huge-values', { currentLevel: 99_999_999, highestUnlockedLevel: 99_999_999 });

// applyWin boundary matrix.
function winCase(name: string, prevHighest: number, completed: number): void {
  const result = applyWin(
    { highestUnlockedLevel: prevHighest, unlockedRecipes: [], unlockedSkins: [] },
    completed,
    {},
  );
  cases[name] = {
    prevHighest,
    completed,
    highestAfter: result.highestUnlockedLevel,
    expectedMax: MAX,
  };
}

winCase('win-999-from-999', 999, 999);
winCase('win-1000-from-1000', 1000, 1000);
winCase('win-1599-from-1599', 1599, 1599);
winCase('win-1600-from-1600', 1600, 1600);
winCase('win-max-minus-1-from-max-minus-1', MAX - 1, MAX - 1);
winCase('win-max-from-max', MAX, MAX);
winCase('win-max-from-below', 1, MAX);
winCase('win-over-max', MAX, MAX + 1);

// Apply-win then persist/reload (the actual player path).
function winPersistCase(name: string, prevHighest: number, completed: number): void {
  const result = applyWin(
    { highestUnlockedLevel: prevHighest, unlockedRecipes: [], unlockedSkins: [] },
    completed,
    {},
  );
  shim.clear();
  saveProgress({
    currentLevel: Math.min(MAX, completed + 1),
    highestUnlockedLevel: result.highestUnlockedLevel,
  });
  cases[name] = {
    prevHighest,
    completed,
    highestAfter: result.highestUnlockedLevel,
    raw: shim.snapshot(),
    loaded: loadProgress(),
  };
}

winPersistCase('persist-win-999', 999, 999);
winPersistCase('persist-win-1000', 1000, 1000);
winPersistCase('persist-win-1599', 1599, 1599);
winPersistCase('persist-win-1600', 1600, 1600);
winPersistCase('persist-win-max-minus-1', MAX - 1, MAX - 1);
winPersistCase('persist-win-max', MAX, MAX);

// Sanitizer matrix.
cases['sanitize'] = Object.fromEntries(
  [1, 330, 998, 999, 1000, 1001, 1599, 1600, 1601, MAX - 1, MAX, MAX + 1, 99_999_999, 0, -1, NaN, Infinity]
    .map((value) => [String(value), sanitizeLevel(value)]),
);

// Invariant checks (reported honestly; they may fail on the pre-G19 baseline).
const invariantViolations: Array<{ case: string; detail: string }> = [];
for (const [name, raw] of Object.entries(cases)) {
  const row = raw as { loaded?: { currentLevel: number; highestUnlockedLevel: number } };
  if (!row.loaded) continue;
  const { currentLevel, highestUnlockedLevel } = row.loaded;
  if (!Number.isInteger(currentLevel) || !Number.isInteger(highestUnlockedLevel)) {
    invariantViolations.push({ case: name, detail: 'non-integer loaded level' });
  }
  if (!(1 <= currentLevel && currentLevel <= highestUnlockedLevel && highestUnlockedLevel <= MAX)) {
    invariantViolations.push({
      case: name,
      detail: `loaded ${currentLevel}/${highestUnlockedLevel} outside 1..MAX=${MAX}`,
    });
  }
}
for (const [name, raw] of Object.entries(cases)) {
  if (!name.startsWith('win-')) continue;
  const row = raw as { highestAfter: number; expectedMax: number };
  if (row.highestAfter > row.expectedMax) {
    invariantViolations.push({ case: name, detail: `highestAfter ${row.highestAfter} > MAX ${row.expectedMax}` });
  }
}

const artifact = {
  gauntlet: 'G19',
  generatedAt: new Date().toISOString(),
  expectedMax: MAX,
  cases,
  invariantViolations,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`G19 persistence audit (expected MAX=${MAX})`);
console.log(JSON.stringify(cases, null, 2));
console.log(`\ninvariant violations: ${invariantViolations.length}`);
for (const v of invariantViolations) console.log(`  ${v.case}: ${v.detail}`);
console.log(`wrote ${OUT}`);
