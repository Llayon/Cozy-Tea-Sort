/**
 * Authoritative Pixi.js v8 view (moved from the monolith, behavior preserved).
 *
 * Ownership: `TeaSortLogic` = puzzle truth, `TeaSortView` = rendering/input,
 * React = progression/meta UI. Pixi never decides rewards or levels.
 *
 * Lifecycle guarantees:
 * - one Pixi Application / one ticker / one ResizeObserver per view;
 * - `resetLevel()` reuses the view (no Pixi re-init per level);
 * - `setupInteractivity()` binds exactly once;
 * - old cup views are detached + destroyed on level setup (no duplicate
 *   pointer handlers, no duplicate canvases).
 */

import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { CupSkinId, TEA_TYPES, TeaId } from '../types';
import { Cup, TeaSortLogic } from '../logic/teaSortLogic';
import { audioSynth } from '../audio/audioSynth';
import { telegram } from '../telegram/telegramHaptics';
import { POUR_ANIMATION, POUR_DURATION_SEC } from './animation';

export interface ViewCallbacks {
  onMoveComplete?: () => void;
  /** The completed level number is passed explicitly — never a React closure. */
  onWin?: (completedLevel: number) => void;
  onDeadlock?: () => void;
  onSelectCup?: (cupIndex: number | null) => void;
  onInvalidMove?: (reason: string) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  maxAlpha?: number;
  scale: number;
  life: number;
  maxLife: number;
  color: number;
  type: 'steam' | 'confetti' | 'sparkle';
  rotation?: number;
  vRot?: number;
}

/**
 * Why the `_cancelResize` guard exists:
 * Some Pixi v8 plugin builds keep an internal `_cancelResize` teardown hook
 * for `resizeTo`-based auto-resize. During init/resize/destroy races the
 * plugin path could observe an undefined hook and throw, breaking canvas
 * setup on low-end Telegram webviews. Current Pixi v8 typings do not expose
 * it, so we keep ONE defensive noop guard (instead of scattered casts) and
 * otherwise use only public APIs (`resizeTo`, `app.resize()`, `destroy()`).
 */
function ensureLegacyResizeGuard(app: Application): void {
  const anyApp = app as unknown as { _cancelResize?: unknown };
  if (typeof anyApp._cancelResize !== 'function') {
    anyApp._cancelResize = () => {};
  }
}

export class CupView {
  index: number;
  container: Container;
  shadowGraphics: Graphics;
  cupBodyContainer: Container;
  liquidContainer: Container;
  liquidGraphics: Graphics;
  liquidMask: Graphics;
  glassOverlay: Graphics;
  glowGraphics: Graphics;

  homeX = 0;
  homeY = 0;
  targetX = 0;
  targetY = 0;
  targetRotation = 0;
  targetLift = 0;
  currentLift = 0;

  isLifted = false;
  shakeTime = 0;

  drainAmount = 0;
  fillAmount = 0;
  drainingLayer: TeaId | null = null;
  fillingLayer: TeaId | null = null;
  drainingCount = 0;
  fillingCount = 0;

  readonly width = 64;
  readonly height = 142;
  readonly cornerRadius = 18;

  skinId: CupSkinId = 'glass';
  lastCup: Cup | null = null;
  scale = 1;

  get visualWidth(): number {
    return this.width * this.scale;
  }

  get visualHeight(): number {
    return this.height * this.scale;
  }

  setScale(scale: number) {
    this.scale = scale;
    this.container.scale.set(scale);
  }

  constructor(index: number) {
    this.index = index;
    this.container = new Container();

    this.shadowGraphics = new Graphics();
    this.container.addChild(this.shadowGraphics);

    this.cupBodyContainer = new Container();
    this.container.addChild(this.cupBodyContainer);

    this.glowGraphics = new Graphics();
    this.cupBodyContainer.addChild(this.glowGraphics);

    this.liquidContainer = new Container();
    this.liquidGraphics = new Graphics();
    this.liquidMask = new Graphics();
    this.liquidContainer.addChild(this.liquidGraphics);
    this.cupBodyContainer.addChild(this.liquidMask);
    this.liquidContainer.mask = this.liquidMask;
    this.cupBodyContainer.addChild(this.liquidContainer);

    this.glassOverlay = new Graphics();
    this.cupBodyContainer.addChild(this.glassOverlay);

    this.cupBodyContainer.pivot.set(this.width / 2, 10);

    this.drawCupFrame();
    this.drawShadow();
  }

  setSkin(skinId: CupSkinId) {
    this.skinId = skinId;
    this.drawCupFrame();
    if (this.lastCup) {
      this.renderLiquid(this.lastCup);
    }
  }

  setHomePosition(x: number, y: number) {
    this.homeX = x;
    this.homeY = y;
    this.targetX = x;
    this.targetY = y;
    this.container.position.set(x, y);
  }

  drawShadow() {
    this.shadowGraphics.clear();
    this.shadowGraphics
      .ellipse(this.width / 2, this.height + 6, this.width / 2 + 6, 9)
      .fill({ color: 0x120c0a, alpha: 0.35 });
  }

