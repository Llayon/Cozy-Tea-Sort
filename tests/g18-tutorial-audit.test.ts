/**
 * G18 tutorial audit — one new concept, one first-exposure level, no
 * contradictory repeated banners, mobile-sized copy.
 */
import { describe, expect, it } from 'vitest';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import {
  TUTORIALS,
  tutorialById,
  tutorialForConfig,
} from '../src/game/ui/tutorials';

const EXPECTED: Record<string, number> = {
  teapot: 6,
  targets: 10,
  sink: 18,
  tasting: 26,
  lemon: 34,
  strainer: 42,
  honey: 50,
  lemonHoney: 58,
  frozen: 66,
  thermos: 74,
  cinnamon: 82,
  teaBloom: 90,
  blend: 98,
  servingOrder: 106,
  orderTasting: 154,
  sharedTray: 162,
  teaPair: 250,
};

const REPEAT_LEVELS = [7, 11, 19, 22, 27, 30, 35, 38, 43, 46, 51, 54, 59, 62, 70, 78, 86, 94, 102, 110, 234, 242, 330];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).length;
}

describe('G18 tutorial registry', () => {
  it('has exactly one first-exposure definition per shipped mechanic cue', () => {
    expect(TUTORIALS).toHaveLength(17);
    expect(new Set(TUTORIALS.map((t) => t.id)).size).toBe(17);
    expect(new Set(TUTORIALS.map((t) => t.bannerId)).size).toBe(17);
    expect(new Set(TUTORIALS.map((t) => t.concept)).size).toBe(17);
    for (const [id, level] of Object.entries(EXPECTED)) {
      const t = tutorialById(id as never);
      expect(t.level, `${id} first exposure`).toBe(level);
      const cfg = getLevelConfig(level);
      expect(t.matches(cfg), `${id} must match its production config at L${level}`).toBe(true);
      expect(tutorialForConfig(cfg)?.id, `L${level} tutorial`).toBe(id);
    }
  });

  it('appears exactly once, never on later repeat exposures', () => {
    const tutorialLevels = new Set(TUTORIALS.map((t) => t.level));
    // No level may select two tutorials (the API returns at most one).
    for (let level = 1; level <= 1600; level++) {
      const cfg = getLevelConfig(level);
      const t = tutorialForConfig(cfg);
      if (tutorialLevels.has(level)) {
        expect(t, `L${level} should select its intended tutorial`).not.toBeNull();
      } else if (t !== null) {
        throw new Error(`Unexpected tutorial at L${level}: ${t.id}`);
      }
    }
    for (const level of REPEAT_LEVELS) {
      expect(tutorialForConfig(getLevelConfig(level)), `L${level} repeat banner`).toBeNull();
    }
    // Composition levels keep exactly the one contextual hint.
    expect(tutorialForConfig(getLevelConfig(154))?.id).toBe('orderTasting');
    expect(tutorialForConfig(getLevelConfig(58))?.id).toBe('lemonHoney');
    expect(tutorialForConfig(getLevelConfig(162))?.id).toBe('sharedTray');
    expect(tutorialForConfig(getLevelConfig(242))).toBeNull();
    expect(tutorialForConfig(getLevelConfig(330))).toBeNull();
  });

  it('stays short, specific and free of internal technical vocabulary', () => {
    for (const t of TUTORIALS) {
      const words = wordCount(t.text);
      expect(words, `${t.id} word count`).toBeGreaterThanOrEqual(5);
      expect(words, `${t.id} word count`).toBeLessThanOrEqual(33);
      expect(t.text, `${t.id} technical copy`).not.toMatch(
        /\b(capacity|state|target|canonical|TeaId|PuzzleState|solver)\b/i,
      );
      expect(t.text.trim().endsWith('.'), `${t.id} should end with a calm sentence`).toBe(true);
    }
  });

  it('uses the established Russian vessel terminology consistently', () => {
    const lower = (id: Parameters<typeof tutorialById>[0]) => tutorialById(id).text.toLowerCase();
    expect(lower('teapot')).toContain('чайник');
    expect(lower('strainer')).toContain('ситечко');
    expect(lower('thermos')).toContain('термос');
    expect(lower('tasting')).toContain('пиала');
    expect(lower('teaPair')).toContain('пиалы');
    expect(lower('sharedTray')).toContain('подносе');
    expect(lower('targets')).toContain('чашки');
    // Tea Pair is emergent: copy must not imply a pre-chosen target color.
    const pair = tutorialById('teaPair').text.toLowerCase();
    expect(pair).toContain('какой именно');
    for (const tea of ['матча', 'каркаде', 'облепих', 'лаванд', 'шафран', 'гречиш']) {
      expect(pair, `pair copy must not preselect ${tea}`).not.toContain(tea);
    }
    // Shared tray copy names the group budget, not per-cup capacity.
    expect(tutorialById('sharedTray').text).toContain('всего 6 мест');
    // Order+Tasting explains only the still-active order rule.
    expect(tutorialById('orderTasting').text).toContain('Порядок подачи');
    expect(tutorialById('orderTasting').text).not.toContain('2 слоя');
  });
});
