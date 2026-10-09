/**
 * Gauntlet 5 §89 — rollout pins 1–40 and special-mechanic invariants 1–400.
 *
 * Levels 1–32 preserve existing semantics exactly; 33–40 introduce the
 * lemon as specified; 1–400 obey max-2-specials with lemon counting as a
 * special category, forbid lemon+sink/tasting/targets and triples, cap at
 * 7 vessels, and require sea_buckthorn in every lemon palette.
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';

describe('rollout 1–32 unchanged (Gauntlets 0–4)', () => {
  it('pins mechanics exactly, no lemon', () => {
    const expectations: Array<[number, boolean, boolean, boolean, boolean, boolean, string, number]> = [
      // lvl, teapot, sink, tasting, mystery, targets?, phase, totalCups
      [1, false, false, false, false, false, 'warmup', 5],
      [6, true, false, false, false, false, 'challenge', 6],
      [10, false, false, false, false, true, 'challenge', 6],
      [14, true, false, false, false, true, 'challenge', 6],
      [18, false, true, false, false, false, 'challenge', 6],
      [19, false, true, false, true, false, 'peak', 7],
      [22, true, true, false, false, false, 'challenge', 6],
      [23, false, false, false, true, true, 'peak', 7],
      [24, false, false, false, false, false, 'relax', 5],
      [26, false, false, true, false, false, 'challenge', 6],
      [27, false, false, true, true, false, 'peak', 7],
      [30, true, false, true, false, false, 'challenge', 6],
      [31, false, false, false, true, true, 'peak', 7],
      [32, false, false, false, false, false, 'relax', 5],
    ];
    for (const [lvl, teapot, sink, tasting, mystery, targets, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasSinkGuestCup).toBe(sink);
      expect(cfg.hasTastingBowl).toBe(tasting);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.targetTeaIds.length > 0).toBe(targets);
      expect(cfg.floatingIngredient).toBe(undefined);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
    }
  });
});

describe('rollout 33–40 (Gauntlet 5 floating-lemon introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, string | undefined, boolean, string, number, string]> = [
      // lvl, teapot, lemon, mystery, phase, totalCups, subtitle fragment
      [33, false, undefined, false, 'warmup', 5, 'медитативный'],
      [34, false, 'lemon', false, 'challenge', 6, 'Долька лимона'],
      [35, false, 'lemon', true, 'peak', 7, 'таинственный настой'],
      [36, false, undefined, false, 'relax', 5, 'Выдох'],
      [37, false, undefined, false, 'warmup', 5, 'медитативный'],
      [38, true, 'lemon', false, 'challenge', 6, 'Чайник и лимон'],
      [39, false, undefined, true, 'peak', 7, 'таинственный настой'],
      [40, false, undefined, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, teapot, lemon, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.floatingIngredient).toBe(lemon);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.hasSinkGuestCup).toBe(lvl === 39);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      expect(cfg.targetTeaIds).toEqual([]);
      if (lemon !== undefined) {
        expect(cfg.colors).toContain('sea_buckthorn');
      }
    }
    expect(mechanicPlanForLevel(34)).toEqual({ teapot: false, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false });
    expect(mechanicPlanForLevel(38)).toEqual({ teapot: true, targets: false, sink: false, tasting: false, lemon: true, strainer: false, honey: false, frozen: false, thermos: false, cinnamon: false, teaBloom: false });
  });

  it('level 34/35/38 subtitles match the specified product copy', () => {
    expect(getLevelConfig(34).phaseSubtitle).toBe('Долька лимона • 6 сосудов');
    expect(getLevelConfig(35).phaseSubtitle).toBe('Лимон и таинственный настой • 7 сосудов');
    expect(getLevelConfig(38).phaseSubtitle).toBe('Чайник и лимон • 6 сосудов');
  });
});

describe('rollout invariants 1–400', () => {
  it('warmup/relax clean; max 2 specials; no forbidden pairs/triples; <=7 vessels; buckthorn with lemon', () => {
    for (let lvl = 1; lvl <= 400; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE),
      // tasting, lemon.
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
        cfg.hasTastingBowl,
        cfg.floatingIngredient !== undefined,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.hasTastingBowl).toBe(false);
      expect(cfg.floatingIngredient !== undefined && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      if (cfg.floatingIngredient !== undefined) {
        expect(cfg.colors).toContain('sea_buckthorn');
      }
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.floatingIngredient).toBe(undefined);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-40 rotation serves lemon without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    const seenPeak = new Set<string>();
    for (let lvl = 41; lvl <= 160; lvl++) {
      const cfg = getLevelConfig(lvl);
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
        cfg.floatingIngredient ?? '',
      ].filter(Boolean).join('+');
      if (cfg.phase === 'challenge') seenChallenge.add(key || 'clean');
      if (cfg.phase === 'peak') seenPeak.add(key || 'clean');
    }
    expect(seenChallenge.has('lemon')).toBe(true);
    expect(seenChallenge.has('teapot+lemon')).toBe(true);
    expect(seenPeak.has('lemon')).toBe(true);
  });
});