  drawCupFrame() {
    const w = this.width;
    const h = this.height;
    const r = this.cornerRadius;

    this.liquidMask.clear();
    this.liquidMask.roundRect(2, 4, w - 4, h - 6, r).fill({ color: 0xffffff });

    this.glassOverlay.clear();

    if (this.skinId === 'ceramic') {
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0x5a3d2b, alpha: 0.22 });

      this.glassOverlay.roundRect(4, h - 11, w - 8, 9, 3).fill({ color: 0x3d271a, alpha: 0.45 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 3.2, color: 0xc49a75, alpha: 0.95 });

      this.glassOverlay.roundRect(-2, 1, w + 4, 7, 3.5).fill({ color: 0xd8ab85, alpha: 0.9 });
      this.glassOverlay.ellipse(w / 2, 4.5, w / 2, 3).stroke({ width: 1.8, color: 0x7a543a, alpha: 0.9 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 28);
      this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
      this.glassOverlay.stroke({ width: 5.5, color: 0x7a543a, alpha: 0.92 });
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 33);
      this.glassOverlay.bezierCurveTo(w + 13, 39, w + 13, 86, w - 1, 93);
      this.glassOverlay.stroke({ width: 2, color: 0xc49a75, alpha: 0.7 });

      this.glassOverlay.roundRect(6, 14, 3.5, h - 38, 2).fill({ color: 0xffe8d6, alpha: 0.2 });
    } else if (this.skinId === 'porcelain') {
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0xfffaea, alpha: 0.24 });

      this.glassOverlay.roundRect(4, h - 10, w - 8, 8, 3).fill({ color: 0xfffaea, alpha: 0.5 });
      this.glassOverlay.roundRect(6, h - 5, w - 12, 3, 1.5).fill({ color: 0xd4af37, alpha: 0.85 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 2.8, color: 0xffffff, alpha: 0.9 });

      this.glassOverlay.roundRect(-2, 1, w + 4, 6.5, 3).fill({ color: 0xd4af37, alpha: 0.95 });
      this.glassOverlay.ellipse(w / 2, 4, w / 2, 2.8).stroke({ width: 2, color: 0xffe680, alpha: 0.95 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 26);
      this.glassOverlay.bezierCurveTo(w + 24, 33, w + 24, 92, w - 1, 100);
      this.glassOverlay.stroke({ width: 4.8, color: 0xd4af37, alpha: 0.95 });
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 32);
      this.glassOverlay.bezierCurveTo(w + 14, 38, w + 14, 86, w - 1, 94);
      this.glassOverlay.stroke({ width: 1.8, color: 0xffe680, alpha: 0.8 });

      this.glassOverlay.roundRect(5, 12, 4, h - 34, 2).fill({ color: 0xffffff, alpha: 0.45 });
      this.glassOverlay.roundRect(12, 16, 2, h - 46, 1).fill({ color: 0xffffff, alpha: 0.3 });
    } else {
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0xffffff, alpha: 0.12 });

      this.glassOverlay.roundRect(4, h - 10, w - 8, 8, 3).fill({ color: 0xffffff, alpha: 0.32 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 2.8, color: 0xffffff, alpha: 0.82 });

      this.glassOverlay.roundRect(-2, 1, w + 4, 6, 3).fill({ color: 0xffffff, alpha: 0.55 });
      this.glassOverlay.ellipse(w / 2, 4, w / 2, 3).stroke({ width: 1.8, color: 0xffffff, alpha: 0.8 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 28);
      this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
      this.glassOverlay.stroke({ width: 5, color: 0xffffff, alpha: 0.75 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 34);
      this.glassOverlay.bezierCurveTo(w + 14, 40, w + 14, 85, w - 1, 92);
      this.glassOverlay.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

      this.glassOverlay.roundRect(5, 12, 4.5, h - 34, 2.5).fill({ color: 0xffffff, alpha: 0.35 });
      this.glassOverlay.roundRect(12, 16, 2.5, h - 46, 1.2).fill({ color: 0xffffff, alpha: 0.22 });
      this.glassOverlay.roundRect(w - 9, 14, 3, h - 38, 1.5).fill({ color: 0xffffff, alpha: 0.28 });
    }
  }

  renderLiquid(cup: Cup) {
    this.lastCup = cup;
    const g = this.liquidGraphics;
    g.clear();

    const w = this.width;
    const h = this.height;
    const bottomY = h - 6;
    const layerH = 29;

    const layers = [...cup.layers];

    if (this.drainingCount > 0 && this.drainAmount > 0) {
      const fullLayers = layers.length;
      const effectiveLayers = fullLayers - this.drainingCount * this.drainAmount;

      for (let i = 0; i < layers.length; i++) {
        const layerId = layers[i] as TeaId;
        const tea = TEA_TYPES[layerId];
        const layerBottom = bottomY - i * layerH;
        let currentH = layerH;

        if (i >= fullLayers - this.drainingCount) {
          const layerOffset = i - (fullLayers - this.drainingCount);
          const ratio = Math.max(
            0,
            Math.min(1, effectiveLayers - (fullLayers - this.drainingCount - layerOffset)),
          );
          currentH = layerH * ratio;
        }

        if (currentH > 0.5) {
          const y = layerBottom - currentH;
          if (cup.isLayerHidden(i)) {
            g.rect(0, y, w, currentH).fill({ color: 0x3d3028 });
            g.rect(2, y + 1, w - 4, Math.max(1, currentH - 2)).fill({ color: 0x5e4b3e, alpha: 0.9 });
          } else {
            g.rect(0, y, w, currentH).fill({ color: tea.colorNum });
            g.rect(0, layerBottom - 1.5, w, 1.5).fill({ color: 0x000000, alpha: 0.12 });
          }
        }
      }

      const topY = bottomY - effectiveLayers * layerH;
      if (effectiveLayers > 0.1) {
        g.ellipse(w / 2, topY, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.28 });
      }
      return;
    }

    if (this.fillingCount > 0 && this.fillAmount > 0 && this.fillingLayer) {
      const tea = TEA_TYPES[this.fillingLayer];
      for (let i = 0; i < layers.length; i++) {
        const layerId = layers[i] as TeaId;
        const t = TEA_TYPES[layerId];
        const y = bottomY - (i + 1) * layerH;

        if (cup.isLayerHidden(i)) {
          g.rect(0, y, w, layerH).fill({ color: 0x3d3028 });
          g.rect(2, y + 2, w - 4, layerH - 4).fill({ color: 0x5e4b3e, alpha: 0.9 });
        } else {
          g.rect(0, y, w, layerH).fill({ color: t.colorNum });
          g.rect(0, bottomY - i * layerH - 1.5, w, 1.5).fill({ color: 0x000000, alpha: 0.12 });
        }
      }

      const baseCount = layers.length;
      const extraHeight = this.fillingCount * layerH * this.fillAmount;
      const y = bottomY - baseCount * layerH - extraHeight;

      g.rect(0, y, w, extraHeight).fill({ color: tea.colorNum });
      g.ellipse(w / 2, y, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.35 });
      return;
    }

    for (let i = 0; i < layers.length; i++) {
      const layerId = layers[i] as TeaId;
      const tea = TEA_TYPES[layerId];
      const y = bottomY - (i + 1) * layerH;

      if (cup.isLayerHidden(i)) {
        g.rect(0, y, w, layerH).fill({ color: 0x3d3028 });
        g.rect(2, y + 2, w - 4, layerH - 4).fill({ color: 0x5e4b3e, alpha: 0.9 });

        const cx = w / 2;
        const cy = y + layerH / 2;
        g.circle(cx, cy, 7.5).fill({ color: 0x221a16, alpha: 0.85 });
        g.circle(cx, cy, 7.5).stroke({ width: 1, color: 0xb59e88, alpha: 0.6 });
        g.rect(cx - 1, cy - 4.5, 2, 4.5).fill({ color: 0xf3ead8 });
        g.rect(cx - 1, cy + 2, 2, 2).fill({ color: 0xf3ead8 });
      } else {
        g.rect(0, y, w, layerH).fill({ color: tea.colorNum });
        g.rect(4, y + 2, 4, layerH - 4).fill({ color: 0xffffff, alpha: 0.2 });
      }

      if (i > 0) {
        g.rect(0, bottomY - i * layerH - 1, w, 1.5).fill({ color: 0x000000, alpha: 0.14 });
        g.rect(0, bottomY - i * layerH + 0.5, w, 1).fill({ color: 0xffffff, alpha: 0.12 });
      }

      if (i === layers.length - 1) {
        g.ellipse(w / 2, y, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.35 });
      }
    }
  }

  setSelection(selected: boolean) {
    this.isLifted = selected;
    this.targetLift = selected ? -24 : 0;

    this.glowGraphics.clear();
    if (selected) {
      this.glowGraphics
        .roundRect(-6, -2, this.width + 12, this.height + 8, this.cornerRadius + 4)
        .fill({ color: 0xf5deb3, alpha: 0.18 });
      this.glowGraphics
        .roundRect(-3, 1, this.width + 6, this.height + 2, this.cornerRadius + 2)
        .stroke({ width: 2, color: 0xffe4b5, alpha: 0.65 });
    }
  }

  triggerShake() {
    this.shakeTime = 0.32;
  }

  update(delta: number) {
    this.currentLift += (this.targetLift - this.currentLift) * Math.min(1, delta * 14);
    this.container.x += (this.targetX - this.container.x) * Math.min(1, delta * 12);
    this.container.y += (this.targetY - this.container.y) * Math.min(1, delta * 12);
    this.cupBodyContainer.rotation +=
      (this.targetRotation - this.cupBodyContainer.rotation) * Math.min(1, delta * 12);

    let shakeOffset = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= delta;
      shakeOffset = Math.sin(this.shakeTime * 45) * 6 * (this.shakeTime / 0.32);
    }

    this.cupBodyContainer.y = 10 + this.currentLift;
    this.cupBodyContainer.x = this.width / 2 + shakeOffset;

    const liftRatio = Math.max(0, -this.currentLift / 24);
    const scaleFactor = 1 - liftRatio * 0.25;
    this.shadowGraphics.scale.set(scaleFactor, scaleFactor);
    this.shadowGraphics.alpha = 1 - liftRatio * 0.45;
  }

  /** Detach listeners and free GPU resources for this cup view. */
  destroy() {
    try {
      this.container.removeAllListeners();
    } catch {
      // ignore
    }
    try {
      this.container.destroy({ children: true });
    } catch {
      // ignore — parent teardown may already own it
    }
  }
}

