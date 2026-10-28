/**
 * G18 rollout snapshot builder (DEV evidence → compact test fixture).
 *
 * Input: a g18-rollout-baseline.json / final artifact produced by
 * scripts/dev/g18-rollout-baseline.ts.
 *
 * Output: tests/fixtures/g18-rollout-snapshot.json
 * - per-level semantic config hash for all 1–1600 (exact differing levels);
 * - readable pinned rows;
 * - deterministic generation samples (pinned + every 50th + first/second
 *   exposure of every mechanic) with canonical keys / topology hashes;
 * - the one-time tutorial matrix.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { TUTORIALS } from '../../src/game/ui/tutorials.ts';
import { semanticConfigHash } from './g18-snapshot-lib.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const inIndex = process.argv.indexOf('--in');
const outIndex = process.argv.indexOf('--out');
const IN = resolve(
  ROOT,
  inIndex >= 0
    ? (process.argv[inIndex + 1] as string)
    : 'scripts/dev/out/g18-rollout-baseline.json',
);
const OUT = resolve(
  ROOT,
  outIndex >= 0
    ? (process.argv[outIndex + 1] as string)
    : 'tests/fixtures/g18-rollout-snapshot.json',
);

interface RecordShape {
  levelNumber: number;
  phase: string;
  phaseName: string;
  phaseSubtitle: string;
  numColors: number;
  totalCups: number;
  colors: string[];
  mechanicFlags: Record<string, boolean>;
  plan: Record<string, boolean>;
  mystery: boolean;
  targetTeaIds: string[];
  floatingIngredient: string | null;
  sinkingIngredient: string | null;
  tutorialEligibility: string[];
  request: Record<string, unknown>;
  primary?: {
    seed: string;
    canonicalKey: string;
    topologyHash: string;
    initialFingerprint: string;
    minMoves: number;
    canonicalLengths: number[];
    hiddenCounts: number[];
    stats: Record<string, unknown>;
  };
}
interface Artifact {
  sourceSha: string;
  generatedAt: string;
  records: RecordShape[];
}

const artifact = JSON.parse(readFileSync(IN, 'utf8')) as Artifact;
const byLevel = new Map(artifact.records.map((r) => [r.levelNumber, r]));

/**
 * Gameplay/rollout semantics only. Tutorial eligibility is deliberately
 * excluded: G18 changes it from repeated hints to one-time first exposure
 * (documented UX-only metadata). Everything here must remain frozen.
 * The hash formula is the shared `semanticConfigHash` used by the test.
 */
const levels = artifact.records.map((r) => ({
  level: r.levelNumber,
  hash: semanticConfigHash(r.levelNumber),
}));

const pinned = new Set([1, 2, 3, 4, 6, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106, 154, 162, 242, 250, 330]);
const sampleLevels = new Set<number>(pinned);
for (let l = 50; l <= 1600; l += 50) sampleLevels.add(l);
for (const mechanic of Object.keys(artifact.records[0]?.mechanicFlags ?? {})) {
  const exposures = artifact.records
    .filter((r) => r.mechanicFlags[mechanic] === true)
    .map((r) => r.levelNumber);
  if (exposures[0] !== undefined) sampleLevels.add(exposures[0]);
  if (exposures[1] !== undefined) sampleLevels.add(exposures[1]);
}

const samples = [...sampleLevels]
  .sort((a, b) => a - b)
  .map((level) => {
    const r = byLevel.get(level);
    if (!r?.primary) throw new Error(`snapshot missing generated primary for L${level}`);
    return {
      level,
      seed: r.primary.seed,
      canonicalKey: r.primary.canonicalKey,
      topologyHash: r.primary.topologyHash,
      initialFingerprint: r.primary.initialFingerprint,
      minMoves: r.primary.minMoves,
      canonicalLengths: r.primary.canonicalLengths,
      hiddenCounts: r.primary.hiddenCounts,
      stats: r.primary.stats,
    };
  });

const pinnedReadable = [...pinned].sort((a, b) => a - b).map((level) => {
  const r = byLevel.get(level);
  if (!r?.primary) throw new Error(`snapshot missing pinned L${level}`);
  return {
    level,
    phase: r.phase,
    phaseSubtitle: r.phaseSubtitle,
    numColors: r.numColors,
    totalCups: r.totalCups,
    colors: r.colors,
    mechanicFlags: r.mechanicFlags,
    targetTeaIds: r.targetTeaIds,
    canonicalKey: r.primary.canonicalKey,
    minMoves: r.primary.minMoves,
    topologyHash: r.primary.topologyHash,
    initialFingerprint: r.primary.initialFingerprint,
  };
});

const tutorialMatrix = TUTORIALS.map((t) => ({
  level: t.level,
  id: t.id,
  bannerId: t.bannerId,
  mechanic: t.mechanic,
  concept: t.concept,
}));

const fixture = {
  version: 1,
  gauntlet: 'G18',
  sourceSha: artifact.sourceSha,
  generatedAt: artifact.generatedAt,
  note:
    'Level hashes cover gameplay/rollout semantics only. Tutorial eligibility is ' +
    'intentionally excluded (G18 one-time first exposure) and verified by tutorialMatrix.',
  levelCount: levels.length,
  levels,
  samples,
  pinned: pinnedReadable,
  tutorialMatrix,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      out: OUT,
      levels: levels.length,
      samples: samples.length,
      pinned: pinnedReadable.length,
      tutorials: tutorialMatrix.length,
      bytes: JSON.stringify(fixture).length,
    },
    null,
    2,
  ),
);
