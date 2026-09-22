/**
 * ============================================================================
 * Чайный купаж (Cozy Tea Sort / Water Sort Puzzle)
 * Монолитный модуль: Логика + Рендеринг Pixi.js v8 + Web Audio ASMR + Telegram Haptics
 * ============================================================================
 */

import { Application, Container, Graphics, Rectangle } from 'pixi.js';

/* ----------------------------------------------------------------------------
 * 1. ТИПЫ И ЧАЙНАЯ ПАЛИТРА
 * ---------------------------------------------------------------------------- */

export type TeaId =
  | 'matcha'
  | 'sea_buckthorn'
  | 'karkade'
  | 'milk_oolong'
  | 'lavender'
  | 'saffron'
  | 'buckwheat';

export type CupSkinId = 'glass' | 'ceramic' | 'porcelain';

export interface TeaType {
  id: TeaId;
  name: string;
  nameRu: string;
  colorHex: string;
  colorNum: number;
  textColor: string;
  steamColor: string;
  description: string;
}

export const TEA_TYPES: Record<TeaId, TeaType> = {
  matcha: {
    id: 'matcha',
    name: 'Matcha Tea',
    nameRu: 'Матча',
    colorHex: '#84B866',
    colorNum: 0x84b866,
    textColor: '#243b19',
    steamColor: 'rgba(132, 184, 102, 0.45)',
    description: 'Свежий зеленый японский чай',
  },
  sea_buckthorn: {
    id: 'sea_buckthorn',
    name: 'Sea Buckthorn',
    nameRu: 'Облепиховый',
    colorHex: '#FFA834',
    colorNum: 0xffa834,
    textColor: '#572b04',
    steamColor: 'rgba(255, 168, 52, 0.45)',
    description: 'Теплый янтарно-цитрусовый настой',
  },
  karkade: {
    id: 'karkade',
    name: 'Karkade Berry',
    nameRu: 'Каркаде',
    colorHex: '#D6405C',
    colorNum: 0xd6405c,
    textColor: '#3d0c15',
    steamColor: 'rgba(214, 64, 92, 0.45)',
    description: 'Глубокий рубиново-ягодный настой',
  },
  milk_oolong: {
    id: 'milk_oolong',
    name: 'Milk Oolong / Latte',
    nameRu: 'Молочный улун',
    colorHex: '#F5D6B8',
    colorNum: 0xf5d6b8,
    textColor: '#4a2f18',
    steamColor: 'rgba(245, 214, 184, 0.45)',
    description: 'Нежный сливочно-кофейный купаж',
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender Herbal',
    nameRu: 'Лавандовый чай',
    colorHex: '#A79AFE',
    colorNum: 0xa79afe,
    textColor: '#292257',
    steamColor: 'rgba(167, 154, 254, 0.45)',
    description: 'Ароматный цветочный настой',
  },
  saffron: {
    id: 'saffron',
    name: 'Golden Saffron',
    nameRu: 'Золотой шафран',
    colorHex: '#F2C94C',
    colorNum: 0xf2c94c,
    textColor: '#47360a',
    steamColor: 'rgba(242, 201, 76, 0.45)',
    description: 'Драгоценный солнечный шафрановый купаж',
  },
  buckwheat: {
    id: 'buckwheat',
    name: 'Buckwheat Ku Qiao',
    nameRu: 'Гречишный чай',
    colorHex: '#C49A45',
    colorNum: 0xc49a45,
    textColor: '#3d2b0e',
    steamColor: 'rgba(196, 154, 69, 0.45)',
    description: 'Теплый медовый чай с нотками свежей выпечки',
  },
};

export const MAX_CUP_CAPACITY = 4;

/* ----------------------------------------------------------------------------
 * 2. TELEGRAM WEBAPP И HAPTIC FEEDBACK
 * ---------------------------------------------------------------------------- */

export class TelegramManager {
  private hasInitialized = false;

