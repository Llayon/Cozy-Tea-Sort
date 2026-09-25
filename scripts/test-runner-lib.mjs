/**
 * Pure helpers for scripts/run-tests.mjs (batch discovery, assignment
 * validation, failure classification). No production dependency, no
 * side effects — unit-tested by tests/test-runner.test.ts.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Exact known infrastructure signature (vitest worker RPC flake observed
 * repeatedly: all tests green, one trailing worker error). Both parts are
 * required — a bare "timeout" is NOT enough to retry.
 */
export const KNOWN_RPC_FLAKE_SIGNATURE = '[vitest-worker]: Timeout calling "onTaskUpdate"';

/**
 * Recursively discover all `*.test.ts` files under `dir` (relative to
 * `rootDir`), returned as forward-slash repo-relative paths, sorted.
 * No glob dependency — plain Node APIs only.
 */
export function discoverTests(rootDir, dir = 'tests') {
  const out = [];
  const walk = (rel) => {
    const abs = join(rootDir, rel);
    for (const entry of readdirSync(abs)) {
      const entryRel = rel === '' ? entry : `${rel}/${entry}`;
      const st = statSync(join(rootDir, entryRel));
      if (st.isDirectory()) {
        walk(entryRel);
      } else if (entry.endsWith('.test.ts')) {
        out.push(entryRel.replace(/\\/g, '/'));
      }
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * Validate batch assignments against discovery. Fails loudly on any
 * unassigned / duplicated / missing file — a forgotten test must break
 * the gate, never pass silently.
 *
 * @param discovered repo-relative paths from discoverTests()
 * @param batches Array<{ name: string, files: string[] }>
 * @param rootDir repo root (for existence checks)
 */
export function validateAssignments(discovered, batches, rootDir) {
  const discoveredSet = new Set(discovered);
  const seen = new Map();
  const missing = [];
  for (const batch of batches) {
    for (const file of batch.files) {
      const normalized = file.replace(/\\/g, '/');
      seen.set(normalized, (seen.get(normalized) ?? 0) + 1);
      if (!discoveredSet.has(normalized) || !existsSync(join(rootDir, normalized))) {
        missing.push(normalized);
      }
    }
  }
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([f]) => f).sort();
  const assigned = new Set(seen.keys());
  const unassigned = discovered.filter((f) => !assigned.has(f)).sort();
  return {
    ok: unassigned.length === 0 && duplicates.length === 0 && missing.length === 0,
    unassigned,
    duplicates,
    missing: [...new Set(missing)].sort(),
    discoveredCount: discovered.length,
    assignedCount: assigned.size,
  };
}

/**
 * Classify a failed batch invocation. Conservative by design:
 * - assertion/failed-test evidence → 'real-test-failure' (NEVER retry),
 *   even when the RPC signature is ALSO present (mixed failure = fail);
 * - ONLY the exact known RPC signature with zero real-failure evidence
 *   → 'known-vitest-rpc-flake' (the single retryable case);
 * - anything else nonzero → 'unknown-failure' (never retry).
 *
 * @param exitCode process exit code (null on signal)
 * @param output combined stdout+stderr text
 */
export function classifyFailure(exitCode, output) {
  const text = String(output ?? '');
  // Any real-failure evidence wins over the RPC signature (mixed = fail).
  const hasFailedTests =
    /Test Files\s+[^\n]*failed/i.test(text) ||
    /Tests\s+\d+\s+failed/i.test(text) ||
    /(^|\n)\s*FAIL[ \t]/m.test(text) ||
    /AssertionError/i.test(text) ||
    hasNonRpcUnhandledError(text);
  if (hasFailedTests) return 'real-test-failure';
  if (text.includes(KNOWN_RPC_FLAKE_SIGNATURE)) return 'known-vitest-rpc-flake';
  return 'unknown-failure';
}

/**
 * True when the output holds an "Unhandled Error" block that is NOT the
 * known RPC flake (vitest prints the flake itself under an "Unhandled
 * Errors" header, so the header alone proves nothing).
 */
function hasNonRpcUnhandledError(text) {
  const parts = text.split(/(^|\n)\s*Unhandled Error/m);
  for (let i = 1; i < parts.length; i += 2) {
    const block = `${parts[i] ?? ''}${parts[i + 1] ?? ''}`;
    if (!block.includes(KNOWN_RPC_FLAKE_SIGNATURE)) return true;
  }
  return false;
}


