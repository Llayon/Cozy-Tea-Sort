/**
 * Choice Brew production generator tests (bank, fast path, guards).
 */
import { describe, expect, it } from 'vitest';
import type { CupConstraint, TeaId } from '../src/game/types';
import {
  CHOICE_BREW_DEPTH_ACCEPT,
  CHOICE_BREW_FALLBACK_TEMPLATE_ID,
  CHOICE_BREW_TEMPLATE_ATTEMPTS,
  CHOICE_BREW_TEMPLATE_BANK,
  instantiateChoiceBrewTemplate,
} from '../src/game/logic/choiceBrewTemplates';
import { isValidChoiceBrewContract } from '../src/game/logic/choiceBrew';
import { generateLevel, validateLevelStructure } from '../src/game/logic/generator';
import { applySolutionState, solvePuzzle } from '../src/game/logic/solver';
import { isPuzzleWonState } from '../src/game/logic/rules';

const PALETTE: TeaId[] = ['matcha', 'sea_buckthorn', 'karkade', 'milk_oolong'];

function req(colors: TeaId[] = PALETTE) {
  return {
    numColors: 4,
    colors: [...colors],
    emptyCups: 2,
    hasMysteryLayer: false,
    phase: 'challenge' as const,
    choiceBrewCount: 1,
  };
}

function constraints(): CupConstraint[] {
  const plain: CupConstraint = { mode: 'normal' };
  return [
    { ...plain },
    { ...plain },
    { ...plain },
    { ...plain },
    { mode: 'normal', capacity: 4, mustEndEmpty: true },
    { ...plain },
  ];
}

describe('choice brew template bank', () => {
  it('has a bounded curated bank with unique ids and frozen topology', () => {
    expect(CHOICE_BREW_TEMPLATE_BANK.length).toBeGreaterThanOrEqual(12);
    expect(CHOICE_BREW_TEMPLATE_BANK.length).toBeLessThanOrEqual(18);
    const ids = CHOICE_BREW_TEMPLATE_BANK.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CHOICE_BREW_FALLBACK_TEMPLATE_ID).toBe('choice-brew-01');
    expect(CHOICE_BREW_TEMPLATE_BANK.some((t) => t.id === CHOICE_BREW_FALLBACK_TEMPLATE_ID)).toBe(true);
    for (const t of CHOICE_BREW_TEMPLATE_BANK) {
      expect(t.brewVesselIndex).toBe(4);
      expect(t.cups.length).toBe(6);
      expect(t.cups.map((c) => c.length)).toEqual([4, 4, 4, 4, 0, 0]);
      expect(t.pairRoles[0]).not.toBe(t.pairRoles[1]);
      expect(t.depth).toBeGreaterThanOrEqual(CHOICE_BREW_DEPTH_ACCEPT.min);
      expect(t.depth).toBeLessThanOrEqual(CHOICE_BREW_DEPTH_ACCEPT.max);
    }
    expect(CHOICE_BREW_TEMPLATE_ATTEMPTS).toBeLessThanOrEqual(6);
  });

  it('covers all six unordered pairs', () => {
    const pairs = new Set(
      CHOICE_BREW_TEMPLATE_BANK.map((t) => [...t.pairRoles].sort().join('+')),
    );
    expect(pairs.size).toBe(6);
  });

  it('every template solves, replays to a win and triggers the milestone (identity order)', () => {
    const order = [...PALETTE].sort();
    for (const t of CHOICE_BREW_TEMPLATE_BANK) {
      const inst = instantiateChoiceBrewTemplate(t, order);
      const cc = constraints();
      const contract = { vesselIndex: 4 as const, allowedTeas: inst.allowedTeas as readonly [TeaId, TeaId] };
      expect(isValidChoiceBrewContract(contract, cc)).toBe(true);
      const full = solvePuzzle(inst.cups, { cupConstraints: cc, choiceBrewContract: contract });
      expect(full.solvable).toBe(true);
      expect(full.minMoves).toBe(t.depth);
      const start = {
        cups: inst.cups.map((c) => [...c]),
        floatingIngredients: inst.cups.map(() => null),
      };
      const end = applySolutionState(start, full.solution ?? [], cc, undefined, contract);
      expect(end).not.toBeNull();
      expect(isPuzzleWonState(end as never, cc, undefined, contract)).toBe(true);
      expect((end?.choiceBrewState?.stage ?? 0)).toBe(1);
    }
  }, 120_000);
});

