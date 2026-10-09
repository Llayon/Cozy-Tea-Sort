/**
 * Gauntlet 6 §22–23, §25, §66 — strainer rollout pins 41–48 and
 * special-mechanic invariants 1–500.
 *
 * Levels 1–40 stay behaviorally identical (spot-checked); 41–48 introduce
 * the catch-one strainer on tight topologies (5 vessels challenge,
 * 6 vessels peak); 1–500 obey max-2-specials with the strainer counting
 * as a special category, forbid strainer+lemon/sink/tasting/targets and
 * triples, and cap vessels at 7.
 */
import { describe, expect, it } from 'vitest';
import type { PuzzleState } from '../src/game/types';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  createGenerateStats,
  generateLevel,
  requestedHasStrainer,
  strainerTemplateKindFor,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import { STRAINER_DEPTH_ACCEPT } from '../src/game/logic/strainerTemplates';

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
    targetTeaIds: [...cfg.targetTeaIds],
  };
}

describe('rollout 1–40 unchanged (Gauntlets 0–5 spot-check)', () => {
  it('pins teapot/targets/sink/tasting/lemon mechanics exactly, no strainer', () => {
    const expectations: Array<[number, boolean, boolean, boolean, boolean, string | undefined, boolean, string, number]> = [
      // lvl, teapot, sink, tasting, mystery, lemon, targets?, phase, totalCups
      [6, true, false, false, false, undefined, false, 'challenge', 6],
      [10, false, false, false, false, undefined, true, 'challenge', 6],
      [18, false, true, false, false, undefined, false, 'challenge', 6],
      [26, false, false, true, false, undefined, false, 'challenge', 6],
      [34, false, false, false, false, 'lemon', false, 'challenge', 6],
      [38, true, false, false, false, 'lemon', false, 'challenge', 6],
    ];
    for (const [lvl, teapot, sink, tasting, mystery, lemon, targets, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasSinkGuestCup).toBe(sink);
      expect(cfg.hasTastingBowl).toBe(tasting);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.floatingIngredient).toBe(lemon);
      expect(cfg.targetTeaIds.length > 0).toBe(targets);
      expect(cfg.hasStrainer).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      if (lemon !== undefined) expect(cfg.colors).toContain('sea_buckthorn');
    }
    expect(mechanicPlanForLevel(6)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: false, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(10)).toEqual({
      teapot: false, targets: true, sink: false, tasting: false, lemon: false, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(18)).toEqual({
      teapot: false, targets: false, sink: true, tasting: false, lemon: false, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(26)).toEqual({
      teapot: false, targets: false, sink: false, tasting: true, lemon: false, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(34)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(38)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
  });
});

describe('rollout 41–48 (Gauntlet 6 catch-one strainer introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, boolean, string | undefined, boolean, string, number, string]> = [
      // lvl, teapot, strainer, lemon, mystery, phase, totalCups, subtitle fragment
      [41, false, false, undefined, false, 'warmup', 5, 'медитативный'],
      [42, false, true, undefined, false, 'challenge', 5, 'Переносное ситечко'],
      [43, false, true, undefined, true, 'peak', 6, 'таинственный настой'],
      [44, false, false, undefined, false, 'relax', 5, 'Выдох'],
      [45, false, false, undefined, false, 'warmup', 5, 'медитативный'],
      [46, true, true, undefined, false, 'challenge', 5, 'Чайник и ситечко'],
      [47, false, false, 'lemon', true, 'peak', 7, 'таинственный настой'],
      [48, false, false, undefined, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, teapot, strainer, lemon, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasStrainer).toBe(strainer);
      expect(cfg.floatingIngredient).toBe(lemon);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.targetTeaIds).toEqual([]);
      if (strainer) {
        // Tight G6 topology: exactly one ordinary empty vessel.
        expect(cfg.emptyCups).toBe(1);
        if (phase === 'challenge') expect(cfg.numColors).toBe(4);
        else expect(cfg.numColors).toBe(5);
      }
      if (lemon !== undefined) expect(cfg.colors).toContain('sea_buckthorn');
    }
    expect(mechanicPlanForLevel(42)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: false, strainer: true, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(46)).toEqual({
      teapot: true, targets: false, sink: false, tasting: false, lemon: false, strainer: true, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
    expect(mechanicPlanForLevel(47)).toEqual({
      teapot: false, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false,
    });
  });

  it('level 42/43/46 subtitles match the specified product copy', () => {
    expect(getLevelConfig(42).phaseSubtitle).toBe('Переносное ситечко • 5 сосудов');
    expect(getLevelConfig(43).phaseSubtitle).toBe('Ситечко и таинственный настой • 6 сосудов');
    expect(getLevelConfig(46).phaseSubtitle).toBe('Чайник и ситечко • 5 сосудов');
  });

  it('level 42 is a 4c/5v/1e strainer challenge; 43 a 5c/6v/1e peak; 46 teapot + strainer', () => {
    const c42 = getLevelConfig(42);
    expect([c42.numColors, c42.totalCups, c42.emptyCups]).toEqual([4, 5, 1]);
    expect(c42.hasMysteryLayer).toBe(false);
    const c43 = getLevelConfig(43);
    expect([c43.numColors, c43.totalCups, c43.emptyCups]).toEqual([5, 6, 1]);
    expect(c43.hasMysteryLayer).toBe(true);
    const c46 = getLevelConfig(46);
    expect([c46.numColors, c46.totalCups, c46.emptyCups]).toEqual([4, 5, 1]);
    expect(c46.hasSourceOnlyTeapot).toBe(true);
    const c47 = getLevelConfig(47);
    expect(c47.hasStrainer).toBe(false);
    expect(c47.floatingIngredient).toBe('lemon');
    expect(c47.hasMysteryLayer).toBe(true);
  });
});

