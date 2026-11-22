/**
 * Choice Brew progression tests (V5 rollout freeze + exposure pinning).
 */
import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_DECK_V4,
  CHALLENGE_DECK_V5,
  CHALLENGE_DECK_V5_LENGTH,
  ROLLOUT_V5_FIRST_CHALLENGE_LEVEL,
  challengeMechanicPlanV4,
  challengeMechanicPlanV5,
  getLevelConfig,
  mechanicPlanForLevel,
  type MechanicPlan,
} from '../src/utils/difficultyCurve';
import { generateRequestForLevelConfig } from '../src/game/logic/productionRequest';
import { tutorialForConfig } from '../src/game/ui/tutorials';

function key(plan: MechanicPlan): string {
  return Object.entries(plan)
    .filter(([, v]) => v === true)
    .map(([k]) => k)
    .sort()
    .join('+');
}

describe('V5 rollout freeze', () => {
  it('exposes the V5 boundary constants', () => {
    expect(ROLLOUT_V5_FIRST_CHALLENGE_LEVEL).toBe(1902);
    expect(CHALLENGE_DECK_V5_LENGTH).toBe(28);
    expect(CHALLENGE_DECK_V5).toHaveLength(28);
  });

  it('V5 keeps 28 slots: newcomer only at slot 24, flask at 0, winner at 23', () => {
    expect(key(CHALLENGE_DECK_V5[24] as never)).toBe('choiceBrew');
    expect(key(CHALLENGE_DECK_V5[23] as never)).toBe('sharedTray+steepingFlask');
    expect(key(CHALLENGE_DECK_V5[0] as never)).toBe('steepingFlask');
    for (let i = 0; i < 28; i++) {
      if (i === 24) continue;
      expect(key(CHALLENGE_DECK_V5[i] as never), `slot ${i}`).toBe(
        key(CHALLENGE_DECK_V4[i] as never),
      );
    }
  });

  it('levels below V5 stay on their frozen policies', () => {
    expect(mechanicPlanForLevel(1901).choiceBrew).not.toBe(true);
    expect(mechanicPlanForLevel(1898)).toEqual(challengeMechanicPlanV4(1898));
    expect(getLevelConfig(1901).hasChoiceBrew).not.toBe(true);
    expect(getLevelConfig(1600).hasChoiceBrew).not.toBe(true);
    expect(getLevelConfig(874).hasChoiceBrew).not.toBe(true);
  });

  it('first V5 challenge level keeps the flask recurrence (slot 0)', () => {
    expect(mechanicPlanForLevel(1902)).toEqual({ ...(CHALLENGE_DECK_V5[0] as object) });
    expect(key(mechanicPlanForLevel(1902))).toBe('steepingFlask');
  });

  it('first Choice Brew exposure is L1998 (slot 24), still standalone', () => {
    expect(mechanicPlanForLevel(1998)).toEqual({ ...(CHALLENGE_DECK_V5[24] as object) });
    expect(key(mechanicPlanForLevel(1998))).toBe('choiceBrew');
    const cfg = getLevelConfig(1998);
    expect(cfg.phase).toBe('challenge');
    expect(cfg.hasChoiceBrew).toBe(true);
    expect(cfg.numColors).toBe(4);
    expect(cfg.emptyCups).toBe(2);
    expect(cfg.totalCups).toBe(6);
    expect(cfg.hasMysteryLayer).toBe(false);
    expect(cfg.phaseSubtitle).toBe('Выбор заварки • 2 подходящих чая');
    expect(cfg.colors).toEqual(['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong']);
  });

  it('second exposure is the next deck (L2110), still standalone', () => {
    expect(key(mechanicPlanForLevel(2110))).toBe('choiceBrew');
    expect(getLevelConfig(2110).hasChoiceBrew).toBe(true);
  });

  it('flask keeps slot 0 (L1902 recurrence); winner grid preserved', () => {
    expect(key(mechanicPlanForLevel(1902))).toBe('steepingFlask');
    expect(key(mechanicPlanForLevel(1994))).toBe('sharedTray+steepingFlask');
    expect(key(mechanicPlanForLevel(2106))).toBe('sharedTray+steepingFlask');
    for (const level of [1994, 2106, 2218, 5002 - ((5002 - 874) % 112)]) {
      if ((level - 874) % 112 === 0 && level >= 1902) {
        expect(key(mechanicPlanForLevel(level)), `L${level}`).toBe('sharedTray+steepingFlask');
      }
    }
  });

  it('combo levels remain exactly the 874+112k grid through L10000', () => {
    for (let level = 1902; level <= 10000; level++) {
      if ((level - 1) % 4 !== 1) continue;
      const plan = mechanicPlanForLevel(level);
      const isCombo = plan.sharedTray === true && (plan as { steepingFlask?: boolean }).steepingFlask === true;
      if ((level - 874) % 112 === 0) {
        expect(isCombo, `L${level} must stay combo`).toBe(true);
      } else if (isCombo) {
        throw new Error(`unexpected combo at L${level}`);
      }
    }
  });

  it('challengeMechanicPlanV5 validates its domain', () => {
    expect(() => challengeMechanicPlanV5(1901)).toThrow();
    expect(() => challengeMechanicPlanV5(1903)).toThrow();
    expect(challengeMechanicPlanV5(1902)).toEqual(CHALLENGE_DECK_V5[0]);
  });

  it('tutorial fires once at L1998, never at L2110', () => {
    expect(tutorialForConfig(getLevelConfig(1998))?.id).toBe('choiceBrew');
    expect(tutorialForConfig(getLevelConfig(2110))).toBeNull();
  });

  it('production request carries the choice brew count', () => {
    expect(generateRequestForLevelConfig(getLevelConfig(1998)).choiceBrewCount).toBe(1);
    expect(generateRequestForLevelConfig(getLevelConfig(1901)).choiceBrewCount ?? 0).toBe(0);
  });

  it('level 10000 stays a valid deterministic config', () => {
    const cfg = getLevelConfig(10000);
    expect(getLevelConfig(10000)).toEqual(cfg);
    expect(cfg.totalCups).toBe(cfg.numColors + cfg.emptyCups);
  });
});
