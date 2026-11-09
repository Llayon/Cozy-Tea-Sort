/**
 * G26 Stage 0 — three source-access contracts via G24 preflight (DEV ONLY).
 * Uses ONLY production constants from source (no remembered numbers).
 * Usage: bunx tsx scripts/dev/g26-contract-screen.ts [--json]
 */
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type TeaId,
} from '../../src/game/logic/../types.ts';
import {
  G26_PALETTE,
} from '../../src/game/logic/g26Research.ts';
import {
  analyzeTerminalAllocation,
  type TerminalAllocationProblem,
  type TerminalUnit,
} from '../../src/game/logic/contractPreflight.ts';

function homogeneousOptions(teaIds: readonly TeaId[], capUnits: number): TerminalUnit['options'] {
  const opts: { amounts: Record<string, number>; label?: string }[] = [{ amounts: {}, label: 'empty' }];
  for (const t of teaIds) {
    opts.push({ amounts: { [t]: capUnits } as Record<string, number>, label: `${t}x${capUnits}` });
  }
  return opts as unknown as TerminalUnit['options'];
}

function ordinaryVessel(id: string, teaIds: readonly TeaId[]): TerminalUnit {
  return {
    id,
    kind: 'vessel',
    capacity: STANDARD_CUP_CAPACITY,
    options: homogeneousOptions(teaIds, TEA_UNITS_PER_COLOR),
  };
}

function fixedEmptyVessel(id: string): TerminalUnit {
  return { id, kind: 'vessel', capacity: STANDARD_CUP_CAPACITY, options: [{ amounts: {} }] };
}

function buildBottomDrawProblem(): TerminalAllocationProblem {
  const teaIds = [...G26_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
  const special: TerminalUnit = {
    id: 'special-bottom-draw',
    kind: 'vessel',
    capacity: STANDARD_CUP_CAPACITY,
    options: [{ amounts: {}, label: 'mustEndEmpty' }],
  };
  const units: TerminalUnit[] = [special];
  for (let i = 0; i < 5; i++) units.push(ordinaryVessel(`ordinary-${i}`, teaIds));
  return { teaIds, inventory: inventory as never, units };
}

function buildPairReadyProblem(): TerminalAllocationProblem {
  const teaIds = [...G26_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
  const special: TerminalUnit = {
    id: 'special-pair-ready',
    kind: 'vessel',
    capacity: STANDARD_CUP_CAPACITY,
    options: [{ amounts: {}, label: 'mustEndEmpty' }],
  };
  const units: TerminalUnit[] = [special];
  for (let i = 0; i < 5; i++) units.push(ordinaryVessel(`ordinary-${i}`, teaIds));
  return { teaIds, inventory: inventory as never, units };
}

function buildLinkedGateProblem(): TerminalAllocationProblem {
  const teaIds = [...G26_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
  // S fixed empty (mustEndEmpty), V ordinary normal finality.
  const s: TerminalUnit = {
    id: 'special-linked-source',
    kind: 'vessel',
    capacity: STANDARD_CUP_CAPACITY,
    options: [{ amounts: {}, label: 'mustEndEmpty' }],
  };
  const units: TerminalUnit[] = [s];
  for (let i = 0; i < 5; i++) units.push(ordinaryVessel(`ordinary-${i}`, teaIds));
  return { teaIds, inventory: inventory as never, units };
}

const cases: Array<{ name: string; problem: TerminalAllocationProblem; expected: 'AlgebraicallyFeasible' }> = [
  { name: 'bottom-draw', problem: buildBottomDrawProblem(), expected: 'AlgebraicallyFeasible' },
  { name: 'pair-ready', problem: buildPairReadyProblem(), expected: 'AlgebraicallyFeasible' },
  { name: 'linked-gate', problem: buildLinkedGateProblem(), expected: 'AlgebraicallyFeasible' },
];

const json = process.argv.includes('--json');
const results: Record<string, unknown> = {};
for (const c of cases) {
  const r = analyzeTerminalAllocation(c.problem);
  results[c.name] = {
    verdict: r.verdict,
    expected: c.expected,
    pass: r.verdict === c.expected,
    exploredStates: r.exploredStates,
    reason: r.reason ?? null,
    reasonCode: r.diagnostic.reasonCode,
    witness: r.witness ?? null,
  };
  if (!json) {
    console.log(`${c.name}: ${r.verdict} (expected ${c.expected}) states=${r.exploredStates} code=${r.diagnostic.reasonCode}`);
    if (r.witness) {
      for (const a of r.witness.assignments) {
        console.log(`  ${a.unitId} [${a.unitKind}] opt#${a.optionIndex} ${a.optionLabel ?? ''} ${JSON.stringify(a.amounts)}`);
      }
    }
  }
}
if (json) console.log(JSON.stringify({ constants: { TEA_UNITS_PER_COLOR, STANDARD_CUP_CAPACITY }, results }, null, 2));
let fail = 0;
for (const c of cases) {
  const r = results[c.name] as { pass: boolean };
  if (!r.pass) fail++;
}
if (fail > 0) {
  console.error(`\nG26 Stage 0 FAIL: ${fail} mismatch(es)`);
  process.exit(1);
} else if (!json) {
  console.log('\nG26 Stage 0: all 3 contracts AlgebraicallyFeasible as expected');
}
