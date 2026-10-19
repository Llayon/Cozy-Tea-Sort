/**
 * G16 shared-tray undo/restart/reshuffle (§§145-147): no dynamic shared
 * state exists, so undo is exact snapshot restoration; restart restores the
 * exact starting arrangement + static tray constraints; reshuffle keeps the
 * P33 class with a fresh template/seed.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, SolverAction, TeaId } from '../src/game/types';
import { emptyFloatingIngredients } from '../src/game/types';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { generateLevel } from '../src/game/logic/generator';
import { solvePuzzle } from '../src/game/logic/solver';
import {
  SHARED_TRAY_TEMPLATE_BANK,
  instantiateSharedTrayTemplate,
} from '../src/game/logic/sharedTrayTemplates';
import { sharedCapacityOccupancy } from '../src/game/logic/sharedCapacity';

const PAL: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function traySetup() {
  const tpl = SHARED_TRAY_TEMPLATE_BANK['shared-tray'][0]!;
  const inst = instantiateSharedTrayTemplate(tpl, PAL);
  const cons: CupConstraint[] = Array.from({ length: 6 }, () => ({ mode: 'normal' as const }));
  for (const m of inst.trayMembers) cons[m] = { mode: 'normal', sharedCapacityGroup: 'tea-tray' };
  return { inst, cons };
}

const occOf = (cups: TeaId[][], cons: readonly CupConstraint[]) =>
  sharedCapacityOccupancy({ cups, floatingIngredients: emptyFloatingIngredients(cups.length) }, cons, 'tea-tray');

describe('undo after GROUP_RELEASE (§145)', () => {
  it('undo release restores exact tea + derived occupancy + usability', () => {
    const { inst, cons } = traySetup();
    const logic = new TeaSortLogic(inst.cups, inst.cups.map(() => 0), cons);
    expect(occOf(logic.cups.map((c) => [...c.layers]), cons)).toBe(6);
    // First optimal move is a tray→outside release (fixture-verified).
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, returnSolution: true });
    const first = (r.solution as SolverAction[])[0] as SolverAction;
    expect(first.kind).toBe('pour');
    const fp = first as unknown as { from: number; to: number };
    const mv = logic.makeMove(fp.from, fp.to);
    expect(mv).not.toBe(null);
    expect(occOf(logic.cups.map((c) => [...c.layers]), cons)).toBeLessThan(6);
    logic.undo();
    expect(logic.cups.map((c) => [...c.layers])).toEqual(inst.cups);
    expect(occOf(logic.cups.map((c) => [...c.layers]), cons)).toBe(6);
    expect(logic.movesCount).toBe(0);
    // Usability restored: the release is legal again.
    expect(logic.canMakeMove(fp.from, fp.to)).toBe(true);
  });

  it('full solve then full undo restores the start exactly', () => {
    const { inst, cons } = traySetup();
    const logic = new TeaSortLogic(inst.cups, inst.cups.map(() => 0), cons);
    const r = solvePuzzle(inst.cups, { cupConstraints: cons, returnSolution: true });
    const sol = r.solution as SolverAction[];
    for (const a of sol) {
      if (a.kind !== 'pour') continue;
      const p = a as { from: number; to: number };
      expect(logic.makeMove(p.from, p.to)).not.toBe(null);
    }
    expect(logic.isWon()).toBe(true);
    for (let i = 0; i < sol.length; i++) logic.undo();
    expect(logic.cups.map((c) => [...c.layers])).toEqual(inst.cups);
    expect(logic.movesCount).toBe(0);
    expect(logic.isWon()).toBe(false);
  });
});

describe('restart (§146)', () => {
  it('same production seed regenerates identical tea + tray constraints', () => {
    const mkReq = () => ({
      numColors: 4,
      colors: [...PAL],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge' as const,
      sharedTrayCount: 1,
    });
    const a = generateLevel(mkReq(), 'shared-restart-seed');
    const b = generateLevel(mkReq(), 'shared-restart-seed');
    expect(a.cups).toEqual(b.cups);
    expect(a.cupConstraints).toEqual(b.cupConstraints);
    expect(a.minMoves).toBe(b.minMoves);
    expect(a.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length).toBe(2);
  });
});

describe('reshuffle (§147)', () => {
  it('fresh seed keeps the P33 class with valid tray constraints', () => {
    const mkReq = () => ({
      numColors: 4,
      colors: [...PAL],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge' as const,
      sharedTrayCount: 1,
    });
    const lvl = generateLevel(mkReq(), 'shared-reshuffle-fresh-seed');
    expect(lvl.cups.map((c) => c.length).sort((x, y) => x - y)).toEqual([0, 2, 3, 3, 4, 4]);
    expect(lvl.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length).toBe(2);
    expect(occOf(lvl.cups, lvl.cupConstraints)).toBe(6);
  });
});