  init() {
    if (this.hasInitialized) return;
    this.hasInitialized = true;
    try {
      const webapp = window.Telegram?.WebApp;
      if (webapp) {
        webapp.ready();
        webapp.expand();
        if (typeof (webapp as any).disableVerticalSwipes === 'function') {
          (webapp as any).disableVerticalSwipes();
        }
        if ('headerColor' in webapp) webapp.headerColor = '#1A1412';
        if ('backgroundColor' in webapp) webapp.backgroundColor = '#1A1412';
      }
    } catch {
      // fallback safe
    }
  }

  get isInsideTelegram(): boolean {
    return Boolean(window.Telegram?.WebApp?.HapticFeedback);
  }

  hapticSelection() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.selectionChanged) {
        haptic.selectionChanged();
      } else if (navigator.vibrate) {
        navigator.vibrate(12);
      }
    } catch {
      // ignore
    }
  }

  hapticPour() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.impactOccurred) {
        haptic.impactOccurred('medium');
      } else if (navigator.vibrate) {
        navigator.vibrate([15, 25, 15]);
      }
    } catch {
      // ignore
    }
  }

  hapticError() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.notificationOccurred) {
        haptic.notificationOccurred('error');
      } else if (navigator.vibrate) {
        navigator.vibrate([35, 20, 35]);
      }
    } catch {
      // ignore
    }
  }

  hapticSuccess() {
    try {
      const haptic = window.Telegram?.WebApp?.HapticFeedback;
      if (haptic?.notificationOccurred) {
        haptic.notificationOccurred('success');
      } else if (navigator.vibrate) {
        navigator.vibrate([20, 40, 20, 40, 30]);
      }
    } catch {
      // ignore
    }
  }
}

export const telegram = new TelegramManager();

/* ----------------------------------------------------------------------------
 * 3. ASMR WEB AUDIO СИНТЕЗАТОР
 * ---------------------------------------------------------------------------- */

export class CozyAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private activePourNodes: { stop: () => void } | null = null;

  constructor() {
    try {
      this.isMuted = localStorage.getItem('cozy_tea_muted') === 'true';
    } catch {
      this.isMuted = false;
    }
  }

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    try {
      localStorage.setItem('cozy_tea_muted', String(muted));
    } catch {
      // ignore
    }
    if (muted && this.activePourNodes) {
      this.activePourNodes.stop();
      this.activePourNodes = null;
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  playSelect() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  playInvalid() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  playPour(durationSec: number = 0.65) {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    if (this.activePourNodes) {
      this.activePourNodes.stop();
      this.activePourNodes = null;
    }

    const t = this.ctx.currentTime;
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = Math.floor(sampleRate * durationSec);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const data = noiseBuffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.05;
      b1 = 0.96300 * b1 + white * 0.11;
      b2 = 0.57000 * b2 + white * 0.25;
      data[i] = (b0 + b1 + b2) * 0.35;
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(650, t);
    filter.frequency.linearRampToValueAtTime(1100, t + durationSec);
    filter.Q.setValueAtTime(3.5, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, t);
    noiseGain.gain.linearRampToValueAtTime(0.16, t + 0.08);
    noiseGain.gain.setValueAtTime(0.16, t + durationSec - 0.08);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + durationSec);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noiseSource.start(t);
    noiseSource.stop(t + durationSec);

    // Droplet bubbles
    const bubbleCount = Math.floor(durationSec * 7);
    const bubbleOscs: OscillatorNode[] = [];

    for (let i = 0; i < bubbleCount; i++) {
      const dropTime = t + 0.05 + (i / bubbleCount) * (durationSec - 0.1) + (Math.random() * 0.03 - 0.015);
      const bOsc = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();

      const startFreq = 720 + Math.random() * 550;
      const endFreq = startFreq + 220 + Math.random() * 280;

      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(startFreq, dropTime);
      bOsc.frequency.exponentialRampToValueAtTime(endFreq, dropTime + 0.04);

      bGain.gain.setValueAtTime(0.001, dropTime);
      bGain.gain.linearRampToValueAtTime(0.08, dropTime + 0.01);
      bGain.gain.exponentialRampToValueAtTime(0.0001, dropTime + 0.045);

      bOsc.connect(bGain);
      bGain.connect(this.ctx.destination);

      bOsc.start(dropTime);
      bOsc.stop(dropTime + 0.05);
      bubbleOscs.push(bOsc);
    }

    this.activePourNodes = {
      stop: () => {
        try {
          noiseSource.stop();
          bubbleOscs.forEach((o) => {
            try { o.stop(); } catch { /* ignore */ }
          });
        } catch {
          // ignore
        }
      },
    };
  }

  playUndo() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.18);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  playReveal() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(1046.5, t); // C6
    osc1.frequency.exponentialRampToValueAtTime(1567.98, t + 0.16); // G6
    osc2.frequency.setValueAtTime(2093.0, t + 0.05); // C7

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t + 0.05);
    osc1.stop(t + 0.48);
    osc2.stop(t + 0.48);
  }

  playWin() {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 880.0, 1046.5, 1318.51];

    notes.forEach((freq, index) => {
      if (!this.ctx) return;
      const noteTime = t + index * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = index % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.15, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.65);
    });
  }
}

