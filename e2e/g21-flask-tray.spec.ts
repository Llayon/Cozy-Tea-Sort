/**
 * G21 FLASK_TRAY browser gate: first combo exposure L874, both cues,
 * mobile layouts, partial flask, rapid input, undo/restart/reshuffle.
 */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  attachIssueCollector,
  clearSelection,
  clickCup,
  expectLayout,
  expectNoIssues,
  openQa,
  qaLevel,
  qaMoves,
  qaSeed,
  qaState,
  visibleTutorialIds,
  waitIdle,
  type QaState,
} from './helpers';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

function flaskIndex(state: QaState): number {
  const constraints = state.cupConstraints as Array<Record<string, unknown>>;
  return constraints.findIndex((c) => c.steepingFlask === true);
}
function trayIndices(state: QaState): number[] {
  const constraints = state.cupConstraints as Array<Record<string, unknown>>;
  return constraints
    .map((c, i) => (c.sharedCapacityGroup === 'tea-tray' ? i : -1))
    .filter((i) => i >= 0);
}

async function move(page: import('@playwright/test').Page, from: number, to: number): Promise<void> {
  await page.evaluate(
    ({ from, to }) => {
      const qa = (window as unknown as { __cozyTeaQa: { tapCup(i: number): void } }).__cozyTeaQa;
      qa.tapCup(from);
      qa.tapCup(to);
    },
    { from, to },
  );
  await waitIdle(page);
}

test.describe('G21 FLASK_TRAY first exposure', () => {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [430, 932],
  ] as const) {
    test(`L874 winner composition fits ${width}x${height} with one tutorial`, async ({ page }) => {
      const issues = attachIssueCollector(page);
      await page.setViewportSize({ width, height });
      await openQa(page, 874);
      expect(await qaLevel(page)).toBe(874);
      expect(await visibleTutorialIds(page)).toEqual(['flask-tray-tutorial-hint']);
      const state = await qaState(page);
      const fi = flaskIndex(state);
      expect(fi).toBeGreaterThanOrEqual(0);
      expect(state.cups[fi]).toEqual([]);
      expect(new Set(trayIndices(state)).size).toBe(2);
      expect(state.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
      await expectLayout(page, `L874 combo ${width}x${height}`);
      mkdirSync('scripts/dev/out', { recursive: true });
      await page.screenshot({ path: `scripts/dev/out/g21-flask-tray-L874-${width}x${height}.png` });
      expectNoIssues(issues);
    });
  }

  test('L986 recurrence has no repeated tutorial', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await openQa(page, 986);
    expect(await visibleTutorialIds(page)).toEqual([]);
    const state = await qaState(page);
    expect(flaskIndex(state)).toBeGreaterThanOrEqual(0);
    expect(new Set(trayIndices(state)).size).toBe(2);
    await expectLayout(page, 'L986 combo recurrence');
    expectNoIssues(issues);
  });

  test('partial flask + tray cues, rapid input, undo/restart/reshuffle', async ({ page }) => {
    test.setTimeout(120_000);
    const issues = attachIssueCollector(page);
    await openQa(page, 874, { seed: 'g21-e2e:874:0' });
    const initial = await qaState(page);
    const fi = flaskIndex(initial);
    expect(fi).toBe(5);
    const initialSeed = await qaSeed(page);

    await move(page, 0, 5);
    let state = await qaState(page);
    expect(state.cups[fi]?.length).toBe(1);
    mkdirSync('scripts/dev/out', { recursive: true });
    await page.screenshot({ path: 'scripts/dev/out/g21-flask-tray-L874-partial.png' });

    const beforeReject = await qaMoves(page);
    await clickCup(page, fi);
    await clickCup(page, 0);
    await clickCup(page, 0);
    await waitIdle(page);
    expect(await qaMoves(page)).toBe(beforeReject);
    await clearSelection(page);

    await page.locator('#undo-btn').click();
    await waitIdle(page);
    expect(await qaMoves(page)).toBe(0);
    expect((await qaState(page)).cups[fi]).toEqual([]);

    await move(page, 0, 5);
    await page.locator('#restart-btn').click();
    await waitIdle(page);
    expect(await qaMoves(page)).toBe(0);
    expect(await qaSeed(page)).toBe(initialSeed);
    expect((await qaState(page)).cups[fi]).toEqual([]);

    await page.locator('#reshuffle-btn').click();
    await page.waitForFunction(
      (oldSeed) => (window as unknown as { __cozyTeaQa: { seed: string } }).__cozyTeaQa.seed !== oldSeed,
      initialSeed,
      { timeout: 20_000 },
    );
    await waitIdle(page);
    state = await qaState(page);
    expect(flaskIndex(state)).toBeGreaterThanOrEqual(0);
    expect(new Set(trayIndices(state)).size).toBe(2);
    expect(await qaMoves(page)).toBe(0);
    await expectLayout(page, 'L874 after reshuffle');
    expectNoIssues(issues);
  });
});
