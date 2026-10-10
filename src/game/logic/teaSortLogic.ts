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
  CapacityObstacleId,
  CapacityObstacleSlot,
  CupConstraint,
  FloatingIngredientSlot,
  IceId,
  IceSlot,
  PuzzleAction,
  SinkingIngredientSlot,
  StrainerState,
  TeaBudId,
  TeaBudSlot,
  TeaId,
  cloneCupConstraint,
  cloneStrainerState,
  cupCapacity,
  emptyStrainerState,
  isTastingCupConstraint,
  isThermosCupConstraint,
  normalizeCapacityObstacles,
  normalizeCupConstraints,
  normalizeFloatingIngredients,
  normalizeIceSlots,
  normalizeSinkingIngredients,
  normalizeStrainerState,
  normalizeTeaBudSlots,
} from '../types';
import {
  applyPlaceStrainerState,
  applyPourState,
  applyReleaseStrainerState,
  canPlaceStrainerState,
  canPourState,
  canReleaseStrainerState,
  cupEndStateSatisfied,
  isHomogeneous,
  isPuzzleDeadlockedState,
  isPuzzleWonState,
  placeStrainerRejectCodeState,
  releaseStrainerRejectCodeState,
  topCountOf,
  topLayerOf,
  type StrainerPlaceRejectCode,
  type StrainerReleaseRejectCode,
} from './rules';
import type { BlendReactionMetadata, BlendRecipe } from './blendRecipe';

/** Named initial state for a level (preferred over long positional lists). */
export interface LevelInitialState {
  cups: TeaId[][];
  hiddenCounts?: number[];
  cupConstraints?: readonly CupConstraint[];
  floatingIngredients?: readonly FloatingIngredientSlot[];
  sinkingIngredients?: readonly SinkingIngredientSlot[];
  strainer?: StrainerState;
  iceSlots?: readonly IceSlot[];
  capacityObstacles?: readonly CapacityObstacleSlot[];
  teaBudSlots?: readonly TeaBudSlot[];
  /**
   * Static blend recipe (G13). Immutable level data — never PuzzleState.
   * When undefined every rule behaves exactly as before (legacy identical).
   */
  blendRecipe?: BlendRecipe | undefined | null;
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
  /**
   * Sinking ingredient settled at this vessel's bottom (Gauntlet 7 —
   * «Мёд на дне»), or null. Mutable dynamic state owned by the cups
   * array exactly like the floating slot (no second mutable truth).
   */
  sinkingIngredient: SinkingIngredientSlot = null;
  /**
   * Frozen-cup ice overlay (Gauntlet 9 — «Замёрзшая чашка»), or null.
   * Mutable dynamic state owned by the cups array exactly like the
   * ingredient slots (no second mutable truth, no Cup.hasIce duplicate).
   */
  ice: IceSlot = null;
  /**
   * Dynamic capacity obstacle (Gauntlet 11 — «Палочка корицы»), or null.
   * Mutable dynamic state owned by the cups array exactly like the ice
   * slot (no second mutable truth, no cupIndex duplicate). The static
   * constraint (base capacity) is never mutated.
   */
  capacityObstacle: CapacityObstacleSlot = null;
  /**
   * Dormant tea bud (Gauntlet 12 — «Чайный бутон»), or null. Mutable
   * dynamic state owned by the cups array exactly like the ice slot (no
   * second mutable truth, no budIndex duplicate). Physically below the tea;
   * never consumes capacity, never a TeaId.
   */
  teaBud: TeaBudSlot = null;

  constructor(
    id: number,
    initialLayers: TeaId[] = [],
    hiddenCount = 0,
    constraint?: CupConstraint,
    floatingIngredient: FloatingIngredientSlot = null,
    sinkingIngredient: SinkingIngredientSlot = null,
    ice: IceSlot = null,
    capacityObstacle: CapacityObstacleSlot = null,
    teaBud: TeaBudSlot = null,
  ) {
    this.id = id;
    this.layers = [...initialLayers];
    this.hiddenCount = Math.min(hiddenCount, Math.max(0, this.layers.length - 1));
    if (constraint) this.constraint = cloneCupConstraint(constraint);
    this.floatingIngredient = floatingIngredient ?? null;
    this.sinkingIngredient = sinkingIngredient ?? null;
    this.ice = ice ?? null;
    this.capacityObstacle = capacityObstacle ?? null;
    this.teaBud = teaBud ?? null;
  }

