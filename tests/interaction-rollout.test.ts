/**
 * Gauntlet 8 §72-73, §94-97 — lemon+honey interaction rollout pins 57–64
 * and special-mechanic invariants 1–700.
 *
 * Levels 1–56 stay behaviorally identical (spot-checked, interaction-free);
 * 57–64 introduce the lemon+honey interaction on the exact 4c/6v/2e
 * challenge topology (58 with the first-encounter tutorial, 62 without a
 * repeat — tutorial display itself is App-level, keyed on currentLevel 58);
 * 1–700 obey max-2-specials with lemon+honey counting as two, forbid
 * lemon+honey+third and triples, keep lemon+honey on challenge only, and
 * cap vessels at 7.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState, TeaId } from '../src/game/types';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  analyzeIngredientInteraction,
  createGenerateStats,
  generateLevel,
  lemonHoneyTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import { LEMON_HONEY_DEPTH_ACCEPT } from '../src/game/logic/lemonHoneyTemplates';

function requestFromConfig(levelNum: number): GenerateRequest {
  const cfg = getLevelConfig(levelNum);
  return {
    numColors: cfg.numColors,
    colors: cfg.colors,
    emptyCups: cfg.emptyCups,
    hasMysteryLayer: cfg.hasMysteryLayer,
    phase: cfg.phase,
    sourceOnlyCount: cfg.hasSourceOnlyTeapot ? 1 : 0,
    sinkOnlyCount: cfg.hasSinkGuestCup ? 1 : 0,
    tastingCupCount: cfg.hasTastingBowl ? 1 : 0,
    floatingIngredient: cfg.floatingIngredient,
    hasStrainer: cfg.hasStrainer,
    sinkingIngredient: cfg.sinkingIngredient,
    targetTeaIds: [...cfg.targetTeaIds],
  };
}

describe('rollout 1–56 unchanged (Gauntlets 0–7 spot-check, interaction-free)', () => {
  it('pins teapot/targets/sink/tasting/lemon/strainer/honey mechanics exactly, no lemon+honey', () => {
    const expectations: Array<
      [
        number,
        boolean,
        boolean,
        boolean,
        string | undefined,
        string | undefined,
        boolean,
        boolean,
        boolean,
        string,
        number,
      ]
    > = [
      // lvl, teapot, sink, tasting, lemon, honey, strainer, mystery, targets?, phase, totalCups
      [6, true, false, false, undefined, undefined, false, false, false, 'challenge', 6],
      [10, false, false, false, undefined, undefined, false, false, true, 'challenge', 6],
      [18, false, true, false, undefined, undefined, false, false, false, 'challenge', 6],
      [26, false, false, true, undefined, undefined, false, false, false, 'challenge', 6],
      [34, false, false, false, 'lemon', undefined, false, false, false, 'challenge', 6],
      [38, true, false, false, 'lemon', undefined, false, false, false, 'challenge', 6],
      [42, false, false, false, undefined, undefined, true, false, false, 'challenge', 5],
      [43, false, false, false, undefined, undefined, true, true, false, 'peak', 6],
      [46, true, false, false, undefined, undefined, true, false, false, 'challenge', 5],
      [47, false, false, false, 'lemon', undefined, false, true, false, 'peak', 7],
      [50, false, false, false, undefined, 'honey', false, false, false, 'challenge', 6],
      [51, false, false, false, undefined, 'honey', false, true, false, 'peak', 7],
      [54, true, false, false, undefined, 'honey', false, false, false, 'challenge', 6],
      [55, false, false, false, undefined, undefined, true, true, false, 'peak', 6],
    ];
    for (const [
      lvl,
      teapot,
      sink,
      tasting,
      lemon,
      honey,
      strainer,
      mystery,
      targets,
      phase,
      total,
    ] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasSinkGuestCup).toBe(sink);
      expect(cfg.hasTastingBowl).toBe(tasting);
      expect(cfg.floatingIngredient).toBe(lemon);
      expect(cfg.sinkingIngredient).toBe(honey);
      expect(cfg.hasStrainer).toBe(strainer);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.targetTeaIds.length > 0).toBe(targets);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      // No lemon+honey interaction anywhere in 1–56.
      expect(cfg.floatingIngredient === 'lemon' && cfg.sinkingIngredient === 'honey').toBe(false);
      if (lemon !== undefined) expect(cfg.colors).toContain('sea_buckthorn');
      if (honey !== undefined) expect(cfg.colors).toContain('buckwheat');
    }
    const CLEAN = {
      teapot: false,
      targets: false,
      sink: false,
      tasting: false,
      lemon: false,
      strainer: false,
      honey: false,
      frozen: false,
    };
    expect(mechanicPlanForLevel(6)).toEqual({ ...CLEAN, teapot: true });
    expect(mechanicPlanForLevel(10)).toEqual({ ...CLEAN, targets: true });
    expect(mechanicPlanForLevel(18)).toEqual({ ...CLEAN, sink: true });
    expect(mechanicPlanForLevel(26)).toEqual({ ...CLEAN, tasting: true });
    expect(mechanicPlanForLevel(34)).toEqual({ ...CLEAN, lemon: true });
    expect(mechanicPlanForLevel(38)).toEqual({ ...CLEAN, teapot: true, lemon: true });
    expect(mechanicPlanForLevel(42)).toEqual({ ...CLEAN, strainer: true });
    expect(mechanicPlanForLevel(43)).toEqual({ ...CLEAN, strainer: true });
    expect(mechanicPlanForLevel(46)).toEqual({ ...CLEAN, teapot: true, strainer: true });
    expect(mechanicPlanForLevel(47)).toEqual({ ...CLEAN, lemon: true });
    expect(mechanicPlanForLevel(50)).toEqual({ ...CLEAN, honey: true });
    expect(mechanicPlanForLevel(51)).toEqual({ ...CLEAN, honey: true });
    expect(mechanicPlanForLevel(54)).toEqual({ ...CLEAN, teapot: true, honey: true });
    expect(mechanicPlanForLevel(55)).toEqual({ ...CLEAN, strainer: true });
  });
});

describe('rollout 57–64 (Gauntlet 8 lemon+honey interaction introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<
      [number, string | undefined, string | undefined, boolean, boolean, string, number, string]
    > = [
      // lvl, lemon, honey, strainer, mystery, phase, totalCups, subtitle fragment
      [57, undefined, undefined, false, false, 'warmup', 5, 'медитативный'],
      [58, 'lemon', 'honey', false, false, 'challenge', 6, 'Лимон и мёд'],
      [59, undefined, 'honey', false, true, 'peak', 7, 'таинственный настой'],
      [60, undefined, undefined, false, false, 'relax', 5, 'Выдох'],
      [61, undefined, undefined, false, false, 'warmup', 5, 'медитативный'],
      [62, 'lemon', 'honey', false, false, 'challenge', 6, 'Лимон и мёд'],
      [63, undefined, undefined, true, true, 'peak', 6, 'таинственный настой'],
      [64, undefined, undefined, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, lemon, honey, strainer, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.floatingIngredient).toBe(lemon);
      expect(cfg.sinkingIngredient).toBe(honey);
      expect(cfg.hasStrainer).toBe(strainer);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.targetTeaIds).toEqual([]);
      if (honey !== undefined) expect(cfg.colors).toContain('buckwheat');
      if (lemon !== undefined) expect(cfg.colors).toContain('sea_buckthorn');
      if (strainer) expect(cfg.emptyCups).toBe(1);
    }
    const CLEAN = {
      teapot: false,
      targets: false,
      sink: false,
      tasting: false,
      lemon: false,
      strainer: false,
      honey: false,
      frozen: false,
    };
    expect(mechanicPlanForLevel(57)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(58)).toEqual({ ...CLEAN, lemon: true, honey: true });
    expect(mechanicPlanForLevel(59)).toEqual({ ...CLEAN, honey: true });
    expect(mechanicPlanForLevel(60)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(61)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(62)).toEqual({ ...CLEAN, lemon: true, honey: true });
    expect(mechanicPlanForLevel(63)).toEqual({ ...CLEAN, strainer: true });
    expect(mechanicPlanForLevel(64)).toEqual({ ...CLEAN });
  });

  it('levels 58/62 are 4c/6v/2e lemon+honey challenges with the specified product copy', () => {
    for (const lvl of [58, 62]) {
      const cfg = getLevelConfig(lvl);
      expect([cfg.numColors, cfg.totalCups, cfg.emptyCups]).toEqual([4, 6, 2]);
      expect(cfg.hasMysteryLayer).toBe(false);
      expect(cfg.floatingIngredient).toBe('lemon');
      expect(cfg.sinkingIngredient).toBe('honey');
      expect(cfg.colors).toContain('buckwheat');
      expect(cfg.colors).toContain('sea_buckthorn');
      expect(cfg.phaseSubtitle).toBe('Лимон и мёд • 6 сосудов');
    }
    // 58 is the FIRST lemon+honey level, so the App-level first-encounter
    // tutorial (shown only when currentLevel === 58) fires exactly once.
    for (let lvl = 1; lvl < 58; lvl++) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.floatingIngredient === 'lemon' && cfg.sinkingIngredient === 'honey').toBe(false);
    }
    // 62 repeats the identical config — same subtitle, NO tutorial repeat
    // (suppression is App-level: the banner renders only on level 58).
    expect(getLevelConfig(62).phaseSubtitle).toBe(getLevelConfig(58).phaseSubtitle);
    expect(getLevelConfig(59).floatingIngredient).toBe(undefined);
    expect(getLevelConfig(59).sinkingIngredient).toBe('honey');
    expect(getLevelConfig(59).phaseSubtitle).toBe('Мёд и таинственный настой • 7 сосудов');
    expect(getLevelConfig(63).phaseSubtitle).toBe('Ситечко и таинственный настой • 6 сосудов');
  });
});

describe('rollout interaction generation (levels 58/62 via getLevelConfig)', () => {
  it.each([58, 62])('level %i generates a solver-valid L2 interaction level in-band', (lvlNum) => {
    const req = requestFromConfig(lvlNum);
    expect(req.floatingIngredient).toBe('lemon');
    expect(req.sinkingIngredient).toBe('honey');
    const kind = lemonHoneyTemplateKindFor(req);
    expect(kind).toBe('lemon-honey-interaction');
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `interaction-rollout:${lvlNum}`, { stats });
    expect(stats.candidatesTried).toBe(0);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // WITH lemon+honey: solvable with the REAL recorded depth in 8–16.
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(LEMON_HONEY_DEPTH_ACCEPT.max);
    // L2 interaction: cohost + split + both relocations, both goals, win.
    const trace = analyzeIngredientInteraction(
      lvl.cups,
      lvl.floatingIngredients,
      lvl.sinkingIngredients ?? [],
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(trace.lemonMoves).toBeGreaterThanOrEqual(1);
    expect(trace.honeyStays).toBeGreaterThanOrEqual(1);
    expect(trace.honeyMoves).toBeGreaterThanOrEqual(1);
    expect(trace.cohostStates).toBeGreaterThanOrEqual(1);
    expect(trace.splitEvents).toBeGreaterThanOrEqual(1);
    expect(trace.finalLemonOk).toBe(true);
    expect(trace.finalHoneyOk).toBe(true);
    expect(trace.finalLemonHost).not.toBe(trace.finalHoneyHost);
    expect(trace.win).toBe(true);
    const final = applySolutionState(
      {
        cups: lvl.cups,
        floatingIngredients: lvl.floatingIngredients,
        sinkingIngredients: lvl.sinkingIngredients,
      },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
    const lemonHost = (final as PuzzleState).floatingIngredients.findIndex((s) => s === 'lemon');
    const honeyHost = (final as PuzzleState).sinkingIngredients.findIndex((s) => s === 'honey');
    expect((final as PuzzleState).cups[lemonHost]?.[0]).toBe('sea_buckthorn' as TeaId);
    expect((final as PuzzleState).cups[lemonHost]).toHaveLength(4);
    expect((final as PuzzleState).cups[honeyHost]?.[0]).toBe('buckwheat' as TeaId);
    expect((final as PuzzleState).cups[honeyHost]).toHaveLength(4);
  }, 120000);
});

describe('rollout invariants 1–700', () => {
  it('warmup/relax clean; max 2 specials incl. lemon+honey; no forbidden combos/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 700; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon, strainer, honey. Lemon+honey counts as TWO.
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
        cfg.hasTastingBowl,
        cfg.floatingIngredient !== undefined,
        cfg.hasStrainer,
        cfg.sinkingIngredient !== undefined,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      // Interaction carve-out: lemon+honey is allowed ONLY as exactly
      // {lemon, honey} on challenge with no third special.
      if (cfg.floatingIngredient !== undefined && cfg.sinkingIngredient !== undefined) {
        expect(cfg.floatingIngredient).toBe('lemon');
        expect(cfg.sinkingIngredient).toBe('honey');
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
      }
      // Honey exclusives (Gauntlet 7 scope + interaction carve-out above).
      expect(cfg.sinkingIngredient !== undefined && cfg.hasStrainer).toBe(false);
      expect(cfg.sinkingIngredient !== undefined && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.sinkingIngredient !== undefined && cfg.hasTastingBowl).toBe(false);
      expect(cfg.sinkingIngredient !== undefined && cfg.targetTeaIds.length > 0).toBe(false);
      // Pre-existing exclusives still hold.
      expect(cfg.hasStrainer && cfg.floatingIngredient !== undefined).toBe(false);
      expect(cfg.hasStrainer && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasStrainer && cfg.hasTastingBowl).toBe(false);
      expect(cfg.hasStrainer && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.hasTastingBowl).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      // Lemon+honey appears ONLY on challenge (never peak/mystery).
      if (cfg.floatingIngredient === 'lemon' && cfg.sinkingIngredient === 'honey') {
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.totalCups).toBe(6);
        expect(cfg.emptyCups).toBe(2);
      }
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.sinkingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-64 rotation serves lemon+honey on challenge without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    for (let lvl = 65; lvl <= 400; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.phase !== 'challenge') continue;
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
        cfg.floatingIngredient ?? '',
        cfg.hasStrainer ? 'strainer' : '',
        cfg.sinkingIngredient ?? '',
      ].filter(Boolean).join('+');
      seenChallenge.add(key || 'clean');
    }
    expect(seenChallenge.has('lemon+honey')).toBe(true);
  });
});
