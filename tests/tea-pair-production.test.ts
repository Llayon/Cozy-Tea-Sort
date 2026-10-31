/**
 * Gauntlet 17 production contract — TEA PAIR / «Чайная пара».
 *
 * Covers request validation, standalone V6 fast path, 220-seed production
 * stress, canonical bank/robustness/targets, dedicated fallback, rollout,
 * view identity, hand fixtures (commit→pressure→match, anchor switch,
 * conflict recovery, plain control), conservation/variety/fairness and
 * legacy coexistence. No runtime mining: all checks use production entry
 * points with bounded work.
 */
import { describe, expect, it } from 'vitest';
import {
  TEA_PAIR_ELIGIBLE_TEAS,
  analyzeTeaPairReplay,
  createGenerateStats,
  fallbackLevel,
  generateLevel,
  requestedTeaPairCount,
  teaPairTemplateKindFor,
  validateTeaPairRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';
import {
  applyPourState,
  canonicalPuzzleKey,
  isPuzzleWonState,
  listConstructiveActionsState,
} from '../src/game/logic/rules';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  pairedTeaMembers,
  pairedTeaStatus,
  validatePairedTeaConstraints,
} from '../src/game/logic/teaPair';
import {
  ALL_TEA_PAIR_TEMPLATES,
  TEA_PAIR_DEPTH_ACCEPT,
  instantiateTeaPairTemplate,
} from '../src/game/logic/teaPairTemplates';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  CupView,
  PAIR_BOWL_BODY_H,
  PAIR_MATCH_FLOURISH_MS,
  fullVesselHint,
  pairMatchFlourishTea,
} from '../src/game/view/TeaSortView';
import {
  TEA_UNITS_PER_COLOR,
  cupCapacity,
  emptyFloatingIngredients,
  type CupConstraint,
  type TeaId,
} from '../src/game/types';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];
const A: TeaId = 'matcha';
const B: TeaId = 'karkade';
const C: TeaId = 'sea_buckthorn';

const P: CupConstraint = { mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' };
const N: CupConstraint = { mode: 'normal' };

function baseRequest(extra: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    numColors: 4,
    colors: [...PALETTE],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge',
    teaPairCount: 1,
    ...extra,
  };
}

function pairConstraints(cups: readonly TeaId[][], members: readonly number[] = [0, 1]): CupConstraint[] {
  return cups.map((_, i) =>
    members.includes(i)
      ? ({ mode: 'normal', capacity: 2, pairedTeaGroup: 'tea-pair' } as CupConstraint)
      : ({ mode: 'normal' } as CupConstraint),
  );
}

function solveWithTrace(cups: TeaId[][], constraints: readonly CupConstraint[]) {
  const r = solvePuzzle(cups, {
    cupConstraints: constraints,
    maxVisited: 120_000,
    maxDepth: 60,
  });
  expect(r.solvable).toBe(true);
  expect(r.truncated).not.toBe(true);
  expect(r.minMoves).toBeDefined();
  const trace = analyzeTeaPairReplay(cups, r.solution ?? [], constraints);
  return { r, trace };
}

const PERMS: number[][] = [
  [0, 1, 2, 3],
  [1, 0, 2, 3],
  [0, 1, 3, 2],
  [2, 3, 0, 1],
  [3, 2, 1, 0],
  [1, 3, 0, 2],
];