export const audioSynth = new CozyAudioSynthesizer();

/* ----------------------------------------------------------------------------
 * 4. МОДЕЛЬ ДАННЫХ И ЛОГИКА (TeaSortLogic)
 * ---------------------------------------------------------------------------- */

export class Cup {
  id: number;
  layers: TeaId[];
  hiddenCount = 0; // Количество нижних скрытых слоев под пенкой

  constructor(id: number, initialLayers: TeaId[] = [], hiddenCount = 0) {
    this.id = id;
    this.layers = [...initialLayers];
    this.hiddenCount = Math.min(hiddenCount, Math.max(0, this.layers.length - 1));
  }

  clone(): Cup {
    return new Cup(this.id, [...this.layers], this.hiddenCount);
  }

  isLayerHidden(index: number): boolean {
    return index < this.hiddenCount;
  }

  revealTopIfNeeded(): boolean {
    if (this.hiddenCount > 0 && this.hiddenCount >= this.layers.length) {
      this.hiddenCount = Math.max(0, this.layers.length - 1);
      return true;
    }
    return false;
  }

  get count(): number {
    return this.layers.length;
  }

  get isFull(): boolean {
    return this.layers.length >= MAX_CUP_CAPACITY;
  }

  get isEmpty(): boolean {
    return this.layers.length === 0;
  }

  get remainingCapacity(): number {
    return MAX_CUP_CAPACITY - this.layers.length;
  }

  get topLayer(): TeaId | null {
    if (this.layers.length === 0) return null;
    return this.layers[this.layers.length - 1];
  }

  get topCount(): number {
    if (this.layers.length === 0) return 0;
    const top = this.layers[this.layers.length - 1];
    let count = 0;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.layers[i] === top) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  get isComplete(): boolean {
    if (this.layers.length !== MAX_CUP_CAPACITY) return false;
    const first = this.layers[0];
    return this.layers.every((layer) => layer === first);
  }

  canPourInto(target: Cup): boolean {
    if (this.id === target.id) return false;
    if (this.isEmpty) return false;
    if (target.isFull) return false;

    // Moving completed mono-cup into empty cup is a meaningless loop
    if (this.isComplete && target.isEmpty) return false;

    if (target.isEmpty) return true;

    return this.topLayer === target.topLayer;
  }

  pourInto(target: Cup): { transferred: number; layer: TeaId } | null {
    if (!this.canPourInto(target)) return null;

    const layerToMove = this.topLayer!;
    const availableSpace = target.remainingCapacity;
    const consecutive = this.topCount;
    const countToMove = Math.min(consecutive, availableSpace);

    for (let i = 0; i < countToMove; i++) {
      this.layers.pop();
      target.layers.push(layerToMove);
    }

    return { transferred: countToMove, layer: layerToMove };
  }
}

export interface MoveStep {
  fromCupIndex: number;
  toCupIndex: number;
  layer: TeaId;
  count: number;
}

export interface GameStateSnapshot {
  cups: TeaId[][];
  hiddenCounts: number[];
  move: MoveStep;
}

