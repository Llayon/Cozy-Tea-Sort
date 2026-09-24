/**
 * Single authoritative puzzle implementation (logic only, no Pixi).
 *
 * `TeaSortLogic` is the puzzle truth. `TeaSortView` renders it,
 * React owns progression/meta UI. Pixi never decides rewards.
 *
 * Asymmetric vessels (Gauntlet 1): each cup carries an immutable
 * `CupConstraint` (`normal` | `source-only`). The teapot role never
 * changes during a level; undo/restart preserve it exactly. All move
 * legality delegates to the shared `rules.ts` table.
 */

import {
  CupConstraint,
  MAX_CUP_CAPACITY,
  TeaId,
  cloneCupConstraint,
  normalizeCupConstraints,
} from '../types';
import {
  applyPour,
  canPourBetween,
  isCompleteCup,
  isDeadlockedState,
  isHomogeneous,
  isWonState,
  topCountOf,
  topLayerOf,
} from './rules';

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

  constructor(id: number, initialLayers: TeaId[] = [], hiddenCount = 0, constraint?: CupConstraint) {
    this.id = id;
    this.layers = [...initialLayers];
    this.hiddenCount = Math.min(hiddenCount, Math.max(0, this.layers.length - 1));
    if (constraint) this.constraint = cloneCupConstraint(constraint);
  }

  clone(): Cup {
    return new Cup(this.id, [...this.layers], this.hiddenCount, cloneCupConstraint(this.constraint));
  }

  get mode(): 'normal' | 'source-only' {
    return this.constraint.mode;
  }

  get isSourceOnly(): boolean {
    return this.constraint.mode === 'source-only';
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
    return topLayerOf(this.layers);
  }

  get topCount(): number {
    return topCountOf(this.layers);
  }

  get isComplete(): boolean {
    return isCompleteCup(this.layers);
  }

  get isHomogeneous(): boolean {
    return isHomogeneous(this.layers);
  }

  canPourInto(target: Cup): boolean {
    // Delegate to the shared rule table via lightweight board view.
    // Constraints travel alongside so teapot-as-destination is rejected here.
    return canPourBetween(
      [this.layers, target.layers],
      0,
      1,
      [this.constraint, target.constraint],
    );
  }

  pourInto(target: Cup): { transferred: number; layer: TeaId } | null {
    const res = applyPour(
      [this.layers, target.layers],
      0,
      1,
      [this.constraint, target.constraint],
    );
    if (!res) return null;
    this.layers = [...(res.cups[0] as TeaId[])];
    target.layers = [...(res.cups[1] as TeaId[])];
    return { transferred: res.transferred, layer: res.layer };
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

  constructor(
    initialCups: TeaId[][] = [],
    hiddenCounts: number[] = [],
    cupConstraints?: readonly CupConstraint[],
  ) {
    if (initialCups.length > 0) {
      this.initFromState(initialCups, hiddenCounts, cupConstraints);
    }
  }

  initFromState(
    state: TeaId[][],
    hiddenCounts: number[] = [],
    cupConstraints?: readonly CupConstraint[],
  ) {
    const normalized = normalizeCupConstraints(cupConstraints, state.length);
    this.cups = state.map(
      (layers, idx) =>
        new Cup(idx, layers, hiddenCounts[idx] ?? 0, normalized[idx] as CupConstraint),
    );
    this.history = [];
    this.movesCount = 0;
  }

  /** Immutable per-vessel constraints for the current puzzle (defensive copies). */
  get cupConstraints(): CupConstraint[] {
    return this.cups.map((c) => cloneCupConstraint(c.constraint));
  }

  /** Current board as plain arrays (defensive copies). */
  toState(): { cups: TeaId[][]; hiddenCounts: number[]; cupConstraints: CupConstraint[] } {
    return {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      cupConstraints: this.cupConstraints,
    };
  }

  private boardConstraints(): CupConstraint[] {
    return this.cups.map((c) => c.constraint);
  }

  canMakeMove(fromIdx: number, toIdx: number): boolean {
    if (fromIdx < 0 || fromIdx >= this.cups.length) return false;
    if (toIdx < 0 || toIdx >= this.cups.length) return false;
    const board = this.cups.map((c) => c.layers);
    return canPourBetween(board, fromIdx, toIdx, this.boardConstraints());
  }

  makeMove(fromIdx: number, toIdx: number): { move: MoveStep; sourceUncovered: boolean } | null {
    if (!this.canMakeMove(fromIdx, toIdx)) return null;

    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
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
    return { move: snapshot.move, sourceUncovered };
  }

  undo(): MoveStep | null {
    if (this.history.length === 0) return null;
    const last = this.history.pop() as GameStateSnapshot;
    this.cups.forEach((cup, idx) => {
      cup.layers = [...(last.cups[idx] ?? [])];
      cup.hiddenCount = last.hiddenCounts[idx] ?? 0;
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
    return isWonState(
      this.cups.map((c) => c.layers),
      this.boardConstraints(),
    );
  }

  isDeadlocked(): boolean {
    return isDeadlockedState(
      this.cups.map((c) => c.layers),
      this.boardConstraints(),
    );
  }
}
