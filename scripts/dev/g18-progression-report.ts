/**
 * G18 progression audit (reads scripts/dev/out/g18-rollout-baseline.json).
 * DEV-only evidence. Emits:
 * - scripts/dev/out/g18-progression-summary.json
 * - scripts/dev/out/g18-progression-1-330.csv
 * - docs/g18-progression-audit.md
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getLevelConfig } from '../../src/utils/difficultyCurve';
import { tutorialForConfig } from '../../src/game/ui/tutorials';

const ROOT = resolve(import.meta.dirname, '../..');
const IN = resolve(ROOT, 'scripts/dev/out/g18-rollout-baseline.json');
const OUT_JSON = resolve(ROOT, 'scripts/dev/out/g18-progression-summary.json');
const OUT_CSV = resolve(ROOT, 'scripts/dev/out/g18-progression-1-330.csv');
const OUT_MD = resolve(ROOT, 'docs/g18-progression-audit.md');

interface PrimaryRecord {
  minMoves?: number;
  genMs?: number;
  stats?: { usedFallback?: boolean; solverCalls?: number; templateAttempts?: number };
  topologyHash?: string;
}
interface RolloutRecord {
  levelNumber: number;
  phase: string;
  phaseName: string;
  phaseSubtitle: string;
  numColors: number;
  totalCups: number;
  colors: string[];
  mechanicFlags: Record<string, boolean>;
  targetTeaIds: string[];
  tutorialEligibility: string[];
  primary?: PrimaryRecord;
  secondary?: PrimaryRecord;
}

const artifact = JSON.parse(readFileSync(IN, 'utf8')) as {
  sourceSha: string;
  generatedAt: string;
  records: RolloutRecord[];
};
const records = artifact.records;
const byLevel = new Map(records.map((r) => [r.levelNumber, r]));

const MECHANICS = [
  'teapot',
  'targets',
  'sink',
  'tasting',
  'lemon',
  'strainer',
  'honey',
  'frozen',
  'thermos',
  'cinnamon',
  'teaBloom',
  'blend',
  'servingOrder',
  'sharedTray',
  'teaPair',
] as const;
type Mechanic = (typeof MECHANICS)[number];

/**
 * G18 final one-time tutorial matrix (from the centralized registry).
 * The pre-fix baseline repeated legacy banners 88–108 times; that finding
 * and fix are recorded in docs/g18-audit.md + docs/g18-tutorial-audit.md.
 */
function tutorialLevelsForMechanic(mechanic: string): number[] {
  const levels: number[] = [];
  for (let level = 1; level <= 1600; level++) {
    const tutorial = tutorialForConfig(getLevelConfig(level));
    if (!tutorial) continue;
    if (tutorial.mechanic.split('+').includes(mechanic)) levels.push(level);
  }
  return levels;
}

function specialCount(r: RolloutRecord): number {
  return MECHANICS.filter((m) => r.mechanicFlags[m]).length + (r.mechanicFlags.teapot ? 0 : 0);
}

const exposure = [] as Array<{
  mechanic: string;
  first: number | null;
  second: number | null;
  exposures330: number[];
  exposures1600: number[];
  maxGap: number | null;
  medianGap: number | null;
  tutorialCount: number;
  tutorialLevels: number[];
}>;
for (const mechanic of MECHANICS) {
  const exposures = records
    .filter((r) => r.mechanicFlags[mechanic] === true)
    .map((r) => r.levelNumber);
  const gaps = exposures.slice(1).map((v, i) => v - (exposures[i] as number));
  const tutorialLevels = tutorialLevelsForMechanic(mechanic);
  exposure.push({
    mechanic,
    first: exposures[0] ?? null,
    second: exposures[1] ?? null,
    exposures330: exposures.filter((l) => l <= 330),
    exposures1600: exposures,
    maxGap: gaps.length ? Math.max(...gaps) : null,
    medianGap: gaps.length
      ? [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? null
      : null,
    tutorialCount: tutorialLevels.length,
    tutorialLevels,
  });
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] as number;
}
function median(values: number[]): number {
  return pct(values, 50);
}

