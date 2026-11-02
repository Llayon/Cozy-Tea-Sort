/** G21 FLASK_TRAY bank: 12 templates, C2, clean flask, tray cycle, C3/C3X. */
import { describe, expect, it } from 'vitest';
import {
  ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES,
  instantiateSteepingFlaskSharedTrayTemplate,
} from '../src/game/logic/steepingFlaskSharedTrayTemplates';
import {
  STEEPING_FLASK_CONSTRAINT,
  cloneCupConstraint,
  defaultCupConstraints,
  emptyFloatingIngredients,
  isSteepingFlaskConstraint,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import {
  applyPourState,
  isPuzzleWonState,
  pourRejectCodeState,
} from '../src/game/logic/rules';
import {
  analyzeSharedTrayParticipation,
  analyzeSteepingFlaskParticipation,
} from '../src/game/logic/generator';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 2, 3, 0],
  [3, 0, 2, 1],
];

function build(tpl: (typeof ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES)[number], order: TeaId[] = PALETTE) {
  const inst = instantiateSteepingFlaskSharedTrayTemplate(tpl, PALETTE, order);
  const cons = defaultCupConstraints(inst.cups.length);
  for (const member of inst.trayMembers) {
    cons[member] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  }
  cons[inst.flaskSlot] = cloneCupConstraint(STEEPING_FLASK_CONSTRAINT);
  const solved = solvePuzzle(inst.cups, {
    cupConstraints: cons,
    floatingIngredients: emptyFloatingIngredients(inst.cups.length),
    maxVisited: 200_000,
    maxDepth: 60,
    returnSolution: true,
  });
  return { inst, cons, solved };
}

function c2(inst: { cups: TeaId[][]; flaskSlot: number }, cons: CupConstraint[], solution: readonly any[]) {
  const flask = analyzeSteepingFlaskParticipation(inst.cups, solution, cons);
  const tray = analyzeSharedTrayParticipation(inst.cups, solution, cons);
  const final = applySolutionState(
    { cups: inst.cups, floatingIngredients: emptyFloatingIngredients(inst.cups.length) },
    solution,
    cons,
  );
  const flaskActive =
    flask.win &&
    flask.commitDepth !== null &&
    flask.pressureDepth !== null &&
    flask.readyDepth !== null &&
    flask.releaseDepth !== null &&
    flask.emptyDepth !== null &&
    flask.commitDepth <= flask.pressureDepth &&
    flask.pressureDepth < flask.readyDepth &&
    flask.readyDepth < flask.releaseDepth &&
    flask.releaseDepth <= flask.emptyDepth;
  const trayActive =
    tray.win &&
    tray.firstPressureDepth !== null &&
    tray.firstReleaseDepth !== null &&
    tray.firstRefillDepth !== null &&
    tray.firstPressureDepth < tray.firstReleaseDepth &&
    tray.firstReleaseDepth < tray.firstRefillDepth;
  return {
    ok: Boolean(flaskActive && trayActive && final && isPuzzleWonState(final, cons)),
    flask,
    tray,
  };
}

describe('G21 FLASK_TRAY template bank', () => {
  it('has 12 canonical templates with the winner topology', () => {
    expect(ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES).toHaveLength(12);
    expect(new Set(ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES.map((t) => t.id)).size).toBe(12);
    expect(new Set(ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES.map((t) => t.cups.flat().join(''))).size).toBe(12);
    for (const tpl of ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES) {
      const { inst, cons } = build(tpl);
      expect(inst.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
      expect(inst.trayMembers).toEqual([2, 3]);
      expect(inst.flaskSlot).toBe(5);
      expect(inst.cups[5]).toEqual([]);
      expect(cons.filter(isSteepingFlaskConstraint)).toHaveLength(1);
      expect(cons.filter((c) => c.sharedCapacityGroup === 'tea-tray')).toHaveLength(2);
      expect((inst.cups[2] as TeaId[]).length + (inst.cups[3] as TeaId[]).length).toBe(6);
      expect(tpl.depth).toBeGreaterThanOrEqual(10);
      expect(tpl.depth).toBeLessThanOrEqual(15);
      expect(tpl.c3).toBe(true);
      expect(tpl.c3x).toBe(true);
    }
  });

  it('12/12 solve at exact depth, C2, clean decant, no partial release', () => {
    for (const tpl of ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES) {
      const { inst, cons, solved } = build(tpl);
      expect(solved.solvable, tpl.id).toBe(true);
      expect(solved.truncated, tpl.id).not.toBe(true);
      expect(solved.minMoves, tpl.id).toBe(tpl.depth);
      const facts = c2(inst, cons, solved.solution as any[]);
      expect(facts.ok, tpl.id).toBe(true);
      expect(facts.flask.cleanDecant, tpl.id).toBe(true);
      expect(facts.flask.partialRelease, tpl.id).toBe(false);
      expect(facts.tray.firstPressureDepth as number).toBeLessThan(facts.tray.firstReleaseDepth as number);
      expect(facts.tray.firstReleaseDepth as number).toBeLessThan(facts.tray.firstRefillDepth as number);
    }
  });

  it('6 role permutations per template stay C2 in the production depth band', () => {
    for (const tpl of ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES) {
      for (const perm of PERMS) {
        const order = perm.map((i) => PALETTE[i] as TeaId);
        const { inst, cons, solved } = build(tpl, order);
        expect(solved.solvable, `${tpl.id} ${perm}`).toBe(true);
        expect(solved.minMoves, `${tpl.id} ${perm}`).toBeGreaterThanOrEqual(10);
        expect(solved.minMoves, `${tpl.id} ${perm}`).toBeLessThanOrEqual(15);
        expect(c2(inst, cons, solved.solution as any[]).ok, `${tpl.id} ${perm}`).toBe(true);
      }
    }
  }, 120_000);

  it('control paths expose both single-mechanic relaxations', () => {
    const tpl = ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES[0] as (typeof ALL_STEEPING_FLASK_SHARED_TRAY_TEMPLATES)[number];
    const { inst, cons, solved } = build(tpl);
    expect(solved.solvable).toBe(true);
    const flaskOnly = cons.map((c) => {
      const n = cloneCupConstraint(c);
      delete (n as { steepingFlask?: unknown }).steepingFlask;
      return n;
    });
    const trayOnly = cons.map((c) => {
      const n = cloneCupConstraint(c);
      delete (n as { sharedCapacityGroup?: unknown }).sharedCapacityGroup;
      return n;
    });
    for (const control of [flaskOnly, trayOnly]) {
      const r = solvePuzzle(inst.cups, {
        cupConstraints: control,
        floatingIngredients: emptyFloatingIngredients(inst.cups.length),
        maxVisited: 200_000,
        maxDepth: 60,
        returnSolution: true,
      });
      expect(r.solvable).toBe(true);
      let state = { cups: inst.cups.map((c) => [...c]), floatingIngredients: emptyFloatingIngredients(inst.cups.length) };
      let invalid = false;
      for (const action of r.solution ?? []) {
        if (action.kind !== 'pour') continue;
        const result = applyPourState(state, action.from as number, action.to as number, cons);
        if (!result) {
          invalid = true;
          break;
        }
        state = result.state as typeof state;
      }
      expect(invalid).toBe(true);
      void pourRejectCodeState;
    }
  });
});
