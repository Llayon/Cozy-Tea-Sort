/**
 * Gauntlet 6 §32-47 — strainer view/UX regression via pure helpers only
 * (no Pixi Application, no CupView construction; game rules stay in
 * rules.ts, TeaSortView only maps codes to copy + tool-mode intent).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  canPlaceStrainerState,
  canReleaseStrainerState,
  placeStrainerRejectCodeState,
  pourRejectCodeState,
  releaseStrainerRejectCodeState,
} from '../src/game/logic/rules';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';
import {
  STRAINER_EMPTY_HINT,
  STRAINER_GENERIC_PLACE_HINT,
  STRAINER_GENERIC_RELEASE_HINT,
  STRAINER_LEMON_CONFLICT_HINT,
  STRAINER_LOADED_HINT,
  STRAINER_NEEDS_TWO_HINT,
  STRAINER_NO_TOOL_HINT,
  STRAINER_SAME_HOST_HINT,
  STRAINER_SINK_HOST_HINT,
  STRAINER_TARGET_EMPTY_HINT,
  STRAINER_TEAPOT_HINT,
  STRAINER_WRONG_COLOR_HINT,
  fullVesselHint,
  shouldExitToolModeOnTeaSelect,
  strainedPourHint,
  strainerPlaceHint,
  strainerPlaceTransitPlan,
  strainerReleaseHint,
  strainerToolModeForStandTap,
} from '../src/game/view/TeaSortView';

const M: TeaId = 'matcha';
const K: TeaId = 'karkade';
const N: CupConstraint = { mode: 'normal' };
const SRC: CupConstraint = { mode: 'source-only' };
const SNK: CupConstraint = { mode: 'sink-only' };
const TASTING: CupConstraint = { mode: 'normal', capacity: 2, mustEndEmpty: true };

describe('strainer place hints cover every reject code', () => {
  it('ok yields no hint; every rejection maps to its exact copy', () => {
    expect(strainerPlaceHint('ok')).toBe('');
    expect(strainerPlaceHint('no-strainer')).toBe(STRAINER_NO_TOOL_HINT);
    expect(strainerPlaceHint('strainer-loaded')).toBe(STRAINER_LOADED_HINT);
    expect(strainerPlaceHint('out-of-range')).toBe(STRAINER_GENERIC_PLACE_HINT);
    expect(strainerPlaceHint('target-empty')).toBe(STRAINER_TARGET_EMPTY_HINT);
    expect(strainerPlaceHint('target-sink-only')).toBe(STRAINER_SINK_HOST_HINT);
    expect(strainerPlaceHint('same-host')).toBe(STRAINER_SAME_HOST_HINT);
    expect(strainerPlaceHint('target-floating-occupied-by-tool-conflict')).toBe(
      STRAINER_LEMON_CONFLICT_HINT,
    );
  });

  it('place reject codes agree with the rule table', () => {
    const cups: TeaId[][] = [[M, M], [K]];
    const stand = { present: true, attachedCupIndex: null, heldTea: null };
    expect(placeStrainerRejectCodeState({ cups, floatingIngredients: [null, null], strainer: stand }, 0, [N, N])).toBe(
      'ok',
    );
    expect(placeStrainerRejectCodeState({ cups, floatingIngredients: [null, null], strainer: stand }, 1, [N, N])).toBe(
      'ok',
    );
    // Empty vessel cannot host.
    expect(
      placeStrainerRejectCodeState(
        { cups: [[M], []], floatingIngredients: [null, null], strainer: stand },
        1,
        [N, N],
      ),
    ).toBe('target-empty');
    // Loaded tool cannot place again.
    expect(
      placeStrainerRejectCodeState(
        { cups, floatingIngredients: [null, null], strainer: { present: true, attachedCupIndex: null, heldTea: M } },
        0,
        [N, N],
      ),
    ).toBe('strainer-loaded');
  });
});

describe('strainer release hints cover every reject code', () => {
  it('ok yields no hint; color/teapot/full map to their exact copies', () => {
    expect(strainerReleaseHint('ok')).toBe('');
    expect(strainerReleaseHint('no-strainer')).toBe(STRAINER_NO_TOOL_HINT);
    expect(strainerReleaseHint('strainer-empty')).toBe(STRAINER_EMPTY_HINT);
    expect(strainerReleaseHint('out-of-range')).toBe(STRAINER_GENERIC_RELEASE_HINT);
    expect(strainerReleaseHint('color-mismatch')).toBe(STRAINER_WRONG_COLOR_HINT);
    expect(strainerReleaseHint('target-source-only')).toBe(STRAINER_TEAPOT_HINT);
    // Full delegates to the capacity-aware vessel copy (4/4 vs 2/2).
    expect(strainerReleaseHint('target-full', N)).toBe(fullVesselHint(N));
    expect(strainerReleaseHint('target-full', TASTING)).toBe(fullVesselHint(TASTING));
    expect(strainerReleaseHint('target-full', N)).toBe(
      'Стакан полон (4/4)! Выберите другой сосуд или пустой стакан.',
    );
    expect(strainerReleaseHint('target-full', TASTING)).toBe(
      'Пиала заполнена (2/2)! Выберите другой сосуд или пустой стакан.',
    );
  });

  it('release reject codes agree with the rule table', () => {
    const loaded = { present: true, attachedCupIndex: null, heldTea: M as TeaId | null };
    // Empty destination accepts.
    expect(
      releaseStrainerRejectCodeState(
        { cups: [[K], []], floatingIngredients: [null, null], strainer: loaded },
        1,
        [N, N],
      ),
    ).toBe('ok');
    // Same-color top accepts; wrong color rejects with the wrong-color copy.
    expect(
      releaseStrainerRejectCodeState(
        { cups: [[M], [M]], floatingIngredients: [null, null], strainer: loaded },
        1,
        [N, N],
      ),
    ).toBe('ok');
    expect(
      releaseStrainerRejectCodeState(
        { cups: [[M], [K]], floatingIngredients: [null, null], strainer: loaded },
        1,
        [N, N],
      ),
    ).toBe('color-mismatch');
    expect(strainerReleaseHint('color-mismatch')).toBe(STRAINER_WRONG_COLOR_HINT);
    // Teapot never receives.
    expect(
      releaseStrainerRejectCodeState(
        { cups: [[M], [K]], floatingIngredients: [null, null], strainer: loaded },
        1,
        [N, SRC],
      ),
    ).toBe('target-source-only');
    // Full vessel rejects.
    expect(
      releaseStrainerRejectCodeState(
        {
          cups: [[M], [K, K, K, K]],
          floatingIngredients: [null, null],
          strainer: loaded,
        },
        1,
        [N, N],
      ),
    ).toBe('target-full');
  });
});

describe('strained pour hints', () => {
  it('attached single-layer pours need two layers; loaded+attached fails closed', () => {
    expect(strainedPourHint('ok')).toBe('');
    expect(strainedPourHint('strainer-needs-two-layers')).toBe(STRAINER_NEEDS_TWO_HINT);
    expect(strainedPourHint('strainer-loaded')).toBe(STRAINER_LOADED_HINT);
    // Non-strainer pour codes carry no strainer copy.
    expect(strainedPourHint('color-mismatch')).toBe('');
  });

  it('rule table gates attached single-layer pours', () => {
    const attached = { present: true, attachedCupIndex: 0, heldTea: null };
    // Single top layer while attached -> needs-two (tool stays attached).
    expect(
      pourRejectCodeState(
        { cups: [[M], []], floatingIngredients: [null, null], strainer: attached },
        0,
        1,
        [N, N],
      ),
    ).toBe('strainer-needs-two-layers');
    // Two-layer top run while attached -> legal strained pour.
    expect(
      pourRejectCodeState(
        { cups: [[M, M], []], floatingIngredients: [null, null], strainer: attached },
        0,
        1,
        [N, N],
      ),
    ).toBe('ok');
  });
});

describe('strainer tool-mode transitions (presentation-only intent)', () => {
  it('stand taps toggle place (empty) vs release (loaded)', () => {
    expect(strainerToolModeForStandTap(null, 'off')).toBe('place');
    expect(strainerToolModeForStandTap(null, 'place')).toBe('off');
    expect(strainerToolModeForStandTap(M, 'off')).toBe('release');
    expect(strainerToolModeForStandTap(M, 'release')).toBe('off');
    // Cross toggles document the pure toggle (mode never mirrors logic).
    expect(strainerToolModeForStandTap(null, 'release')).toBe('place');
    expect(strainerToolModeForStandTap(M, 'place')).toBe('release');
  });

  it('tea-source selection always exits an active tool mode', () => {
    expect(shouldExitToolModeOnTeaSelect('off')).toBe(false);
    expect(shouldExitToolModeOnTeaSelect('place')).toBe(true);
    expect(shouldExitToolModeOnTeaSelect('release')).toBe(true);
  });

  it('cup taps in tool mode never mutate logic by themselves', () => {
    const logic = new TeaSortLogic([[M, M], [K, K]], [0, 0], [N, N], [null, null], {
      present: true,
      attachedCupIndex: null,
      heldTea: null,
    });
    const before = logic.strainerState;
    // Pure rule reads: both non-empty cups are legal hosts, no mutation.
    expect(canPlaceStrainerState({ cups: [[M, M], [K, K]], floatingIngredients: [null, null], strainer: before }, 0, [N, N])).toBe(
      true,
    );
    expect(canPlaceStrainerState({ cups: [[M, M], [K, K]], floatingIngredients: [null, null], strainer: before }, 1, [N, N])).toBe(
      true,
    );
    expect(logic.strainerState).toEqual(before);
    expect(logic.strainerState.attachedCupIndex).toBe(null);
    // Loaded-on-stand reads likewise without mutation.
    const loaded = new TeaSortLogic([[M], []], [0, 0], [N, N], [null, null], {
      present: true,
      attachedCupIndex: null,
      heldTea: M,
    });
    const heldBefore = loaded.strainerState;
    expect(
      canReleaseStrainerState({ cups: [[M], []], floatingIngredients: [null, null], strainer: heldBefore }, 1, [N, N]),
    ).toBe(true);
    expect(loaded.strainerState).toEqual(heldBefore);
  });
});

describe('no duplicate truth: logic.strainerState is the only tool state', () => {
  it('place/release round-trips through logic alone (no view fields needed)', () => {
    const logic = new TeaSortLogic([[M, M], []], [0, 0], [N, N], [null, null], {
      present: true,
      attachedCupIndex: null,
      heldTea: null,
    });
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: null, heldTea: null });
    expect(logic.placeStrainer(0)).not.toBeNull();
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: 0, heldTea: null });
    // View intent (toolMode) lives outside logic: selecting a tea source
    // exits the mode, but the attached tool stays until a real strained pour.
    expect(shouldExitToolModeOnTeaSelect('place')).toBe(true);
    expect(logic.strainerState.attachedCupIndex).toBe(0);
  });

  it('G6.1 relocation starts at the CURRENT host rim, never the stand', () => {
    // Stand placement: flight anchor is the stand, nothing is hidden.
    expect(strainerPlaceTransitPlan(null)).toEqual({ fromStand: true, suppressCupIndex: null });
    // Relocation A → B: the flight anchor is A's rim (fromStand false),
    // never the stand — the animation must fly A → B, not stand → B.
    expect(strainerPlaceTransitPlan(0)).toEqual({ fromStand: false, suppressCupIndex: 0 });
    expect(strainerPlaceTransitPlan(3)).toEqual({ fromStand: false, suppressCupIndex: 3 });
  });

  it('G6.1 exactly one mesh is visible mid-relocation (old host suppressed)', () => {
    // The plan names exactly one cup to suppress — the animation hides
    // precisely that static marker before the flight. Refresh on failure
    // restores it (logic untouched until landing); on success the marker
    // moves to the new host. No plan ever names two cups or the stand.
    const plan = strainerPlaceTransitPlan(0);
    expect(plan.suppressCupIndex).toBe(0);
    expect(plan.fromStand).toBe(false);
    const fromStand = strainerPlaceTransitPlan(null);
    expect(fromStand.suppressCupIndex).toBeNull();
    // Logic round-trip: relocation keeps a single attached truth A → B.
    const logic = new TeaSortLogic([[M, M], [K, K], []], [0, 0, 0], [N, N, N], [null, null, null], {
      present: true,
      attachedCupIndex: null,
      heldTea: null,
    });
    expect(logic.placeStrainer(0)).not.toBeNull();
    expect(logic.placeStrainer(1)).not.toBeNull();
    expect(logic.strainerState).toEqual({ present: true, attachedCupIndex: 1, heldTea: null });
    expect(logic.movesCount).toBe(0);
  });

  it('guest cups and teapots keep their host rules (no view duplication)', () => {
    const cups: TeaId[][] = [[M, M], []];
    const stand = { present: true, attachedCupIndex: null, heldTea: null };
    // Guest cup can never host the tool.
    expect(
      canPlaceStrainerState({ cups, floatingIngredients: [null, null], strainer: stand }, 1, [N, SNK]),
    ).toBe(false);
    expect(strainerPlaceHint('target-sink-only')).toBe(STRAINER_SINK_HOST_HINT);
    // Full-vessel copy stays capacity-aware through the release path.
    expect(fullVesselHint(N)).toContain('4/4');
    expect(fullVesselHint(TASTING)).toContain('2/2');
    expect(SNK).toBeDefined();
  });
});