  clone(): Cup {
    const c = new Cup(
      this.id,
      [...this.layers],
      this.hiddenCount,
      cloneCupConstraint(this.constraint),
      this.floatingIngredient,
      this.sinkingIngredient,
      this.ice,
      this.capacityObstacle,
      this.teaBud,
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

  /** Production thermos identification (delegates to the domain helper, no dynamic state). */
  get isThermos(): boolean {
    return isThermosCupConstraint(this.constraint);
  }

  get isHomogeneous(): boolean {
    return isHomogeneous(this.layers);
  }

  canPourInto(target: Cup, blendRecipe?: BlendRecipe | undefined | null): boolean {
    // Delegate to the shared state-aware rule table via a lightweight
    // board view. Slots travel alongside so ingredient collision (and ice
    // legality) is honored here too.
    return canPourState(
      {
        cups: [this.layers, target.layers],
        floatingIngredients: [this.floatingIngredient, target.floatingIngredient],
        sinkingIngredients: [this.sinkingIngredient, target.sinkingIngredient],
        iceSlots: [this.ice, target.ice],
        capacityObstacles: [this.capacityObstacle, target.capacityObstacle],
        teaBudSlots: [this.teaBud, target.teaBud],
      },
      0,
      1,
      [this.constraint, target.constraint],
      blendRecipe,
    );
  }

  pourInto(target: Cup, blendRecipe?: BlendRecipe | undefined | null): { transferred: number; layer: TeaId; floatingIngredientMoved?: FloatingIngredientSlot; sinkingIngredientMoved?: SinkingIngredientSlot; iceMelted?: IceId; capacityObstacleRemoved?: CapacityObstacleId; teaBudBloomed?: TeaBudId | null; reaction?: BlendReactionMetadata } | null {
    const res = applyPourState(
      {
        cups: [this.layers, target.layers],
        floatingIngredients: [this.floatingIngredient, target.floatingIngredient],
        sinkingIngredients: [this.sinkingIngredient, target.sinkingIngredient],
        iceSlots: [this.ice, target.ice],
        capacityObstacles: [this.capacityObstacle, target.capacityObstacle],
        teaBudSlots: [this.teaBud, target.teaBud],
      },
      0,
      1,
      [this.constraint, target.constraint],
      blendRecipe,
    );
    if (!res) return null;
    this.layers = [...(res.state.cups[0] as TeaId[])];
    target.layers = [...(res.state.cups[1] as TeaId[])];
    this.floatingIngredient = res.state.floatingIngredients[0] ?? null;
    target.floatingIngredient = res.state.floatingIngredients[1] ?? null;
    this.sinkingIngredient = res.state.sinkingIngredients[0] ?? null;
    target.sinkingIngredient = res.state.sinkingIngredients[1] ?? null;
    this.ice = res.state.iceSlots[0] ?? null;
    target.ice = res.state.iceSlots[1] ?? null;
    this.capacityObstacle = res.state.capacityObstacles[0] ?? null;
    target.capacityObstacle = res.state.capacityObstacles[1] ?? null;
    this.teaBud = res.state.teaBudSlots[0] ?? null;
    target.teaBud = res.state.teaBudSlots[1] ?? null;
    return {
      transferred: res.transferred,
      layer: res.layer,
      floatingIngredientMoved: res.floatingIngredientMoved ?? null,
      sinkingIngredientMoved: res.sinkingIngredientMoved ?? null,
      iceMelted: res.iceMelted,
      capacityObstacleRemoved: res.capacityObstacleRemoved,
      teaBudBloomed: res.teaBudBloomed,
      reaction: res.reaction,
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
  sinkingIngredients: SinkingIngredientSlot[];
  strainer: StrainerState;
  iceSlots: IceSlot[];
  capacityObstacles: CapacityObstacleSlot[];
  teaBudSlots: TeaBudSlot[];
  action: PuzzleAction;
  move: MoveStep;
}

export class TeaSortLogic {
  cups: Cup[] = [];
  history: GameStateSnapshot[] = [];
  movesCount = 0;
  private strainer: StrainerState = emptyStrainerState();
  /**
   * Static blend recipe (G13). Immutable level data — set at init, never
   * mutated by moves/undo/restart. When undefined every rule behaves exactly
   * as before (legacy identical).
   */
  blendRecipe: BlendRecipe | undefined = undefined;

  constructor(
    initialCups: TeaId[][] = [],
    hiddenCounts: number[] = [],
    cupConstraints?: readonly CupConstraint[],
    floatingIngredients?: readonly FloatingIngredientSlot[],
    strainer?: StrainerState,
    sinkingIngredients?: readonly SinkingIngredientSlot[],
    iceSlots?: readonly IceSlot[],
    capacityObstacles?: readonly CapacityObstacleSlot[],
    teaBudSlots?: readonly TeaBudSlot[],
    blendRecipe?: BlendRecipe | undefined | null,
  ) {
    if (initialCups.length > 0) {
      this.initFromState(initialCups, hiddenCounts, cupConstraints, floatingIngredients, strainer, sinkingIngredients, iceSlots, capacityObstacles, teaBudSlots, blendRecipe);
    } else if (blendRecipe) {
      this.blendRecipe = blendRecipe;
    }
  }

  initFromState(
    state: TeaId[][],
    hiddenCounts: number[] = [],
    cupConstraints?: readonly CupConstraint[],
    floatingIngredients?: readonly FloatingIngredientSlot[],
    strainer?: StrainerState,
    sinkingIngredients?: readonly SinkingIngredientSlot[],
    iceSlots?: readonly IceSlot[],
    capacityObstacles?: readonly CapacityObstacleSlot[],
    teaBudSlots?: readonly TeaBudSlot[],
    blendRecipe?: BlendRecipe | undefined | null,
  ) {
    const normalized = normalizeCupConstraints(cupConstraints, state.length);
    const slots = normalizeFloatingIngredients(floatingIngredients, state.length);
    const sinkSlots = normalizeSinkingIngredients(sinkingIngredients, state.length);
    const ice = normalizeIceSlots(iceSlots, state.length);
    const obstacles = normalizeCapacityObstacles(capacityObstacles, state.length);
    const buds = normalizeTeaBudSlots(teaBudSlots, state.length);
    this.cups = state.map(
      (layers, idx) =>
        new Cup(
          idx,
          layers,
          hiddenCounts[idx] ?? 0,
          normalized[idx] as CupConstraint,
          slots[idx] ?? null,
          sinkSlots[idx] ?? null,
          ice[idx] ?? null,
          obstacles[idx] ?? null,
          buds[idx] ?? null,
        ),
    );
    this.strainer = normalizeStrainerState(strainer);
    this.blendRecipe = blendRecipe ?? undefined;
    this.history = [];
    this.movesCount = 0;
  }

  /** Initialize from a named state object (preferred for lemon/strainer levels). */
  initFromPuzzleState(init: LevelInitialState): void {
    this.initFromState(
      init.cups,
      init.hiddenCounts,
      init.cupConstraints,
      init.floatingIngredients,
      init.strainer,
      init.sinkingIngredients,
      init.iceSlots,
      init.capacityObstacles,
      init.teaBudSlots,
      init.blendRecipe,
    );
  }

  get strainerState(): StrainerState {
    return cloneStrainerState(this.strainer);
  }

  /** Immutable per-vessel constraints for the current puzzle (defensive copies). */
  get cupConstraints(): CupConstraint[] {
    return this.cups.map((c) => cloneCupConstraint(c.constraint));
  }

  /** Aligned floating-ingredient slots, reconstructed from the cups. */
  get floatingIngredients(): FloatingIngredientSlot[] {
    return this.cups.map((c) => c.floatingIngredient ?? null);
  }

  /** Aligned sinking-ingredient slots, reconstructed from the cups. */
  get sinkingIngredients(): SinkingIngredientSlot[] {
    return this.cups.map((c) => c.sinkingIngredient ?? null);
  }

  /** Aligned ice slots, reconstructed from the cups. */
  get iceSlots(): IceSlot[] {
    return this.cups.map((c) => c.ice ?? null);
  }

  /** Aligned capacity-obstacle slots, reconstructed from the cups. */
  get capacityObstacles(): CapacityObstacleSlot[] {
    return this.cups.map((c) => c.capacityObstacle ?? null);
  }

  /** Aligned tea-bud slots, reconstructed from the cups. */
  get teaBudSlots(): TeaBudSlot[] {
    return this.cups.map((c) => c.teaBud ?? null);
  }

  /** Current board as plain arrays (defensive copies). */
  toState(): {
    cups: TeaId[][];
    hiddenCounts: number[];
    cupConstraints: CupConstraint[];
    floatingIngredients: FloatingIngredientSlot[];
    sinkingIngredients: SinkingIngredientSlot[];
    strainer: StrainerState;
    iceSlots: IceSlot[];
    capacityObstacles: CapacityObstacleSlot[];
    teaBudSlots: TeaBudSlot[];
    blendRecipe?: BlendRecipe | undefined;
  } {
    return {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      cupConstraints: this.cupConstraints,
      floatingIngredients: this.floatingIngredients,
      sinkingIngredients: this.sinkingIngredients,
      strainer: cloneStrainerState(this.strainer),
      iceSlots: this.iceSlots,
      capacityObstacles: this.capacityObstacles,
      teaBudSlots: this.teaBudSlots,
      ...(this.blendRecipe ? { blendRecipe: this.blendRecipe } : {}),
    };
  }

  private boardConstraints(): CupConstraint[] {
    return this.cups.map((c) => c.constraint);
  }

  private puzzleState(): { cups: TeaId[][]; floatingIngredients: FloatingIngredientSlot[]; sinkingIngredients: SinkingIngredientSlot[]; strainer: StrainerState; iceSlots: IceSlot[]; capacityObstacles: CapacityObstacleSlot[]; teaBudSlots: TeaBudSlot[] } {
    return {
      cups: this.cups.map((c) => c.layers),
      floatingIngredients: this.floatingIngredients,
      sinkingIngredients: this.sinkingIngredients,
      strainer: cloneStrainerState(this.strainer),
      iceSlots: this.iceSlots,
      capacityObstacles: this.capacityObstacles,
      teaBudSlots: this.teaBudSlots,
    };
  }

  private applyBoardState(next: { cups: TeaId[][]; floatingIngredients: FloatingIngredientSlot[]; sinkingIngredients: SinkingIngredientSlot[]; strainer: StrainerState; iceSlots: IceSlot[]; capacityObstacles: CapacityObstacleSlot[]; teaBudSlots?: readonly TeaBudSlot[] }): void {
    next.cups.forEach((layers, idx) => {
      const cup = this.cups[idx];
      if (cup) cup.layers = [...layers];
    });
    const slots = normalizeFloatingIngredients(next.floatingIngredients, this.cups.length);
    const sinkSlots = normalizeSinkingIngredients(next.sinkingIngredients, this.cups.length);
    const ice = normalizeIceSlots(next.iceSlots, this.cups.length);
    const obstacles = normalizeCapacityObstacles(next.capacityObstacles, this.cups.length);
    const buds = normalizeTeaBudSlots(next.teaBudSlots, this.cups.length);
    this.cups.forEach((cup, idx) => {
      cup.floatingIngredient = slots[idx] ?? null;
      cup.sinkingIngredient = sinkSlots[idx] ?? null;
      cup.ice = ice[idx] ?? null;
      cup.capacityObstacle = obstacles[idx] ?? null;
      cup.teaBud = buds[idx] ?? null;
    });
    this.strainer = normalizeStrainerState(next.strainer);
  }

  canMakeMove(fromIdx: number, toIdx: number): boolean {
    if (fromIdx < 0 || fromIdx >= this.cups.length) return false;
    if (toIdx < 0 || toIdx >= this.cups.length) return false;
    return canPourState(this.puzzleState(), fromIdx, toIdx, this.boardConstraints(), this.blendRecipe);
  }

  makeMove(
    fromIdx: number,
    toIdx: number,
  ): { move: MoveStep; sourceUncovered: boolean; strained: boolean; caughtTea?: TeaId; floatingIngredientMoved?: FloatingIngredientSlot; sinkingIngredientMoved?: SinkingIngredientSlot; iceMelted?: IceId; capacityObstacleRemoved?: CapacityObstacleId; teaBudBloomed?: TeaBudId | null; reaction?: BlendReactionMetadata } | null {
    if (!this.canMakeMove(fromIdx, toIdx)) return null;

    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      floatingIngredients: this.floatingIngredients,
      sinkingIngredients: this.sinkingIngredients,
      strainer: cloneStrainerState(this.strainer),
      iceSlots: this.iceSlots,
      capacityObstacles: this.capacityObstacles,
      teaBudSlots: this.teaBudSlots,
      action: { kind: 'pour', from: fromIdx, to: toIdx },
      move: {
        fromCupIndex: fromIdx,
        toCupIndex: toIdx,
        layer: this.cups[fromIdx]?.topLayer as TeaId,
        count: 0,
      },
    };

    const res = applyPourState(this.puzzleState(), fromIdx, toIdx, this.boardConstraints(), this.blendRecipe);
    if (!res) return null;
    this.applyBoardState(res.state);

    const sourceUncovered = (this.cups[fromIdx] as Cup).revealTopIfNeeded();
    snapshot.move.count = res.transferred;
    this.history.push(snapshot);
    this.movesCount++;
    return {
      move: snapshot.move,
      sourceUncovered,
      strained: res.strained,
      caughtTea: res.caughtTea,
      floatingIngredientMoved: res.floatingIngredientMoved ?? null,
      sinkingIngredientMoved: res.sinkingIngredientMoved ?? null,
      iceMelted: res.iceMelted,
      capacityObstacleRemoved: res.capacityObstacleRemoved,
      teaBudBloomed: res.teaBudBloomed,
      reaction: res.reaction,
    };
  }

  canPlaceStrainer(toIdx: number): boolean {
    return canPlaceStrainerState(this.puzzleState(), toIdx, this.boardConstraints());
  }

  placeStrainerRejectCode(toIdx: number): StrainerPlaceRejectCode {
    return placeStrainerRejectCodeState(this.puzzleState(), toIdx, this.boardConstraints());
  }

  placeStrainer(toIdx: number): { action: PuzzleAction } | null {
    if (!this.canPlaceStrainer(toIdx)) return null;
    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      floatingIngredients: this.floatingIngredients,
      sinkingIngredients: this.sinkingIngredients,
      strainer: cloneStrainerState(this.strainer),
      iceSlots: this.iceSlots,
      capacityObstacles: this.capacityObstacles,
      teaBudSlots: this.teaBudSlots,
      action: { kind: 'place-strainer', to: toIdx },
      move: { fromCupIndex: -1, toCupIndex: toIdx, layer: this.cups[toIdx]?.topLayer as TeaId, count: 0 },
    };
    const next = applyPlaceStrainerState(this.puzzleState(), toIdx, this.boardConstraints());
    if (!next) return null;
    this.applyBoardState(next);
    this.history.push(snapshot);
    return { action: { kind: 'place-strainer', to: toIdx } };
  }

  canReleaseStrainer(toIdx: number): boolean {
    return canReleaseStrainerState(this.puzzleState(), toIdx, this.boardConstraints());
  }

  releaseStrainerRejectCode(toIdx: number): StrainerReleaseRejectCode {
    return releaseStrainerRejectCodeState(this.puzzleState(), toIdx, this.boardConstraints());
  }

  releaseStrainer(toIdx: number): { move: MoveStep; layer: TeaId } | null {
    if (!this.canReleaseStrainer(toIdx)) return null;
    const held = this.strainer.heldTea as TeaId;
    const snapshot: GameStateSnapshot = {
      cups: this.cups.map((c) => [...c.layers]),
      hiddenCounts: this.cups.map((c) => c.hiddenCount),
      floatingIngredients: this.floatingIngredients,
      sinkingIngredients: this.sinkingIngredients,
      strainer: cloneStrainerState(this.strainer),
      iceSlots: this.iceSlots,
      capacityObstacles: this.capacityObstacles,
      teaBudSlots: this.teaBudSlots,
      action: { kind: 'release-strainer', to: toIdx },
      move: { fromCupIndex: -1, toCupIndex: toIdx, layer: held, count: 1 },
    };
    const res = applyReleaseStrainerState(this.puzzleState(), toIdx, this.boardConstraints());
    if (!res) return null;
    this.applyBoardState(res.state);
    this.history.push(snapshot);
    this.movesCount++;
    return { move: snapshot.move, layer: res.layer };
  }

  undo(): PuzzleAction | MoveStep | null {
    if (this.history.length === 0) return null;
    const last = this.history.pop() as GameStateSnapshot;
    const slots = normalizeFloatingIngredients(last.floatingIngredients, this.cups.length);
    const sinkSlots = normalizeSinkingIngredients(last.sinkingIngredients, this.cups.length);
    const ice = normalizeIceSlots(last.iceSlots, this.cups.length);
    const obstacles = normalizeCapacityObstacles(last.capacityObstacles, this.cups.length);
    const buds = normalizeTeaBudSlots(last.teaBudSlots, this.cups.length);
    this.cups.forEach((cup, idx) => {
      cup.layers = [...(last.cups[idx] ?? [])];
      cup.hiddenCount = last.hiddenCounts[idx] ?? 0;
      cup.floatingIngredient = slots[idx] ?? null;
      cup.sinkingIngredient = sinkSlots[idx] ?? null;
      cup.ice = ice[idx] ?? null;
      cup.capacityObstacle = obstacles[idx] ?? null;
      cup.teaBud = buds[idx] ?? null;
    });
    this.strainer = cloneStrainerState(last.strainer);
    if (last.action.kind === 'pour' || last.action.kind === 'release-strainer') {
      this.movesCount = Math.max(0, this.movesCount - 1);
    }
    return last.action.kind === 'pour' ? last.move : last.action;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  isWon(): boolean {
    return isPuzzleWonState(this.puzzleState(), this.boardConstraints(), this.blendRecipe);
  }

  isDeadlocked(): boolean {
    return isPuzzleDeadlockedState(this.puzzleState(), this.boardConstraints(), this.blendRecipe);
  }
}