export class TeaSortLogic {
  cups: Cup[] = [];
  history: GameStateSnapshot[] = [];
  movesCount = 0;

  constructor(initialCups: TeaId[][] = [], hiddenCounts: number[] = []) {
    if (initialCups.length > 0) {
      this.initFromState(initialCups, hiddenCounts);
    }
  }

  initFromState(state: TeaId[][], hiddenCounts: number[] = []) {
    this.cups = state.map((layers, idx) => new Cup(idx, layers, hiddenCounts[idx] || 0));
    this.history = [];
    this.movesCount = 0;
  }

  /**
   * Генерация 100% решаемого уровня путем обратного перемешивания из решенного состояния.
   * Поддерживает кривую сложности «Дыхание», выбор конкретных чайных купажей и скрытые слои «Таинственный настой».
   */
  static generateSolvableLevel(
    numColors = 3,
    emptyCups = 2,
    customColors?: TeaId[],
    hasMysteryLayer = false,
    shuffleLimit?: number
  ): { cups: TeaId[][]; hiddenCounts: number[] } {
    let chosenColors: TeaId[] = [];
    if (customColors && customColors.length >= numColors) {
      chosenColors = customColors.slice(0, numColors);
    } else {
      const teaKeys = Object.keys(TEA_TYPES) as TeaId[];
      chosenColors = teaKeys.slice(0, numColors);
    }

    // Исходное решенное состояние
    const cups: TeaId[][] = chosenColors.map((color) => [
      color,
      color,
      color,
      color,
    ]);
    for (let i = 0; i < emptyCups; i++) {
      cups.push([]);
    }

    // Обратные шаги для перемешивания
    const totalSteps = shuffleLimit ?? (24 + numColors * 6);
    let successfulShuffles = 0;

    for (let step = 0; step < totalSteps * 4 && successfulShuffles < totalSteps; step++) {
      const nonEmptyIndices = cups
        .map((c, i) => (c.length > 0 ? i : -1))
        .filter((i) => i !== -1);
      if (nonEmptyIndices.length === 0) break;

      const fromIdx = nonEmptyIndices[Math.floor(Math.random() * nonEmptyIndices.length)];
      const availableTargetIndices = cups
        .map((c, i) => (i !== fromIdx && c.length < MAX_CUP_CAPACITY ? i : -1))
        .filter((i) => i !== -1);

      if (availableTargetIndices.length === 0) continue;
      const toIdx = availableTargetIndices[Math.floor(Math.random() * availableTargetIndices.length)];

      const layer = cups[fromIdx].pop()!;
      cups[toIdx].push(layer);
      successfulShuffles++;
    }

    // Проверка, чтобы уровень не оказался случайно сразу решенным
    const allFullAndPure = cups.every(
      (c) => c.length === 0 || (c.length === MAX_CUP_CAPACITY && c.every((l) => l === c[0]))
    );
    if (allFullAndPure) {
      if (cups[0].length > 0 && cups[1].length > 0) {
        const top0 = cups[0].pop()!;
        const top1 = cups[1].pop()!;
        cups[0].push(top1);
        cups[1].push(top0);
      }
    }

    const hiddenCounts = cups.map(() => 0);
    if (hasMysteryLayer) {
      // Прячем нижний слой в одной непустой чашке с 3-4 слоями
      const candidateIdx = cups.findIndex((c) => c.length >= 3);
      if (candidateIdx !== -1) {
        hiddenCounts[candidateIdx] = 1;
      }
    }

    return { cups, hiddenCounts };
  }

  canMakeMove(fromIdx: number, toIdx: number): boolean {
    if (fromIdx < 0 || fromIdx >= this.cups.length) return false;
    if (toIdx < 0 || toIdx >= this.cups.length) return false;
    return this.cups[fromIdx].canPourInto(this.cups[toIdx]);
  }

  makeMove(fromIdx: number, toIdx: number): { move: MoveStep; sourceUncovered: boolean } | null {
    if (!this.canMakeMove(fromIdx, toIdx)) return null;

    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      move: {
        fromCupIndex: fromIdx,
        toCupIndex: toIdx,
        layer: this.cups[fromIdx].topLayer!,
        count: 0,
      },
    };

