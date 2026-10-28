/**
 * G18 tutorial mobile-fit metrics (DEV evidence). 360x800, real app,
 * production first-exposure levels. Emits JSON + a compact markdown table.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.G18_BASE_URL ?? 'http://127.0.0.1:3100';
const OUT = 'scripts/dev/out';
mkdirSync(OUT, { recursive: true });
const LEVELS = [6, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 154, 162, 250];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (r) =>
  r.fulfill({ status: 200, contentType: 'text/css', body: '' }),
);
await page.route(/https:\/\/telegram\.org\//, (r) =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }),
);

const rows = [];
for (const level of LEVELS) {
  await page.goto(`${BASE}/?qaLevel=${level}&qaSeed=${encodeURIComponent(`g18-metrics:${level}:0`)}&qaTutorial=1`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.__cozyTeaQa?.isReady?.(), null, { timeout: 30000 });
  await page.evaluate(() =>
    Promise.race([
      document.fonts.ready.then(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]),
  );
  await page.waitForTimeout(80);
  const metric = await page.evaluate(() => {
    const banner = [...document.querySelectorAll('[id$="-tutorial-hint"]')].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!banner) return null;
    const r = banner.getBoundingClientRect();
    const span = banner.querySelector('span');
    let lines = 0;
    if (span && span.firstChild) {
      const range = document.createRange();
      range.selectNodeContents(span);
      lines = new Set([...range.getClientRects()].map((x) => Math.round(x.top))).size;
    }
    const stage = document.getElementById('canvas-stage')?.getBoundingClientRect();
    return {
      bannerId: banner.id,
      text: banner.textContent?.trim() ?? '',
      height: Math.round(r.height * 10) / 10,
      width: Math.round(r.width * 10) / 10,
      lines,
      canvasHeight: stage ? Math.round(stage.height) : 0,
      fits: r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.height <= 96,
    };
  });
  rows.push({ level, ...metric });
}

await browser.close();
writeFileSync(join(OUT, 'g18-tutorial-metrics.json'), `${JSON.stringify(rows, null, 2)}\n`);
const md = [
  '| level | banner | lines | height px | canvas px | fits 360x800 |',
  '|---:|---|---:|---:|---:|---|',
  ...rows.map(
    (r) =>
      `| ${r.level} | ${r.bannerId ?? '—'} | ${r.lines ?? '—'} | ${r.height ?? '—'} | ${r.canvasHeight ?? '—'} | ${r.fits ? 'yes' : 'NO'} |`,
  ),
];
writeFileSync(join(OUT, 'g18-tutorial-metrics.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