describe('G17 request recognition + fail-fast validation', () => {
  it('recognizes only the exact standalone 4c/6v V6 request', () => {
    expect(requestedTeaPairCount(baseRequest())).toBe(1);
    expect(teaPairTemplateKindFor(baseRequest())).toBe('tea-pair');
    expect(teaPairTemplateKindFor(baseRequest({ teaPairCount: 0 }))).toBeNull();
    expect(teaPairTemplateKindFor(baseRequest({ emptyCups: 3 }))).toBeNull();
    expect(teaPairTemplateKindFor(baseRequest({ numColors: 3 }))).toBeNull();
  });

  it('only 0/1 supported; rejects non-integers, negatives and >1 loudly', () => {
    expect(() => validateTeaPairRequest(baseRequest({ teaPairCount: 0 }))).not.toThrow();
    expect(() => validateTeaPairRequest(baseRequest())).not.toThrow();
    for (const bad of [-1, 2, 0.5, 1.2, 3]) {
      expect(() => validateTeaPairRequest(baseRequest({ teaPairCount: bad }))).toThrow();
    }
  });

  it('rejects every sibling mechanic and wrong topology/palette', () => {
    const siblings: Array<Partial<GenerateRequest>> = [
      { emptyCups: 3 },
      { numColors: 3, colors: PALETTE.slice(0, 3) },
      { sourceOnlyCount: 1 },
      { hasMysteryLayer: true },
      { targetTeaIds: [A] },
      { sinkOnlyCount: 1 },
      { tastingCupCount: 1 },
      { floatingIngredient: 'lemon' },
      { sinkingIngredient: 'honey' },
      { hasStrainer: true },
      { frozenCupCount: 1 },
      { thermosCupCount: 1 },
      { cinnamonCupCount: 1 },
      { teaBudCount: 1 },
      { blendRecipeId: 'milk-tea' },
      { serveOrderCount: 2 },
      { sharedTrayCount: 1 },
      { colors: ['black_tea', 'milk', 'matcha', 'karkade'] },
    ];
    for (const extra of siblings) {
      expect(() => validateTeaPairRequest(baseRequest(extra))).toThrow();
    }
  });

  it('eligible palette is the frozen legacy set (no reaction ids)', () => {
    expect(TEA_PAIR_ELIGIBLE_TEAS).toContain('matcha');
    expect(TEA_PAIR_ELIGIBLE_TEAS).not.toContain('black_tea');
    expect(TEA_PAIR_ELIGIBLE_TEAS).not.toContain('milk');
    expect(TEA_PAIR_ELIGIBLE_TEAS).not.toContain('milk_tea');
  });
});

