/**
 * G19 Rollout V2 — explicit boundary, exact 28-slot deck, deterministic
 * recurrence and non-challenge policy freeze.
 *
 * This test owns WHICH existing challenge plan appears at each long-run
 * level. It never redefines rules, compatibility, generation or solver
 * semantics; those remain in their established sources.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { semanticConfigHash } from '../scripts/dev/g18-snapshot-lib';
import {
  CHALLENGE_DECK_V2,
  CHALLENGE_DECK_V2_LENGTH,
  ROLLOUT_V1_MAX_LEVEL,
  ROLLOUT_V2_FIRST_CHALLENGE_LEVEL,
  V2_CHALLENGE_DECK_IDS,
  challengeMechanicPlanV1,
  challengeMechanicPlanV2,
  getLevelConfig,
  mechanicPlanForLevel,
  type MechanicPlan,
} from '../src/utils/difficultyCurve';
import {
  mechanicCompatibility,
  validateMechanicCombination,
  validateSharedTrayCombination,
  validateTeaPairCombination,
} from '../src/game/logic/mechanicCompatibility';
import { tutorialForConfig } from '../src/game/ui/tutorials';

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

function plan(flags: readonly PlanFlag[] = []): MechanicPlan {
  const out = Object.fromEntries(FLAGS.map((flag) => [flag, false])) as unknown as MechanicPlan;
  for (const flag of flags) out[flag] = true;
  return out;
}

function key(value: MechanicPlan): string {
  const on = FLAGS.filter((flag) => value[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}

/**
 * Exact product order (G19 §23). Hardcoded independently of the
 * implementation so a silent deck edit cannot pass by agreeing with itself.
 */
const EXPECTED_DECK: ReadonlyArray<{ id: string; flags: readonly PlanFlag[] }> = [
  { id: 'frozen', flags: ['frozen'] },
  { id: 'sharedTray', flags: ['sharedTray'] },
  { id: 'honey', flags: ['honey'] },
  { id: 'teaBloom', flags: ['teaBloom'] },
  { id: 'tasting', flags: ['tasting'] },
  { id: 'thermos', flags: ['thermos'] },
  { id: 'lemon', flags: ['lemon'] },
  { id: 'servingOrder', flags: ['servingOrder'] },
  { id: 'sink', flags: ['sink'] },
  { id: 'targets', flags: ['targets'] },
  { id: 'teaPair', flags: ['teaPair'] },
  { id: 'strainer', flags: ['strainer'] },
  { id: 'cinnamon', flags: ['cinnamon'] },
  { id: 'teapotHoney', flags: ['teapot', 'honey'] },
  { id: 'lemonHoney', flags: ['lemon', 'honey'] },
  { id: 'teapotTasting', flags: ['teapot', 'tasting'] },
  { id: 'teapotSink', flags: ['teapot', 'sink'] },
  { id: 'blend', flags: ['blend'] },
  { id: 'teapotLemon', flags: ['teapot', 'lemon'] },
  { id: 'orderTasting', flags: ['servingOrder', 'tasting'] },
  { id: 'teapotTargets', flags: ['teapot', 'targets'] },
  { id: 'teapotStrainer', flags: ['teapot', 'strainer'] },
  { id: 'honey', flags: ['honey'] },
  { id: 'tasting', flags: ['tasting'] },
  { id: 'lemon', flags: ['lemon'] },
  { id: 'sink', flags: ['sink'] },
  { id: 'targets', flags: ['targets'] },
  { id: 'servingOrder', flags: ['servingOrder'] },
];

const EXPECTED_PLANS = EXPECTED_DECK.map((entry) => plan(entry.flags));

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const G19_SNAPSHOT = JSON.parse(
  readFileSync(`${REPO_ROOT}tests/fixtures/g19-rollout-v2-snapshot.json`, 'utf8'),
) as {
  baseSha: string;
  boundary: { v1MaxLevel: number; v2FirstChallengeLevel: number; deckLength: number };
  deck: string[];
  levels: Array<{ level: number; phase: string; plan: string; hash: string }>;
};