    const res = this.cups[fromIdx].pourInto(this.cups[toIdx]);
    if (!res) return null;

    const sourceUncovered = this.cups[fromIdx].revealTopIfNeeded();
    snapshot.move.count = res.transferred;
    this.history.push(snapshot);
    this.movesCount++;
    return { move: snapshot.move, sourceUncovered };
  }

  undo(): MoveStep | null {
    if (this.history.length === 0) return null;
    const last = this.history.pop()!;
    this.cups.forEach((cup, idx) => {
      cup.layers = [...last.cups[idx]];
      cup.hiddenCount = last.hiddenCounts ? last.hiddenCounts[idx] || 0 : 0;
    });
    this.movesCount = Math.max(0, this.movesCount - 1);
    return last.move;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  isWon(): boolean {
    for (const cup of this.cups) {
      if (cup.isEmpty) continue;
      if (!cup.isComplete) return false;
    }
    const completedCups = this.cups.filter((c) => c.isComplete).length;
    return completedCups > 0;
  }

  isDeadlocked(): boolean {
    if (this.isWon()) return false;

    for (let i = 0; i < this.cups.length; i++) {
      for (let j = 0; j < this.cups.length; j++) {
        if (i === j) continue;
        const source = this.cups[i];
        const target = this.cups[j];

        if (source.canPourInto(target)) {
          if (source.isEmpty) continue;
          if (target.isEmpty && source.layers.every((l) => l === source.layers[0])) {
            continue;
          }
          return false;
        }
      }
    }
    return true;
  }
}