describe('G17 production fast path + 220-seed stress', () => {
  it('every seed yields a valid V6 pair in one solver call and a stable L2 trace', { timeout: 120_000 }, () => {
    const depths = new Set<number>();
    const finalRoles = new Set<number>();
    const canonical = new Set<string>();
    const ratios: number[] = [];
    const gaps: number[] = [];
    const attempts: number[] = [];
    let fallbacks = 0;

    for (let seed = 0; seed < 220; seed++) {
      const stats = createGenerateStats();
      const lvl = generateLevel(baseRequest(), `g17-stress-${seed}`, { stats });
      expect(stats.usedFallback).toBe(false);
      expect(stats.solverCalls).toBe(1);
      expect(stats.templateAttempts).toBeGreaterThanOrEqual(1);
      expect(stats.templateAttempts).toBeLessThanOrEqual(4);
      attempts.push(stats.templateAttempts);
      fallbacks += stats.usedFallback ? 1 : 0;

      const cons = lvl.cupConstraints;
      const members = pairedTeaMembers(cons);
      expect(members).toEqual([0, 1]);
      expect(validatePairedTeaConstraints(cons)).toEqual([]);
      for (const m of members) {
        expect(cons[m]?.pairedTeaGroup).toBe('tea-pair');
        expect(cons[m]?.mode).toBe('normal');
        expect(cupCapacity(cons[m])).toBe(2);
        expect(cons[m]?.targetTeaId).toBeUndefined();
        expect(cons[m]?.mustEndEmpty ?? false).toBe(false);
        expect(cons[m]?.serveOrder).toBeUndefined();
        expect(cons[m]?.sharedCapacityGroup).toBeUndefined();
      }
      // Exact V6 lengths + exactly one empty.
      expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 2, 4, 4, 4]);
      // Conservation: 4 units each, 4 colors, no reaction ids.
      const flat = lvl.cups.flat();
      for (const tea of PALETTE) expect(flat.filter((t) => t === tea).length).toBe(TEA_UNITS_PER_COLOR);
      expect(new Set(flat).size).toBe(4);
      expect(flat.some((t) => t === 'black_tea' || t === 'milk' || t === 'milk_tea')).toBe(false);
      // Every non-empty start mixed, both pair bowls mixed 2/2.
      for (const cup of lvl.cups) {
        if (cup.length > 0) expect(new Set(cup).size).toBeGreaterThanOrEqual(2);
      }
      expect(lvl.cups[0]?.length).toBe(2);
      expect(lvl.cups[1]?.length).toBe(2);
      expect(pairedTeaStatus({ cups: lvl.cups }, cons).kind).toBe('uncommitted');

      const { r, trace } = solveWithTrace(lvl.cups, cons);
      expect(r.minMoves).toBe(lvl.minMoves);
      expect(r.minMoves as number).toBeGreaterThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.min);
      expect(r.minMoves as number).toBeLessThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.max);
      expect(r.visitedStates).toBeLessThan(5000);
      expect(trace.win).toBe(true);
      expect(trace.finalStatus.kind).toBe('matched');
      expect(trace.stableCommitDepth).not.toBeNull();
      expect(trace.stableGap).not.toBeNull();
      expect(trace.stableGap as number).toBeGreaterThanOrEqual(2);
      expect((trace.stableCommitDepth as number) / Math.max(1, r.minMoves as number)).toBeLessThanOrEqual(0.8);

      const fin = applySolutionState(
        { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(lvl.cups.length) },
        r.solution ?? [],
        cons,
      );
      expect(fin).not.toBeNull();
      expect(isPuzzleWonState(fin!, cons)).toBe(true);
      expect(pairedTeaStatus(fin!, cons).kind).toBe('matched');

      depths.add(lvl.minMoves);
      const tea = trace.finalStatus.kind === 'matched' ? trace.finalStatus.tea : null;
      const role = tea === null ? -1 : PALETTE.indexOf(tea);
      if (role >= 0) finalRoles.add(role);
      ratios.push(trace.stableCommitDepth! / Math.max(1, r.minMoves as number));
      gaps.push(trace.stableGap!);
      canonical.add(
        canonicalPuzzleKey(
          { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) },
          cons,
        ),
      );

      // Reopening a completed pair member stays ordinary-legal and clears the
      // derived commitment (no source lock, no stored chosen tea).
      if (seed % 20 === 0) {
        const anchor = lvl.cups[0] as TeaId[];
        const emptyIdx = fin!.cups.findIndex((c, i) => i >= 2 && c.length === 0);
        expect(anchor.length).toBe(2);
        expect(emptyIdx).toBeGreaterThanOrEqual(2);
        const reopen = applyPourState(fin!, 0, emptyIdx, cons);
        expect(reopen).not.toBeNull();
        const afterReopen = pairedTeaStatus(reopen!.state, cons);
        expect(afterReopen.kind === 'matched').toBe(false);
      }
    }

    expect(fallbacks).toBe(0);
    expect(Math.max(...attempts)).toBeLessThanOrEqual(2);
    expect(depths.size).toBeGreaterThanOrEqual(4);
    expect(finalRoles.size).toBeGreaterThanOrEqual(3);
    expect(canonical.size).toBeGreaterThanOrEqual(150);
    expect(gaps.every((g) => g >= 2)).toBe(true);
    expect(ratios.filter((r) => r <= 0.65).length).toBeGreaterThanOrEqual(180);
  });

  it('undo/restart and reshuffle preserve pair semantics with zero stale state', () => {
    const lvl = generateLevel(baseRequest(), 'g17-undo');
    const cons = lvl.cupConstraints;
    const logic = new TeaSortLogic(lvl.cups, lvl.hiddenCounts, cons);
    const actions = listConstructiveActionsState(
      { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) },
      cons,
    ).filter((a): a is { kind: 'pour'; from: number; to: number } => a.kind === 'pour');
    expect(actions.length).toBeGreaterThan(0);
    const first = actions[0] as { kind: 'pour'; from: number; to: number };
    const before = logic.toState().cups.map((c) => [...c]);
    expect(logic.makeMove(first.from, first.to)).not.toBeNull();
    expect(logic.undo()).not.toBeNull();
    expect(logic.toState().cups).toEqual(before);
    expect(logic.movesCount).toBe(0);
    logic.initFromState(lvl.cups, lvl.hiddenCounts, cons);
    expect(pairedTeaStatus(logic.toState(), cons).kind).toBe('uncommitted');
    expect(logic.movesCount).toBe(0);
    // Reshuffle: a fresh seed yields a fresh valid pair arrangement.
    const reshuffled = generateLevel(baseRequest(), 'g17-reshuffle');
    expect(pairedTeaMembers(reshuffled.cupConstraints)).toEqual([0, 1]);
    expect(reshuffled.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 2, 4, 4, 4]);
  });

  it('root fairness: every sampled start has solvable and optimal first moves', { timeout: 60_000 }, () => {
    for (let seed = 0; seed < 20; seed++) {
      const lvl = generateLevel(baseRequest(), `g17-fair-${seed}`);
      const start = { cups: lvl.cups, floatingIngredients: emptyFloatingIngredients(6) };
      const first = listConstructiveActionsState(start, lvl.cupConstraints).filter(
        (a): a is { kind: 'pour'; from: number; to: number } => a.kind === 'pour',
      );
      expect(first.length).toBeGreaterThan(0);
      let solvable = 0;
      let optimal = 0;
      for (const a of first) {
        const res = applyPourState(start, a.from, a.to, lvl.cupConstraints);
        if (!res) continue;
        const r = solvePuzzle(res.state.cups as TeaId[][], {
          cupConstraints: lvl.cupConstraints,
          maxVisited: 120_000,
          maxDepth: 60,
        });
        if (r.solvable && !r.truncated) {
          solvable++;
          if (r.minMoves === (lvl.minMoves as number) - 1) optimal++;
        }
      }
      expect(solvable).toBeGreaterThan(0);
      expect(optimal).toBeGreaterThan(0);
    }
  });
});

