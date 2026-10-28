/**
 * Shared G18 rollout snapshot helpers (DEV + regression test).
 *
 * ONE definition of the semantic config projection, initial topology
 * signature, generated-state fingerprint and deterministic seed policy.
 * No gameplay rules live here.
 */
import { createHash } from 'node:crypto';
import {
  createGenerateStats,
  generateLevel,
  type GeneratedLevel,
} from '../../src/game/logic/generator';
import { generateRequestForLevelConfig } from '../../src/game/logic/productionRequest';
import { canonicalPuzzleKey } from '../../src/game/logic/rules';
import { getLevelConfig, mechanicPlanForLevel } from '../../src/utils/difficultyCurve';
import type { LevelConfig } from '../../src/types/tea';
import {
  emptyFloatingIngredients,
  normalizeCapacityObstacles,
  normalizeIceSlots,
  normalizeSinkingIngredients,
  normalizeStrainerState,
  normalizeTeaBudSlots,
  type CupConstraint,
} from '../../src/game/types';

export const PINNED_LEVELS = [
  1, 2, 3, 4, 6, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 154, 162,
  242, 250, 330,
] as const;

export function primarySeed(level: number): string {
  return `g18-baseline:${level}:0`;
}
export function secondarySeed(level: number): string {
  return `g18-baseline:${level}:1`;
}

export function semanticConfigForLevel(level: number) {
  const cfg = getLevelConfig(level);
  return {
    phase: cfg.phase,
    phaseName: cfg.phaseName,
    phaseSubtitle: cfg.phaseSubtitle,
    numColors: cfg.numColors,
    totalCups: cfg.totalCups,
    colors: cfg.colors,
    mechanicFlags: {
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
    },
    plan: mechanicPlanForLevel(level),
    mystery: cfg.hasMysteryLayer,
    targetTeaIds: cfg.targetTeaIds,
    floatingIngredient: cfg.floatingIngredient ?? null,
    sinkingIngredient: cfg.sinkingIngredient ?? null,
    request: generateRequestForLevelConfig(cfg),
  };
}

export function semanticConfigHash(level: number): string {
  return sha16(JSON.stringify(semanticConfigForLevel(level)));
}

export function sha16(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function constraintSignature(c: CupConstraint | undefined): string {
  if (!c) return 'N';
  const parts: string[] = [c.mode];
  if (c.capacity !== undefined) parts.push(`cap${c.capacity}`);
  if (c.targetTeaId !== undefined) parts.push(`target:${c.targetTeaId}`);
  if (c.mustEndEmpty) parts.push('empty');
  if (c.serveOrder !== undefined) parts.push(`serve${c.serveOrder}`);
  if (c.sharedCapacityGroup !== undefined) parts.push(`tray:${c.sharedCapacityGroup}`);
  if (c.pairedTeaGroup !== undefined) parts.push(`pair:${c.pairedTeaGroup}`);
  return parts.join('|');
}

export function normalizedGeneratedLevel(level: GeneratedLevel) {
  return {
    cups: level.cups,
    floatingIngredients: level.floatingIngredients,
    cupConstraints: level.cupConstraints,
    strainer: normalizeStrainerState(level.strainer),
    sinkingIngredients: normalizeSinkingIngredients(level.sinkingIngredients, level.cups.length),
    iceSlots: normalizeIceSlots(level.iceSlots, level.cups.length),
    capacityObstacles: normalizeCapacityObstacles(level.capacityObstacles, level.cups.length),
    teaBudSlots: normalizeTeaBudSlots(level.teaBudSlots, level.cups.length),
    blendRecipe: level.blendRecipe,
  };
}

export function topologySignature(level: GeneratedLevel): string {
  const lengths = level.cups.map((c) => c.length).join(',');
  const constraints = level.cups
    .map((_, i) => constraintSignature(level.cupConstraints[i]))
    .join(';');
  const floating = (level.floatingIngredients ?? []).map((s) => s ?? '.').join(',');
  const strainer = normalizeStrainerState(level.strainer);
  const strainerSig = `${strainer.present ? 1 : 0}/${strainer.attachedCupIndex ?? '.'}/${strainer.heldTea ?? '.'}`;
  const sinking = normalizeSinkingIngredients(level.sinkingIngredients, level.cups.length)
    .map((s) => s ?? '.')
    .join(',');
  const ice = normalizeIceSlots(level.iceSlots, level.cups.length)
    .map((s) => s ?? '.')
    .join(',');
  const obstacles = normalizeCapacityObstacles(level.capacityObstacles, level.cups.length)
    .map((s) => s ?? '.')
    .join(',');
  const buds = normalizeTeaBudSlots(level.teaBudSlots, level.cups.length)
    .map((s) => s ?? '.')
    .join(',');
  const blend = level.blendRecipe?.id ?? '.';
  return sha16(
    [lengths, constraints, floating, strainerSig, sinking, ice, obstacles, buds, blend].join('#'),
  );
}

export function generateRecord(cfg: LevelConfig, seed: string) {
  const stats = createGenerateStats();
  const started = performance.now();
  const level = generateLevel(generateRequestForLevelConfig(cfg), seed, { stats });
  const ms = performance.now() - started;
  const canonicalKey = canonicalPuzzleKey(
    {
      cups: level.cups,
      floatingIngredients:
        level.floatingIngredients ?? emptyFloatingIngredients(level.cups.length),
    },
    level.cupConstraints,
  );
  return {
    seed,
    canonicalLengths: level.cups.map((c) => c.length),
    canonicalKey,
    topologyHash: topologySignature(level),
    minMoves: level.minMoves,
    visitedStates: level.visitedStates,
    hiddenCounts: level.hiddenCounts,
    stats: {
      candidatesTried: stats.candidatesTried,
      solverCalls: stats.solverCalls,
      templateAttempts: stats.templateAttempts,
      usedFallback: stats.usedFallback,
    },
    genMs: Math.round(ms * 100) / 100,
    initialFingerprint: sha16(JSON.stringify(normalizedGeneratedLevel(level))),
  };
}