describe('rollout strainer generation (levels 42/43/46 via getLevelConfig)', () => {
  it.each([42, 43, 46])('level %i generates a solver-valid rescued strainer level in-band', (lvlNum) => {
    const req = requestFromConfig(lvlNum);
    expect(requestedHasStrainer(req)).toBe(true);
    const kind = strainerTemplateKindFor(req);
    expect(kind).not.toBe(null);
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `strainer-rollout:${lvlNum}`, { stats });
    expect(stats.candidatesTried).toBe(0);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // WITH the tool: solvable with the REAL recorded depth in the accept band.
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      strainer: lvl.strainer,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated).not.toBe(true);
    expect(solved.minMoves).toBe(lvl.minMoves);
    const band = STRAINER_DEPTH_ACCEPT[kind as 'strainer-challenge'];
    expect(lvl.minMoves).toBeGreaterThanOrEqual(band.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(band.max);
    // WITHOUT the tool: absent and non-truncated unsolvable (rescue proof).
    const wo = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
    });
    expect(wo.solvable).toBe(false);
    expect(wo.truncated).not.toBe(true);
    // Optimal replay wins with the tool held null.
    const final = applySolutionState(
      { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, strainer: lvl.strainer },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
  });
});

describe('rollout invariants 1–500', () => {
  it('warmup/relax clean; max 2 specials; no forbidden strainer combos/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 500; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon, strainer.
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
        cfg.hasTastingBowl,
        cfg.floatingIngredient !== undefined,
        cfg.hasStrainer,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      // Strainer exclusives (Gauntlet 6 tight scope).
      expect(cfg.hasStrainer && cfg.floatingIngredient !== undefined).toBe(false);
      expect(cfg.hasStrainer && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasStrainer && cfg.hasTastingBowl).toBe(false);
      expect(cfg.hasStrainer && cfg.targetTeaIds.length > 0).toBe(false);
      // Pre-existing exclusives still hold.
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.hasTastingBowl).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      // Tight strainer vessels: 5 challenge / 6 peak (never the 7-row break).
      if (cfg.hasStrainer) {
        expect(cfg.emptyCups).toBe(1);
        if (cfg.phase === 'challenge') expect(cfg.totalCups).toBe(5);
        else if (cfg.phase === 'peak') expect(cfg.totalCups).toBe(6);
      }
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-48 rotation serves strainer without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    const seenPeak = new Set<string>();
    for (let lvl = 49; lvl <= 200; lvl++) {
      const cfg = getLevelConfig(lvl);
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
        cfg.floatingIngredient ?? '',
        cfg.hasStrainer ? 'strainer' : '',
      ].filter(Boolean).join('+');
      if (cfg.phase === 'challenge') seenChallenge.add(key || 'clean');
      if (cfg.phase === 'peak') seenPeak.add(key || 'clean');
    }
    expect(seenChallenge.has('strainer')).toBe(true);
    expect(seenPeak.has('strainer')).toBe(true);
  });
});
