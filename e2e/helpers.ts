/**
 * G18 Playwright helpers — DEV/test only. Drives the real App through the
 * DEV-only `?qaLevel/?qaSeed` launch and the __cozyTeaQa bridge.
 */
import { expect, type Page } from '@playwright/test';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import { tutorialForConfig } from '../src/game/ui/tutorials';

export const BASE_URL = process.env.G18_BASE_URL ?? 'http://127.0.0.1:3100';

export interface QaCup {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hitPadX: number;
  hitPadY: number;
}

export interface QaState {
  cups: string[][];
  hiddenCounts: number[];
  cupConstraints: Array<Record<string, unknown>>;
  floatingIngredients: Array<string | null>;
  sinkingIngredients: Array<string | null>;
  strainer: { present: boolean; attachedCupIndex: number | null; heldTea: string | null };
  iceSlots: Array<string | null>;
  capacityObstacles: Array<string | null>;
  teaBudSlots: Array<string | null>;
  blendRecipe?: { id: string } | null;
}

export interface IssueCollector {
  consoleErrors: string[];
  pageErrors: string[];
  assetFailures: string[];
}

const EXTERNAL_NOISE = [/fonts\.googleapis\.com/i, /fonts\.gstatic\.com/i, /telegram\.org/i];
const EXTERNAL_NETWORK_NOISE =
  /Failed to load resource: net::ERR_(NAME_NOT_RESOLVED|NETWORK_CHANGED|CONNECTION_REFUSED|INTERNET_DISCONNECTED)/i;

export function attachIssueCollector(page: Page): IssueCollector {
  const issues: IssueCollector = { consoleErrors: [], pageErrors: [], assetFailures: [] };
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (EXTERNAL_NOISE.some((re) => re.test(text))) return;
    // External Google Fonts / Telegram SDK requests are optionally blocked
    // by this harness in offline CI; only those exact browser network-noise
    // signatures are allowlisted (never app/script errors).
    const loc = msg.location()?.url ?? '';
    if (EXTERNAL_NETWORK_NOISE.test(text) && !loc.startsWith(BASE_URL)) return;
    issues.consoleErrors.push(text);
  });
  page.on('pageerror', (err) => issues.pageErrors.push(err.message));
  page.on('response', (res) => {
    if (!res.url().startsWith(BASE_URL)) return;
    if (res.status() >= 400) issues.assetFailures.push(`${res.status()} ${res.url()}`);
  });
  page.on('requestfailed', (req) => {
    if (!req.url().startsWith(BASE_URL)) return;
    const failure = req.failure()?.errorText ?? 'request failed';
    if (/ERR_ABORTED/i.test(failure)) return; // navigation/HMR aborts are benign
    issues.assetFailures.push(`${failure} ${req.url()}`);
  });
  return issues;
}

export function expectNoIssues(issues: IssueCollector): void {
  expect(issues.pageErrors, `uncaught page errors:\n${issues.pageErrors.join('\n')}`).toEqual([]);
  expect(issues.consoleErrors, `console.error output:\n${issues.consoleErrors.join('\n')}`).toEqual([]);
  expect(issues.assetFailures, `local asset failures:\n${issues.assetFailures.join('\n')}`).toEqual([]);
}

export async function stubExternal(page: Page): Promise<void> {
  // Keep the release gate deterministic/offline-fast: third-party fonts and
  // Telegram SDK are optional in this build and must not stall DNS in CI.
  // Fulfil with empty content (not abort) so the browser does not emit
  // misleading net::ERR_* console noise.
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' }),
  );
  await page.route(/https:\/\/telegram\.org\//, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
  );
}

export async function openQa(
  page: Page,
  level: number,
  options: { tutorial?: boolean; seed?: string } = {},
): Promise<void> {
  const tutorial = options.tutorial ?? true;
  const seed = options.seed ?? `g18-e2e:${level}:0`;
  await stubExternal(page);
  await page.goto(
    `${BASE_URL}/?qaLevel=${level}&qaSeed=${encodeURIComponent(seed)}&qaTutorial=${tutorial ? 1 : 0}`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForFunction(
    () => (window as unknown as { __cozyTeaQa?: { isReady?: () => boolean } }).__cozyTeaQa?.isReady?.() === true,
    null,
    { timeout: 30_000 },
  );
  // Bounded font settle: external Google Fonts must never stall a release
  // gate when the network is unavailable.
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready.then(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]),
  );
  await page.waitForTimeout(80);
}