const first330 = records.filter((r) => r.levelNumber <= 330);
const minMoves330 = first330.map((r) => r.primary?.minMoves ?? -1).filter((n) => n >= 0);
const byPhase = new Map<string, number[]>();
for (const r of first330) {
  const v = r.primary?.minMoves;
  if (v === undefined) continue;
  const arr = byPhase.get(r.phase) ?? [];
  arr.push(v);
  byPhase.set(r.phase, arr);
}

// Phase-local rolling median (context-local complexity signal): compares a
// level only against nearby levels in the SAME rhythm phase, never against
// a different phase's inherent complexity.
const rolling = new Map<number, number>();
for (const phase of ['warmup', 'challenge', 'peak', 'relax']) {
  const phaseLevels = first330.filter((r) => r.phase === phase);
  for (let i = 0; i < phaseLevels.length; i++) {
    const window = phaseLevels.slice(Math.max(0, i - 3), Math.min(phaseLevels.length, i + 4));
    rolling.set(
      phaseLevels[i]!.levelNumber,
      median(window.map((r) => r.primary?.minMoves ?? 0)),
    );
  }
}

const spikes = [] as Array<{
  level: number;
  phase: string;
  minMoves: number;
  rolling: number;
  delta: number;
  mechanics: string[];
}>;
const drops = [] as Array<{
  level: number;
  phase: string;
  minMoves: number;
  rolling: number;
  delta: number;
  mechanics: string[];
}>;
for (const r of first330) {
  const mm = r.primary?.minMoves;
  const rm = rolling.get(r.levelNumber);
  if (mm === undefined || rm === undefined) continue;
  const delta = mm - rm;
  const item = {
    level: r.levelNumber,
    phase: r.phase,
    minMoves: mm,
    rolling: rm,
    delta,
    mechanics: MECHANICS.filter((m) => r.mechanicFlags[m]),
  };
  if (delta >= 3) spikes.push(item);
  if (delta <= -3) drops.push(item);
}

// Contract checks.
const warmupChecks = first330
  .filter((r) => r.phase === 'warmup')
  .map((r) => ({
    level: r.levelNumber,
    specials: specialCount(r),
    clean: specialCount(r) === 0,
    minMoves: r.primary?.minMoves ?? null,
  }));
const relaxChecks = first330
  .filter((r) => r.phase === 'relax')
  .map((r) => {
    const prev = byLevel.get(r.levelNumber - 1);
    return {
      level: r.levelNumber,
      specials: specialCount(r),
      clean: specialCount(r) === 0,
      minMoves: r.primary?.minMoves ?? null,
      prevMinMoves: prev?.primary?.minMoves ?? null,
      easierThanPrev: (r.primary?.minMoves ?? 0) < (prev?.primary?.minMoves ?? 0),
    };
  });
const challengeIllegal = first330
  .filter((r) => r.phase === 'challenge')
  .filter((r) => r.mechanicFlags.blend && (r.mechanicFlags.servingOrder || r.mechanicFlags.sharedTray || r.mechanicFlags.teaPair));
const peakExtra = first330
  .filter((r) => r.phase === 'peak')
  .filter((r) => r.mechanicFlags.sharedTray || r.mechanicFlags.teaPair || r.mechanicFlags.blend || r.mechanicFlags.servingOrder || r.mechanicFlags.thermos || r.mechanicFlags.cinnamon || r.mechanicFlags.teaBloom || r.mechanicFlags.frozen);

const distinctKeys = new Set(
  records.map((r) => `${r.primary?.topologyHash ?? ''}|${r.primary?.minMoves ?? ''}`),
);
const fallbackLevels = records.filter((r) => r.primary?.stats?.usedFallback).map((r) => r.levelNumber);

