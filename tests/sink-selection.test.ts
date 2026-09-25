/**
 * Gauntlet 3.1 — guest-cup source-selection policy.
 *
 * Regression: tapping a filled sink-only cup twice must NOT switch source
 * selection onto it ("tap-as-source refused, never selected"). The policy
 * helper is pure and unit-tested here; the Pixi handler delegates to it.
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint } from '../src/game/types';
import { GUEST_SINK_HINT, decideSecondTap } from '../src/game/view/TeaSortView';

const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TARGET: CupConstraint = { mode: 'normal', targetTeaId: 'lavender' };

describe('decideSecondTap: repeat-tap source switching', () => {
  it('ordinary cup tapped twice switches source', () => {
    expect(decideSecondTap(N, false, true)).toBe('switch-source');
  });

  it('teapot tapped twice switches source (it may legally pour)', () => {
    expect(decideSecondTap(SRC, false, true)).toBe('switch-source');
  });

  it('target cup tapped twice switches source (pours like a normal cup)', () => {
    expect(decideSecondTap(TARGET, false, true)).toBe('switch-source');
  });

  it('filled guest cup tapped twice REFUSES source selection', () => {
    expect(decideSecondTap(SNK, false, true)).toBe('reject-sink-source');
  });

  it('empty cup never switches (repeat or not)', () => {
    expect(decideSecondTap(N, true, true)).toBe('invalid-target');
    expect(decideSecondTap(SNK, true, true)).toBe('invalid-target');
    expect(decideSecondTap(N, true, false)).toBe('invalid-target');
  });

  it('first invalid tap is never a switch', () => {
    expect(decideSecondTap(N, false, false)).toBe('invalid-target');
    expect(decideSecondTap(SNK, false, false)).toBe('invalid-target');
    expect(decideSecondTap(SRC, false, false)).toBe('invalid-target');
  });
});

describe('guest-cup UX copy', () => {
  it('pins the exact product hint', () => {
    expect(GUEST_SINK_HINT).toBe('Из чашки гостя нельзя переливать — можно отменить ход.');
  });
});