export class TeaSortView {
  app: Application;
  containerEl: HTMLElement;
  logic: TeaSortLogic;
  callbacks: ViewCallbacks;
  /** Level number currently bound to this view (win-callback context). */
  boundLevel = 1;

  rootContainer = new Container();
  backgroundContainer = new Container();
  tableGraphics = new Graphics();
  cupsContainer = new Container();
  streamGraphics = new Graphics();
  particlesGraphics = new Graphics();

  cupViews: CupView[] = [];
  selectedCupIndex: number | null = null;
  isAnimating = false;

  particles: Particle[] = [];
  ambientSteamTimer = 0;

  private isDestroyed = false;
  private isInitialized = false;
  private isInitializing = false;
  private interactivityBound = false;
  private resizeObserver: ResizeObserver | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private lastInvalidTargetIndex: number | null = null;

  currentSkin: CupSkinId = 'glass';

  setSkin(skinId: CupSkinId) {
    this.currentSkin = skinId;
    this.cupViews.forEach((v) => v.setSkin(skinId));
  }

  public get canvas(): HTMLCanvasElement | null {
    if (this.canvasEl) return this.canvasEl;
    try {
      const renderer = (this.app as unknown as { renderer?: { canvas?: unknown } }).renderer;
      if (renderer && renderer.canvas instanceof HTMLCanvasElement) {
        return renderer.canvas;
      }
    } catch {
      // ignore
    }
    return null;
  }

