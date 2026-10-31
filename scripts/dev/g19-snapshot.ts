/**
 * G19 Rollout V2 normalized plan snapshot (DEV evidence + regression oracle).
 *
 * Stores the intentional G19 semantic rollout for levels 331–1600. This is a
 * NEW G19 fixture; the G18 fixture remains untouched historical evidence.
 *
 * Run:
 *   bunx tsx scripts/dev/g19-snapshot.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CHALLENGE_DECK_V2_LENGTH,
  ROLLOUT_V1_MAX_LEVEL,
  ROLLOUT_V2_FIRST_CHALLENGE_LEVEL,
  V2_CHALLENGE_DECK_IDS,
  getLevelConfig,
  mechanicPlanForLevel,
} from '../../src/utils/difficultyCurve.ts';
import { semanticConfigHash } from './g18-snapshot-lib.ts';

type MechanicPlan = ReturnType<typeof mechanicPlanForLevel>;

const FLAGS = [
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
] as const;

function planKey(plan: MechanicPlan): string {
  const on = FLAGS.filter((flag) => plan[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'tests/fixtures/g19-rollout-v2-snapshot.json');
const FROM = 331;
const TO = 1600;

const levels = [];
for (let level = FROM; level <= TO; level++) {
  const cfg = getLevelConfig(level);
  levels.push({
    level,
    phase: cfg.phase,
    plan: planKey(mechanicPlanForLevel(level)),
    hash: semanticConfigHash(level),
  });
}

const artifact = {
  gauntlet: 'G19',
  baseSha: '1a350ef345d73d7e3d476e2c0f1d6c82af26a548',
  generatedAt: new Date().toISOString(),
  boundary: {
    v1MaxLevel: ROLLOUT_V1_MAX_LEVEL,
    v2FirstChallengeLevel: ROLLOUT_V2_FIRST_CHALLENGE_LEVEL,
    deckLength: CHALLENGE_DECK_V2_LENGTH,
  },
  deck: [...V2_CHALLENGE_DECK_IDS],
  levels,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${OUT} (${levels.length} levels, ${artifact.deck.length} deck slots)`);
