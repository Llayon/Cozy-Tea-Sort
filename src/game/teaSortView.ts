/**
 * Pixi.js v8 View Controller & Animation Engine for Cozy Tea Sort
 */

import { Application, Container, Graphics } from 'pixi.js';
import { Cup, MAX_CUP_CAPACITY, TEA_TYPES, TeaId, TeaSortLogic } from './teaSortEngine';
import { audioSynth } from './audioSynth';
import { telegram } from './telegramHaptics';

export interface ViewCallbacks {
  onMoveComplete?: () => void;
  onWin?: () => void;
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
  maxAlpha: number;
  scale: number;
  life: number;
  maxLife: number;
  color: number;
  type: 'steam' | 'confetti';
  rotation?: number;
  vRot?: number;
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

  // Fluid transition states for pouring animation
  drainAmount = 0; // 0 to 1 during pour
  fillAmount = 0; // 0 to 1 during pour
  drainingLayer: TeaId | null = null;
  fillingLayer: TeaId | null = null;
  drainingCount = 0;
  fillingCount = 0;

  readonly width = 64;
  readonly height = 142;
  readonly cornerRadius = 18;

  constructor(index: number) {
    this.index = index;
    this.container = new Container();

    // Table shadow underneath cup
    this.shadowGraphics = new Graphics();
    this.container.addChild(this.shadowGraphics);

    // Cup body that lifts and tilts
    this.cupBodyContainer = new Container();
    this.container.addChild(this.cupBodyContainer);

    // Selection glow
    this.glowGraphics = new Graphics();
    this.cupBodyContainer.addChild(this.glowGraphics);

    // Liquid container with mask
    this.liquidContainer = new Container();
    this.liquidGraphics = new Graphics();
    this.liquidMask = new Graphics();
    this.liquidContainer.addChild(this.liquidGraphics);
    this.liquidContainer.addChild(this.liquidMask);
    this.liquidContainer.mask = this.liquidMask;
    this.cupBodyContainer.addChild(this.liquidContainer);

    // Glass overlay (reflections, handle, rim, outline)
    this.glassOverlay = new Graphics();
    this.cupBodyContainer.addChild(this.glassOverlay);

    // Setup pivot around the top center of the cup for natural pouring rotation
    this.cupBodyContainer.pivot.set(this.width / 2, 10);

    this.drawCupFrame();
    this.drawShadow();
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
    // Soft wooden table contact shadow
    this.shadowGraphics
      .ellipse(this.width / 2, this.height + 6, this.width / 2 + 6, 9)
      .fill({ color: 0x120c0a, alpha: 0.35 });
  }

