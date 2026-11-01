/**
 * G19 Rollout V2 recurrence invariants, frozen through L557 by Gauntlet 20.
 *
 * Structural plan enumeration only (no generation). G20 Rollout V3 starts at
 * L558 and is covered by tests/steeping-flask-rollout.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  ROLLOUT_V2_FIRST_CHALLENGE_LEVEL,
  V2_CHALLENGE_DECK_IDS,
  getLevelConfig,
  mechanicPlanForLevel,
  type MechanicPlan,
} from '../src/utils/difficultyCurve';

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
];

function planKey(value: MechanicPlan): string {
  const on = FLAGS.filter((flag) => value[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}

interface Exposure {
  challengeLevels: number[];
  firstV2: number | null;
  steadyGaps: number[];
  steadyMax: number | null;
  steadyMedian: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

const V2_END = 557;
const byPlan = new Map<string, Exposure>();
for (let level = 1; level <= V2_END; level++) {
  const key = planKey(mechanicPlanForLevel(level));
  const phase = getLevelConfig(level).phase;
  const exposure = byPlan.get(key) ?? {
    challengeLevels: [],
    firstV2: null,
    steadyGaps: [],
    steadyMax: null,
    steadyMedian: null,
  };
  if (phase === 'challenge') exposure.challengeLevels.push(level);
  byPlan.set(key, exposure);
}

for (const exposure of byPlan.values()) {
  const v2 = exposure.challengeLevels.filter((level) => level >= ROLLOUT_V2_FIRST_CHALLENGE_LEVEL);
  exposure.firstV2 = v2[0] ?? null;
  exposure.steadyGaps = v2.slice(1).map((level, i) => level - (v2[i] as number));
  exposure.steadyMax = exposure.steadyGaps.length > 0 ? Math.max(...exposure.steadyGaps) : null;
  exposure.steadyMedian = median(exposure.steadyGaps);
}

function exposureFor(flags: readonly PlanFlag[]): Exposure {
  const found = byPlan.get(
    planKey(Object.fromEntries(FLAGS.map((flag) => [flag, flags.includes(flag)])) as unknown as MechanicPlan),
  );
  if (!found) throw new Error(`no exposures for ${flags.join('+') || 'clean'}`);
  return found;
}

const ONCE_PER_DECK = [
  'frozen',
  'sharedTray',
  'teaBloom',
  'thermos',
  'honey+lemon',
  'strainer',
  'cinnamon',
  'blend',
  'servingOrder+tasting',
  'teaPair',
] as const;

const FAMILIAR_REPEATS = ['honey', 'tasting', 'lemon', 'servingOrder', 'sink', 'targets'] as const;

describe('G19 recurrence frozen through L557', () => {
  it('first V2 challenge exposures match the fixed deck', () => {
    const expected: Record<string, number> = {
      frozen: 334,
      sharedTray: 338,
      honey: 342,
      teaBloom: 346,
      tasting: 350,
      thermos: 354,
      lemon: 358,
      servingOrder: 362,
      sink: 366,
      targets: 370,
      teaPair: 374,
      strainer: 378,
      cinnamon: 382,
      'honey+teapot': 386,
      'honey+lemon': 390,
      'tasting+teapot': 394,
      'sink+teapot': 398,
      blend: 402,
      'lemon+teapot': 406,
      'servingOrder+tasting': 410,
      'targets+teapot': 414,
      'strainer+teapot': 418,
    };
    for (const [key, level] of Object.entries(expected)) {
      const exposure = byPlan.get(key);
      expect(exposure, `missing plan ${key}`).toBeDefined();
      expect(exposure?.firstV2, `${key} first V2`).toBe(level);
    }
  });

  it('Shared Tray V2 cadence 162 -> 242 -> 338 -> 450', () => {
    const exposure = exposureFor(['sharedTray']);
    expect(exposure.challengeLevels).toEqual([162, 242, 338, 450]);
    expect(exposure.steadyMax).toBe(112);
    expect(exposure.steadyMedian).toBe(112);
  });

  it('Tea Pair V2 cadence 250 -> 330 -> 374 -> 486', () => {
    const exposure = exposureFor(['teaPair']);
    expect(exposure.challengeLevels).toEqual([250, 330, 374, 486]);
    expect(exposure.steadyMax).toBe(112);
    expect(exposure.steadyMedian).toBe(112);
  });

  it('every once-per-deck advanced mechanic has V2 steady max gap <=112', () => {
    for (const key of ONCE_PER_DECK) {
      const exposure = byPlan.get(key);
      expect(exposure, `missing ${key}`).toBeDefined();
      expect(exposure?.firstV2, `${key} first V2`).not.toBeNull();
      expect(exposure?.steadyMax, `${key} steady max gap`).toBeLessThanOrEqual(112);
      expect(exposure?.steadyMax, `${key} should actually recur`).toBe(112);
      expect(exposure?.steadyMedian, `${key} steady median`).toBe(112);
    }
  });

  it('Blend stays exactly once per 28-slot V2 deck', () => {
    const exposure = exposureFor(['blend']);
    expect(exposure.steadyMax).toBe(112);
    expect(exposure.challengeLevels.filter((level) => level >= 334)).toEqual([402, 514]);
    expect(V2_CHALLENGE_DECK_IDS.filter((id) => id === 'blend')).toHaveLength(1);
  });

  it('repeated familiar mechanics keep their two-per-deck alternating cadence', () => {
    const expectedMax: Record<string, number> = {
      honey: 80,
      tasting: 76,
      lemon: 72,
      servingOrder: 80,
      sink: 68,
      targets: 68,
    };
    for (const key of FAMILIAR_REPEATS) {
      const exposure = byPlan.get(key);
      expect(exposure, `missing ${key}`).toBeDefined();
      expect(exposure?.steadyMax, `${key} steady max`).toBe(expectedMax[key]);
      expect(exposure?.steadyMax, `${key} bounded`).toBeLessThanOrEqual(112);
      expect(V2_CHALLENGE_DECK_IDS.filter((id) => id === key).length, `${key} deck count`).toBe(2);
    }
  });

  it('boundary debt is reported separately from steady-state cadence', () => {
    const frozen = exposureFor(['frozen']);
    const lastV1 = [...frozen.challengeLevels].reverse().find((level) => level <= 330) as number;
    expect(lastV1).toBe(170);
    expect((frozen.firstV2 as number) - lastV1).toBe(164);
    expect(frozen.steadyMax).toBe(112);
    const cinnamon = exposureFor(['cinnamon']);
    expect(cinnamon.steadyMax).toBe(112);
  });
});

describe('G19 plan space frozen through L557', () => {
  it('challenge plans 331-557 are exactly the V2 deck', () => {
    const allowed = new Set(
      V2_CHALLENGE_DECK_IDS.map((id) =>
        planKey(mechanicPlanForLevel(334 + 4 * V2_CHALLENGE_DECK_IDS.indexOf(id))),
      ),
    );
    expect(allowed.size).toBe(22);
    for (let level = 331; level <= V2_END; level++) {
      if (getLevelConfig(level).phase !== 'challenge') continue;
      expect(allowed.has(planKey(mechanicPlanForLevel(level))), `L${level}`).toBe(true);
    }
  });

  it('warmup and relax remain clean through L557', () => {
    for (let level = 1; level <= V2_END; level++) {
      const cfg = getLevelConfig(level);
      if (cfg.phase !== 'warmup' && cfg.phase !== 'relax') continue;
      expect(mechanicPlanForLevel(level)).toEqual({
        teapot: false,
        targets: false,
        sink: false,
        tasting: false,
        lemon: false,
        strainer: false,
        honey: false,
        frozen: false,
        thermos: false,
        cinnamon: false,
        teaBloom: false,
        blend: false,
        servingOrder: false,
        sharedTray: false,
        teaPair: false,
      });
    }
  });

  it('no identical V2 plan is adjacent in the product deck', () => {
    for (let i = 0; i < V2_CHALLENGE_DECK_IDS.length; i++) {
      expect(V2_CHALLENGE_DECK_IDS[i]).not.toBe(
        V2_CHALLENGE_DECK_IDS[(i + 1) % V2_CHALLENGE_DECK_IDS.length],
      );
    }
  });

  it('high levels keep valid deterministic configs (999, 1000, 1600, 9999, 10000)', () => {
    for (const level of [999, 1000, 1600, 9999, 10000]) {
      const first = getLevelConfig(level);
      const second = getLevelConfig(level);
      expect(first).toEqual(second);
      expect(first.levelNumber).toBe(level);
      expect(first.totalCups).toBe(first.numColors + first.emptyCups);
      expect(first.phase).toMatch(/^(warmup|challenge|peak|relax)$/);
    }
  });
});