export async function qaLevel(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __cozyTeaQa: { level: number } }).__cozyTeaQa.level,
  );
}

export async function qaSeed(page: Page): Promise<string> {
  return page.evaluate(
    () => (window as unknown as { __cozyTeaQa: { seed: string } }).__cozyTeaQa.seed,
  );
}

export async function qaMoves(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __cozyTeaQa: { moves: number } }).__cozyTeaQa.moves,
  );
}

export async function qaState(page: Page): Promise<QaState> {
  return page.evaluate(
    () => (window as unknown as { __cozyTeaQa: { getState(): QaState } }).__cozyTeaQa.getState(),
  );
}

export async function qaCups(page: Page): Promise<QaCup[]> {
  return page.evaluate(
    () => (window as unknown as { __cozyTeaQa: { cupGeometry(): QaCup[] } }).__cozyTeaQa.cupGeometry(),
  );
}

export async function qaIsIdle(page: Page): Promise<boolean> {
  return page.evaluate(
    () => !(window as unknown as { __cozyTeaQa: { isAnimating(): boolean } }).__cozyTeaQa.isAnimating(),
  );
}

export async function qaIsWon(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __cozyTeaQa: { isWon: boolean } }).__cozyTeaQa.isWon,
  );
}

export async function waitIdle(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForFunction(
    () => !(window as unknown as { __cozyTeaQa: { isAnimating(): boolean } }).__cozyTeaQa.isAnimating(),
    null,
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(50);
}

export async function clickCup(page: Page, index: number): Promise<void> {
  const cups = await qaCups(page);
  const cup = cups.find((c) => c.index === index);
  if (!cup) throw new Error(`Cup ${index} not found`);
  await page.mouse.click(cup.x + cup.width / 2, cup.y + cup.height / 2);
}

export async function findLegalMove(page: Page): Promise<{ from: number; to: number }> {
  const move = await page.evaluate(
    () =>
      (
        window as unknown as {
          __cozyTeaQa: { firstLegalMove(): { from: number; to: number } | null };
        }
      ).__cozyTeaQa.firstLegalMove(),
  );
  if (!move) throw new Error('No legal move found');
  return move;
}

export async function makeMove(page: Page, move: { from: number; to: number }): Promise<void> {
  await clickCup(page, move.from);
  await clickCup(page, move.to);
  await waitIdle(page);
}

/** Tap a guaranteed background point in the canvas to clear cup selection. */
export async function clearSelection(page: Page): Promise<void> {
  const stage = await page.locator('#canvas-stage').boundingBox();
  if (!stage) throw new Error('canvas stage missing');
  await page.mouse.click(stage.x + 6, stage.y + stage.height - 6);
  await page.waitForTimeout(40);
}

export async function expectedTutorialId(level: number): Promise<string | null> {
  return tutorialForConfig(getLevelConfig(level))?.id ?? null;
}

export async function expectedTutorialBannerId(level: number): Promise<string | null> {
  return tutorialForConfig(getLevelConfig(level))?.bannerId ?? null;
}

export async function visibleTutorialIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[id$="-tutorial-hint"]')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((el) => el.id),
  );
}

export interface GeometryViolation {
  kind: string;
  detail: string;
}

