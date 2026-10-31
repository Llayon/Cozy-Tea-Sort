/**
 * G19 long-run rollout / recurrence audit (DEV evidence).
 *
 * Enumerates the REAL production mechanic plan for a level range and reports:
 * first/second/all exposures, max/median gaps, phase mix and standalone/combo
 * status per plan. This is structural evidence only: no solver, no generation.
 *
 * Run:
 *   bunx tsx scripts/dev/g19-rollout-report.ts
 *   bunx tsx scripts/dev/g19-rollout-report.ts --from 1 --to 10000
 *   bunx tsx scripts/dev/g19-rollout-report.ts --out scripts/dev/out/g19-recurrence.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getLevelConfig, mechanicPlanForLevel } from '../../src/utils/difficultyCurve.ts';

type MechanicPlan = ReturnType<typeof mechanicPlanForLevel>;

const ROOT = resolve(import.meta.dirname, '../..');

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] as string) : fallback;
}

const FROM = Number(argValue('--from', '1'));
const TO = Number(argValue('--to', '5000'));
const OUT = resolve(ROOT, argValue('--out', 'scripts/dev/out/g19-recurrence.json'));

if (!Number.isInteger(FROM) || !Number.isInteger(TO) || FROM < 1 || TO < FROM) {
  throw new Error(`invalid range ${FROM}..${TO}`);
}

export function planKey(plan: MechanicPlan): string {
  const flags = Object.entries(plan)
    .filter(([, on]) => on)
    .map(([key]) => key)
    .sort();
  return flags.length === 0 ? 'clean' : flags.join('+');
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

interface ExposureSummary {
  plan: string;
  first: number | null;
  second: number | null;
  last: number | null;
  count: number;
  levels: number[];
  gaps: number[];
  maxGap: number | null;
  medianGap: number | null;
  phases: Record<string, number>;
  standalone: boolean;
  /** Last exposure in the frozen historical boundary (<=330). */
  lastV1: number | null;
  /** First exposure in the intentional Rollout V2 range (>=334). */
  firstV2: number | null;
  /** lastV1 -> firstV2 catch-up gap (historical debt, not steady state). */
  boundaryGap: number | null;
  /** Gaps between V2 exposures only (firstV2 onward). */
  steadyGaps: number[];
  steadyMaxGap: number | null;
  steadyMedianGap: number | null;
  countThrough2000: number;
  countThrough10000: number;
}

const byPlan = new Map<string, number[]>();
const phaseByLevel = new Map<number, string>();
const violations: Array<{ level: number; kind: string; detail: string }> = [];
const knownFlags = new Set(Object.keys(mechanicPlanForLevel(1)));

for (let level = FROM; level <= TO; level++) {
  const cfg = getLevelConfig(level);
  const plan = mechanicPlanForLevel(level);
  for (const flag of Object.keys(plan)) {
    if (!knownFlags.has(flag)) violations.push({ level, kind: 'unknown-flag', detail: flag });
  }
  const key = planKey(plan);
  phaseByLevel.set(level, cfg.phase);
  if ((cfg.phase === 'warmup' || cfg.phase === 'relax') && key !== 'clean') {
    violations.push({ level, kind: `${cfg.phase}-special`, detail: key });
  }
  const levels = byPlan.get(key) ?? [];
  levels.push(level);
  byPlan.set(key, levels);
}

