import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  KNOWN_RPC_FLAKE_SIGNATURE,
  classifyFailure,
  discoverTests,
  validateAssignments,
} from '../scripts/test-runner-lib.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Gauntlet 2.1 §27: self-checks for the batched runner helpers.
 * Fast, deterministic, no vitest-in-vitest recursion — synthetic inputs only.
 */

const RPC_OUTPUT = [
  ' Test Files  20 passed (20)',
  '      Tests  174 passed (174)',
  '⎯⎯⎯⎯⎯⎯ Unhandled Errors ⎯⎯⎯⎯⎯⎯',
  'Vitest caught 1 unhandled error during the test run.',
  'Unhandled Error',
  'Error: [vitest-worker]: Timeout calling "onTaskUpdate"',
  ' ❯ Object.onTimeoutError node_modules/vitest/dist/chunks/rpc.-pEldfrD.js:53:10',
].join('\n');

const FAIL_OUTPUT = [
  ' FAIL  tests/target.test.ts > K. generator ...',
  'AssertionError: expected false to be true',
  ' Test Files  1 failed | 19 passed (20)',
  '      Tests  1 failed | 173 passed (174)',
].join('\n');

describe('runner discovery (§27 A–D)', () => {
  it('A. discovery sees the real suite (all known files, sorted, normalized)', () => {
    const found = discoverTests(REPO_ROOT);
    expect(found.length).toBeGreaterThanOrEqual(20);
    expect(found).toContain('tests/rules.test.ts');
    expect(found).toContain('tests/target.test.ts');
    expect(found).toContain('tests/test-runner.test.ts');
    expect(found.every((f) => f.endsWith('.test.ts'))).toBe(true);
    expect(found.every((f) => !f.includes('\\'))).toBe(true);
    expect([...found].sort()).toEqual(found);
  });

  it('B. unassigned discovered file fails validation', () => {
    const check = validateAssignments(
      ['tests/a.test.ts', 'tests/b.test.ts'],
      [{ name: 'one', files: ['tests/a.test.ts'] }],
      '/nonexistent-root-for-existence-check',
    );
    expect(check.ok).toBe(false);
    expect(check.unassigned).toEqual(['tests/b.test.ts']);
  });

  it('C. duplicate assignment fails validation', () => {
    const check = validateAssignments(
      ['tests/a.test.ts'],
      [
        { name: 'one', files: ['tests/a.test.ts'] },
        { name: 'two', files: ['tests/a.test.ts'] },
      ],
      '/nonexistent-root-for-existence-check',
    );
    // 'tests/a.test.ts' does not exist under the fake root, so it is also
    // reported missing — duplicates must still be reported regardless.
    expect(check.duplicates).toEqual(['tests/a.test.ts']);
    expect(check.ok).toBe(false);
  });

  it('D. assigned missing file fails validation', () => {
    const check = validateAssignments(
      ['tests/a.test.ts'],
      [{ name: 'one', files: ['tests/a.test.ts', 'tests/ghost.test.ts'] }],
      '/nonexistent-root-for-existence-check',
    );
    expect(check.missing).toContain('tests/ghost.test.ts');
    expect(check.ok).toBe(false);
  });

  it('complete assignment passes', () => {
    // Existence is checked against the real repo root here.
    const discovered = discoverTests(REPO_ROOT);
    const check = validateAssignments(
      discovered,
      [{ name: 'all', files: [...discovered] }],
      REPO_ROOT,
    );
    expect(check.ok).toBe(true);
    expect(check.unassigned).toEqual([]);
    expect(check.duplicates).toEqual([]);
    expect(check.missing).toEqual([]);
  });
});

describe('runner failure classifier (§27 E–H)', () => {
  it('E. exact known RPC signature with green tests is retryable', () => {
    expect(classifyFailure(1, RPC_OUTPUT)).toBe('known-vitest-rpc-flake');
  });

  it('F. assertion failure is NOT retryable', () => {
    expect(classifyFailure(1, FAIL_OUTPUT)).toBe('real-test-failure');
  });

  it('G. RPC signature PLUS real failure is NOT retryable', () => {
    expect(classifyFailure(1, `${FAIL_OUTPUT}\n${RPC_OUTPUT}`)).toBe('real-test-failure');
  });

  it('H1. generic timeout text with failed counts is NOT retryable', () => {
    expect(classifyFailure(1, 'Test timed out in 5000ms\n Tests  1 failed')).toBe(
      'real-test-failure',
    );
  });

  it('H2. failing exit with empty output is unknown (never retry)', () => {
    expect(classifyFailure(1, '')).toBe('unknown-failure');
    expect(classifyFailure(null, 'some noise')).toBe('unknown-failure');
  });

  it('signature constant matches the observed CI evidence exactly', () => {
    expect(KNOWN_RPC_FLAKE_SIGNATURE).toBe('[vitest-worker]: Timeout calling "onTaskUpdate"');
    expect(RPC_OUTPUT).toContain(KNOWN_RPC_FLAKE_SIGNATURE);
  });
});
