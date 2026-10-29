/**
 * G18 rollout freeze — levels 1–1600 must remain semantically identical
 * except for the documented one-time tutorial visibility metadata.
 *
 * Fast part: per-level semantic config hashes (phase, palette, vessels,
 * mechanic plan, capacity/special flags, target goals, generator request).
 * Bounded generation part: pinned + sampled deterministic seeds compare
 * canonical initial keys, topology hashes, minMoves and full initial-state
 * fingerprints against the G17-final baseline.
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
  pinned: Array<{
    level: number;
    phase: string;
    phaseSubtitle: string;
    numColors: number;
    totalCups: number;
    colors: string[];
    mechanicFlags: Record<string, boolean>;
    targetTeaIds: string[];
    canonicalKey: string;
    minMoves: number;
    topologyHash: string;
    initialFingerprint: string;
  }>;
};

describe('G18 rollout freeze (levels 1–1600)', () => {
  it('baseline is the frozen G17-final source', () => {
    expect(fixture.sourceSha).toBe('f2d28287aa0f67e096309800d2224fa5ee574e81');
    expect(fixture.levelCount).toBe(1600);
    expect(fixture.levels).toHaveLength(1600);
  });

  it('every level keeps its exact rollout/mechanic semantics', () => {
    const expected = new Map(fixture.levels.map((r) => [r.level, r.hash]));
    const diffs: Array<{ level: number; expected: string; actual: string }> = [];
    for (let level = 1; level <= 1600; level++) {
      const actual = semanticConfigHash(level);
      const want = expected.get(level);
      if (want !== actual) diffs.push({ level, expected: want ?? '(missing)', actual });
    }
    expect(diffs, `rollout differences at levels: ${diffs.map((d) => d.level).join(', ')}`).toEqual([]);
  });

  it('pinned readable rows still expose the expected production mechanics', () => {
    const expected: Record<number, string[]> = {
      6: ['teapot'],
      10: ['targets'],
      18: ['sink'],
      26: ['tasting'],
      34: ['lemon'],
      42: ['strainer'],
      50: ['honey'],
      58: ['lemon', 'honey'],
      66: ['frozen'],
      74: ['thermos'],
      82: ['cinnamon'],
      90: ['teaBloom'],
      98: ['blend'],
      106: ['servingOrder'],
      154: ['tasting', 'servingOrder'],
      162: ['sharedTray'],
      242: ['sharedTray'],
      250: ['teaPair'],
      330: ['teaPair'],
    };
    for (const [rawLevel, mechanics] of Object.entries(expected)) {
      const level = Number(rawLevel);
      const row = fixture.pinned.find((p) => p.level === level);
      expect(row, `missing pinned row L${level}`).toBeDefined();
      const cfg = getLevelConfig(level);
      const flags: Record<string, boolean> = {
        teapot: cfg.hasSourceOnlyTeapot,
        targets: cfg.targetTeaIds.length > 0,
        sink: cfg.hasSinkGuestCup,
        tasting: cfg.hasTastingBowl,
        lemon: cfg.floatingIngredient === 'lemon',
        strainer: cfg.hasStrainer,
        honey: cfg.sinkingIngredient === 'honey',
        frozen: cfg.hasFrozenCup,
        thermos: cfg.hasThermos === true,
        cinnamon: cfg.hasCinnamon === true,
        teaBloom: cfg.hasTeaBloom === true,
        blend: cfg.hasBlend === true,
        servingOrder: cfg.hasServingOrder === true,
        sharedTray: cfg.hasSharedTray === true,
        teaPair: cfg.hasTeaPair === true,
      };
      for (const mechanic of mechanics) {
        expect(flags[mechanic], `L${level} missing ${mechanic}`).toBe(true);
        expect(row?.mechanicFlags[mechanic], `fixture L${level} missing ${mechanic}`).toBe(true);
      }
    }
  });

  it('deterministic pinned/sample seeds regenerate the same canonical puzzle', () => {
    const diffs: string[] = [];
    for (const sample of fixture.samples) {
      const cfg = getLevelConfig(sample.level);
      const actual = generateRecord(cfg, primarySeed(sample.level));
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
    expect(diffs, `deterministic rollout differences:\n${diffs.join('\n')}`).toEqual([]);
  });
});
