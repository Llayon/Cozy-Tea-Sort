/**
 * G29 contract/conservation screen (DEV ONLY).
 * Usage: bunx tsx scripts/dev/g29-contract-screen.ts [--json]
 *
 * All three candidates share one topology: 6 vessels, 4 terminal flex
 * vessels (cap4 ordinary finality), 1 special cap4 mustEndEmpty, 1 ordinary
 * empty. Compatibility relaxations never change terminal tea allocation,
 * so A/B/C must all read AlgebraicallyFeasible.
 */
import { analyzeTerminalAllocation } from '../../src/game/logic/contractPreflight.ts';
import type { TeaId } from '../../src/game/types.ts';
import { G29_PALETTE } from '../../src/game/logic/g29Research.ts';

declare const process: { argv: string[]; exitCode?: number };

const teaIds = [...G29_PALETTE];
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
units.push({ id: 'special-empty', capacity: 4, options: [{ amounts: {}, label: 'empty' }] });
units.push({ id: 'ordinary-empty', capacity: 4, options: [{ amounts: {}, label: 'empty' }] });

const candidates = ['mixed-buffer (A)', 'two-tea-buffer (B)', 'different-tea-buffer (C)'] as const;
let failed = 0;
const rows = [];
for (const candidate of candidates) {
  const result = analyzeTerminalAllocation({
    teaIds: teaIds as TeaId[],
    inventory: inventory as never,
    units: units as never,
  });
  const pass = result.verdict === 'AlgebraicallyFeasible';
  if (!pass) failed++;
  rows.push({ candidate, verdict: result.verdict, exploredStates: result.exploredStates, pass });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ rows }, null, 2));
} else {
  for (const r of rows) console.log(`${r.candidate}: verdict=${r.verdict} explored=${r.exploredStates} ${r.pass ? 'PASS' : 'FAIL'}`);
}
if (failed > 0) process.exitCode = 1;