describe('choice brew generation fast path', () => {
  it('generates a valid contracted level for the canonical palette', () => {
    const lvl = generateLevel(req(), 'cb-gen-1');
    expect(lvl.choiceBrewContract).toBeDefined();
    expect(isValidChoiceBrewContract(lvl.choiceBrewContract ?? null, lvl.cupConstraints)).toBe(true);
    expect(lvl.cups.map((c) => c.length)).toEqual([4, 4, 4, 4, 0, 0]);
    expect(validateLevelStructure(lvl, req())).toEqual({ ok: true, reasons: [] });
    expect(lvl.minMoves).toBeGreaterThanOrEqual(CHOICE_BREW_DEPTH_ACCEPT.min);
    expect(lvl.minMoves).toBeLessThanOrEqual(CHOICE_BREW_DEPTH_ACCEPT.max);
  });

  it('is deterministic for the same seed and varies across seeds', () => {
    const a = generateLevel(req(), 'cb-det-7');
    const b = generateLevel(req(), 'cb-det-7');
    expect(a.cups).toEqual(b.cups);
    expect(a.choiceBrewContract).toEqual(b.choiceBrewContract);
    const seen = new Set([JSON.stringify(a.cups)]);
    for (let i = 0; i < 10; i++) {
      seen.add(JSON.stringify(generateLevel(req(), `cb-det-${i}`).cups));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('survives TeaRole permutation: reversed palette still validates', () => {
    const reversed = [...PALETTE].reverse();
    for (let i = 0; i < 6; i++) {
      const lvl = generateLevel(req(reversed), `cb-perm-${i}`);
      expect(validateLevelStructure(lvl, req(reversed)).ok).toBe(true);
      const r = validateLevelStructure(lvl, req(reversed));
      expect(r.ok).toBe(true);
    }
  });

  it('works with maxRetries 0 (bounded bank, never a scan)', () => {
    const lvl = generateLevel(req(), 'cb-zero', { maxRetries: 0 });
    expect(lvl.choiceBrewContract).toBeDefined();
    expect(validateLevelStructure(lvl, req()).ok).toBe(true);
  });

  it('rejects malformed requests loudly', () => {
    expect(() => generateLevel({ ...req(), choiceBrewCount: 2 }, 'x')).toThrow();
    expect(() => generateLevel({ ...req(), choiceBrewCount: 1, hasMysteryLayer: true }, 'x')).toThrow();
    expect(() =>
      generateLevel({ ...req(), choiceBrewCount: 1, targetTeaIds: ['matcha' as TeaId] }, 'x'),
    ).toThrow();
    expect(() =>
      generateLevel({ ...req(), choiceBrewCount: 1, steepingFlaskCount: 1 }, 'x'),
    ).toThrow();
    expect(() =>
      generateLevel({ ...req(), choiceBrewCount: 1, numColors: 3, colors: ['matcha', 'karkade', 'milk_oolong'] as TeaId[] }, 'x'),
    ).toThrow();
  });

  it('validateLevelStructure requires contract iff requested', () => {
    const lvl = generateLevel(req(), 'cb-struct-1');
    const noContract = { ...lvl, choiceBrewContract: undefined };
    expect(validateLevelStructure(noContract, req()).ok).toBe(false);
    const plainReq = { ...req(), choiceBrewCount: 0 };
    const plain = generateLevel(plainReq, 'cb-struct-plain');
    expect(plain.choiceBrewContract).toBeUndefined();
    expect(validateLevelStructure(plain, plainReq).ok).toBe(true);
  });
});
