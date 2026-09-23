import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TeaSortLogic } from '../src/game/logic/teaSortLogic';

/**
 * GAUNTLET 0.1 — §1 / tests A & B.
 *
 * Root cause: TeaSortView is created once in useEffect([]), but
 * onMoveComplete closed over the mount-time `logic` instance while level
 * changes / reshuffles replace logicRef.current + view.logic. UI move
 * counts and undo availability then came from a dead instance.
 *
 * Fix (src/App.tsx): every view callback needing the gameplay model reads
 * logicRef.current. Pixi lifetime is unchanged (single app).
 */

function wireOnMoveComplete(
  holder: { current: TeaSortLogic | null },
  emit: (moves: number, canUndo: boolean) => void,
): () => void {
  // Mirror of the fixed App wiring: read the CURRENT logic, never a
  // captured instance.
  return () => {
    const activeLogic = holder.current;
    if (!activeLogic) return;
    emit(activeLogic.movesCount, activeLogic.canUndo);
  };
}

const LEVEL_1 = [
  ['matcha', 'karkade'],
  ['sea_buckthorn', 'karkade'],
  [],
] as never;
const LEVEL_2 = [
  ['matcha', 'sea_buckthorn'],
  ['karkade', 'sea_buckthorn'],
  [],
] as never;

describe('stale logic callback after level change (A)', () => {
  it('move-complete values come from the level-2 logic, not level-1', () => {
    const holder: { current: TeaSortLogic | null } = {
      current: new TeaSortLogic(LEVEL_1),
    };
    const emitted: Array<[number, boolean]> = [];
    const onMoveComplete = wireOnMoveComplete(holder, (m, u) => emitted.push([m, u]));

    // Level 1: one move -> (1, true).
    holder.current?.makeMove(0, 1);
    onMoveComplete();
    expect(emitted.at(-1)).toEqual([1, true]);

    // Next level: view reuses Pixi, logic holder is rebound (no re-init).
    holder.current = new TeaSortLogic(LEVEL_2);
    // Two moves on level 2 (level 1 only ever had one).
    holder.current.makeMove(0, 1);
    holder.current.makeMove(1, 2);
    onMoveComplete();
    expect(emitted.at(-1)).toEqual([2, true]);

    // Undo availability also tracks the live instance: drain level-2
    // history completely; level 1 still has history, so `false` proves B.
    holder.current.undo();
    holder.current.undo();
    onMoveComplete();
    expect(emitted.at(-1)).toEqual([0, false]);
  });
});

describe('stale logic callback after reshuffle (B)', () => {
  it('"Другой расклад" rebinds logic: UI reflects the new instance', () => {
    const holder: { current: TeaSortLogic | null } = {
      current: new TeaSortLogic(LEVEL_1),
    };
    const emitted: Array<[number, boolean]> = [];
    const onMoveComplete = wireOnMoveComplete(holder, (m, u) => emitted.push([m, u]));

    holder.current?.makeMove(0, 1);
    onMoveComplete();
    expect(emitted.at(-1)).toEqual([1, true]);

    // Same level number, fresh seed => brand-new instance, zero moves.
    holder.current = new TeaSortLogic(LEVEL_1);
    onMoveComplete();
    expect(emitted.at(-1)).toEqual([0, false]);

    holder.current?.makeMove(0, 1);
    onMoveComplete();
    expect(emitted.at(-1)).toEqual([1, true]);
  });
});

describe('App wiring invariant (source guard)', () => {
  const src = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

  it('onMoveComplete reads logicRef.current, never the mount-time instance', () => {
    expect(src).toContain('const activeLogic = logicRef.current;');
    const block = src.slice(src.indexOf('onMoveComplete'), src.indexOf('onWin:'));
    expect(block).not.toContain('logic.movesCount');
    expect(block).not.toContain('logic.canUndo');
  });
});
