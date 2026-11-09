/**
 * G27 contract/conservation screen (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g27-contract-screen.ts [--json]
 *
 * Screens the three frozen G27 topologies through the authoritative G24
 * terminal-allocation preflight. Routing never changes terminal tea
 * allocation, so A/B/C must all read AlgebraicallyFeasible.
 */
import { analyzeTerminalAllocation } from '../../src/game/logic/contractPreflight.ts';
import type { TeaId } from '../../src/game/types.ts';
import { G27_PALETTE } from '../../src/game/logic/g27Research.ts';

declare const process: { argv: string[]; exitCode?: number };

function buildProblem(emptyCount: number): {
  teaIds: readonly TeaId[];
  inventory: Record<string, number>;
  units: Array<{ id: string; capacity: number; options: Array<{ amounts: Record<string, number>; label: string }> }>;
} {
  const teaIds = [...G27_PALETTE];
  const inventory: Record<string, number> = {};
  for (const t of teaIds) inventory[t] = 4;
  const units: Array<{
    id: string;
    capacity: number;
    options: Array<{ amounts: Record<string, number>; label: string }>;
  }> = [];
  for (let v = 0; v < 4; v++) {
    units.push({
      id: `terminal-${v}`,
      capacity: 4,
      options: teaIds.map((t) => ({ amounts: { [t]: 4 }, label: `full-${t}` })),
    });
  }
  for (let e = 0; e < emptyCount; e++) {
    units.push({ id: `empty-${e}`, capacity: 4, options: [{ amounts: {}, label: 'empty' }] });
  }
  return { teaIds, inventory, units };
}

const specs = [
  { candidate: 'tea-bridge (A)', vessels: 7, empties: 3 },
  { candidate: 'one-way (B)', vessels: 7, empties: 3 },
  { candidate: 'two-lane (C)', vessels: 8, empties: 4 },
] as const;

let failed = 0;
const rows = [];
for (const spec of specs) {
  const problem = buildProblem(spec.empties);
  const result = analyzeTerminalAllocation({
    teaIds: problem.teaIds,
    inventory: problem.inventory as never,
    units: problem.units as never,
  });
  const pass = result.verdict === 'AlgebraicallyFeasible';
  if (!pass) failed++;
  rows.push({
    candidate: spec.candidate,
    vessels: spec.vessels,
    empties: spec.empties,
    verdict: result.verdict,
    exploredStates: result.exploredStates,
    pass,
  });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows }, null, 2));
} else {
  for (const r of rows) {
    console.log(`${r.candidate}: vessels=${r.vessels} empties=${r.empties} verdict=${r.verdict} explored=${r.exploredStates} ${r.pass ? 'PASS' : 'FAIL'}`);
  }
}
if (failed > 0) process.exitCode = 1;