/* ----------------------------------------------------------------------------
 * 5. ВИЗУАЛИЗАЦИЯ И АНИМАЦИЯ НА PIXI.JS V8 (TeaSortView)
 * ---------------------------------------------------------------------------- */

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
  maxAlpha?: number;
  scale: number;
  life: number;
  maxLife: number;
  color: number;
  type: 'steam' | 'confetti' | 'sparkle';
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

    // Маска жидкости (аккуратный скругленный стакан)
    this.liquidMask.clear();
    this.liquidMask.roundRect(2, 4, w - 4, h - 6, r).fill({ color: 0xffffff });

    this.glassOverlay.clear();

    if (this.skinId === 'ceramic') {
      // КЕРАМИКА ВАБИ-САБИ: теплая фактурная глина с глазурью
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0x5a3d2b, alpha: 0.22 });

      // Керамическое донышко
      this.glassOverlay
        .roundRect(4, h - 11, w - 8, 9, 3)
        .fill({ color: 0x3d271a, alpha: 0.45 });

      // Контур обожженной глины
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 3.2, color: 0xc49a75, alpha: 0.95 });

      // Глазурованный ободок горлышка
      this.glassOverlay
        .roundRect(-2, 1, w + 4, 7, 3.5)
        .fill({ color: 0xd8ab85, alpha: 0.9 });
      this.glassOverlay
        .ellipse(w / 2, 4.5, w / 2, 3)
        .stroke({ width: 1.8, color: 0x7a543a, alpha: 0.9 });

      // Глиняная теплая ручка
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 28);
      this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
      this.glassOverlay.stroke({ width: 5.5, color: 0x7a543a, alpha: 0.92 });
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 33);
      this.glassOverlay.bezierCurveTo(w + 13, 39, w + 13, 86, w - 1, 93);
      this.glassOverlay.stroke({ width: 2, color: 0xc49a75, alpha: 0.7 });

      // Мягкий матовый отблеск глины
      this.glassOverlay
        .roundRect(6, 14, 3.5, h - 38, 2)
        .fill({ color: 0xffe8d6, alpha: 0.2 });
    } else if (this.skinId === 'porcelain') {
      // ВИНТАЖНЫЙ ФАРФОР: благородная слоновая кость с золотой каймой
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0xfffaea, alpha: 0.24 });

      // Донышко с золотистой основой
      this.glassOverlay
        .roundRect(4, h - 10, w - 8, 8, 3)
        .fill({ color: 0xfffaea, alpha: 0.5 });
      this.glassOverlay
        .roundRect(6, h - 5, w - 12, 3, 1.5)
        .fill({ color: 0xd4af37, alpha: 0.85 });

      // Контур фарфора
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 2.8, color: 0xffffff, alpha: 0.9 });

      // Золотой ободок горлышка
      this.glassOverlay
        .roundRect(-2, 1, w + 4, 6.5, 3)
        .fill({ color: 0xd4af37, alpha: 0.95 });
      this.glassOverlay
        .ellipse(w / 2, 4, w / 2, 2.8)
        .stroke({ width: 2, color: 0xffe680, alpha: 0.95 });

      // Изящная позолоченная ручка
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 26);
      this.glassOverlay.bezierCurveTo(w + 24, 33, w + 24, 92, w - 1, 100);
      this.glassOverlay.stroke({ width: 4.8, color: 0xd4af37, alpha: 0.95 });
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 32);
      this.glassOverlay.bezierCurveTo(w + 14, 38, w + 14, 86, w - 1, 94);
      this.glassOverlay.stroke({ width: 1.8, color: 0xffe680, alpha: 0.8 });

      // Тонкие фарфоровые блики
      this.glassOverlay
        .roundRect(5, 12, 4, h - 34, 2)
        .fill({ color: 0xffffff, alpha: 0.45 });
      this.glassOverlay
        .roundRect(12, 16, 2, h - 46, 1)
        .fill({ color: 0xffffff, alpha: 0.3 });
    } else {
      // СКАНДИНАВСКОЕ СТЕКЛО (по умолчанию): легкие двойные стенки с чистыми бликами
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.lineTo(w, h - r);
      this.glassOverlay.quadraticCurveTo(w, h, w - r, h);
      this.glassOverlay.lineTo(r, h);
      this.glassOverlay.quadraticCurveTo(0, h, 0, h - r);
      this.glassOverlay.closePath();
      this.glassOverlay.fill({ color: 0xffffff, alpha: 0.12 });

      // Дно кружки
      this.glassOverlay
        .roundRect(4, h - 10, w - 8, 8, 3)
        .fill({ color: 0xffffff, alpha: 0.32 });

      // Четкий светящийся контур кружки
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(0, 4);
      this.glassOverlay.lineTo(0, h - r);
      this.glassOverlay.quadraticCurveTo(0, h, r, h);
      this.glassOverlay.lineTo(w - r, h);
      this.glassOverlay.quadraticCurveTo(w, h, w, h - r);
      this.glassOverlay.lineTo(w, 4);
      this.glassOverlay.stroke({ width: 2.8, color: 0xffffff, alpha: 0.82 });

      // Ободок горлышка
      this.glassOverlay
        .roundRect(-2, 1, w + 4, 6, 3)
        .fill({ color: 0xffffff, alpha: 0.55 });
      this.glassOverlay
        .ellipse(w / 2, 4, w / 2, 3)
        .stroke({ width: 1.8, color: 0xffffff, alpha: 0.8 });

      // Стеклянная ручка
      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 28);
      this.glassOverlay.bezierCurveTo(w + 22, 35, w + 22, 90, w - 1, 98);
      this.glassOverlay.stroke({ width: 5, color: 0xffffff, alpha: 0.75 });

      this.glassOverlay.beginPath();
      this.glassOverlay.moveTo(w - 1, 34);
      this.glassOverlay.bezierCurveTo(w + 14, 40, w + 14, 85, w - 1, 92);
      this.glassOverlay.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

      // Блики
      this.glassOverlay
        .roundRect(5, 12, 4.5, h - 34, 2.5)
        .fill({ color: 0xffffff, alpha: 0.35 });
      this.glassOverlay
        .roundRect(12, 16, 2.5, h - 46, 1.2)
        .fill({ color: 0xffffff, alpha: 0.22 });
      this.glassOverlay
        .roundRect(w - 9, 14, 3, h - 38, 1.5)
        .fill({ color: 0xffffff, alpha: 0.28 });
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
        const layerId = layers[i];
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
      const layerId = layers[i];
      const tea = TEA_TYPES[layerId];
      const y = bottomY - (i + 1) * layerH;

      if (cup.isLayerHidden(i)) {
        // «Таинственный настой»: скрытый слой под травяной пенкой и паром
        g.rect(0, y, w, layerH).fill({ color: 0x3d3028 });
        g.rect(2, y + 2, w - 4, layerH - 4).fill({ color: 0x5e4b3e, alpha: 0.9 });

        // Значок загадки «?»
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
    this.cupBodyContainer.rotation += (this.targetRotation - this.cupBodyContainer.rotation) * Math.min(1, delta * 12);

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

  currentSkin: CupSkinId = 'glass';

  setSkin(skinId: CupSkinId) {
    this.currentSkin = skinId;
    this.cupViews.forEach((v) => v.setSkin(skinId));
  }

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
    // Pre-bind _cancelResize so Pixi's ResizePlugin never encounters undefined _cancelResize
    (this.app as any)._cancelResize = () => {};
  }

  async init() {
    if (this.isDestroyed || this.isInitialized || this.isInitializing) return;
    this.isInitializing = true;

    try {
      // Ensure _cancelResize exists before and during init
      (this.app as any)._cancelResize = typeof (this.app as any)._cancelResize === 'function' ? (this.app as any)._cancelResize : () => {};

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
      this.canvasEl = (this.app.canvas || (this.app.renderer && (this.app.renderer as any).canvas)) as HTMLCanvasElement;
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

    // Ensure non-interactive graphic layers do not block mouse/touch clicks on cups
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

    this.app.ticker.add((ticker) => {
      this.update(ticker.deltaTime / 60);
    });

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
      view.setSkin(this.currentSkin);

      // Direct interactive event binding with pointer cursor and generous hit target
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

    // Dynamic responsive scale calculation
    // Adapts to mobile portrait screens (320px-430px) as well as tablets and desktops
    // Ensures headroom for tilt/pour animations (min 68px) and accounts for cup handles on the right
    const widthMargin = 28;
    const idealColWidth = 76;
    const scaleByWidth = (width - widthMargin) / (maxCols * idealColWidth + 16);
    const scaleByHeight = (height - 84) / (rowCount * baseCupH + (rowCount - 1) * 44 + 24);

    const cupScale = Math.max(0.72, Math.min(1.08, Math.min(scaleByWidth, scaleByHeight)));

    this.cupViews.forEach((v) => v.setScale(cupScale));

    const scaledCupW = baseCupW * cupScale;
    const scaledCupH = baseCupH * cupScale;
    const verticalGap = Math.max(26 * cupScale, Math.min(52 * cupScale, (height - rowCount * scaledCupH - 90) / Math.max(1, rowCount)));

    const totalContentH = rowCount * scaledCupH + (rowCount - 1) * verticalGap;
    // Guaranteed headroom for pouring cups so they never clip the top of the canvas
    const minHeadroom = Math.max(68 * cupScale, 56);
    const startY = Math.max(minHeadroom, (height - totalContentH) / 2 + 10);

    rows.forEach((rowIndices, rowIndex) => {
      const inRowCount = rowIndices.length;
      const rowY = startY + rowIndex * (scaledCupH + verticalGap);

      const availableW = width - 24;
      const maxSpacing = 94 * cupScale;
      const minSpacing = 62 * cupScale;
      const calculatedSpacing = inRowCount > 1
        ? (availableW - scaledCupW - 16 * cupScale) / (inRowCount - 1)
        : maxSpacing;
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
      const cx = view.homeX + view.visualWidth / 2 - 2;
      const cy = view.homeY + view.visualHeight - 4;
      this.tableGraphics
        .ellipse(cx, cy, view.visualWidth * 0.42, 6 * view.scale)
        .fill({ color: 0x080403, alpha: 0.5 });
    });
  }

  private setupInteractivity() {
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    // Stage-level click: acts as fallback touch handler and background deselect
    this.app.stage.on('pointerdown', (e) => {
      if (this.isAnimating) return;

      const clickPos = e.global;
      let clickedCupIndex: number | null = null;

      for (let i = 0; i < this.cupViews.length; i++) {
        const view = this.cupViews[i];
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
    const clickedCup = this.logic.cups[clickedIdx];
    const clickedView = this.cupViews[clickedIdx];

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

    if (sourceCup.canPourInto(clickedCup)) {
      this.lastInvalidTargetIndex = null;
      const res = this.logic.makeMove(sourceIdx, clickedIdx);
      if (res) {
        this.deselectCurrent(false);
        this.animatePour(sourceIdx, clickedIdx, res.move.layer, res.move.count, res.sourceUncovered);
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

  async animatePour(fromIdx: number, toIdx: number, layer: TeaId, count: number, sourceUncovered = false) {
    this.isAnimating = true;
    const sourceView = this.cupViews[fromIdx];
    const targetView = this.cupViews[toIdx];

    this.cupsContainer.setChildIndex(sourceView.container, this.cupsContainer.children.length - 1);

    const isLeft = sourceView.homeX <= targetView.homeX;
    const tiltSign = isLeft ? 1 : -1;
    const pourAngle = tiltSign * 0.88;

    const hoverOffsetX = 32 * targetView.scale;
    const hoverOffsetY = 66 * targetView.scale;

    let targetHoverX = isLeft
      ? targetView.homeX - hoverOffsetX
      : targetView.homeX + targetView.visualWidth + hoverOffsetX;

    // Mobile boundary safety clamping so tilting cup never overflows screen edges
    targetHoverX = Math.max(4, Math.min(this.app.screen.width - sourceView.visualWidth - 4, targetHoverX));
    const targetHoverY = Math.max(12, targetView.homeY - hoverOffsetY);

    sourceView.targetX = targetHoverX;
    sourceView.targetY = targetHoverY;
    sourceView.targetRotation = pourAngle;

    await this.wait(320);

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

      const spoutLocalX = isLeft ? sourceView.width - 2 : 2;
      const spoutLocalY = 4;
      const rotatedSpout = this.rotatePoint(
        spoutLocalX - sourceView.width / 2,
        spoutLocalY - 10,
        sourceView.cupBodyContainer.rotation
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
      this.triggerRevealSparkles(sourceView.homeX + sourceView.visualWidth / 2, sourceView.homeY + sourceView.visualHeight / 2);
    }

    sourceView.targetX = sourceView.homeX;
    sourceView.targetY = sourceView.homeY;
    sourceView.targetRotation = 0;
    sourceView.targetLift = 0;

    await this.wait(320);

    this.isAnimating = false;
    this.callbacks.onMoveComplete?.();

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
        color: goldColors[Math.floor(Math.random() * goldColors.length)],
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
    const midX = (x1 + x2) / 2 + (Math.sin(performance.now() * 0.03) * 2);
    const midY = (y1 + y2) / 2;
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 5.5, color: color, alpha: 0.9 });

    this.streamGraphics.beginPath();
    this.streamGraphics.moveTo(x1, y1);
    this.streamGraphics.quadraticCurveTo(midX, midY, x2, y2);
    this.streamGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });

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
      x: cupView.container.x + cupView.visualWidth / 2 + (Math.random() * 20 - 10) * cupView.scale,
      y: cupView.container.y + 10 * cupView.scale,
      vx: (Math.random() * 0.8 - 0.4),
      vy: -(Math.random() * 1.2 + 0.8),
      alpha: 0.35,
      maxAlpha: 0.35,
      scale: (Math.random() * 3 + 2) * cupView.scale,
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
        this.particlesGraphics
          .star(p.x, p.y, 4, s, s * 0.35)
          .fill({ color: p.color, alpha: p.alpha });
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
      const appAny = this.app as any;
      if (typeof appAny._cancelResize !== 'function') {
        appAny._cancelResize = () => {};
      }
      if (this.app.renderer) {
        this.app.destroy(true, { children: true, texture: false });
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
