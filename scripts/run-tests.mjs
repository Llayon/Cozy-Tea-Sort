/**
 * Canonical test gate (`bun run test`).
 *
 * Suite shape: sequential batches (one vitest process each). A single
 * 20-file parallel run deterministically trips vitest's own worker RPC
 * (`Timeout calling "onTaskUpdate"` after all tests pass) under this
 * suite's BFS CPU load; smaller runs are always clean — so batches exist
 * for infrastructure isolation, never to weaken assertions.
 *
 * Honesty rules (fail-fast, no masking):
 * - startup validates discovery: every tests/**.test.ts must be assigned
 *   exactly once; unassigned/duplicated/missing files abort BEFORE running;
 * - a failed batch is retried at most once, and ONLY when the output
 *   carries the exact known RPC signature with ZERO real-failure evidence
 *   (no FAIL lines, no failed counts, no AssertionError, no non-RPC
 *   unhandled error). Mixed/unknown failures never retry.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyFailure,
  discoverTests,
  validateAssignments,
} from './test-runner-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const batches = [
  {
    name: 'base suite (14 files)',
    files: [
      'tests/rules.test.ts',
      'tests/solver.test.ts',
      'tests/undo.test.ts',
      'tests/rng.test.ts',
      'tests/progression.test.ts',
      'tests/progression-guards.test.ts',
      'tests/storage.test.ts',
      'tests/rewards.test.ts',
      'tests/stale-level-regression.test.ts',
      'tests/stale-logic-callback.test.ts',
      'tests/mystery.test.ts',
      'tests/difficulty.test.ts',
      'tests/generation-contract.test.ts',
      'tests/teapot.test.ts',
    ],
  },
  {
    name: 'base generator + teapot stress',
    files: ['tests/generator.test.ts', 'tests/teapot-stress.test.ts'],
  },
  { name: 'target matrix', files: ['tests/target.test.ts'] },
  { name: 'target templates + fast path', files: ['tests/target-templates.test.ts', 'tests/target-fastpath.test.ts'] },
  { name: 'test runner self-checks', files: ['tests/test-runner.test.ts'] },
  { name: 'teapot + target stress', files: ['tests/target-stress-teapot.test.ts'] },
  { name: 'target challenge stress', files: ['tests/target-stress-challenge.test.ts'] },
  { name: 'target peak stress', files: ['tests/target-stress-peak.test.ts'] },
  { name: 'sink matrix + rollout', files: ['tests/sink.test.ts', 'tests/sink-rollout.test.ts', 'tests/sink-selection.test.ts'] },
  { name: 'sink templates + fast path', files: ['tests/sink-templates.test.ts', 'tests/sink-fastpath.test.ts'] },
  { name: 'sink stress challenge', files: ['tests/sink-stress-challenge.test.ts'] },
  { name: 'sink stress peak', files: ['tests/sink-stress-peak.test.ts'] },
  { name: 'teapot + sink stress', files: ['tests/sink-stress-teapot.test.ts'] },
];

function runBatch(batch) {
  const res = spawnSync('bunx', ['vitest', 'run', ...batch.files], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  // Echo everything so CI logs stay readable (needed for classification:
  // output is captured, not inherited).
  process.stdout.write(output);
  return { status: res.status ?? 1, output };
}

const discovered = discoverTests(ROOT);
const check = validateAssignments(
  discovered,
  batches.map((b) => ({ name: b.name, files: b.files })),
  ROOT,
);
console.log(`Discovered test files: ${check.discoveredCount}`);
console.log(`Assigned test files:   ${check.assignedCount}`);
console.log(`Duplicate assignments: ${check.duplicates.length}`);
console.log(`Unassigned tests:      ${check.unassigned.length}`);
if (!check.ok) {
  if (check.unassigned.length > 0) {
    console.error('\nUNASSIGNED TEST FILES (add them to a batch):');
    for (const f of check.unassigned) console.error(`  ${f}`);
  }
  if (check.duplicates.length > 0) {
    console.error('\nDUPLICATE TEST ASSIGNMENTS:');
    for (const f of check.duplicates) console.error(`  ${f}`);
  }
  if (check.missing.length > 0) {
    console.error('\nMISSING ASSIGNED TEST FILES:');
    for (const f of check.missing) console.error(`  ${f}`);
  }
  process.exit(1);
}

const started = Date.now();
let executedFiles = 0;
let failed = false;
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  let passed = false;
  for (let attempt = 1; attempt <= 2 && !passed; attempt++) {
    console.log(`\n=== test batch ${i + 1}/${batches.length}: ${batch.name} (attempt ${attempt}/2) ===`);
    const result = runBatch(batch);
    if (result.status === 0) {
      passed = true;
    } else {
      const kind = classifyFailure(result.status, result.output);
      if (kind === 'known-vitest-rpc-flake' && attempt === 1) {
        console.log('\nBatch hit the known vitest worker RPC flake with no test failures — retrying once.');
      } else {
        console.error(`\nBATCH FAILED (${batch.name}, classified: ${kind}), stopping.`);
        failed = true;
        break;
      }
    }
  }
  if (failed) break;
  executedFiles += batch.files.length;
}
console.log(
  failed
    ? `\nExecuted test files: ${executedFiles}/${check.discoveredCount} (stopped early)`
    : `\nExecuted test files: ${executedFiles}/${check.discoveredCount}`,
);
console.log(`test batches done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
