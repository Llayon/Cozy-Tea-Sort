import { describe, expect, it } from 'vitest';
import {
  CupConstraint,
  MAX_CUP_CAPACITY,
  TeaId,
  cloneCupConstraint,
  cupConstraintSignature,
  normalizeCupConstraints,
} from '../src/game/types';
import {
  applyPour,
  canonicalKey,
  canPourBetween,
  isInFinalState,
  isWonState,
  listLegalMoves,
  pourRejectCodeBetween,
  targetCupState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import { applySolution, solvePuzzle } from '../src/game/logic/solver';
import {
  fallbackLevel,
  generateLevel,
  requestedTargetTeas,
  validateLevelStructure,
  validateTargetRequest,
  type GeneratedLevel,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { depthAccepted } from '../src/game/logic/difficulty';
import { applyWin } from '../src/game/logic/progression';
import { getLevelConfig, mechanicPlanForLevel, pickTargetPair } from '../src/utils/difficultyCurve';

const N = (targetTeaId?: TeaId): CupConstraint =>
  targetTeaId === undefined ? { mode: 'normal' } : { mode: 'normal', targetTeaId };
const S: CupConstraint = { mode: 'source-only' };

const LAV = 'lavender' as TeaId;
const KAR = 'karkade' as TeaId;

const TARGET_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  targetTeaIds: ['lavender', 'karkade'],
};

const TARGET_MYSTERY_PEAK: GenerateRequest = {
  numColors: 5,
  colors: ['saffron', 'buckwheat', 'matcha', 'karkade', 'lavender'],
  emptyCups: 2,
  hasMysteryLayer: true,
  phase: 'peak',
  targetTeaIds: ['lavender', 'karkade'],
};

const TEAPOT_TARGET_CHALLENGE: GenerateRequest = {
  numColors: 4,
  colors: ['saffron', 'lavender', 'karkade', 'milk_oolong'],
  emptyCups: 2,
  hasMysteryLayer: false,
  phase: 'challenge',
  sourceOnlyCount: 1,
  targetTeaIds: ['lavender', 'karkade'],
};

describe('A. domain: target constraint normalization', () => {
  it('normal target constraint normalizes correctly', () => {
    const out = normalizeCupConstraints([{ mode: 'normal', targetTeaId: LAV }], 1);
    expect(out).toEqual([{ mode: 'normal', targetTeaId: LAV }]);
  });

  it('missing constraints still synthesize plain normals (legacy)', () => {
    expect(normalizeCupConstraints(undefined, 2)).toEqual([
      { mode: 'normal' },
      { mode: 'normal' },
    ]);
  });

  it('targetTeaId preserved through clone and signature', () => {
    const c: CupConstraint = { mode: 'normal', targetTeaId: LAV };
    expect(cloneCupConstraint(c)).toEqual(c);
    expect(cloneCupConstraint(c)).not.toBe(c);
    expect(cupConstraintSignature(c)).toBe('N:lavender');
    expect(cupConstraintSignature({ mode: 'normal' })).toBe('N:_');
    expect(cupConstraintSignature({ mode: 'source-only' })).toBe('S:_');
  });

  it('target request helpers validate loudly, never silently', () => {
    expect(requestedTargetTeas(TARGET_CHALLENGE)).toEqual(['lavender', 'karkade']);
    expect(() =>
      validateTargetRequest({ ...TARGET_CHALLENGE, targetTeaIds: ['lavender', 'lavender'] }),
    ).toThrow(/duplicate/);
    expect(() =>
      validateTargetRequest({ ...TARGET_CHALLENGE, targetTeaIds: ['lavender', 'buckwheat'] }),
    ).toThrow(/palette/);
    expect(() =>
      validateTargetRequest({
        ...TARGET_MYSTERY_PEAK,
        sourceOnlyCount: 1,
        targetTeaIds: ['saffron', 'buckwheat', 'matcha', 'karkade', 'lavender'],
      }),
    ).toThrow(/exceed/);
  });
});

describe('B. canonicalization: targets are distinct groups', () => {
  it('normal vs target-lavender: different keys', () => {
    const cups: TeaId[][] = [[LAV], []];
    expect(canonicalKey(cups, [N(), N()])).not.toBe(canonicalKey(cups, [N(LAV), N()]));
  });

  it('target-lavender vs target-karkade: different keys', () => {
    const cups: TeaId[][] = [[LAV], []];
    expect(canonicalKey(cups, [N(LAV), N()])).not.toBe(canonicalKey(cups, [N(KAR), N()]));
  });

  it('two identical target-lavender constraints stay symmetric', () => {
    const a: TeaId[][] = [[LAV], [KAR]];
    const b: TeaId[][] = [[KAR], [LAV]];
    const cons: CupConstraint[] = [N(LAV), N(LAV)];
    expect(canonicalKey(a, cons)).toBe(canonicalKey(b, cons));
  });

  it('source-only vs target: different keys', () => {
    const cups: TeaId[][] = [[], []];
    expect(canonicalKey(cups, [{ ...S }, N()])).not.toBe(
      canonicalKey(cups, [N(LAV), N()]),
    );
  });
});

describe('C. legality: target cups pour exactly like ordinary cups', () => {
  it('temporary wrong-color use is legal when Water Sort rules allow', () => {
    // Target lavender cup holding karkade on top receives karkade.
    const cups: TeaId[][] = [[LAV, KAR], [KAR]];
    const cons: CupConstraint[] = [N(LAV), N()];
    expect(canPourBetween(cups, 1, 0, cons)).toBe(true);
    expect(pourRejectCodeBetween(cups, 1, 0, cons)).toBe('ok');
    // And pours back out normally too.
    expect(canPourBetween(cups, 0, 1, cons)).toBe(true);
  });

  it('empty target accepts any tea (no target-wrong-color rejection)', () => {
    const cups: TeaId[][] = [[KAR], []];
    const cons: CupConstraint[] = [N(), N(LAV)];
    expect(canPourBetween(cups, 0, 1, cons)).toBe(true);
    expect(applyPour(cups, 0, 1, cons)).not.toBeNull();
  });

  it('full homogeneous WRONG tea may leave its target (real progress)', () => {
    const cups: TeaId[][] = [
      [KAR, KAR, KAR, KAR],
      [],
    ];
    const cons: CupConstraint[] = [N(LAV), N()];
    expect(canPourBetween(cups, 0, 1, cons)).toBe(true);
    // A correctly served target spilling into a PLAIN empty is still a
    // legal (silly, undoable) mistake — groups differ, so no loop pruning.
    const served: TeaId[][] = [
      [LAV, LAV, LAV, LAV],
      [],
    ];
    expect(canPourBetween(served, 0, 1, cons)).toBe(true);
    // …while spilling into an IDENTICAL target cup is pruned as a loop.
    expect(canPourBetween(served, 0, 1, [N(LAV), N(LAV)])).toBe(false);
    expect(isInFinalState([LAV, LAV, LAV, LAV], N(LAV))).toBe(true);
    expect(isInFinalState([KAR, KAR, KAR, KAR], N(LAV))).toBe(false);
  });

  it('partial homogeneous stacks stay legal into empties (legacy intact)', () => {
    // Legacy: only FULL homogeneous cups are ever rejected as
    // complete-to-empty; partial stacks (even single layers) are legal.
    expect(canPourBetween([['matcha'], []], 0, 1)).toBe(true);
    expect(canPourBetween([[KAR, KAR], []], 0, 1, [N(LAV), N()])).toBe(true);
  });

  it('TeaSortLogic pours through target cups with no extra rules', () => {
    const l = new TeaSortLogic([[LAV, KAR], [KAR]], [0, 0], [N(LAV), N()]);
    const res = l.makeMove(1, 0);
    expect(res).not.toBeNull();
    expect(l.cups[0]?.layers).toEqual([LAV, KAR, KAR]);
  });
});

describe('D. win: named serving end-state', () => {
  const rest: TeaId[][] = [
    ['matcha', 'matcha', 'matcha', 'matcha'],
    ['karkade', 'karkade', 'karkade', 'karkade'],
  ];

  it('correct target full: accepted', () => {
    const cups: TeaId[][] = [[LAV, LAV, LAV, LAV], ...rest.map((c) => [...c]), []];
    expect(isWonState(cups, [N(LAV), N(), N(), N()])).toBe(true);
    expect(targetCupState(cups[0] as TeaId[], N(LAV))).toBe('correct');
  });

  it('wrong homogeneous full: rejected', () => {
    const cups: TeaId[][] = [[KAR, KAR, KAR, KAR], ...rest.map((c) => [...c]), []];
    expect(isWonState(cups, [N(LAV), N(), N(), N()])).toBe(false);
    expect(targetCupState(cups[0] as TeaId[], N(LAV))).toBe('wrong-full');
  });

  it('empty target: rejected', () => {
    const cups: TeaId[][] = [[], ...rest.map((c) => [...c]), []];
    expect(isWonState(cups, [N(LAV), N(), N(), N()])).toBe(false);
  });

  it('partial correct target: rejected', () => {
    const cups: TeaId[][] = [[LAV, LAV, LAV], ...rest.map((c) => [...c]), [], []];
    expect(isWonState(cups, [N(LAV), N(), N(), N(), N()])).toBe(false);
  });
});

describe('E. ordinary regression: legacy win semantics without targets', () => {
  it('empty-or-complete still wins; full uniform still counts', () => {
    expect(
      isWonState(
        [
          ['matcha', 'matcha', 'matcha', 'matcha'],
          ['karkade', 'karkade'],
          [],
        ],
        [N(), N(), N()],
      ),
    ).toBe(false);
    expect(
      isWonState(
        [
          ['matcha', 'matcha', 'matcha', 'matcha'],
          ['karkade', 'karkade', 'karkade', 'karkade'],
          [],
        ],
        [N(), N(), N()],
      ),
    ).toBe(true);
    expect(isWonState([[LAV, LAV, LAV, LAV], []])).toBe(true);
  });
});

describe('F. teapot regression with targets', () => {
  it('source-only must still finish empty even beside targets', () => {
    const cups: TeaId[][] = [
      [LAV],
      [LAV, LAV, LAV, LAV],
      ['matcha', 'matcha', 'matcha', 'matcha'],
    ];
    const cons: CupConstraint[] = [{ ...S }, N(LAV), N()];
    expect(isWonState(cups, cons)).toBe(false);
    const emptied: TeaId[][] = [[], [LAV, LAV, LAV, LAV], ['matcha', 'matcha', 'matcha', 'matcha']];
    expect(isWonState(emptied, cons)).toBe(true);
  });

  it('teapot carrying a target is rejected by production validation', () => {
    const level: GeneratedLevel = {
      cups: [
        ['matcha', 'karkade', 'matcha', 'karkade'],
        ['karkade', 'matcha', 'karkade', 'matcha'],
        [],
        [],
      ],
      hiddenCounts: [0, 0, 0, 0],
      cupConstraints: [{ mode: 'source-only', targetTeaId: LAV }, N(), N(), N()],
      seed: 'f:bad-combo',
      minMoves: 5,
      visitedStates: 10,
    };
    const req: GenerateRequest = {
      numColors: 2,
      colors: ['matcha', 'karkade'],
      emptyCups: 2,
      hasMysteryLayer: false,
      phase: 'warmup',
    };
    const check = validateLevelStructure(level, req);
    expect(check.ok).toBe(false);
    expect(check.reasons.join(' ')).toMatch(/R|target/);
  });
});

describe('G. solver: named serving is the actual goal state', () => {
  it('does not stop at ordinary sorted-but-wrong-target state', () => {
    // Target A expects matcha but holds KKKK; target B expects karkade
    // but holds MMMM. Legacy win would say solved; new win must not.
    const cups: TeaId[][] = [
      [KAR, KAR, KAR, KAR],
      ['matcha', 'matcha', 'matcha', 'matcha'],
      [],
      [],
    ];
    const cons: CupConstraint[] = [N('matcha'), N(KAR), N(), N()];
    expect(isWonState(cups)).toBe(true); // legacy: ordinary sorting suffices
    expect(isWonState(cups, cons)).toBe(false); // named serving: swapped
  });

  it('solver swaps the mis-served cups when buffer space allows', () => {
    const cups: TeaId[][] = [
      [KAR, KAR, KAR, KAR],
      ['matcha', 'matcha', 'matcha', 'matcha'],
      [],
      [],
    ];
    const cons: CupConstraint[] = [N('matcha'), N(KAR), N(), N()];
    const res = solvePuzzle(cups, { cupConstraints: cons });
    expect(res.solvable).toBe(true);
    expect(res.minMoves).toBe(3);
    const finalBoard = applySolution(cups, res.solution ?? [], cons);
    expect(finalBoard).not.toBeNull();
    expect(isWonState(finalBoard ?? [], cons)).toBe(true);
    expect(finalBoard?.[0]).toEqual(['matcha', 'matcha', 'matcha', 'matcha']);
    expect(finalBoard?.[1]).toEqual([KAR, KAR, KAR, KAR]);
  });

  it('representative generated target puzzle solves into correct cups', () => {
    const level = generateLevel(TARGET_CHALLENGE, 'target:G:rep');
    const res = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
    expect(res.solvable).toBe(true);
    const finalBoard = applySolution(level.cups, res.solution ?? [], level.cupConstraints);
    expect(isWonState(finalBoard ?? [], level.cupConstraints)).toBe(true);
    level.cupConstraints.forEach((c, i) => {
      if (c.targetTeaId !== undefined) {
        expect(finalBoard?.[i]).toHaveLength(MAX_CUP_CAPACITY);
        expect((finalBoard?.[i] ?? []).every((l) => l === c.targetTeaId)).toBe(true);
      }
    });
  });
});

describe('H. undo preserves target metadata exactly', () => {
  it('move through target cup -> undo restores contents, identities unchanged', () => {
    const start: TeaId[][] = [
      [LAV, KAR, KAR],
      [LAV, LAV],
      [],
    ];
    const cons: CupConstraint[] = [N(LAV), N(), N()];
    const l = new TeaSortLogic(start, [0, 0, 0], cons);
    const before = l.toState();
    expect(l.makeMove(0, 2)).not.toBeNull();
    l.undo();
    expect(l.toState()).toEqual(before);
    expect(l.cupConstraints).toEqual(cons);
  });
});

describe('I. restart restores exact target layout', () => {
  it('modified target level -> restart -> original contents + same constraints', () => {
    const level = generateLevel(TARGET_CHALLENGE, 'target:I:restart');
    const l = new TeaSortLogic(level.cups, level.hiddenCounts, level.cupConstraints);
    const moves = listLegalMoves(
      l.cups.map((c) => c.layers),
      false,
      l.cupConstraints,
    );
    expect(moves.length).toBeGreaterThan(0);
    expect(l.makeMove(moves[0]?.from as number, moves[0]?.to as number)).not.toBeNull();
    l.initFromState(
      level.cups.map((c) => [...c]),
      [...level.hiddenCounts],
      level.cupConstraints.map(cloneCupConstraint),
    );
    expect(l.cups.map((c) => [...c.layers])).toEqual(level.cups);
    expect(l.cupConstraints).toEqual(level.cupConstraints);
  });
});

describe('J. mystery avoids both special roles', () => {
  it('peak target+mystery: hidden cup is neither target nor teapot', () => {
    for (let s = 0; s < 20; s++) {
      const level = generateLevel(TARGET_MYSTERY_PEAK, `target:J:${s}`);
      const hid = level.hiddenCounts.findIndex((h) => h > 0);
      expect(hid).toBeGreaterThanOrEqual(0);
      expect(level.cupConstraints[hid]?.targetTeaId).toBeUndefined();
      expect(level.cupConstraints[hid]?.mode).toBe('normal');
    }
  });
});

describe('K. generator: target challenge (matrix sample)', () => {
  it('25 seeds: 2 unique palette targets, full unsolved starts, solvable, in-band', () => {
    for (let s = 0; s < 25; s++) {
      const seed = `target:K:${s}`;
      const level = generateLevel(TARGET_CHALLENGE, seed);
      expect(level.cups).toHaveLength(6);
      const check = validateLevelStructure(level, TARGET_CHALLENGE);
      expect(check.reasons).toEqual([]);
      const targets = level.cupConstraints.filter((c) => c.targetTeaId !== undefined);
      expect(targets).toHaveLength(2);
      expect(new Set(targets.map((c) => c.targetTeaId)).size).toBe(2);
      for (const c of targets) {
        expect(c.mode).toBe('normal');
        expect(TARGET_CHALLENGE.colors.slice(0, 4)).toContain(c.targetTeaId);
      }
      const idxs = level.cupConstraints
        .map((c, i) => (c.targetTeaId !== undefined ? i : -1))
        .filter((i) => i >= 0);
      expect(idxs).toEqual([0, 1]); // stable slots without teapot
      for (const i of idxs) {
        expect((level.cups[i] as TeaId[]).length).toBe(MAX_CUP_CAPACITY);
      }
      const solved = solvePuzzle(level.cups, { cupConstraints: level.cupConstraints });
      expect(solved.solvable).toBe(true);
      expect(level.minMoves).toBe(solved.minMoves);
      expect(depthAccepted(level.minMoves, 'challenge')).toBe(true);
      // Determinism spot-check on the first seed.
      if (s === 0) {
        const again = generateLevel(TARGET_CHALLENGE, seed);
        expect(again.cups).toEqual(level.cups);
        expect(again.cupConstraints).toEqual(level.cupConstraints);
      }
    }
  });
});

describe('L. generator: target + mystery peak (matrix sample)', () => {
  it('20 seeds: two targets + one mystery, all distinct, no teapot', () => {
    for (let s = 0; s < 20; s++) {
      const level = generateLevel(TARGET_MYSTERY_PEAK, `target:L:${s}`);
      expect(validateLevelStructure(level, TARGET_MYSTERY_PEAK).ok).toBe(true);
      const potIdx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
      expect(potIdx).toBe(-1);
      const targetIdx = level.cupConstraints
        .map((c, i) => (c.targetTeaId !== undefined ? i : -1))
        .filter((i) => i >= 0);
      const hidIdx = level.hiddenCounts.findIndex((h) => h > 0);
      expect(targetIdx).toHaveLength(2);
      expect(hidIdx).toBeGreaterThanOrEqual(0);
      expect(targetIdx).not.toContain(hidIdx);
      expect(
        solvePuzzle(level.cups, { cupConstraints: level.cupConstraints }).solvable,
      ).toBe(true);
      expect(depthAccepted(level.minMoves, 'peak')).toBe(true);
    }
  });
});

describe('M. generator: teapot + target challenge (matrix sample)', () => {
  it('20 seeds: one teapot + two targets, all distinct, no mystery', () => {
    for (let s = 0; s < 20; s++) {
      const level = generateLevel(TEAPOT_TARGET_CHALLENGE, `target:M:${s}`);
      expect(validateLevelStructure(level, TEAPOT_TARGET_CHALLENGE).ok).toBe(true);
      const potIdx = level.cupConstraints.findIndex((c) => c.mode === 'source-only');
      expect(potIdx).toBe(0);
      const targetIdx = level.cupConstraints
        .map((c, i) => (c.targetTeaId !== undefined ? i : -1))
        .filter((i) => i >= 0);
      expect(targetIdx).toEqual([1, 2]); // stable slots after teapot
      expect(level.cupConstraints[potIdx]?.targetTeaId).toBeUndefined();
      expect(level.hiddenCounts.every((h) => h === 0)).toBe(true);
      expect(
        solvePuzzle(level.cups, { cupConstraints: level.cupConstraints }).solvable,
      ).toBe(true);
      expect(depthAccepted(level.minMoves, 'challenge')).toBe(true);
    }
  });
});

describe('N. fallback exhaustion (maxRetries = 0)', () => {
  it.each([
    ['target challenge', TARGET_CHALLENGE],
    ['target + mystery peak', TARGET_MYSTERY_PEAK],
    ['teapot + target challenge', TEAPOT_TARGET_CHALLENGE],
  ])('%s stays valid with zero retries', (_name, req) => {
    const level = generateLevel(req, 'target:N:exhaust', { maxRetries: 0 });
    expect(validateLevelStructure(level, req).ok).toBe(true);
    expect(solvePuzzle(level.cups, { cupConstraints: level.cupConstraints }).solvable).toBe(true);
  });

  it('dedicated target fallbacks hit in one rung with target-band depths', () => {
    const a = fallbackLevel(TARGET_CHALLENGE);
    expect(a.seed).toMatch(/#0$/);
    expect(a.minMoves).toBe(10);
    const b = fallbackLevel(TARGET_MYSTERY_PEAK);
    expect(b.seed).toMatch(/#0$/);
    expect(b.minMoves).toBe(11);
    const c = fallbackLevel(TEAPOT_TARGET_CHALLENGE);
    expect(c.seed).toMatch(/#0$/);
    expect(c.minMoves).toBe(10);
  });
});

describe('O. determinism', () => {
  it('same request + seed: identical cups, hidden, constraints, depth', () => {
    for (const req of [TARGET_CHALLENGE, TARGET_MYSTERY_PEAK, TEAPOT_TARGET_CHALLENGE]) {
      const a = generateLevel(req, 'target:O:1');
      const b = generateLevel(req, 'target:O:1');
      expect(b.cups).toEqual(a.cups);
      expect(b.hiddenCounts).toEqual(a.hiddenCounts);
      expect(b.cupConstraints).toEqual(a.cupConstraints);
      expect(b.minMoves).toBe(a.minMoves);
    }
  });
});

describe('P. level rollout 1–16', () => {
  it('matches the Gauntlet 2 production rollout exactly', () => {
    const expectations: Array<[number, boolean, boolean, string[]]> = [
      [1, false, false, []],
      [2, false, false, []],
      [3, false, true, []],
      [4, false, false, []],
      [5, false, false, []],
      [6, true, false, []],
      [7, true, true, []],
      [8, false, false, []],
      [9, false, false, []],
      [10, false, false, ['lavender', 'karkade']],
      [11, false, true, ['lavender', 'karkade']],
      [12, false, false, []],
      [13, false, false, []],
      [14, true, false, ['lavender', 'karkade']],
      [15, true, true, []],
      [16, false, false, []],
    ];
    for (const [lvl, teapot, mystery, targets] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.targetTeaIds).toEqual(targets);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
    }
    expect(getLevelConfig(10).phaseSubtitle).toContain('сервировка');
    expect(mechanicPlanForLevel(10)).toEqual({ teapot: false, targets: true });
    expect(pickTargetPair(['saffron', 'lavender', 'karkade', 'milk_oolong'])).toEqual([
      'lavender',
      'karkade',
    ]);
  });
});

describe('Q. special-mechanic cap: never the forbidden triple', () => {
  it('levels 1–100 never combine teapot + mystery + targets', () => {
    for (let lvl = 1; lvl <= 100; lvl++) {
      const cfg = getLevelConfig(lvl);
      const triple =
        cfg.hasSourceOnlyTeapot && cfg.hasMysteryLayer && cfg.targetTeaIds.length > 0;
      expect(triple).toBe(false);
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });
});

describe('R. progression semantics unchanged on target levels', () => {
  it('win on a target level still advances N -> N+1 exactly once', () => {
    const cfg = getLevelConfig(10);
    const first = applyWin(
      { highestUnlockedLevel: 10, unlockedRecipes: [], unlockedSkins: [] },
      10,
      { recipeId: cfg.rewardRecipeId },
    );
    expect(first.highestUnlockedLevel).toBe(11);
    const replay = applyWin(first, 10, { recipeId: cfg.rewardRecipeId });
    expect(replay.highestUnlockedLevel).toBe(11);
    expect(replay.isNewRecipe).toBe(false);
  });
});