describe('G17 canonical template bank', () => {
  it('18 unique canonical-distinct templates with exact V6 shape', () => {
    expect(ALL_TEA_PAIR_TEMPLATES.length).toBe(18);
    expect(new Set(ALL_TEA_PAIR_TEMPLATES.map((t) => t.id)).size).toBe(18);
    const keys = new Set<string>();
    for (const tpl of ALL_TEA_PAIR_TEMPLATES) {
      expect(tpl.kind).toBe('tea-pair');
      expect(tpl.pairMembers).toEqual([0, 1]);
      expect(tpl.depth).toBeGreaterThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.min);
      expect(tpl.depth).toBeLessThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.max);
      expect(tpl.expectedFinalPairRole === undefined || /^c[0-3]$/.test(tpl.expectedFinalPairRole)).toBe(true);
      const inst = instantiateTeaPairTemplate(tpl, [...PALETTE]);
      expect(inst.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 2, 4, 4, 4]);
      for (const tea of PALETTE) {
        expect(inst.cups.flat().filter((t) => t === tea).length).toBe(4);
      }
      expect(inst.cups[0]?.length).toBe(2);
      expect(inst.cups[1]?.length).toBe(2);
      for (const cup of inst.cups) {
        if (cup.length > 0) expect(new Set(cup).size).toBeGreaterThanOrEqual(2);
      }
      keys.add(
        canonicalPuzzleKey(
          { cups: inst.cups, floatingIngredients: emptyFloatingIngredients(6) },
          pairConstraints(inst.cups, inst.pairMembers),
        ),
      );
    }
    expect(keys.size).toBe(18);
  });

  it('meets L2/L3, timing, gap and final-role targets (identity mapping)', () => {
    let l3 = 0;
    let ratioOk = 0;
    let gapOk = 0;
    let gap4 = 0;
    const roles = new Set<number>();
    for (const tpl of ALL_TEA_PAIR_TEMPLATES) {
      const inst = instantiateTeaPairTemplate(tpl, [...PALETTE]);
      const cons = pairConstraints(inst.cups, inst.pairMembers);
      const { r, trace } = solveWithTrace(inst.cups, cons);
      expect(r.minMoves).toBe(tpl.depth);
      expect(trace.finalStatus.kind).toBe('matched');
      expect(trace.win).toBe(true);
      const expectedRole = tpl.expectedFinalPairRole;
      if (expectedRole !== undefined && trace.finalStatus.kind === 'matched') {
        const roleIdx = ['c0', 'c1', 'c2', 'c3'].indexOf(expectedRole);
        expect(trace.finalStatus.tea).toBe(PALETTE[roleIdx]);
      }
      expect(trace.stableCommitDepth).not.toBeNull();
      const ratio = (trace.stableCommitDepth as number) / Math.max(1, r.minMoves as number);
      if (ratio <= 0.65) ratioOk++;
      if ((trace.stableGap as number) >= 2) gapOk++;
      if ((trace.stableGap as number) >= 4) gap4++;
      const plain = solvePuzzle(inst.cups, {
        cupConstraints: cons.map((c) => ({ mode: c.mode, ...(c.capacity !== undefined ? { capacity: c.capacity } : {}) })),
        maxVisited: 120_000,
        maxDepth: 60,
      });
      const l3b =
        plain.solvable &&
        !plain.truncated &&
        plain.minMoves !== undefined &&
        (r.minMoves as number) > plain.minMoves;
      if (trace.anchorSwitch || l3b) l3++;
      const tea = trace.finalStatus.kind === 'matched' ? trace.finalStatus.tea : null;
      if (tea) roles.add(PALETTE.indexOf(tea));
    }
    expect(l3).toBeGreaterThanOrEqual(10);
    expect(ratioOk).toBeGreaterThanOrEqual(14);
    expect(gapOk).toBeGreaterThanOrEqual(12);
    expect(gap4).toBeGreaterThanOrEqual(6);
    expect(roles.size).toBeGreaterThanOrEqual(3);
  });

  it('survives 6 deterministic role permutations × both pair-member orders', { timeout: 120_000 }, () => {
    for (const tpl of ALL_TEA_PAIR_TEMPLATES) {
      for (const perm of PERMS) {
        const order = perm.map((i) => PALETTE[i] as TeaId);
        const inst = instantiateTeaPairTemplate(tpl, order);
        const swapped: TeaId[][] = inst.cups.map((c) => [...c]);
        const a = swapped[0] as TeaId[];
        const b = swapped[1] as TeaId[];
        swapped[0] = b;
        swapped[1] = a;
        for (const cups of [inst.cups, swapped]) {
          const cons = pairConstraints(cups, inst.pairMembers);
          const { r, trace } = solveWithTrace(cups, cons);
          expect(r.minMoves).toBeGreaterThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.min);
          expect(r.minMoves).toBeLessThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.max);
          expect(trace.win).toBe(true);
          expect(trace.finalStatus.kind).toBe('matched');
          expect(trace.stableCommitDepth).not.toBeNull();
          expect(trace.stableGap as number).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it('dedicated fallback is pinned, strong and directly validated', () => {
    const stats = createGenerateStats();
    const lvl = fallbackLevel(baseRequest(), { stats });
    expect(stats.usedFallback).toBe(true);
    expect(stats.solverCalls).toBe(1);
    expect(lvl.minMoves).toBe(11);
    expect(lvl.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 2, 4, 4, 4]);
    const cons = lvl.cupConstraints;
    const { trace } = solveWithTrace(lvl.cups, cons);
    expect(trace.win).toBe(true);
    expect(trace.finalStatus).toEqual({ kind: 'matched', tea: 'karkade' });
    expect(trace.commitDepth).not.toBeNull();
    expect(trace.pressureDepth).not.toBeNull();
    expect(trace.matchDepth).not.toBeNull();
    expect(trace.matchDepth as number).toBeGreaterThan(trace.commitDepth as number);
    expect(trace.stableGap as number).toBeGreaterThanOrEqual(2);
  });
});

