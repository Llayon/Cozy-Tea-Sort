/**
 * G20 production template bank — 18 canonical F0 templates.
 *
 * Every instantiated/permuted template must solve to the recorded depth, use
 * the flask in one coherent COMMIT -> PRESSURE -> READY -> RELEASE -> EMPTY
 * cycle, and clean-decant without partial-release on the optimal replay.
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_STEEPING_FLASK_TEMPLATES,
  STEEPING_FLASK_DEPTH_ACCEPT,
  STEEPING_FLASK_TEMPLATE_BANK,
  instantiateSteepingFlaskTemplate,
} from '../src/game/logic/steepingFlaskTemplates';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  defaultCupConstraints,
  emptyFloatingIngredients,
  isSteepingFlaskConstraint,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  applyPourState,
  isPuzzleWonState,
  isSteepingFlaskReady,
  pourCountState,
  pourRejectCodeState,
} from '../src/game/logic/rules';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

interface ReplayFacts {
  commit: boolean;
  pressure: boolean;
  ready: boolean;
  release: boolean;
  clean: boolean;
  partial: boolean;
  empty: boolean;
  won: boolean;
  finalFlask: TeaId[];
}

function replay(
  cups: TeaId[][],
  constraints: CupConstraint[],
  flaskIndex: number,
  solution: Array<{ kind: string; from: number; to: number }>,
): ReplayFacts {
  let state = { cups: cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(cups.length) };
  let commit = false;
  let pressure = false;
  let ready = false;
  let release = false;
  let clean = false;
  let partial = false;
  let empty = false;
  let released = false;

  for (const action of solution) {
    if (action.kind !== 'pour') continue;
    const before = state.cups[flaskIndex] as TeaId[];
    const wasReady = isSteepingFlaskReady(before, constraints[flaskIndex]);
    if (before.length >= 1 && before.length <= 3) {
      const control = constraints.map((c, i) =>
        i === flaskIndex
          ? ({ mode: c.mode, capacity: c.capacity, mustEndEmpty: c.mustEndEmpty } as CupConstraint)
          : c,
      );
      for (let d = 0; d < state.cups.length; d++) {
        if (d === flaskIndex) continue;
        if (
          pourRejectCodeState(state, flaskIndex, d, constraints) === 'source-steeping-not-ready' &&
          pourRejectCodeState(state, flaskIndex, d, control) === 'ok' &&
          pourCountState(state, flaskIndex, d, control) > 0
        ) {
          pressure = true;
        }
      }
    }
    const result = applyPourState(state, action.from, action.to, constraints);
    if (!result) break;
    const after = result.state.cups[flaskIndex] as TeaId[];
    if (before.length === 0 && after.length >= 1 && after.length <= 3 && after.every((t) => t === after[0])) {
      commit = true;
    }
    if (!wasReady && isSteepingFlaskReady(after, constraints[flaskIndex])) ready = true;
    if (action.from === flaskIndex && wasReady) {
      release = true;
      released = true;
      if (after.length === 0) clean = true;
      else if (after.length >= 1 && after.length <= 3) partial = true;
    }
    if (released && after.length === 0) empty = true;
    state = result.state;
  }
  return {
    commit,
    pressure,
    ready,
    release,
    clean,
    partial,
    empty,
    won: isPuzzleWonState(state, constraints),
    finalFlask: state.cups[flaskIndex] as TeaId[],
  };
}

function build(template: (typeof ALL_STEEPING_FLASK_TEMPLATES)[number], order: TeaId[]) {
  const inst = instantiateSteepingFlaskTemplate(template, PALETTE, order);
  const constraints = defaultCupConstraints(inst.cups.length);
  constraints[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  const solved = solvePuzzle(inst.cups, {
    cupConstraints: constraints,
    floatingIngredients: emptyFloatingIngredients(inst.cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
  });
  return { inst, constraints, solved };
}

describe('G20 F0 template bank shape', () => {
  it('has 18 templates with unique ids and the F0 shape', () => {
    const bank = STEEPING_FLASK_TEMPLATE_BANK['steeping-flask'];
    expect(bank).toHaveLength(18);
    expect(new Set(bank.map((t) => t.id)).size).toBe(18);
    for (const tpl of bank) {
      const { inst } = build(tpl, PALETTE);
      expect(inst.cups).toHaveLength(6);
      expect(inst.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 0, 4, 4, 4, 4]);
      expect(inst.cups.flat()).toHaveLength(16);
      expect(inst.cups.filter((_, i) => i === inst.flaskSlot)).toHaveLength(1);
      expect(inst.cups[inst.flaskSlot]).toEqual([]);
      expect(inst.cups.filter((c) => c.length === 4).every((c) => new Set(c).size >= 2)).toBe(true);
    }
  });

  it('all templates are in the selected depth band', () => {
    for (const tpl of ALL_STEEPING_FLASK_TEMPLATES) {
      expect(tpl.depth).toBeGreaterThanOrEqual(STEEPING_FLASK_DEPTH_ACCEPT.min);
      expect(tpl.depth).toBeLessThanOrEqual(STEEPING_FLASK_DEPTH_ACCEPT.max);
    }
  });
});

describe('G20 bank replays: L2 + clean decant', () => {
  it('18/18 templates solve to exact depth and clean-decant', () => {
    for (const tpl of ALL_STEEPING_FLASK_TEMPLATES) {
      const { inst, constraints, solved } = build(tpl, PALETTE);
      expect(solved.solvable, tpl.id).toBe(true);
      expect(solved.truncated, tpl.id).not.toBe(true);
      expect(solved.minMoves, tpl.id).toBe(tpl.depth);
      const facts = replay(
        inst.cups,
        constraints,
        inst.flaskSlot,
        solved.solution as Array<{ kind: string; from: number; to: number }>,
      );
      expect(facts.commit, `${tpl.id} commit`).toBe(true);
      expect(facts.pressure, `${tpl.id} pressure`).toBe(true);
      expect(facts.ready, `${tpl.id} ready`).toBe(true);
      expect(facts.release, `${tpl.id} release`).toBe(true);
      expect(facts.clean, `${tpl.id} clean`).toBe(true);
      expect(facts.partial, `${tpl.id} partial`).toBe(false);
      expect(facts.empty, `${tpl.id} empty`).toBe(true);
      expect(facts.finalFlask, `${tpl.id} flask final`).toEqual([]);
      expect(facts.won, `${tpl.id} win`).toBe(true);
      expect(inst.cups.filter((c, i) => i === inst.flaskSlot)[0]).toEqual([]);
    }
  });

  it('survives >=6 deterministic TeaRole permutations per template', () => {
    const permutations: Array<[number, number, number, number]> = [
      [0, 1, 2, 3],
      [1, 0, 3, 2],
      [2, 3, 0, 1],
      [3, 2, 1, 0],
      [1, 2, 3, 0],
      [3, 0, 2, 1],
    ];
    for (const tpl of ALL_STEEPING_FLASK_TEMPLATES) {
      for (const p of permutations) {
        const order = p.map((i) => PALETTE[i] as TeaId);
        const { inst, constraints, solved } = build(tpl, order);
        expect(solved.solvable, `${tpl.id} perm ${p.join('')}`).toBe(true);
        expect(solved.minMoves, `${tpl.id} perm ${p.join('')}`).toBe(tpl.depth);
        const facts = replay(
          inst.cups,
          constraints,
          inst.flaskSlot,
          solved.solution as Array<{ kind: string; from: number; to: number }>,
        );
        expect(facts.clean, `${tpl.id} perm ${p.join('')} clean`).toBe(true);
        expect(facts.partial, `${tpl.id} perm ${p.join('')} partial`).toBe(false);
        expect(facts.won, `${tpl.id} perm ${p.join('')} win`).toBe(true);
      }
    }
  }, 120_000);

  it('bank contains at least 3 committed TeaRoles (actual roles) and one flask per template', () => {
    const roles = new Set<string>();
    for (const tpl of ALL_STEEPING_FLASK_TEMPLATES) {
      expect(tpl.cups.filter((_, i) => i === tpl.flaskIndex)).toHaveLength(1);
      expect(tpl.cups[tpl.flaskIndex]).toEqual([]);
      for (const layer of tpl.cups.flat()) roles.add(layer);
    }
    expect(roles.size).toBe(4);
  });
});
