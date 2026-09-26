/**
 * Gauntlet 4 §58 — rollout pins 1–32 and special-mechanic invariants 1–300.
 *
 * Levels 1–24 preserve existing semantics exactly; 25–32 introduce the
 * tasting bowl as specified; 1–300 obey max-2-specials with tasting
 * counting as a special category (target pair = ONE category).
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';

describe('rollout 1–24 unchanged (Gauntlets 0–3)', () => {
  it('pins teapot/sink/targets/mystery/phase/cup counts exactly, no tasting', () => {
    const expectations: Array<[number, boolean, boolean, boolean, boolean, string, number]> = [
      // lvl, teapot, sink, mystery, targets?, phase, totalCups
      [1, false, false, false, false, 'warmup', 5],
      [2, false, false, false, false, 'challenge', 6],
      [6, true, false, false, false, 'challenge', 6],
      [7, true, false, true, false, 'peak', 7],
      [10, false, false, false, true, 'challenge', 6],
      [11, false, false, true, true, 'peak', 7],
      [14, true, false, false, true, 'challenge', 6],
      [15, true, false, true, false, 'peak', 7],
      [16, false, false, false, false, 'relax', 5],
      [18, false, true, false, false, 'challenge', 6],
      [19, false, true, true, false, 'peak', 7],
      [22, true, true, false, false, 'challenge', 6],
      [23, false, false, true, true, 'peak', 7],
      [24, false, false, false, false, 'relax', 5],
    ];
    for (const [lvl, teapot, sink, mystery, targets, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasSinkGuestCup).toBe(sink);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.targetTeaIds.length > 0).toBe(targets);
      expect(cfg.hasTastingBowl).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
    }
  });
});

describe('rollout 25–32 (Gauntlet 4 tasting-bowl introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, boolean, string, number, string]> = [
      // lvl, teapot, tasting, mystery, phase, totalCups, subtitle fragment
      [25, false, false, false, 'warmup', 5, 'медитативный'],
      [26, false, true, false, 'challenge', 6, 'Дегустационная пиала'],
      [27, false, true, true, 'peak', 7, 'таинственный настой'],
      [28, false, false, false, 'relax', 5, 'Выдох'],
      [29, false, false, false, 'warmup', 5, 'медитативный'],
      [30, true, true, false, 'challenge', 6, 'Чайник и дегустационная пиала'],
      [31, false, false, true, 'peak', 7, 'Сервировка'],
      [32, false, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, teapot, tasting, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasTastingBowl).toBe(tasting);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      if (lvl === 31) expect(cfg.targetTeaIds.length).toBe(2);
      else expect(cfg.targetTeaIds).toEqual([]);
    }
    expect(mechanicPlanForLevel(26)).toEqual({ teapot: false, targets: false, sink: false, tasting: true });
    expect(mechanicPlanForLevel(30)).toEqual({ teapot: true, targets: false, sink: false, tasting: true });
  });

  it('level 26/27/30 subtitles match the specified product copy', () => {
    expect(getLevelConfig(26).phaseSubtitle).toBe('Дегустационная пиала • 6 сосудов');
    expect(getLevelConfig(27).phaseSubtitle).toBe('Пиала и таинственный настой • 7 сосудов');
    expect(getLevelConfig(30).phaseSubtitle).toBe('Чайник и дегустационная пиала • 6 сосудов');
  });
});

describe('rollout invariants 1–300', () => {
  it('warmup/relax clean; max 2 specials; no forbidden pairs/triples; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 300; lvl++) {
      const cfg = getLevelConfig(lvl);
      // Special categories: mystery, teapot, sink, targets (pair = ONE), tasting.
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
        cfg.hasTastingBowl,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.targetTeaIds.length > 0).toBe(false);
      expect(cfg.hasTastingBowl && cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.hasTastingBowl).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('post-32 rotation serves tasting without forbidden combos', () => {
    const seenChallenge = new Set<string>();
    const seenPeak = new Set<string>();
    for (let lvl = 33; lvl <= 120; lvl++) {
      const cfg = getLevelConfig(lvl);
      const key = [
        cfg.hasSourceOnlyTeapot ? 'teapot' : '',
        cfg.hasSinkGuestCup ? 'sink' : '',
        cfg.targetTeaIds.length > 0 ? 'targets' : '',
        cfg.hasTastingBowl ? 'tasting' : '',
      ].filter(Boolean).join('+');
      if (cfg.phase === 'challenge') seenChallenge.add(key || 'clean');
      if (cfg.phase === 'peak') seenPeak.add(key || 'clean');
    }
    expect(seenChallenge.has('tasting')).toBe(true);
    expect(seenChallenge.has('teapot+tasting')).toBe(true);
    expect(seenPeak.has('tasting')).toBe(true);
  });
});
