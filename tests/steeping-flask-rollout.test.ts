/**
 * Gauntlet 20 Rollout V3 — explicit boundary, exact deck, recurrence and
 * G19 freeze through L557.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_DECK_V3,
  CHALLENGE_DECK_V3_LENGTH,
  ROLLOUT_V3_FIRST_CHALLENGE_LEVEL,
  V3_CHALLENGE_DECK_IDS,
  challengeMechanicPlanV3,
  getLevelConfig,
  mechanicPlanForLevel,
  type MechanicPlan,
} from '../src/utils/difficultyCurve';
import { semanticConfigHash } from '../scripts/dev/g18-snapshot-lib';
import { tutorialForConfig } from '../src/game/ui/tutorials';
import {
  mechanicCompatibility,
  validateMechanicCombination,
  validateSteepingFlaskCombination,
} from '../src/game/logic/mechanicCompatibility';

type PlanFlag = keyof MechanicPlan;
const FLAGS: readonly PlanFlag[] = [
  'teapot',
  'targets',
  'sink',
  'tasting',
  'lemon',
  'strainer',
  'honey',
  'frozen',
  'thermos',
  'cinnamon',
  'teaBloom',
  'blend',
  'servingOrder',
  'sharedTray',
  'teaPair',
  'steepingFlask',
];

function key(plan: MechanicPlan): string {
  const on = FLAGS.filter((flag) => plan[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}

const EXPECTED_V3_IDS = [
  'steepingFlask',
  'frozen',
  'sharedTray',
  'honey',
  'teaBloom',
  'tasting',
  'thermos',
  'lemon',
  'servingOrder',
  'sink',
  'targets',
  'teaPair',
  'strainer',
  'cinnamon',
  'teapotHoney',
  'lemonHoney',
  'teapotTasting',
  'teapotSink',
  'blend',
  'teapotLemon',
  'orderTasting',
  'teapotTargets',
  'teapotStrainer',
  'tasting',
  'lemon',
  'sink',
  'targets',
  'servingOrder',
] as const;

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const g18 = JSON.parse(
  readFileSync(`${REPO_ROOT}tests/fixtures/g18-rollout-snapshot.json`, 'utf8'),
) as { levels: Array<{ level: number; hash: string }> };
const g19 = JSON.parse(
  readFileSync(`${REPO_ROOT}tests/fixtures/g19-rollout-v2-snapshot.json`, 'utf8'),
) as { levels: Array<{ level: number; hash: string }> };
const g20 = JSON.parse(
  readFileSync(`${REPO_ROOT}tests/fixtures/g20-rollout-v3-snapshot.json`, 'utf8'),
) as {
  baseSha: string;
  boundary: { v3FirstChallengeLevel: number; deckLength: number };
  deck: string[];
  levels: Array<{ level: number; phase: string; plan: string; hash: string }>;
};

function hashAt(rows: Array<{ level: number; hash: string }>, level: number): string | undefined {
  return rows.find((row) => row.level === level)?.hash;
}

describe('G20 V3 boundary / G19 freeze', () => {
  it('freezes L1-330 against G18 and L331-557 against G19', () => {
    const diffs: number[] = [];
    for (let level = 1; level <= 330; level++) {
      if (semanticConfigHash(level) !== hashAt(g18.levels, level)) diffs.push(level);
    }
    for (let level = 331; level <= 557; level++) {
      if (semanticConfigHash(level) !== hashAt(g19.levels, level)) diffs.push(level);
    }
    expect(diffs, `freeze diffs: ${diffs.join(',')}`).toEqual([]);
  });

  it('intentional G20 snapshot 558-1600 is exact and readable', () => {
    expect(g20.baseSha).toBe('d9e582399a8685d71ef37b48ec8f742befbb4211');
    expect(g20.boundary).toEqual({ v3FirstChallengeLevel: 558, deckLength: 28 });
    expect(g20.deck).toEqual([...EXPECTED_V3_IDS]);
    expect(g20.levels).toHaveLength(1043);
    const diffs: string[] = [];
    for (const row of g20.levels) {
      const cfg = getLevelConfig(row.level);
      const actualHash = semanticConfigHash(row.level);
      const actualPlan = key(mechanicPlanForLevel(row.level));
      if (actualHash !== row.hash || cfg.phase !== row.phase || actualPlan !== row.plan) {
        diffs.push(
          `L${row.level}: expected ${row.phase}/${row.plan}/${row.hash}, got ${cfg.phase}/${actualPlan}/${actualHash}`,
        );
      }
    }
    expect(diffs, `G20 snapshot mismatches:\n${diffs.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('L555-557 keep peak/relax/warmup, L558 starts V3 challenge', () => {
    expect(getLevelConfig(555).phase).toBe('peak');
    expect(getLevelConfig(556).phase).toBe('relax');
    expect(getLevelConfig(557).phase).toBe('warmup');
    expect(getLevelConfig(558).phase).toBe('challenge');
    expect(getLevelConfig(558).phaseSubtitle).toBe('Заварочная колба • 6 сосудов');
    expect(mechanicPlanForLevel(558).steepingFlask).toBe(true);
    expect(mechanicPlanForLevel(558)).toEqual(CHALLENGE_DECK_V3[0]);
  });

  it('exact V3 deck of 28 slots', () => {
    expect(ROLLOUT_V3_FIRST_CHALLENGE_LEVEL).toBe(558);
    expect(V3_CHALLENGE_DECK_IDS).toEqual([...EXPECTED_V3_IDS]);
    expect(CHALLENGE_DECK_V3_LENGTH).toBe(28);
    expect(CHALLENGE_DECK_V3).toHaveLength(28);
    for (let i = 0; i < 28; i++) {
      const level = 558 + 4 * i;
      expect(challengeMechanicPlanV3(level), `L${level}`).toEqual(CHALLENGE_DECK_V3[i]);
    }
    expect(mechanicPlanForLevel(670)).toEqual(CHALLENGE_DECK_V3[0]);
    expect(mechanicPlanForLevel(562)).toEqual(CHALLENGE_DECK_V3[1]);
  });

  it('first V3 cycle matches the specified challenge mapping', () => {
    const expected: Record<number, string> = {
      558: 'steepingFlask',
      562: 'frozen',
      566: 'sharedTray',
      570: 'honey',
      574: 'teaBloom',
      578: 'tasting',
      582: 'thermos',
      586: 'lemon',
      590: 'servingOrder',
      594: 'sink',
      598: 'targets',
      602: 'teaPair',
      606: 'strainer',
      610: 'cinnamon',
      614: 'honey+teapot',
      618: 'honey+lemon',
      622: 'tasting+teapot',
      626: 'sink+teapot',
      630: 'blend',
      634: 'lemon+teapot',
      638: 'servingOrder+tasting',
      642: 'targets+teapot',
      646: 'strainer+teapot',
      650: 'tasting',
      654: 'lemon',
      658: 'sink',
      662: 'targets',
      666: 'servingOrder',
    };
    for (const [raw, expectedKey] of Object.entries(expected)) {
      const level = Number(raw);
      expect(key(mechanicPlanForLevel(level)), `L${level}`).toBe(expectedKey);
    }
  });

  it('10 complete V3 decks repeat exactly (280 slots / 1120 levels)', () => {
    for (let deck = 0; deck < 10; deck++) {
      for (let i = 0; i < 28; i++) {
        const level = 558 + 4 * (deck * 28 + i);
        expect(mechanicPlanForLevel(level), `deck ${deck} slot ${i} L${level}`).toEqual(
          CHALLENGE_DECK_V3[i],
        );
      }
    }
  });

  it('same level is deterministic regardless of caller (no seed/session input)', () => {
    for (const level of [558, 602, 630, 1000, 5000, 10000]) {
      const first = mechanicPlanForLevel(level);
      for (let i = 0; i < 3; i++) expect(mechanicPlanForLevel(level)).toEqual(first);
    }
  });
});

describe('G20 V3 recurrence', () => {
  const challengeByPlan = new Map<string, number[]>();
  for (let level = 558; level <= 10000; level++) {
    if (getLevelConfig(level).phase !== 'challenge') continue;
    const k = key(mechanicPlanForLevel(level));
    const list = challengeByPlan.get(k) ?? [];
    list.push(level);
    challengeByPlan.set(k, list);
  }

  it('Flask / Shared Tray / Tea Pair / Blend / Order+Tasting exact V3 starts', () => {
    expect(challengeByPlan.get('steepingFlask')?.slice(0, 4)).toEqual([558, 670, 782, 894]);
    expect(challengeByPlan.get('sharedTray')?.slice(0, 4)).toEqual([566, 678, 790, 902]);
    expect(challengeByPlan.get('teaPair')?.slice(0, 4)).toEqual([602, 714, 826, 938]);
    expect(challengeByPlan.get('blend')?.slice(0, 4)).toEqual([630, 742, 854, 966]);
    expect(challengeByPlan.get('servingOrder+tasting')?.slice(0, 4)).toEqual([638, 750, 862, 974]);
  });

  it('every once-per-deck V3 mechanic has steady-state max gap 112', () => {
    // Once-per-deck advanced/flask/honey plans. Familiar Tasting/Lemon/
    // Sink/Targets/ServingOrder repeat twice and are checked below instead.
    const keys = [
      'steepingFlask',
      'frozen',
      'sharedTray',
      'honey',
      'teaBloom',
      'thermos',
      'teaPair',
      'strainer',
      'cinnamon',
      'honey+teapot',
      'honey+lemon',
      'tasting+teapot',
      'sink+teapot',
      'blend',
      'lemon+teapot',
      'servingOrder+tasting',
      'targets+teapot',
      'strainer+teapot',
    ];
    for (const k of keys) {
      const levels = challengeByPlan.get(k) as number[];
      expect(levels, k).toBeDefined();
      const gaps = levels.slice(1).map((level, i) => level - (levels[i] as number));
      expect(Math.max(...gaps), `${k} steady max`).toBe(112);
    }
  });

  it('familiar repeats keep the two-per-deck alternating gaps within 112', () => {
    for (const k of ['tasting', 'lemon', 'sink', 'targets', 'servingOrder']) {
      const levels = challengeByPlan.get(k) as number[];
      const gaps = levels.slice(1).map((level, i) => level - (levels[i] as number));
      expect(Math.max(...gaps), `${k} max`).toBeLessThanOrEqual(112);
    }
  });
});

describe('G20 V3 plan-space safety', () => {
  it('challenge plans 558-10000 are exactly the V3 deck; no unsupported plan', () => {
    const allowed = new Set(CHALLENGE_DECK_V3.map(key));
    expect(allowed.size).toBe(23); // 22 existing + flask
    for (let level = 558; level <= 10000; level++) {
      if (getLevelConfig(level).phase !== 'challenge') continue;
      expect(allowed.has(key(mechanicPlanForLevel(level))), `L${level}`).toBe(true);
    }
  });

  it('flask never leaks into warmup/relax/peak through L10000', () => {
    for (let level = 1; level <= 10000; level++) {
      const phase = getLevelConfig(level).phase;
      if (phase === 'challenge') continue;
      expect(mechanicPlanForLevel(level).steepingFlask ?? false, `L${level} ${phase}`).toBe(false);
    }
  });

  it('V3 challenge compositions remain the shipped set', () => {
    const allowedCombos = new Set([
      'honey+lemon',
      'honey+teapot',
      'strainer+teapot',
      'lemon+teapot',
      'tasting+teapot',
      'sink+teapot',
      'targets+teapot',
      'servingOrder+tasting',
    ]);
    for (const plan of CHALLENGE_DECK_V3) {
      const on = FLAGS.filter((flag) => plan[flag]).sort();
      if (on.length > 1) expect(allowedCombos.has(on.join('+')), on.join('+')).toBe(true);
    }
    expect(mechanicCompatibility('blend', 'steepingFlask')).toMatchObject({
      sameLevel: 'forbid',
      sameCup: 'forbid',
    });
    for (const other of ['sharedTray', 'teaPair', 'servingOrder', 'tasting', 'mystery', 'honey', 'strainer'] as const) {
      expect(mechanicCompatibility('steepingFlask', other)).toMatchObject({
        sameLevel: 'research',
        sameCup: 'forbid',
      });
    }
    expect(
      validateSteepingFlaskCombination({
        steepingFlask: true,
        servingOrder: false,
        mystery: false,
        tastingCount: 0,
        honey: false,
        strainer: false,
        blend: false,
        sharedTray: false,
        teaPair: false,
      }),
    ).toEqual([]);
    for (const plan of CHALLENGE_DECK_V3) {
      expect(
        validateMechanicCombination({
          servingOrder: plan.servingOrder,
          mystery: false,
          tastingCount: plan.tasting ? 1 : 0,
          honey: plan.honey,
          strainer: plan.strainer,
          blend: plan.blend,
        }),
      ).toEqual([]);
    }
  });

  it('tutorial appears once at L558, never on later Flask recurrence', () => {
    expect(tutorialForConfig(getLevelConfig(558))?.id).toBe('steepingFlask');
    for (const level of [670, 782, 894, 1006]) {
      expect(tutorialForConfig(getLevelConfig(level)), `L${level}`).toBeNull();
    }
    expect(tutorialForConfig(getLevelConfig(162))?.id).toBe('sharedTray');
    expect(tutorialForConfig(getLevelConfig(250))?.id).toBe('teaPair');
  });
});
