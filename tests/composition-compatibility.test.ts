/**
 * G15 compatibility matrix ( §§3-4 ): LEVEL vs CUP, pure source of truth.
 * Fail-closed unknown pairs; symmetric A+B/B+A; no RNG/mutation/UI/solver.
 */
import { describe, expect, it } from 'vitest';
import {
  mechanicCompatibility,
  validateMechanicCombination,
} from '../src/game/logic/mechanicCompatibility';

describe('mechanicCompatibility: Tier-A policy (§3)', () => {
  it('servingOrder+mystery: level allow, cup forbid', () => {
    expect(mechanicCompatibility('servingOrder', 'mystery')).toMatchObject({ sameLevel: 'allow', sameCup: 'forbid' });
    expect(mechanicCompatibility('mystery', 'servingOrder')).toMatchObject({ sameLevel: 'allow', sameCup: 'forbid' });
  });
  it('servingOrder+tasting: level allow, cup forbid', () => {
    expect(mechanicCompatibility('servingOrder', 'tasting')).toMatchObject({ sameLevel: 'allow', sameCup: 'forbid' });
    expect(mechanicCompatibility('tasting', 'servingOrder')).toMatchObject({ sameLevel: 'allow', sameCup: 'forbid' });
  });
  it('servingOrder+honey: level allow, cup forbid', () => {
    expect(mechanicCompatibility('servingOrder', 'honey')).toMatchObject({ sameLevel: 'allow', sameCup: 'forbid' });
    expect(mechanicCompatibility('honey', 'servingOrder')).toMatchObject({ sameLevel: 'allow', sameCup: 'forbid' });
  });
  it('servingOrder+strainer: research/research', () => {
    expect(mechanicCompatibility('servingOrder', 'strainer')).toMatchObject({ sameLevel: 'research', sameCup: 'research' });
  });
  it('servingOrder+blend: forbid/forbid both directions', () => {
    expect(mechanicCompatibility('servingOrder', 'blend')).toMatchObject({ sameLevel: 'forbid', sameCup: 'forbid' });
    expect(mechanicCompatibility('blend', 'servingOrder')).toMatchObject({ sameLevel: 'forbid', sameCup: 'forbid' });
  });
  it('symmetric + fail-closed unknown', () => {
    expect(mechanicCompatibility('tasting', 'honey')).toMatchObject({ sameLevel: 'forbid', sameCup: 'forbid' });
    expect(mechanicCompatibility('servingOrder', 'servingOrder')).toMatchObject({ sameLevel: 'allow', sameCup: 'allow' });
  });
});

describe('validateMechanicCombination: pure combination gate (§4)', () => {
  it('standalone serving order valid; no-partner valid', () => {
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: false })).toEqual([]);
    expect(validateMechanicCombination({ servingOrder: false, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: false })).toEqual([]);
  });
  it('single Tier-A partners valid', () => {
    expect(validateMechanicCombination({ servingOrder: true, mystery: true, tastingCount: 0, honey: false, strainer: false, blend: false })).toEqual([]);
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 1, honey: false, strainer: false, blend: false })).toEqual([]);
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 0, honey: true, strainer: false, blend: false })).toEqual([]);
  });
  it('blend forbidden; strainer research; two partners rejected', () => {
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: true }).length).toBeGreaterThan(0);
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 0, honey: false, strainer: true, blend: false }).length).toBeGreaterThan(0);
    expect(validateMechanicCombination({ servingOrder: true, mystery: true, tastingCount: 1, honey: false, strainer: false, blend: false }).length).toBeGreaterThan(0);
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 1, honey: true, strainer: false, blend: false }).length).toBeGreaterThan(0);
    expect(validateMechanicCombination({ servingOrder: true, mystery: false, tastingCount: 2, honey: false, strainer: false, blend: false }).length).toBeGreaterThan(0);
  });
  it('deterministic, no mutation (pure)', () => {
    const flags = { servingOrder: true, mystery: false, tastingCount: 1, honey: false, strainer: false, blend: false } as const;
    const a = validateMechanicCombination({ ...flags });
    const b = validateMechanicCombination({ ...flags });
    expect(a).toEqual(b);
  });
});