export async function layoutViolations(page: Page, context: string): Promise<GeometryViolation[]> {
  return page.evaluate(
    ({ context }) => {
      const v: Array<{ kind: string; detail: string }> = [];
      const W = window.innerWidth;
      const H = window.innerHeight;
      const rect = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
      const header = document.getElementById('app-header');
      const footer = document.getElementById('app-footer');
      const stage = document.getElementById('canvas-stage');
      const hr = rect(header);
      const fr = rect(footer);
      const sr = rect(stage);
      const push = (kind: string, detail: string) => v.push({ kind, detail: `${context}: ${detail}` });
      const inside = (label: string, r: DOMRect | null) => {
        if (!r) return push('missing', `${label} missing`);
        if (r.left < -0.5 || r.top < -0.5 || r.right > W + 0.5 || r.bottom > H + 0.5) {
          push('offscreen', `${label} rect ${JSON.stringify({ l: r.left, t: r.top, r: r.right, b: r.bottom })} viewport ${W}x${H}`);
        }
        if (r.width <= 0 || r.height <= 0) push('zero-size', `${label} has zero size`);
      };
      [
        'recipe-book-btn',
        'sound-toggle-btn',
        'info-toggle-btn',
        'undo-btn',
        'restart-btn',
        'reshuffle-btn',
      ].forEach((id) => inside(id, rect(document.getElementById(id))));
      if (document.documentElement.scrollWidth > W + 1) {
        push('overflow', `document scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
      }
      if (hr && sr && hr.bottom > sr.top + 1) push('overlap', 'header overlaps canvas stage');
      if (fr && sr && sr.bottom > fr.top + 1) push('overlap', 'canvas stage overlaps footer');
      if (sr && sr.height < 300) push('layout', `canvas stage height ${sr.height} < 300`);
      const tutorial = [...document.querySelectorAll('[id$="-tutorial-hint"]')].find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (tutorial) {
        const tr = rect(tutorial);
        inside('tutorial', tr);
        if (tr && tr.height > 96) push('tutorial', `tutorial height ${tr.height} > 96`);
        if (tr && sr && tr.bottom > sr.top + 1) push('overlap', 'tutorial overlaps canvas stage');
        if (tr && hr && tr.top < hr.bottom - 1) push('overlap', 'tutorial overlaps header');
      }
      const footerButtons = ['undo-btn', 'restart-btn', 'reshuffle-btn']
        .map((id) => rect(document.getElementById(id)))
        .filter((r): r is DOMRect => r !== null);
      for (const r of footerButtons) {
        if (r.height < 44) push('touch', `footer button height ${r.height} < 44`);
      }
      const headerButtons = ['recipe-book-btn', 'sound-toggle-btn', 'info-toggle-btn'];
      for (const id of headerButtons) {
        const el = document.getElementById(id);
        const r = rect(el);
        if (!el || !r) continue;
        if (r.width < 40 || r.height < 40) push('touch', `${id} visual size ${r.width}x${r.height} < 40`);
        // Practical hit area must reach >=44 CSS px (transparent after: inset).
        const probe = document.elementFromPoint(r.left + r.width / 2 + 21, r.top + r.height / 2);
        if (!probe || probe.closest('button')?.id !== id) {
          push('touch', `${id} practical hit area < 44px (probe hit ${probe?.id || probe?.tagName || 'none'})`);
        }
      }
      const headerStyle = header ? getComputedStyle(header) : null;
      const footerStyle = footer ? getComputedStyle(footer) : null;
      if (headerStyle && parseFloat(headerStyle.paddingTop) < 8) {
        push('safe-area', `header top padding ${headerStyle.paddingTop} < 8`);
      }
      if (footerStyle && parseFloat(footerStyle.paddingBottom) < 12) {
        push('safe-area', `footer bottom padding ${footerStyle.paddingBottom} < 12`);
      }
      return v;
    },
    { context },
  );
}

export async function cupViolations(page: Page, context: string): Promise<GeometryViolation[]> {
  const cups = await qaCups(page);
  const W = await page.evaluate(() => window.innerWidth);
  const H = await page.evaluate(() => window.innerHeight);
  const violations: GeometryViolation[] = [];
  for (const cup of cups) {
    const l = cup.x - cup.hitPadX;
    const t = cup.y - cup.hitPadY;
    const r = cup.x + cup.width + cup.hitPadX;
    const b = cup.y + cup.height + cup.hitPadY;
    if (l < -0.5 || r > W + 0.5 || t < -0.5 || b > H + 0.5) {
      violations.push({
        kind: 'cup-offscreen',
        detail: `${context}: cup ${cup.index} hit bounds ${l},${t},${r},${b} outside ${W}x${H}`,
      });
    }
    if (cup.width < 44 || cup.height < 44) {
      violations.push({
        kind: 'cup-touch',
        detail: `${context}: cup ${cup.index} visual ${cup.width}x${cup.height} < 44`,
      });
    }
  }
  return violations;
}

export async function expectLayout(page: Page, context: string): Promise<void> {
  const violations = [...(await layoutViolations(page, context)), ...(await cupViolations(page, context))];
  expect(violations, violations.map((x) => `${x.kind}: ${x.detail}`).join('\n')).toEqual([]);
}
