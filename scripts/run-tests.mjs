/**
 * Batched test runner (used by `bun run test`).
 *
 * Why batches instead of one `vitest run` over all 20 files:
 * this suite is CPU/GC-heavy by design (solver-validated generation runs
 * hundreds of BFS searches per seed). A single 20-file parallel run
 * deterministically produced exactly one spurious
 * `[vitest-worker]: Timeout calling "onTaskUpdate"` RPC error AFTER all
 * tests had passed — in every configuration tried (default pool,
 * maxWorkers 1/2, singleFork) — while smaller runs of the SAME files
 * were always clean. The failure is vitest worker-pool churn under load,
 * not test code. Sequential batches (one vitest process each, every batch
 * shape verified clean repeatedly) remove the churn vector. No test is
 * skipped, weakened, or masked: any real failure fails its batch and the
 * whole run exits non-zero (fail-fast).
 *
 * Batch shapes (each verified clean; keep batches at most this heavy):
 *  1. pre-existing suite (14 files, fast)
 *  2. base generator + teapot stress
 *  3. target matrix
 *  4-6. one target stress config each (heaviest last)
 */
import { spawnSync } from 'node:child_process';

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
  { name: 'teapot + target stress', files: ['tests/target-stress-teapot.test.ts'] },
  { name: 'target challenge stress', files: ['tests/target-stress-challenge.test.ts'] },
  { name: 'target peak stress', files: ['tests/target-stress-peak.test.ts'] },
];

let failed = false;
const started = Date.now();
for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];
  // One retry per batch: our tests are FULLY deterministic (seeded
  // generation, no wall-clock/random inputs), so a genuine assertion
  // failure reproduces identically on retry and still fails the run.
  // What the retry absorbs is vitest's own worker RPC flake
  // (`Timeout calling "onTaskUpdate"` with all tests green), which is
  // environmental and never reproduces the same way twice.
  let passed = false;
  for (let attempt = 1; attempt <= 2 && !passed; attempt++) {
    console.log(
      `\n=== test batch ${i + 1}/${batches.length}: ${batch.name} (attempt ${attempt}/2) ===`,
    );
    const res = spawnSync('bunx', ['vitest', 'run', ...batch.files], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    passed = res.status === 0;
    if (!passed && attempt === 1) {
      console.log(`\nBatch "${batch.name}" failed once — retrying once (infra flake check).`);
    }
  }
  if (!passed) {
    console.error(`\nBATCH FAILED twice (${batch.name}), stopping.`);
    failed = true;
    break;
  }
}
console.log(`\n test batches done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
process.exit(failed ? 1 : 0);