describe('G17 rollout: challenge-only standalone L250/L330', () => {
  it('pins the two first exposures with the exact V6 config and subtitle', () => {
    for (const lvl of [250, 330]) {
      const cfg = getLevelConfig(lvl);
      const plan = mechanicPlanForLevel(lvl);
      expect(cfg.hasTeaPair).toBe(true);
      expect(plan.teaPair).toBe(true);
      expect(cfg.phase).toBe('challenge');
      expect(cfg.numColors).toBe(4);
      expect(cfg.emptyCups).toBe(2);
      expect(cfg.totalCups).toBe(6);
      expect(cfg.hasMysteryLayer).toBe(false);
      expect(cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.phaseSubtitle).toBe('Чайная пара • 6 сосудов');
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.hasStrainer).toBe(false);
      expect(cfg.hasFrozenCup).toBe(false);
      expect(cfg.hasThermos).toBe(false);
      expect(cfg.hasCinnamon).toBe(false);
      expect(cfg.hasTeaBloom).toBe(false);
      expect(cfg.hasBlend).toBe(false);
      expect(cfg.hasServingOrder).toBe(false);
      expect(cfg.hasSharedTray ?? false).toBe(false);
    }
    expect(getLevelConfig(250).colors).toEqual(['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong']);
    expect(getLevelConfig(330).colors).toEqual(['lavender', 'saffron', 'buckwheat', 'matcha']);
  });

  it('does not disturb prefix <=242 or adjacent levels', () => {
    for (let lvl = 1; lvl <= 242; lvl++) {
      expect(getLevelConfig(lvl).hasTeaPair ?? false).toBe(false);
    }
    for (const lvl of [249, 251, 329, 331]) {
      expect(getLevelConfig(lvl).hasTeaPair ?? false).toBe(false);
    }
    let count = 0;
    for (let lvl = 1; lvl <= 400; lvl++) if (getLevelConfig(lvl).hasTeaPair) count++;
    // G19 Rollout V2 intentionally schedules the first recurring Tea Pair at
    // L374 in addition to the frozen L250/L330 exposures.
    expect(count).toBe(3);
    expect(getLevelConfig(374).hasTeaPair).toBe(true);
    expect(getLevelConfig(374).phase).toBe('challenge');
  });

  it('generates both rollout levels through the App request mapping', () => {
    for (const lvl of [250, 330]) {
      const cfg = getLevelConfig(lvl);
      const req: GenerateRequest = {
        numColors: cfg.numColors,
        colors: cfg.colors,
        emptyCups: cfg.emptyCups,
        hasMysteryLayer: cfg.hasMysteryLayer,
        sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
        sinkOnlyCount: cfg.hasSinkGuestCup ? 1 : 0,
        tastingCupCount: cfg.hasTastingBowl ? 1 : 0,
        floatingIngredient: cfg.floatingIngredient,
        hasStrainer: cfg.hasStrainer,
        sinkingIngredient: cfg.sinkingIngredient,
        frozenCupCount: cfg.hasFrozenCup ? 1 : 0,
        thermosCupCount: cfg.hasThermos ? 1 : 0,
        cinnamonCupCount: cfg.hasCinnamon ? 1 : 0,
        teaBudCount: cfg.hasTeaBloom ? 1 : 0,
        blendRecipeId: cfg.hasBlend ? 'milk-tea' : undefined,
        serveOrderCount: cfg.hasServingOrder ? 2 : 0,
        sharedTrayCount: cfg.hasSharedTray ? 1 : 0,
        teaPairCount: cfg.hasTeaPair ? 1 : 0,
        targetTeaIds: [...cfg.targetTeaIds],
        phase: cfg.phase,
      };
      for (let s = 0; s < 4; s++) {
        const out = generateLevel(req, `g17-rollout-${lvl}-${s}`);
        expect(pairedTeaMembers(out.cupConstraints)).toEqual([0, 1]);
        expect(out.minMoves).toBeGreaterThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.min);
        expect(out.minMoves).toBeLessThanOrEqual(TEA_PAIR_DEPTH_ACCEPT.max);
        expect(out.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 2, 4, 4, 4]);
      }
    }
  });
});

