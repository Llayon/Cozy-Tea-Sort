/**
 * G19 long-run browser gate.
 *
 * Proves >999 persistence round trips (including a legitimate 999 victory),
 * four-digit level display on the three mobile targets, Rollout V2 recurrence
 * visuals using the existing mechanics, and absence of repeated tutorials.
 *
 * Screenshots are human-review evidence, not pixel-diff CI gates.
 */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  attachIssueCollector,
  expectLayout,
  expectNoIssues,
  openQa,
  qaIsWon,
  qaLevel,
  qaState,
  stubExternal,
  visibleTutorialIds,
  waitIdle,
  type QaState,
} from './helpers';

const CURRENT_KEY = 'cozy_tea_current_level';
const HIGHEST_KEY = 'cozy_tea_highest_unlocked';
const LEGACY_KEY = 'cozy_tea_level';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

async function seedProgress(
  page: import('@playwright/test').Page,
  currentLevel: number,
  highestUnlocked: number,
): Promise<void> {
  await stubExternal(page);
  await page.goto(`${BASE_URL}/?qaTutorial=0`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ currentKey, highestKey, legacyKey, current, highest }) => {
      localStorage.setItem(currentKey, String(current));
      localStorage.setItem(highestKey, String(highest));
      localStorage.setItem(legacyKey, String(highest));
    },
    {
      currentKey: CURRENT_KEY,
      highestKey: HIGHEST_KEY,
      legacyKey: LEGACY_KEY,
      current: currentLevel,
      highest: highestUnlocked,
    },
  );
}

async function storedProgress(
  page: import('@playwright/test').Page,
): Promise<{ current: number; highest: number; legacy: number }> {
  return page.evaluate(
    ({ currentKey, highestKey, legacyKey }) => ({
      current: Number(localStorage.getItem(currentKey)),
      highest: Number(localStorage.getItem(highestKey)),
      legacy: Number(localStorage.getItem(legacyKey)),
    }),
    { currentKey: CURRENT_KEY, highestKey: HIGHEST_KEY, legacyKey: LEGACY_KEY },
  );
}

function hasConstraint(state: QaState, predicate: (c: Record<string, unknown>) => boolean): boolean {
  const constraints = state.cupConstraints as Array<Record<string, unknown>>;
  return constraints.some(predicate);
}

