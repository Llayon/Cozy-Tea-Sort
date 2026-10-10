/**
 * Gauntlet 11 — cinnamon rollout pins 81–88 and special-mechanic
 * invariants 1–1000.
 *
 * Levels 1–80 stay behaviorally identical (spot-checked, cinnamon-free,
 * frozen 66/70 and thermos 74/78 preserved); 81–88 introduce the cinnamon
 * stick on the exact 4c/6v 4,4,3,3,2,0 challenge topology (82 with the
 * first-encounter tutorial, 86 without a repeat — tutorial display itself
 * is App-level, keyed on currentLevel 82); 1–1000 obey max-2-specials with
 * the cinnamon counting as one standalone special, forbid cinnamon
 * combinations and triples, keep the cinnamon on challenge only, and cap
 * vessels at 7.
 */
import { describe, expect, it } from 'vitest';
import type { CapacityObstacleSlot, PuzzleState } from '../src/game/types';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';
import {
  analyzeCinnamonParticipation,
  cinnamonTemplateKindFor,
  createGenerateStats,
  generateLevel,
  validateLevelStructure,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';
import { CINNAMON_DEPTH_ACCEPT } from '../src/game/logic/cinnamonTemplates';
import type { SolverAction } from '../src/game/types';

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
    frozenCupCount: cfg.hasFrozenCup ? 1 : 0,
    thermosCupCount: cfg.hasThermos ? 1 : 0,
    cinnamonCupCount: (cfg as { hasCinnamon?: boolean }).hasCinnamon ? 1 : 0,
    targetTeaIds: [...cfg.targetTeaIds],
  };
}

describe('rollout 1–80 unchanged (cinnamon-free spot-check)', () => {
  it('pins pre-G11 mechanics exactly and never carries cinnamon', () => {
    const expectations: Array<[number, string, number]> = [
      [6, 'challenge', 6],
      [10, 'challenge', 6],
      [18, 'challenge', 6],
      [26, 'challenge', 6],
      [34, 'challenge', 6],
      [42, 'challenge', 5],
      [50, 'challenge', 6],
      [58, 'challenge', 6],
      [66, 'challenge', 6],
      [70, 'challenge', 6],
      [74, 'challenge', 6],
      [78, 'challenge', 6],
    ];
    for (const [lvl, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect((cfg as { hasCinnamon?: boolean }).hasCinnamon ?? false).toBe(false);
      expect(mechanicPlanForLevel(lvl).cinnamon).toBe(false);
    }
    // Frozen + thermos introductions preserved through G11.
    expect(getLevelConfig(66).hasFrozenCup).toBe(true);
    expect(getLevelConfig(70).hasFrozenCup).toBe(true);
    expect(getLevelConfig(74).hasThermos).toBe(true);
    expect(getLevelConfig(78).hasThermos).toBe(true);
    for (let lvl = 1; lvl <= 80; lvl++) {
      expect(mechanicPlanForLevel(lvl).cinnamon).toBe(false);
      expect((getLevelConfig(lvl) as { hasCinnamon?: boolean }).hasCinnamon ?? false).toBe(false);
    }
  });
});

describe('rollout 81–88 (Gauntlet 11 cinnamon introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, boolean, string, number, string]> = [
      // lvl, cinnamon, mystery, phase, totalCups, subtitle fragment
      [81, false, false, 'warmup', 5, 'медитативный'],
      [82, true, false, 'challenge', 6, 'Палочка корицы'],
      [83, false, true, 'peak', 7, 'Лимон'],
      [84, false, false, 'relax', 5, 'Выдох'],
      [85, false, false, 'warmup', 5, 'медитативный'],
      [86, true, false, 'challenge', 6, 'Палочка корицы'],
      [87, false, true, 'peak', 6, 'Ситечко'],
      [88, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, cinnamon, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect((cfg as { hasCinnamon?: boolean }).hasCinnamon ?? false).toBe(cinnamon);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.hasSourceOnlyTeapot).toBe(false);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.floatingIngredient).toBe(lvl === 83 ? 'lemon' : undefined);
      expect(cfg.sinkingIngredient).toBe(undefined);
      expect(cfg.hasFrozenCup).toBe(false);
      expect(cfg.hasThermos).toBe(false);
      expect(cfg.targetTeaIds).toEqual([]);
    }
    expect(getLevelConfig(83).floatingIngredient).toBe('lemon');
    expect(getLevelConfig(87).hasStrainer).toBe(true);
    const CLEAN = {
      teapot: false,
      targets: false,
      sink: false,
      tasting: false,
      lemon: false,
      strainer: false,
      honey: false,
      frozen: false,
      thermos: false,
      cinnamon: false, teaBloom: false, blend: false,
    };
    expect(mechanicPlanForLevel(81)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(82)).toEqual({ ...CLEAN, cinnamon: true });
    expect(mechanicPlanForLevel(83)).toEqual({ ...CLEAN, lemon: true });
    expect(mechanicPlanForLevel(84)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(85)).toEqual({ ...CLEAN });
    expect(mechanicPlanForLevel(86)).toEqual({ ...CLEAN, cinnamon: true });
    expect(mechanicPlanForLevel(87)).toEqual({ ...CLEAN, strainer: true });
    expect(mechanicPlanForLevel(88)).toEqual({ ...CLEAN });
  });

  it('levels 82/86 are 4c/6v cinnamon challenges (82 first, 86 no tutorial repeat)', () => {
    for (const lvl of [82, 86]) {
      const cfg = getLevelConfig(lvl);
      expect([cfg.numColors, cfg.totalCups, cfg.emptyCups]).toEqual([4, 6, 2]);
      expect(cfg.hasMysteryLayer).toBe(false);
      expect((cfg as { hasCinnamon?: boolean }).hasCinnamon).toBe(true);
      expect(cfg.phaseSubtitle).toBe('Палочка корицы • 6 сосудов');
    }
    // 82 is the FIRST cinnamon level, so the App-level first-encounter
    // tutorial (shown only when currentLevel === 82) fires exactly once.
    for (let lvl = 1; lvl < 82; lvl++) {
      expect((getLevelConfig(lvl) as { hasCinnamon?: boolean }).hasCinnamon ?? false).toBe(false);
    }
    // 86 repeats the identical config — same subtitle, NO tutorial repeat
    // (suppression is App-level: the banner renders only on level 82).
    expect(getLevelConfig(86).phaseSubtitle).toBe(getLevelConfig(82).phaseSubtitle);
  });
});

