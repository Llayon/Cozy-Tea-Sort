/**
 * Gauntlet 3 §34–37, §71 — rollout pins and special-mechanic invariants.
 *
 * Levels 1–16 stay behaviorally identical; 17–24 introduce the guest cup
 * exactly as specified; 1–200 obey the max-2-specials / no-sink+targets /
 * warmup+relax-clean invariants.
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig, mechanicPlanForLevel } from '../src/utils/difficultyCurve';

describe('rollout 1–16 frozen (Gauntlets 0–2)', () => {
  it('pins teapot/targets/mystery/phase/cup counts exactly', () => {
    const expectations: Array<[number, boolean, boolean, boolean, string, number]> = [
      // lvl, teapot, mystery, targets?, phase, totalCups
      [1, false, false, false, 'warmup', 5],
      [2, false, false, false, 'challenge', 6],
      [3, false, true, false, 'peak', 7],
      [4, false, false, false, 'relax', 5],
      [5, false, false, false, 'warmup', 5],
      [6, true, false, false, 'challenge', 6],
      [7, true, true, false, 'peak', 7],
      [8, false, false, false, 'relax', 5],
      [9, false, false, false, 'warmup', 5],
      [10, false, false, true, 'challenge', 6],
      [11, false, true, true, 'peak', 7],
      [12, false, false, false, 'relax', 5],
      [13, false, false, false, 'warmup', 5],
      [14, true, false, true, 'challenge', 6],
      [15, true, true, false, 'peak', 7],
      [16, false, false, false, 'relax', 5],
    ];
    for (const [lvl, teapot, mystery, targets, phase, total] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.targetTeaIds.length > 0).toBe(targets);
      expect(cfg.hasSinkGuestCup).toBe(false);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
    }
  });
});

describe('rollout 17–24 (Gauntlet 3 guest-cup introduction)', () => {
  it('pins the exact specified mechanic mix + subtitles', () => {
    const expectations: Array<[number, boolean, boolean, boolean, string, number, string]> = [
      // lvl, teapot, sink, mystery, phase, totalCups, subtitle fragment
      [17, false, false, false, 'warmup', 5, 'медитативный'],
      [18, false, true, false, 'challenge', 6, 'Чашка гостя'],
      [19, false, true, true, 'peak', 7, 'таинственный настой'],
      [20, false, false, false, 'relax', 5, 'Выдох'],
      [21, false, false, false, 'warmup', 5, 'медитативный'],
      [22, true, true, false, 'challenge', 6, 'Чайник и чашка гостя'],
      [23, false, false, true, 'peak', 7, 'Сервировка'],
      [24, false, false, false, 'relax', 5, 'Выдох'],
    ];
    for (const [lvl, teapot, sink, mystery, phase, total, sub] of expectations) {
      const cfg = getLevelConfig(lvl);
      expect(cfg.hasSourceOnlyTeapot).toBe(teapot);
      expect(cfg.hasSinkGuestCup).toBe(sink);
      expect(cfg.hasMysteryLayer).toBe(mystery);
      expect(cfg.phase).toBe(phase);
      expect(cfg.totalCups).toBe(total);
      expect(cfg.phaseSubtitle).toContain(sub);
      if (lvl === 23) expect(cfg.targetTeaIds.length).toBe(2);
      else if (sink || lvl === 17 || lvl === 20 || lvl === 21 || lvl === 24) {
        expect(cfg.targetTeaIds).toEqual([]);
      }
    }
    expect(mechanicPlanForLevel(18)).toEqual({ teapot: false, targets: false, sink: true, tasting: false });
    expect(mechanicPlanForLevel(22)).toEqual({ teapot: true, targets: false, sink: true, tasting: false });
  });

  it('level 18/19/22 subtitles match the specified product copy', () => {
    expect(getLevelConfig(18).phaseSubtitle).toBe('Чашка гостя • 6 сосудов');
    expect(getLevelConfig(19).phaseSubtitle).toBe('Чашка гостя и таинственный настой • 7 сосудов');
    expect(getLevelConfig(22).phaseSubtitle).toBe('Чайник и чашка гостя • 6 сосудов');
  });
});

describe('rollout invariants 1–200', () => {
  it('warmup/relax clean; no sink+targets; max 2 specials; <=7 vessels', () => {
    for (let lvl = 1; lvl <= 200; lvl++) {
      const cfg = getLevelConfig(lvl);
      const specials = [
        cfg.hasSourceOnlyTeapot,
        cfg.hasSinkGuestCup,
        cfg.targetTeaIds.length > 0,
        cfg.hasMysteryLayer,
      ].filter(Boolean).length;
      expect(specials).toBeLessThanOrEqual(2);
      // Never combine sink + targets.
      expect(cfg.hasSinkGuestCup && cfg.targetTeaIds.length > 0).toBe(false);
      // Never triple-special (covered by max-2, asserted explicitly).
      const triple =
        [cfg.hasSourceOnlyTeapot, cfg.hasSinkGuestCup, cfg.targetTeaIds.length > 0].filter(Boolean)
          .length +
        (cfg.hasMysteryLayer ? 1 : 0);
      expect(triple).toBeLessThanOrEqual(2);
      expect(cfg.totalCups).toBeLessThanOrEqual(7);
      if (cfg.phase === 'warmup' || cfg.phase === 'relax') {
        expect(cfg.hasSourceOnlyTeapot).toBe(false);
        expect(cfg.hasSinkGuestCup).toBe(false);
        expect(cfg.targetTeaIds).toEqual([]);
        expect(cfg.hasMysteryLayer).toBe(false);
      }
    }
  });

  it('later-cycle rotation uses sink without targets', () => {
    // Challenge rotation must include all four combos over a cycle window.
    const seen = new Set<string>();
    for (let lvl = 25; lvl <= 60; lvl++) {
      const cfg = getLevelConfig(lvl);
      if (cfg.phase !== 'challenge') continue;
      seen.add(
        `${cfg.hasSinkGuestCup ? 'sink' : ''}${cfg.hasSourceOnlyTeapot ? '+teapot' : ''}${cfg.targetTeaIds.length > 0 ? '+targets' : ''}` ||
          'clean',
      );
    }
    expect(seen.has('sink')).toBe(true);
    expect(seen.has('+teapot+targets') || seen.has('teapot+targets')).toBe(true);
  });
});