test.describe('G19 persistence boundary', () => {
  test('G19 persistence: stored 1000/1600 loads and reloads exactly', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await seedProgress(page, 1000, 1600);
    await page.goto(`${BASE_URL}/?qaTutorial=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#level-number');
    expect((await page.locator('#level-number').innerText()).trim()).toBe('#1000');
    expect(await storedProgress(page)).toEqual({ current: 1000, highest: 1600, legacy: 1600 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#level-number');
    expect((await page.locator('#level-number').innerText()).trim()).toBe('#1000');
    expect(await storedProgress(page)).toEqual({ current: 1000, highest: 1600, legacy: 1600 });
    expectNoIssues(issues);
  });

  test('G19 persistence: 999 victory persists unlock 1000 and reload retains it', async ({ page }) => {
    test.setTimeout(150_000);
    const issues = attachIssueCollector(page);
    await seedProgress(page, 999, 999);
    await openQa(page, 999, { tutorial: false, seed: 'g19-e2e:999:0' });
    expect(await qaLevel(page)).toBe(999);
    expect(await storedProgress(page)).toEqual({ current: 999, highest: 999, legacy: 999 });

    const result = await page.evaluate(
      () =>
        (
          window as unknown as {
            __cozyTeaQa: { autoSolve(): Promise<{ ok: boolean; moves: number }> };
          }
        ).__cozyTeaQa.autoSolve(),
    );
    expect(result.ok, 'L999 autoSolve').toBe(true);
    expect(await qaIsWon(page)).toBe(true);
    await page.waitForSelector('#victory-modal-container', { timeout: 15_000 });

    const afterWin = await storedProgress(page);
    expect(afterWin.highest, '999 win unlocks 1000').toBe(1000);
    expect(afterWin.current).toBe(999);

    await page.locator('#next-level-button').click();
    await page.waitForFunction(
      () =>
        (window as unknown as { __cozyTeaQa: { level: number } }).__cozyTeaQa.level === 1000,
      null,
      { timeout: 30_000 },
    );
    await waitIdle(page);
    expect(await qaLevel(page)).toBe(1000);
    const afterNext = await storedProgress(page);
    expect(afterNext).toEqual({ current: 1000, highest: 1000, legacy: 1000 });

    // Reload without a qaLevel override: the persisted 1000 is authoritative.
    await page.goto(`${BASE_URL}/?qaTutorial=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#level-number');
    expect((await page.locator('#level-number').innerText()).trim()).toBe('#1000');
    expect(await storedProgress(page)).toEqual({ current: 1000, highest: 1000, legacy: 1000 });
    expectNoIssues(issues);
  });

  test('G19 persistence: 1600 round-trips exactly', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await seedProgress(page, 1600, 1600);
    await page.goto(`${BASE_URL}/?qaTutorial=0`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#level-number');
    expect((await page.locator('#level-number').innerText()).trim()).toBe('#1600');
    expect(await storedProgress(page)).toEqual({ current: 1600, highest: 1600, legacy: 1600 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#level-number');
    expect((await page.locator('#level-number').innerText()).trim()).toBe('#1600');
    expect(await storedProgress(page)).toEqual({ current: 1600, highest: 1600, legacy: 1600 });
    expectNoIssues(issues);
  });
});

test.describe('G19 four-digit level display', () => {
  for (const level of [999, 1000, 1600]) {
    for (const [width, height] of [
      [360, 800],
      [390, 844],
      [430, 932],
    ] as const) {
      test(`G19 level display: L${level} fits ${width}x${height}`, async ({ page }) => {
        const issues = attachIssueCollector(page);
        await page.setViewportSize({ width, height });
        await openQa(page, level, { tutorial: false });
        expect(await qaLevel(page)).toBe(level);
        const display = page.locator('#level-number');
        await expect(display).toBeVisible();
        expect((await display.innerText()).trim()).toBe(`#${level}`);
        const box = await display.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 0.5);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height + 0.5);
        const header = await page.locator('#app-header').boundingBox();
        expect(header).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(header!.y);
        expect(box!.y + box!.height).toBeLessThanOrEqual(header!.y + header!.height + 0.5);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        ).toBe(true);
        await expectLayout(page, `L${level} ${width}x${height}`);
        if (width === 390) {
          mkdirSync('scripts/dev/out', { recursive: true });
          await page.screenshot({ path: `scripts/dev/out/g19-level-${level}.png` });
        }
        expectNoIssues(issues);
      });
    }
  }
});

test.describe('G19 Rollout V2 recurrence visuals', () => {
  const recurrence: Array<{
    level: number;
    label: string;
    check: (state: QaState) => boolean;
  }> = [
    {
      level: 338,
      label: 'shared tray',
      check: (state) =>
        (state.cupConstraints as Array<Record<string, unknown>>).filter(
          (c) => c.sharedCapacityGroup === 'tea-tray',
        ).length === 2,
    },
    {
      level: 374,
      label: 'tea pair',
      check: (state) =>
        (state.cupConstraints as Array<Record<string, unknown>>).filter(
          (c) => c.pairedTeaGroup === 'tea-pair',
        ).length === 2,
    },
    {
      level: 402,
      label: 'blend',
      check: (state) => state.blendRecipe?.id === 'milk-tea',
    },
    {
      level: 410,
      label: 'order+tasting',
      check: (state) =>
        hasConstraint(state, (c) => c.serveOrder !== undefined) &&
        hasConstraint(state, (c) => c.capacity === 2 && c.mustEndEmpty === true),
    },
  ];

  for (const { level, label, check } of recurrence) {
    test(`G19 recurrence: L${level} ${label}, no tutorial repeat`, async ({ page }) => {
      const issues = attachIssueCollector(page);
      await openQa(page, level);
      expect(await qaLevel(page)).toBe(level);
      expect(await visibleTutorialIds(page), `L${level} tutorial repeat`).toEqual([]);
      const state = await qaState(page);
      expect(check(state), `L${level} ${label} mechanic identity`).toBe(true);
      await expectLayout(page, `L${level} ${label} recurrence`);
      mkdirSync('scripts/dev/out', { recursive: true });
      await page.screenshot({ path: `scripts/dev/out/g19-recurrence-L${level}.png` });
      expectNoIssues(issues);
    });
  }
});