const PEAK_PLANS = new Set([
  key(plan()),
  key(plan(['honey'])),
  key(plan(['strainer'])),
  key(plan(['lemon'])),
  key(plan(['tasting'])),
  key(plan(['sink'])),
  key(plan(['targets'])),
  key(plan(['teapot'])),
]);

describe('G19 Rollout V2 boundary (frozen historical prefix)', () => {
  it('boundary constants are explicit: V1 <=330, first V2 challenge L334', () => {
    expect(ROLLOUT_V1_MAX_LEVEL).toBe(330);
    expect(ROLLOUT_V2_FIRST_CHALLENGE_LEVEL).toBe(334);
    expect(CHALLENGE_DECK_V2_LENGTH).toBe(28);
    expect(V2_CHALLENGE_DECK_IDS).toHaveLength(28);
    expect(CHALLENGE_DECK_V2).toHaveLength(28);
  });

  it('L326-L330 remain the G18 historical plans/configs', () => {
    expect(getLevelConfig(326).phase).toBe('challenge');
    expect(mechanicPlanForLevel(326)).toEqual(challengeMechanicPlanV1(326));
    expect(getLevelConfig(327).phase).toBe('peak');
    expect(mechanicPlanForLevel(327)).toEqual(plan(['lemon']));
    expect(getLevelConfig(328).phase).toBe('relax');
    expect(mechanicPlanForLevel(328)).toEqual(plan());
    expect(getLevelConfig(329).phase).toBe('warmup');
    expect(mechanicPlanForLevel(329)).toEqual(plan());
    expect(getLevelConfig(330).phase).toBe('challenge');
    expect(mechanicPlanForLevel(330)).toEqual(plan(['teaPair']));
  });

  it('L331-L333 keep the existing peak/relax/warmup rhythm', () => {
    expect(getLevelConfig(331).phase).toBe('peak');
    expect(mechanicPlanForLevel(331)).toEqual(plan(['tasting']));
    expect(getLevelConfig(332).phase).toBe('relax');
    expect(mechanicPlanForLevel(332)).toEqual(plan());
    expect(getLevelConfig(333).phase).toBe('warmup');
    expect(mechanicPlanForLevel(333)).toEqual(plan());
  });

  it('L334 is the first V2 challenge and maps to deck slot 0', () => {
    const cfg = getLevelConfig(334);
    expect(cfg.phase).toBe('challenge');
    expect(mechanicPlanForLevel(334)).toEqual(EXPECTED_PLANS[0]);
    expect(challengeMechanicPlanV2(334)).toEqual(EXPECTED_PLANS[0]);
  });
});