  drawCupFrame() {
    const w = this.width;
    const h = this.height;
    const r = this.cornerRadius;

    // 1. Draw liquid mask (U-shaped cup, flat top rim, rounded bottom)
    this.liquidMask.clear();
    this.liquidMask.beginPath();
    this.liquidMask.moveTo(2, 6);
    this.liquidMask.lineTo(w - 2, 6);
    this.liquidMask.lineTo(w - 2, h - r);
    this.liquidMask.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
    this.liquidMask.lineTo(r, h - 2);
    this.liquidMask.quadraticCurveTo(2, h - 2, 2, h - r);
    this.liquidMask.closePath();
    this.liquidMask.fill({ color: 0xffffff });

    // 2. Draw Glass Overlay
    this.glassOverlay.clear();

    // Subtle glass background tint (slight warmth)
    this.glassOverlay.beginPath();
    this.glassOverlay.moveTo(0, 4);
    this.glassOverlay.lineTo(w, 4);
    this.glassOverlay.lineTo(w, h - r);
    this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
    this.glassOverlay.lineTo(r, h);
    this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
    this.glassOverlay.closePath();
    this.glassOverlay.fill({ color: 0xffffff, alpha: 0.05 });

    // Thick glass bottom base
    this.glassOverlay
      .roundRect(4, h - 10, w - 8, 8, 3)
      .fill({ color: 0xffffff, alpha: 0.18 });

    // Outer glass outline (strokes)
    this.glassOverlay.beginPath();
    this.glassOverlay.moveTo(0, 4);
    this.glassOverlay.lineTo(0, h - r);
    this.glassOverlay.quadraticCurveTo(0, h, r, h);
    this.glassOverlay.lineTo(w - r, h);
    this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
    this.glassOverlay.lineTo(w, 4);
    this.glassOverlay.stroke({ width: 2.5, color: 0xffffff, alpha: 0.55 });

    // Glass top rim lip
    this.glassOverlay
      .roundRect(-2, 1, w + 4, 6, 3)
      .fill({ color: 0xffffff, alpha: 0.4 });
    this.glassOverlay
      .ellipse(w / 2, 4, w / 2, 3)
      .stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });

    // Cozy Glass Handle on the right side
    this.glassOverlay.beginPath();
    this.glassOverlay.moveTo(w - 1, 28);
    this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
    this.glassOverlay.stroke({ width: 4.5, color: 0xffffff, alpha: 0.45 });
    // Inner handle rim
    this.glassOverlay.beginPath();
    this.glassOverlay.moveTo(w - 1, 34);
    this.glassOverlay.bezierCurveTo(w + 14, 40, w + 14, 85, w - 1, 92);
    this.glassOverlay.stroke({ width: 1.5, color: 0xffffff, alpha: 0.3 });

    // Glass Specular Vertical Reflections
    this.glassOverlay
      .roundRect(5, 12, 4, h - 34, 2)
      .fill({ color: 0xffffff, alpha: 0.22 });
    this.glassOverlay
      .roundRect(11, 16, 2, h - 46, 1)
      .fill({ color: 0xffffff, alpha: 0.12 });
    this.glassOverlay
      .roundRect(w - 9, 14, 2.5, h - 38, 1)
      .fill({ color: 0xffffff, alpha: 0.16 });
  }

  renderLiquid(cup: Cup) {
    const g = this.liquidGraphics;
    g.clear();

    const w = this.width;
    const h = this.height;
    const bottomY = h - 6;
    const layerH = 29; // 4 layers * 29 = 116px (fits neatly inside 142px with headspace)

    // Base layers to render
    const layers = [...cup.layers];

    // If currently animating drain:
    if (this.drainingCount > 0 && this.drainAmount > 0) {
      // Temporarily decrease the top level visually
      const fullLayers = layers.length;
      const effectiveLayers = fullLayers - this.drainingCount * this.drainAmount;

      for (let i = 0; i < layers.length; i++) {
        const layerId = layers[i];
        const tea = TEA_TYPES[layerId];
        const layerBottom = bottomY - i * layerH;
        let currentH = layerH;

        if (i >= fullLayers - this.drainingCount) {
          const layerOffset = i - (fullLayers - this.drainingCount);
          const ratio = Math.max(0, Math.min(1, effectiveLayers - (fullLayers - this.drainingCount - layerOffset)));
          currentH = layerH * ratio;
        }

        if (currentH > 0.5) {
          const y = layerBottom - currentH;
          g.rect(0, y, w, currentH).fill({ color: tea.colorNum });

          // Subsurface gradient / separator
          g.rect(0, layerBottom - 1.5, w, 1.5).fill({ color: 0x000000, alpha: 0.12 });
        }
      }

      // Glossy meniscus on current fluid surface
      const topY = bottomY - effectiveLayers * layerH;
      if (effectiveLayers > 0.1) {
        g.ellipse(w / 2, topY, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.28 });
      }
      return;
    }

    // If currently animating fill:
    if (this.fillingCount > 0 && this.fillAmount > 0 && this.fillingLayer) {
      const tea = TEA_TYPES[this.fillingLayer];
      // Render existing layers
      for (let i = 0; i < layers.length; i++) {
        const layerId = layers[i];
        const t = TEA_TYPES[layerId];
        const y = bottomY - (i + 1) * layerH;
        g.rect(0, y, w, layerH).fill({ color: t.colorNum });
        g.rect(0, bottomY - i * layerH - 1.5, w, 1.5).fill({ color: 0x000000, alpha: 0.12 });
      }

      // Render incoming layer(s)
      const baseCount = layers.length;
      const extraHeight = this.fillingCount * layerH * this.fillAmount;
      const y = bottomY - baseCount * layerH - extraHeight;

      g.rect(0, y, w, extraHeight).fill({ color: tea.colorNum });
      // Meniscus at top
      g.ellipse(w / 2, y, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.35 });
      return;
    }

    // Standard static rendering
    for (let i = 0; i < layers.length; i++) {
      const layerId = layers[i];
      const tea = TEA_TYPES[layerId];
      const y = bottomY - (i + 1) * layerH;

      // Main color fill
      g.rect(0, y, w, layerH).fill({ color: tea.colorNum });

      // Subtle separator line between layers
      if (i > 0) {
        g.rect(0, bottomY - i * layerH - 1, w, 1.5).fill({ color: 0x000000, alpha: 0.14 });
        g.rect(0, bottomY - i * layerH + 0.5, w, 1).fill({ color: 0xffffff, alpha: 0.1 });
      }

      // Glossy meniscus on the topmost layer
      if (i === layers.length - 1) {
        g.ellipse(w / 2, y, w / 2 - 2, 3.5).fill({ color: 0xffffff, alpha: 0.28 });
      }
    }
  }

  setSelection(selected: boolean) {
    this.isLifted = selected;
    this.targetLift = selected ? -24 : 0;

    this.glowGraphics.clear();
    if (selected) {
      // Golden cozy glow around cup
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
    // Lift interpolation
    this.currentLift += (this.targetLift - this.currentLift) * Math.min(1, delta * 14);

    // Position interpolation
    this.container.x += (this.targetX - this.container.x) * Math.min(1, delta * 12);
    this.container.y += (this.targetY - this.container.y) * Math.min(1, delta * 12);

    // Rotation interpolation
    this.cupBodyContainer.rotation += (this.targetRotation - this.cupBodyContainer.rotation) * Math.min(1, delta * 12);

    // Shake effect
    let shakeOffset = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= delta;
      shakeOffset = Math.sin(this.shakeTime * 45) * 6 * (this.shakeTime / 0.32);
    }

    // Apply lift and shake to cup body
    this.cupBodyContainer.y = 10 + this.currentLift;
    this.cupBodyContainer.x = this.width / 2 + shakeOffset;

    // Table contact shadow scales with lift and rotation
    const liftRatio = Math.max(0, -this.currentLift / 24);
    const scaleFactor = 1 - liftRatio * 0.25;
    this.shadowGraphics.scale.set(scaleFactor, scaleFactor);
    this.shadowGraphics.alpha = 1 - liftRatio * 0.45;
  }
}

