/**
 * G19 freeze — the G18 historical oracle for levels 1–330 stays exact.
 *
 * The G18 fixture is never regenerated or overwritten. Levels 331–333 also
 * stay identical (phase + plan); intentional Rollout V2 differences begin at
 * the first V2 challenge slot L334.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getLevelConfig } from '../src/utils/difficultyCurve';
import {
  generateRecord,
  primarySeed,
  semanticConfigHash,
} from '../scripts/dev/g18-snapshot-lib';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(
  readFileSync(`${REPO_ROOT}tests/fixtures/g18-rollout-snapshot.json`, 'utf8'),
) as {
  sourceSha: string;
  levelCount: number;
  levels: Array<{ level: number; hash: string }>;
  samples: Array<{
    level: number;
    seed: string;
    canonicalKey: string;
    topologyHash: string;
    initialFingerprint: string;
    minMoves: number;
    canonicalLengths: number[];
    hiddenCounts: number[];
    stats: {
      candidatesTried: number;
      solverCalls: number;
      templateAttempts: number;
      usedFallback: boolean;
    };
  }>;
};

function oldHash(level: number): string | undefined {
  return fixture.levels.find((row) => row.level === level)?.hash;
}

describe('G19 freeze against the G18 production oracle', () => {
  it('uses the untouched G18 final fixture', () => {
    expect(fixture.sourceSha).toBe('f2d28287aa0f67e096309800d2224fa5ee574e81');
    expect(fixture.levelCount).toBe(1600);
    expect(fixture.levels).toHaveLength(1600);
  });

  it('L1–L330 semantic rollout is 330/330 identical', () => {
    const expected = new Map(fixture.levels.map((row) => [row.level, row.hash]));
    const diffs: Array<{ level: number; expected: string; actual: string }> = [];
    for (let level = 1; level <= 330; level++) {
      const actual = semanticConfigHash(level);
      const want = expected.get(level);
      if (want !== actual) diffs.push({ level, expected: want ?? '(missing)', actual });
    }
    expect(
      diffs,
      `frozen rollout differences at levels: ${diffs.map((d) => d.level).join(', ')}`,
    ).toEqual([]);
  });

  it('L331–L333 keep the old phase rhythm and plan semantics', () => {
    for (const level of [331, 332, 333]) {
      expect(semanticConfigHash(level), `L${level}`).toBe(oldHash(level));
    }
  });

  it('intentional V2 difference starts at L334 and leaves the peak rhythm alone', () => {
    expect(semanticConfigHash(334)).not.toBe(oldHash(334));
    // L334 is challenge; L335 peak, L336 relax, L337 warmup are untouched.
    for (const level of [335, 336, 337]) {
      expect(semanticConfigHash(level), `L${level} must stay unchanged`).toBe(oldHash(level));
    }
  });

  it('all 40 G18 generated samples at L<=330 regenerate exactly', () => {
    const frozenSamples = fixture.samples.filter((sample) => sample.level <= 330);
    expect(frozenSamples).toHaveLength(40);
    const diffs: string[] = [];
    for (const sample of frozenSamples) {
      const actual = generateRecord(getLevelConfig(sample.level), primarySeed(sample.level));
      const checks: Array<[string, unknown, unknown]> = [
        ['canonicalKey', sample.canonicalKey, actual.canonicalKey],
        ['topologyHash', sample.topologyHash, actual.topologyHash],
        ['initialFingerprint', sample.initialFingerprint, actual.initialFingerprint],
        ['minMoves', sample.minMoves, actual.minMoves],
        ['canonicalLengths', sample.canonicalLengths, actual.canonicalLengths],
        ['hiddenCounts', sample.hiddenCounts, actual.hiddenCounts],
        ['stats', sample.stats, actual.stats],
      ];
      for (const [field, want, got] of checks) {
        if (JSON.stringify(want) !== JSON.stringify(got)) {
          diffs.push(`L${sample.level} ${field}: ${JSON.stringify(want)} !== ${JSON.stringify(got)}`);
        }
      }
    }
    expect(diffs, `frozen generated-sample differences:\n${diffs.join('\n')}`).toEqual([]);
  });

  it('G18 samples above 330: only challenge plans may intentionally change', () => {
    const changed: number[] = [];
    for (const sample of fixture.samples.filter((row) => row.level > 330)) {
      const cfg = getLevelConfig(sample.level);
      const actual = semanticConfigHash(sample.level);
      const old = oldHash(sample.level);
      if (cfg.phase !== 'challenge') {
        expect(actual, `non-challenge L${sample.level} must not change`).toBe(old);
      } else if (actual !== old) {
        changed.push(sample.level);
      }
    }
    expect(changed.length).toBeGreaterThan(0);
  });
});
