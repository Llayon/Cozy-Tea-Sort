/**
 * G20 Rollout V3 normalized plan snapshot (DEV evidence + regression oracle).
 * Stores levels 558–1600. The G19 fixture remains untouched.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CHALLENGE_DECK_V3_LENGTH,
  ROLLOUT_V3_FIRST_CHALLENGE_LEVEL,
  V3_CHALLENGE_DECK_IDS,
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
  'steepingFlask',
] as const;

function planKey(plan: MechanicPlan): string {
  const on = FLAGS.filter((flag) => plan[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}

const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'tests/fixtures/g20-rollout-v3-snapshot.json');
const FROM = 558;
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
  gauntlet: 'G20',
  baseSha: 'd9e582399a8685d71ef37b48ec8f742befbb4211',
  generatedAt: new Date().toISOString(),
  boundary: {
    v3FirstChallengeLevel: ROLLOUT_V3_FIRST_CHALLENGE_LEVEL,
    deckLength: CHALLENGE_DECK_V3_LENGTH,
  },
  deck: [...V3_CHALLENGE_DECK_IDS],
  levels,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${OUT} (${levels.length} levels, ${artifact.deck.length} deck slots)`);