const summary = {
  sourceSha: artifact.sourceSha,
  generatedAt: artifact.generatedAt,
  levels: records.length,
  distinctPrimaryTopologyDepthPairs: distinctKeys.size,
  fallbackLevels,
  phaseMinMoves: Object.fromEntries(
    [...byPhase.entries()].map(([phase, values]) => [
      phase,
      {
        n: values.length,
        min: Math.min(...values),
        p50: pct(values, 50),
        p95: pct(values, 95),
        max: Math.max(...values),
      },
    ]),
  ),
  first330: {
    n: first330.length,
    minMoves: {
      min: Math.min(...minMoves330),
      p50: pct(minMoves330, 50),
      p95: pct(minMoves330, 95),
      max: Math.max(...minMoves330),
    },
    candidateSpikes: spikes,
    candidateDrops: drops,
    warmupViolations: warmupChecks.filter((w) => !w.clean),
    relaxNotEasierThanPrev: relaxChecks.filter((r) => !r.easierThanPrev),
    relaxSpecialViolations: relaxChecks.filter((r) => !r.clean),
    challengeIllegalCompositions: challengeIllegal.map((r) => r.levelNumber),
    peakExtraMechanicViolations: peakExtra.map((r) => r.levelNumber),
  },
  exposure,
};

mkdirSync(dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, `${JSON.stringify(summary, null, 2)}\n`);

const csvRows = [
  'level,phase,minMoves,rollingMedian,delta,specials,mechanics,colors,cups,phaseSubtitle',
  ...first330.map((r) => {
    const rm = rolling.get(r.levelNumber) ?? 0;
    const mm = r.primary?.minMoves ?? '';
    const delta = typeof mm === 'number' ? mm - rm : '';
    return [
      r.levelNumber,
      r.phase,
      mm,
      rm,
      delta,
      specialCount(r),
      MECHANICS.filter((m) => r.mechanicFlags[m]).join('+'),
      r.colors.join('+'),
      r.totalCups,
      `"${r.phaseSubtitle.replace(/"/g, '""')}"`,
    ].join(',');
  }),
];
writeFileSync(OUT_CSV, `${csvRows.join('\n')}\n`);

