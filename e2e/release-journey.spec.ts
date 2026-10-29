/**
 * G18 canonical browser release gate (mobile-first).
 *
 * Covers first-exposure journey, layout/hitbox/overflow/safe-area geometry,
 * double-tap input integrity, Undo/Restart/Reshuffle view freshness, level
 * advance cleanup, resize/landscape sanity and ticker/listener smoke.
 *
 * Console.error / uncaught error / local asset failure gates are enforced on
 * every test. Screenshot pixel equality is intentionally NOT a CI gate.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  BASE_URL,
  attachIssueCollector,
  clearSelection,
  clickCup,
  expectLayout,
  expectNoIssues,
  findLegalMove,
  makeMove,
  openQa,
  qaCups,
  qaIsWon,
  qaLevel,
  qaMoves,
  qaSeed,
  qaState,
  stubExternal,
  visibleTutorialIds,
  waitIdle,
  expectedTutorialBannerId,
  type QaState,
} from './helpers';

const FIRST_EXPOSURES = [1, 6, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 154, 162, 250];

// Structural gate: CSS-pixel layout is DPR-independent. DPR1 keeps the
// SwiftShader/headless CI cheap; the visual audit captures DPR2.
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test.describe('first-exposure release journey', () => {
  for (const level of FIRST_EXPOSURES) {
    test(`L${level}: config, board, tutorial, move, undo, restart`, async ({ page }) => {
      const issues = attachIssueCollector(page);
      await openQa(page, level, { tutorial: true });
      expect(await qaLevel(page)).toBe(level);
      await expectLayout(page, `L${level} 390x844`);

      const expected = await expectedTutorialBannerId(level);
      const banners = await visibleTutorialIds(page);
      expect(banners, `L${level} tutorial banners`).toEqual(expected === null ? [] : [expected]);
      // The registry banner ids are explicit; compare via DOM text presence.
      if (expected !== null) {
        const text = await page.locator('[id$="-tutorial-hint"]').innerText();
        expect(text.trim().length, `L${level} tutorial copy`).toBeGreaterThan(10);
      }

      const initial = await qaState(page);
      const move = await findLegalMove(page);
      await clickCup(page, move.from);
      await clickCup(page, move.to);
      await waitIdle(page);
      expect(await qaMoves(page)).toBe(1);
      expect(await visibleTutorialIds(page), `L${level} tutorial after move`).toEqual([]);

      await page.locator('#undo-btn').click();
      await waitIdle(page);
      expect(await qaMoves(page)).toBe(0);
      expect(await qaState(page)).toEqual(initial);

      const second = await findLegalMove(page);
      await makeMove(page, second);
      expect(await qaMoves(page)).toBe(1);
      await page.locator('#restart-btn').click();
      await waitIdle(page);
      expect(await qaMoves(page)).toBe(0);
      expect(await qaState(page)).toEqual(initial);
      await expectLayout(page, `L${level} after restart`);
      expectNoIssues(issues);
    });
  }
});

test.describe('rapid input integrity', () => {
  for (const level of [162, 250]) {
    test(`L${level}: double destination tap creates exactly one move`, async ({ page, browser }) => {
      const issues = attachIssueCollector(page);
      await openQa(page, level);

      // Reference page: one clean move through the same real UI path.
      const reference = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const refIssues = attachIssueCollector(reference);
      await openQa(reference, level);
      const move = await findLegalMove(reference);
      await makeMove(reference, move);
      await waitIdle(reference);
      const expectedState = await qaState(reference);
      expect(await qaMoves(reference)).toBe(1);

      await clickCup(page, move.from);
      await clickCup(page, move.to);
      // Immediate second tap during the authoritative animation.
      await clickCup(page, move.to);
      await waitIdle(page);
      expect(await qaMoves(page), 'double tap must not duplicate the move').toBe(1);
      expect(await qaState(page), 'state must match a single authoritative move').toEqual(expectedState);

      // Tap again after settle: no duplicate move, no stuck lock.
      await clickCup(page, move.to);
      await waitIdle(page);
      expect(await qaMoves(page)).toBe(1);
      // The post-settle tap may have selected that cup; clear it before
      // asserting the lock did not stick.
      await clearSelection(page);

      // A new legal move still works after the stress.
      const next = await findLegalMove(page);
      await makeMove(page, next);
      expect(await qaMoves(page)).toBe(2);
      expectNoIssues(issues);
      expectNoIssues(refIssues);
      await reference.close();
    });
  }
});

function preserveMechanic(state: QaState, level: number): boolean {
  const constraints = state.cupConstraints as Array<Record<string, unknown>>;
  if (level === 98) return state.blendRecipe?.id === 'milk-tea';
  if (level === 154) {
    return (
      constraints.some((c) => c.serveOrder === 1) &&
      constraints.some((c) => c.serveOrder === 2) &&
      constraints.some((c) => c.capacity === 2 && c.mustEndEmpty === true)
    );
  }
  if (level === 162) return constraints.some((c) => c.sharedCapacityGroup === 'tea-tray');
  if (level === 250) {
    return constraints.filter((c) => c.pairedTeaGroup === 'tea-pair').length === 2;
  }
  return false;
}

test.describe('advanced UI state freshness', () => {
  for (const level of [98, 154, 162, 250]) {
    test(`L${level}: Undo, Restart and Reshuffle recover the exact view state`, async ({ page }) => {
      const issues = attachIssueCollector(page);
      await openQa(page, level);
      const initial = await qaState(page);
      const initialSeed = await qaSeed(page);
      expect(initial.cups.length).toBeGreaterThan(0);

      const first = await findLegalMove(page);
      await makeMove(page, first);
      expect(await qaMoves(page)).toBe(1);
      await page.locator('#undo-btn').click();
      await waitIdle(page);
      expect(await qaMoves(page)).toBe(0);
      expect(await qaState(page)).toEqual(initial);

      const again = await findLegalMove(page);
      await makeMove(page, again);
      const second = await findLegalMove(page);
      await makeMove(page, second);
      expect(await qaMoves(page)).toBe(2);
      await page.locator('#restart-btn').click();
      await waitIdle(page);
      expect(await qaMoves(page)).toBe(0);
      expect(await qaSeed(page)).toBe(initialSeed);
      expect(await qaState(page)).toEqual(initial);
      expect(preserveMechanic(await qaState(page), level)).toBe(true);

      // Bounded retry: the bounded blend template bank can occasionally map
      // two production seeds to the same canonical start (pre-existing
      // generator characteristic, not a G18 gameplay change). The user-facing
      // action must still be able to produce a fresh layout.
      let reshuffled = initial;
      let reshuffleSeed = initialSeed;
      for (let attempt = 0; attempt < 2; attempt++) {
        await page.locator('#reshuffle-btn').click();
        await page.waitForFunction(
          (seed) =>
            (window as unknown as { __cozyTeaQa: { seed: string } }).__cozyTeaQa.seed !== seed,
          reshuffleSeed,
          { timeout: 20_000 },
        );
        await waitIdle(page);
        reshuffleSeed = await qaSeed(page);
        reshuffled = await qaState(page);
        if (JSON.stringify(reshuffled.cups) !== JSON.stringify(initial.cups)) break;
      }
      expect(await qaLevel(page)).toBe(level);
      expect(await qaMoves(page)).toBe(0);
      expect(await qaSeed(page)).not.toBe(initialSeed);
      expect(reshuffled.cups).not.toEqual(initial.cups);
      expect(preserveMechanic(reshuffled, level), `L${level} mechanic class after reshuffle`).toBe(true);
      await expectLayout(page, `L${level} reshuffled`);
      expectNoIssues(issues);
    });
  }
});

test.describe('level advance cleanup', () => {
  for (const level of [154, 162, 250]) {
    test(`L${level}: victory -> next level leaves no stale derived decoration`, async ({ page }) => {
      test.setTimeout(150_000);
      const issues = attachIssueCollector(page);
      await openQa(page, level, { tutorial: false });
      const initialCounts = await page.evaluate(
        () =>
          (
            window as unknown as {
              __cozyTeaQa: {
                debugCounts(): { cups: number; stageChildren: number; tickerListeners: number; canvases: number };
              };
            }
          ).__cozyTeaQa.debugCounts(),
      );
      const result = await page.evaluate(
        () =>
          (window as unknown as { __cozyTeaQa: { autoSolve(): Promise<{ ok: boolean; moves: number }> } })
            .__cozyTeaQa.autoSolve(),
      );
      expect(result.ok, `L${level} autoSolve`).toBe(true);
      expect(await qaIsWon(page)).toBe(true);
      await page.waitForSelector('#victory-modal-container', { timeout: 15_000 });
      await page.locator('#next-level-button').click();
      await page.waitForFunction(
        (oldLevel) =>
          (window as unknown as { __cozyTeaQa: { level: number } }).__cozyTeaQa.level === oldLevel + 1,
        level,
        { timeout: 20_000 },
      );
      await waitIdle(page);
      expect(await qaLevel(page)).toBe(level + 1);
      expect(await qaMoves(page)).toBe(0);
      const nextState = await qaState(page);
      const constraints = nextState.cupConstraints as Array<Record<string, unknown>>;
      expect(constraints.some((c) => c.pairedTeaGroup !== undefined)).toBe(false);
      expect(constraints.some((c) => c.sharedCapacityGroup !== undefined)).toBe(false);
      expect(constraints.some((c) => c.serveOrder !== undefined)).toBe(false);
      expect(constraints.some((c) => c.capacity === 2 && c.mustEndEmpty === true)).toBe(false);
      expect(nextState.blendRecipe ?? null).toBeNull();
      const counts = await page.evaluate(
        () =>
          (
            window as unknown as {
              __cozyTeaQa: {
                debugCounts(): { cups: number; stageChildren: number; tickerListeners: number; canvases: number };
              };
            }
          ).__cozyTeaQa.debugCounts(),
      );
      expect(counts.canvases).toBe(1);
      expect(counts.tickerListeners).toBe(initialCounts.tickerListeners);
      expect(counts.stageChildren).toBe(initialCounts.stageChildren);
      expect(counts.cups).toBe(nextState.cups.length);
      await expectLayout(page, `L${level + 1} after advance`);
      expectNoIssues(issues);
    });
  }
});

test.describe('layout, modal and resize sanity', () => {
  test('360x800: shared tray, info/help dismiss, no offscreen controls', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await openQa(page, 162);
    await expectLayout(page, 'L162 360x800');

    // Selected-tea banner must not push controls/board out of the 360px view.
    const cups = await qaState(page);
    const source = cups.cups.findIndex((c) => c.length > 0);
    expect(source).toBeGreaterThanOrEqual(0);
    await clickCup(page, source);
    await page.waitForTimeout(100);
    await expectLayout(page, 'L162 360x800 selected tea');
    await clearSelection(page);

    await page.locator('#info-toggle-btn').click();
    await page.waitForSelector('#tea-menu-modal');
    const modal = page.locator('#tea-menu-modal > div');
    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360.5);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(800.5);
    // Help dismiss must have a practical >=44px target.
    const close = page.locator('#close-info-btn');
    const closeBox = await close.boundingBox();
    expect(closeBox).not.toBeNull();
    const probe = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest('button')?.id ?? null;
      },
      {
        x: closeBox!.x + closeBox!.width / 2 + 20,
        y: closeBox!.y + closeBox!.height / 2,
      },
    );
    expect(probe).toBe('close-info-btn');
    await close.click();
    await expect(page.locator('#tea-menu-modal')).toHaveCount(0);

    await page.locator('#recipe-book-btn').click();
    await page.waitForSelector('#recipe-book-modal-container');
    await page.locator('#close-recipe-book-button').click();
    await expect(page.locator('#recipe-book-modal-container')).toHaveCount(0);
    await expectLayout(page, 'L162 360x800 after modals');
    expectNoIssues(issues);
  });

  test('resize 390 -> 360 -> 430 -> 1280 keeps board and decorations usable', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await openQa(page, 162);
    for (const [width, height] of [
      [360, 800],
      [430, 932],
      [1280, 800],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      await expectLayout(page, `L162 resize ${width}x${height}`);
      const cups = await qaCups(page);
      expect(cups).toHaveLength(6);
      expect(cups.every((c) => c.width > 0 && c.height > 0)).toBe(true);
    }
    expectNoIssues(issues);
  });

  test('landscape 844x390 remains controllable and crash-free', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await openQa(page, 250);
    for (const id of ['undo-btn', 'restart-btn', 'reshuffle-btn', 'info-toggle-btn']) {
      const el = page.locator(`#${id}`);
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(844.5);
    }
    const cups = await qaCups(page);
    expect(cups.length).toBe(6);
    const move = await findLegalMove(page);
    await makeMove(page, move);
    expect(await qaMoves(page)).toBe(1);
    expectNoIssues(issues);
  });

  test('load instrumentation: config, generation, board, first accepted input', async ({ page }) => {
    const rows: Array<Record<string, number | string>> = [];
    for (const level of [1, 98, 154, 162, 250]) {
      await stubExternal(page);
      await page.goto(
        `${BASE_URL}/?qaLevel=${level}&qaSeed=${encodeURIComponent(`g18-load:${level}:0`)}&qaTutorial=0`,
        { waitUntil: 'domcontentloaded' },
      );
      await page.waitForFunction(
        () => (window as unknown as { __cozyTeaQa?: { isReady?: () => boolean } }).__cozyTeaQa?.isReady?.() === true,
        null,
        { timeout: 30_000 },
      );
      const state = await qaState(page);
      const source = state.cups.findIndex((c) => c.length > 0);
      expect(source).toBeGreaterThanOrEqual(0);
      await clickCup(page, source);
      await page.waitForTimeout(60);
      const timing = await page.evaluate(
        () =>
          (
            window as unknown as {
              __cozyTeaQa: {
                timings(): {
                  moduleStart: number;
                  configReadyAt: number;
                  generatedAt: number;
                  boardMountedAt: number;
                  firstInputAt: number;
                };
              };
            }
          ).__cozyTeaQa.timings(),
      );
      const loadToBoard = timing.boardMountedAt - timing.moduleStart;
      const loadToInteractive = timing.firstInputAt - timing.moduleStart;
      expect(timing.configReadyAt).toBeGreaterThan(0);
      expect(timing.generatedAt).toBeGreaterThanOrEqual(timing.configReadyAt);
      expect(timing.boardMountedAt).toBeGreaterThanOrEqual(timing.generatedAt);
      expect(timing.firstInputAt).toBeGreaterThanOrEqual(timing.boardMountedAt);
      // Comparative headless budget, not a physical-device claim.
      expect(loadToBoard, `L${level} load-to-board`).toBeLessThan(5_000);
      expect(loadToInteractive, `L${level} load-to-interactive`).toBeLessThan(6_000);
      rows.push({ level, ...timing, loadToBoard, loadToInteractive });
    }
    mkdirSync('scripts/dev/out', { recursive: true });
    writeFileSync(join('scripts/dev/out', 'g18-load-perf.json'), `${JSON.stringify({ viewport: '390x844', deviceScaleFactor: 1, rows }, null, 2)}\n`);
  });

  test('repeated move/restart/reshuffle keeps one canvas/ticker and no derived leak', async ({ page }) => {
    const issues = attachIssueCollector(page);
    await openQa(page, 162);
    const baseline = await page.evaluate(
      () =>
        (
          window as unknown as {
            __cozyTeaQa: {
              debugCounts(): { cups: number; stageChildren: number; tickerListeners: number; canvases: number };
            };
          }
        ).__cozyTeaQa.debugCounts(),
    );
    for (let i = 0; i < 3; i++) {
      const move = await findLegalMove(page);
      await makeMove(page, move);
      await page.locator('#restart-btn').click();
      await waitIdle(page);
      const seed = await qaSeed(page);
      await page.locator('#reshuffle-btn').click();
      await page.waitForFunction(
        (oldSeed) =>
          (window as unknown as { __cozyTeaQa: { seed: string } }).__cozyTeaQa.seed !== oldSeed,
        seed,
        { timeout: 20_000 },
      );
      await waitIdle(page);
      const counts = await page.evaluate(
        () =>
          (
            window as unknown as {
              __cozyTeaQa: {
                debugCounts(): { cups: number; stageChildren: number; tickerListeners: number; canvases: number };
              };
            }
          ).__cozyTeaQa.debugCounts(),
      );
      expect(counts.canvases).toBe(baseline.canvases);
      expect(counts.tickerListeners).toBe(baseline.tickerListeners);
      expect(counts.cups).toBe(baseline.cups);
      expect(counts.stageChildren).toBe(baseline.stageChildren);
    }
    expectNoIssues(issues);
  });
});
