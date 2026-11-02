/** G21 FLASK_TRAY compatibility / exact request contract. */
import { describe, expect, it } from 'vitest';
import {
  createGenerateStats,
  generateLevel,
  requestedSharedTrayCount,
  requestedSteepingFlaskCount,
  sharedTrayTemplateKindFor,
  steepingFlaskSharedTrayTemplateKindFor,
  steepingFlaskTemplateKindFor,
  validateSharedTrayRequest,
  validateSteepingFlaskRequest,
  type GenerateRequest,
} from '../src/game/logic/generator';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import { generateRequestForLevelConfig } from '../src/game/logic/productionRequest';
import {
  mechanicCompatibility,
  validateSharedTrayCombination,
  validateSteepingFlaskCombination,
} from '../src/game/logic/mechanicCompatibility';
import {
  isSteepingFlaskConstraint,
  isValidSteepingFlaskConstraint,
  type CupConstraint,
} from '../src/game/types';
import { isValidSharedTrayMemberConstraint } from '../src/game/logic/sharedCapacity';

const BASE: GenerateRequest = generateRequestForLevelConfig(getLevelConfig(874));

describe('G21 compatibility policy', () => {
  it('promotes only flask + shared tray to level allow, sameCup forbid', () => {
    expect(mechanicCompatibility('steepingFlask', 'sharedTray')).toMatchObject({
      sameLevel: 'allow',
      sameCup: 'forbid',
    });
    expect(mechanicCompatibility('sharedTray', 'steepingFlask')).toEqual(
      mechanicCompatibility('steepingFlask', 'sharedTray'),
    );
    for (const other of ['teaPair', 'servingOrder', 'tasting', 'mystery', 'honey', 'strainer'] as const) {
      expect(mechanicCompatibility('steepingFlask', other)).toMatchObject({
        sameLevel: 'research',
        sameCup: 'forbid',
      });
    }
    expect(mechanicCompatibility('sharedTray', 'servingOrder')).toMatchObject({
      sameLevel: 'forbid',
      sameCup: 'forbid',
    });
    expect(mechanicCompatibility('steepingFlask', 'blend')).toMatchObject({
      sameLevel: 'forbid',
      sameCup: 'forbid',
    });
  });

  it('validator allows shared tray only with the explicit opt-in', () => {
    const flags = {
      steepingFlask: true,
      servingOrder: false,
      mystery: false,
      tastingCount: 0,
      honey: false,
      strainer: false,
      blend: false,
      sharedTray: true,
      teaPair: false,
    };
    expect(validateSteepingFlaskCombination(flags)).not.toEqual([]);
    expect(validateSteepingFlaskCombination(flags, { allowSharedTray: true })).toEqual([]);
    expect(validateSharedTrayCombination({
      sharedTray: true,
      servingOrder: false,
      mystery: false,
      tastingCount: 0,
      honey: false,
      strainer: false,
      blend: false,
    })).toEqual([]);
  });

  it('same-cup flask+tray is statically invalid', () => {
    const bad: CupConstraint = {
      mode: 'normal',
      capacity: 4,
      mustEndEmpty: true,
      steepingFlask: true,
      sharedCapacityGroup: 'tea-tray',
    };
    expect(isSteepingFlaskConstraint(bad)).toBe(true);
    expect(isValidSteepingFlaskConstraint(bad)).toBe(false);
    expect(isValidSharedTrayMemberConstraint(bad)).toBe(false);
  });
});

describe('G21 request matcher', () => {
  it('recognizes only the exact E6 standalone composition', () => {
    expect(requestedSharedTrayCount(BASE)).toBe(1);
    expect(requestedSteepingFlaskCount(BASE)).toBe(1);
    expect(steepingFlaskSharedTrayTemplateKindFor(BASE)).toBe('flask-tray');
    expect(steepingFlaskTemplateKindFor(BASE)).toBeNull();
    expect(sharedTrayTemplateKindFor(BASE)).toBeNull();
    expect(() => validateSharedTrayRequest(BASE)).not.toThrow();
    expect(() => validateSteepingFlaskRequest(BASE)).not.toThrow();
  });

  it('accepts shared-tray and flask standalone requests independently', () => {
    const flaskOnly = { ...BASE, sharedTrayCount: 0 };
    const trayOnly = { ...BASE, steepingFlaskCount: 0 };
    expect(steepingFlaskTemplateKindFor(flaskOnly)).toBe('steeping-flask');
    expect(steepingFlaskSharedTrayTemplateKindFor(flaskOnly)).toBeNull();
    expect(sharedTrayTemplateKindFor(trayOnly)).toBe('shared-tray');
    expect(steepingFlaskSharedTrayTemplateKindFor(trayOnly)).toBeNull();
  });

  it('rejects every third mechanic and malformed count', () => {
    const extras: Array<Partial<GenerateRequest>> = [
      { serveOrderCount: 2 },
      { teaPairCount: 1 },
      { teaBudCount: 1 },
      { targetTeaIds: ['lavender'] },
      { sinkOnlyCount: 1 },
      { tastingCupCount: 1 },
      { floatingIngredient: 'lemon' },
      { sinkingIngredient: 'honey' },
      { hasStrainer: true },
      { frozenCupCount: 1 },
      { thermosCupCount: 1 },
      { cinnamonCupCount: 1 },
      { blendRecipeId: 'milk-tea' },
      { hasMysteryLayer: true },
    ];
    for (const extra of extras) {
      expect(() => validateSteepingFlaskRequest({ ...BASE, ...extra }), JSON.stringify(extra)).toThrow();
    }
    for (const count of [2, -1, 1.5]) {
      expect(() => validateSteepingFlaskRequest({ ...BASE, steepingFlaskCount: count })).toThrow();
      expect(() => validateSharedTrayRequest({ ...BASE, sharedTrayCount: count })).toThrow();
    }
  });

  it('generates a full C2 composition without fallback on the happy path', () => {
    const stats = createGenerateStats();
    const level = generateLevel(BASE, 'g21-compat:0', { stats });
    expect(level.cups.map((c) => c.length).sort((a, b) => a - b)).toEqual([0, 2, 3, 3, 4, 4]);
    expect(level.cupConstraints.filter(isSteepingFlaskConstraint)).toHaveLength(1);
    expect(level.cupConstraints.filter((c) => c.sharedCapacityGroup === 'tea-tray')).toHaveLength(2);
    expect(stats.usedFallback).toBe(false);
    expect(stats.templateAttempts).toBe(1);
    expect(stats.solverCalls).toBe(1);
  });
});
