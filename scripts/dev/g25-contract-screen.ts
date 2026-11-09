/**
 * G25 Stage A — five mathematical contracts via G24 preflight (DEV ONLY).
 * Uses ONLY production constants from source (no remembered numbers).
 * Usage: bunx tsx scripts/dev/g25-contract-screen.ts [--json]
 */
import {
  STANDARD_CUP_CAPACITY,
  TEA_UNITS_PER_COLOR,
  type TeaId,
} from '../../src/game/types.ts';
import { TEA_PAIR_MEMBER_CAPACITY } from '../../src/game/logic/teaPair.ts';
import {
  G25_MIRROR_A,
  G25_MIRROR_B,
  G25_PALETTE,
} from '../../src/game/logic/g25Research.ts';
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

function buildMirrorProblem(striped: boolean): TerminalAllocationProblem {
  const teaIds = [...G25_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
  const A = G25_MIRROR_A;
  const B = G25_MIRROR_B;
  const label = striped ? `[${A},${B},${A},${B}]+[${B},${A},${B},${A}]` : `[${A},${A},${B},${B}]+[${B},${B},${A},${A}]`;
  const group: TerminalUnit = {
    id: 'group-mirror',
    kind: 'group',
    members: ['cup-4', 'cup-5'],
    capacity: STANDARD_CUP_CAPACITY * 2,
    options: [{ amounts: { [A]: TEA_UNITS_PER_COLOR, [B]: TEA_UNITS_PER_COLOR } as never, label }],
  };
  return {
    teaIds,
    inventory: inventory as never,
    units: [group, ordinaryVessel('ordinary-0', teaIds), ordinaryVessel('ordinary-1', teaIds), fixedEmptyVessel('empty-0'), fixedEmptyVessel('empty-1')],
  };
}

function buildToolProblem(kind: 'metered' | 'measuring'): TerminalAllocationProblem {
  const teaIds = [...G25_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
  const special: TerminalUnit = {
    id: kind === 'metered' ? 'special-metered-pourer' : 'special-measuring-bowl',
    kind: 'vessel',
    capacity: STANDARD_CUP_CAPACITY,
    options: [{ amounts: {}, label: 'mustEndEmpty' }],
  };
  const units: TerminalUnit[] = [special];
  for (let i = 0; i < 5; i++) units.push(ordinaryVessel(`ordinary-${i}`, teaIds));
  return { teaIds, inventory: inventory as never, units };
}

function buildSplitProblem(): TerminalAllocationProblem {
  const teaIds = [...G25_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = TEA_UNITS_PER_COLOR;
  const A: TeaId = 'matcha';
  const group: TerminalUnit = {
    id: 'group-split-service',
    kind: 'group',
    members: ['cup-0', 'cup-1'],
    capacity: TEA_PAIR_MEMBER_CAPACITY * 2,
    options: [{ amounts: { [A]: TEA_UNITS_PER_COLOR } as never, label: `[${A},${A}]+[${A},${A}]` }],
  };
  const units: TerminalUnit[] = [group];
  for (let i = 0; i < 3; i++) units.push(ordinaryVessel(`ordinary-${i}`, teaIds));
  return { teaIds, inventory: inventory as never, units };
}

const cases: Array<{ name: string; problem: TerminalAllocationProblem; expected: 'AlgebraicallyFeasible' }> = [
  { name: 'mirror-pair', problem: buildMirrorProblem(false), expected: 'AlgebraicallyFeasible' },
  { name: 'striped-pair', problem: buildStripedProblem(), expected: 'AlgebraicallyFeasible' },
  { name: 'metered-pourer', problem: buildToolProblem('metered'), expected: 'AlgebraicallyFeasible' },
  { name: 'measuring-bowl', problem: buildToolProblem('measuring'), expected: 'AlgebraicallyFeasible' },
  { name: 'split-service', problem: buildSplitProblem(), expected: 'AlgebraicallyFeasible' },
];

function buildStripedProblem(): TerminalAllocationProblem {
  return buildMirrorProblem(true);
}

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
if (json) console.log(JSON.stringify({ constants: { TEA_UNITS_PER_COLOR, STANDARD_CUP_CAPACITY, TEA_PAIR_MEMBER_CAPACITY }, results }, null, 2));
let fail = 0;
for (const c of cases) {
  const r = results[c.name] as { pass: boolean };
  if (!r.pass) fail++;
}
if (fail > 0) {
  console.error(`\nG25 Stage A FAIL: ${fail} mismatch(es)`);
  process.exit(1);
} else if (!json) {
  console.log('\nG25 Stage A: all 5 contracts AlgebraicallyFeasible as expected');
}
