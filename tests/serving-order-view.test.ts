/**
 * Gauntlet 14 — serving-order view contract (structural, no screenshots).
 *
 * Hint copies map serving gates softly (no alarm); serve flourish triggers
 * only on serveCompleted metadata (never view-local history); saucer
 * medallions ①/② render as vector shapes (numeral geometry, never color
 * alone, no text/emoji); served cups keep full vessel interactivity cues
 * (only the saucer changes); one ticker/lock/callback preserved by
 * construction (flourish extends animatePour).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  SERVED_CUP_HINT,
  SERVE_FLOURISH_MS,
  SERVE_ORDER_HINT,
  drawServeMedallion,
  serveVisualPlan,
  servingOrderPourHint,
} from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const O1: CupConstraint = { mode: 'normal', serveOrder: 1 };
const O2: CupConstraint = { mode: 'normal', serveOrder: 2 };
const A: TeaId = 'matcha';

/** Minimal recording stand-in for Pixi Graphics (chained shape calls). */
function fakeGraphics() {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const chained = (op: string) =>
    (...args: unknown[]) => {
      calls.push({ op, args });
      return proxy;
    };
  const proxy = {
    circle: chained('circle'),
    roundRect: chained('roundRect'),
    ellipse: chained('ellipse'),
    rect: chained('rect'),
    beginPath: chained('beginPath'),
    moveTo: chained('moveTo'),
    lineTo: chained('lineTo'),
    quadraticCurveTo: chained('quadraticCurveTo'),
    closePath: chained('closePath'),
    fill: chained('fill'),
    stroke: chained('stroke'),
    clear: chained('clear'),
  };
  return { proxy: proxy as never, calls };
}

describe('hint copies (soft, exact)', () => {
  it('serve-order and source-served map; ok/default stay silent', () => {
    expect(servingOrderPourHint('serve-order')).toBe(SERVE_ORDER_HINT);
    expect(servingOrderPourHint('source-served')).toBe(SERVED_CUP_HINT);
    expect(SERVE_ORDER_HINT).toBe('Сначала подай чашку ①');
    expect(SERVED_CUP_HINT).toBe('Эта чашка уже подана');
    expect(servingOrderPourHint('ok')).toBe('');
    expect(servingOrderPourHint('color-mismatch')).toBe('');
    expect(servingOrderPourHint('target-full')).toBe('');
  });
});

describe('serve flourish plan (metadata-only trigger)', () => {
  it('1/2 animate ~250–400ms; null/other silent', () => {
    expect(SERVE_FLOURISH_MS).toBeGreaterThanOrEqual(250);
    expect(SERVE_FLOURISH_MS).toBeLessThanOrEqual(400);
    expect(serveVisualPlan(1)).toEqual({ shouldAnimate: true, durMs: SERVE_FLOURISH_MS });
    expect(serveVisualPlan(2)).toEqual({ shouldAnimate: true, durMs: SERVE_FLOURISH_MS });
    expect(serveVisualPlan(null).shouldAnimate).toBe(false);
    expect(serveVisualPlan(undefined).shouldAnimate).toBe(false);
    expect(serveVisualPlan(0).shouldAnimate).toBe(false);
    expect(serveVisualPlan(3).shouldAnimate).toBe(false);
  });
});

describe('saucer medallions ①/② (vector shapes, distinct glyphs)', () => {
  it('order 1 vs 2 draw different geometry; served adds halo; quiet softens', () => {
    const g1 = fakeGraphics();
    drawServeMedallion(g1.proxy, 32, 124, 1, false, false);
    const g2 = fakeGraphics();
    drawServeMedallion(g2.proxy, 32, 124, 2, false, false);
    const sig = (calls: typeof g1.calls) => JSON.stringify(calls.map((c) => c.op));
    // Different glyph construction (fills for ① stem vs stroked path for ②).
    expect(sig(g1.calls)).not.toBe(sig(g2.calls));
    expect(g1.calls.some((c) => c.op === 'roundRect')).toBe(true);
    expect(g2.calls.some((c) => c.op === 'quadraticCurveTo')).toBe(true);
    // Served adds the halo circle (one extra fill vs pending).
    const g3 = fakeGraphics();
    drawServeMedallion(g3.proxy, 32, 124, 1, true, false);
    expect(g3.calls.length).toBeGreaterThan(g1.calls.length);
    // Quiet lowers alphas but keeps the same shape stream.
    const g4 = fakeGraphics();
    drawServeMedallion(g4.proxy, 32, 124, 2, false, true);
    expect(sig(g4.calls)).toBe(sig(g2.calls));
  });
});

describe('serveCompleted metadata reaches the view layer', () => {
  it('TeaSortLogic.makeMove carries serveCompleted for SERVE_1', () => {
    const logic = new TeaSortLogic([[A], [A, A, A]], [0, 0], [N, O1]);
    const mv = logic.makeMove(0, 1);
    expect(mv?.serveCompleted).toBe(1);
    expect(serveVisualPlan(mv?.serveCompleted ?? null).shouldAnimate).toBe(true);
  });

  it('ordinary pours carry null (no flourish)', () => {
    const logic = new TeaSortLogic([[A], [A, A]], [0, 0], [N, O2]);
    const mv = logic.makeMove(0, 1);
    expect(mv?.serveCompleted ?? null).toBe(null);
  });
});
