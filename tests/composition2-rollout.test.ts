/** G21 Rollout V4 — G20 freeze through L873, V4 from L782, combo at L874. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_DECK_V3,
  CHALLENGE_DECK_V4,
  CHALLENGE_DECK_V4_LENGTH,
  ROLLOUT_V4_FIRST_CHALLENGE_LEVEL,
  V4_WINNER_PLAN,
  challengeMechanicPlanV4,
  getLevelConfig,
  mechanicPlanForLevel,
  type MechanicPlan,
} from '../src/utils/difficultyCurve';
import { semanticConfigHash } from '../scripts/dev/g18-snapshot-lib';
import { tutorialForConfig } from '../src/game/ui/tutorials';

const FLAGS: readonly (keyof MechanicPlan)[] = [
  'teapot','targets','sink','tasting','lemon','strainer','honey','frozen','thermos',
  'cinnamon','teaBloom','blend','servingOrder','sharedTray','teaPair','steepingFlask',
];
function key(plan: MechanicPlan): string {
  const on = FLAGS.filter((flag) => plan[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const g18 = JSON.parse(readFileSync(`${REPO_ROOT}tests/fixtures/g18-rollout-snapshot.json`, 'utf8')) as {
  levels: Array<{ level: number; hash: string }>;
};
const g19 = JSON.parse(readFileSync(`${REPO_ROOT}tests/fixtures/g19-rollout-v2-snapshot.json`, 'utf8')) as {
  levels: Array<{ level: number; hash: string }>;
};
const g20 = JSON.parse(readFileSync(`${REPO_ROOT}tests/fixtures/g20-rollout-v3-snapshot.json`, 'utf8')) as {
  levels: Array<{ level: number; hash: string }>;
};
const g21 = JSON.parse(readFileSync(`${REPO_ROOT}tests/fixtures/g21-rollout-v4-snapshot.json`, 'utf8')) as {
  baseSha: string;
  boundary: { v4FirstChallengeLevel: number; firstComboLevel: number; deckLength: number; winner: string };
  levels: Array<{ level: number; phase: string; plan: string; hash: string }>;
};
function hashAt(rows: Array<{ level: number; hash: string }>, level: number): string | undefined {
  return rows.find((row) => row.level === level)?.hash;
}

describe('G21 V4 boundary and freeze', () => {
  it('freezes L1-330/G18, L331-557/G19, L558-873/G20', () => {
    const diffs: number[] = [];
    for (let level = 1; level <= 330; level++) {
      if (semanticConfigHash(level) !== hashAt(g18.levels, level)) diffs.push(level);
    }
    for (let level = 331; level <= 557; level++) {
      if (semanticConfigHash(level) !== hashAt(g19.levels, level)) diffs.push(level);
    }
    for (let level = 558; level <= 873; level++) {
      if (semanticConfigHash(level) !== hashAt(g20.levels, level)) diffs.push(level);
    }
    expect(diffs, `freeze diffs: ${diffs.join(',')}`).toEqual([]);
  });

  it('L779 peak, L780 relax, L781 warmup, L782 V4 challenge', () => {
    expect(getLevelConfig(779).phase).toBe('peak');
    expect(getLevelConfig(780).phase).toBe('relax');
    expect(getLevelConfig(781).phase).toBe('warmup');
    expect(getLevelConfig(782).phase).toBe('challenge');
    expect(mechanicPlanForLevel(782)).toEqual(CHALLENGE_DECK_V3[0]);
    expect(mechanicPlanForLevel(874)).toEqual(V4_WINNER_PLAN);
  });

  it('V4 keeps 28 slots, exact V3 slots 0-22 and 24-27, combo only slot 23', () => {
    expect(ROLLOUT_V4_FIRST_CHALLENGE_LEVEL).toBe(782);
    expect(CHALLENGE_DECK_V4_LENGTH).toBe(28);
    expect(CHALLENGE_DECK_V4).toHaveLength(28);
    for (let i = 0; i < 28; i++) {
      const level = 782 + 4 * i;
      expect(challengeMechanicPlanV4(level), `L${level}`).toEqual(CHALLENGE_DECK_V4[i]);
      if (i !== 23) {
        expect(key(CHALLENGE_DECK_V4[i] as MechanicPlan), `slot ${i}`).toBe(
          key(CHALLENGE_DECK_V3[i] as MechanicPlan),
        );
      }
    }
    expect(key(CHALLENGE_DECK_V4[23] as MechanicPlan)).toBe('sharedTray+steepingFlask');
    expect(CHALLENGE_DECK_V4[24]).toEqual(CHALLENGE_DECK_V3[24]);
    expect(CHALLENGE_DECK_V4[25]).toEqual(CHALLENGE_DECK_V3[25]);
    expect(CHALLENGE_DECK_V4[26]).toEqual(CHALLENGE_DECK_V3[26]);
    expect(CHALLENGE_DECK_V4[27]).toEqual(CHALLENGE_DECK_V3[27]);
  });

  it('first intentional diff is L874; combo cadence 874, 986, ...', () => {
    expect(key(mechanicPlanForLevel(870))).toBe(key(CHALLENGE_DECK_V4[22] as MechanicPlan));
    expect(key(mechanicPlanForLevel(874))).toBe('sharedTray+steepingFlask');
    expect(key(mechanicPlanForLevel(986))).toBe('sharedTray+steepingFlask');
    expect(mechanicPlanForLevel(986)).toEqual(V4_WINNER_PLAN);
    expect(874 - 782).toBe(4 * 23);
    expect(986 - 874).toBe(112);
  });

  it('10 complete V4 decks repeat exactly (280 slots)', () => {
    for (let deck = 0; deck < 10; deck++) {
      for (let i = 0; i < 28; i++) {
        const level = 782 + 4 * (deck * 28 + i);
        expect(mechanicPlanForLevel(level), `deck ${deck} slot ${i} L${level}`).toEqual(
          CHALLENGE_DECK_V4[i],
        );
      }
    }
  });

  it('G21 snapshot 874-1600 is exact and readable', () => {
    expect(g21.baseSha).toBe('2288260a5ec9e7053c678229bc1f567fe73588fc');
    expect(g21.boundary).toEqual({
      v4FirstChallengeLevel: 782,
      firstComboLevel: 874,
      deckLength: 28,
      winner: 'sharedTray+steepingFlask',
    });
    expect(g21.levels).toHaveLength(727);
    const diffs: string[] = [];
    for (const row of g21.levels) {
      const actualHash = semanticConfigHash(row.level);
      const actualPlan = key(mechanicPlanForLevel(row.level));
      const phase = getLevelConfig(row.level).phase;
      if (actualHash !== row.hash || actualPlan !== row.plan || phase !== row.phase) {
        diffs.push(`L${row.level}: expected ${row.phase}/${row.plan}, got ${phase}/${actualPlan}`);
      }
    }
    expect(diffs, diffs.slice(0, 20).join('\n')).toEqual([]);
  });

  it('winner is challenge-only and impossible outside slot 23', () => {
    for (let level = 1; level <= 10000; level++) {
      const plan = mechanicPlanForLevel(level);
      const isCombo = plan.sharedTray === true && plan.steepingFlask === true;
      if (!isCombo) continue;
      expect(getLevelConfig(level).phase, `L${level}`).toBe('challenge');
      expect((level - 874) % 112, `L${level}`).toBe(0);
    }
  });

  it('combo tutorial once at L874, never at L986', () => {
    expect(tutorialForConfig(getLevelConfig(874))?.id).toBe('steepingFlaskSharedTray');
    expect(tutorialForConfig(getLevelConfig(986))).toBeNull();
    expect(getLevelConfig(874).phaseSubtitle).toBe('Колба + поднос • 6 сосудов');
  });
});
