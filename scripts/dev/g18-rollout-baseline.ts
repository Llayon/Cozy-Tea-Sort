/**
 * G18 release audit — machine-readable rollout baseline.
 *
 * Enumerates levels 1–1600 through the real production config + generator,
 * with a fixed deterministic seed policy. This is DEV-only evidence (not a
 * CI test): it captures phase/palette/mechanic rollout, actual generated
 * topology identity, canonical initial keys, solver depth and generation
 * counters before any G18 presentation work begins.
 *
 * Run:
 *   bunx tsx scripts/dev/g18-rollout-baseline.ts
 *   bunx tsx scripts/dev/g18-rollout-baseline.ts --out scripts/dev/out/foo.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateRequestForLevelConfig } from '../../src/game/logic/productionRequest.ts';
import { getLevelConfig, mechanicPlanForLevel } from '../../src/utils/difficultyCurve.ts';
import type { LevelConfig } from '../../src/types/tea.ts';
import {
  PINNED_LEVELS,
  generateRecord,
  primarySeed,
  secondarySeed,
} from './g18-snapshot-lib.ts';

const LEVELS = 1600;
const requestForConfig = generateRequestForLevelConfig;
const ROOT = resolve(import.meta.dirname, '../..');
const outArgIndex = process.argv.indexOf('--out');
const OUT = resolve(
  ROOT,
  outArgIndex >= 0 ? (process.argv[outArgIndex + 1] as string) : 'scripts/dev/out/g18-rollout-baseline.json',
);

function tutorialEligibility(cfg: LevelConfig): string[] {
  const out: string[] = [];
  if (cfg.hasSourceOnlyTeapot && !cfg.hasSinkGuestCup && !cfg.hasTastingBowl && !cfg.floatingIngredient)
    out.push('teapot');
  if (cfg.hasSinkGuestCup) out.push('sink');
  if (cfg.hasTastingBowl) out.push('tasting');
  if (cfg.floatingIngredient === 'lemon' && cfg.sinkingIngredient !== 'honey') out.push('lemon');
  if (cfg.hasStrainer) out.push('strainer');
  if (cfg.sinkingIngredient === 'honey' && cfg.floatingIngredient !== 'lemon') out.push('honey');
  if (cfg.hasFrozenCup && cfg.levelNumber === 66) out.push('frozen');
  if (cfg.hasThermos && cfg.levelNumber === 74) out.push('thermos');
  if (cfg.hasCinnamon && cfg.levelNumber === 82) out.push('cinnamon');
  if (cfg.hasTeaBloom && cfg.levelNumber === 90) out.push('teaBloom');
  if (cfg.hasBlend && cfg.levelNumber === 98) out.push('blend');
  if (cfg.hasServingOrder && cfg.levelNumber === 106) out.push('servingOrder');
  if (cfg.hasSharedTray && cfg.levelNumber === 162) out.push('sharedTray');
  if (cfg.hasTeaPair && cfg.levelNumber === 250) out.push('teaPair');
  if (cfg.hasServingOrder && cfg.hasTastingBowl && cfg.levelNumber === 154) out.push('servingOrderTasting');
  if (cfg.floatingIngredient === 'lemon' && cfg.sinkingIngredient === 'honey' && cfg.levelNumber === 58)
    out.push('lemonHoney');
  if (cfg.targetTeaIds.length > 0) out.push('targets');
  if (cfg.hasMysteryLayer) out.push('mystery-notice');
  return out;
}

function mechanicFlags(cfg: LevelConfig): Record<string, boolean> {
  return {
    teapot: cfg.hasSourceOnlyTeapot,
    targets: cfg.targetTeaIds.length > 0,
    sink: cfg.hasSinkGuestCup,
    tasting: cfg.hasTastingBowl,
    lemon: cfg.floatingIngredient === 'lemon',
    strainer: cfg.hasStrainer,
    honey: cfg.sinkingIngredient === 'honey',
    frozen: cfg.hasFrozenCup,
    thermos: cfg.hasThermos === true,
    cinnamon: cfg.hasCinnamon === true,
    teaBloom: cfg.hasTeaBloom === true,
    blend: cfg.hasBlend === true,
    servingOrder: cfg.hasServingOrder === true,
    sharedTray: cfg.hasSharedTray === true,
    teaPair: cfg.hasTeaPair === true,
  };
}

const startedAll = performance.now();
const records = [];
const failures: Array<{ level: number; seed: string; error: string }> = [];
const secondarySample = new Set<number>(PINNED_LEVELS);
for (let lvl = 1; lvl <= LEVELS; lvl++) {
  if (lvl % 10 === 0 || lvl > LEVELS - 5) secondarySample.add(lvl);
  if (lvl <= 330 && mechanicPlanForLevel(lvl).sharedTray) secondarySample.add(lvl);
  if (lvl <= 330 && mechanicPlanForLevel(lvl).teaPair) secondarySample.add(lvl);
}

for (let lvl = 1; lvl <= LEVELS; lvl++) {
  const cfg = getLevelConfig(lvl);
  const plan = mechanicPlanForLevel(lvl);
  const base: Record<string, unknown> = {
    levelNumber: lvl,
    phase: cfg.phase,
    phaseName: cfg.phaseName,
    phaseSubtitle: cfg.phaseSubtitle,
    numColors: cfg.numColors,
    totalCups: cfg.totalCups,
    colors: cfg.colors,
    mechanicFlags: mechanicFlags(cfg),
    plan,
    mystery: cfg.hasMysteryLayer,
    targetTeaIds: cfg.targetTeaIds,
    floatingIngredient: cfg.floatingIngredient ?? null,
    sinkingIngredient: cfg.sinkingIngredient ?? null,
    tutorialEligibility: tutorialEligibility(cfg),
    request: requestForConfig(cfg),
  };
  try {
    base.primary = generateRecord(cfg, primarySeed(lvl));
  } catch (err) {
    failures.push({ level: lvl, seed: primarySeed(lvl), error: String(err) });
  }
  if (secondarySample.has(lvl) && !failures.some((f) => f.level === lvl)) {
    try {
      base.secondary = generateRecord(cfg, secondarySeed(lvl));
    } catch (err) {
      failures.push({ level: lvl, seed: secondarySeed(lvl), error: String(err) });
    }
  }
  records.push(base);
  if (lvl % 100 === 0) {
    console.error(`[g18-baseline] ${lvl}/${LEVELS} (${((performance.now() - startedAll) / 1000).toFixed(1)}s)`);
  }
}

const artifact = {
  gauntlet: 'G18',
  sourceSha: 'f2d28287aa0f67e096309800d2224fa5ee574e81',
  generatedAt: new Date().toISOString(),
  levelCount: LEVELS,
  seedPolicy: {
    primary: 'g18-baseline:<level>:0',
    secondary: 'g18-baseline:<level>:1 (pinned + every 10th + special <=330)',
  },
  secondarySample: [...secondarySample].sort((a, b) => a - b),
  pinnedLevels: PINNED_LEVELS,
  failures,
  totals: {
    generated: records.filter((r) => r.primary !== undefined).length,
    failed: failures.length,
    fallback: records.filter(
      (r) => (r.primary as { stats?: { usedFallback?: boolean } } | undefined)?.stats?.usedFallback,
    ).length,
    wallMs: Math.round(performance.now() - startedAll),
  },
  records,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);
console.error(
  `[g18-baseline] wrote ${OUT} • ${artifact.totals.generated}/${LEVELS} generated • ` +
    `${artifact.totals.fallback} fallback • ${failures.length} failures • ` +
    `${(artifact.totals.wallMs / 1000).toFixed(1)}s`,
);
if (failures.length > 0) process.exitCode = 1;
