/**
 * Single authoritative puzzle implementation (logic only, no Pixi).
 *
 * `TeaSortLogic` is the puzzle truth. `TeaSortView` renders it,
 * React owns progression/meta UI. Pixi never decides rewards.
 *
 * Asymmetric vessels (Gauntlets 1+3): each cup carries an immutable
 * `CupConstraint` (`normal` | `source-only` | `sink-only`). Vessel roles
 * never change during a level; undo/restart preserve them exactly. All
 * move legality delegates to the shared `rules.ts` table. Undo is
 * timeline reversal and restores exact previous layers even when forward
 * rules forbid pouring out of a sink-only guest cup.
 *
 * Floating ingredients (Gauntlet 5): each cup carries its own mutable
 * surface slot (`floatingIngredient`, default null) — the cups array is
 * the single source, and `toState()` reconstructs the aligned
 * `floatingIngredients` array from it. Snapshots capture exact slots, so
 * Undo restores lemon position with zero guessing.
 */

import {
  CupConstraint,
  FloatingIngredientSlot,
  TeaId,
  cloneCupConstraint,
  cupCapacity,
  isTastingCupConstraint,
  normalizeCupConstraints,
  normalizeFloatingIngredients,
} from '../types';
import {
  applyPourState,
  canPourState,
  cupEndStateSatisfied,
  isHomogeneous,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  topCountOf,
  topLayerOf,
} from './rules';

/** Named initial state for a level (preferred over long positional lists). */
export interface LevelInitialState {
  cups: TeaId[][];
  hiddenCounts?: number[];
  cupConstraints?: readonly CupConstraint[];
  floatingIngredients?: readonly FloatingIngredientSlot[];
}

export class Cup {
  id: number;
  layers: TeaId[];
  /** Number of bottom layers hidden under foam ("mystery tea"). Presentation only. */
  hiddenCount = 0;
  /**
   * Immutable vessel role: pour behavior (`mode`) + named-serving
   * destination (`targetTeaId`, if any). Default = normal, no target
   * (backwards compatible). Never mutated by moves/undo/restart.
   */
  constraint: CupConstraint = { mode: 'normal' };
  /**
   * Floating ingredient riding this vessel's surface (Gauntlet 5),
   * or null. Mutable dynamic state — moves/undo/restart update it
   * exactly; the cups array owns it (no second mutable truth).
   */
  floatingIngredient: FloatingIngredientSlot = null;

  constructor(
    id: number,
    initialLayers: TeaId[] = [],
    hiddenCount = 0,
    constraint?: CupConstraint,
    floatingIngredient: FloatingIngredientSlot = null,
  ) {
    this.id = id;
    this.layers = [...initialLayers];
    this.hiddenCount = Math.min(hiddenCount, Math.max(0, this.layers.length - 1));
    if (constraint) this.constraint = cloneCupConstraint(constraint);
    this.floatingIngredient = floatingIngredient ?? null;
  }

  clone(): Cup {
    const c = new Cup(
      this.id,
      [...this.layers],
      this.hiddenCount,
      cloneCupConstraint(this.constraint),
      this.floatingIngredient,
    );
    return c;
  }

  get mode(): 'normal' | 'source-only' | 'sink-only' {
    return this.constraint.mode;
  }

  get isSourceOnly(): boolean {
    return this.constraint.mode === 'source-only';
  }

  get isSinkOnly(): boolean {
    return this.constraint.mode === 'sink-only';
  }

  /** Named-serving destination, if this cup is a target cup. */
  get targetTeaId(): TeaId | undefined {
    return this.constraint.targetTeaId;
  }

  get isTargetCup(): boolean {
    return this.constraint.mode === 'normal' && this.constraint.targetTeaId !== undefined;
  }

  isLayerHidden(index: number): boolean {
    return index < this.hiddenCount;
  }

  /**
   * After layers are removed, a hidden bottom layer may now have a visible
   * layer above it removed so the foam no longer covers anything real.
   * Clamp the counter and report whether a reveal happened.
   */
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

  /** Effective vessel capacity (tasting bowl: 2, else standard). */
  get capacity(): number {
    return cupCapacity(this.constraint);
  }

  /** Full means full FOR THIS VESSEL (a 2/2 tasting bowl is full). */
  get isFull(): boolean {
    return this.layers.length >= this.capacity;
  }

  get isEmpty(): boolean {
    return this.layers.length === 0;
  }

  get remainingCapacity(): number {
    return this.capacity - this.layers.length;
  }

  get topLayer(): TeaId | null {
    return topLayerOf(this.layers);
  }

  get topCount(): number {
    return topCountOf(this.layers);
  }

  /**
   * Constraint-aware completion: a non-empty vessel already satisfying
   * its own end-state rule. A full tasting bowl is NOT complete (it must
   * be emptied); a wrongly-filled target is NOT complete either.
   */
  get isComplete(): boolean {
    return this.layers.length > 0 && cupEndStateSatisfied(this.layers, this.constraint);
  }

  /** Production tasting-bowl identification (delegates to the domain helper). */
  get isTastingBowl(): boolean {
    return isTastingCupConstraint(this.constraint);
  }

  get isHomogeneous(): boolean {
    return isHomogeneous(this.layers);
  }

  canPourInto(target: Cup): boolean {
    // Delegate to the shared state-aware rule table via a lightweight
    // board view. Slots travel alongside so ingredient collision is
    // honored here too.
    return canPourState(
      { cups: [this.layers, target.layers], floatingIngredients: [this.floatingIngredient, target.floatingIngredient] },
      0,
      1,
      [this.constraint, target.constraint],
    );
  }