describe('rollout cinnamon generation (levels 82/86 via getLevelConfig)', () => {
  it.each([82, 86])('level %i generates a solver-valid L2 cinnamon level in-band', (lvlNum) => {
    const req = requestFromConfig(lvlNum);
    expect(req.cinnamonCupCount).toBe(1);
    expect(cinnamonTemplateKindFor(req)).toBe('cinnamon');
    const stats = createGenerateStats();
    const lvl = generateLevel(req, `cinnamon-rollout:${lvlNum}`, { stats });
    expect(stats.candidatesTried).toBe(0);
    expect(stats.usedFallback).toBe(false);
    expect(validateLevelStructure(lvl, req).ok).toBe(true);
    // Authored 4,4,3,3,2,0 shape with a mixed len-2 cinnamon host.
    const lens = lvl.cups.map((c) => c.length).sort((a, b) => a - b);
    expect(lens).toEqual([0, 2, 3, 3, 4, 4]);
    const host = (lvl.capacityObstacles ?? []).findIndex((s) => s === 'cinnamon');
    expect(host).toBeGreaterThanOrEqual(0);
    const hostCup = lvl.cups[host] as string[];
    expect(hostCup).toHaveLength(2);
    expect(hostCup[0]).not.toBe(hostCup[1]);
    const solved = solvePuzzle(lvl.cups, {
      cupConstraints: lvl.cupConstraints,
      floatingIngredients: lvl.floatingIngredients,
      capacityObstacles: lvl.capacityObstacles,
    });
    expect(solved.solvable).toBe(true);
    expect(solved.truncated ?? false).toBe(false);
    expect(solved.minMoves).toBe(lvl.minMoves);
    expect(lvl.minMoves).toBeGreaterThanOrEqual(CINNAMON_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(CINNAMON_DEPTH_ACCEPT.max);
    const trace = analyzeCinnamonParticipation(
      lvl.cups,
      (lvl.capacityObstacles ?? []) as CapacityObstacleSlot[],
      host,
      (solved.solution ?? []) as SolverAction[],
      lvl.cupConstraints,
    );
    expect(trace.unlocks).toBeGreaterThanOrEqual(1);
    expect(trace.firstExpandedUseDepth).not.toBe(null);
    expect(trace.finalObstacleCleared).toBe(true);
    expect(trace.win).toBe(true);
    const final = applySolutionState(
      { cups: lvl.cups, floatingIngredients: lvl.floatingIngredients, capacityObstacles: lvl.capacityObstacles },
      solved.solution ?? [],
      lvl.cupConstraints,
    );
    expect(final).not.toBe(null);
    expect(isPuzzleWonState(final as PuzzleState, lvl.cupConstraints)).toBe(true);
    expect((final as PuzzleState).capacityObstacles.every((s) => s === null)).toBe(true);
  }, 120000);
});

describe('rollout invariants 1–1000', () => {
  it('warmup/relax clean; max 2 specials incl. cinnamon; no cinnamon combos/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 1000; lvl++) {
      const cfg = getLevelConfig(lvl);
      const hasCinnamon = (cfg as { hasCinnamon?: boolean }).hasCinnamon ?? false;
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon, strainer, honey, frozen cup, thermos, cinnamon.
      // Lemon+honey counts as TWO.
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
        cfg.hasTastingBowl,
        cfg.floatingIngredient !== undefined,
        cfg.hasStrainer,
        cfg.sinkingIngredient !== undefined,
        cfg.hasFrozenCup,
        cfg.hasThermos,
        hasCinnamon,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      // Cinnamon is standalone: never combined, challenge only, 6 vessels.
      if (hasCinnamon) {
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.sinkingIngredient).toBe(undefined);
        expect(cfg.hasFrozenCup).toBe(false);
        expect(cfg.hasThermos).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.totalCups).toBe(6);
        expect(cfg.numColors).toBe(4);
        expect(cfg.emptyCups).toBe(2);
      }
      // Thermos standalone still holds through G11.
      if (cfg.hasThermos) {
        expect(cfg.phase).toBe('challenge');
        expect(hasCinnamon).toBe(false);
        expect(cfg.totalCups).toBe(6);
      }
      // Frozen standalone still holds through G11.
      if (cfg.hasFrozenCup) {
        expect(cfg.phase).toBe('challenge');
        expect(hasCinnamon).toBe(false);
        expect(cfg.totalCups).toBe(6);
      }
      // Interaction carve-out (G8) unchanged.
      if (cfg.floatingIngredient !== undefined && cfg.sinkingIngredient !== undefined) {
        expect(cfg.floatingIngredient).toBe('lemon');
        expect(cfg.sinkingIngredient).toBe('honey');
        expect(cfg.phase).toBe('challenge');
        expect(cfg.hasMysteryLayer).toBe(false);
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.hasFrozenCup).toBe(false);
        expect(cfg.hasThermos).toBe(false);
        expect(hasCinnamon).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
      }
      // Cinnamon exclusives vs every sibling mechanic.
      expect(hasCinnamon && cfg.hasStrainer).toBe(false);
      expect(hasCinnamon && cfg.floatingIngredient !== undefined).toBe(false);
      expect(hasCinnamon && cfg.sinkingIngredient !== undefined).toBe(false);
      expect(hasCinnamon && cfg.hasSinkGuestCup).toBe(false);
      expect(hasCinnamon && cfg.hasTastingBowl).toBe(false);
      expect(hasCinnamon && cfg.targetTeaIds.length > 0).toBe(false);
      expect(hasCinnamon && cfg.hasSourceOnlyTeapot).toBe(false);
      expect(hasCinnamon && cfg.hasMysteryLayer).toBe(false);
      expect(hasCinnamon && cfg.hasFrozenCup).toBe(false);
      expect(hasCinnamon && (cfg.hasThermos ?? false)).toBe(false);
      // Pre-existing exclusives still hold.
      expect(cfg.sinkingIngredient !== undefined && cfg.hasStrainer).toBe(false);
      expect(cfg.hasStrainer && cfg.floatingIngredient !== undefined).toBe(false);
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.sinkingIngredient).toBe(undefined);
        expect(cfg.hasStrainer).toBe(false);
        expect(cfg.hasFrozenCup).toBe(false);
        expect(cfg.hasThermos ?? false).toBe(false);
        expect(hasCinnamon).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-88 rotation serves cinnamon standalone on challenge without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    for (let lvl = 89; lvl <= 600; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.phase !== 'challenge') continue;
      const hasCinnamon = (cfg as { hasCinnamon?: boolean }).hasCinnamon ?? false;
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
        cfg.floatingIngredient ?? '',
        cfg.hasStrainer ? 'strainer' : '',
        cfg.sinkingIngredient ?? '',
        cfg.hasFrozenCup ? 'frozen' : '',
        cfg.hasThermos ? 'thermos' : '',
        hasCinnamon ? 'cinnamon' : '',
      ].filter(Boolean).join('+');
      seenChallenge.add(key || 'clean');
    }
    expect(seenChallenge.has('cinnamon')).toBe(true);
    expect(seenChallenge.has('thermos')).toBe(true);
    expect(seenChallenge.has('frozen')).toBe(true);
  });
});
