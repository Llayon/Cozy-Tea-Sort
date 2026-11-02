/**
 * G21 Rollout V4 normalized plan snapshot (DEV evidence + regression oracle).
 * Stores levels 874–1600. G20 fixture remains untouched and frozen to 873.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  CHALLENGE_DECK_V4_LENGTH,
  ROLLOUT_V4_FIRST_CHALLENGE_LEVEL,
  getLevelConfig,
  mechanicPlanForLevel,
  V4_WINNER_PLAN,
} from '../../src/utils/difficultyCurve.ts';
import { semanticConfigHash } from './g18-snapshot-lib.ts';

type MechanicPlan = ReturnType<typeof mechanicPlanForLevel>;
const FLAGS = [
  'teapot','targets','sink','tasting','lemon','strainer','honey','frozen','thermos',
  'cinnamon','teaBloom','blend','servingOrder','sharedTray','teaPair','steepingFlask',
] as const;
function planKey(plan: MechanicPlan): string {
  const on = FLAGS.filter((flag) => plan[flag]).sort();
  return on.length === 0 ? 'clean' : on.join('+');
}
const ROOT = resolve(import.meta.dirname, '../..');
const OUT = resolve(ROOT, 'tests/fixtures/g21-rollout-v4-snapshot.json');
const FROM = 874;
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
  gauntlet: 'G21',
  baseSha: '2288260a5ec9e7053c678229bc1f567fe73588fc',
  generatedAt: new Date().toISOString(),
  boundary: {
    v4FirstChallengeLevel: ROLLOUT_V4_FIRST_CHALLENGE_LEVEL,
    firstComboLevel: 874,
    deckLength: CHALLENGE_DECK_V4_LENGTH,
    winner: planKey(V4_WINNER_PLAN),
  },
  levels,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.log(`wrote ${OUT} (${levels.length} levels)`);