describe('G17 hand fixtures', () => {
  it('compact optimal replay: commit+pressure @2, later match @4, win; exact 4 moves', () => {
    const cups: TeaId[][] = [[A, B], [B, A], [A, A], [B, B]];
    const cons = [P, P, N, N];
    const { r, trace } = solveWithTrace(cups, cons);
    expect(r.minMoves).toBe(4);
    expect(trace.commitDepth).toBe(2);
    expect(trace.pressureDepth).toBe(2);
    expect(trace.matchDepth).toBe(4);
    expect(trace.stableCommitDepth).toBe(2);
    expect(trace.stableGap).toBe(2);
    expect(trace.finalStatus).toEqual({ kind: 'matched', tea: A });
    expect(trace.win).toBe(true);
    const fin = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(4) },
      r.solution ?? [],
      cons,
    );
    expect(fin?.cups).toEqual([[A, A], [A, A], [], [B, B, B, B]]);
    expect(isPuzzleWonState(fin!, cons)).toBe(true);
  });

  it('anchor switch: commit X, reopen, commit Y, match Y — no chosenTea state exists', () => {
    const cons = [P, P, N, N, N];
    let state = { cups: [[A, A], [B, C], [], [], [B, B, B]] as TeaId[][], floatingIngredients: emptyFloatingIngredients(5) };
    expect(pairedTeaStatus(state, cons)).toMatchObject({ kind: 'committed', tea: A, anchorIndex: 0 });
    state = applyPourState(state, 0, 2, cons)!.state;
    expect(pairedTeaStatus(state, cons)).toEqual({ kind: 'uncommitted' });
    state = applyPourState(state, 1, 3, cons)!.state;
    state = applyPourState(state, 4, 1, cons)!.state;
    expect(pairedTeaStatus(state, cons)).toMatchObject({ kind: 'committed', tea: B, anchorIndex: 1 });
    const keys = Object.keys(state);
    expect(keys).not.toContain('chosenTea');
    expect(keys).not.toContain('committedTea');
    expect(keys).not.toContain('pairStatus');
    expect(keys).not.toContain('anchorIndex');
  });

  it('conflict X×2 + Y×2: not won, both pair cups source freely, solver recovers in 2', () => {
    const cups: TeaId[][] = [[A, A], [B, B], [B, B], [A, A], []];
    const cons = [P, P, N, N, N];
    const start = { cups, floatingIngredients: emptyFloatingIngredients(5) };
    expect(pairedTeaStatus(start, cons)).toEqual({ kind: 'conflict', teaA: A, teaB: B });
    expect(isPuzzleWonState(start, cons)).toBe(false);
    for (const idx of [0, 1]) {
      const actions = listConstructiveActionsState(start, cons).filter(
        (a): a is { kind: 'pour'; from: number; to: number } => a.kind === 'pour' && a.from === idx,
      );
      expect(actions.length).toBeGreaterThan(0);
    }
    const { r, trace } = solveWithTrace(cups, cons);
    expect(r.minMoves).toBe(2);
    expect(trace.win).toBe(true);
    expect(trace.finalStatus.kind).toBe('matched');
  });

  it('plain control: remove pair markers, keep cap2; exact plain depth and final pair cups', () => {
    const cups: TeaId[][] = [[A, B], [B, A], [A, A], [B, B]];
    const plain: CupConstraint[] = [
      { mode: 'normal', capacity: 2 },
      { mode: 'normal', capacity: 2 },
      N,
      N,
    ];
    const r = solvePuzzle(cups, { cupConstraints: plain, maxVisited: 50_000, maxDepth: 20 });
    expect(r.solvable).toBe(true);
    expect(r.truncated).not.toBe(true);
    expect(r.minMoves).toBe(4);
    const fin = applySolutionState(
      { cups, floatingIngredients: emptyFloatingIngredients(4) },
      r.solution ?? [],
      plain,
    );
    expect(fin).not.toBeNull();
    expect(fin?.cups[0]).toEqual([]);
    expect(fin?.cups[1]).toEqual([]);
    // Pair goal would not accept the plain final arrangement.
    expect(isPuzzleWonState({ cups: fin!.cups, floatingIngredients: emptyFloatingIngredients(4) }, [P, P, N, N])).toBe(false);
  });
});