describe('G19 Rollout V2 deck: exact product order', () => {
  it('28 ids and 28 plans match the specified order exactly', () => {
    expect(V2_CHALLENGE_DECK_IDS).toEqual(EXPECTED_DECK.map((entry) => entry.id));
    for (let i = 0; i < 28; i++) {
      expect(CHALLENGE_DECK_V2[i], `deck slot ${i}`).toEqual(EXPECTED_PLANS[i]);
    }
  });

  it('slot mapping is exact for all 28 slots and repeats at L446', () => {
    for (let i = 0; i < 28; i++) {
      const level = 334 + 4 * i;
      expect(challengeMechanicPlanV2(level), `L${level} -> slot ${i}`).toEqual(EXPECTED_PLANS[i]);
      expect(mechanicPlanForLevel(level), `L${level} production`).toEqual(EXPECTED_PLANS[i]);
    }
    expect(challengeMechanicPlanV2(446)).toEqual(EXPECTED_PLANS[0]);
    expect(mechanicPlanForLevel(446)).toEqual(EXPECTED_PLANS[0]);
  });

  it('10 full decks repeat exactly (280 challenge slots / 1120 levels)', () => {
    for (let deck = 0; deck < 10; deck++) {
      for (let i = 0; i < 28; i++) {
        const level = 334 + 4 * (deck * 28 + i);
        expect(mechanicPlanForLevel(level), `deck ${deck} slot ${i} L${level}`).toEqual(
          EXPECTED_PLANS[i],
        );
      }
    }
  });

  it('rejects non-challenge levels loudly (no hidden modulo shift)', () => {
    for (const level of [330, 331, 332, 333, 335, 336, 337, 339]) {
      expect(() => challengeMechanicPlanV2(level), `L${level}`).toThrow();
    }
  });

  it('intentional G19 snapshot 331–1600 is exact and readable', () => {
    expect(G19_SNAPSHOT.baseSha).toBe('1a350ef345d73d7e3d476e2c0f1d6c82af26a548');
    expect(G19_SNAPSHOT.boundary).toEqual({
      v1MaxLevel: 330,
      v2FirstChallengeLevel: 334,
      deckLength: 28,
    });
    expect(G19_SNAPSHOT.deck).toEqual(EXPECTED_DECK.map((entry) => entry.id));
    expect(G19_SNAPSHOT.levels).toHaveLength(1270);
    const diffs: string[] = [];
    for (const row of G19_SNAPSHOT.levels) {
      const cfg = getLevelConfig(row.level);
      const actualHash = semanticConfigHash(row.level);
      const actualPlan = key(mechanicPlanForLevel(row.level));
      if (
        actualHash !== row.hash ||
        cfg.phase !== row.phase ||
        actualPlan !== row.plan
      ) {
        diffs.push(
          `L${row.level}: expected ${row.phase}/${row.plan}/${row.hash}, got ${cfg.phase}/${actualPlan}/${actualHash}`,
        );
      }
    }
    expect(diffs, `G19 snapshot mismatches:\n${diffs.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('same level always yields the same plan (no session/seed/storage input)', () => {
    for (const level of [334, 338, 402, 1000, 5000, 9998, 10000]) {
      const first = mechanicPlanForLevel(level);
      for (let i = 0; i < 5; i++) expect(mechanicPlanForLevel(level)).toEqual(first);
    }
  });
});

describe('G19 Rollout V2 neighbor policy (peak/warmup/relax untouched)', () => {
  it('every deck challenge is followed by peak, relax, warmup and the next slot', () => {
    for (let i = 0; i < 28; i++) {
      const level = 334 + 4 * i;
      const peakCfg = getLevelConfig(level + 1);
      expect(peakCfg.phase, `L${level + 1} peak`).toBe('peak');
      expect(peakCfg.hasMysteryLayer).toBe(true);
      expect(PEAK_PLANS.has(key(mechanicPlanForLevel(level + 1))), `L${level + 1} peak plan`).toBe(
        true,
      );
      expect(getLevelConfig(level + 2).phase).toBe('relax');
      expect(mechanicPlanForLevel(level + 2)).toEqual(plan());
      expect(getLevelConfig(level + 3).phase).toBe('warmup');
      expect(mechanicPlanForLevel(level + 3)).toEqual(plan());
    }
  });

  it('no V2 deck-only mechanic leaks into peak through L10000', () => {
    const advanced = [
      'frozen',
      'thermos',
      'cinnamon',
      'teaBloom',
      'blend',
      'servingOrder',
      'sharedTray',
      'teaPair',
    ] as const;
    for (let level = 331; level <= 10000; level++) {
      if (getLevelConfig(level).phase !== 'peak') continue;
      const planFlags = mechanicPlanForLevel(level);
      for (const flag of advanced) {
        expect(planFlags[flag], `L${level} peak leaked ${flag}`).toBe(false);
      }
    }
  });
});

describe('G19 Rollout V2 compatibility and safety', () => {
  it('every deck plan uses known flags, <=2 specials, and only shipped compositions', () => {
    const allowedComboKeys = new Set([
      'honey+lemon',
      'honey+teapot',
      'strainer+teapot',
      'lemon+teapot',
      'tasting+teapot',
      'sink+teapot',
      'targets+teapot',
      'servingOrder+tasting',
    ]);
    for (let i = 0; i < 28; i++) {
      const p = EXPECTED_PLANS[i] as MechanicPlan;
      const on = FLAGS.filter((flag) => p[flag]).sort();
      expect(on.length, `slot ${i} special count`).toBeLessThanOrEqual(2);
      if (on.length > 1) {
        expect(allowedComboKeys.has(on.join('+')), `slot ${i} unsupported combo ${on.join('+')}`).toBe(
          true,
        );
      }
    }
  });

  it('Shared Tray and Tea Pair remain standalone; Blend stays standalone', () => {
    for (const id of ['sharedTray', 'teaPair', 'blend'] as const) {
      const p = plan([id]);
      expect(mechanicPlanForLevel(334 + 4 * V2_CHALLENGE_DECK_IDS.indexOf(id))).toEqual(p);
    }
    const shared = plan(['sharedTray']);
    const pair = plan(['teaPair']);
    const blend = plan(['blend']);
    for (const flag of FLAGS) {
      if (flag !== 'sharedTray') expect(shared[flag]).toBe(false);
      if (flag !== 'teaPair') expect(pair[flag]).toBe(false);
      if (flag !== 'blend') expect(blend[flag]).toBe(false);
    }
    for (const flag of ['servingOrder', 'tasting', 'honey', 'strainer', 'teaPair'] as const) {
      expect(mechanicCompatibility('sharedTray', flag).sameLevel).not.toBe('allow');
    }
    expect(mechanicCompatibility('sharedTray', 'blend').sameLevel).toBe('forbid');
    for (const flag of ['blend', 'servingOrder', 'tasting', 'honey', 'strainer'] as const) {
      expect(mechanicCompatibility('teaPair', flag).sameLevel).not.toBe('allow');
    }
    for (const flag of ['servingOrder', 'tasting', 'honey', 'strainer', 'sharedTray', 'teaPair'] as const) {
      expect(mechanicCompatibility('blend', flag).sameLevel).toBe('forbid');
    }
  });

  it('existing compatibility validators accept each deck plan (no second policy)', () => {
    for (let i = 0; i < 28; i++) {
      const p = EXPECTED_PLANS[i] as MechanicPlan;
      expect(
        validateMechanicCombination({
          servingOrder: p.servingOrder,
          mystery: false,
          tastingCount: p.tasting ? 1 : 0,
          honey: p.honey,
          strainer: p.strainer,
          blend: p.blend,
        }),
        `slot ${i} composition`,
      ).toEqual([]);
      expect(
        validateSharedTrayCombination({
          sharedTray: p.sharedTray,
          servingOrder: p.servingOrder,
          mystery: false,
          tastingCount: p.tasting ? 1 : 0,
          honey: p.honey,
          strainer: p.strainer,
          blend: p.blend,
        }),
        `slot ${i} shared tray`,
      ).toEqual([]);
      expect(
        validateTeaPairCombination({
          teaPair: p.teaPair,
          servingOrder: p.servingOrder,
          mystery: false,
          tastingCount: p.tasting ? 1 : 0,
          honey: p.honey,
          strainer: p.strainer,
          blend: p.blend,
          sharedTray: p.sharedTray,
        }),
        `slot ${i} tea pair`,
      ).toEqual([]);
    }
  });

  it('reaction IDs appear only in blend palettes through L10000', () => {
    for (let level = 331; level <= 10000; level++) {
      const cfg = getLevelConfig(level);
      if (cfg.hasBlend) continue;
      expect(cfg.colors, `L${level} palette reaction leak`).not.toContain('black_tea');
      expect(cfg.colors, `L${level} palette reaction leak`).not.toContain('milk');
      expect(cfg.colors, `L${level} palette reaction leak`).not.toContain('milk_tea');
    }
  });
});

describe('G19 Rollout V2 recurrence tutorial policy', () => {
  it('every recurring deck slot has no tutorial banner', () => {
    for (let i = 0; i < 28; i++) {
      const level = 334 + 4 * i;
      expect(tutorialForConfig(getLevelConfig(level)), `L${level} tutorial repeat`).toBeNull();
    }
  });

  it('first exposures remain exactly where G18 left them', () => {
    expect(tutorialForConfig(getLevelConfig(162))?.id).toBe('sharedTray');
    expect(tutorialForConfig(getLevelConfig(250))?.id).toBe('teaPair');
    expect(tutorialForConfig(getLevelConfig(338))).toBeNull();
    expect(tutorialForConfig(getLevelConfig(374))).toBeNull();
    expect(tutorialForConfig(getLevelConfig(402))).toBeNull();
  });
});