  constructor(containerEl: HTMLElement, logic: TeaSortLogic, callbacks: ViewCallbacks = {}) {
    this.containerEl = containerEl;
    this.logic = logic;
    this.callbacks = callbacks;
    this.app = new Application();
    ensureLegacyResizeGuard(this.app);
  }

  async init() {
    if (this.isDestroyed || this.isInitialized || this.isInitializing) return;
    this.isInitializing = true;

    try {
      ensureLegacyResizeGuard(this.app);

      await this.app.init({
        preference: 'webgl',
        resizeTo: this.containerEl,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        backgroundAlpha: 0,
        antialias: true,
      });
    } catch (err) {
      console.error('Pixi app.init error:', err);
    } finally {
      this.isInitializing = false;
    }

    if (this.isDestroyed) {
      this.safeDestroyApp();
      return;
    }

    if (!this.app.renderer) {
      console.warn('Pixi app.renderer is not available after init');
      return;
    }

    this.isInitialized = true;

    try {
      const canvas = (this.app as unknown as { canvas?: unknown }).canvas;
      if (canvas instanceof HTMLCanvasElement) {
        this.canvasEl = canvas;
      } else {
        const rendererCanvas = (this.app.renderer as unknown as { canvas?: unknown }).canvas;
        if (rendererCanvas instanceof HTMLCanvasElement) this.canvasEl = rendererCanvas;
      }
    } catch (err) {
      console.warn('Error accessing canvas element:', err);
    }

    if (this.canvasEl) {
      this.canvasEl.style.position = 'absolute';
      this.canvasEl.style.top = '0';
      this.canvasEl.style.left = '0';
      this.canvasEl.style.width = '100%';
      this.canvasEl.style.height = '100%';
      this.canvasEl.style.zIndex = '10';
      this.canvasEl.style.touchAction = 'none';
      this.canvasEl.style.cursor = 'pointer';

      if (!this.containerEl.contains(this.canvasEl)) {
        this.containerEl.appendChild(this.canvasEl);
      }
    }

    this.tableGraphics.eventMode = 'none';
    this.streamGraphics.eventMode = 'none';
    this.particlesGraphics.eventMode = 'none';
    this.backgroundContainer.eventMode = 'none';

    this.app.stage.addChild(this.rootContainer);
    this.rootContainer.addChild(this.backgroundContainer);
    this.rootContainer.addChild(this.tableGraphics);
    this.rootContainer.addChild(this.cupsContainer);
    this.rootContainer.addChild(this.streamGraphics);
    this.rootContainer.addChild(this.particlesGraphics);

    this.setupInteractivity();
    this.setupCups();
    this.layoutCups();
    this.renderAllCups();

    // Exactly one ticker for the lifetime of the view.
    this.app.ticker.add((ticker) => {
      if (this.isDestroyed) return;
      this.update(ticker.deltaTime / 60);
    });

    // Exactly one ResizeObserver; public resize() + local relayout.
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDestroyed || !this.isInitialized || !this.app.renderer) return;
      try {
        ensureLegacyResizeGuard(this.app);
        this.app.resize();
        this.layoutCups();
      } catch (err) {
        console.warn('Safe resize error ignored:', err);
      }
    });
    this.resizeObserver.observe(this.containerEl);

    telegram.init();
  }

  private setupCups() {
    // Tear down previous cup views first: otherwise every restart/next-level
    // would orphan pointerdown handlers and GPU children.
    for (const old of this.cupViews) {
      try {
        this.cupsContainer.removeChild(old.container);
      } catch {
        // ignore
      }
      old.destroy();
    }
    this.cupsContainer.removeChildren();
    this.cupViews = [];

    this.logic.cups.forEach((_, index) => {
      const view = new CupView(index);
      view.setSkin(this.currentSkin);

      view.container.eventMode = 'static';
      view.container.cursor = 'pointer';
      view.container.hitArea = new Rectangle(-16, -16, view.width + 32, view.height + 32);

      view.container.on('pointerdown', (e) => {
        e.stopPropagation();
        this.handleCupClick(view.index);
      });

      this.cupViews.push(view);
      this.cupsContainer.addChild(view.container);
    });
  }

  layoutCups() {
    let width = this.app.screen.width;
    let height = this.app.screen.height;

    if (width === 0 || height === 0) {
      width = this.containerEl.clientWidth || window.innerWidth;
      height = this.containerEl.clientHeight || window.innerHeight;
    }
    if (width === 0 || height === 0) return;

    const count = this.cupViews.length;
    const baseCupW = 64;
    const baseCupH = 142;

    let rows: number[][] = [];
    const minPaddingX = 24;
    const neededWidth1Row = count * (baseCupW + minPaddingX);

    if (width >= neededWidth1Row && width > height * 1.2) {
      rows = [Array.from({ length: count }, (_, i) => i)];
    } else {
      const topCount = Math.ceil(count / 2);
      const topRow = Array.from({ length: topCount }, (_, i) => i);
      const bottomRow = Array.from({ length: count - topCount }, (_, i) => topCount + i);
      rows = [topRow, bottomRow];
    }

    const rowCount = rows.length;
    const maxCols = Math.max(...rows.map((r) => r.length));

    const widthMargin = 28;
    const idealColWidth = 76;
    const scaleByWidth = (width - widthMargin) / (maxCols * idealColWidth + 16);
    const scaleByHeight = (height - 84) / (rowCount * baseCupH + (rowCount - 1) * 44 + 24);

    const cupScale = Math.max(0.72, Math.min(1.08, Math.min(scaleByWidth, scaleByHeight)));

    this.cupViews.forEach((v) => v.setScale(cupScale));

    const scaledCupW = baseCupW * cupScale;
    const scaledCupH = baseCupH * cupScale;
    const verticalGap = Math.max(
      26 * cupScale,
      Math.min(52 * cupScale, (height - rowCount * scaledCupH - 90) / Math.max(1, rowCount)),
    );

    const totalContentH = rowCount * scaledCupH + (rowCount - 1) * verticalGap;
    const minHeadroom = Math.max(68 * cupScale, 56);
    const startY = Math.max(minHeadroom, (height - totalContentH) / 2 + 10);

    rows.forEach((rowIndices, rowIndex) => {
      const inRowCount = rowIndices.length;
      const rowY = startY + rowIndex * (scaledCupH + verticalGap);

      const availableW = width - 24;
      const maxSpacing = 94 * cupScale;
      const minSpacing = 62 * cupScale;
      const calculatedSpacing =
        inRowCount > 1 ? (availableW - scaledCupW - 16 * cupScale) / (inRowCount - 1) : maxSpacing;
      const spacing = Math.min(maxSpacing, Math.max(minSpacing, calculatedSpacing));

      const rowWidth = (inRowCount - 1) * spacing + scaledCupW;
      const startX = (width - rowWidth) / 2;

      rowIndices.forEach((cupIdx, colIndex) => {
        const view = this.cupViews[cupIdx];
        if (view) {
          const x = startX + colIndex * spacing;
          view.setHomePosition(x, rowY);
        }
      });
    });

    this.drawTableBackground(width, height);
  }

  private drawTableBackground(w: number, h: number) {
    this.tableGraphics.clear();

    const firstCupY = this.cupViews.length > 0 ? (this.cupViews[0]?.homeY ?? h * 0.35) : h * 0.35;
    const tableTopY = Math.max(160, firstCupY - 32);

    this.tableGraphics.rect(0, tableTopY, w, 18).fill({ color: 0x0a0604, alpha: 0.65 });

    this.tableGraphics.rect(0, tableTopY, w, 8).fill({ color: 0x825438, alpha: 0.95 });
    this.tableGraphics.rect(0, tableTopY + 1, w, 2.5).fill({ color: 0xd99868, alpha: 0.9 });
    this.tableGraphics.rect(0, tableTopY + 8, w, 4).fill({ color: 0x2e1b12, alpha: 0.85 });

    const plankH = 70;
    const tableH = h - tableTopY;
    const numPlanks = Math.ceil(tableH / plankH) + 1;

    for (let i = 0; i < numPlanks; i++) {
      const py = tableTopY + 12 + i * plankH;
      const shade = i % 2 === 0 ? 0x4d3223 : 0x583a29;
      this.tableGraphics.rect(0, py, w, plankH).fill({ color: shade, alpha: 0.88 });

      this.tableGraphics.rect(0, py + plankH - 1.5, w, 1.5).fill({ color: 0x24160f, alpha: 0.85 });
      this.tableGraphics.rect(0, py, w, 1.2).fill({ color: 0x80553d, alpha: 0.5 });
    }

    this.tableGraphics
      .ellipse(w / 2, tableTopY + tableH * 0.45, w * 0.75, tableH * 0.6)
      .fill({ color: 0xffb86c, alpha: 0.14 });

    this.cupViews.forEach((view) => {
      const cx = view.homeX + view.visualWidth / 2 - 2;
      const cy = view.homeY + view.visualHeight - 4;
      this.tableGraphics
        .ellipse(cx, cy, view.visualWidth * 0.42, 6 * view.scale)
        .fill({ color: 0x080403, alpha: 0.5 });
    });
  }

  private setupInteractivity() {
    // Bound exactly once per view lifetime (init only — never on resetLevel).
    if (this.interactivityBound) return;
    this.interactivityBound = true;

    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e) => {
      if (this.isAnimating) return;

      const clickPos = e.global;
      let clickedCupIndex: number | null = null;

      for (let i = 0; i < this.cupViews.length; i++) {
        const view = this.cupViews[i] as CupView;
        const x = view.container.x;
        const y = view.container.y;
        const touchPadding = 20;

        if (
          clickPos.x >= x - touchPadding &&
          clickPos.x <= x + view.visualWidth + touchPadding &&
          clickPos.y >= y - touchPadding &&
          clickPos.y <= y + view.visualHeight + touchPadding
        ) {
          clickedCupIndex = i;
          break;
        }
      }

      if (clickedCupIndex !== null) {
        this.handleCupClick(clickedCupIndex);
      } else {
        if (this.selectedCupIndex !== null) {
          this.deselectCurrent();
        }
      }
    });
  }

  private handleCupClick(clickedIdx: number) {
    if (this.isAnimating || this.isDestroyed) return;
    const clickedCup = this.logic.cups[clickedIdx];
    const clickedView = this.cupViews[clickedIdx];
    if (!clickedCup || !clickedView) return;

    if (this.selectedCupIndex === null) {
      if (clickedCup.isEmpty) {
        audioSynth.playInvalid();
        telegram.hapticError();
        clickedView.triggerShake();
        return;
      }

      this.selectedCupIndex = clickedIdx;
      clickedView.setSelection(true);
      audioSynth.playSelect();
      telegram.hapticSelection();
      this.callbacks.onSelectCup?.(clickedIdx);
      return;
    }

    if (this.selectedCupIndex === clickedIdx) {
      this.deselectCurrent();
      audioSynth.playSelect();
      return;
    }

    const sourceIdx = this.selectedCupIndex;
    const sourceCup = this.logic.cups[sourceIdx];
    const sourceView = this.cupViews[sourceIdx];
    if (!sourceCup || !sourceView) {
      this.deselectCurrent();
      return;
    }

    if (sourceCup.canPourInto(clickedCup)) {
      this.lastInvalidTargetIndex = null;
      const res = this.logic.makeMove(sourceIdx, clickedIdx);
      if (res) {
        this.deselectCurrent(false);
        this.animatePour(sourceIdx, clickedIdx, res.move.layer, res.move.count, res.sourceUncovered);
      }
    } else {
      if (!clickedCup.isEmpty && this.lastInvalidTargetIndex === clickedIdx) {
        this.lastInvalidTargetIndex = null;
        sourceView.setSelection(false);
        this.selectedCupIndex = clickedIdx;
        clickedView.setSelection(true);
        audioSynth.playSelect();
        telegram.hapticSelection();
        this.callbacks.onSelectCup?.(clickedIdx);
        return;
      }

      this.lastInvalidTargetIndex = clickedIdx;
      const reason = this.getInvalidPourReason(sourceCup, clickedCup);
      clickedView.triggerShake();
      audioSynth.playInvalid();
      telegram.hapticError();
      this.callbacks.onInvalidMove?.(reason);
    }
  }

  private getInvalidPourReason(sourceCup: Cup, targetCup: Cup): string {
    if (targetCup.isFull) {
      return 'Стакан полон (4/4)! Выберите другой сосуд или пустой стакан.';
    }
    if (sourceCup.isComplete && targetCup.isEmpty) {
      return 'Этот купаж уже полностью собран!';
    }
    if (targetCup.topLayer !== null && sourceCup.topLayer !== targetCup.topLayer) {
      const sourceName = sourceCup.topLayer ? TEA_TYPES[sourceCup.topLayer].nameRu : 'чай';
      const targetName = targetCup.topLayer ? TEA_TYPES[targetCup.topLayer].nameRu : 'чай';
      return `Цвета не совпадают: «${sourceName}» нельзя налить на «${targetName}». Только на такой же чай или в пустой стакан!`;
    }
    return 'Нельзя перелить в этот стакан.';
  }

  deselectCurrent(notify = true) {
    this.lastInvalidTargetIndex = null;
    if (this.selectedCupIndex !== null) {
      const prevView = this.cupViews[this.selectedCupIndex];
      if (prevView) {
        prevView.setSelection(false);
      }
      this.selectedCupIndex = null;
      if (notify) {
        this.callbacks.onSelectCup?.(null);
      }
    }
  }

  renderAllCups() {
    this.logic.cups.forEach((cup, idx) => {
      const view = this.cupViews[idx];
      if (view) {
        view.renderLiquid(cup);
      }
    });
  }

  async animatePour(
    fromIdx: number,
    toIdx: number,
    layer: TeaId,
    count: number,
    sourceUncovered = false,
  ) {
    this.isAnimating = true;
    const sourceView = this.cupViews[fromIdx] as CupView;
    const targetView = this.cupViews[toIdx] as CupView;

    this.cupsContainer.setChildIndex(sourceView.container, this.cupsContainer.children.length - 1);

    const isLeft = sourceView.homeX <= targetView.homeX;
    const tiltSign = isLeft ? 1 : -1;
    const pourAngle = tiltSign * 0.88;

    const hoverOffsetX = 32 * targetView.scale;
    const hoverOffsetY = 66 * targetView.scale;

    let targetHoverX = isLeft
      ? targetView.homeX - hoverOffsetX
      : targetView.homeX + targetView.visualWidth + hoverOffsetX;

    targetHoverX = Math.max(4, Math.min(this.app.screen.width - sourceView.visualWidth - 4, targetHoverX));
    const targetHoverY = Math.max(12, targetView.homeY - hoverOffsetY);

    sourceView.targetX = targetHoverX;
    sourceView.targetY = targetHoverY;
    sourceView.targetRotation = pourAngle;

    await this.wait(POUR_ANIMATION.liftMs);

    const pourDurationSec = POUR_DURATION_SEC;
    audioSynth.playPour(pourDurationSec);
    telegram.hapticPour();

    sourceView.drainingCount = count;
    sourceView.drainingLayer = layer;
    targetView.fillingCount = count;
    targetView.fillingLayer = layer;

    const tea = TEA_TYPES[layer];
    const startTime = performance.now();

    while (performance.now() - startTime < pourDurationSec * 1000) {
      const elapsed = (performance.now() - startTime) / (pourDurationSec * 1000);
      const easeProgress = elapsed;

      sourceView.drainAmount = easeProgress;
      targetView.fillAmount = easeProgress;

      const fromCup = this.logic.cups[fromIdx];
      const toCup = this.logic.cups[toIdx];
      if (fromCup) sourceView.renderLiquid(fromCup);
      if (toCup) targetView.renderLiquid(toCup);

      const spoutLocalX = isLeft ? sourceView.width - 2 : 2;
      const spoutLocalY = 4;
      const rotatedSpout = this.rotatePoint(
        spoutLocalX - sourceView.width / 2,
        spoutLocalY - 10,
        sourceView.cupBodyContainer.rotation,
      );

      const spoutX = sourceView.container.x + (sourceView.width / 2 + rotatedSpout.x) * sourceView.scale;
      const spoutY = sourceView.container.y + (10 + rotatedSpout.y) * sourceView.scale;

      const destX = targetView.container.x + (targetView.width / 2) * targetView.scale;
      const destY = targetView.container.y + 12 * targetView.scale;

      this.drawLiquidStream(spoutX, spoutY, destX, destY, tea.colorNum);

      if (Math.random() < 0.35) {
        this.spawnBubble(destX, destY + 8 * targetView.scale, tea.colorNum);
      }

      await this.wait(16);
    }

    this.streamGraphics.clear();
    sourceView.drainAmount = 0;
    sourceView.drainingCount = 0;
    targetView.fillAmount = 0;
    targetView.fillingCount = 0;

    this.renderAllCups();

    if (sourceUncovered) {
      audioSynth.playReveal();
      telegram.hapticSuccess();
      this.triggerRevealSparkles(
        sourceView.homeX + sourceView.visualWidth / 2,
        sourceView.homeY + sourceView.visualHeight / 2,
      );
    }

    sourceView.targetX = sourceView.homeX;
    sourceView.targetY = sourceView.homeY;
    sourceView.targetRotation = 0;
    sourceView.targetLift = 0;

    await this.wait(POUR_ANIMATION.returnMs);

    this.isAnimating = false;
    this.callbacks.onMoveComplete?.();

    if (this.logic.isWon()) {
      audioSynth.playWin();
      telegram.hapticSuccess();
      this.triggerWinConfetti();
      this.callbacks.onWin?.(this.boundLevel);
    } else if (this.logic.isDeadlocked()) {
      audioSynth.playInvalid();
      telegram.hapticError();
      this.callbacks.onDeadlock?.();
    }
  }

  triggerRevealSparkles(x: number, y: number) {
    const goldColors = [0xffd700, 0xffea79, 0xffffff, 0xe8985e];
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 15,
        alpha: 1,
        color: goldColors[Math.floor(Math.random() * goldColors.length)] as number,
        life: 0.8 + Math.random() * 0.4,
        maxLife: 1.2,
        scale: 3 + Math.random() * 3,
        type: 'sparkle',
      });
    }
  }

  private drawLiquidStream(x1: number, y1: number, x2: number, y2: number, color: number) {
    this.streamGraphics.clear();

    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    const midX = (x1 + x2) / 2 + Math.sin(performance.now() * 0.03) * 2;
    const midY = (y1 + y2) / 2;
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 5.5, color, alpha: 0.9 });

    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

    this.streamGraphics
      .circle(x2 + (Math.random() * 4 - 2), y2 + 2, 2.5)
      .fill({ color, alpha: 0.8 });
  }

  private rotatePoint(x: number, y: number, angle: number): { x: number; y: number } {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos,
    };
  }

  private spawnBubble(x: number, y: number, color: number) {
    this.particles.push({
      x,
      y,
      vx: (Math.random() * 2 - 1) * 1.5,
      vy: -(Math.random() * 2 + 1),
      alpha: 0.8,
      maxAlpha: 0.8,
      scale: Math.random() * 2 + 1.5,
      life: 0,
      maxLife: 0.35 + Math.random() * 0.2,
      color,
      type: 'steam',
    });
  }

  spawnSteamFromCup(cupView: CupView, colorHex: string) {
    const parsed = parseInt(colorHex.replace('#', ''), 16);
    const teaColor = Number.isNaN(parsed) ? 0xffffff : parsed;
    this.particles.push({
      x: cupView.container.x + cupView.visualWidth / 2 + (Math.random() * 20 - 10) * cupView.scale,
      y: cupView.container.y + 10 * cupView.scale,
      vx: Math.random() * 0.8 - 0.4,
      vy: -(Math.random() * 1.2 + 0.8),
      alpha: 0.35,
      maxAlpha: 0.35,
      scale: (Math.random() * 3 + 2) * cupView.scale,
      life: 0,
      maxLife: 1.6 + Math.random() * 0.8,
      color: teaColor,
      type: 'steam',
    });
  }

  triggerWinConfetti() {
    const colors = [0x87a96b, 0xf4a460, 0xb85b6c, 0xe6c29f, 0xa29bfe, 0xffd700];
    const w = this.app.screen.width;
    const h = this.app.screen.height;

    for (let i = 0; i < 65; i++) {
      this.particles.push({
        x: w / 2 + (Math.random() * 120 - 60),
        y: h / 2 - 60 + (Math.random() * 60 - 30),
        vx: Math.random() * 14 - 7,
        vy: -(Math.random() * 10 + 6),
        alpha: 1,
        maxAlpha: 1,
        scale: Math.random() * 6 + 4,
        life: 0,
        maxLife: 2.2 + Math.random() * 1.2,
        color: colors[Math.floor(Math.random() * colors.length)] as number,
        type: 'confetti',
        rotation: Math.random() * Math.PI * 2,
        vRot: Math.random() * 0.2 - 0.1,
      });
    }
  }

  update(delta: number) {
    this.cupViews.forEach((c) => c.update(delta));

    this.ambientSteamTimer += delta;
    if (this.ambientSteamTimer > 0.4) {
      this.ambientSteamTimer = 0;
      this.logic.cups.forEach((c, idx) => {
        if (!c.isEmpty && Math.random() < 0.45) {
          const topTea = c.topLayer ? TEA_TYPES[c.topLayer] : null;
          const view = this.cupViews[idx];
          if (view && topTea) {
            this.spawnSteamFromCup(view, topTea.colorHex);
          }
        }
      });
    }

    this.particlesGraphics.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.life += delta;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.type === 'steam') {
        p.vx += Math.random() * 0.2 - 0.1;
        p.vy *= 0.98;
        const progress = p.life / p.maxLife;
        p.alpha = (1 - progress) * (p.maxAlpha ?? 0.35);
        this.particlesGraphics
          .circle(p.x, p.y, p.scale * (1 + progress * 1.2))
          .fill({ color: p.color, alpha: p.alpha });
      } else if (p.type === 'sparkle') {
        p.vx *= 0.94;
        p.vy *= 0.94;
        const progress = p.life / p.maxLife;
        p.alpha = Math.max(0, 1 - progress);
        const s = p.scale * (1 - progress * 0.5);
        this.particlesGraphics.star(p.x, p.y, 4, s, s * 0.35).fill({ color: p.color, alpha: p.alpha });
      } else {
        p.vy += 0.25;
        p.vx *= 0.98;
        if (p.rotation !== undefined && p.vRot !== undefined) {
          p.rotation += p.vRot;
        }
        const progress = p.life / p.maxLife;
        p.alpha = Math.min(1, (1 - progress) * 1.3);
        this.particlesGraphics
          .roundRect(p.x, p.y, p.scale, p.scale * 0.6, 2)
          .fill({ color: p.color, alpha: p.alpha });
      }
    }
  }

  resetLevel() {
    this.deselectCurrent(false);
    this.setupCups();
    this.layoutCups();
    this.renderAllCups();
  }

  undoMove() {
    if (this.isAnimating) return;
    this.deselectCurrent(false);
    const move = this.logic.undo();
    if (move) {
      audioSynth.playUndo();
      telegram.hapticSelection();
      this.renderAllCups();
    }
  }

  private safeDestroyApp() {
    try {
      ensureLegacyResizeGuard(this.app);
      if (this.app.renderer) {
        this.app.destroy(true, { children: true, texture: false });
      }
      ensureLegacyResizeGuard(this.app);
    } catch (err) {
      console.warn('Safe Pixi destroy error ignored:', err);
    }
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const v of this.cupViews) {
      try {
        this.cupsContainer.removeChild(v.container);
      } catch {
        // ignore
      }
      v.destroy();
    }
    this.cupViews = [];

    audioSynth.stopPour();

    if (this.canvasEl && this.containerEl.contains(this.canvasEl)) {
      try {
        this.containerEl.removeChild(this.canvasEl);
      } catch {
        // ignore removal if already detached
      }
    }
    this.canvasEl = null;

    this.safeDestroyApp();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
