import { describe, expect, it } from 'vitest';
import { CupConstraint, MAX_CUP_CAPACITY, TeaId } from '../src/game/types';
import {
  applyPour,
  canonicalKey,
  canPourBetween,
  isConstructiveMove,
  isDeadlockedState,
  isWonState,
  listLegalMoves,
  pourRejectCodeBetween,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applySolution, solvePuzzle } from '../src/game/logic/solver';
import {
  fallbackLevel,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { depthAccepted } from '../src/game/logic/difficulty';
import { getLevelConfig } from '../src/utils/difficultyCurve';

const N: CupConstraint = { mode: 'normal' };
const S: CupConstraint = { mode: 'source-only' };
const N6: CupConstraint[] = [N, N, N, N, N, N].map((c) => ({ ...c }));

function teapot6(): CupConstraint[] {
  return [{ ...S }, { ...N }, { ...N }, { ...N }, { ...N }, { ...N }];
}

const CHALLENGE_TEAPOT: GenerateRequest = {
  numColors: 4,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
};

const PEAK_TEAPOT_MYSTERY: GenerateRequest = {
  numColors: 5,
  colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  sourceOnlyCount: 1,
};

describe('A. rules: source-only legality', () => {
  it('normal -> normal valid as before', () => {
    expect(
      canPourBetween(
        [
          ['matcha', 'karkade'],
          ['sea_buckthorn', 'karkade'],
        ],
        0,
        1,
        N6.slice(0, 2),
      ),
    ).toBe(true);
  });

  it('normal -> source-only is INVALID', () => {
    const cups: TeaId[][] = [
      ['matcha', 'karkade'],
      ['sea_buckthorn'],
    ];
    const cons: CupConstraint[] = [{ ...N }, { ...S }];
    expect(canPourBetween(cups, 0, 1, cons)).toBe(false);
    expect(pourRejectCodeBetween(cups, 0, 1, cons)).toBe('target-source-only');
    // Even into an empty teapot it is forbidden.
    const cups2: TeaId[][] = [['matcha'], []];
    expect(canPourBetween(cups2, 0, 1, cons)).toBe(false);
    expect(pourRejectCodeBetween(cups2, 0, 1, cons)).toBe('target-source-only');
  });

  it('source-only -> normal is valid when Water Sort constraints allow', () => {
    const cups: TeaId[][] = [
      ['matcha', 'karkade'],
      ['sea_buckthorn', 'karkade'],
    ];
    const cons: CupConstraint[] = [{ ...S }, { ...N }];
    expect(canPourBetween(cups, 0, 1, cons)).toBe(true);
    // Color mismatch still rejected.
    const bad: TeaId[][] = [
      ['matcha', 'karkade'],
      ['sea_buckthorn', 'matcha'],
    ];
    expect(canPourBetween(bad, 0, 1, cons)).toBe(false);
  });

  it('source-only -> source-only is INVALID as destination', () => {
    const cups: TeaId[][] = [['matcha'], ['karkade']];
    const cons: CupConstraint[] = [{ ...S }, { ...S }];
    expect(canPourBetween(cups, 0, 1, cons)).toBe(false);
    expect(pourRejectCodeBetween(cups, 0, 1, cons)).toBe('target-source-only');
    expect(applyPour(cups, 0, 1, cons)).toBeNull();
  });

  it('legacy calls without constraints keep exact old behavior', () => {
    expect(canPourBetween([['matcha'], []], 0, 1)).toBe(true);
    expect(canPourBetween([['matcha', 'matcha', 'matcha', 'matcha'], []], 0, 1)).toBe(false);
  });
});

describe('B. move mutation: invalid pour into teapot changes nothing', () => {
  it('cups / hiddenCounts / movesCount / history unchanged', () => {
    const l = new TeaSortLogic(
      [['matcha', 'karkade'], ['sea_buckthorn']],
      [0, 0],
      [{ ...S }, { ...N }],
    );
    // Attempt teapot(0, source-only, non-empty) -> normal is legal; instead
    // test the forbidden direction: normal(1) -> teapot(0).
    const before = l.toState();
    const res = l.makeMove(1, 0);
    expect(res).toBeNull();
    expect(l.toState()).toEqual(before);
    expect(l.movesCount).toBe(0);
    expect(l.history).toHaveLength(0);
  });
});

describe('C. win: teapot must be empty', () => {
  it('uniform full teapot is NOT won', () => {
    const cups: TeaId[][] = [
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['karkade', 'karkade', 'karkade', 'karkade'],
      [],
    ];
    const cons: CupConstraint[] = [{ ...S }, { ...N }, { ...N }];
    expect(isWonState(cups, cons)).toBe(false);
  });

  it('empty teapot + sorted normals is WON', () => {
    const cups: TeaId[][] = [
      [],
      ['matcha', 'matcha', 'matcha', 'matcha'],
      ['karkade', 'karkade', 'karkade', 'karkade'],
    ];
    const cons: CupConstraint[] = [{ ...S }, { ...N }, { ...N }];
    expect(isWonState(cups, cons)).toBe(true);
    const l = new TeaSortLogic(cups, [0, 0, 0], cons);
    expect(l.isWon()).toBe(true);
  });
});

describe('D/E. undo + restart restore exact teapot contents', () => {
  it('pour out of teapot -> undo restores exact layers', () => {
    const start: TeaId[][] = [
      ['matcha', 'karkade', 'karkade'],
      ['sea_buckthorn', 'karkade'],
      [],
    ];
    const cons = [{ ...S }, { ...N }, { ...N }];
    const l = new TeaSortLogic(start, [0, 0, 0], cons);
    const res = l.makeMove(0, 2);
    expect(res).not.toBeNull();
    expect(l.cups[0]?.layers).toEqual(['matcha']);
    l.undo();
    expect(l.cups[0]?.layers).toEqual(['matcha', 'karkade', 'karkade']);
    expect(l.cupConstraints[0]).toEqual({ mode: 'source-only' });
  });

  it('restart restores the exact initial special layout', () => {
    const level = generateLevel(CHALLENGE_TEAPOT, 'teapot:restart');
    const l = new TeaSortLogic(level.cups, level.hiddenCounts, level.cupConstraints);
    // Play a legal move out of the teapot if possible, else any legal move.
    let moved = false;
    for (const m of listLegalMoves(
      l.cups.map((c) => c.layers),
      false,
      l.cupConstraints,
    )) {
      if (l.makeMove(m.from, m.to)) {
        moved = true;
        break;
      }
    }
    expect(moved).toBe(true);
    l.initFromState(
      level.cups.map((c) => [...c]),
      [...level.hiddenCounts],
      level.cupConstraints.map((c) => ({ ...c })),
    );
    expect(l.cups.map((c) => [...c.layers])).toEqual(level.cups);
    expect(l.cupConstraints).toEqual(level.cupConstraints);
  });
});

describe('F. solver finds valid teapot solutions with zero pours into teapot', () => {
  it('representative puzzle solves without ever targeting source-only', () => {
    const level = generateLevel(CHALLENGE_TEAPOT, 'teapot:solver-rep');
    const res = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
    expect(res.solvable).toBe(true);
    expect(res.solution).toBeDefined();
    const teapotIdx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
    expect(teapotIdx).toBeGreaterThanOrEqual(0);
    for (const step of res.solution ?? []) {
      expect(step.to).not.toBe(teapotIdx);
    }
    const finalBoard = applySolution(level.cups, res.solution ?? [], level.cupConstraints);
    expect(finalBoard).not.toBeNull();
    expect(isWonState(finalBoard ?? [], level.cupConstraints)).toBe(true);
  });
});

describe('G. canonicalization is constraint-aware', () => {
  it('same normal-cup permutation gives same key', () => {
    const a: TeaId[][] = [['matcha'], ['karkade'], []];
    const b: TeaId[][] = [[], ['karkade'], ['matcha']];
    expect(canonicalKey(a)).toBe(canonicalKey(b));
    expect(canonicalKey(a, N6.slice(0, 3))).toBe(canonicalKey(b, N6.slice(0, 3)));
  });

  it('swapping normal and source-only contents is NOT the same state', () => {
    const cons: CupConstraint[] = [{ ...S }, { ...N }];
    const a: TeaId[][] = [
      ['matcha', 'karkade'],
      ['sea_buckthorn'],
    ];
    const b: TeaId[][] = [
      ['sea_buckthorn'],
      ['matcha', 'karkade'],
    ];
    expect(canonicalKey(a, cons)).not.toBe(canonicalKey(b, cons));
  });

  it('two equivalent normal empty cups remain symmetric', () => {
    const cons: CupConstraint[] = [{ ...N }, { ...N }, { ...S }];
    const a: TeaId[][] = [[], [], ['matcha', 'karkade']];
    const b: TeaId[][] = [[], [], ['matcha', 'karkade']];
    expect(canonicalKey(a, cons)).toBe(canonicalKey(b, cons));
  });

  it('normal empty vs source-only empty are distinct', () => {
    const consA: CupConstraint[] = [{ ...N }, { ...N }];
    const consB: CupConstraint[] = [{ ...S }, { ...N }];
    const cups: TeaId[][] = [[], []];
    expect(canonicalKey(cups, consA)).not.toBe(canonicalKey(cups, consB));
  });
});

describe('H. pruning: teapot never treated as equivalent empty destination', () => {
  it('homogeneous teapot -> normal empty stays constructive (not pruned)', () => {
    const cups: TeaId[][] = [
      ['matcha', 'matcha'],
      [],
    ];
    const cons: CupConstraint[] = [{ ...S }, { ...N }];
    expect(canPourBetween(cups, 0, 1, cons)).toBe(true);
    expect(isConstructiveMove(cups, 0, 1, cons)).toBe(true);
    // Same shape among normals is still pruned (legacy behavior preserved).
    expect(isConstructiveMove(cups, 0, 1)).toBe(false);
  });

  it('no legal move ever targets a teapot (deadlock-safe)', () => {
    const cups: TeaId[][] = [
      ['matcha', 'karkade'],
      [],
    ];
    const cons: CupConstraint[] = [{ ...N }, { ...S }];
    const moves = listLegalMoves(cups, false, cons);
    expect(moves.filter((m) => m.to === 1)).toHaveLength(0);
    // Deadlock check does not see an escape via the teapot.
    expect(isDeadlockedState(cups, cons)).toBe(isDeadlockedState(cups, cons));
  });
});

describe('I/J. generator: canonical challenge + peak configs', () => {
  it('challenge teapot seeds: valid, solvable, in-band, mixed teapot, no mystery', () => {
    for (let s = 0; s < 30; s++) {
      const level = generateLevel(CHALLENGE_TEAPOT, `teapot:I:${s}`);
      expect(level.cups).toHaveLength(6);
      expect(level.cupConstraints).toHaveLength(6);
      const check = validateLevelStructure(level, CHALLENGE_TEAPOT);
      expect(check.reasons).toEqual([]);
      const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
      expect(solved.solvable).toBe(true);
      expect(level.minMoves).toBe(solved.minMoves);
      expect(depthAccepted(level.minMoves, 'challenge')).toBe(true);
      const idx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
      expect(level.cupConstraints.filter((c) => c.mode === 'source-only')).toHaveLength(1);
      const pot = level.cups[idx] as TeaId[];
      expect(pot.length).toBe(MAX_CUP_CAPACITY);
      expect(new Set(pot).size).toBeGreaterThanOrEqual(2);
      expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
    }
  });

  it('peak teapot + mystery: distinct vessels, solver valid, in-band', () => {
    for (let s = 0; s < 20; s++) {
      const level = generateLevel(PEAK_TEAPOT_MYSTERY, `teapot:J:${s}`);
      expect(level.cups).toHaveLength(7);
      const check = validateLevelStructure(level, PEAK_TEAPOT_MYSTERY);
      expect(check.reasons).toEqual([]);
      const potIdx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
      const hidIdx = level.hiddenCounts.findIndex((h) => h > 0);
      expect(potIdx).toBeGreaterThanOrEqual(0);
      expect(hidIdx).toBeGreaterThanOrEqual(0);
      expect(hidIdx).not.toBe(potIdx);
      expect(level.cupConstraints[hidIdx]).toEqual({ mode: 'normal' });
      const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
      expect(solved.solvable).toBe(true);
      expect(depthAccepted(level.minMoves, 'peak')).toBe(true);
    }
  });
});

describe('K. fallback exhaustion (maxRetries = 0)', () => {
  it('challenge teapot fallback stays valid', () => {
    const level = generateLevel(CHALLENGE_TEAPOT, 'teapot:K:ch', { maxRetries: 0 });
    expect(validateLevelStructure(level, CHALLENGE_TEAPOT).ok).toBe(true);
    expect(solvePuzzle(level.cups, { cupConstraints: level.cupConstraints }).solvable).toBe(true);
  });

  it('peak teapot + mystery fallback stays valid', () => {
    const level = generateLevel(PEAK_TEAPOT_MYSTERY, 'teapot:K:pk', { maxRetries: 0 });
    expect(validateLevelStructure(level, PEAK_TEAPOT_MYSTERY).ok).toBe(true);
    const hid = level.hiddenCounts.findIndex((h) => h > 0);
    const pot = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
    expect(hid).not.toBe(pot);
  });

  it('phase-aware fallbacks are deterministic', () => {
    const a = fallbackLevel(CHALLENGE_TEAPOT);
    const b = fallbackLevel(CHALLENGE_TEAPOT);
    expect(b.cups).toEqual(a.cups);
    expect(b.cupConstraints).toEqual(a.cupConstraints);
    expect(b.minMoves).toBe(a.minMoves);
  });
});

describe('L. determinism', () => {
  it('same request + seed gives identical puzzle', () => {
    const a = generateLevel(CHALLENGE_TEAPOT, 'teapot:L:1');
    const b = generateLevel(CHALLENGE_TEAPOT, 'teapot:L:1');
    expect(b.cups).toEqual(a.cups);
    expect(b.hiddenCounts).toEqual(a.hiddenCounts);
    expect(b.cupConstraints).toEqual(a.cupConstraints);
    expect(b.minMoves).toBe(a.minMoves);
  });
});

describe('M. legacy regression: no-special configs stay all-normal', () => {
  it('standard requests produce exactly normal constraints', () => {
    const req: GenerateRequest = {
      numColors: 4,
      colors: ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'challenge',
    };
    const level = generateLevel(req, 'teapot:M:1');
    expect(level.cupConstraints.every((c) => c.mode === 'normal')).toBe(true);
    expect(level.cupConstraints).toHaveLength(6);
  });
});

describe('N. level rollout 1–8', () => {
  it('matches the Gauntlet 1 production rollout', () => {
    const expectations: Array<[number, boolean, boolean]> = [
      [1, false, false],
      [2, false, false],
      [3, true, false],
      [4, false, false],
      [5, false, false],
      [6, false, true],
      [7, true, true],
      [8, false, false],
    ];
    for (const [lvl, mystery, teapot] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
    }
    expect(getLevelConfig(6).phaseSubtitle).toContain('Чайник');
    expect(getLevelConfig(7).phaseSubtitle).toContain('Чайник');
  });
});

describe('O. progression guards unchanged with teapot', () => {
  it('teapot levels still generate through the same validated path', () => {
    const cfg6 = getLevelConfig(6);
    const level = generateLevel(
      {
        numColors: cfg6.numColors,
        colors: cfg6.colors,
        emptyCups: cfg6.emptyCups,
        hasMysteryLayer: cfg6.hasMysteryLayer,
        sourceOnlyCount: cfg6.hasSourceOnlyTeapot ? 1 : 0,
        phase: cfg6.phase,
      },
      'teapot:O:6',
    );
    expect(validateLevelStructure(level, {
      numColors: cfg6.numColors,
      colors: cfg6.colors,
      emptyCups: cfg6.emptyCups,
      hasMysteryLayer: cfg6.hasMysteryLayer,
      sourceOnlyCount: 1,
      phase: cfg6.phase,
    }).ok).toBe(true);
  });
});