export class TeaSortView {
  app: Application;
  containerEl: HTMLElement;
  logic: TeaSortLogic;
  callbacks: ViewCallbacks;

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
  private resizeObserver: ResizeObserver | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private lastInvalidTargetIndex: number | null = null;

  public get canvas(): HTMLCanvasElement | null {
    if (this.canvasEl) return this.canvasEl;
    try {
      if (this.app && (this.app as any).renderer && (this.app as any).renderer.canvas) {
        return (this.app as any).renderer.canvas as HTMLCanvasElement;
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
    (this.app as any)._cancelResize = () => {};
  }

  async init() {
    if (this.isDestroyed || this.isInitialized || this.isInitializing) return;
    this.isInitializing = true;

    try {
      (this.app as any)._cancelResize = typeof (this.app as any)._cancelResize === 'function' ? (this.app as any)._cancelResize : () => {};

      await this.app.init({
        resizeTo: this.containerEl,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        backgroundAlpha: 0,
        antialias: true,
      });
    } catch (err) {
      console.warn('Pixi app.init error:', err);
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
      this.canvasEl = this.app.renderer.canvas as HTMLCanvasElement;
    } catch (err) {
      console.warn('Error accessing canvas element:', err);
    }

    if (this.canvasEl && !this.containerEl.contains(this.canvasEl)) {
      this.containerEl.appendChild(this.canvasEl);
    }

    // Layer structure
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

    // Ticker loop
    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaTime / 60);
    });