const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : String(n));
const lines: string[] = [];
lines.push('# G18 — Progression & Difficulty Audit');
lines.push('');
lines.push(`Baseline source: \`${artifact.sourceSha}\` (G17 final).`);
lines.push('');
lines.push('Method: real `getLevelConfig` + `generateLevel` for all 1600 levels with');
lines.push('`g18-baseline:<level>:0`; secondary seed `:1` for pinned/sampled levels.');
lines.push('Difficulty is a **solver complexity signal**, not a subjective fun/hardness claim.');
lines.push('');
lines.push('## Phase complexity (levels 1–330)');
lines.push('');
lines.push('| phase | n | min | p50 | p95 | max |');
lines.push('|---|---:|---:|---:|---:|---:|');
for (const [phase, s] of Object.entries(summary.phaseMinMoves)) {
  lines.push(`| ${phase} | ${s.n} | ${s.min} | ${s.p50} | ${s.p95} | ${s.max} |`);
}
lines.push('');
lines.push(`All 1600 primary generations: **${records.length - fallbackLevels.length}/${records.length} template/retry paths**, fallback levels: ${fallbackLevels.length ? fallbackLevels.join(', ') : 'none'}.`);
lines.push('');
lines.push('## Mechanic exposure table');
lines.push('');
lines.push('| mechanic | first | second | exposures ≤330 | all ≤1600 | max gap | median gap | tutorial banners |');
lines.push('|---|---:|---:|---|---|---:|---:|---|');
for (const e of exposure) {
  lines.push(
    `| ${e.mechanic} | ${fmt(e.first)} | ${fmt(e.second)} | ${e.exposures330.join(', ') || '—'} | ${e.exposures1600.length} levels | ${fmt(e.maxGap)} | ${fmt(e.medianGap)} | ${e.tutorialCount}${e.tutorialLevels.length && e.tutorialLevels.length <= 12 ? ` (${e.tutorialLevels.join(', ')})` : ''} |`,
  );
}
lines.push('');
lines.push('## Candidate difficulty spikes (1–330)');
lines.push('');
lines.push('Rolling window = 7 same-phase neighbours; candidate = +3 or more solver moves above the phase-local median.');
lines.push('');
if (spikes.length === 0) {
  lines.push('None flagged.');
} else {
  lines.push('| level | phase | minMoves | local median | delta | mechanics |');
  lines.push('|---:|---|---:|---:|---:|---|');
  for (const s of spikes) {
    lines.push(`| ${s.level} | ${s.phase} | ${s.minMoves} | ${s.rolling} | +${s.delta} | ${s.mechanics.join('+') || 'clean'} |`);
  }
}
lines.push('');
lines.push('## Candidate local drops (1–330)');
lines.push('');
lines.push('These are not defects by themselves; they are relaxation/context signals.');
lines.push('');
if (drops.length === 0) {
  lines.push('None flagged.');
} else {
  lines.push('| level | phase | minMoves | local median | delta | mechanics |');
  lines.push('|---:|---|---:|---:|---:|---|');
  for (const s of drops) {
    lines.push(`| ${s.level} | ${s.phase} | ${s.minMoves} | ${s.rolling} | ${s.delta} | ${s.mechanics.join('+') || 'clean'} |`);
  }
}
lines.push('');
lines.push('## Contract checks');
lines.push('');
lines.push(`- Warmup cleanliness violations: **${summary.first330.warmupViolations.length}**`);
lines.push(`- Relax special-mechanic violations: **${summary.first330.relaxSpecialViolations.length}**`);
lines.push(`- Relax levels not cheaper than the immediately preceding level: **${summary.first330.relaxNotEasierThanPrev.length}** (context signal, not automatically a defect)`);
if (summary.first330.relaxNotEasierThanPrev.length > 0) {
  lines.push(
    `  - levels: ${summary.first330.relaxNotEasierThanPrev.map((r) => `${r.level} (${r.minMoves} vs ${r.prevMinMoves})`).join(', ')}`,
  );
}
lines.push(`- Illegal challenge compositions: **${summary.first330.challengeIllegalCompositions.length}**`);
lines.push(`- Peak non-allowlisted mechanic leakage: **${summary.first330.peakExtraMechanicViolations.length}**`);
lines.push('');
lines.push('## G16/G17 cadence');
lines.push('');
for (const m of ['sharedTray', 'teaPair']) {
  const e = exposure.find((x) => x.mechanic === m);
  if (!e) continue;
  lines.push(`- **${m}**: first ${fmt(e.first)}, second ${fmt(e.second)}, exposures ≤330: ${e.exposures330.join(', ')}, all exposures ≤1600: ${e.exposures1600.length}, max gap ${fmt(e.maxGap)}.`);
  lines.push(
    e.exposures1600.length <= 2
      ? '  - Classification: **progression design debt** (mechanic disappears after the pinned repeats). G18 does not redesign rollout by default.'
      : '  - Classification: continues to appear; inspect cadence above.',
  );
}
lines.push('');
lines.push('## Persistence boundary note');
lines.push('');
lines.push('The existing storage validator caps persisted levels at 999 (highest unlocked 1000).');
lines.push('G18 enumerates/generates 1–1600 for structural rollout audit, but changing the');
lines.push('progression boundary is product scope, so it is documented (M-07) and not altered.');
lines.push('No pinned/G14–G17 level is affected.');
lines.push('');
lines.push('## Evidence files');
lines.push('');
lines.push('- `scripts/dev/out/g18-rollout-baseline.json` — full 1–1600 rollout + generated topology hashes/canonical keys.');
lines.push('- `scripts/dev/out/g18-progression-1-330.csv` — per-level minMoves, phase, mechanics, rolling median.');
lines.push('- `scripts/dev/out/g18-progression-summary.json` — machine-readable exposure/spike/contract summary.');
lines.push('');
writeFileSync(OUT_MD, `${lines.join('\n')}\n`);

console.log(
  JSON.stringify(
    {
      out: OUT_MD,
      csv: OUT_CSV,
      summary: OUT_JSON,
      first330: summary.first330.minMoves,
      exposure: exposure.map((e) => ({
        mechanic: e.mechanic,
        first: e.first,
        second: e.second,
        count: e.exposures1600.length,
        maxGap: e.maxGap,
        tutorials: e.tutorialCount,
      })),
      spikes: spikes.length,
      drops: drops.length,
      warmupViolations: summary.first330.warmupViolations.length,
      relaxSpecialViolations: summary.first330.relaxSpecialViolations.length,
      relaxNotEasier: summary.first330.relaxNotEasierThanPrev.length,
      challengeIllegal: summary.first330.challengeIllegalCompositions.length,
      peakExtra: summary.first330.peakExtraMechanicViolations.length,
      fallbackLevels,
    },
    null,
    2,
  ),
);