describe('G17 view identity + presentation plan', () => {
  it('pair bowls are small matching porcelain cap-2 bowls, distinct from tasting', () => {
    const pair = new CupView(0, P);
    const tasting = new CupView(1, { mode: 'normal', capacity: 2, mustEndEmpty: true });
    const ordinary = new CupView(2, N);
    expect(pair.isPairBowl).toBe(true);
    expect(pair.isTastingBowl).toBe(false);
    expect(pair.width).toBe(64);
    expect(pair.height).toBe(142);
    expect(cupCapacity(pair.constraint)).toBe(2);
    expect(pair.rimLocalY).toBe(142 - PAIR_BOWL_BODY_H);
    expect(pair.slotHeightFor(pair.constraint)).toBeCloseTo((136 - (pair.rimLocalY + 4)) / 2, 5);
    expect(tasting.isPairBowl).toBe(false);
    expect(tasting.rimLocalY).not.toBe(pair.rimLocalY);
    expect(ordinary.isPairBowl).toBe(false);
    expect(pair.pairGraphics.eventMode).toBe('none');
    expect(fullVesselHint(P)).toBe('Парная пиала заполнена (2/2)! Выберите другой сосуд или пустой стакан.');
  });

  it('matched flourish is a short one-ticker transition derived only from statuses', () => {
    expect(PAIR_MATCH_FLOURISH_MS).toBeGreaterThanOrEqual(300);
    expect(PAIR_MATCH_FLOURISH_MS).toBeLessThanOrEqual(450);
    expect(pairMatchFlourishTea({ kind: 'uncommitted' }, { kind: 'matched', tea: A })).toBe(A);
    expect(
      pairMatchFlourishTea({ kind: 'committed', tea: A, anchorIndex: 0, partnerIndex: 1 }, { kind: 'matched', tea: A }),
    ).toBe(A);
    expect(pairMatchFlourishTea({ kind: 'matched', tea: A }, { kind: 'matched', tea: A })).toBeNull();
    expect(
      pairMatchFlourishTea({ kind: 'matched', tea: A }, { kind: 'matched', tea: B }),
    ).toBe(B);
    expect(pairMatchFlourishTea({ kind: 'conflict', teaA: A, teaB: B }, { kind: 'matched', tea: B })).toBe(B);
    expect(pairMatchFlourishTea({ kind: 'matched', tea: A }, { kind: 'conflict', teaA: A, teaB: B })).toBeNull();
    expect(pairMatchFlourishTea({ kind: 'uncommitted' }, { kind: 'committed', tea: A, anchorIndex: 0, partnerIndex: 1 })).toBeNull();
  });

  it('reopening the anchor immediately clears the derived accent (no view cache)', () => {
    const cons = [P, P, N];
    const logic = new TeaSortLogic([[A, A], [B, C], []], [0, 0, 0], cons);
    expect(pairedTeaStatus(logic.toState(), cons).kind).toBe('committed');
    expect(logic.makeMove(0, 2)).not.toBeNull();
    expect(pairedTeaStatus(logic.toState(), cons).kind).toBe('uncommitted');
    expect(pairedTeaStatus(logic.toState(), cons)).not.toMatchObject({ tea: A });
  });
});

