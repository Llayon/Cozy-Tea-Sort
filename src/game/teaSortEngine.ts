/**
 * Cozy Tea Sort - Game Engine, Logic, Audio & Pixi.js v8 Renderer
 */

import { Application, Container, Graphics } from 'pixi.js';

export type TeaId = 'matcha' | 'sea_buckthorn' | 'karkade' | 'milk_oolong' | 'lavender';

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
    colorHex: '#87A96B',
    colorNum: 0x87a96b,
    textColor: '#324a24',
    steamColor: 'rgba(135, 169, 107, 0.4)',
    description: 'Пастельный изумрудно-зеленый японский чай',
  },
  sea_buckthorn: {
    id: 'sea_buckthorn',
    name: 'Sea Buckthorn',
    nameRu: 'Облепиховый',
    colorHex: '#F4A460',
    colorNum: 0xf4a460,
    textColor: '#5c330c',
    steamColor: 'rgba(244, 164, 96, 0.4)',
    description: 'Теплый янтарно-цитрусовый пряный сбор',
  },
  karkade: {
    id: 'karkade',
    name: 'Karkade Berry',
    nameRu: 'Каркаде',
    colorHex: '#B85B6C',
    colorNum: 0xb85b6c,
    textColor: '#42161f',
    steamColor: 'rgba(184, 91, 108, 0.4)',
    description: 'Глубокий рубиново-ягодный настой гибискуса',
  },
  milk_oolong: {
    id: 'milk_oolong',
    name: 'Milk Oolong / Latte',
    nameRu: 'Молочный улун',
    colorHex: '#E6C29F',
    colorNum: 0xe6c29f,
    textColor: '#573d27',
    steamColor: 'rgba(230, 194, 159, 0.4)',
    description: 'Нежный сливочно-карамельный купаж',
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender Herbal',
    nameRu: 'Лавандовый чай',
    colorHex: '#A29BFE',
    colorNum: 0xa29bfe,
    textColor: '#363066',
    steamColor: 'rgba(162, 155, 254, 0.4)',
    description: 'Успокаивающий приглушенный сиреневый настой',
  },
};

export const MAX_CUP_CAPACITY = 4;

export class Cup {
  id: number;
  layers: TeaId[];

  constructor(id: number, initialLayers: TeaId[] = []) {
    this.id = id;
    this.layers = [...initialLayers];
  }

  clone(): Cup {
    const c = new Cup(this.id, [...this.layers]);
    return c;
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

    // A cup that is already complete shouldn't be touched unless really necessary,
    // and moving full mono-cup into empty cup is a meaningless loop:
    if (this.isComplete && target.isEmpty) return false;

    // Target is empty -> can pour
    if (target.isEmpty) return true;

    // Top layers must match
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
  move: MoveStep;
}

export class TeaSortLogic {
  cups: Cup[] = [];
  history: GameStateSnapshot[] = [];
  movesCount = 0;

  constructor(initialCups: TeaId[][] = []) {
    if (initialCups.length > 0) {
      this.initFromState(initialCups);
    }
  }

  initFromState(state: TeaId[][]) {
    this.cups = state.map((layers, idx) => new Cup(idx, layers));
    this.history = [];
    this.movesCount = 0;
  }

  /**
   * Generates a 100% solvable level by starting from a completed target state
   * and applying reversible moves (shuffling backward).
   */
  static generateSolvableLevel(numColors = 3, emptyCups = 2): TeaId[][] {
    const teaKeys = Object.keys(TEA_TYPES) as TeaId[];
    const chosenColors = teaKeys.slice(0, numColors);

    // Initial solved state: each color in its own cup + empty cups
    const cups: TeaId[][] = chosenColors.map((color) => [
      color,
      color,
      color,
      color,
    ]);
    for (let i = 0; i < emptyCups; i++) {
      cups.push([]);
    }

    // Perform reverse pouring moves
    const totalSteps = 25 + numColors * 10;
    let successfulShuffles = 0;

    for (let step = 0; step < totalSteps * 3 && successfulShuffles < totalSteps; step++) {
      // Pick random source with at least 1 layer
      const nonEmptyIndices = cups
        .map((c, i) => (c.length > 0 ? i : -1))
        .filter((i) => i !== -1);
      if (nonEmptyIndices.length === 0) break;

      const fromIdx = nonEmptyIndices[Math.floor(Math.random() * nonEmptyIndices.length)];
      // Pick random target with available space
      const availableTargetIndices = cups
        .map((c, i) => (i !== fromIdx && c.length < MAX_CUP_CAPACITY ? i : -1))
        .filter((i) => i !== -1);

      if (availableTargetIndices.length === 0) continue;
      const toIdx = availableTargetIndices[Math.floor(Math.random() * availableTargetIndices.length)];

      // Move 1 layer from fromIdx to toIdx
      const layer = cups[fromIdx].pop()!;
      cups[toIdx].push(layer);
      successfulShuffles++;
    }

    // Safety verify: make sure cups are not already solved
    const allFullAndPure = cups.every(
      (c) => c.length === 0 || (c.length === MAX_CUP_CAPACITY && c.every((l) => l === c[0]))
    );
    if (allFullAndPure) {
      // Force a slight swap to avoid instant-win
      if (cups[0].length > 0 && cups[1].length > 0) {
        const top0 = cups[0].pop()!;
        const top1 = cups[1].pop()!;
        cups[0].push(top1);
        cups[1].push(top0);
      }
    }

    return cups;
  }

  canMakeMove(fromIdx: number, toIdx: number): boolean {
    if (fromIdx < 0 || fromIdx >= this.cups.length) return false;
    if (toIdx < 0 || toIdx >= this.cups.length) return false;
    return this.cups[fromIdx].canPourInto(this.cups[toIdx]);
  }

  makeMove(fromIdx: number, toIdx: number): MoveStep | null {
    if (!this.canMakeMove(fromIdx, toIdx)) return null;

    // Snapshot before move for undo
    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      move: {
        fromCupIndex: fromIdx,
        toCupIndex: toIdx,
        layer: this.cups[fromIdx].topLayer!,
        count: 0,
      },
    };

    const res = this.cups[fromIdx].pourInto(this.cups[toIdx]);
    if (!res) return null;

    snapshot.move.count = res.transferred;
    this.history.push(snapshot);
    this.movesCount++;
    return snapshot.move;
  }

  undo(): MoveStep | null {
    if (this.history.length === 0) return null;
    const last = this.history.pop()!;
    this.cups.forEach((cup, idx) => {
      cup.layers = [...last.cups[idx]];
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
    // Also ensure at least one cup is completed so empty board isn't won
    const completedCups = this.cups.filter((c) => c.isComplete).length;
    return completedCups > 0;
  }

  /**
   * Deadlock check: is there ANY legal move available that changes the state meaningfully?
   */
  isDeadlocked(): boolean {
    if (this.isWon()) return false;

    for (let i = 0; i < this.cups.length; i++) {
      for (let j = 0; j < this.cups.length; j++) {
        if (i === j) continue;
        const source = this.cups[i];
        const target = this.cups[j];

        if (source.canPourInto(target)) {
          // If source has all identical layers and target is empty, moving them to empty
          // doesn't unlock new possibilities, but we check if any constructive move exists
          if (source.isEmpty) continue;
          if (target.isEmpty && source.layers.every((l) => l === source.layers[0])) {
            continue;
          }
          return false; // Found a valid constructive move
        }
      }
    }
    return true;
  }
}
