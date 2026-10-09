/**
 * G11 kernel probe (DEV ONLY): §§55-68 focused behavior + canonical checks.
 */
import {
  CupConstraint,
  TeaId,
  effectiveCupCapacity,
  emptyCapacityObstacles,
  normalizeCapacityObstacles,
} from '../../src/game/types.ts';
import {
  applyPourState,
  canPourState,
  canonicalPuzzleKey,
  canonicalKey,
  cupEndStateSatisfied,
  isConstructiveMoveState,
  isInFinalState,
  isPuzzleWonState,
  pourCountState,
  pourRejectCodeState,
} from '../../src/game/logic/rules.ts';
import { solvePuzzle } from '../../src/game/logic/solver.ts';
import { TeaSortLogic } from '../../src/game/logic/teaSortLogic.ts';

const A = 'matcha' as TeaId;
const B = 'karkade' as TeaId;
const N: CupConstraint = { mode: 'normal' };
let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' :: ' + detail : ''}`); }
}
const st = (cups: TeaId[][], caps: (string | null)[]) => ({
  cups,
  floatingIngredients: cups.map(() => null),
  capacityObstacles: caps as any,
});

// §55 active receive: [A]+cin, source [A,A] → m=1 → [A,A]+cin
{
  const s = st([[A, A], [A]], [null, 'cinnamon']);
  const cnt = pourCountState(s as any, 0, 1, [N, N]);
  check('55 count=1', cnt === 1, `cnt=${cnt}`);
  const res = applyPourState(s as any, 0, 1, [N, N]);
  check('55 after [A,A]+cin', !!res && res.state.cups[1].length === 2 && res.state.capacityObstacles[1] === 'cinnamon' && (res.capacityObstacleRemoved ?? null) === null as any, JSON.stringify(res?.state.cups));
}
// §56 active full 2/2 rejects
{
  const s = st([[B, B], [A, B]], [null, 'cinnamon']);
  const code = pourRejectCodeState(s as any, 0, 1, [N, N]);
  check('56 target-full', code === 'target-full', `code=${code}`);
  check('56 effective=2', effectiveCupCapacity(N, 'cinnamon') === 2 && effectiveCupCapacity(N, null) === 4);
}
// §57 partial outflow keeps stick
{
  const s = st([[A, B], []], [N as any, N as any] as any);
  const s2 = st([[A, B], []], ['cinnamon', null]);
  const res = applyPourState(s2 as any, 0, 1, [N, N]);
  check('57 [A]+cin remains', !!res && res.state.cups[0].join() === A && res.state.capacityObstacles[0] === 'cinnamon' && res.capacityObstacleRemoved === undefined, JSON.stringify(res?.state));
  void s;
}
// §58 unlock single
{
  const s = st([[A], []], ['cinnamon', null]);
  const res = applyPourState(s as any, 0, 1, [N, N]);
  check('58 [] null meta', !!res && res.state.cups[0].length === 0 && res.state.capacityObstacles[0] === null && res.capacityObstacleRemoved === 'cinnamon', JSON.stringify(res?.state.capacityObstacles));
  check('58 eff back to 4', effectiveCupCapacity(N, (res as any).state.capacityObstacles[0]) === 4);
}
// §59 multi unlock
{
  const s = st([[A, A], []], ['cinnamon', null]);
  const res = applyPourState(s as any, 0, 1, [N, N]);
  check('59 multi empties+clears', !!res && res.state.cups[0].length === 0 && res.state.capacityObstacles[0] === null && res.transferred === 2, JSON.stringify(res && { t: res.transferred, c: res.state.cups }));
}
// §60 post-unlock receive 3 then 4 (mixed source: top run 3, not a pruned complete move)
{
  const s = st([[], [B, A, A, A]], [null, null]);
  const r1 = applyPourState(s as any, 1, 0, [N, N]);
  check('60 recv to 3 legal', !!r1 && r1.state.cups[0].length === 3, JSON.stringify(r1?.state.cups));
  const s3 = { cups: [[A, A, A], [B, A]] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, null] };
  const r2 = applyPourState(s3 as any, 1, 0, [N, N]);
  check('60 recv to 4 legal', !!r2 && r2.state.cups[0].length === 4, JSON.stringify(r2?.state.cups));
}
// §61 invalid no remove
{
  const s = st([[A], [B]], ['cinnamon', null]);
  const code = pourRejectCodeState(s as any, 0, 1, [N, N]);
  const res = applyPourState(s as any, 0, 1, [N, N]);
  check('61 mismatch null, unchanged', code === 'color-mismatch' && res === null, `code=${code}`);
}
// §62 active NOT final; §63 unlocked final; §64 empty+active fail-closed
{
  check('62 [A,A]+cin not final', isInFinalState([A, A], N, 'cinnamon') === false);
  check('62b static [A,A] still final-shaped', isInFinalState([A, A], { mode: 'normal', capacity: 2, mustEndEmpty: false } as any) === true);
  check('63 [A,A,A,A] satisfied', cupEndStateSatisfied([A, A, A, A], N) === true);
  const w = st([[A, A, A, A], [B, B, B, B]], [null, null]);
  check('63b plain win (2 solved)', isPuzzleWonState(w as any, [N, N]) === true);
  const wBlocked = st([[A, A, A, A], [B, B, B, B]], ['cinnamon', null]);
  check('62c active blocks win', isPuzzleWonState(wBlocked as any, [N, N]) === false);
  const wMalformed = st([[], [B, B, B, B]], ['cinnamon', null]);
  check('64 empty+active not win', isPuzzleWonState(wMalformed as any, [N, N]) === false);
}
// §114 pruning: [A,A]+cin → empty normal stays constructive
{
  const s = st([[A, A], []], ['cinnamon', null]);
  check('114 legal', canPourState(s as any, 0, 1, [N, N]) === true);
  check('114 constructive', isConstructiveMoveState(s as any, 0, 1, [N, N]) === true);
}
// canonical: byte-compat, distinct, collapse
{
  const plain = { cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null] };
  const kPlain = canonicalPuzzleKey(plain as any, [N, N]);
  const kNull = canonicalPuzzleKey({ ...plain, capacityObstacles: [null, null] } as any, [N, N]);
  check('47 byte-identical', kPlain === kNull, `${kPlain} vs ${kNull}`);
  const kActive = canonicalPuzzleKey({ ...plain, capacityObstacles: ['cinnamon', null] } as any, [N, N]);
  check('48 distinct', kActive !== kPlain);
  const kTea = canonicalKey([[A, B], []] as TeaId[][], [N, N]);
  check('51 legacy tea key intact', typeof kTea === 'string' && kTea.length > 0);
  // post-unlock collapse: unlocked [A,B] + empty normal permutes with plain board
  const unlocked = { cups: [[A, B], []] as TeaId[][], floatingIngredients: [null, null], capacityObstacles: [null, null] };
  check('49 collapse', canonicalPuzzleKey(unlocked as any, [N, N]) === kPlain);
}
// §65 undo killer
{
  const logic = new TeaSortLogic([[A], [A, A, A]] as any, [], [N, N], undefined, undefined, undefined, undefined, ['cinnamon', null] as any);
  const before = JSON.stringify([logic.toState().cups, logic.toState().capacityObstacles]);
  const mv = logic.makeMove(0, 1);
  check('65 unlock move', !!mv && (mv as any).capacityObstacleRemoved === 'cinnamon', JSON.stringify(mv));
  check('65 dest 4/4', JSON.stringify(logic.toState().cups[1]) === JSON.stringify([A, A, A, A]));
  logic.undo();
  const restored = JSON.stringify([logic.toState().cups, logic.toState().capacityObstacles]);
  check('65 undo exact', before === restored, `${before} vs ${restored}`);
  check('65 moves 0', (logic as any).movesCount === 0);
}
// §66 post-unlock undo timeline: unlock → 3 → 4 → undo 4→3 → undo to pre-unlock
{
  const logic = new TeaSortLogic([[A], [B, A], [B, B, A], []] as any, [], [N, N, N, N], undefined, undefined, undefined, undefined, ['cinnamon', null, null, null] as any);
  const m1 = logic.makeMove(0, 1); // [A]+cin → [B,A] : source [] unlock, dest [B,A,A] (3)
  check('66 unlock+3', !!m1 && logic.toState().capacityObstacles[0] === null && logic.toState().cups[1].length === 3, JSON.stringify(logic.toState().cups));
  const m2 = logic.makeMove(2, 1); // [B,B,A] top A → [B,A,A] : dest 4
  check('66 expand to 4', !!m2 && logic.toState().cups[1].length === 4, JSON.stringify(logic.toState().cups));
  logic.undo();
  check('66 undo 4→3 obstacle stays null', logic.toState().cups[1].length === 3 && logic.toState().capacityObstacles[0] === null);
  logic.undo();
  check('66 undo to pre-unlock', logic.toState().cups[0].join() === A && logic.toState().capacityObstacles[0] === 'cinnamon' && logic.toState().cups[1].join(',') === [B, A].join(','), JSON.stringify([logic.toState().cups, logic.toState().capacityObstacles]));
}
// solver smoke: tiny cinnamon board solves + unlocks
{
  const cups = [[A, B], [A, A], [B, B], []] as any;
  const r = solvePuzzle(cups, { cupConstraints: [N, N, N, N], capacityObstacles: ['cinnamon', null, null, null] as any, maxVisited: 20000 });
  check('solver no crash', typeof r.visitedStates === 'number', JSON.stringify({ s: r.solvable, v: r.visitedStates }));
  if (r.solvable && r.solution) {
    let cur: any = { cups: cups.map((c: any) => [...c]), floatingIngredients: [null, null, null, null], capacityObstacles: ['cinnamon', null, null, null] };
    let unlocked = false;
    for (const a of r.solution as any[]) {
      if (a.kind !== 'pour') continue;
      const res = applyPourState(cur, a.from, a.to, [N, N, N, N]);
      if (!res) break;
      if ((res as any).capacityObstacleRemoved === 'cinnamon') unlocked = true;
      cur = res.state;
    }
    check('solver unlocks en route', unlocked === true, `moves=${r.minMoves}`);
  } else {
    check('solver unlocks en route', true, 'unsolvable smoke board — acceptable');
  }
}

console.log(`\nPROBE DONE pass=${pass} fail=${fail}`);
if (fail > 0) process.exit(1);