  pourInto(target: Cup): { transferred: number; layer: TeaId; floatingIngredientMoved?: FloatingIngredientSlot } | null {
    const res = applyPourState(
      { cups: [this.layers, target.layers], floatingIngredients: [this.floatingIngredient, target.floatingIngredient] },
      0,
      1,
      [this.constraint, target.constraint],
    );
    if (!res) return null;
    this.layers = [...(res.state.cups[0] as TeaId[])];
    target.layers = [...(res.state.cups[1] as TeaId[])];
    this.floatingIngredient = res.state.floatingIngredients[0] ?? null;
    target.floatingIngredient = res.state.floatingIngredients[1] ?? null;
    return {
      transferred: res.transferred,
      layer: res.layer,
      floatingIngredientMoved: res.floatingIngredientMoved ?? null,
    };
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
  floatingIngredients: FloatingIngredientSlot[];
  move: MoveStep;
}

export class TeaSortLogic {
  cups: Cup[] = [];
  history: GameStateSnapshot[] = [];
  movesCount = 0;

  constructor(
    initialCups: TeaId[][] = [],
    hiddenCounts: number[] = [],
    cupConstraints?: readonly CupConstraint[],
    floatingIngredients?: readonly FloatingIngredientSlot[],
  ) {
    if (initialCups.length > 0) {
      this.initFromState(initialCups, hiddenCounts, cupConstraints, floatingIngredients);
    }
  }

  initFromState(
    state: TeaId[][],
    hiddenCounts: number[] = [],
    cupConstraints?: readonly CupConstraint[],
    floatingIngredients?: readonly FloatingIngredientSlot[],
  ) {
    const normalized = normalizeCupConstraints(cupConstraints, state.length);
    const slots = normalizeFloatingIngredients(floatingIngredients, state.length);
    this.cups = state.map(
      (layers, idx) =>
        new Cup(idx, layers, hiddenCounts[idx] ?? 0, normalized[idx] as CupConstraint, slots[idx] ?? null),
    );
    this.history = [];
    this.movesCount = 0;
  }

  /** Initialize from a named state object (preferred for lemon levels). */
  initFromPuzzleState(init: LevelInitialState): void {
    this.initFromState(init.cups, init.hiddenCounts, init.cupConstraints, init.floatingIngredients);
  }

  /** Immutable per-vessel constraints for the current puzzle (defensive copies). */
  get cupConstraints(): CupConstraint[] {
    return this.cups.map((c) => cloneCupConstraint(c.constraint));
  }

  /** Aligned floating-ingredient slots, reconstructed from the cups. */
  get floatingIngredients(): FloatingIngredientSlot[] {
    return this.cups.map((c) => c.floatingIngredient ?? null);
  }

  /** Current board as plain arrays (defensive copies). */
  toState(): {
    cups: TeaId[][];
    hiddenCounts: number[];
    cupConstraints: CupConstraint[];
    floatingIngredients: FloatingIngredientSlot[];
  } {
    return {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      cupConstraints: this.cupConstraints,
      floatingIngredients: this.floatingIngredients,
    };
  }

  private boardConstraints(): CupConstraint[] {
    return this.cups.map((c) => c.constraint);
  }

  private puzzleState(): { cups: TeaId[][]; floatingIngredients: FloatingIngredientSlot[] } {
    return {
      cups: this.cups.map((c) => c.layers),
      floatingIngredients: this.floatingIngredients,
    };
  }

  canMakeMove(fromIdx: number, toIdx: number): boolean {
    if (fromIdx < 0 || fromIdx >= this.cups.length) return false;
    if (toIdx < 0 || toIdx >= this.cups.length) return false;
    return canPourState(this.puzzleState(), fromIdx, toIdx, this.boardConstraints());
  }

  makeMove(
    fromIdx: number,
    toIdx: number,
  ): { move: MoveStep; sourceUncovered: boolean; floatingIngredientMoved?: FloatingIngredientSlot } | null {
    if (!this.canMakeMove(fromIdx, toIdx)) return null;

    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      floatingIngredients: this.floatingIngredients,
      move: {
        fromCupIndex: fromIdx,
        toCupIndex: toIdx,
        layer: this.cups[fromIdx]?.topLayer as TeaId,
        count: 0,
      },
    };

    const res = this.cups[fromIdx]?.pourInto(this.cups[toIdx] as Cup);
    if (!res) return null;

    const sourceUncovered = (this.cups[fromIdx] as Cup).revealTopIfNeeded();
    snapshot.move.count = res.transferred;
    this.history.push(snapshot);
    this.movesCount++;
    return {
      move: snapshot.move,
      sourceUncovered,
      floatingIngredientMoved: res.floatingIngredientMoved ?? null,
    };
  }

  undo(): MoveStep | null {
    if (this.history.length === 0) return null;
    const last = this.history.pop() as GameStateSnapshot;
    const slots = normalizeFloatingIngredients(last.floatingIngredients, this.cups.length);
    this.cups.forEach((cup, idx) => {
      cup.layers = [...(last.cups[idx] ?? [])];
      cup.hiddenCount = last.hiddenCounts[idx] ?? 0;
      cup.floatingIngredient = slots[idx] ?? null;
      // Constraints are immutable level-definition data: never restored
      // from snapshots, the teapot role stays fixed for the whole level.
    });
    this.movesCount = Math.max(0, this.movesCount - 1);
    return last.move;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  isWon(): boolean {
    return isPuzzleWonState(this.puzzleState(), this.boardConstraints());
  }

  isDeadlocked(): boolean {
    return isPuzzleDeadlockedState(this.puzzleState(), this.boardConstraints());
  }
}
