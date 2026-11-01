/**
 * G20 steeping-flask browser gate.
 * First exposure, mobile layout, derived partial/ready cues, restart and
 * reshuffle. Screenshots are evidence, not pixel gates.
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

const READY_PATH: Array<[number, number]> = [
  [1, 4],
  [1, 5],
  [2, 4],
  [2, 1],
  [0, 2],
  [0, 1],
  [0, 5],
  [0, 4],
  [3, 5],
];

test.describe('G20 steeping flask first exposure', () => {
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [430, 932],
  ] as const) {
    test(`L558 flask fits ${width}x${height} with one tutorial`, async ({ page }) => {
      const issues = attachIssueCollector(page);
      await page.setViewportSize({ width, height });
      await openQa(page, 558);
      expect(await qaLevel(page)).toBe(558);
      expect(await visibleTutorialIds(page)).toEqual(['steeping-flask-tutorial-hint']);
      const state = await qaState(page);
      const fi = flaskIndex(state);
      expect(fi).toBeGreaterThanOrEqual(0);
      expect(state.cups[fi]).toEqual([]);
      expect(state.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 0, 4, 4, 4, 4]);
      await expectLayout(page, `L558 flask ${width}x${height}`);
      mkdirSync('scripts/dev/out', { recursive: true });
      await page.screenshot({
        path: `scripts/dev/out/g20-flask-L558-empty-${width}x${height}.png`,
      });
      expectNoIssues(issues);
    });
  }

  test('G20 L670 flask recurrence has no repeated tutorial', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await openQa(page, 670);
    expect(await visibleTutorialIds(page)).toEqual([]);
    const state = await qaState(page);
    expect(flaskIndex(state)).toBeGreaterThanOrEqual(0);
    await expectLayout(page, 'L670 flask recurrence');
    expectNoIssues(issues);
  });

  test('G20 partial and ready cues are derived, then restart/reshuffle stay valid', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const issues = attachIssueCollector(page);
    await openQa(page, 558, { seed: 'g20-e2e:558:0' });
    const initial = await qaState(page);
    const fi = flaskIndex(initial);
    expect(fi).toBe(5);
    expect(initial.cups[fi]).toEqual([]);
    const initialSeed = await qaSeed(page);

    await move(page, 1, 4);
    await move(page, 1, 5);
    let state = await qaState(page);
    expect(state.cups[fi]).toEqual(['milk_oolong']);
    await page.screenshot({ path: 'scripts/dev/out/g20-flask-L558-partial.png' });

    // Rapid partial source taps must not mutate or stick the input lock.
    const movesBeforeReject = await qaMoves(page);
    await clickCup(page, fi);
    await clickCup(page, 0);
    await clickCup(page, 0);
    await waitIdle(page);
    expect(await qaMoves(page)).toBe(movesBeforeReject);
    await clearSelection(page);

    for (const [from, to] of READY_PATH.slice(2)) await move(page, from, to);
    state = await qaState(page);
    expect(state.cups[fi]).toEqual(['milk_oolong', 'milk_oolong', 'milk_oolong', 'milk_oolong']);
    expect(await qaMoves(page)).toBe(READY_PATH.length);
    await page.screenshot({ path: 'scripts/dev/out/g20-flask-L558-ready.png' });

    await page.locator('#restart-btn').click();
    await waitIdle(page);
    expect(await qaMoves(page)).toBe(0);
    expect(await qaSeed(page)).toBe(initialSeed);
    expect(await qaState(page)).toEqual(initial);

    await page.locator('#reshuffle-btn').click();
    await page.waitForFunction(
      (oldSeed) => (window as unknown as { __cozyTeaQa: { seed: string } }).__cozyTeaQa.seed !== oldSeed,
      initialSeed,
      { timeout: 20_000 },
    );
    await waitIdle(page);
    const reshuffled = await qaState(page);
    expect(flaskIndex(reshuffled)).toBeGreaterThanOrEqual(0);
    expect(reshuffled.cups[flaskIndex(reshuffled)]).toEqual([]);
    expect(await qaMoves(page)).toBe(0);
    await expectLayout(page, 'L558 after reshuffle');
    expectNoIssues(issues);
  });
});