describe('G17 legacy coexistence', () => {
  it('classic and G16 requests never acquire pair markers', () => {
    const classic = generateLevel(
      {
        numColors: 4,
        colors: [...PALETTE],
        emptyCups: 2,
        hasMysteryLayer: false,
        phase: 'challenge',
      },
      'g17-legacy-classic',
    );
    expect(classic.cupConstraints.some((c) => c.pairedTeaGroup !== undefined)).toBe(false);
    const tray = generateLevel(
      {
        numColors: 4,
        colors: [...PALETTE],
        emptyCups: 2,
        hasMysteryLayer: false,
        phase: 'challenge',
        sharedTrayCount: 1,
      },
      'g17-legacy-tray',
    );
    expect(tray.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray').length).toBe(2);
    expect(tray.cupConstraints.some((c) => c.pairedTeaGroup !== undefined)).toBe(false);
  });

  it('legacy canonical keys remain byte-identical when no pair marker is present', () => {
    const cups: TeaId[][] = [[A, B], [], [B, A, A, B]];
    const cons: CupConstraint[] = [N, N, N];
    expect(
      canonicalPuzzleKey({ cups, floatingIngredients: emptyFloatingIngredients(3) }, cons),
    ).toBe(
      canonicalPuzzleKey(
        { cups, floatingIngredients: emptyFloatingIngredients(3) },
        cons.map((c) => ({ ...c })),
      ),
    );
  });
});
