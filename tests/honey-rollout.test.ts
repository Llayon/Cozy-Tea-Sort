/**
 * Gauntlet 7 §72–75, §66 — honey rollout pins 49–56 and
 * special-mechanic invariants 1–600.
 *
 * Levels 1–48 stay behaviorally identical (spot-checked, honey:false);
 * 49–56 introduce sinking honey on loose topologies (6 vessels challenge,
 * 7 vessels peak, teapot host at 0); 1–600 obey max-2-specials with honey
 * counting as a special category, forbid honey+lemon/strainer/sink/
 * tasting/targets and triples, and cap vessels at 7.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState } from '../src/game/types';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  analyzeHoneyParticipation,
  createGenerateStats,
  generateLevel,
  honeyTemplateKindFor,
  requestedSinkingIngredient,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import { HONEY_DEPTH_ACCEPT, HONEY_TARGET_TEA } from '../src/game/logic/honeyTemplates';

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

describe('rollout 1–48 unchanged (Gauntlets 0–6 spot-check, honey:false)', () => {
  it('pins teapot/targets/sink/tasting/lemon/strainer mechanics exactly, no honey', () => {
    const expectations: Array<[number, boolean, boolean, boolean, string | undefined, boolean, boolean, string, number]> = [
      // lvl, teapot, sink, tasting, lemon, strainer, targets?, phase, totalCups
      [6, true, false, false, undefined, false, false, 'challenge', 6],
      [10, false, false, false, undefined, false, true, 'challenge', 6],
      [18, false, true, false, undefined, false, false, 'challenge', 6],
      [26, false, false, true, undefined, false, false, 'challenge', 6],
      [34, false, false, false, 'lemon', false, false, 'challenge', 6],
      [38, true, false, false, 'lemon', false, false, 'challenge', 6],
      [42, false, false, false, undefined, true, false, 'challenge', 5],
      [43, false, false, false, undefined, true, false, 'peak', 6],
      [46, true, false, false, undefined, true, false, 'challenge', 5],
      [47, false, false, false, 'lemon', false, false, 'peak', 7],
    ];
    for (const [lvl, teapot, sink, tasting, lemon, strainer, targets, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasSinkGuestCup).toBe(sink);
      expect(cfg.hasTastingBowl).toBe(tasting);
      expect(cfg.floatingIngredient).toBe(lemon);
      expect(cfg.hasStrainer).toBe(strainer);
      expect(cfg.sinkingIngredient).toBe(undefined);
      expect(cfg.targetTeaIds.length > 0).toBe(targets);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      if (lemon !== undefined) expect(cfg.colors).toContain('sea_buckthorn');
    }
    expect(mechanicPlanForLevel(6)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: false, strainer: false, honey: false,
    });
    expect(mechanicPlanForLevel(10)).toEqual({
      teapot: false, targets: true, sink: false, tasting: false, lemon: false, strainer: false, honey: false,
    });
    expect(mechanicPlanForLevel(18)).toEqual({
      teapot: false, targets: false, sink: true, tasting: false, lemon: false, strainer: false, honey: false,
    });
    expect(mechanicPlanForLevel(26)).toEqual({
      teapot: false, targets: false, sink: false, tasting: true, lemon: false, strainer: false, honey: false,
    });
    expect(mechanicPlanForLevel(34)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false,
    });
    expect(mechanicPlanForLevel(38)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false,
    });
    expect(mechanicPlanForLevel(42)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: true, honey: false,
    });
    expect(mechanicPlanForLevel(43)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: true, honey: false,
    });
    expect(mechanicPlanForLevel(46)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: false, strainer: true, honey: false,
    });
    expect(mechanicPlanForLevel(47)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false,
    });
  });
});

describe('rollout 49–56 (Gauntlet 7 sinking-honey introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, string | undefined, boolean, boolean, string, number, string]> = [
      // lvl, teapot, honey, strainer, mystery, phase, totalCups, subtitle fragment
      [49, false, undefined, false, false, 'warmup', 5, 'медитативный'],
      [50, false, 'honey', false, false, 'challenge', 6, 'Мёд на дне'],
      [51, false, 'honey', false, true, 'peak', 7, 'таинственный настой'],
      [52, false, undefined, false, false, 'relax', 5, 'Выдох'],
      [53, false, undefined, false, false, 'warmup', 5, 'медитативный'],
      [54, true, 'honey', false, false, 'challenge', 6, 'Чайник с мёдом'],
      [55, false, undefined, true, true, 'peak', 6, 'таинственный настой'],
      [56, false, undefined, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, teapot, honey, strainer, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.sinkingIngredient).toBe(honey);
      expect(cfg.hasStrainer).toBe(strainer);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.floatingIngredient).toBe(undefined);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.targetTeaIds).toEqual([]);
      if (honey !== undefined) {
        expect(cfg.colors).toContain('buckwheat');
        if (phase === 'challenge') expect(cfg.numColors).toBe(4);
        else expect(cfg.numColors).toBe(5);
        expect(cfg.emptyCups).toBe(2);
      }
      if (strainer) expect(cfg.emptyCups).toBe(1);
    }
    expect(mechanicPlanForLevel(50)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: false, honey: true,
    });
    expect(mechanicPlanForLevel(51)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: false, honey: true,
    });
    expect(mechanicPlanForLevel(54)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: false, strainer: false, honey: true,
    });
    expect(mechanicPlanForLevel(55)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: true, honey: false,
    });
  });

  it('level 50/51/54 subtitles match the specified product copy', () => {
    expect(getLevelConfig(50).phaseSubtitle).toBe('Мёд на дне • 6 сосудов');
    expect(getLevelConfig(51).phaseSubtitle).toBe('Мёд и таинственный настой • 7 сосудов');
    expect(getLevelConfig(54).phaseSubtitle).toBe('Чайник с мёдом • 6 сосудов');
  });

  it('level 50 is a 4c/6v/2e honey challenge; 51 a 5c/7v/2e peak; 54 teapot + honey', () => {
    const c50 = getLevelConfig(50);
    expect([c50.numColors, c50.totalCups, c50.emptyCups]).toEqual([4, 6, 2]);
    expect(c50.hasMysteryLayer).toBe(false);
    expect(c50.colors).toContain('buckwheat');
    const c51 = getLevelConfig(51);
    expect([c51.numColors, c51.totalCups, c51.emptyCups]).toEqual([5, 7, 2]);
    expect(c51.hasMysteryLayer).toBe(true);
    const c54 = getLevelConfig(54);
    expect([c54.numColors, c54.totalCups, c54.emptyCups]).toEqual([4, 6, 2]);
    expect(c54.hasSourceOnlyTeapot).toBe(true);
    const c55 = getLevelConfig(55);
    expect(c55.sinkingIngredient).toBe(undefined);
    expect(c55.hasStrainer).toBe(true);
    expect(c55.hasMysteryLayer).toBe(true);
  });
});

describe('rollout honey generation (levels 50/51/54 via getLevelConfig)', () => {
  it.each([50, 51, 54])('level %i generates a solver-valid participating honey level in-band', (lvlNum) => {
    const req = requestFromConfig(lvlNum);
    expect(requestedSinkingIngredient(req)).toBe('honey');
    const kind = honeyTemplateKindFor(req);
    expect(kind).not.toBe(null);
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `honey-rollout:${lvlNum}`, { stats });
    expect(stats.candidatesTried).toBe(0);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // WITH honey: solvable with the REAL recorded depth in the accept band.
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      sinkingIngredients: lvl.sinkingIngredients,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const band = HONEY_DEPTH_ACCEPT[kind as 'honey-challenge'];
    expect(lvl.minMoves).toBeGreaterThanOrEqual(band.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(band.max);
    // Participation: stay + move, final honey under full buckwheat, win.
    const part = analyzeHoneyParticipation(
      lvl.cups,
      lvl.sinkingIngredients ?? [],
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(part.stays).toBeGreaterThanOrEqual(1);
    expect(part.moves).toBeGreaterThanOrEqual(1);
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
    const host = (final as PuzzleState).sinkingIngredients.findIndex((s) => s === 'honey');
    expect(host).toBeGreaterThanOrEqual(0);
    expect((final as PuzzleState).cups[host]?.[0]).toBe(HONEY_TARGET_TEA);
    expect((final as PuzzleState).cups[host]).toHaveLength(4);
  }, 120000);
});

describe('rollout invariants 1–600', () => {
  it('warmup/relax clean; max 2 specials incl. honey; no forbidden honey combos/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 600; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon, strainer, honey.
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
      // Honey exclusives (Gauntlet 7 scope, Gauntlet 8 interaction carve-out:
      // lemon+honey is allowed ONLY as exactly {lemon, honey} on challenge
      // with no third special — levels 58/62 and the post-64 rotation).
      if (cfg.sinkingIngredient !== undefined && cfg.floatingIngredient !== undefined) {
        expect(cfg.floatingIngredient).toBe('lemon');
        expect(cfg.sinkingIngredient).toBe('honey');
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
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
      // Honey vessels: 6 challenge / 7 peak (never the row break).
      if (cfg.sinkingIngredient !== undefined) {
        expect(cfg.emptyCups).toBe(2);
        if (cfg.phase === 'challenge') expect(cfg.totalCups).toBe(6);
        else if (cfg.phase === 'peak') expect(cfg.totalCups).toBe(7);
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

  it('post-56 rotation serves honey without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    const seenPeak = new Set<string>();
    for (let lvl = 57; lvl <= 300; lvl++) {
      const cfg = getLevelConfig(lvl);
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
        cfg.floatingIngredient ?? '',
        cfg.hasStrainer ? 'strainer' : '',
        cfg.sinkingIngredient ?? '',
      ].filter(Boolean).join('+');
      if (cfg.phase === 'challenge') seenChallenge.add(key || 'clean');
      if (cfg.phase === 'peak') seenPeak.add(key || 'clean');
    }
    expect(seenChallenge.has('honey')).toBe(true);
    expect(seenPeak.has('honey')).toBe(true);
  });
});