const summaries: ExposureSummary[] = [...byPlan.entries()]
  .map(([plan, levels]) => {
    const gaps = levels.slice(1).map((level, i) => level - (levels[i] as number));
    const phases: Record<string, number> = {};
    for (const level of levels) {
      const phase = phaseByLevel.get(level) as string;
      phases[phase] = (phases[phase] ?? 0) + 1;
    }
    // Recurrence boundary/cadence is about CHALLENGE exposures: peak/relax
    // appearances of familiar mechanics are a different policy and must not
    // be mistaken for a Rollout V2 deck slot.
    const challengeLevels = levels.filter(
      (level) => phaseByLevel.get(level) === 'challenge',
    );
    const lastV1 = [...challengeLevels].reverse().find((level) => level <= 330) ?? null;
    const firstV2 = challengeLevels.find((level) => level >= 334) ?? null;
    const v2Levels =
      firstV2 === null ? [] : challengeLevels.filter((level) => level >= firstV2);
    const steadyGaps = v2Levels.slice(1).map((level, i) => level - (v2Levels[i] as number));
    return {
      plan,
      first: levels[0] ?? null,
      second: levels[1] ?? null,
      last: levels[levels.length - 1] ?? null,
      count: levels.length,
      levels,
      gaps,
      maxGap: gaps.length > 0 ? Math.max(...gaps) : null,
      medianGap: median(gaps),
      phases,
      standalone: !plan.includes('+'),
      lastV1,
      firstV2,
      boundaryGap: lastV1 !== null && firstV2 !== null ? firstV2 - lastV1 : null,
      steadyGaps,
      steadyMaxGap: steadyGaps.length > 0 ? Math.max(...steadyGaps) : null,
      steadyMedianGap: median(steadyGaps),
      countThrough2000: levels.filter((level) => level <= 2000).length,
      countThrough10000: levels.filter((level) => level <= 10000).length,
    };
  })
  .sort((a, b) => (a.first ?? 0) - (b.first ?? 0) || a.plan.localeCompare(b.plan));

/** Planner-facing names for the plans G19 explicitly discusses. */
const FOCUS: Record<string, string> = {
  sharedTray: 'Shared Tray',
  teaPair: 'Tea Pair',
  frozen: 'Frozen',
  thermos: 'Thermos',
  cinnamon: 'Cinnamon',
  teaBloom: 'Tea Bloom',
  blend: 'Blend',
  servingOrder: 'Serving Order',
  'servingOrder+tasting': 'Order+Tasting',
  'honey+lemon': 'Lemon+Honey',
  'honey+teapot': 'Teapot+Honey',
  'strainer+teapot': 'Teapot+Strainer',
  'lemon+teapot': 'Teapot+Lemon',
  'tasting+teapot': 'Teapot+Tasting',
  'sink+teapot': 'Teapot+Sink',
  'targets+teapot': 'Teapot+Targets',
  honey: 'Honey',
  tasting: 'Tasting',
  lemon: 'Lemon',
  sink: 'Sink',
  targets: 'Targets',
  teapot: 'Teapot',
  strainer: 'Strainer',
};

const focus = Object.fromEntries(
  Object.entries(FOCUS).map(([plan, label]) => {
    const found = summaries.find((s) => s.plan === plan);
    return [
      label,
      found ?? {
        plan,
        first: null,
        second: null,
        last: null,
        count: 0,
        levels: [],
        gaps: [],
        maxGap: null,
        medianGap: null,
        phases: {},
        standalone: !plan.includes('+'),
        lastV1: null,
        firstV2: null,
        boundaryGap: null,
        steadyGaps: [],
        steadyMaxGap: null,
        steadyMedianGap: null,
        countThrough2000: 0,
        countThrough10000: 0,
      },
    ];
  }),
);

const artifact = {
  gauntlet: 'G19',
  generatedAt: new Date().toISOString(),
  range: { from: FROM, to: TO },
  totals: {
    levels: TO - FROM + 1,
    distinctPlans: summaries.length,
    violations: violations.length,
  },
  focus,
  summaries,
  violations,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`G19 rollout report ${FROM}..${TO}`);
console.log(
  'plan'.padEnd(24),
  'first'.padStart(6),
  'lastV1'.padStart(7),
  'firstV2'.padStart(7),
  'bound'.padStart(6),
  'steadyMax'.padStart(9),
  'steadyMed'.padStart(9),
  'count2k'.padStart(7),
  'count10k'.padStart(8),
  'kind',
);
for (const [label, s] of Object.entries(focus)) {
  console.log(
    label.padEnd(24),
    String(s.first ?? '-').padStart(6),
    String(s.lastV1 ?? '-').padStart(7),
    String(s.firstV2 ?? '-').padStart(7),
    String(s.boundaryGap ?? '-').padStart(6),
    String(s.steadyMaxGap ?? '-').padStart(9),
    String(s.steadyMedianGap ?? '-').padStart(9),
    String(s.countThrough2000).padStart(7),
    String(s.countThrough10000).padStart(8),
    s.standalone ? 'standalone' : 'combo',
  );
}
console.log(`\nviolations: ${violations.length}`);
for (const v of violations.slice(0, 20)) console.log(`  L${v.level} ${v.kind}: ${v.detail}`);
console.log(`wrote ${OUT}`);
