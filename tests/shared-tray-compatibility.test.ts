/** G16 shared-tray compatibility policy (mechanicCompatibility single source). */
import { describe, expect, it } from 'vitest';
import {
  mechanicCompatibility,
  validateSharedTrayCombination,
} from '../src/game/logic/mechanicCompatibility';

describe('shared-tray compatibility identity', () => {
  it('sharedTray is a recognized mechanic', () => {
    expect(mechanicCompatibility('sharedTray', 'sharedTray').sameLevel).toBe('allow');
  });

  it('Shared + Blend stays FORBID', () => {
    const c = mechanicCompatibility('sharedTray', 'blend');
    expect(c.sameLevel).toBe('forbid');
    expect(c.sameCup).toBe('forbid');
  });

  it('Shared + Order/Mystery/Tasting/Honey/Strainer all forbid at level', () => {
    for (const other of ['servingOrder', 'mystery', 'tasting', 'honey', 'strainer'] as const) {
      const c = mechanicCompatibility('sharedTray', other);
      expect(c.sameLevel).toBe('forbid');
    }
  });

  it('validateSharedTrayCombination rejects any partner (standalone)', () => {
    expect(
      validateSharedTrayCombination({ sharedTray: true, servingOrder: false, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: false }),
    ).toEqual([]);
    expect(
      validateSharedTrayCombination({ sharedTray: true, servingOrder: true, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: false }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSharedTrayCombination({ sharedTray: true, servingOrder: false, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: true })[0],
    ).toMatch(/blend is forbidden/);
    expect(
      validateSharedTrayCombination({ sharedTray: false, servingOrder: true, mystery: false, tastingCount: 0, honey: false, strainer: false, blend: false }),
    ).toEqual([]);
  });
});