    // Resize observer
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDestroyed || !this.isInitialized || !this.app.renderer) return;
      try {
        if (typeof (this.app as any)._cancelResize !== 'function') {
          (this.app as any)._cancelResize = () => {};
        }
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
    this.cupsContainer.removeChildren();
    this.cupViews = [];

    this.logic.cups.forEach((_, index) => {
      const view = new CupView(index);
      this.cupViews.push(view);
      this.cupsContainer.addChild(view.container);
    });
  }

  layoutCups() {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    if (width === 0 || height === 0) return;

    const count = this.cupViews.length;
    const cupW = 64;
    const cupH = 142;

    // Decide layout: 1 row if screen is wide enough, 2 rows for vertical mobile portrait
    let rows: number[][] = [];
    const minPaddingX = 24;
    const neededWidth1Row = count * (cupW + minPaddingX);

    if (width >= neededWidth1Row && width > height) {
      // 1 single row
      rows = [Array.from({ length: count }, (_, i) => i)];
    } else {
      // 2 rows: top row gets Math.ceil(count / 2), bottom gets remaining
      const topCount = Math.ceil(count / 2);
      const topRow = Array.from({ length: topCount }, (_, i) => i);
      const bottomRow = Array.from({ length: count - topCount }, (_, i) => topCount + i);
      rows = [topRow, bottomRow];
    }

    const rowCount = rows.length;
    const totalContentH = rowCount * cupH + (rowCount - 1) * 60;
    const startY = Math.max(40, (height - totalContentH) / 2 + 10);

    rows.forEach((rowIndices, rowIndex) => {
      const inRowCount = rowIndices.length;
      const rowY = startY + rowIndex * (cupH + 54);
      const spacing = Math.min(94, Math.max(76, (width - 40) / inRowCount));
      const rowWidth = (inRowCount - 1) * spacing + cupW;
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

    // Table starts just above the first row of cups, revealing the tea room shelves above
    const firstCupY = this.cupViews.length > 0 ? this.cupViews[0].homeY : h * 0.35;
    const tableTopY = Math.max(160, firstCupY - 32);

    // 1. Table drop shadow onto the room wall
    this.tableGraphics
      .rect(0, tableTopY, w, 18)
      .fill({ color: 0x0a0604, alpha: 0.65 });

    // 2. Beveled wooden table top edge / lip (chaban table)
    this.tableGraphics
      .rect(0, tableTopY, w, 8)
      .fill({ color: 0x825438, alpha: 0.95 });
    this.tableGraphics
      .rect(0, tableTopY + 1, w, 2.5)
      .fill({ color: 0xd99868, alpha: 0.9 }); // highlight bevel rim
    this.tableGraphics
      .rect(0, tableTopY + 8, w, 4)
      .fill({ color: 0x2e1b12, alpha: 0.85 }); // shadow under lip

    // 3. Wooden planks on table surface
    const plankH = 70;
    const tableH = h - tableTopY;
    const numPlanks = Math.ceil(tableH / plankH) + 1;

    for (let i = 0; i < numPlanks; i++) {
      const py = tableTopY + 12 + i * plankH;
      const shade = i % 2 === 0 ? 0x4d3223 : 0x583a29;
      this.tableGraphics.rect(0, py, w, plankH).fill({ color: shade, alpha: 0.88 });

      // Plank seams & highlights
      this.tableGraphics.rect(0, py + plankH - 1.5, w, 1.5).fill({ color: 0x24160f, alpha: 0.85 });
      this.tableGraphics.rect(0, py, w, 1.2).fill({ color: 0x80553d, alpha: 0.5 });
    }

    // 4. Warm ambient lighting pool on the table center
    this.tableGraphics
      .ellipse(w / 2, tableTopY + tableH * 0.45, w * 0.75, tableH * 0.6)
      .fill({ color: 0xffb86c, alpha: 0.14 });

    // 5. Cup contact shadows on the table
    this.cupViews.forEach((view) => {
      const cx = view.homeX + view.width / 2 - 2;
      const cy = view.homeY + view.height - 4;
      this.tableGraphics
        .ellipse(cx, cy, view.width * 0.42, 6)
        .fill({ color: 0x080403, alpha: 0.5 });
    });
  }

  private setupInteractivity() {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.app.stage.on('pointerdown', (e) => {
      if (this.isAnimating) return;

      const clickPos = e.global;
      let clickedCupIndex: number | null = null;

      // Find which cup bounds were clicked (with generous touch padding)
      for (let i = 0; i < this.cupViews.length; i++) {
        const view = this.cupViews[i];
        const x = view.container.x;
        const y = view.container.y;
        const touchPadding = 18;

        if (
          clickPos.x >= x - touchPadding &&
          clickPos.x <= x + view.width + touchPadding &&
          clickPos.y >= y - touchPadding &&
          clickPos.y <= y + view.height + touchPadding
        ) {
          clickedCupIndex = i;
          break;
        }
      }

      if (clickedCupIndex !== null) {
        this.handleCupClick(clickedCupIndex);
      } else {
        // Tapped outside: deselect if selected
        if (this.selectedCupIndex !== null) {
          this.deselectCurrent();
        }
      }
    });
  }

  private handleCupClick(clickedIdx: number) {
    const clickedCup = this.logic.cups[clickedIdx];
    const clickedView = this.cupViews[clickedIdx];

    // Case 1: No cup is currently selected
    if (this.selectedCupIndex === null) {
      if (clickedCup.isEmpty) {
        // Empty cup cannot be selected as source
        audioSynth.playInvalid();
        telegram.hapticError();
        clickedView.triggerShake();
        return;
      }

      // Select cup
      this.selectedCupIndex = clickedIdx;
      clickedView.setSelection(true);
      audioSynth.playSelect();
      telegram.hapticSelection();
      this.callbacks.onSelectCup?.(clickedIdx);
      return;
    }

    // Case 2: Tapped the already selected cup -> Deselect
    if (this.selectedCupIndex === clickedIdx) {
      this.deselectCurrent();
      audioSynth.playSelect();
      return;
    }

    // Case 3: Tapped another cup while a source is selected -> Attempt Pour
    const sourceIdx = this.selectedCupIndex;
    const sourceCup = this.logic.cups[sourceIdx];
    const sourceView = this.cupViews[sourceIdx];

    if (sourceCup.canPourInto(clickedCup)) {
      // Execute Move!
      this.lastInvalidTargetIndex = null;
      const move = this.logic.makeMove(sourceIdx, clickedIdx);
      if (move) {
        this.deselectCurrent(false); // un-highlight without sound
        this.animatePour(sourceIdx, clickedIdx, move.layer, move.count);
      }
    } else {
      // If player deliberately tapped the same incompatible cup a second time, switch selection to it
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

      // First tap on incompatible cup -> show warning, shake cup, and keep source cup selected!
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

  /**
   * Smooth physics pour animation with tilting, dynamic stream, and level transitions
   */
  async animatePour(fromIdx: number, toIdx: number, layer: TeaId, count: number) {
    this.isAnimating = true;
    const sourceView = this.cupViews[fromIdx];
    const targetView = this.cupViews[toIdx];

    // Lift source cup higher into cupsContainer to avoid z-order occlusion
    this.cupsContainer.setChildIndex(sourceView.container, this.cupsContainer.children.length - 1);

    const isLeft = sourceView.homeX <= targetView.homeX;
    // Tilting angle: ~50 degrees (0.87 rad)
    const tiltSign = isLeft ? 1 : -1;
    const pourAngle = tiltSign * 0.88;

    // Target hover position right above target rim
    const targetHoverX = isLeft
      ? targetView.homeX - 38
      : targetView.homeX + targetView.width + 38;
    const targetHoverY = targetView.homeY - 78;

    // Phase 1: Approach & Tilt (320ms)
    sourceView.targetX = targetHoverX;
    sourceView.targetY = targetHoverY;
    sourceView.targetRotation = pourAngle;

    await this.wait(320);

    // Phase 2: Pouring liquid stream (650ms)
    const pourDuration = 0.65;
    audioSynth.playPour(pourDuration);
    telegram.hapticPour();

    sourceView.drainingCount = count;
    sourceView.drainingLayer = layer;
    targetView.fillingCount = count;
    targetView.fillingLayer = layer;

    const tea = TEA_TYPES[layer];
    const startTime = performance.now();

    while (performance.now() - startTime < pourDuration * 1000) {
      const elapsed = (performance.now() - startTime) / (pourDuration * 1000);
      const easeProgress = elapsed;

      sourceView.drainAmount = easeProgress;
      targetView.fillAmount = easeProgress;

      sourceView.renderLiquid(this.logic.cups[fromIdx]);
      targetView.renderLiquid(this.logic.cups[toIdx]);

      // Calculate stream origin (tilted rim of source cup)
      // Top spout corner in source view local coordinates:
      const spoutLocalX = isLeft ? sourceView.width - 2 : 2;
      const spoutLocalY = 4;
      const rotatedSpout = this.rotatePoint(
        spoutLocalX - sourceView.width / 2,
        spoutLocalY - 10,
        sourceView.cupBodyContainer.rotation
      );

      const spoutX = sourceView.container.x + sourceView.width / 2 + rotatedSpout.x;
      const spoutY = sourceView.container.y + 10 + rotatedSpout.y;

      // Stream destination: center top of target cup mouth
      const destX = targetView.container.x + targetView.width / 2 + (Math.random() * 2 - 1);
      const destY = targetView.container.y + 12;

      this.drawLiquidStream(spoutX, spoutY, destX, destY, tea.colorNum);

      // Spawn subtle bubbles & steam at target landing point
      if (Math.random() < 0.35) {
        this.spawnBubble(destX, destY + 8, tea.colorNum);
      }

      await this.wait(16);
    }

    // Stream ends
    this.streamGraphics.clear();
    sourceView.drainAmount = 0;
    sourceView.drainingCount = 0;
    targetView.fillAmount = 0;
    targetView.fillingCount = 0;

    // Render final states
    this.renderAllCups();

    // Phase 3: Return to home position & reset tilt (320ms)
    sourceView.targetX = sourceView.homeX;
    sourceView.targetY = sourceView.homeY;
    sourceView.targetRotation = 0;
    sourceView.targetLift = 0;

    await this.wait(320);

    this.isAnimating = false;
    this.callbacks.onMoveComplete?.();

    // Check game condition
    if (this.logic.isWon()) {
      audioSynth.playWin();
      telegram.hapticSuccess();
      this.triggerWinConfetti();
      this.callbacks.onWin?.();
    } else if (this.logic.isDeadlocked()) {
      audioSynth.playInvalid();
      telegram.hapticError();
      this.callbacks.onDeadlock?.();
    }
  }

  private drawLiquidStream(x1: number, y1: number, x2: number, y2: number, color: number) {
    this.streamGraphics.clear();

    // Stream outer glow
    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    const midX = (x1 + x2) / 2 + (Math.sin(performance.now() * 0.03) * 2);
    const midY = (y1 + y2) / 2;
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 5.5, color: color, alpha: 0.9 });

    // Stream inner core highlight
    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

    // Little droplet splashes at landing point
    this.streamGraphics
      .circle(x2 + (Math.random() * 4 - 2), y2 + 2, 2.5)
      .fill({ color: color, alpha: 0.8 });
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
    const teaColor = parseInt(colorHex.replace('#', '0x'), 16);
    this.particles.push({
      x: cupView.container.x + cupView.width / 2 + (Math.random() * 20 - 10),
      y: cupView.container.y + 10,
      vx: (Math.random() * 0.8 - 0.4),
      vy: -(Math.random() * 1.2 + 0.8),
      alpha: 0.35,
      maxAlpha: 0.35,
      scale: Math.random() * 3 + 2,
      life: 0,
      maxLife: 1.6 + Math.random() * 0.8,
      color: teaColor || 0xffffff,
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
        vx: (Math.random() * 14 - 7),
        vy: -(Math.random() * 10 + 6),
        alpha: 1,
        maxAlpha: 1,
        scale: Math.random() * 6 + 4,
        life: 0,
        maxLife: 2.2 + Math.random() * 1.2,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'confetti',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() * 0.2 - 0.1),
      });
    }
  }

  update(delta: number) {
    // Update cups
    this.cupViews.forEach((c) => c.update(delta));

    // Ambient gentle steam wisps from filled cups
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

    // Update and draw particles
    this.particlesGraphics.clear();

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx;
      p.y += p.vy;

      if (p.type === 'steam') {
        p.vx += (Math.random() * 0.2 - 0.1);
        p.vy *= 0.98;
        const progress = p.life / p.maxLife;
        p.alpha = (1 - progress) * p.maxAlpha;
        this.particlesGraphics
          .circle(p.x, p.y, p.scale * (1 + progress * 1.2))
          .fill({ color: p.color, alpha: p.alpha });
      } else {
        // Confetti / tea leaves
        p.vy += 0.25; // gravity
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
      const appAny = this.app as any;
      if (typeof appAny._cancelResize !== 'function') {
        appAny._cancelResize = () => {};
      }
      if (this.app.renderer) {
        this.app.destroy(true, { children: true, texture: true });
      }
      appAny._cancelResize = () => {};
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

    if (this.canvasEl && this.containerEl.contains(this.canvasEl)) {
      try {
        this.containerEl.removeChild(this.canvasEl);
      } catch {
        // ignore removal if detached
      }
    }
    this.canvasEl = null;

    this.safeDestroyApp();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
