/**
 * G18 full visual audit (DEV / human-review evidence, NOT the CI gate).
 *
 * Captures the mechanic matrix at 360x800, 390x844, 430x932 and desktop
 * 1280x800 plus first-exposure tutorial states. Structural layout/console/
 * asset assertions run on every capture; no pixel-equality assertions.
 *
 * Run: bun run test:visual
 * Output: scripts/dev/out/g18-screens/*.png + manifest.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  attachIssueCollector,
  expectLayout,
  expectNoIssues,
  findLegalMove,
  makeMove,
  openQa,
  qaState,
  visibleTutorialIds,
  expectedTutorialBannerId,
} from './helpers';

const OUT = 'scripts/dev/out/g18-screens';
mkdirSync(OUT, { recursive: true });

const MECHANICS: Array<{ name: string; level: number; cues: string[] }> = [
  { name: 'base', level: 1, cues: ['clean board'] },
  { name: 'mystery', level: 3, cues: ['mystery notice', 'foam-hidden bottom layer'] },
  { name: 'teapot', level: 6, cues: ['teapot silhouette'] },
  { name: 'targets', level: 10, cues: ['target medallions'] },
  { name: 'sink', level: 18, cues: ['guest cup saucer/handle'] },
  { name: 'tasting', level: 26, cues: ['shallow gold-rim tasting bowl'] },
  { name: 'lemon', level: 34, cues: ['lemon slice on surface'] },
  { name: 'strainer', level: 42, cues: ['strainer stand'] },
  { name: 'honey', level: 50, cues: ['honey blob at bottom'] },
  { name: 'lemon-honey', level: 58, cues: ['lemon slice', 'honey blob'] },
  { name: 'frozen', level: 66, cues: ['ice slab'] },
  { name: 'thermos', level: 74, cues: ['tall thermos silhouette'] },
  { name: 'cinnamon', level: 82, cues: ['cinnamon stick'] },
  { name: 'tea-bloom', level: 90, cues: ['tea bud at bottom'] },
  { name: 'blend', level: 98, cues: ['black tea + milk palette'] },
  { name: 'serving-order', level: 106, cues: ['numbered serving saucers'] },
  { name: 'order-tasting', level: 154, cues: ['numbered saucers', 'tasting bowl'] },
  { name: 'shared-tray', level: 162, cues: ['one continuous tray', 'six group markers'] },
  { name: 'tea-pair', level: 250, cues: ['two paired rose bowls', 'mirrored floral halves'] },
];

const TUTORIAL_LEVELS = [6, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 154, 162, 250];
const MANIFEST: Array<Record<string, unknown>> = [];

test.describe.configure({ mode: 'serial', timeout: 600_000 });
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

async function capture(
  page: Parameters<typeof openQa>[0],
  level: number,
  tutorial: boolean,
  viewport: string,
  name: string,
  cues: string[],
): Promise<void> {
  const issues = attachIssueCollector(page);
  await openQa(page, level, { tutorial });
  await expectLayout(page, `${name} ${viewport}`);
  const expectedTutorial = await expectedTutorialBannerId(level);
  if (tutorial && expectedTutorial) {
    expect(await visibleTutorialIds(page)).toEqual([expectedTutorial]);
  }
  const file = `${viewport}-${name}-L${level}${tutorial ? '-tutorial' : ''}.png`;
  await page.screenshot({ path: join(OUT, file) });
  MANIFEST.push({
    level,
    seed: `g18-e2e:${level}:0`,
    viewport,
    mechanic: name,
    tutorial: tutorial && expectedTutorial ? expectedTutorial : null,
    expectedCues: cues,
    file,
  });
  expectNoIssues(issues);
}

test('360x800 full mechanic matrix', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const m of MECHANICS) {
    await capture(page, m.level, false, '360x800', m.name, m.cues);
  }
  for (const level of [10, 58, 154, 162, 250]) {
    await capture(page, level, true, '360x800', `tutorial-${level}`, ['tutorial copy fits mobile']);
  }
});

test('390x844 full mechanic matrix + first-exposure tutorials', async ({ page }) => {
  for (const m of MECHANICS) {
    await capture(page, m.level, false, '390x844', m.name, m.cues);
  }
  for (const level of TUTORIAL_LEVELS) {
    await capture(page, level, true, '390x844', `tutorial-${level}`, ['tutorial copy fits mobile']);
  }
});

test('430x932 mobile matrix', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  for (const m of MECHANICS) {
    await capture(page, m.level, false, '430x932', m.name, m.cues);
  }
});

test('1280x800 desktop sanity set', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  for (const m of MECHANICS.filter((x) => ['base', 'order-tasting', 'shared-tray', 'tea-pair'].includes(x.name))) {
    await capture(page, m.level, false, '1280x800', m.name, m.cues);
  }
});

test('shared tray partial occupancy updates the ONE six-marker row', async ({ page }) => {
  const issues = attachIssueCollector(page);
  await openQa(page, 162, { tutorial: false });
  const before = await qaState(page);
  const trayMembers = before.cupConstraints
    .map((c, i) => (c.sharedCapacityGroup === 'tea-tray' ? i : -1))
    .filter((i) => i >= 0);
  const beforeOccupancy = trayMembers.reduce((n, i) => n + (before.cups[i]?.length ?? 0), 0);
  expect(beforeOccupancy).toBe(6);
  const move = await findLegalMove(page);
  await makeMove(page, move);
  const after = await qaState(page);
  const afterOccupancy = trayMembers.reduce((n, i) => n + (after.cups[i]?.length ?? 0), 0);
  expect(afterOccupancy).toBeLessThan(beforeOccupancy);
  const file = '390x844-shared-tray-partial.png';
  await page.screenshot({ path: join(OUT, file) });
  MANIFEST.push({
    level: 162,
    seed: 'g18-e2e:162:0',
    viewport: '390x844',
    mechanic: 'shared-tray-partial',
    tutorial: null,
    expectedCues: [`occupancy ${afterOccupancy}/6`, 'one continuous tray', 'six markers'],
    file,
  });
  await expectLayout(page, 'shared tray partial');
  expectNoIssues(issues);
});

test.afterAll(async () => {
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(MANIFEST, null, 2)}\n`);
});
